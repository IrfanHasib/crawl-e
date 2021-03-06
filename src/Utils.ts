import LanguageMappings, { LanguageVersion, ORIGINAL_VERSION, SUBTITLES_UNDETERMINED } from './LanguageMappings'
import Constants from './Constants'
import cliParams from './cli-params'
import * as cheerio from 'cheerio'
import * as UrlParser from 'url'
import * as async from 'async'
import * as path from 'path'
import * as _ from 'underscore'
import { Logger } from './Logger'
import { Callback } from './Types'
import Context, { cloneContext } from './Context'

/** @private */
function cleanLanguageString (str: string): string {
  return str.replace(/\(|\)|\./g, '')
}

namespace Utils {

  /**
   * Return a copy of the object, filtered to only keep keys which have non-null values.
   */
  export function compactObj (obj) {
    return _.pick(obj, val => val !== null && val !== undefined)
  }

  /**
   * Checks if the given selector is addressing an html `a` tag.
   */
  export function isLinkTagSelector(selector) {
    if (!selector) {
      return false
    }
    // consider only last element of selector
    selector = selector.split(' ').reverse()[0]
    // return true if selector is for href attribute
    if (selector.match(/\[href(.*)\]/)) {
      return true
    }

    // remove attribute selectors
    selector = selector.replace(/\[(.*)\]+/g, '')
    // remove class selectors
    selector = selector.split('.')[0]
    // remove pseudo class selectors
    selector = selector.split(':')[0]
    return selector === 'a'
  }

  /**
   * Maps a parsed language string into a ISO 639 code or `original version`.
   * @param languauge 
   * @returns the ISO 639 code for the given language or `null` if not found
   */
  export function mapLanguage(language: string): string | null { 
    if (!language) { return null }
    language = cleanLanguageString(language)
    let mapping = LanguageMappings[language.toLocaleLowerCase()]
    if (mapping) { return mapping.language }
    return null
  }

  /**
   * Maps a parsed string of sub titles into an ISO 639 code array or `undetermined`.
   * @param subtitles 
   */
  export function mapSubtitles(subtitles: string): string[] | string | null {
    if (!subtitles) { return null }
    subtitles = cleanLanguageString(subtitles)
    let mapping = LanguageMappings[subtitles.toLocaleLowerCase()]
    if (mapping) { return mapping.subtitles }
    return null
  }

  function matchLanguageVersions(text: string): [LanguageVersion] {
    let versions = []
    if (text) { 
      text = cleanLanguageString(text)
      _.mapObject(LanguageMappings, (langVersion, langToken) => {
        let regex = new RegExp(`\\s${langToken}\\s`, 'i')
        if (regex.test(text + ' ')) {
          versions.push(langVersion)
        }
      })
    }
    return versions as [LanguageVersion] 
  }

  /**
   * Checks a text for matching language or original version info.
   * @param test 
   * @returns the ISO 639 code for the given language, `'original version'` or `null` if not found
   */
  export function matchLanguage(text: string): string | null {
    let languages: string[] = _.chain(matchLanguageVersions(text))
      .map(v => v.language)
      .uniq()
      .compact()
      .value() as any

    switch (languages.length) {
      case 1:
        return languages[0]
      case 2: 
        return languages.indexOf(ORIGINAL_VERSION) === -1 
          ? null 
          : languages.filter(l => l !== ORIGINAL_VERSION)[0]
      default:
        return null;
    }
  }

  /**
   * Checks a text for matching subtiles info.
   * @param test 
   * @returns the ISO 639 code for matched subtitles, `'undetermined'` or `null` if not found
   */
  export function matchSubtitles(text: string): string | null {
    let subs = _.chain(matchLanguageVersions(text))
      .map(v => v.subtitles)
      .flatten()
      .filter(s => s === SUBTITLES_UNDETERMINED)
      .uniq()
      .value()

    switch (subs.length) {
      case 1:
        return subs[0]
      default:
        return null;
    }
  }

  function parseLatlonFromUrl(url: string, param: string, delimiter: string | RegExp = ',') {
    url = url.replace(/&amp;/ig, '&')
    var latlonParam = UrlParser.parse(url, true).query[param] as string
    if (!latlonParam) { return null }    
    var latlon = latlonParam.split(delimiter).map((str) => parseFloat(str))
    return { lat: latlon[0], lon: latlon[1] }
  }

  export function parseLatlonFromGoogleMapsUrl(url: string) {
    if (url == null) return null
    if (!!url.match(/maps.google.\w{2,3}/i) || !!url.match(/google.com\/maps/i)) {
      if (url.match(/q=loc:/)) {
        var match = url.match(/q=loc:([-]?[0-9.]+)[,+]+([-]?[-0-9.]+)/)
        if (match.length >= 3) {
          return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) }
        }
      }
      if (url.match(/ll=/)) {
        return parseLatlonFromUrl(url, 'll', / |,/)
      }
      if (url.match(/q=/)) {
        return parseLatlonFromUrl(url, 'q', / |,/)
      }
      if (url.match(/daddr=/)) {
        return parseLatlonFromUrl(url, 'daddr')
      }
      if (url.match(/data=/)) {
        let match = url.match(/3d([-0-9.]+)!4d([-0-9.]+)/)
        if (match != null) {
          return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) }
        }
      }
      if (url.match(/@/)) {
        var latlon = url.split('@')[1].split(',')
        if (latlon.length > 1) {
          return { lat: parseFloat(latlon[0]), lon: parseFloat(latlon[1]) }
        }
      }
      if (url.match(/embed/)) {
        var lat, lon        
        url.split('!').forEach((s: string) => {
          if (s.match(/^2d/)) {
            lon = parseFloat(s.split('2d')[1])
          } else if (s.match(/^3d/)) {
            lat = parseFloat(s.split('3d')[1])
          }
        })
        return { lat: lat, lon: lon }
      }
    }
    return null
  }

  export function parseLatlonFromBingMapsUrl(url: string) {
    if (url == null) return null
    if (!url.match(/bing.com/i)) { return null }
    return parseLatlonFromUrl(url, 'cp', '~')
  }

  export function parseLatlonFromAppleMapsUrl(url: string) {
    if (url == null) return null
    if (!url.match(/apple.com/i)) { return null }
    return parseLatlonFromUrl(url, 'q')
  }

  /**
   * Parses latitude and longitude from a google, bing or apple maps url.
   * @param url an url string for either of the above listed maps services
   * @returns an location object or `null` if failed to parse the given url 
   */
  export function parseMapsUrl(url: string): {lat: number, lon: number} | null {
    return null
      || parseLatlonFromGoogleMapsUrl(url)
      || parseLatlonFromBingMapsUrl(url)
      || parseLatlonFromAppleMapsUrl(url)
  }

  export function resultsFlattenCallbackWrapper<T extends Array<any>>(callback: Callback<T>): Callback<T[]> {
    return (err, result: T) => {
      let flatResult: T[]
      if (result instanceof Array) {
        flatResult = _.chain(result).flatten().compact().value() as T
      }
      callback(err, result)
    }    
  }

  export function retry(taskDescription: string, logger: Logger, task, callback) {
    let retryCounter = 0
    let retryOptions = {
      times: Constants.RETRY_OPTIONS.times,
      interval: Constants.RETRY_OPTIONS.interval,
      errorFilter: (err) => {
        retryCounter += 1
        logger.warn(`retrying (attempt: ${retryCounter + 1}) ${taskDescription} due to error:`, err.message)
        return true
      }
    }
    async.retry(retryOptions, task, callback)
  }

  /**
   * When the `limit` CLI parameter is set, the given list will be sliced from beginning to the accordling maximum length. 
   * Otherwise the list is returned in full length.
   * The purpose of limiting the list via CLI paramter is to cut down on execution time during development. 
   * @param list An arbitrary list to limit in length. 
   */
  export function limitList<T>(list: T[]): T[] {
    return list.slice(0, cliParams.limit)
  }

  export type MappingIterator<ListType, ResultType> = (item: ListType, context: Context, callback: Callback<ResultType>) => void

  /**
   * The same as `mapLimit` but runs only a single async operation at a time.
   * @param list A collection to iterate over.
   * @param context The current / parent context to start from.
   * @param iterator An async function to apply to each item in list. The `iterator` should complete with the transformed item. Invoked with (`item`, `context`, `callback`), where `context` is a clone of the parent context, that is unique and only valid for each item in the list. 
   * @param callback A callback which is called when all `iterator` functions have finished, or an error occurs. Results is an array of the transformed items from the lsit. Invoked with (err, results).
   */
  export function mapSeries<ItemType, Result>(list: ItemType[], context: Context, iterator: MappingIterator<ItemType, Result>, callback: Callback<Result[]>) {
    mapLimit(list, 1, context, iterator, callback)
  }

  /**
   * Produces a new collection of values by mapping each value in `list` through the `iterator` function, by running a maximum of `limit` async operations at a time. 
   * @param list A collection to iterate over.
   * @param limit The maximum number of async operations at a time
   * @param context The current / parent context to start from. 
   * @param iterator An async function to apply to each item in list. The `iterator` should complete with the transformed item. Invoked with (`item`, `context`, `callback`), where `context` is a clone of the parent context, that is unique and only valid for each item in the list. 
   * @param callback A callback which is called when all `iterator` functions have finished, or an error occurs. Results is an array of the transformed items from the lsit. Invoked with (err, results).
   */
  export function mapLimit<ItemType, Result>(list: ItemType[], limit: number, context: Context, iterator: MappingIterator<ItemType, Result>, callback: Callback<Result[]>) {
    list = Utils.limitList(list)        
    async.mapLimit(list, limit, (item: ItemType, callback) => {
      iterator(
        item,
        // cloning the context is important as the interation works in parallel which cause context overwrites otherwise
        cloneContext(context),
        callback
      )
    }, callback)
  }

  /**
   * Transforms a HTML structure wrapping sections of a flat lists node's into boxes. 
   * @param html 
   * @param containerSelector jQuery selector for the container node(s) of the list
   * @param nodeSelector jQuery selector for the nodes to start a box at
   * @param boxTag full html tag snipped including attributes to wrap boxes in - e.g. `<div class="movie"></div>`
   * @returns changed HTML structure
   */
  export function addBoxes(html: string, containerSelector: string, nodeSelector: string, boxTag: string): string {
    let $ = cheerio.load(html)
    let container = $(containerSelector)
    let nodes = container.find(nodeSelector) 
    nodes.each((index, elem) => {
      let node = $(elem)
      let boxNodes = node.nextUntil(nodeSelector)
      let wrapper = $(boxTag)
      wrapper.append(node.clone())
      wrapper.append(boxNodes) // appeding moved the boxes from the container
      node.replaceWith(wrapper)
    })
    return $.html()
  }

  /**
   * Returns the filename inlcuding file extension of the javascript or typescript file that is executed to run the crawler.
   */
  export function getMainFilename(): string {
    return path.basename(require.main.filename)
  }  

  /**
   * Returns the filename excluding file extension of the javascript or typescript file that is executed to run the crawler.
   */
  export function getMainFilenameBase(): string {
    return getMainFilename().replace(/\.[jt]s$/, '')
  }  
}

export default Utils

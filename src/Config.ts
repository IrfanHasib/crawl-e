import * as _ from 'underscore'
import * as path from 'path'
import * as ObjectPath from 'object-path'
import configSchema from './config-schema'
import Utils from './Utils'
import { Logger, SilentLogger } from './Logger'
import { SubConfigs } from './Config.types'
import { DefaultRequestMakerConfig } from './RequestMaker'

/** @private */
function parseListConfig(listConfig: any) {
  let result = _.clone(listConfig)
  result.urls = listConfig.urls || [listConfig.url]
  result.urlDateCount = listConfig.urlDateCount || 14
  return result
}

// https://stackoverflow.com/a/21557600/1879171
/** @private */
function permutate(src, minLen, maxLen) {
  minLen = minLen - 1 || 0;
  maxLen = maxLen || src.length + 1;
  var Asource = src.slice(); // copy the original so we don't apply results to the original.

  var Aout = [];

  var minMax = function (arr) {
    var len = arr.length;
    if (len > minLen && len <= maxLen) {
      Aout.push(arr);
    }
  }

  var picker = function (arr, holder, collect) {
    if (holder.length) {
      collect.push(holder);
    }
    var len = arr.length;
    for (var i = 0; i < len; i++) {
      var arrcopy = arr.slice();
      var elem = arrcopy.splice(i, 1);
      var result = holder.concat(elem);
      minMax(result);
      if (len) {
        picker(arrcopy, result, collect);
      } else {
        collect.push(result);
      }
    }
  }

  picker(Asource, [], []);

  return Aout;
}

/**
 * Default Config implementation.
 * @category Main
 */
class Config implements DefaultRequestMakerConfig {
  crawler?: any = {}
  /**
   * Number of concurrent requests.
   * @TJS-type integer
   */
  concurrency?: number
  proxyUri?: string
  useRandomUserAgent: boolean
  /** timezone to use for crawling */
  timezone?: string
  acceptedWarnings: { [key: number]: string } 
  isTemporarilyClosed?: SubConfigs.Generic.IsTemporarilyClosedCrawlingConfig
  cinemas?: [object]
  cinemasConfig?: SubConfigs.Cinemas.CrawlingConfig
  showtimes: SubConfigs.Showtimes.CrawlingConfig[]
  movies?: SubConfigs.Movies.CrawlingConfig
  dates?: SubConfigs.Dates.CrawlingConfig
  hooks: SubConfigs.Hooks
  
  constructor (config: any, logger: Logger = new SilentLogger()) {    
    let pickGeneralValue = (key) => {
      this[key] = _.has(config, key)
        ? config[key] 
        : configSchema.properties[key].default
    }
    
    pickGeneralValue('proxyUri')
    pickGeneralValue('concurrency')
    pickGeneralValue('useRandomUserAgent')
    pickGeneralValue('timezone')
    
    this.acceptedWarnings = config.acceptedWarnings || {}
    this.isTemporarilyClosed = config.isTemporarilyClosed

    if (config.cinemas && config.cinemas.constructor === Array) {
      this.cinemas = config.cinemas
    } else if (config.cinemas) {
      this.cinemasConfig = {
        list: config.cinemas.list
          ? parseListConfig(config.cinemas.list)
          : undefined,
        details: _.clone(config.cinemas.details)
      }      
    }
    
    if (config.showtimes) {
      config.showtimes = config.showtimes.constructor === Array
        ? config.showtimes
        : [config.showtimes]
      
      this.showtimes = config.showtimes.map(showtimesConfig => parseListConfig(showtimesConfig))            
      
      this.showtimes.forEach((showtimesConfig, index) => {
        if (showtimesConfig.showtimes) {
          showtimesConfig.showtimes = this.parseShowtimesParsingConfig(showtimesConfig.showtimes)
        }
        
        let parsingConfigKeyPaths = this.generateParsingConfigKeyPaths(`showtimes.${index}`)
                
        // resolve showtimes parsing configs       
        parsingConfigKeyPaths
        .map(keypath => [keypath, 'showtimes'].join('.'))
        .forEach(keypath => {
          if (ObjectPath.get(config, keypath)) {
            ObjectPath.set(this, keypath, this.parseShowtimesParsingConfig(ObjectPath.get(this, keypath)))
          }
        })

        // resolve showtimes table configs
        this.resolveTableConfig(config, parsingConfigKeyPaths.concat(`showtimes.${index}`), logger)

        // resolve default box selectors 
        parsingConfigKeyPaths
        .filter(keypath => keypath.match(/periods$/i))
        .forEach(keypath => {
          if (ObjectPath.get(config, keypath)) {
            let boxKeyPath = [keypath, 'box'].join('.')
            ObjectPath.set(this, boxKeyPath, ObjectPath.get(this, boxKeyPath) || 'body')
          }
        })
      })

    }
    
    let crawlingConfigKeys = ['movies', 'dates']
    crawlingConfigKeys.forEach(crawlingConfigKey => {
      if (_.has(config, crawlingConfigKey)) {
        this[crawlingConfigKey] = {
          list: parseListConfig(config[crawlingConfigKey].list),
          showtimes: undefined
        }

        if (config[crawlingConfigKey].showtimes) {
          this[crawlingConfigKey].showtimes = parseListConfig(config[crawlingConfigKey].showtimes)
          // resolve showtimes table configs
          let parsingConfigKeyPaths = this.generateParsingConfigKeyPaths(`${crawlingConfigKey}.showtimes`)
          this.resolveTableConfig(config, parsingConfigKeyPaths.concat(`${crawlingConfigKey}.showtimes`), logger)
        }

        let parsingConfigKeyPaths = this.generateParsingConfigKeyPaths(`${crawlingConfigKey}.showtimes`)
        // resolve showtimes parsing configs       
        parsingConfigKeyPaths
          .map(keypath => [keypath, 'showtimes'].join('.'))
          .forEach(keypath => {
            if (ObjectPath.get(config, keypath)) {
              ObjectPath.set(this, keypath, this.parseShowtimesParsingConfig(ObjectPath.get(this, keypath)))
            }
          })
      }
    })
    
    this.hooks = config.hooks || {}

    this.setCrawlerConfig(config)
  }


  /**
   * Generates a list of all possible keypath combiniations 
   * that could be configured for box & showtimes parsing 
   * relative to the given parentKeyPath.
   * 
   * see corresponding mocha test checking all sorts of combinations
   */
  private generateParsingConfigKeyPaths(parentKeyPath) {
    let parsingConfigs = ['movies', 'dates', 'periods', 'auditoria', 'versions', 'forEach']
    return permutate(parsingConfigs, 0, 0).map(combi => [parentKeyPath].concat(combi).join('.'))    
  }

  private resolveTableConfig(config, parsingConfigKeyPaths, logger) {
    parsingConfigKeyPaths
      .forEach(keypath => {
        if (ObjectPath.get(config, keypath + '.table.cells.showtimes')) {
          ObjectPath.set(this, keypath + '.table.cells.showtimes', this.parseShowtimesParsingConfig(ObjectPath.get(this, keypath + '.table.cells.showtimes')))
        }       
      })
  }
  
  private setCrawlerConfig(config: any) {
    this.crawler.id = (config.crawler && config.crawler.id) || Utils.getMainFilenameBase()
        
    if (config.crawler && typeof config.crawler.is_booking_link_capable) {
      this.crawler.is_booking_link_capable = config.crawler.is_booking_link_capable
    } 
    
    this.crawler.is_booking_link_capable = this.crawler.is_booking_link_capable || false

    if (config.crawler && typeof config.crawler.jira_issues) {
      this.crawler.jira_issues = config.crawler.jira_issues
    } 
  }
    
  private parseShowtimesParsingConfig(showtimesConfig: any) {
    if (!showtimesConfig) { return showtimesConfig }
    let result = _.clone(showtimesConfig)
    
    if (Utils.isLinkTagSelector(showtimesConfig.box)) {
      this.crawler.is_booking_link_capable = true
    }

    if (showtimesConfig.bookingLink) {
      this.crawler.is_booking_link_capable = true
    }
    
    return result
  }

}

export default Config

export { SubConfigs }

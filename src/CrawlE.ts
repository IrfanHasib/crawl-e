import * as path from 'path'
import * as fs from 'fs'
import * as async from 'async'
import * as _ from 'underscore'
import * as moment from 'moment-timezone'
import * as colors from 'colors'
import * as superagent from 'superagent'

import Constants from './Constants'
import cliParams from './cli-params'
import ConfigValidator from './ConfigValidator'
import Config, { SubConfigs } from './Config'
import configSchema from './config-schema'
import { RequestMaker, RequestObject, CachedRequestMaker } from './RequestMaker'
import RequestMakerWithNockCaching from './RequestMakerWithNockCaching'
import { DefaultResponseParser, DatePage, ResponseHandler } from './ResponseParsers'
import { Logger, DefaultLogger, LoggerProxy } from './Logger'
import TemplaterEvaluator from './TemplaterEvaluator'
import MethodCallLogger from './MethodCallLogger'
import OutputValidator from './OutputValidator'
import Warnings from './Warnings'
import Context, { DefaultContext, cloneContext, Resource } from './Context'
import { Cinema, Movie, Showtime, CinemaShowtimesCrawlerOutputData } from './models'
import Utils from './Utils'
import { Callback } from './Types'
import { ProgressInfo, ProgressTracker } from './ProgressTracker'
import { JsonFileWriter } from './JsonFileWriter'
import ValueGrabber from './ValueGrabber'

/** @private */
const CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY = 'CRAWL_SHOWTIMES_PLACEHOLDER'

/** @private */
const packageInfo = require('./../package.json')

type CinemaListCallback = Callback<Cinema[]>
type MovieListCallback = Callback<Movie[]> //  (err: Error, movies: Movie[]) => void

/**
 * The main class of the Framework. Acts as single entry point unless building custom coded crawler scripts. Then you most likely won't use the CrawlE class at all. 
 * 
 * @category Main
 */
class CrawlE {
  config: Config
  results = {
    cinemas: null,
    movies: null,
    datePages: null,
    showtimes: null
  }
  private _requestMaker: RequestMaker
  private _responseParser: DefaultResponseParser
  private _logger: LoggerProxy
  private progressTracker = new ProgressTracker()
  private fileWriter: JsonFileWriter

  constructor (conf: any, logger: Logger = null) {
    this._logger = new LoggerProxy(logger || new DefaultLogger())    
    this._logger.info(`node.js version ${process.version}`)
    this._logger.info(`${packageInfo.name} version v${packageInfo.version}`)
    let configValidator = new ConfigValidator(configSchema, this._logger)
    configValidator.validate(conf)   
    this.config = new Config(conf, this._logger)
    this.requestMaker = cliParams.cacheDir 
      ? new RequestMakerWithNockCaching(this.config, cliParams.cacheDir, this.config.crawler.id)
      : new CachedRequestMaker(this.config)
    this.responseParser = new DefaultResponseParser()
    this.progressTracker.progressHook = this.handleProgressUpdate.bind(this)
    this.setTimezone(this.config.timezone)
    this.fileWriter = new JsonFileWriter(Constants.OUTPUT_DIR, this.logger, (data: any, context: Context) => {
      let fileNameBuilder = this.config.hooks.buildFilename || this.buildFilename
      return fileNameBuilder(data.cinema, this.config.crawler.id, context)
    })
  }

  get logger (): Logger {
    return this._logger
  }

  set logger (newLogger: Logger) {
    this._logger.logger = newLogger
  }

  get requestMaker (): RequestMaker {
    return this._requestMaker
  }

  set requestMaker (newRequestMaker: RequestMaker) {
    this._requestMaker = newRequestMaker
    this._requestMaker.logger = this.logger    
  }

  get responseParser(): DefaultResponseParser {
    return this._responseParser
  }

  set responseParser(newResponseParser: DefaultResponseParser) {
    this._responseParser = newResponseParser
    this._responseParser.logger = this.logger
  }

  private setTimezone(zone?: string) {
    if (zone) {
      moment.tz.setDefault(zone)
      this._logger.info(`timezone: ${this.config.timezone} (config)`)
    } else {
      this._logger.info(`timezone: ${moment.tz.guess()} (system)`)
    }
  }

  private handleProgressUpdate(progress: ProgressInfo, change: string) {
    this.logger.debug('progress', `${progress.completed}/${progress.total} ??? ${Math.round(progress.completed / progress.total * 100)}%`, `update:`, change)
    if (this.config.hooks.progress) {
      this.config.hooks.progress(progress.completed, progress.total)
    }
  }

  /**
   * The main method, which starts and performs all the crawling according to the configuration. 
   * @param done completion callback, default to some console.logs
   */
  crawl (done?: (err: Error | null) => void) {
    MethodCallLogger.logMethodCall()
    let context: Context = new DefaultContext()
    context.pushCallstack()
    let steps = []

    if (this.requestMaker.willStartCrawling) {
      let key = 'requestMaker.willStartCrawling'
      this.progressTracker.addTask(key, 1)
      this.requestMaker.willStartCrawling()
      this.progressTracker.finishTash(key)
    }

    if (this.config.hooks.beforeCrawling) {
      this.progressTracker.addTask('beforeCrawling', 1)
      steps.push(cb => this.config.hooks.beforeCrawling(context, cb))
      steps.push(cb => { this.progressTracker.finishTash('beforeCrawling'); cb() })
    }
    
    if (this.config.isTemporarilyClosed) {
      steps.push(cb => this.crawlIsTemporarilyClosed(context, cb))
    }

    // cinemas
    steps.push(cb => this.getCinemas(context, cb))
    steps.push((cinemas, cb) => {
      this.results.cinemas = _.union(this.results.cinemas, cinemas)
      this.logger.info(`found ${cinemas.length} cinemas`)
      this.logger.debug('cinemas:result', cinemas)
      cb(null, cinemas)
    })

    if (this.config.showtimes || this.config.movies || this.config.dates) {
      this.progressTracker.addTask('workOnCinema', 0, 5) // increased weighting to smooth progress percentage
      steps.push((cinemas: Cinema[], cb) => { 
        this.progressTracker.removeTask(CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY)
        context.currentTask = 'workOnCinema'
        this.mapSeries(cinemas, context, (cinema, context, cb) => {
          context.cinema = cinema
          this.workOnCinema(context, cb)
        }, cb)
      })
    }

    if (this.requestMaker.didFinishCrawling) {
      let key = 'requestMaker.didFinishCrawling'
      this.progressTracker.addTask(key, 1)
      steps.push((res, cb) => {
        this.requestMaker.didFinishCrawling()
        this.progressTracker.finishTash(key)
        cb(null, res)
      })
    }

    if (!done) {
      done = (err) => {
        if (err) {
          console.error('???? Failed', err)
        } else {
          console.log(colors.green.bold('??? DONE'), '????')
        }
      }
    }

    async.waterfall(steps, done)
  }

  crawlIsTemporarilyClosed(context: Context, callback: Callback<void>) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    if (!this.config.isTemporarilyClosed) {
      return callback(null)
    }
    this.requestMaker.get(this.config.isTemporarilyClosed.url, context, (err, response) => {
      if (err) return callback(err)
      const responseParser = new DefaultResponseParser()
      responseParser.logger = this.logger
      const { container, parsingContext } = responseParser.prepareHtmlParsing(response.text, context)
      const valueGrabber = new ValueGrabber<boolean>(this.config.isTemporarilyClosed.grabber, this.logger, 'is-temporarily-closed', value => !!value)
      context.isTemporarilyClosed = !!valueGrabber.grabFirst(container, context)
      callback(null)
    })
  }

  /**
   * Gets the list of cinemas - either from static configuration or via crawling it. 
   * @param context 
   * @param callback 
   */
  getCinemas(context: Context, callback: (error, cinemas) => void) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    if (this.config.cinemas) {
      callback(null, this.config.cinemas)
    } else {
      this.crawlCinemas(context, callback)
    }
  }

  /**
   * Crawls a list of cinemas according to the configuration.
   * @param context 
   * @param callback 
   */
  crawlCinemas(context: Context, callback: (error, cinemas) => void) {
    if (typeof context === 'function') {
      callback = context
      context = new DefaultContext()
    }
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    this.progressTracker.addTask(CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY, 10)
    context.currentTask = 'crawlCinemaList'

    this.workOnRequestLists(
      this.config.cinemasConfig.list, 
      context, 
      this.crawlCinemaList.bind(this),
      (err, cinemasLists) => {
        if (err) {
          callback(err, null)
        } else {
          callback(null, _.flatten(cinemasLists))
        }
      }
    )    
  }

  /**
   * Crawls a list of cinemas from a single page / request. 
   * @param requestObject the configuration to make either a GET or POST request
   * @param context 
   * @param callback 
   */
  crawlCinemaList(requestObject: RequestObject, context: Context, callback: CinemaListCallback) {
    MethodCallLogger.logMethodCall()

    let responseHandler = this.responseParserFor(Resource.CinemaList, this.config.cinemasConfig.list)

    this.crawlList(requestObject, Resource.CinemaList, responseHandler, context, (err, cinemas: Cinema[]) => {
      if (err) return callback(err)
      if (this.config.cinemasConfig.details) {
        this.logger.info(`found ${cinemas.length} cinemas, start crawling details ???`)
        this.progressTracker.addTask(CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY, cinemas.length * 10)
        context.currentTask = 'crawlCinemaDetails'
        this.map(cinemas, context, (cinema, context, cb) => {
          this.crawlCinemaDetails(cinema, context, cb)
        }, callback)
      } else {
        callback(null, cinemas)
      }
    })
  }
  
  /**
   * Get addtional cinema properties from a details page. Updates the cinema in context. 
   * @param cinema 
   * @param context 
   * @param callback 
   */
  crawlCinemaDetails (cinema: Cinema, context: Context, callback: Callback<Partial<Cinema>>) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    context.resource = Resource.CinemaDetails
    context.cinema = cinema

    let requestObject: RequestObject = {
      url: this.config.cinemasConfig.details.url,
      postData: this.config.cinemasConfig.details.postData
    }
    requestObject = TemplaterEvaluator.evaluateRequestObject(requestObject, context)
    
    async.waterfall([
      (cb) => this.requestMaker.send(requestObject, context, cb),
      (response, context: Context, cb) => {
        let responseHandler = this.responseParserFor(Resource.CinemaDetails, this.config.cinemasConfig.details)
        responseHandler(response, context, cb)
      },
      (cinemaDetails, cb) => { // merge details into existing cinema
        _.extend(context.cinema, cinemaDetails)
        callback(null, context.cinema)
      }
    ], callback)
  }

  /**
   * Crawls the showtimes for a single cinema according to the configuration. 
   * @param cinema 
   * @param callback 
   */
  crawlShowtimesForCinema(cinema: Cinema, callback: Function) {
    let context: Context = new DefaultContext()
    context.cinema = cinema
    this.workOnCinema(context, callback)
  }

  workOnCinema(context: Context, callback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    this.progressTracker.increaseTotalStepsBy('processResult', 1)

    let showtimesConfig = this.config.movies
      ? _.compact([this.config.movies.showtimes])
      : this.config.dates
        ? _.compact([this.config.dates.showtimes])
        : this.config.showtimes

    async.waterfall([
      (cb) => this.getMovies(context, cb),
      (movies: Movie[], cb) => {
        context.currentTask = 'getShowtimesForMovie'
        this.map(movies, context, (movie, context, cb) => {
          if (movie) {
            context.movie = movie
            context.version = movie.version
          }
          this.getDates(context, (err, datePages) => {
            if(err) { return cb(err) }
            this.map(datePages, context, (datePage, context, cb) => {
              if (datePage) {
                context.date = datePage.date
                context.dateHref = datePage.href
              }
              if (showtimesConfig) {
                this.getShowtimes(context, showtimesConfig, cb)
              }
              else {
                cb(null, [])
              }
            }, cb)
          })
        }, cb)
      },
      (showtimes, cb) => {
        cb(null, _.chain(showtimes).flatten().compact().value())
      },
      (showtimes, cb) => {
        cb(null, {
          crawler: this.config.crawler,
          cinema: context.cinema,
          showtimes: showtimes
        })
      },
      (result, cb) => this.processResult(result, context, cb),
      (cb) => {
        this.progressTracker.increaseCompletedSteps('processResult')
        cb()
      } 
    ], callback)
  }

  processResult(result, context: Context, callback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    async.waterfall([
      (cb) => {
        this.logger.debug(`result`, JSON.stringify(result, null, 2))
        cb(null, result)
      },
      (result, cb) => {
        if (this.config.hooks.beforeSave) {
          result = this.config.hooks.beforeSave(result, context)
        }
        cb(null, result)
      },
      (result, cb) => {
        // print warnings 
        let groupedWarnings = _.chain([] as Warnings.Warning[])
          .union(context.warnings)
           .union(OutputValidator.validate(result, context))
           .unique(w => w.code)
           .map(w => {
              w.acceptedReason = this.config.acceptedWarnings[w.code]
              return w
           })
          .groupBy(w => w.acceptedReason === undefined ? 'print' : 'accepted')
          .value()

        function forWarnings(key: string, fn: (warnings: Warnings.Warning[]) => void) {
          if (groupedWarnings[key] && groupedWarnings[key].length > 0) {  
            fn(groupedWarnings[key])
          }
        }

        forWarnings('print', warnings => {
          this.logger.info('\n')
          this.logger.info(colors.yellow.bold('????  W A R N I N G S:\n'))
          warnings.forEach(w => Warnings.print(w, this.logger.warn.bind(this.logger)))
          this.logger.info('\n')
        })

        forWarnings('accepted', warnings => {
          let debugLog = (msg: string) => this.logger.debug('warnings', msg)
          warnings.forEach(w => Warnings.print(w, debugLog))
          debugLog('\n')
        })

        if (context.isTemporarilyClosed && result.cinema) {
          result.cinema.is_temporarily_closed = true
        }

        cb(null, result)
      },
      (result, cb) => this.fileWriter.saveFile(result, context, cb)
    ], callback)
  }

  getMovies(context: Context, callback: MovieListCallback) {
    MethodCallLogger.logMethodCall()
    if (!this.config.movies) {
      return callback(null, [null]) // if no movie pages, create a dummy iteration
    }

    callback = context.trackCallstackAsync(callback) 
    context.currentTask = 'getMovies'
    this.workOnRequestLists(
      this.config.movies.list,
      context, 
      this.crawlMovieList.bind(this),
      callback
    )
  }

  crawlList<T>(requestObject: RequestObject, resource: Resource, responseHandler: ResponseHandler<T>, context: Context, callback: Callback<T>) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    context.resource = resource

    let key
    switch (resource) {
      case Resource.CinemaList: key = 'cinemas'; break;
      case Resource.MovieList: key = 'movies'; break;
      case Resource.DateList: key = 'datePages'; break;
      case Resource.Showtimes: key = 'showtimes'; break;
      default: throw new Error('unsupported resource')
    }

    context.indexes.page = context.indexes.page || 0
    let _context = cloneContext(context)    
    requestObject = TemplaterEvaluator.evaluateRequestObject(requestObject, _context)
    async.waterfall([
      (cb) => this.requestMaker.send(requestObject, _context, cb),
      responseHandler,
      (result: any[], nextPageUrl, cb) => {
        if (typeof nextPageUrl === 'function') {
          cb = nextPageUrl
          nextPageUrl = null
        }
        if (nextPageUrl) {
          context.indexes.page += 1
          this.crawlList({ url: nextPageUrl }, resource, responseHandler, context, (err, resultLists: any) => {
            if (err) return cb(err)
            cb(null, _.union(result, _.flatten(resultLists)))
          })
        } else {
          cb(null, result)
        }
      },
      (result, cb) => {
        result = _.flatten(result)
        this.results[key] = _.union(this.results[key], result)
        this.logger.debug(`${key}:result`, result)
        cb(null, result)
      }
    ], callback)
  } 

  crawlMovieList(requestObject: RequestObject, context: Context, callback: MovieListCallback) {
    MethodCallLogger.logMethodCall()
    let responseHandler = this.responseParserFor(Resource.MovieList, this.config.movies.list)
    this.crawlList(requestObject, Resource.MovieList, responseHandler, context, callback)
  }

  getDates(context: Context, callback: Callback<DatePage[]>) {
    MethodCallLogger.logMethodCall()
    if (!this.config.dates) {
      return callback(null, [null]) // if no date pages, create a dummy iteration
    }

    callback = context.trackCallstackAsync(callback)
    context.currentTask = 'getDates'
    this.workOnRequestLists(
      this.config.dates.list,
      context,
      this.crawlDateList.bind(this),
      callback
    )
  }

  crawlDateList(requestObject: RequestObject, context: Context, callback: Callback<DatePage[]>) {
    MethodCallLogger.logMethodCall()
    let responseHandler = this.responseParserFor(Resource.DateList, this.config.dates.list)
    this.crawlList(requestObject, Resource.DateList, responseHandler, context, callback)
  } 

  getShowtimes(context: Context, configs: SubConfigs.Showtimes.CrawlingConfig[], callback: Callback<Showtime[]>) {
    context.currentTask = 'getShowtimes'
    this.mapSeries(
      configs, 
      context, 
      this.crawlShowtimes.bind(this), 
      Utils.resultsFlattenCallbackWrapper(callback)
    )
  }

  crawlShowtimes(config: SubConfigs.Showtimes.CrawlingConfig, context: Context, callback: Callback<Showtime[]>) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)    
    context.resource = Resource.Showtimes
    context.currentTask = 'crawlShowtimes'
    this.workOnRequestLists(
      config,
      context,
      (requestObject: RequestObject, context: any, callback: Function) => {
        this.crawlShowtimesList(requestObject, config, context, callback)
      },      
      callback
    )
  }

  workOnRequestLists(config: SubConfigs.Generic.ListCrawlingConfig, context, iterator: (requestObject: RequestObject, context: any, callback: Function) => void, callback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    // context.currentTask should already be set since this is a control flow helper 
    this.mapSeries(
      config.urls.map(url => ({ url: url, postData: config.postData })),
      context,
      (requestObj, context, cb) => {
        let dateRegex = /\:date\:/
        let pageRegex = /\:page\(([^)]*)\)\:/ // /\:page\((\d*),(\d*)\)\:/
        if (dateRegex.test(requestObj.url) || dateRegex.test(JSON.stringify(requestObj.postData))) {
          this.iterateDates(config, context, (context, cb) => {
            iterator(requestObj, context, cb)
          }, cb)
        } else if (pageRegex.test(requestObj.url) || pageRegex.test(JSON.stringify(requestObj.postData))) {
          this.iteratePages(requestObj, context, (context, cb) => {
            iterator(requestObj, context, cb)
          }, cb)
        } else {
          iterator(requestObj, context, cb)
        }
      },
      (err, lists) => {
        if (err) {
          callback(err, null)
        } else {
          callback(null, _.flatten(lists))
        }
      }
    )
  } 

  iterateDates(config: SubConfigs.Generic.ListCrawlingConfig, context: any, iterator: (context: any, callback: Function) => void, callback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    let dates: any = _.range(config.urlDateCount).map(i => moment().add(i, 'days'))
    // context.currentTask should already be set since this is a control flow helper 
    this.map(dates, context, (date: moment.Moment, context: Context, cb) => {
      context.date = date
      iterator(context, cb)
    }, callback)
  }

  iteratePages(requestObject: RequestObject, context: any, iterator: (context: any, callback: Function) => void, callback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)

    let pages = TemplaterEvaluator.parseStaticPages(requestObject.url) || TemplaterEvaluator.parseStaticPages(requestObject.postData)
    this.map(pages, context, (page: string, context: Context, cb) => {
      context.page = page
      context.indexes.page = pages.indexOf(page)
      iterator(context, cb)
    }, callback)
  }

  crawlShowtimesList(requestObject: RequestObject, config: SubConfigs.Showtimes.CrawlingConfig, context: any, callback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    let _context = cloneContext(context)
    _context.dateFormat = config.urlDateFormat // todo: refactor TemplaterEvaluator to read dateFormat from a config obj rather than mixing it into the context    
    requestObject = TemplaterEvaluator.evaluateRequestObject(requestObject, _context)    
    let responseHandler = this.responseParserFor(Resource.Showtimes, config)
    Utils.retry(`showtimes crawling from ${requestObject.url}`, this.logger, (callback, results) => {
      this.crawlList(requestObject, Resource.Showtimes, responseHandler, context, (err, showtimes: Showtime[]) => {
        if (err) return callback(err)
        if (!config.preserveLateNightShows && showtimes) {
          this.adjustLateNightShowtimes(showtimes)
        }
        callback(null, showtimes)
      })
    }, callback) 
  }

  // midnight / latenight showtimes are often shown at the previous day on websites
  // so we have to add 1 day to correct them unless disabled via config
  adjustLateNightShowtimes(showtimes: Showtime[]) {
    showtimes.forEach(showtime => {
      if (moment(showtime.start_at).hour() < 6) {
        showtime.start_at = moment(showtime.start_at).add(1, 'd').format('YYYY-MM-DDTHH:mm:ss')
      }
    })
  }

  responseParserFor(resource, defautlParserConfig) {
    let key
    switch (resource) {
      case Resource.CinemaList: key = 'handleCinemasResponse'; break;
      case Resource.CinemaDetails: key = 'handleCinemaDetailsResponse'; break;
      case Resource.MovieList: key = 'handleMoviesResponse'; break;
      case Resource.DateList: key = 'handleDatesResponse'; break;
      case Resource.Showtimes: key = 'handleShowtimesResponse'; break;
      default: throw new Error('unsupported resource')
    }

    if (this.config.hooks[key]) {
      return this.config.hooks[key]
    }

    let defaultParser = this.responseParser[key].bind(this.responseParser)
    return (response: superagent.Response, context: Context, callback: Callback<Showtime[]>) => {
      defaultParser(response, defautlParserConfig, context, callback)
    }
  }


  // Helpers
  
  private buildFilename(cinema: Cinema, crawlerId: string, context: Context): string {
    cinema = cinema || {} as Cinema
    return _.compact([crawlerId, cinema.slug || cinema.id]).join('_') + '.json'
  }  

  private map<ItemType, Result>(list: ItemType[], context: Context, iterator: Utils.MappingIterator<ItemType,Result>, callback: Callback<Result[]>) {
    this.mapLimit(list, this.config.concurrency, context, iterator, callback)
  }

  private mapSeries<ItemType, Result>(list: ItemType[], context: Context, iterator: Utils.MappingIterator<ItemType, Result>, callback: Callback<Result[]>) {
    this.mapLimit(list, 1, context, iterator, callback)
  }
      
  private mapLimit<ItemType, Result>(list: ItemType[], limit, context: Context, iterator: Utils.MappingIterator<ItemType, Result>, callback: Callback<Result[]>) {
    list = Utils.limitList(list)
    let progressKey = context.currentTask
    this.progressTracker.increaseTotalStepsBy(context.currentTask, list.length)
    Utils.mapLimit(list, limit, context, (item, context, cb) => {
      iterator(item, context, (err, result) => {
          this.progressTracker.increaseCompletedSteps(progressKey)
          cb(err, result)
        }
      )
    }, callback)    
  }

}

export default CrawlE

import { Logger, SilentLogger } from './Logger'
import Constants from './Constants'
import Context from './Context'
import MethodCallLogger from './MethodCallLogger'
import { SuperAgentRequest, SuperAgent } from 'superagent'
import * as superagent from 'superagent'
import * as randomUserAgent from 'random-useragent'
import * as _ from 'underscore'
import * as colors from 'colors'
import Utils from './Utils'

require('superagent-charset')(superagent)
require('superagent-proxy')(superagent)

type RequestCallback = (err, response: superagent.Response, context: Context) => void

/**
 * The RequestMaker interface allows to implement a custom RequestMaker. 
 */
interface RequestMaker {
  logger: Logger
  get: (url: string, context: Context, callback: RequestCallback) => void
  post: (url: string, data: any, context: Context, callback: RequestCallback) => void
  send: (request: RequestObject, context: Context, callback: RequestCallback) => void
  willStartCrawling?: () => void
  didFinishCrawling?: () => void
}

interface RequestMakerHooks {
  /** Hook to apply custom configuration of superagent request before executing them. */
  configureRequest?: (request: any, context: Context) => SuperAgentRequest

  /** Hook to change the response and error of a request or enhance the context. */
  afterRequest?: (request: any, context: Context, err: any, response: superagent.Response, callback: (RequestCallback)) => void
}

interface RequestObject {
  url: string
  postData?: any
}

interface DefaultRequestMakerConfig {
  hooks?: RequestMakerHooks
  /** full qualified URI for a HTTP(s) proxy to connect to. 
   * 
   * Example: `http://[username:password@]127.0.0.0:4711`
   */
  proxyUri?: string
  /**
   * Specifies whether to use a random user-agent header for each single request. 
   * 
   * Defaults to `true`
   */
  useRandomUserAgent?: boolean
}

/**
 * The default request make is base on the superagent client library.  
 * 
 * It automatically retrys failing request for a number of times and logs which requests are made.
 * 
 * It automatically sets a random user-agent head for each request, to obscure the crawling. 
 *  
 * It supports to hooks: 
 * - `configureRequest()` to tweak a request before sending it
 * - `afterRequest()` to implement custom handling of the response, e.g. for perparing the data for parsing or error handling
 * 
 * It has support for sending request through an HTTP proxy. 
 * 
 * @category RequestMaker
 */
class DefaultRequestMaker implements RequestMaker {
  logger: Logger = new SilentLogger()
  agent: SuperAgent<SuperAgentRequest>
  constructor(protected config: DefaultRequestMakerConfig = {}) { 
    this.agent = superagent.agent()
  }

  /**
   * Performs a POST request
   * @param url the URL to post data to 
   * @param data the payload to send to the server
   * @param context 
   * @param callback 
   */
  post(url: string, data: any, context: Context, callback: RequestCallback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    this.send({url: url, postData: data}, context, callback)
  }

  /**
   * Performs a GET request
   * @param url the URL to fetch 
   * @param context 
   * @param callback 
   */
  get (url: string, context: Context, callback: RequestCallback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    this.send({url: url}, context, callback)
  }

  send(requestObject: RequestObject, context: Context, callback: RequestCallback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    context.requestUrl = requestObject.url
    let logMsg = `requesting ${_.compact([requestObject.url, requestObject.postData ? JSON.stringify(requestObject.postData) : null]).join(', data: ')} ???`
    this.logger.info(colors.gray(logMsg))

    Utils.retry(logMsg, this.logger, (callback, prevResult) => {
      let request = requestObject.postData
        ? this.agent.post(requestObject.url).send(requestObject.postData)
        : this.agent.get(requestObject.url)

      request = this.configureRequest(request, context)
    
      if (this.config.hooks && this.config.hooks.configureRequest) {
        request = this.config.hooks.configureRequest(request, context)
      }

      request.end((err: any, response: superagent.Response) => {
        if (this.config.hooks && this.config.hooks.afterRequest) {
          this.config.hooks?.afterRequest(request, context, err, response, callback)
        }
        else {
          callback(err, response, context)
        }
      })
    }, callback)
  }

  private configureRequest(request: any, context: Context): SuperAgentRequest {
    MethodCallLogger.logMethodCall()
    context.pushCallstack()

    if (this.config.proxyUri) {
      this.logger.debug('request:proxy', this.config.proxyUri)
      request = request.proxy(this.config.proxyUri)
    }

    if (this.config.useRandomUserAgent === true || this.config.useRandomUserAgent === undefined) {
      let userAgent = this.randomUserAgent()
      this.logger.debug('request:user-agent', userAgent)
      request.set('user-agent', userAgent)
    }

    request.retry(3) // retry on errors before responding

    context.popCallstack()
    return request
  }

  private randomUserAgent() {
    return randomUserAgent.getRandom(ua => {     
      if (ua.deviceType === 'mobile') { return false }
      if (_.find(Constants.OS_NAME_BLACKLIST, (osName) => ua.userAgent.match(osName))) { return false }
      return true
    })
  }
}

/**
 * A CachedRequestMaker only performs are reuqest with the same url [and payload] once per object livetime. 
 * The caching is useful when crawling pages from multiple contexts / situations. 
 * 
 * It is based on the DefaultRequestMaker and therefor offers the same features as well. 
 * 
 * @category RequestMaker
 */
class CachedRequestMaker extends DefaultRequestMaker {
  private cache = {}
  
  send(requestObject: RequestObject, context: Context, callback: RequestCallback) {
    let key = this.cacheKey(requestObject)
    if (_.has(this.cache, key)) {
      let logMsg = `using cached response for ${_.compact([requestObject.url, requestObject.postData ? JSON.stringify(requestObject.postData) : null]).join(', data: ')}`
      this.logger.info(colors.gray(logMsg))
      context.requestUrl = requestObject.url
      callback(null, this.cache[key], context)
    } else {
      super.send(requestObject, context, (err, response, context) => {
        if (!err) {
          this.cache[key] = response
        }
        callback(err, response, context)
      })
    }
  }

  private cacheKey(requestObject: RequestObject): string {
    return [
      requestObject.url,
      JSON.stringify(requestObject.postData)
    ].join('#')
  }
}


export {
  RequestMaker,
  RequestObject,
  RequestCallback,
  RequestMakerHooks,
  DefaultRequestMakerConfig,
  DefaultRequestMaker, 
  CachedRequestMaker
}

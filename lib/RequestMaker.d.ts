import { Logger } from './Logger';
import Context from './Context';
import { SuperAgentRequest, SuperAgent } from 'superagent';
import * as superagent from 'superagent';
declare type RequestCallback = (err: any, response: superagent.Response, context: Context) => void;
/**
 * The RequestMaker interface allows to implement a custom RequestMaker.
 */
interface RequestMaker {
    logger: Logger;
    get: (url: string, context: Context, callback: RequestCallback) => void;
    post: (url: string, data: any, context: Context, callback: RequestCallback) => void;
    send: (request: RequestObject, context: Context, callback: RequestCallback) => void;
    willStartCrawling?: () => void;
    didFinishCrawling?: () => void;
}
interface RequestMakerHooks {
    /** Hook to apply custom configuration of superagent request before executing them. */
    configureRequest?: (request: any, context: Context) => SuperAgentRequest;
    /** Hook to change the response and error of a request or enhance the context. */
    afterRequest?: (request: any, context: Context, err: any, response: superagent.Response, callback: (RequestCallback)) => void;
}
interface RequestObject {
    url: string;
    postData?: any;
}
interface DefaultRequestMakerConfig {
    hooks?: RequestMakerHooks;
    /** full qualified URI for a HTTP(s) proxy to connect to.
     *
     * Example: `http://[username:password@]127.0.0.0:4711`
     */
    proxyUri?: string;
    /**
     * Specifies whether to use a random user-agent header for each single request.
     *
     * Defaults to `true`
     */
    useRandomUserAgent?: boolean;
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
declare class DefaultRequestMaker implements RequestMaker {
    protected config: DefaultRequestMakerConfig;
    logger: Logger;
    agent: SuperAgent<SuperAgentRequest>;
    constructor(config?: DefaultRequestMakerConfig);
    /**
     * Performs a POST request
     * @param url the URL to post data to
     * @param data the payload to send to the server
     * @param context
     * @param callback
     */
    post(url: string, data: any, context: Context, callback: RequestCallback): void;
    /**
     * Performs a GET request
     * @param url the URL to fetch
     * @param context
     * @param callback
     */
    get(url: string, context: Context, callback: RequestCallback): void;
    send(requestObject: RequestObject, context: Context, callback: RequestCallback): void;
    private configureRequest;
    private randomUserAgent;
}
/**
 * A CachedRequestMaker only performs are reuqest with the same url [and payload] once per object livetime.
 * The caching is useful when crawling pages from multiple contexts / situations.
 *
 * It is based on the DefaultRequestMaker and therefor offers the same features as well.
 *
 * @category RequestMaker
 */
declare class CachedRequestMaker extends DefaultRequestMaker {
    private cache;
    send(requestObject: RequestObject, context: Context, callback: RequestCallback): void;
    private cacheKey;
}
export { RequestMaker, RequestObject, RequestCallback, RequestMakerHooks, DefaultRequestMakerConfig, DefaultRequestMaker, CachedRequestMaker };

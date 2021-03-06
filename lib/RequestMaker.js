"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachedRequestMaker = exports.DefaultRequestMaker = void 0;
var Logger_1 = require("./Logger");
var Constants_1 = require("./Constants");
var MethodCallLogger_1 = require("./MethodCallLogger");
var superagent = require("superagent");
var randomUserAgent = require("random-useragent");
var _ = require("underscore");
var colors = require("colors");
var Utils_1 = require("./Utils");
require('superagent-charset')(superagent);
require('superagent-proxy')(superagent);
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
var DefaultRequestMaker = /** @class */ (function () {
    function DefaultRequestMaker(config) {
        if (config === void 0) { config = {}; }
        this.config = config;
        this.logger = new Logger_1.SilentLogger();
        this.agent = superagent.agent();
    }
    /**
     * Performs a POST request
     * @param url the URL to post data to
     * @param data the payload to send to the server
     * @param context
     * @param callback
     */
    DefaultRequestMaker.prototype.post = function (url, data, context, callback) {
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        this.send({ url: url, postData: data }, context, callback);
    };
    /**
     * Performs a GET request
     * @param url the URL to fetch
     * @param context
     * @param callback
     */
    DefaultRequestMaker.prototype.get = function (url, context, callback) {
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        this.send({ url: url }, context, callback);
    };
    DefaultRequestMaker.prototype.send = function (requestObject, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        context.requestUrl = requestObject.url;
        var logMsg = "requesting " + _.compact([requestObject.url, requestObject.postData ? JSON.stringify(requestObject.postData) : null]).join(', data: ') + " \u2026";
        this.logger.info(colors.gray(logMsg));
        Utils_1.default.retry(logMsg, this.logger, function (callback, prevResult) {
            var request = requestObject.postData
                ? _this.agent.post(requestObject.url).send(requestObject.postData)
                : _this.agent.get(requestObject.url);
            request = _this.configureRequest(request, context);
            if (_this.config.hooks && _this.config.hooks.configureRequest) {
                request = _this.config.hooks.configureRequest(request, context);
            }
            request.end(function (err, response) {
                var _a;
                if (_this.config.hooks && _this.config.hooks.afterRequest) {
                    (_a = _this.config.hooks) === null || _a === void 0 ? void 0 : _a.afterRequest(request, context, err, response, callback);
                }
                else {
                    callback(err, response, context);
                }
            });
        }, callback);
    };
    DefaultRequestMaker.prototype.configureRequest = function (request, context) {
        MethodCallLogger_1.default.logMethodCall();
        context.pushCallstack();
        if (this.config.proxyUri) {
            this.logger.debug('request:proxy', this.config.proxyUri);
            request = request.proxy(this.config.proxyUri);
        }
        if (this.config.useRandomUserAgent === true || this.config.useRandomUserAgent === undefined) {
            var userAgent = this.randomUserAgent();
            this.logger.debug('request:user-agent', userAgent);
            request.set('user-agent', userAgent);
        }
        request.retry(3); // retry on errors before responding
        context.popCallstack();
        return request;
    };
    DefaultRequestMaker.prototype.randomUserAgent = function () {
        return randomUserAgent.getRandom(function (ua) {
            if (ua.deviceType === 'mobile') {
                return false;
            }
            if (_.find(Constants_1.default.OS_NAME_BLACKLIST, function (osName) { return ua.userAgent.match(osName); })) {
                return false;
            }
            return true;
        });
    };
    return DefaultRequestMaker;
}());
exports.DefaultRequestMaker = DefaultRequestMaker;
/**
 * A CachedRequestMaker only performs are reuqest with the same url [and payload] once per object livetime.
 * The caching is useful when crawling pages from multiple contexts / situations.
 *
 * It is based on the DefaultRequestMaker and therefor offers the same features as well.
 *
 * @category RequestMaker
 */
var CachedRequestMaker = /** @class */ (function (_super) {
    __extends(CachedRequestMaker, _super);
    function CachedRequestMaker() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.cache = {};
        return _this;
    }
    CachedRequestMaker.prototype.send = function (requestObject, context, callback) {
        var _this = this;
        var key = this.cacheKey(requestObject);
        if (_.has(this.cache, key)) {
            var logMsg = "using cached response for " + _.compact([requestObject.url, requestObject.postData ? JSON.stringify(requestObject.postData) : null]).join(', data: ');
            this.logger.info(colors.gray(logMsg));
            context.requestUrl = requestObject.url;
            callback(null, this.cache[key], context);
        }
        else {
            _super.prototype.send.call(this, requestObject, context, function (err, response, context) {
                if (!err) {
                    _this.cache[key] = response;
                }
                callback(err, response, context);
            });
        }
    };
    CachedRequestMaker.prototype.cacheKey = function (requestObject) {
        return [
            requestObject.url,
            JSON.stringify(requestObject.postData)
        ].join('#');
    };
    return CachedRequestMaker;
}(DefaultRequestMaker));
exports.CachedRequestMaker = CachedRequestMaker;

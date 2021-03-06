"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var async = require("async");
var _ = require("underscore");
var moment = require("moment-timezone");
var colors = require("colors");
var Constants_1 = require("./Constants");
var cli_params_1 = require("./cli-params");
var ConfigValidator_1 = require("./ConfigValidator");
var Config_1 = require("./Config");
var config_schema_1 = require("./config-schema");
var RequestMaker_1 = require("./RequestMaker");
var RequestMakerWithNockCaching_1 = require("./RequestMakerWithNockCaching");
var ResponseParsers_1 = require("./ResponseParsers");
var Logger_1 = require("./Logger");
var TemplaterEvaluator_1 = require("./TemplaterEvaluator");
var MethodCallLogger_1 = require("./MethodCallLogger");
var OutputValidator_1 = require("./OutputValidator");
var Warnings_1 = require("./Warnings");
var Context_1 = require("./Context");
var Utils_1 = require("./Utils");
var ProgressTracker_1 = require("./ProgressTracker");
var JsonFileWriter_1 = require("./JsonFileWriter");
var ValueGrabber_1 = require("./ValueGrabber");
/** @private */
var CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY = 'CRAWL_SHOWTIMES_PLACEHOLDER';
/** @private */
var packageInfo = require('./../package.json');
/**
 * The main class of the Framework. Acts as single entry point unless building custom coded crawler scripts. Then you most likely won't use the CrawlE class at all.
 *
 * @category Main
 */
var CrawlE = /** @class */ (function () {
    function CrawlE(conf, logger) {
        var _this = this;
        if (logger === void 0) { logger = null; }
        this.results = {
            cinemas: null,
            movies: null,
            datePages: null,
            showtimes: null
        };
        this.progressTracker = new ProgressTracker_1.ProgressTracker();
        this._logger = new Logger_1.LoggerProxy(logger || new Logger_1.DefaultLogger());
        this._logger.info("node.js version " + process.version);
        this._logger.info(packageInfo.name + " version v" + packageInfo.version);
        var configValidator = new ConfigValidator_1.default(config_schema_1.default, this._logger);
        configValidator.validate(conf);
        this.config = new Config_1.default(conf, this._logger);
        this.requestMaker = cli_params_1.default.cacheDir
            ? new RequestMakerWithNockCaching_1.default(this.config, cli_params_1.default.cacheDir, this.config.crawler.id)
            : new RequestMaker_1.CachedRequestMaker(this.config);
        this.responseParser = new ResponseParsers_1.DefaultResponseParser();
        this.progressTracker.progressHook = this.handleProgressUpdate.bind(this);
        this.setTimezone(this.config.timezone);
        this.fileWriter = new JsonFileWriter_1.JsonFileWriter(Constants_1.default.OUTPUT_DIR, this.logger, function (data, context) {
            var fileNameBuilder = _this.config.hooks.buildFilename || _this.buildFilename;
            return fileNameBuilder(data.cinema, _this.config.crawler.id, context);
        });
    }
    Object.defineProperty(CrawlE.prototype, "logger", {
        get: function () {
            return this._logger;
        },
        set: function (newLogger) {
            this._logger.logger = newLogger;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CrawlE.prototype, "requestMaker", {
        get: function () {
            return this._requestMaker;
        },
        set: function (newRequestMaker) {
            this._requestMaker = newRequestMaker;
            this._requestMaker.logger = this.logger;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(CrawlE.prototype, "responseParser", {
        get: function () {
            return this._responseParser;
        },
        set: function (newResponseParser) {
            this._responseParser = newResponseParser;
            this._responseParser.logger = this.logger;
        },
        enumerable: false,
        configurable: true
    });
    CrawlE.prototype.setTimezone = function (zone) {
        if (zone) {
            moment.tz.setDefault(zone);
            this._logger.info("timezone: " + this.config.timezone + " (config)");
        }
        else {
            this._logger.info("timezone: " + moment.tz.guess() + " (system)");
        }
    };
    CrawlE.prototype.handleProgressUpdate = function (progress, change) {
        this.logger.debug('progress', progress.completed + "/" + progress.total + " \u2192 " + Math.round(progress.completed / progress.total * 100) + "%", "update:", change);
        if (this.config.hooks.progress) {
            this.config.hooks.progress(progress.completed, progress.total);
        }
    };
    /**
     * The main method, which starts and performs all the crawling according to the configuration.
     * @param done completion callback, default to some console.logs
     */
    CrawlE.prototype.crawl = function (done) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        var context = new Context_1.DefaultContext();
        context.pushCallstack();
        var steps = [];
        if (this.requestMaker.willStartCrawling) {
            var key = 'requestMaker.willStartCrawling';
            this.progressTracker.addTask(key, 1);
            this.requestMaker.willStartCrawling();
            this.progressTracker.finishTash(key);
        }
        if (this.config.hooks.beforeCrawling) {
            this.progressTracker.addTask('beforeCrawling', 1);
            steps.push(function (cb) { return _this.config.hooks.beforeCrawling(context, cb); });
            steps.push(function (cb) { _this.progressTracker.finishTash('beforeCrawling'); cb(); });
        }
        if (this.config.isTemporarilyClosed) {
            steps.push(function (cb) { return _this.crawlIsTemporarilyClosed(context, cb); });
        }
        // cinemas
        steps.push(function (cb) { return _this.getCinemas(context, cb); });
        steps.push(function (cinemas, cb) {
            _this.results.cinemas = _.union(_this.results.cinemas, cinemas);
            _this.logger.info("found " + cinemas.length + " cinemas");
            _this.logger.debug('cinemas:result', cinemas);
            cb(null, cinemas);
        });
        if (this.config.showtimes || this.config.movies || this.config.dates) {
            this.progressTracker.addTask('workOnCinema', 0, 5); // increased weighting to smooth progress percentage
            steps.push(function (cinemas, cb) {
                _this.progressTracker.removeTask(CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY);
                context.currentTask = 'workOnCinema';
                _this.mapSeries(cinemas, context, function (cinema, context, cb) {
                    context.cinema = cinema;
                    _this.workOnCinema(context, cb);
                }, cb);
            });
        }
        if (this.requestMaker.didFinishCrawling) {
            var key_1 = 'requestMaker.didFinishCrawling';
            this.progressTracker.addTask(key_1, 1);
            steps.push(function (res, cb) {
                _this.requestMaker.didFinishCrawling();
                _this.progressTracker.finishTash(key_1);
                cb(null, res);
            });
        }
        if (!done) {
            done = function (err) {
                if (err) {
                    console.error('???? Failed', err);
                }
                else {
                    console.log(colors.green.bold('??? DONE'), '????');
                }
            };
        }
        async.waterfall(steps, done);
    };
    CrawlE.prototype.crawlIsTemporarilyClosed = function (context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        if (!this.config.isTemporarilyClosed) {
            return callback(null);
        }
        this.requestMaker.get(this.config.isTemporarilyClosed.url, context, function (err, response) {
            if (err)
                return callback(err);
            var responseParser = new ResponseParsers_1.DefaultResponseParser();
            responseParser.logger = _this.logger;
            var _a = responseParser.prepareHtmlParsing(response.text, context), container = _a.container, parsingContext = _a.parsingContext;
            var valueGrabber = new ValueGrabber_1.default(_this.config.isTemporarilyClosed.grabber, _this.logger, 'is-temporarily-closed', function (value) { return !!value; });
            context.isTemporarilyClosed = !!valueGrabber.grabFirst(container, context);
            callback(null);
        });
    };
    /**
     * Gets the list of cinemas - either from static configuration or via crawling it.
     * @param context
     * @param callback
     */
    CrawlE.prototype.getCinemas = function (context, callback) {
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        if (this.config.cinemas) {
            callback(null, this.config.cinemas);
        }
        else {
            this.crawlCinemas(context, callback);
        }
    };
    /**
     * Crawls a list of cinemas according to the configuration.
     * @param context
     * @param callback
     */
    CrawlE.prototype.crawlCinemas = function (context, callback) {
        if (typeof context === 'function') {
            callback = context;
            context = new Context_1.DefaultContext();
        }
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        this.progressTracker.addTask(CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY, 10);
        context.currentTask = 'crawlCinemaList';
        this.workOnRequestLists(this.config.cinemasConfig.list, context, this.crawlCinemaList.bind(this), function (err, cinemasLists) {
            if (err) {
                callback(err, null);
            }
            else {
                callback(null, _.flatten(cinemasLists));
            }
        });
    };
    /**
     * Crawls a list of cinemas from a single page / request.
     * @param requestObject the configuration to make either a GET or POST request
     * @param context
     * @param callback
     */
    CrawlE.prototype.crawlCinemaList = function (requestObject, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        var responseHandler = this.responseParserFor(Context_1.Resource.CinemaList, this.config.cinemasConfig.list);
        this.crawlList(requestObject, Context_1.Resource.CinemaList, responseHandler, context, function (err, cinemas) {
            if (err)
                return callback(err);
            if (_this.config.cinemasConfig.details) {
                _this.logger.info("found " + cinemas.length + " cinemas, start crawling details \u2026");
                _this.progressTracker.addTask(CRAWL_SHOWTIMES_PROGRESS_PLACEHOLDER_KEY, cinemas.length * 10);
                context.currentTask = 'crawlCinemaDetails';
                _this.map(cinemas, context, function (cinema, context, cb) {
                    _this.crawlCinemaDetails(cinema, context, cb);
                }, callback);
            }
            else {
                callback(null, cinemas);
            }
        });
    };
    /**
     * Get addtional cinema properties from a details page. Updates the cinema in context.
     * @param cinema
     * @param context
     * @param callback
     */
    CrawlE.prototype.crawlCinemaDetails = function (cinema, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        context.resource = Context_1.Resource.CinemaDetails;
        context.cinema = cinema;
        var requestObject = {
            url: this.config.cinemasConfig.details.url,
            postData: this.config.cinemasConfig.details.postData
        };
        requestObject = TemplaterEvaluator_1.default.evaluateRequestObject(requestObject, context);
        async.waterfall([
            function (cb) { return _this.requestMaker.send(requestObject, context, cb); },
            function (response, context, cb) {
                var responseHandler = _this.responseParserFor(Context_1.Resource.CinemaDetails, _this.config.cinemasConfig.details);
                responseHandler(response, context, cb);
            },
            function (cinemaDetails, cb) {
                _.extend(context.cinema, cinemaDetails);
                callback(null, context.cinema);
            }
        ], callback);
    };
    /**
     * Crawls the showtimes for a single cinema according to the configuration.
     * @param cinema
     * @param callback
     */
    CrawlE.prototype.crawlShowtimesForCinema = function (cinema, callback) {
        var context = new Context_1.DefaultContext();
        context.cinema = cinema;
        this.workOnCinema(context, callback);
    };
    CrawlE.prototype.workOnCinema = function (context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        this.progressTracker.increaseTotalStepsBy('processResult', 1);
        var showtimesConfig = this.config.movies
            ? _.compact([this.config.movies.showtimes])
            : this.config.dates
                ? _.compact([this.config.dates.showtimes])
                : this.config.showtimes;
        async.waterfall([
            function (cb) { return _this.getMovies(context, cb); },
            function (movies, cb) {
                context.currentTask = 'getShowtimesForMovie';
                _this.map(movies, context, function (movie, context, cb) {
                    if (movie) {
                        context.movie = movie;
                        context.version = movie.version;
                    }
                    _this.getDates(context, function (err, datePages) {
                        if (err) {
                            return cb(err);
                        }
                        _this.map(datePages, context, function (datePage, context, cb) {
                            if (datePage) {
                                context.date = datePage.date;
                                context.dateHref = datePage.href;
                            }
                            if (showtimesConfig) {
                                _this.getShowtimes(context, showtimesConfig, cb);
                            }
                            else {
                                cb(null, []);
                            }
                        }, cb);
                    });
                }, cb);
            },
            function (showtimes, cb) {
                cb(null, _.chain(showtimes).flatten().compact().value());
            },
            function (showtimes, cb) {
                cb(null, {
                    crawler: _this.config.crawler,
                    cinema: context.cinema,
                    showtimes: showtimes
                });
            },
            function (result, cb) { return _this.processResult(result, context, cb); },
            function (cb) {
                _this.progressTracker.increaseCompletedSteps('processResult');
                cb();
            }
        ], callback);
    };
    CrawlE.prototype.processResult = function (result, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        async.waterfall([
            function (cb) {
                _this.logger.debug("result", JSON.stringify(result, null, 2));
                cb(null, result);
            },
            function (result, cb) {
                if (_this.config.hooks.beforeSave) {
                    result = _this.config.hooks.beforeSave(result, context);
                }
                cb(null, result);
            },
            function (result, cb) {
                // print warnings 
                var groupedWarnings = _.chain([])
                    .union(context.warnings)
                    .union(OutputValidator_1.default.validate(result, context))
                    .unique(function (w) { return w.code; })
                    .map(function (w) {
                    w.acceptedReason = _this.config.acceptedWarnings[w.code];
                    return w;
                })
                    .groupBy(function (w) { return w.acceptedReason === undefined ? 'print' : 'accepted'; })
                    .value();
                function forWarnings(key, fn) {
                    if (groupedWarnings[key] && groupedWarnings[key].length > 0) {
                        fn(groupedWarnings[key]);
                    }
                }
                forWarnings('print', function (warnings) {
                    _this.logger.info('\n');
                    _this.logger.info(colors.yellow.bold('????  W A R N I N G S:\n'));
                    warnings.forEach(function (w) { return Warnings_1.default.print(w, _this.logger.warn.bind(_this.logger)); });
                    _this.logger.info('\n');
                });
                forWarnings('accepted', function (warnings) {
                    var debugLog = function (msg) { return _this.logger.debug('warnings', msg); };
                    warnings.forEach(function (w) { return Warnings_1.default.print(w, debugLog); });
                    debugLog('\n');
                });
                if (context.isTemporarilyClosed && result.cinema) {
                    result.cinema.is_temporarily_closed = true;
                }
                cb(null, result);
            },
            function (result, cb) { return _this.fileWriter.saveFile(result, context, cb); }
        ], callback);
    };
    CrawlE.prototype.getMovies = function (context, callback) {
        MethodCallLogger_1.default.logMethodCall();
        if (!this.config.movies) {
            return callback(null, [null]); // if no movie pages, create a dummy iteration
        }
        callback = context.trackCallstackAsync(callback);
        context.currentTask = 'getMovies';
        this.workOnRequestLists(this.config.movies.list, context, this.crawlMovieList.bind(this), callback);
    };
    CrawlE.prototype.crawlList = function (requestObject, resource, responseHandler, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        context.resource = resource;
        var key;
        switch (resource) {
            case Context_1.Resource.CinemaList:
                key = 'cinemas';
                break;
            case Context_1.Resource.MovieList:
                key = 'movies';
                break;
            case Context_1.Resource.DateList:
                key = 'datePages';
                break;
            case Context_1.Resource.Showtimes:
                key = 'showtimes';
                break;
            default: throw new Error('unsupported resource');
        }
        context.indexes.page = context.indexes.page || 0;
        var _context = Context_1.cloneContext(context);
        requestObject = TemplaterEvaluator_1.default.evaluateRequestObject(requestObject, _context);
        async.waterfall([
            function (cb) { return _this.requestMaker.send(requestObject, _context, cb); },
            responseHandler,
            function (result, nextPageUrl, cb) {
                if (typeof nextPageUrl === 'function') {
                    cb = nextPageUrl;
                    nextPageUrl = null;
                }
                if (nextPageUrl) {
                    context.indexes.page += 1;
                    _this.crawlList({ url: nextPageUrl }, resource, responseHandler, context, function (err, resultLists) {
                        if (err)
                            return cb(err);
                        cb(null, _.union(result, _.flatten(resultLists)));
                    });
                }
                else {
                    cb(null, result);
                }
            },
            function (result, cb) {
                result = _.flatten(result);
                _this.results[key] = _.union(_this.results[key], result);
                _this.logger.debug(key + ":result", result);
                cb(null, result);
            }
        ], callback);
    };
    CrawlE.prototype.crawlMovieList = function (requestObject, context, callback) {
        MethodCallLogger_1.default.logMethodCall();
        var responseHandler = this.responseParserFor(Context_1.Resource.MovieList, this.config.movies.list);
        this.crawlList(requestObject, Context_1.Resource.MovieList, responseHandler, context, callback);
    };
    CrawlE.prototype.getDates = function (context, callback) {
        MethodCallLogger_1.default.logMethodCall();
        if (!this.config.dates) {
            return callback(null, [null]); // if no date pages, create a dummy iteration
        }
        callback = context.trackCallstackAsync(callback);
        context.currentTask = 'getDates';
        this.workOnRequestLists(this.config.dates.list, context, this.crawlDateList.bind(this), callback);
    };
    CrawlE.prototype.crawlDateList = function (requestObject, context, callback) {
        MethodCallLogger_1.default.logMethodCall();
        var responseHandler = this.responseParserFor(Context_1.Resource.DateList, this.config.dates.list);
        this.crawlList(requestObject, Context_1.Resource.DateList, responseHandler, context, callback);
    };
    CrawlE.prototype.getShowtimes = function (context, configs, callback) {
        context.currentTask = 'getShowtimes';
        this.mapSeries(configs, context, this.crawlShowtimes.bind(this), Utils_1.default.resultsFlattenCallbackWrapper(callback));
    };
    CrawlE.prototype.crawlShowtimes = function (config, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        context.resource = Context_1.Resource.Showtimes;
        context.currentTask = 'crawlShowtimes';
        this.workOnRequestLists(config, context, function (requestObject, context, callback) {
            _this.crawlShowtimesList(requestObject, config, context, callback);
        }, callback);
    };
    CrawlE.prototype.workOnRequestLists = function (config, context, iterator, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        // context.currentTask should already be set since this is a control flow helper 
        this.mapSeries(config.urls.map(function (url) { return ({ url: url, postData: config.postData }); }), context, function (requestObj, context, cb) {
            var dateRegex = /\:date\:/;
            var pageRegex = /\:page\(([^)]*)\)\:/; // /\:page\((\d*),(\d*)\)\:/
            if (dateRegex.test(requestObj.url) || dateRegex.test(JSON.stringify(requestObj.postData))) {
                _this.iterateDates(config, context, function (context, cb) {
                    iterator(requestObj, context, cb);
                }, cb);
            }
            else if (pageRegex.test(requestObj.url) || pageRegex.test(JSON.stringify(requestObj.postData))) {
                _this.iteratePages(requestObj, context, function (context, cb) {
                    iterator(requestObj, context, cb);
                }, cb);
            }
            else {
                iterator(requestObj, context, cb);
            }
        }, function (err, lists) {
            if (err) {
                callback(err, null);
            }
            else {
                callback(null, _.flatten(lists));
            }
        });
    };
    CrawlE.prototype.iterateDates = function (config, context, iterator, callback) {
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        var dates = _.range(config.urlDateCount).map(function (i) { return moment().add(i, 'days'); });
        // context.currentTask should already be set since this is a control flow helper 
        this.map(dates, context, function (date, context, cb) {
            context.date = date;
            iterator(context, cb);
        }, callback);
    };
    CrawlE.prototype.iteratePages = function (requestObject, context, iterator, callback) {
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        var pages = TemplaterEvaluator_1.default.parseStaticPages(requestObject.url) || TemplaterEvaluator_1.default.parseStaticPages(requestObject.postData);
        this.map(pages, context, function (page, context, cb) {
            context.page = page;
            context.indexes.page = pages.indexOf(page);
            iterator(context, cb);
        }, callback);
    };
    CrawlE.prototype.crawlShowtimesList = function (requestObject, config, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        var _context = Context_1.cloneContext(context);
        _context.dateFormat = config.urlDateFormat; // todo: refactor TemplaterEvaluator to read dateFormat from a config obj rather than mixing it into the context    
        requestObject = TemplaterEvaluator_1.default.evaluateRequestObject(requestObject, _context);
        var responseHandler = this.responseParserFor(Context_1.Resource.Showtimes, config);
        Utils_1.default.retry("showtimes crawling from " + requestObject.url, this.logger, function (callback, results) {
            _this.crawlList(requestObject, Context_1.Resource.Showtimes, responseHandler, context, function (err, showtimes) {
                if (err)
                    return callback(err);
                if (!config.preserveLateNightShows && showtimes) {
                    _this.adjustLateNightShowtimes(showtimes);
                }
                callback(null, showtimes);
            });
        }, callback);
    };
    // midnight / latenight showtimes are often shown at the previous day on websites
    // so we have to add 1 day to correct them unless disabled via config
    CrawlE.prototype.adjustLateNightShowtimes = function (showtimes) {
        showtimes.forEach(function (showtime) {
            if (moment(showtime.start_at).hour() < 6) {
                showtime.start_at = moment(showtime.start_at).add(1, 'd').format('YYYY-MM-DDTHH:mm:ss');
            }
        });
    };
    CrawlE.prototype.responseParserFor = function (resource, defautlParserConfig) {
        var key;
        switch (resource) {
            case Context_1.Resource.CinemaList:
                key = 'handleCinemasResponse';
                break;
            case Context_1.Resource.CinemaDetails:
                key = 'handleCinemaDetailsResponse';
                break;
            case Context_1.Resource.MovieList:
                key = 'handleMoviesResponse';
                break;
            case Context_1.Resource.DateList:
                key = 'handleDatesResponse';
                break;
            case Context_1.Resource.Showtimes:
                key = 'handleShowtimesResponse';
                break;
            default: throw new Error('unsupported resource');
        }
        if (this.config.hooks[key]) {
            return this.config.hooks[key];
        }
        var defaultParser = this.responseParser[key].bind(this.responseParser);
        return function (response, context, callback) {
            defaultParser(response, defautlParserConfig, context, callback);
        };
    };
    // Helpers
    CrawlE.prototype.buildFilename = function (cinema, crawlerId, context) {
        cinema = cinema || {};
        return _.compact([crawlerId, cinema.slug || cinema.id]).join('_') + '.json';
    };
    CrawlE.prototype.map = function (list, context, iterator, callback) {
        this.mapLimit(list, this.config.concurrency, context, iterator, callback);
    };
    CrawlE.prototype.mapSeries = function (list, context, iterator, callback) {
        this.mapLimit(list, 1, context, iterator, callback);
    };
    CrawlE.prototype.mapLimit = function (list, limit, context, iterator, callback) {
        var _this = this;
        list = Utils_1.default.limitList(list);
        var progressKey = context.currentTask;
        this.progressTracker.increaseTotalStepsBy(context.currentTask, list.length);
        Utils_1.default.mapLimit(list, limit, context, function (item, context, cb) {
            iterator(item, context, function (err, result) {
                _this.progressTracker.increaseCompletedSteps(progressKey);
                cb(err, result);
            });
        }, callback);
    };
    return CrawlE;
}());
exports.default = CrawlE;

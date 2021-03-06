"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var _ = require("underscore");
var ObjectPath = require("object-path");
var config_schema_1 = require("./config-schema");
var Utils_1 = require("./Utils");
var Logger_1 = require("./Logger");
/** @private */
function parseListConfig(listConfig) {
    var result = _.clone(listConfig);
    result.urls = listConfig.urls || [listConfig.url];
    result.urlDateCount = listConfig.urlDateCount || 14;
    return result;
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
    };
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
            }
            else {
                collect.push(result);
            }
        }
    };
    picker(Asource, [], []);
    return Aout;
}
/**
 * Default Config implementation.
 * @category Main
 */
var Config = /** @class */ (function () {
    function Config(config, logger) {
        var _this = this;
        if (logger === void 0) { logger = new Logger_1.SilentLogger(); }
        this.crawler = {};
        var pickGeneralValue = function (key) {
            _this[key] = _.has(config, key)
                ? config[key]
                : config_schema_1.default.properties[key].default;
        };
        pickGeneralValue('proxyUri');
        pickGeneralValue('concurrency');
        pickGeneralValue('useRandomUserAgent');
        pickGeneralValue('timezone');
        this.acceptedWarnings = config.acceptedWarnings || {};
        this.isTemporarilyClosed = config.isTemporarilyClosed;
        if (config.cinemas && config.cinemas.constructor === Array) {
            this.cinemas = config.cinemas;
        }
        else if (config.cinemas) {
            this.cinemasConfig = {
                list: config.cinemas.list
                    ? parseListConfig(config.cinemas.list)
                    : undefined,
                details: _.clone(config.cinemas.details)
            };
        }
        if (config.showtimes) {
            config.showtimes = config.showtimes.constructor === Array
                ? config.showtimes
                : [config.showtimes];
            this.showtimes = config.showtimes.map(function (showtimesConfig) { return parseListConfig(showtimesConfig); });
            this.showtimes.forEach(function (showtimesConfig, index) {
                if (showtimesConfig.showtimes) {
                    showtimesConfig.showtimes = _this.parseShowtimesParsingConfig(showtimesConfig.showtimes);
                }
                var parsingConfigKeyPaths = _this.generateParsingConfigKeyPaths("showtimes." + index);
                // resolve showtimes parsing configs       
                parsingConfigKeyPaths
                    .map(function (keypath) { return [keypath, 'showtimes'].join('.'); })
                    .forEach(function (keypath) {
                    if (ObjectPath.get(config, keypath)) {
                        ObjectPath.set(_this, keypath, _this.parseShowtimesParsingConfig(ObjectPath.get(_this, keypath)));
                    }
                });
                // resolve showtimes table configs
                _this.resolveTableConfig(config, parsingConfigKeyPaths.concat("showtimes." + index), logger);
                // resolve default box selectors 
                parsingConfigKeyPaths
                    .filter(function (keypath) { return keypath.match(/periods$/i); })
                    .forEach(function (keypath) {
                    if (ObjectPath.get(config, keypath)) {
                        var boxKeyPath = [keypath, 'box'].join('.');
                        ObjectPath.set(_this, boxKeyPath, ObjectPath.get(_this, boxKeyPath) || 'body');
                    }
                });
            });
        }
        var crawlingConfigKeys = ['movies', 'dates'];
        crawlingConfigKeys.forEach(function (crawlingConfigKey) {
            if (_.has(config, crawlingConfigKey)) {
                _this[crawlingConfigKey] = {
                    list: parseListConfig(config[crawlingConfigKey].list),
                    showtimes: undefined
                };
                if (config[crawlingConfigKey].showtimes) {
                    _this[crawlingConfigKey].showtimes = parseListConfig(config[crawlingConfigKey].showtimes);
                    // resolve showtimes table configs
                    var parsingConfigKeyPaths_1 = _this.generateParsingConfigKeyPaths(crawlingConfigKey + ".showtimes");
                    _this.resolveTableConfig(config, parsingConfigKeyPaths_1.concat(crawlingConfigKey + ".showtimes"), logger);
                }
                var parsingConfigKeyPaths = _this.generateParsingConfigKeyPaths(crawlingConfigKey + ".showtimes");
                // resolve showtimes parsing configs       
                parsingConfigKeyPaths
                    .map(function (keypath) { return [keypath, 'showtimes'].join('.'); })
                    .forEach(function (keypath) {
                    if (ObjectPath.get(config, keypath)) {
                        ObjectPath.set(_this, keypath, _this.parseShowtimesParsingConfig(ObjectPath.get(_this, keypath)));
                    }
                });
            }
        });
        this.hooks = config.hooks || {};
        this.setCrawlerConfig(config);
    }
    /**
     * Generates a list of all possible keypath combiniations
     * that could be configured for box & showtimes parsing
     * relative to the given parentKeyPath.
     *
     * see corresponding mocha test checking all sorts of combinations
     */
    Config.prototype.generateParsingConfigKeyPaths = function (parentKeyPath) {
        var parsingConfigs = ['movies', 'dates', 'periods', 'auditoria', 'versions', 'forEach'];
        return permutate(parsingConfigs, 0, 0).map(function (combi) { return [parentKeyPath].concat(combi).join('.'); });
    };
    Config.prototype.resolveTableConfig = function (config, parsingConfigKeyPaths, logger) {
        var _this = this;
        parsingConfigKeyPaths
            .forEach(function (keypath) {
            if (ObjectPath.get(config, keypath + '.table.cells.showtimes')) {
                ObjectPath.set(_this, keypath + '.table.cells.showtimes', _this.parseShowtimesParsingConfig(ObjectPath.get(_this, keypath + '.table.cells.showtimes')));
            }
        });
    };
    Config.prototype.setCrawlerConfig = function (config) {
        this.crawler.id = (config.crawler && config.crawler.id) || Utils_1.default.getMainFilenameBase();
        if (config.crawler && typeof config.crawler.is_booking_link_capable) {
            this.crawler.is_booking_link_capable = config.crawler.is_booking_link_capable;
        }
        this.crawler.is_booking_link_capable = this.crawler.is_booking_link_capable || false;
        if (config.crawler && typeof config.crawler.jira_issues) {
            this.crawler.jira_issues = config.crawler.jira_issues;
        }
    };
    Config.prototype.parseShowtimesParsingConfig = function (showtimesConfig) {
        if (!showtimesConfig) {
            return showtimesConfig;
        }
        var result = _.clone(showtimesConfig);
        if (Utils_1.default.isLinkTagSelector(showtimesConfig.box)) {
            this.crawler.is_booking_link_capable = true;
        }
        if (showtimesConfig.bookingLink) {
            this.crawler.is_booking_link_capable = true;
        }
        return result;
    };
    return Config;
}());
exports.default = Config;

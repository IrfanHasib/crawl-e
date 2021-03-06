"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var LanguageMappings_1 = require("./LanguageMappings");
var Constants_1 = require("./Constants");
var cli_params_1 = require("./cli-params");
var cheerio = require("cheerio");
var UrlParser = require("url");
var async = require("async");
var path = require("path");
var _ = require("underscore");
var Context_1 = require("./Context");
/** @private */
function cleanLanguageString(str) {
    return str.replace(/\(|\)|\./g, '');
}
var Utils;
(function (Utils) {
    /**
     * Return a copy of the object, filtered to only keep keys which have non-null values.
     */
    function compactObj(obj) {
        return _.pick(obj, function (val) { return val !== null && val !== undefined; });
    }
    Utils.compactObj = compactObj;
    /**
     * Checks if the given selector is addressing an html `a` tag.
     */
    function isLinkTagSelector(selector) {
        if (!selector) {
            return false;
        }
        // consider only last element of selector
        selector = selector.split(' ').reverse()[0];
        // return true if selector is for href attribute
        if (selector.match(/\[href(.*)\]/)) {
            return true;
        }
        // remove attribute selectors
        selector = selector.replace(/\[(.*)\]+/g, '');
        // remove class selectors
        selector = selector.split('.')[0];
        // remove pseudo class selectors
        selector = selector.split(':')[0];
        return selector === 'a';
    }
    Utils.isLinkTagSelector = isLinkTagSelector;
    /**
     * Maps a parsed language string into a ISO 639 code or `original version`.
     * @param languauge
     * @returns the ISO 639 code for the given language or `null` if not found
     */
    function mapLanguage(language) {
        if (!language) {
            return null;
        }
        language = cleanLanguageString(language);
        var mapping = LanguageMappings_1.default[language.toLocaleLowerCase()];
        if (mapping) {
            return mapping.language;
        }
        return null;
    }
    Utils.mapLanguage = mapLanguage;
    /**
     * Maps a parsed string of sub titles into an ISO 639 code array or `undetermined`.
     * @param subtitles
     */
    function mapSubtitles(subtitles) {
        if (!subtitles) {
            return null;
        }
        subtitles = cleanLanguageString(subtitles);
        var mapping = LanguageMappings_1.default[subtitles.toLocaleLowerCase()];
        if (mapping) {
            return mapping.subtitles;
        }
        return null;
    }
    Utils.mapSubtitles = mapSubtitles;
    function matchLanguageVersions(text) {
        var versions = [];
        if (text) {
            text = cleanLanguageString(text);
            _.mapObject(LanguageMappings_1.default, function (langVersion, langToken) {
                var regex = new RegExp("\\s" + langToken + "\\s", 'i');
                if (regex.test(text + ' ')) {
                    versions.push(langVersion);
                }
            });
        }
        return versions;
    }
    /**
     * Checks a text for matching language or original version info.
     * @param test
     * @returns the ISO 639 code for the given language, `'original version'` or `null` if not found
     */
    function matchLanguage(text) {
        var languages = _.chain(matchLanguageVersions(text))
            .map(function (v) { return v.language; })
            .uniq()
            .compact()
            .value();
        switch (languages.length) {
            case 1:
                return languages[0];
            case 2:
                return languages.indexOf(LanguageMappings_1.ORIGINAL_VERSION) === -1
                    ? null
                    : languages.filter(function (l) { return l !== LanguageMappings_1.ORIGINAL_VERSION; })[0];
            default:
                return null;
        }
    }
    Utils.matchLanguage = matchLanguage;
    /**
     * Checks a text for matching subtiles info.
     * @param test
     * @returns the ISO 639 code for matched subtitles, `'undetermined'` or `null` if not found
     */
    function matchSubtitles(text) {
        var subs = _.chain(matchLanguageVersions(text))
            .map(function (v) { return v.subtitles; })
            .flatten()
            .filter(function (s) { return s === LanguageMappings_1.SUBTITLES_UNDETERMINED; })
            .uniq()
            .value();
        switch (subs.length) {
            case 1:
                return subs[0];
            default:
                return null;
        }
    }
    Utils.matchSubtitles = matchSubtitles;
    function parseLatlonFromUrl(url, param, delimiter) {
        if (delimiter === void 0) { delimiter = ','; }
        url = url.replace(/&amp;/ig, '&');
        var latlonParam = UrlParser.parse(url, true).query[param];
        if (!latlonParam) {
            return null;
        }
        var latlon = latlonParam.split(delimiter).map(function (str) { return parseFloat(str); });
        return { lat: latlon[0], lon: latlon[1] };
    }
    function parseLatlonFromGoogleMapsUrl(url) {
        if (url == null)
            return null;
        if (!!url.match(/maps.google.\w{2,3}/i) || !!url.match(/google.com\/maps/i)) {
            if (url.match(/q=loc:/)) {
                var match = url.match(/q=loc:([-]?[0-9.]+)[,+]+([-]?[-0-9.]+)/);
                if (match.length >= 3) {
                    return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
                }
            }
            if (url.match(/ll=/)) {
                return parseLatlonFromUrl(url, 'll', / |,/);
            }
            if (url.match(/q=/)) {
                return parseLatlonFromUrl(url, 'q', / |,/);
            }
            if (url.match(/daddr=/)) {
                return parseLatlonFromUrl(url, 'daddr');
            }
            if (url.match(/data=/)) {
                var match_1 = url.match(/3d([-0-9.]+)!4d([-0-9.]+)/);
                if (match_1 != null) {
                    return { lat: parseFloat(match_1[1]), lon: parseFloat(match_1[2]) };
                }
            }
            if (url.match(/@/)) {
                var latlon = url.split('@')[1].split(',');
                if (latlon.length > 1) {
                    return { lat: parseFloat(latlon[0]), lon: parseFloat(latlon[1]) };
                }
            }
            if (url.match(/embed/)) {
                var lat, lon;
                url.split('!').forEach(function (s) {
                    if (s.match(/^2d/)) {
                        lon = parseFloat(s.split('2d')[1]);
                    }
                    else if (s.match(/^3d/)) {
                        lat = parseFloat(s.split('3d')[1]);
                    }
                });
                return { lat: lat, lon: lon };
            }
        }
        return null;
    }
    Utils.parseLatlonFromGoogleMapsUrl = parseLatlonFromGoogleMapsUrl;
    function parseLatlonFromBingMapsUrl(url) {
        if (url == null)
            return null;
        if (!url.match(/bing.com/i)) {
            return null;
        }
        return parseLatlonFromUrl(url, 'cp', '~');
    }
    Utils.parseLatlonFromBingMapsUrl = parseLatlonFromBingMapsUrl;
    function parseLatlonFromAppleMapsUrl(url) {
        if (url == null)
            return null;
        if (!url.match(/apple.com/i)) {
            return null;
        }
        return parseLatlonFromUrl(url, 'q');
    }
    Utils.parseLatlonFromAppleMapsUrl = parseLatlonFromAppleMapsUrl;
    /**
     * Parses latitude and longitude from a google, bing or apple maps url.
     * @param url an url string for either of the above listed maps services
     * @returns an location object or `null` if failed to parse the given url
     */
    function parseMapsUrl(url) {
        return null
            || parseLatlonFromGoogleMapsUrl(url)
            || parseLatlonFromBingMapsUrl(url)
            || parseLatlonFromAppleMapsUrl(url);
    }
    Utils.parseMapsUrl = parseMapsUrl;
    function resultsFlattenCallbackWrapper(callback) {
        return function (err, result) {
            var flatResult;
            if (result instanceof Array) {
                flatResult = _.chain(result).flatten().compact().value();
            }
            callback(err, result);
        };
    }
    Utils.resultsFlattenCallbackWrapper = resultsFlattenCallbackWrapper;
    function retry(taskDescription, logger, task, callback) {
        var retryCounter = 0;
        var retryOptions = {
            times: Constants_1.default.RETRY_OPTIONS.times,
            interval: Constants_1.default.RETRY_OPTIONS.interval,
            errorFilter: function (err) {
                retryCounter += 1;
                logger.warn("retrying (attempt: " + (retryCounter + 1) + ") " + taskDescription + " due to error:", err.message);
                return true;
            }
        };
        async.retry(retryOptions, task, callback);
    }
    Utils.retry = retry;
    /**
     * When the `limit` CLI parameter is set, the given list will be sliced from beginning to the accordling maximum length.
     * Otherwise the list is returned in full length.
     * The purpose of limiting the list via CLI paramter is to cut down on execution time during development.
     * @param list An arbitrary list to limit in length.
     */
    function limitList(list) {
        return list.slice(0, cli_params_1.default.limit);
    }
    Utils.limitList = limitList;
    /**
     * The same as `mapLimit` but runs only a single async operation at a time.
     * @param list A collection to iterate over.
     * @param context The current / parent context to start from.
     * @param iterator An async function to apply to each item in list. The `iterator` should complete with the transformed item. Invoked with (`item`, `context`, `callback`), where `context` is a clone of the parent context, that is unique and only valid for each item in the list.
     * @param callback A callback which is called when all `iterator` functions have finished, or an error occurs. Results is an array of the transformed items from the lsit. Invoked with (err, results).
     */
    function mapSeries(list, context, iterator, callback) {
        mapLimit(list, 1, context, iterator, callback);
    }
    Utils.mapSeries = mapSeries;
    /**
     * Produces a new collection of values by mapping each value in `list` through the `iterator` function, by running a maximum of `limit` async operations at a time.
     * @param list A collection to iterate over.
     * @param limit The maximum number of async operations at a time
     * @param context The current / parent context to start from.
     * @param iterator An async function to apply to each item in list. The `iterator` should complete with the transformed item. Invoked with (`item`, `context`, `callback`), where `context` is a clone of the parent context, that is unique and only valid for each item in the list.
     * @param callback A callback which is called when all `iterator` functions have finished, or an error occurs. Results is an array of the transformed items from the lsit. Invoked with (err, results).
     */
    function mapLimit(list, limit, context, iterator, callback) {
        list = Utils.limitList(list);
        async.mapLimit(list, limit, function (item, callback) {
            iterator(item, 
            // cloning the context is important as the interation works in parallel which cause context overwrites otherwise
            Context_1.cloneContext(context), callback);
        }, callback);
    }
    Utils.mapLimit = mapLimit;
    /**
     * Transforms a HTML structure wrapping sections of a flat lists node's into boxes.
     * @param html
     * @param containerSelector jQuery selector for the container node(s) of the list
     * @param nodeSelector jQuery selector for the nodes to start a box at
     * @param boxTag full html tag snipped including attributes to wrap boxes in - e.g. `<div class="movie"></div>`
     * @returns changed HTML structure
     */
    function addBoxes(html, containerSelector, nodeSelector, boxTag) {
        var $ = cheerio.load(html);
        var container = $(containerSelector);
        var nodes = container.find(nodeSelector);
        nodes.each(function (index, elem) {
            var node = $(elem);
            var boxNodes = node.nextUntil(nodeSelector);
            var wrapper = $(boxTag);
            wrapper.append(node.clone());
            wrapper.append(boxNodes); // appeding moved the boxes from the container
            node.replaceWith(wrapper);
        });
        return $.html();
    }
    Utils.addBoxes = addBoxes;
    /**
     * Returns the filename inlcuding file extension of the javascript or typescript file that is executed to run the crawler.
     */
    function getMainFilename() {
        return path.basename(require.main.filename);
    }
    Utils.getMainFilename = getMainFilename;
    /**
     * Returns the filename excluding file extension of the javascript or typescript file that is executed to run the crawler.
     */
    function getMainFilenameBase() {
        return getMainFilename().replace(/\.[jt]s$/, '');
    }
    Utils.getMainFilenameBase = getMainFilenameBase;
})(Utils || (Utils = {}));
exports.default = Utils;

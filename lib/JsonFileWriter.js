"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonFileWriter = void 0;
var _ = require("underscore");
var path = require("path");
var fs = require("fs");
var async = require("async");
var colors = require("colors");
var Logger_1 = require("./Logger");
var MethodCallLogger_1 = require("./MethodCallLogger");
var Utils_1 = require("./Utils");
/** @private */
var packageInfo = require('./../package.json');
/**
 * Saves the output data to JSON Files.
 */
var JsonFileWriter = /** @class */ (function () {
    /**
     * Creates are new JsonFileWriter.
     * @param outDir The path to the directory, relative to executed script, defaults to  `'output'`
     * @param logger An optional logger, which will log 'Saving file + path' in green color.
     * @param fileNameBuilder A custom callback for building the filename, which will be called during `saveFile()` - allows to implement dynamic filenames.
     */
    function JsonFileWriter(outDir, logger, fileNameBuilder) {
        if (outDir === void 0) { outDir = 'output'; }
        if (logger === void 0) { logger = new Logger_1.SilentLogger(); }
        this.logger = logger;
        this.fileNameBuilder = fileNameBuilder;
        this.outDirPath = path.join(path.resolve(), outDir);
    }
    /**
     * Ensures that the output directory exists. Attempts to create it if lacking.
     */
    JsonFileWriter.prototype.ensureOutDir = function (callback) {
        var _this = this;
        fs.exists(this.outDirPath, function (exists) {
            if (!exists) {
                fs.mkdir(_this.outDirPath, (callback));
            }
            else {
                callback();
            }
        });
    };
    JsonFileWriter.prototype.setCrawlerMetainfo = function (data) {
        var _a;
        var data2 = _.clone(Array.isArray(data) ? { data: data } : data);
        var crawlerId = data2.crawler && data2.crawler.id;
        delete data2.crawler;
        return __assign({ crawler: __assign(__assign({}, data.crawler), (_a = { id: crawlerId || Utils_1.default.getMainFilenameBase() }, _a['crawl-e'] = {
                version: packageInfo.version
            }, _a)) }, data2);
    };
    /**
     * Saves to the data to a json file.
     * @param data output data to save
     * @param context
     * @param callback
     */
    JsonFileWriter.prototype.saveFile = function (data, context, callback) {
        var _this = this;
        MethodCallLogger_1.default.logMethodCall();
        callback = context.trackCallstackAsync(callback);
        async.waterfall([
            function (cb) { return _this.ensureOutDir(cb); },
            // save file
            function (cb) {
                data = _this.setCrawlerMetainfo(data);
                var json = JSON.stringify(data, null, 2);
                var fileNameBuilder = _this.fileNameBuilder || _this.buildFilename;
                var fileName = fileNameBuilder(data, context).toLowerCase();
                var filePath = path.join(_this.outDirPath, fileName);
                _this.logger.info(colors.green('Saving file: ' + filePath));
                fs.writeFile(filePath, json, cb);
            }
        ], callback);
    };
    JsonFileWriter.prototype.buildFilename = function (data, context) {
        return data.crawler.id + '.json';
    };
    return JsonFileWriter;
}());
exports.JsonFileWriter = JsonFileWriter;

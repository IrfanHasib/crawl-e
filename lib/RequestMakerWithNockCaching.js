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
var RequestMaker_1 = require("./RequestMaker");
var path = require("path");
var fs = require("fs");
var nock = require("nock");
/**
 * A request make that add caching via the [nock](https://github.com/nock/nock) module to speed up the crawling execution time during development.
 *
 * ⚠️ Make sure to call the lifecycle functions `willStartCrawling()` and `didFinishCrawling()`.
 * @category RequestMaker
 */
var RequestMakerWithNockCaching = /** @class */ (function (_super) {
    __extends(RequestMakerWithNockCaching, _super);
    /**
     *
     * @param config
     * @param cacheDir name of the cache folder, will be created inside the current folder.
     * @param cacheFilename base name of the cache file, will be appended with `.nock.json`
     */
    function RequestMakerWithNockCaching(config, cacheDir, cacheFilename) {
        var _this = _super.call(this, config) || this;
        _this.cacheDir = cacheDir;
        _this.cacheFilename = cacheFilename;
        _this.nockFile = null;
        return _this;
    }
    /**
     * Must be called before making any requets.
     * Reads in the existing cache file if present or starts the nock records otherwise.
     */
    RequestMakerWithNockCaching.prototype.willStartCrawling = function () {
        this.nockFile = path.resolve() + '/' + this.cacheDir + '/' + this.nockFilename();
        if (fs.existsSync(this.nockFile)) {
            this.logger.info('Using cache requests from ', this.nockFile);
            nock.load(this.nockFile);
        }
        else {
            console.info('Start recording requests');
            nock.recorder.rec({
                dont_print: true,
                output_objects: true
            });
        }
    };
    /**
     * Must be called after the last request is made.
     * Writes all recorded requests to the configured cache file.
     */
    RequestMakerWithNockCaching.prototype.didFinishCrawling = function () {
        if (fs.existsSync(this.nockFile)) {
            return;
        }
        var nockObjects = nock.recorder.play();
        try {
            fs.mkdirSync(this.cacheDir);
        }
        catch (e) {
            if (e.code !== 'EEXIST') {
                throw e;
            }
        }
        fs.writeFileSync(this.nockFile, JSON.stringify(nockObjects, null, 2));
        this.logger.info('Saved recorded request: ' + this.nockFile);
    };
    RequestMakerWithNockCaching.prototype.nockFilename = function () {
        return this.cacheFilename + '.nock.json';
    };
    return RequestMakerWithNockCaching;
}(RequestMaker_1.DefaultRequestMaker));
exports.default = RequestMakerWithNockCaching;

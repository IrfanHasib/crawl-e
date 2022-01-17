import { DefaultRequestMaker, DefaultRequestMakerConfig } from './RequestMaker';
/**
 * A request make that add caching via the [nock](https://github.com/nock/nock) module to speed up the crawling execution time during development.
 *
 * ⚠️ Make sure to call the lifecycle functions `willStartCrawling()` and `didFinishCrawling()`.
 * @category RequestMaker
 */
declare class RequestMakerWithNockCaching extends DefaultRequestMaker {
    private cacheDir;
    private cacheFilename;
    nockFile: any;
    /**
     *
     * @param config
     * @param cacheDir name of the cache folder, will be created inside the current folder.
     * @param cacheFilename base name of the cache file, will be appended with `.nock.json`
     */
    constructor(config: DefaultRequestMakerConfig, cacheDir: string, cacheFilename: string);
    /**
     * Must be called before making any requets.
     * Reads in the existing cache file if present or starts the nock records otherwise.
     */
    willStartCrawling(): void;
    /**
     * Must be called after the last request is made.
     * Writes all recorded requests to the configured cache file.
     */
    didFinishCrawling(): void;
    private nockFilename;
}
export default RequestMakerWithNockCaching;

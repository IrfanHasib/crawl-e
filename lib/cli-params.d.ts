export interface CliParams {
    /**
     * Enables all Crawl-E framework related debug outputs. Same as calling with DEBUG=… when calling wihtout filter.
     */
    verbose?: any;
    /**
     * Limits all iteration of list to the given number. (e.g. limit crawling to only 1 cinema during development)
     */
    limit?: number;
    /**
     * Caches requests in a local files stored in the given [directory] or into `cache` to save requests and speed up development
     */
    cacheDir?: string;
}
declare const _default: CliParams;
export default _default;

import { Logger } from './Logger';
import { Callback } from './Types';
import Context from './Context';
declare namespace Utils {
    /**
     * Return a copy of the object, filtered to only keep keys which have non-null values.
     */
    function compactObj(obj: any): Pick<any, string | number | symbol>;
    /**
     * Checks if the given selector is addressing an html `a` tag.
     */
    function isLinkTagSelector(selector: any): boolean;
    /**
     * Maps a parsed language string into a ISO 639 code or `original version`.
     * @param languauge
     * @returns the ISO 639 code for the given language or `null` if not found
     */
    function mapLanguage(language: string): string | null;
    /**
     * Maps a parsed string of sub titles into an ISO 639 code array or `undetermined`.
     * @param subtitles
     */
    function mapSubtitles(subtitles: string): string[] | string | null;
    /**
     * Checks a text for matching language or original version info.
     * @param test
     * @returns the ISO 639 code for the given language, `'original version'` or `null` if not found
     */
    function matchLanguage(text: string): string | null;
    /**
     * Checks a text for matching subtiles info.
     * @param test
     * @returns the ISO 639 code for matched subtitles, `'undetermined'` or `null` if not found
     */
    function matchSubtitles(text: string): string | null;
    function parseLatlonFromGoogleMapsUrl(url: string): {
        lat: any;
        lon: any;
    };
    function parseLatlonFromBingMapsUrl(url: string): {
        lat: number;
        lon: number;
    };
    function parseLatlonFromAppleMapsUrl(url: string): {
        lat: number;
        lon: number;
    };
    /**
     * Parses latitude and longitude from a google, bing or apple maps url.
     * @param url an url string for either of the above listed maps services
     * @returns an location object or `null` if failed to parse the given url
     */
    function parseMapsUrl(url: string): {
        lat: number;
        lon: number;
    } | null;
    function resultsFlattenCallbackWrapper<T extends Array<any>>(callback: Callback<T>): Callback<T[]>;
    function retry(taskDescription: string, logger: Logger, task: any, callback: any): void;
    /**
     * When the `limit` CLI parameter is set, the given list will be sliced from beginning to the accordling maximum length.
     * Otherwise the list is returned in full length.
     * The purpose of limiting the list via CLI paramter is to cut down on execution time during development.
     * @param list An arbitrary list to limit in length.
     */
    function limitList<T>(list: T[]): T[];
    type MappingIterator<ListType, ResultType> = (item: ListType, context: Context, callback: Callback<ResultType>) => void;
    /**
     * The same as `mapLimit` but runs only a single async operation at a time.
     * @param list A collection to iterate over.
     * @param context The current / parent context to start from.
     * @param iterator An async function to apply to each item in list. The `iterator` should complete with the transformed item. Invoked with (`item`, `context`, `callback`), where `context` is a clone of the parent context, that is unique and only valid for each item in the list.
     * @param callback A callback which is called when all `iterator` functions have finished, or an error occurs. Results is an array of the transformed items from the lsit. Invoked with (err, results).
     */
    function mapSeries<ItemType, Result>(list: ItemType[], context: Context, iterator: MappingIterator<ItemType, Result>, callback: Callback<Result[]>): void;
    /**
     * Produces a new collection of values by mapping each value in `list` through the `iterator` function, by running a maximum of `limit` async operations at a time.
     * @param list A collection to iterate over.
     * @param limit The maximum number of async operations at a time
     * @param context The current / parent context to start from.
     * @param iterator An async function to apply to each item in list. The `iterator` should complete with the transformed item. Invoked with (`item`, `context`, `callback`), where `context` is a clone of the parent context, that is unique and only valid for each item in the list.
     * @param callback A callback which is called when all `iterator` functions have finished, or an error occurs. Results is an array of the transformed items from the lsit. Invoked with (err, results).
     */
    function mapLimit<ItemType, Result>(list: ItemType[], limit: number, context: Context, iterator: MappingIterator<ItemType, Result>, callback: Callback<Result[]>): void;
    /**
     * Transforms a HTML structure wrapping sections of a flat lists node's into boxes.
     * @param html
     * @param containerSelector jQuery selector for the container node(s) of the list
     * @param nodeSelector jQuery selector for the nodes to start a box at
     * @param boxTag full html tag snipped including attributes to wrap boxes in - e.g. `<div class="movie"></div>`
     * @returns changed HTML structure
     */
    function addBoxes(html: string, containerSelector: string, nodeSelector: string, boxTag: string): string;
    /**
     * Returns the filename inlcuding file extension of the javascript or typescript file that is executed to run the crawler.
     */
    function getMainFilename(): string;
    /**
     * Returns the filename excluding file extension of the javascript or typescript file that is executed to run the crawler.
     */
    function getMainFilenameBase(): string;
}
export default Utils;

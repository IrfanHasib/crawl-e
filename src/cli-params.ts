import * as program from 'commander'
import * as _ from 'underscore'
import Constants from './Constants';

export interface CliParams {
  /**
   * Enables all Crawl-E framework related debug outputs. Same as calling with DEBUG=… when calling wihtout filter.
   */
  verbose?: any

  /** 
   * Limits all iteration of list to the given number. (e.g. limit crawling to only 1 cinema during development) 
   */
  limit?: number
  
  /**
   * Caches requests in a local files stored in the given [directory] or into `cache` to save requests and speed up development
   */
  cacheDir?: string
}

program
  .option('-v, --verbose [filter]', `Enables all Crawl-E framework related debug outputs. Same as calling with DEBUG=${Constants.MAIN_DEBUG_PREFIX}* when calling wihtout filter. Filter translates into DEBUG=${Constants.MAIN_DEBUG_PREFIX}*filter* and may also be a comma separted list.`)
  .option('-l, --limit <n>', 'Limits all iteration of list to the given number. (e.g. limit crawling to only 1 cinema during development)', parseInt)  
  .option('-c, --cache-dir [directory]', 'Caches requests in a local files stored in the given [directory] or into `cache` to save requests and speed up development')
  .allowUnknownOption()
  .parse(process.argv)


if (program.verbose) {
  if (program.verbose === true) {
    process.env.DEBUG = _.compact([process.env.DEBUG, Constants.MAIN_DEBUG_PREFIX + '*']).join(',')
  } else {
    process.env.DEBUG = _.chain([process.env.DEBUG]).union(program.verbose.split(',').map(f => `${Constants.MAIN_DEBUG_PREFIX}*${f.trim()}*`)).compact().join(',').value()    
  }
}

if (program.cacheDir === true) { program.cacheDir = 'cache' }

export default program as CliParams

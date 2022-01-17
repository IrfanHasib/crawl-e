import { DefaultRequestMaker, DefaultRequestMakerConfig } from './RequestMaker';
import * as path from 'path'
import * as fs from 'fs'
import * as nock from 'nock'

/**
 * A request make that add caching via the [nock](https://github.com/nock/nock) module to speed up the crawling execution time during development. 
 * 
 * ⚠️ Make sure to call the lifecycle functions `willStartCrawling()` and `didFinishCrawling()`. 
 * @category RequestMaker
 */
class RequestMakerWithNockCaching extends DefaultRequestMaker {
  nockFile: any = null

  /**
   * 
   * @param config 
   * @param cacheDir name of the cache folder, will be created inside the current folder. 
   * @param cacheFilename base name of the cache file, will be appended with `.nock.json`
   */
  constructor(config: DefaultRequestMakerConfig, private cacheDir: string, private cacheFilename: string) {
    super(config)
  }

  /**
   * Must be called before making any requets. 
   * Reads in the existing cache file if present or starts the nock records otherwise. 
   */
  willStartCrawling() {
    this.nockFile = path.resolve() + '/' + this.cacheDir + '/' + this.nockFilename()
    if (fs.existsSync(this.nockFile)) {
      this.logger.info('Using cache requests from ', this.nockFile)
      nock.load(this.nockFile)
    } else {
      console.info('Start recording requests')
      nock.recorder.rec({
        dont_print: true,
        output_objects: true
      })
    }
  }

  /**
   * Must be called after the last request is made. 
   * Writes all recorded requests to the configured cache file. 
   */
  didFinishCrawling() {
    if (fs.existsSync(this.nockFile)) {
      return
    }

    var nockObjects = nock.recorder.play()
    try {
      fs.mkdirSync(this.cacheDir)
    } catch (e) {
      if (e.code !== 'EEXIST') { throw e }
    }
    fs.writeFileSync(this.nockFile, JSON.stringify(nockObjects, null, 2))
    this.logger.info('Saved recorded request: ' + this.nockFile)
  }

  private nockFilename() {
    return this.cacheFilename + '.nock.json'
  }
}

export default RequestMakerWithNockCaching

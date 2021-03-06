import * as _ from 'underscore'
import * as path from 'path'
import * as fs from 'fs'
import * as async from 'async'
import * as colors from 'colors'

import Logger, { SilentLogger } from './Logger'
import MethodCallLogger from './MethodCallLogger'
import Context from './Context'
import { OutputData } from './models'
import Utils from './Utils'

/** @private */
const packageInfo = require('./../package.json')

type FileNameBuilder = (data: any, context: Context) => string

/**
 * Saves the output data to JSON Files. 
 */
export class JsonFileWriter {
  private outDirPath: string

  /**
   * Creates are new JsonFileWriter. 
   * @param outDir The path to the directory, relative to executed script, defaults to  `'output'`
   * @param logger An optional logger, which will log 'Saving file + path' in green color. 
   * @param fileNameBuilder A custom callback for building the filename, which will be called during `saveFile()` - allows to implement dynamic filenames. 
   */
  constructor(outDir: string = 'output', public logger: Logger = new SilentLogger(), private fileNameBuilder?: FileNameBuilder) {
    this.outDirPath = path.join(path.resolve(), outDir)
  }

  /**
   * Ensures that the output directory exists. Attempts to create it if lacking.
   */
  ensureOutDir (callback) {
    fs.exists(this.outDirPath, exists => {
      if (!exists) {
        fs.mkdir(this.outDirPath, (callback))
      } else {
        callback()
      }
    })
  }

  setCrawlerMetainfo(data: OutputData): OutputData {
    let data2: OutputData = _.clone(Array.isArray(data) ? { data } : data) as any
    let crawlerId = data2.crawler && data2.crawler.id
    delete data2.crawler
    return {
      crawler: {
        ...data.crawler,
        id: crawlerId || Utils.getMainFilenameBase(),
        ['crawl-e']: {
          version: packageInfo.version
        },
      },
      ...data2
    }
  }

  /**
   * Saves to the data to a json file. 
   * @param data output data to save
   * @param context 
   * @param callback 
   */
  saveFile(data: OutputData, context: Context, callback) {
    MethodCallLogger.logMethodCall()
    callback = context.trackCallstackAsync(callback)
    async.waterfall([
      cb => this.ensureOutDir(cb),
      // save file
      cb => {
        data = this.setCrawlerMetainfo(data)
        let json = JSON.stringify(data, null, 2)
        let fileNameBuilder = this.fileNameBuilder || this.buildFilename
        let fileName = fileNameBuilder(data, context).toLowerCase()
        const filePath = path.join(this.outDirPath, fileName)
        this.logger.info(colors.green('Saving file: ' + filePath))
        fs.writeFile(filePath, json, cb)
      }
    ], callback)
  }
  
  protected buildFilename(data: OutputData, context: Context): string {
    return data.crawler.id + '.json'  
  }
}


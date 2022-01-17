
import CrawlE from './CrawlE'
import Context from './Context'
export * from './Context'
import Utils from './Utils'
import { DatesParsing } from './parsers/DatesParsing'
(Utils as any).parseDates = DatesParsing.parseDates
import cliParams, { CliParams } from './cli-params'


export * from './JsonFileWriter'

import { Logger, DefaultLogger } from './Logger'
import { BaseHtmlParser } from './ResponseParsers'
import ValueGrabber from './ValueGrabber'
import { RequestMaker, DefaultRequestMaker, CachedRequestMaker, RequestCallback, RequestObject } from './RequestMaker'
import { DefaultContext } from './Context'
import { JsonFileWriter } from './JsonFileWriter'
import RequestMakerWithNockCaching from './RequestMakerWithNockCaching'


export * from './parsers'

export {
  // interfaces & types
  Context,
  CliParams,
  Logger,
  RequestMaker,
  RequestObject,
  RequestCallback,
  // implementation
  cliParams,
  BaseHtmlParser,
  DefaultLogger,
  DefaultRequestMaker,
  CachedRequestMaker,
  RequestMakerWithNockCaching,
  Utils,
  ValueGrabber
}

[  
  BaseHtmlParser, 
  DefaultLogger, 
  DefaultContext, 
  DefaultRequestMaker,
  CachedRequestMaker, 
  RequestMakerWithNockCaching,
  JsonFileWriter,
  ValueGrabber
].forEach(e => CrawlE[e.name] = e)

//@ts-ignore 
CrawlE.Utils = Utils

//@ts-ignore
CrawlE.cliParams = cliParams

module.exports = CrawlE



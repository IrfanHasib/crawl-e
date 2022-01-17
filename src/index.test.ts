import { expect } from 'chai'


import * as index from './index'

import { DefaultLogger } from './Logger'
import { BaseHtmlParser } from './ResponseParsers'
import ValueGrabber from './ValueGrabber'
import { DefaultRequestMaker, CachedRequestMaker } from './RequestMaker'
import CrawlE from './CrawlE'
import { DefaultContext } from './Context'
import { JsonFileWriter } from './JsonFileWriter'
import Utils from './Utils'
import RequestMakerWithNockCaching from './RequestMakerWithNockCaching'
import cliParams from './cli-params'

describe('index', () => {
  it('exports CrawlE', () => expect(index).to.equal(CrawlE))
  it('exports BaseHtmlParser', () => expect(index.BaseHtmlParser).to.equal(BaseHtmlParser))
  it('exports CachedRequestMaker', () => expect(index.CachedRequestMaker).to.equal(CachedRequestMaker))
  it('exports DefaultContext', () => expect(index.DefaultContext).to.equal(DefaultContext))
  it('exports RequestMakerWithNockCaching', () => expect(index.RequestMakerWithNockCaching).to.equal(RequestMakerWithNockCaching))
  it('exports DefaultLogger', () => expect(index.DefaultLogger).to.equal(DefaultLogger))
  it('exports DefaultRequestMaker', () => expect(index.DefaultRequestMaker).to.equal(DefaultRequestMaker))
  it('exports JsonFileWriter', () => expect(index.JsonFileWriter).to.equal(JsonFileWriter))
  it('exports ValueGrabber', () => expect(index.ValueGrabber).to.equal(ValueGrabber))
  it('exports CrawE.Utils.mapLanguage', () => expect(index.Utils.mapLanguage).to.equal(Utils.mapLanguage))
  describe('exporting of cliParams', () => {
    it('exports CrawE.cliParams', () => expect(index.cliParams).to.equal(cliParams))
    it('CrawE.cliParams.limit defauts to undefined', () => expect(index.cliParams.limit).to.be.undefined)
    it('CrawE.cliParams.cacheDir defauts to undefined', () => expect(index.cliParams.cacheDir).to.be.undefined)
  })
})
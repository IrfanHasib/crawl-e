import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import * as pretty from 'pretty'

import Utils from './Utils'
import Context from './Context'
import { TestContext } from '../tests/helpers/TestContext'

const prettyFormatHtml = (html) => pretty(html.replace(/\s/g, ''))

describe('Utils', () => {

  describe('#isLinkTagSelector', () => {
    context('nullably values', () => {
      [null, undefined].forEach((input) => {
        it(`returns false for ${input}`, () => expect(Utils.isLinkTagSelector(input)).to.equal(false))
      })
    })

    context('positive cases', () => {
      [
        '.col-2 a',
        'a.link2',
        '> a',
        '.sesList .horiList li a',
        'tr.tableBack:nth-of-type(1) td a',
        '.TheatreFinder-links a:nth-of-type(2)',
        '.btn[href*="google.com/maps"]',
        '[href="http://google.com/maps"]'
      ].forEach((input) => {
        it(`returns true for '${input}'`, () => expect(Utils.isLinkTagSelector(input)).to.equal(true))
      })
    })

    context('negative cases', () => {
      [
        '',
        'td:nth-of-type(1) p:nth-of-type(1)',
        '.horarios',
        '.btn[title="Hello"]'
      ].forEach((input) => {
        it(`returns false for '${input}'`, () => expect(Utils.isLinkTagSelector(input)).to.equal(false))
      })
    })
  })

  describe('#mapLimit', () => {
    it('calls the iterator with a cloned context for each item', (done) => {
      const array = [0, 1]
      const parentContext = new TestContext()
      const itemContexts: Context[] = []
      Utils.mapLimit(array, 10, parentContext, (item, context, cb) => {
        itemContexts.push(context)
        cb(null)
      }, (err) => {
        if(err) return done(err)
        expect(itemContexts[0]).to.not.equal(itemContexts[1])
        expect(itemContexts[0].parentContext).to.equal(parentContext)
        expect(itemContexts[1].parentContext).to.equal(parentContext)
        done()
      })
    })
  })
  
  context('language mappings', () => {
    describe('#mapLanguage', () => {
      let tests = [
        { input: 'en', lang: 'en' },
        { input: 'englisch', lang: 'en' },        
        { input: 'da', lang: 'da' },
        { input: 'deutsch', lang: 'de' },
        { input: 'Deutsch', lang: 'de' },
        { input: 'DE', lang: 'de' },
        { input: 'dt.', lang: 'de' },
        { input: 'German', lang: 'de' },
        { input: 'Foobar', lang: null },
        { input: 'Arabic', lang: 'ar' },
        { input: 'OmU', lang: 'original version' },
        { input: '(omu)', lang: 'original version' },
        { input: 'OmeU', lang: 'original version' },
      ]
      
      tests.forEach(test => {
        it(`returns ${test.lang} for '${test.input}'`, () => {
          if (test.lang === null) {
            expect(Utils.mapLanguage(test.input)).to.be.null
          } else {
            expect(Utils.mapLanguage(test.input)).to.equal(test.lang)
          }
        })
      })
    })
    
    describe('#mapSubtitles', () => {
      let tests = [
        { input: 'deutsch', res: ['de'] },
        { input: 'DE', res: ['de'] },
        { input: 'German', res: ['de'] },
        { input: 'Foobar', res: null },
        { input: 'OmU', res: 'undetermined' },
        { input: '(omu)', res: 'undetermined' },
        { input: 'OmeU', res: ['en'] },
      ]
      
      tests.forEach(test => {
        it(`returns ${test.res} for '${test.input}'`, () => {
          if (test.res === null) {
            expect(Utils.mapSubtitles(test.input)).to.be.null
          } else {
            expect(Utils.mapSubtitles(test.input)).to.deep.equal(test.res)
          }
        })
      })
    })
  })


  context('language matching', () => {
    function runTests(matcher, tests) {
      tests.forEach(t => {
        it(t.input, () => {
          expect(matcher(t.input)).to.equal(t.lang)
        })
      })
    }

    describe('#matchLanguage', () => {
      describe('given null', () => { 
        it('it returns null', () => {
          expect(Utils.matchLanguage(null)).to.be.null
        })
      })

      describe('given one language it should match it', () => {
        runTests(Utils.matchLanguage, [
          { input: 'Scary Foovie (fr)', lang: 'fr' },
          { input: 'Scary Foovie in englisch', lang: 'en' }
        ])
      }) 
      
      describe('given no lang but ov indicators it should match ov', () => {
        runTests(Utils.matchLanguage, [
          { input: 'Scary Foovie OmU', lang: 'original version' },
          { input: 'Scary Foovie (OV)', lang: 'original version' },
        ])
      })

      describe('given two langauge it should not match at all', () => {
        runTests(Utils.matchLanguage, [
          { input: 'Scary Foovie engl. & frz.', lang: null },
        ])
      })

      describe('given one langauge and ov indicator it should match the language', () => {
        runTests(Utils.matchLanguage, [
          { input: 'LAZZARO FELICE (Gl??cklich wie Lazzaro) / ital. O.m.U.', lang: 'it' },
          { input: 'JUSQU????? LA GARDE (Nach dem Urteil) / frz. O.m.U..', lang: 'fr' }
        ])
      })
    })

    describe('#matchSubtitles', () => {
      describe('given null', () => {
        it('it returns null', () => {
          expect(Utils.matchSubtitles(null)).to.be.null
        })
      })

      describe('given only language(s) it should NOT match', () => {
        runTests(Utils.matchSubtitles, [
          { input: 'Scary Foovie (fr)', lang: null },
          { input: 'Scary Foovie in englisch', lang: null },
          { input: 'Scary Foovie engl. & frz.', lang: null },
        ])
      })

      describe('given no lang but ov indicators it should match ov\'s subtitles', () => {
        runTests(Utils.matchSubtitles, [
          { input: 'Scary Foovie OmU', lang: 'undetermined' },
          { input: 'Scary Foovie (OV)', lang: null },
        ])
      })

      describe('given one langauge and ov indicator it should match the ov\'s subtitles', () => {
        runTests(Utils.matchSubtitles, [
          { input: 'LAZZARO FELICE (Gl??cklich wie Lazzaro) / ital. O.m.U.', lang: 'undetermined' },
          { input: 'JUSQU????? LA GARDE (Nach dem Urteil) / frz. O.m.U..', lang: 'undetermined' }
        ])
      })
    })

  })

  context('location parsing', () => {
    describe('#parseLatlonFromGoogleMapsUrl', function () {
      var testValues = [
        { 
          testInput: null, 
          expectedOutput: null
        },
        {
          testInput: 'https://maps.google.com/maps?&amp;z=10&amp;q=48.2104349+16.3705994&amp;ll=48.2104349+16.3705994',
          expectedOutput: { lat: 48.2104349, lon: 16.3705994 }
        },
        {
          testInput: 'https://maps.google.com/maps?&z=10&q=48.2104349+16.3705994&ll=48.2104349+16.3705994',
          expectedOutput: { lat: 48.2104349, lon: 16.3705994 }
        },
        {
          testInput: 'http://maps.google.de/maps?f=q&amp;source=s_q&amp;hl=de&amp;geocode=&amp;q=Rex+Kino+5610+Wohlen+AG,+schweiz&amp;aq=&amp;sll=47.350256,8.271781&amp;sspn=0.012314,0.021758&amp;gl=de&amp;g=Alte+Bahnhofstrasse+1,+CH-5610+Wohlen,+Schweiz&amp;ie=UTF8&amp;hq=Rex+Kino+5610+Wohlen+AG,+schweiz&amp;hnear=&amp;radius=15000&amp;t=m&amp;ll=47.378592,8.272705&amp;spn=0.092993,0.11982&amp;z=12&amp;iwloc=A&amp;output=embed',
          expectedOutput: { lat: 47.378592, lon: 8.272705 }
        },
        {
          testInput: 'http://maps.google.com/maps?q=25.683,55.7816',
          expectedOutput: { lat: 25.683, lon: 55.7816 }
        },
        {
          testInput: 'https://maps.google.com?daddr=27.848336,-82.3488614',
          expectedOutput: { lat: 27.848336, lon: -82.3488614 }
        },
        {
          testInput: 'https://www.google.com/maps/place/301+Dannys+Dr,+Streator,+IL+61364/@41.1458795,-88.8410957,17z/data=!3m1!4b1!4m5!3m4!1s0x880bf9a4e91ffefd:0xa5aff2a67ea54b39!8m2!3d41.1458795!4d-88.838907',
          expectedOutput: { lat: 41.1458795, lon: -88.838907 }
        },
        {
          testInput: 'https://www.google.com/maps/place/13+Kelli+Dr,+Clinton,+IL+61727/@40.14834,-88.9819157,17z/data=!3m1!4b1!4m5!3m4!1s0x880b45827f9bbce1:0x8f7fea2c3d70f2bd!8m2!3d40.14834!4d-88.979727',
          expectedOutput: { lat: 40.14834, lon: -88.979727 }
        },
        {
          testInput: 'http://maps.google.com/maps?q=4425+La+Jolla+Village+Drive++San+Diego,+CA.+92122&hl=en&ll=32.871369,-117.216096&spn=0.020221,0.042272&sll=32.789006,-117.205925&sspn=0.161916,0.338173&hnear=La+Jolla+Village+Dr,+San+Diego,+California+92122&t=m&z=15',
          expectedOutput: { lat: 32.871369, lon: -117.216096 }
        },
        {
          testInput: 'http://maps.google.com/maps?z=8&t=m&q=loc:41.9476552+-88.0253639',
          expectedOutput: { lat: 41.9476552, lon: -88.0253639 }
        },
        {
          testInput: 'http://maps.google.com/maps?hl=en&amp;q=loc:36.078,+-119.036&amp;ie=UTF8&amp;hq=36.078,+-119.036&amp;z=15&amp;output=embed&amp;iwloc=&amp',
          expectedOutput: { lat: 36.078, lon: -119.036 }
        },
        {
          testInput: 'https://www.google.com/maps/place/3150+Talon+Dr,+Casper,+WY+82604/@42.8152676,-106.3637817,708m/data=!3m2!1e3!4b1!4m2!3m1!1s0x8760a4c6d21ac9d5:0xf4868625cbeacf51',
          expectedOutput: { lat: 42.8152676, lon: -106.3637817 }
        },
        {
          testInput: '//google.com/maps?daddr=49.8026,19.051352',
          expectedOutput: { lat: 49.8026, lon: 19.051352 }
        },
        {
          testInput: 'https://goo.gl/maps/iMZG6qvnUK32',
          expectedOutput: null
        },
        {
          testInput: 'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d12966.431755372816!2d139.70262!3d35.66203!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0xcfcb992b5feadaa1!2z44OS44Ol44O844Oe44Oz44OI44Op44K544OI44K344ON44Oe5riL6LC3!5e0!3m2!1sja!2sjp!4v1511173372595',
          expectedOutput: { lat: 35.66203, lon: 139.70262 }
        }
      ]

      testValues.forEach(function (testValue) {
        it('handles `' + testValue.testInput + '`', function () {
          expect(Utils.parseLatlonFromGoogleMapsUrl(testValue.testInput)).to.eql(testValue.expectedOutput)
        })
      })
    })

    describe('#parseLatlonFromBingMapsUrl', function () {
      var testValues = [{
        testInput: null,
        expectedOutput: null
      },
      {
        testInput: 'https://www.bing.com/maps?v=2&lvl=9&style=r&mode=D&rtop=0~0~0~&cp=40.5872046329~-75.5585015437&rtp=adr.~pos.40.5872046329_-75.5585015437_AMC+Tilghman+Square+8+4608+Broadway+ALLENTOWN+PA+18104-0000',
        expectedOutput: { lat: 40.5872046329, lon: -75.5585015437 }
      }]

      testValues.forEach(function (testValue) {
        it('handles `' + testValue.testInput + '`', function () {
          expect(Utils.parseLatlonFromBingMapsUrl(testValue.testInput)).to.eql(testValue.expectedOutput)
        })
      })
    })
  })

  describe('#addBoxes', () => {

    it('creates movie boxes from single container', () => {
      let testHtml = fs.readFileSync(path.join(path.resolve(), 'tests', 'data', 'showtimes_list_single_flat.html'), 'utf-8')
      let expectedHtml = fs.readFileSync(path.join(path.resolve(), 'tests', 'data', 'showtimes_list_single_boxed.html'), 'utf-8')
      let html = Utils.addBoxes(testHtml, '.showtimes', 'h2', '<div class="movie"></div>')
      expect(prettyFormatHtml(html)).to.equal(prettyFormatHtml(expectedHtml))
    })

    it('creates movie boxes from multiple containers', () => {
      let testHtml = fs.readFileSync(path.join(path.resolve(), 'tests', 'data', 'showtimes_list_multi_flat.html'), 'utf-8')
      let expectedHtml = fs.readFileSync(path.join(path.resolve(), 'tests', 'data', 'showtimes_list_multi_boxed.html'), 'utf-8')
      let html = Utils.addBoxes(testHtml, '.showtimes', 'h2', '<div class="movie"></div>')
      expect(prettyFormatHtml(html)).to.equal(prettyFormatHtml(expectedHtml))
    })
  }) 

})


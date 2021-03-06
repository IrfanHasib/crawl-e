import * as moment from 'moment'
import * as _ from 'underscore'
import { expect } from 'chai'
import { DatesParsing } from './DatesParsing'
import { TestLogger, withMomentNowMocked } from '../../tests/helpers'

describe('DatesParsing', () => {
  describe('#parseDates', () => {
    let logger: TestLogger
    
    context('individual date', () => {
      let dates 

      before(() => {
        logger = new TestLogger()
        dates = DatesParsing.parseDates('Sat 3/24 12:50 3:50 6:40 9:05', {
          dateFormat: 'M/DD'
        }, logger)
      })
      
      it('find one date', () => expect(dates).to.have.lengthOf(1))

      it('finds the correct date of 24.03', () => {
        expect(dates[0].toDate()).to.eql(moment('24.03', 'DD.MM').toDate())
      })

      it('debug logs given text', () => {
        expect(logger.logs.debugs).to.deep.include({ prefix: `dates:parsing`, msg: 'text: Sat 3/24 12:50 3:50 6:40 9:05' })
      })

      it('debug logs matching individual date', () => {
        expect(logger.logs.debugs).to.deep.include({ prefix: `dates:parsing`, msg: 'found individual: 3/24' })
      })
    })

    context('date range', () => {
      let dates

      before(() => {
        logger = new TestLogger()
        dates = DatesParsing.parseDates('Mon 3/26 - Wed 3/28 4:10 7:10', {
          dateFormat: 'M/DD', 
          rangeSeparator: '-'
        }, logger)
      })

      it('find 3 dates', () => expect(dates).to.have.lengthOf(3))

      it('finds dates from 26.03 to 28.03', () => {
        expect(dates[0].toDate()).to.eql(moment('26.03', 'DD.MM').toDate())
        expect(dates[1].toDate()).to.eql(moment('27.03', 'DD.MM').toDate())
        expect(dates[2].toDate()).to.eql(moment('28.03', 'DD.MM').toDate())
      })

      it('debug logs matching range', () => {
        expect(logger.logs.debugs).to.deep.include({ prefix: `dates:parsing`, msg: 'found range: 3/26 → 3/28' })
      })
    })

    context('date range 2', () => {
      let dates

      before(() => {
        logger = new TestLogger()
        dates = DatesParsing.parseDates('Do, 16.08.2018 bis Di, 21.08.2018, jeweils 20:00 Uhr:', {
          dateFormat: 'DD.MM.YYYY',
          rangeSeparator: 'bis'
        }, logger)
      })

      it('find 6 dates', () => expect(dates).to.have.lengthOf(6))

      it('finds dates from 16.08 to 21.08', () => {
        expect(dates[0].toDate()).to.eql(moment('16.08.2018', 'DD.MM.YYYY').toDate())
        expect(dates[1].toDate()).to.eql(moment('17.08.2018', 'DD.MM.YYYY').toDate())
        expect(dates[4].toDate()).to.eql(moment('20.08.2018', 'DD.MM.YYYY').toDate())
        expect(dates[5].toDate()).to.eql(moment('21.08.2018', 'DD.MM.YYYY').toDate())
      })

      it('debug logs matching range', () => {
        expect(logger.logs.debugs).to.deep.include({ prefix: `dates:parsing`, msg: 'found range: 16.08.2018 → 21.08.2018' })
      })
    })

    context('date range 3', () => {
      let dates
      withMomentNowMocked(new Date('2019-01-01'))

      before(() => {
        logger = new TestLogger()

        let allEnglishWeekday = _.range(7).map(i => moment().add(i, 'days').format('dddd'))
        let allEnglishMonth = _.range(12).map(i => moment().add(i, 'months').format('MMMM'))
        let dateRegexPattern = `(${allEnglishWeekday.join('|')}) (${allEnglishMonth.join('|')}) \\d+\\D{2}`

        dates = DatesParsing.parseDates('Saturday March 30th to Thursday April 4th at 7:30PM', {
          dateFormat: 'dddd MMMM Do',
          rangeSeparator: 'to',
          dateRegexPattern: dateRegexPattern
        }, logger)
      })

      it('finds 6 dates', () => {
        expect(dates).to.have.length(6)
      })

      it('finds dates from 30.03 to 04.04', () => {
        expect(dates[0].format('YYYY-MM-DD')).to.eql('2019-03-30')
        expect(dates[1].format('YYYY-MM-DD')).to.eql('2019-03-31')
        expect(dates[4].format('YYYY-MM-DD')).to.eql('2019-04-03')
        expect(dates[5].format('YYYY-MM-DD')).to.eql('2019-04-04')
      })
    })

    context('date range 4', () => {
      let dates
      withMomentNowMocked(new Date('2019-01-01'))

      before(() => {
        logger = new TestLogger()

        dates = DatesParsing.parseDates('September.06 – September.12', {
          dateFormat: 'MMMM.DD',
          rangeSeparator: ' – '
        }, logger)
      })

      it('finds 7 dates', () => {
        expect(dates).to.have.length(7)
      })

      it('finds dates from 06.09 to 12.09', () => {
        expect(dates[0].format('YYYY-MM-DD')).to.eql('2019-09-06')
        expect(dates[1].format('YYYY-MM-DD')).to.eql('2019-09-07')
        expect(dates[5].format('YYYY-MM-DD')).to.eql('2019-09-11')
        expect(dates[6].format('YYYY-MM-DD')).to.eql('2019-09-12')
      })
    })


    context('two compound dates', () => {
      let dates

      before(() => {
        logger = new TestLogger()
        dates = DatesParsing.parseDates('Mon 3/26 & Tue 3/27', {
          dateFormat: 'M/DD',
          compoundSeparator: '&'
        }, logger)
      })

      it('find 2 dates', () => expect(dates).to.have.lengthOf(2))

      it('finds dates of 26.03 and 27.03', () => {
        expect(dates[0].toDate()).to.eql(moment('26.03', 'DD.MM').toDate())
        expect(dates[1].toDate()).to.eql(moment('27.03', 'DD.MM').toDate())
      })

      it('debug logs matching of compound dates', () => {
        expect(logger.logs.debugs).to.deep.include({ prefix: `dates:parsing`, msg: 'found compound: 3/26 & 3/27' })
      })
    })

    context('three compound dates', () => {
      let dates
      

      before(() => {
        logger = new TestLogger()
        dates = DatesParsing.parseDates('Mon 3/26, Tue 3/27 & Wed 3/28', {
          dateFormat: 'M/DD',
          compoundSeparator: '[&|,]'
        }, logger)
      })

      it('find 3 dates', () => expect(dates).to.have.lengthOf(3))

      it('finds dates from 26.03 to 28.03', () => {
        expect(dates[0].toDate()).to.eql(moment('26.03', 'DD.MM').toDate())
        expect(dates[1].toDate()).to.eql(moment('27.03', 'DD.MM').toDate())
        expect(dates[2].toDate()).to.eql(moment('28.03', 'DD.MM').toDate())
      })

      it('debug logs matching of compound dates', () => {
        expect(logger.logs.debugs).to.deep.include({ prefix: `dates:parsing`, msg: 'found compound: 3/26 & 3/27 & 3/28' })
      })
    })

  })
})
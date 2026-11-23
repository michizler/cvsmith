import { describe, expect, it } from 'vitest'
import { splitPoints } from './points'

describe('splitPoints', () => {
  it('splits LinkedIn flattened bullets with uneven spacing', () => {
    const text = '• Built a pipeline in Python.  • Cut report time by 40%. ● Led a team of 5 •Trained staff'
    expect(splitPoints(text)).toEqual([
      'Built a pipeline in Python.',
      'Cut report time by 40%.',
      'Led a team of 5',
      'Trained staff',
    ])
  })

  it('keeps an intro sentence before the first bullet', () => {
    expect(splitPoints('Data team lead. • Hired two analysts')).toEqual([
      'Data team lead.',
      'Hired two analysts',
    ])
  })

  it('splits on line breaks and strips typed bullets at line start only', () => {
    expect(splitPoints('- Ran A/B tests\n* Wrote the year-end report\n')).toEqual([
      'Ran A/B tests',
      'Wrote the year-end report',
    ])
  })

  it('leaves a paragraph with no bullets as one point', () => {
    expect(splitPoints('Worked across finance and ops, part-time.')).toEqual([
      'Worked across finance and ops, part-time.',
    ])
  })

  it('drops empty and punctuation only pieces', () => {
    expect(splitPoints(' •  • . • ')).toEqual([])
  })
})

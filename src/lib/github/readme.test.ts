import { describe, expect, it } from 'vitest'
import { readmePoints } from './readme'

describe('readmePoints', () => {
  it('keeps prose and list items and drops everything else', () => {
    const md = [
      '# Waiting list model',
      '[![CI](https://img.shields.io/ci.svg)](https://ci.example) ![logo](logo.png)',
      '',
      'Forecasts NHS waiting lists using **LightGBM** and',
      'a [FastAPI](https://fastapi.tiangolo.com) backend.',
      '',
      '## Features',
      '- Trains on `raw_data` from 2019 onwards',
      '- [x] Deployed to Fly.io with Docker',
      '  and a nightly retrain',
      '1. Explains forecasts with SHAP values',
      '',
      '```bash',
      'pip install -r requirements.txt',
      'echo this is not a claim at all',
      '```',
      '',
      '| Model | MAE |',
      '|-------|-----|',
      '| LGBM  | 4.2 |',
      '',
      '<!-- a comment with words in it -->',
      '<details><summary>More</summary>hidden words here too</details>',
      '> Quoted note about the data source',
      '',
      '---',
      'MIT',
      '[docs]: https://docs.example',
    ].join('\n')

    expect(readmePoints(md)).toEqual([
      'Forecasts NHS waiting lists using LightGBM and a FastAPI backend.',
      'Trains on raw_data from 2019 onwards',
      'Deployed to Fly.io with Docker and a nightly retrain',
      'Explains forecasts with SHAP values',
      'Quoted note about the data source',
    ])
  })

  it('skips how-to sections but keeps what the project does', () => {
    const md = [
      'Project',
      '=======',
      'Forecasts demand for hospital beds every week.',
      '## Installation',
      'You need Node 22.12 or newer.',
      '### Windows notes',
      'Run the installer as an administrator first.',
      '## Deployment',
      '- Deployed to Fly.io with Docker',
      '',
      'Getting Started',
      '---------------',
      'Clone the repo and run the script.',
      '## Results',
      '- Cut forecast error by 18 percent',
      '## Licence',
      'MIT licence, see the LICENSE file.',
    ].join('\n')
    expect(readmePoints(md)).toEqual([
      'Forecasts demand for hospital beds every week.',
      'Deployed to Fly.io with Docker',
      'Cut forecast error by 18 percent',
    ])
  })

  it('leaves snake_case and file names alone', () => {
    expect(readmePoints('Reads my_input_file.csv and writes to out_dir every night.')).toEqual([
      'Reads my_input_file.csv and writes to out_dir every night.',
    ])
  })

  it('handles Windows line endings and caps the number of points', () => {
    const md = Array.from({ length: 50 }, (_, i) => `- Point number ${i} here`).join('\r\n')
    const points = readmePoints(md)
    expect(points).toHaveLength(30)
    expect(points[0]).toBe('Point number 0 here')
  })

  it('returns nothing for a README with no prose', () => {
    expect(readmePoints('# Title\n\n```\ncode\n```\n')).toEqual([])
  })
})

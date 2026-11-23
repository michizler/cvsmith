// Loads pdfjs in the browser. This module is only ever imported dynamically,
// so pdfjs and its worker, about 1.8 MB together, are downloaded only by
// people who pick a PDF.

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ExportError, type ImportOptions, type ImportResult } from '../import'
import { extractLines } from './lines'
import { parseProfileLines } from './parse'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function readLinkedInPdf(bytes: Uint8Array, options: ImportOptions = {}): Promise<ImportResult> {
  let lines
  try {
    lines = await extractLines(bytes, pdfjs)
  } catch (e) {
    const password = e instanceof Error && e.name === 'PasswordException'
    throw new ExportError(
      password
        ? 'This PDF is password protected. Save your profile to PDF again from LinkedIn and upload that copy.'
        : 'This PDF could not be read. It may be damaged. Save your profile to PDF again, or use the data export zip.',
    )
  }
  return parseProfileLines(lines, options)
}

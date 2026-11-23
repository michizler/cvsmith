// One way in for either LinkedIn file. The file's first bytes decide which
// reader runs, not its name, since downloads get renamed.

import { ExportError, readLinkedInExport, type ImportOptions, type ImportResult } from './import'

// Profile PDFs are well under a megabyte. Anything far bigger is not one.
const MAX_PDF_BYTES = 20 * 1024 * 1024

export async function readLinkedInFile(bytes: Uint8Array, options: ImportOptions = {}): Promise<ImportResult> {
  const head = String.fromCharCode(...bytes.subarray(0, 5))
  if (head.startsWith('%PDF')) {
    if (bytes.length > MAX_PDF_BYTES) {
      throw new ExportError('This PDF is far too large to be a LinkedIn profile. Please check you picked the right file.')
    }
    const { readLinkedInPdf } = await import('./pdf/browser')
    return readLinkedInPdf(bytes, options)
  }
  return readLinkedInExport(bytes, options)
}

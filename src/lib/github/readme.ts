// Turns a README into the separate points a CV line can cite.
//
// READMEs are written for people browsing GitHub, so they are full of
// badges, install commands, code and tables. None of that is a claim about
// the author's work. What is left after stripping it is the prose and the
// list items, and each of those becomes one point.

// Enough to cover what a project does and how it was built. The user hides
// whatever is not useful.
const MAX_POINTS = 30

// A point needs at least this many words to be a claim. Shorter lines are
// usually leftovers such as "MIT" or "Demo".
const MIN_WORDS = 3

// Sections that tell a reader how to use the project rather than what the
// author did. "You need Node 22" or "MIT, see LICENSE" are not things to put
// on a CV. Deployment is deliberately not here, since "Deployed to Fly.io
// with Docker" is exactly the kind of claim a CV wants.
const SKIP_SECTIONS =
  /^(table of )?contents$|install|set ?up\b|getting started|quick ?start|prerequisites|requirements|run(ning)? (it )?locally|how to (run|use)|^usage|^running|^commands|^scripts|^development$|licen[cs]e|contribut|acknowledg|credits|^authors?$|^contact|^support|^faq/i

function stripInline(line: string): string {
  return (
    line
      // Images, including badges wrapped in links.
      .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // Links keep their text.
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Bold and italic markers, but not underscores inside snake_case words.
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,!?:;]|$)/g, '$1$2')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

export function readmePoints(markdown: string): string[] {
  const text = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Fenced code blocks, with either fence style.
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/<(pre|code|table|details|picture|svg)[\s\S]*?<\/\1>/gi, '')

  const points: string[] = []
  let current: string[] = []
  // While inside a section like "Installation", nothing is kept until a
  // heading at the same level or higher ends it.
  let skipBelow: number | null = null

  const flush = () => {
    const point = stripInline(current.join(' '))
    current = []
    if (skipBelow !== null) return
    if (point.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= MIN_WORDS) points.push(point)
  }

  const heading = (level: number, title: string) => {
    current = []
    if (skipBelow !== null && level > skipBelow) return
    skipBelow = SKIP_SECTIONS.test(stripInline(title)) ? level : null
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const listItem = /^([-*+]|\d+[.)])\s+(.*)$/.exec(trimmed)
    const atx = /^(#{1,6})\s+(.*?)\s*#*$/.exec(trimmed)

    if (atx) {
      flush()
      heading(atx[1]!.length, atx[2]!)
      continue
    }

    // A line underlined with === or --- is a heading too, if it stands alone.
    if (/^=+$|^-+$/.test(trimmed) && current.length === 1) {
      heading(trimmed.startsWith('=') ? 1 : 2, current[0]!)
      continue
    }

    if (
      trimmed === '' ||
      /^=+$|^-+$/.test(trimmed) ||
      /^([-*_]\s*){3,}$/.test(trimmed) ||
      trimmed.startsWith('|') ||
      /^\[[^\]]+\]:\s/.test(trimmed)
    ) {
      // Headings, rules, tables and link definitions all end the current
      // point and add nothing. Indented code is left alone on purpose,
      // because nested list items are indented the same way.
      flush()
      continue
    }

    if (listItem) {
      flush()
      // Task list boxes are not part of the claim.
      current.push(listItem[2]!.replace(/^\[[ xX]\]\s*/, ''))
    } else {
      current.push(trimmed.replace(/^>\s?/, ''))
    }
  }
  flush()

  return points.slice(0, MAX_POINTS)
}

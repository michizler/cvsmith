// Evidence ids for facts in a profile.
//
// Ids come from a fact's own text, not its row number. Importing a newer
// export keeps the id of everything that did not change, so a saved CV still
// points at the right facts. If a bullet is edited its id changes, which is
// what we want, because the old citation no longer holds.

// FNV-1a, 32 bit. Short and stable is all that is needed here. This is not
// for anything security related.
export function hashText(text: string): string {
  const s = text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(7, '0')
}

export class IdMaker {
  private readonly used = new Set<string>()

  // "position:1k2j3h4" for a top level fact.
  make(kind: string, ...parts: string[]): string {
    return this.claim(`${kind}:${hashText(parts.join('|'))}`)
  }

  // "position:1k2j3h4/0a9b8c7" for a point inside it.
  child(parentId: string, text: string): string {
    return this.claim(`${parentId}/${hashText(text)}`)
  }

  // The same text twice in one section (a skill listed twice, say) would
  // otherwise share an id. The suffix depends on order, but only for exact
  // duplicates, where it does not matter which copy is cited.
  private claim(base: string): string {
    let id = base
    for (let n = 2; this.used.has(id); n++) id = `${base}~${n}`
    this.used.add(id)
    return id
  }
}

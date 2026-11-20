// localStorage is not a given. Safari private windows have thrown on write,
// people block site data, and the quota runs out once a few CVs are cached.
// Everything goes through these helpers so the worst case is "nothing was
// saved", never a blank page.

const PREFIX = 'cvsmith:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    // Unreadable or hand-edited JSON is treated as missing. Better to start
    // fresh than to crash on someone's half-written profile.
    return fallback
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    // Callers get false so the UI can say "not saved in this browser"
    // instead of pretending.
    return false
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // Nothing useful to do. If storage is blocked there was nothing to remove.
  }
}

// Light / dark / follow the system. Saved in this browser only.
const KEY = 'aerosentry.appearance'

export function getAppearance() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

export function setAppearance(value) {
  try { localStorage.setItem(KEY, value) } catch { /* no storage */ }
  applyAppearance(value)
}

export function applyAppearance(value = getAppearance()) {
  const root = document.documentElement
  if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value)
  else root.removeAttribute('data-theme')
}

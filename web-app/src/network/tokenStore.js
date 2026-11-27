// Keeps the login token for this browser tab only (sessionStorage): closing the tab signs the person out.
// localStorage would keep it for ever, which is too long for a security system.
const KEY = 'aerosentry.accessToken'

export const tokenStore = {
  read() {
    try { return sessionStorage.getItem(KEY) } catch { return null }
  },
  save(token) {
    try { sessionStorage.setItem(KEY, token) } catch { /* private mode: the session just will not survive a reload */ }
  },
  delete() {
    try { sessionStorage.removeItem(KEY) } catch { /* nothing to delete */ }
  },
}

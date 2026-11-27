// Who is signed in and which property is selected. Every screen reads it with useSession().
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/authService'
import { propertyService } from '../services/propertyService'
import { tokenStore } from '../network/tokenStore'
import { SESSION_EXPIRED } from '../network/networkLayer'
import { startAlertLive, stopAlertLive } from '../network/alertLive'

const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)

const selectionKey = (userId) => `aerosentry.selectedProperty.${userId}`

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [properties, setProperties] = useState([])
  const [propertyId, setPropertyId] = useState(null)
  const [restoring, setRestoring] = useState(true)
  const [notice, setNotice] = useState(null)             // a message for the sign-in screen

  const loadProperties = useCallback(async (u, preferId) => {
    const list = await propertyService.list()
    setProperties(list)
    let chosen = preferId
    if (!chosen) { try { chosen = localStorage.getItem(selectionKey(u.id)) } catch { /* no storage */ } }
    const current = list.find((p) => p.id === chosen) || list[0] || null
    setPropertyId(current ? current.id : null)
    return list
  }, [])

  const start = useCallback(async (u) => {
    setUser(u)
    await loadProperties(u)
    startAlertLive()
  }, [loadProperties])

  const signOut = useCallback((message) => {
    stopAlertLive()
    tokenStore.delete()
    setUser(null)
    setProperties([])
    setPropertyId(null)
    setNotice(typeof message === 'string' ? message : null)
  }, [])

  // At start-up: a token left in this tab? Ask the server who it belongs to.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (tokenStore.read()) {
        try {
          const me = await authService.me()
          if (!cancelled) await start(me)
        } catch { tokenStore.delete() }
      }
      if (!cancelled) setRestoring(false)
    })()
    return () => { cancelled = true }
  }, [start])

  // The server refused our token (expired, or the account was suspended).
  useEffect(() => {
    const onExpired = () => { if (tokenStore.read()) signOut('Your session ended. Please sign in again.') }
    window.addEventListener(SESSION_EXPIRED, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired)
  }, [signOut])

  // role: 'Admin' | 'Guard'. The role picked on the sign-in screen must match the account (the same message as a
  // wrong password is shown otherwise, so nobody can learn that an account exists).
  const signIn = useCallback(async (email, password, role) => {
    const login = await authService.login(email.trim(), password)
    if (login.user.role !== role) {
      const error = new Error('Incorrect email or password. Check your details and try again.')
      error.status = 401
      throw error
    }
    tokenStore.save(login.accessToken)
    setNotice(null)
    await start(login.user)
    return login.user
  }, [start])

  const register = useCallback(async (fields) => {
    await authService.register(fields)
    return signIn(fields.email, fields.password, 'Admin')
  }, [signIn])

  const selectProperty = useCallback((id) => {
    setPropertyId(id)
    if (user) { try { localStorage.setItem(selectionKey(user.id), id) } catch { /* no storage */ } }
  }, [user])

  const reloadProperties = useCallback((preferId) => (user ? loadProperties(user, preferId) : Promise.resolve([])), [user, loadProperties])

  const property = properties.find((p) => p.id === propertyId) || null
  const value = useMemo(() => ({
    user, isAdmin: user?.role === 'Admin', properties, property, restoring, notice,
    signIn, register, signOut, selectProperty, reloadProperties,
  }), [user, properties, property, restoring, notice, signIn, register, signOut, selectProperty, reloadProperties])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// The live channel for alerts. The backend pushes "AlertRaised" and "AlertUpdated" over SignalR (a WebSocket).
// Screens do not read the pushed alert: they only hear "something changed" (a window event) and reload their list.
// A suspended guard's connection is closed by the server: then we ask /auth/me, which answers 401, and the network
// layer signs the person out.

import { HubConnectionBuilder, HttpTransportType, LogLevel } from '@microsoft/signalr'
import { API_URL } from '../config'
import { tokenStore } from './tokenStore'
import { authService } from '../services/authService'

export const ALERTS_CHANGED = 'aerosentry:alerts-changed'
export const ALERT_RAISED = 'aerosentry:alert-raised'

let connection = null
let wanted = false

// The state of the live connection, shown as the green "Live" light in the top bar.
export const LIVE_STATE = 'aerosentry:live-state'
let liveState = 'offline'
export const getLiveState = () => liveState
const setState = (next) => { liveState = next; window.dispatchEvent(new CustomEvent(LIVE_STATE, { detail: next })) }

const changed = () => window.dispatchEvent(new Event(ALERTS_CHANGED))

export function startAlertLive() {
  if (connection) return
  wanted = true
  setState('connecting')
  const hub = new HubConnectionBuilder()
    .withUrl(`${API_URL}/hubs/alerts`, {
      accessTokenFactory: () => tokenStore.read() || '',
      transport: HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 15000])
    .configureLogging(LogLevel.None)
    .build()

  hub.on('AlertRaised', (alert) => {
    window.dispatchEvent(new CustomEvent(ALERT_RAISED, { detail: alert }))
    changed()
  })
  hub.on('AlertUpdated', changed)
  hub.onreconnecting(() => setState('reconnecting'))
  hub.onreconnected(() => { setState('live'); changed() })      // catch up on what we missed
  hub.onclose(() => {
    connection = null
    setState('offline')
    // Closed for good (the server dropped us, or the token expired): is the session still valid?
    if (wanted && tokenStore.read()) authService.me().catch(() => {})
  })
  connection = hub
  hub.start().then(() => { setState('live'); changed() }).catch(() => { connection = null; setState('offline') })
}

export function stopAlertLive() {
  wanted = false
  const hub = connection
  connection = null
  setState('offline')
  hub?.stop().catch(() => {})
}

export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
}

// 10 -> "10", 3.5 -> "3.5"
export const meters = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

export const percent = (probability) => `${Math.round(probability * 100)}%`

// How an alert's status is shown. active = a guard still has to deal with it.
export function alertStatus(status) {
  switch (status) {
    case 'New': return { label: 'Person detected', tone: 'bad', active: true }
    case 'Acknowledged': return { label: 'Acknowledged', tone: 'warn', active: true }
    case 'Escalated': return { label: 'Escalated', tone: 'warn', active: false }
    case 'Closed': return { label: 'Resolved', tone: 'ok', active: false }
    case 'FalseAlarm': return { label: 'False alarm', tone: 'grey', active: false }
    case 'ConfirmedAuthorized': return { label: 'Authorized person', tone: 'ok', active: false }
    default: return { label: status, tone: 'grey', active: false }
  }
}

// What an entry of an alert's history says, in plain words.
export function actionSentence(a) {
  const what = {
    Acknowledge: 'acknowledged the alert',
    MarkFalseAlarm: 'marked it as a false alarm',
    Close: 'closed the incident',
    Escalate: 'escalated it to the authorities',
    ConfirmAuthorized: 'confirmed it is an authorized person',
  }[a.action] || a.action
  return `${a.byName} (${a.byRole}) ${what}${a.note ? `: ${a.note}` : ''}`
}

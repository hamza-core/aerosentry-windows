import { network } from '../network/networkLayer'

export const alertService = {
  // Newest first. Leave propertyId out for every property I can see.
  list: ({ propertyId, status, page = 1, pageSize = 100 } = {}) =>
    network.get('/alerts/list', { propertyId, status, page, pageSize }),
  get: (alertId) => network.get('/alerts/get', { alertId }),
  listActions: (alertId) => network.get('/alerts/list-actions', { alertId }),
  // action: acknowledge | mark-false-alarm | close | escalate | confirm-authorized. Returns the updated alert.
  act: (action, alertId, note) => network.post(`/alerts/${action}`, note ? { note } : {}, { alertId }),
  // The picture taken at the moment of the alarm: { blob }.
  snapshot: (alertId) => network.image('/alerts/get-snapshot', { alertId }),
}

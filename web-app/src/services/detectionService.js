import { network } from '../network/networkLayer'

// Starting and stopping the watching of a wall. While a wall is on, the ingest worker sends its camera pictures
// to the intrusion model and an intruder becomes an alert.
export const detectionService = {
  start: (propertyId, wallId, threshold) => network.post('/detection/start', undefined, { propertyId, wallId, threshold }),
  stop: (propertyId, wallId) => network.post('/detection/stop', undefined, { propertyId, wallId }),
  listEvents: (propertyId, wallId, page = 1, pageSize = 20) =>
    network.get('/detection/list-events', { propertyId, wallId, page, pageSize }),
  mlHealth: () => network.get('/ml/health'),
}

import { network } from '../network/networkLayer'

export const propertyService = {
  list: (search) => network.get('/properties/list', { search }),
  get: (propertyId) => network.get('/properties/get', { propertyId }),
  create: (property) => network.post('/properties/create', property),
  update: (propertyId, property) => network.put('/properties/update', property, { propertyId }),
  remove: (propertyId) => network.delete('/properties/delete', { propertyId }),
  listGuards: (propertyId) => network.get('/properties/list-guards', { propertyId }),
  assignGuard: (propertyId, guardId) => network.put('/properties/assign-guard', undefined, { propertyId, guardId }),
  unassignGuard: (propertyId, guardId) => network.delete('/properties/unassign-guard', { propertyId, guardId }),
}

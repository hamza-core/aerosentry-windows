import { network } from '../network/networkLayer'

export const cameraService = {
  list: (propertyId) => network.get('/cameras/list', { propertyId }),
  create: (propertyId, camera) => network.post('/cameras/create', camera, { propertyId }),
  update: (propertyId, cameraId, camera) => network.put('/cameras/update', camera, { propertyId, cameraId }),
  remove: (propertyId, cameraId) => network.delete('/cameras/delete', { propertyId, cameraId }),
  // Can the SERVER reach this host and port? Nothing is saved.
  testConnection: (propertyId, camera) => network.post('/cameras/test-connection', camera, { propertyId }),
  // One still picture to draw the wall on: { blob, width, height }.
  snapshot: (propertyId, cameraId) => network.image('/cameras/get-snapshot', { propertyId, cameraId }),
}

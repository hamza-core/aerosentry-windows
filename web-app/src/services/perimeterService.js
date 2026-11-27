import { network } from '../network/networkLayer'

// Laser grids and walls. Ids always go in the query string.
export const perimeterService = {
  listGrids: (propertyId) => network.get('/laser-grids/list', { propertyId }),
  createGrid: (propertyId, grid) => network.post('/laser-grids/create', grid, { propertyId }),
  updateGrid: (propertyId, gridId, grid) => network.put('/laser-grids/update', grid, { propertyId, gridId }),
  removeGrid: (propertyId, gridId) => network.delete('/laser-grids/delete', { propertyId, gridId }),

  listWalls: (propertyId) => network.get('/walls/list', { propertyId }),
  getWall: (propertyId, wallId) => network.get('/walls/get', { propertyId, wallId }),
  createWall: (propertyId, wall) => network.post('/walls/create', wall, { propertyId }),
  updateWall: (propertyId, wallId, wall) => network.put('/walls/update', wall, { propertyId, wallId }),
  removeWall: (propertyId, wallId) => network.delete('/walls/delete', { propertyId, wallId }),
  saveAnnotation: (propertyId, wallId, annotation) =>
    network.put('/walls/save-annotation', annotation, { propertyId, wallId }),
  saveCells: (propertyId, wallId, cells) => network.put('/walls/save-cells', cells, { propertyId, wallId }),
  // squares: [{ row, col }] in the order the drone visits them. An empty list clears the route.
  setCellRoute: (propertyId, wallId, cellId, squares) =>
    network.put('/walls/set-cell-route', squares, { propertyId, wallId, cellId }),
  validateWall: (propertyId, wallId) => network.get('/walls/validate', { propertyId, wallId }),
}

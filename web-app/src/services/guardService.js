import { network } from '../network/networkLayer'

export const guardService = {
  list: () => network.get('/guards/list'),
  // guards/create takes the same fields as auth/register and always creates a Guard.
  create: ({ fullName, email, phoneNumber, password }) =>
    network.post('/guards/create', { fullName, email, phoneNumber: phoneNumber || '', password }),
  setStatus: (guardId, suspended) =>
    network.patch('/guards/set-status', { status: suspended ? 'Suspended' : 'Active' }, { guardId }),
  remove: (guardId) => network.delete('/guards/delete', { guardId }),
}

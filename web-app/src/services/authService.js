import { network } from '../network/networkLayer'

// Knows the auth URLs. Does not know about screens.
export const authService = {
  login: (email, password) => network.post('/auth/login', { email, password }),     // -> { accessToken, user }
  // The backend always creates an Admin.
  register: ({ fullName, email, phoneNumber, password }) =>
    network.post('/auth/register', { fullName, email, phoneNumber: phoneNumber || '', password }),
  me: () => network.get('/auth/me'),
}

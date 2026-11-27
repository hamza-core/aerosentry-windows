// Where the backend is. Change it without touching code: create web-app/.env.local with
//   VITE_API_URL=http://192.168.0.20:5078
// (the Mac's address on the Wi-Fi, for a phone or another computer). The backend must allow this web page's
// address in its Cors:Origins list. No internet is needed at run time: everything is bundled.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5078').replace(/\/$/, '')
export const API_PREFIX = '/api/v1'

// The media server's WebRTC address (low-delay video for RTSP / .sdp cameras).
//   VITE_WEBRTC_URL=http://192.168.0.20:8889
export const WEBRTC_URL = (import.meta.env.VITE_WEBRTC_URL || 'http://localhost:8889').replace(/\/$/, '')

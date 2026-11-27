// The ONLY place that builds and sends HTTP requests (the same idea as the iOS NetworkLayer and your teacher's
// NetworkLayer). Services call it with a path like '/properties/list'; nothing else uses fetch.
//
//  - every request carries  Authorization: Bearer <token>
//  - an error reply is JSON (ProblemDetails): we turn it into one readable sentence
//  - a 401 on a request that carried a token means the session ended: an event tells the app to sign out

import { API_URL, API_PREFIX } from '../config'
import { tokenStore } from './tokenStore'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status          // 0 = the server could not be reached
  }
}

export const SESSION_EXPIRED = 'aerosentry:session-expired'

function buildUrl(path, query) {
  const url = new URL(API_URL + API_PREFIX + path)
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }
  return url
}

// ASP.NET Core error body -> one sentence.
async function messageFrom(response) {
  try {
    const problem = await response.clone().json()
    const firstField = problem.errors && Object.values(problem.errors)[0]
    if (Array.isArray(firstField) && firstField[0]) return firstField[0]
    if (problem.detail) return problem.detail
    if (problem.title) return problem.title
  } catch { /* not JSON */ }
  return `Server error (${response.status})`
}

async function perform(method, path, { query, body, form, headers = {}, signal } = {}) {
  const token = tokenStore.read()
  const init = { method, headers: { ...headers }, signal }
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (form) {
    init.body = form                               // multipart: the browser sets the Content-Type with its boundary
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(buildUrl(path, query), init)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError(0, 'Could not reach the server. Check that the backend is running and you are on the same network.')
  }

  if (response.status === 401 && token) window.dispatchEvent(new Event(SESSION_EXPIRED))
  if (!response.ok) throw new ApiError(response.status, await messageFrom(response))
  return response
}

async function json(response) {
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export const network = {
  // A reply that is read piece by piece while it arrives (the live detection picture stream). Same token, same errors.
  stream: (path, query, signal) => perform('GET', path, { query, signal }),
  async get(path, query) { return json(await perform('GET', path, { query })) },
  async send(path, method, body, query) { return json(await perform(method, path, { body, query })) },
  async post(path, body, query) { return json(await perform('POST', path, { body, query })) },
  async put(path, body, query) { return json(await perform('PUT', path, { body, query })) },
  async patch(path, body, query) { return json(await perform('PATCH', path, { body, query })) },
  async delete(path, query) { await perform('DELETE', path, { query }) },
  // multipart/form-data with files, for example enrolling a person
  async upload(path, form, query) { return json(await perform('POST', path, { form, query })) },
  // A picture (image/jpeg) with its size from the X-Frame-Width / X-Frame-Height headers.
  async image(path, query) {
    const response = await perform('GET', path, { query })
    return {
      blob: await response.blob(),
      width: Number(response.headers.get('X-Frame-Width')) || 0,
      height: Number(response.headers.get('X-Frame-Height')) || 0,
    }
  },
}

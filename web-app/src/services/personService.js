import { network } from '../network/networkLayer'

// Authorized people (faces that are not treated as intruders). Admin only on the server.
export const personService = {
  list: (propertyId, category) => network.get('/people/list', { propertyId, category }),
  get: (propertyId, personId) => network.get('/people/get', { propertyId, personId }),
  // form: name, category, phone, validUntil (yyyy-mm-dd), note and three pictures: front, left, right.
  enroll: (propertyId, fields, photos) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value)
    for (const angle of ['front', 'left', 'right']) form.append(angle, photos[angle], `${angle}.jpg`)
    return network.upload('/people/enroll', form, { propertyId })
  },
  // One live picture on the capture screen: where is the face, is it good enough, how sharp?
  checkFrame: (propertyId, blob) => {
    const form = new FormData()
    form.append('image', blob, 'frame.jpg')
    return network.upload('/people/check-frame', form, { propertyId })
  },
  // From the pictures the capture screen chose.
  enrollCaptured: (propertyId, fields, frames) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value)
    frames.forEach((blob, i) => form.append('frames', blob, `frame${String(i + 1).padStart(2, '0')}.jpg`))
    return network.upload('/people/enroll-captured', form, { propertyId })
  },
  // From one video of the person facing the camera: the server keeps 30 good frames and averages their faces.
  enrollFrames: (propertyId, fields, video) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value)
    form.append('video', video, video.name || (video.type.includes('mp4') ? 'face.mp4' : 'face.webm'))
    return network.upload('/people/enroll-frames', form, { propertyId })
  },
  // Is this picture good enough to enrol with (one face, big enough)?
  checkPhoto: (propertyId, blob) => {
    const form = new FormData()
    form.append('image', blob, 'check.jpg')
    return network.upload('/people/check-photo', form, { propertyId })
  },
  update: (propertyId, personId, details) => network.put('/people/update', details, { propertyId, personId }),
  setAccess: (propertyId, personId, disabled) =>
    network.post(disabled ? '/people/disable-access' : '/people/enable-access', undefined, { propertyId, personId }),
  remove: (propertyId, personId) => network.delete('/people/delete', { propertyId, personId }),
  photo: (propertyId, personId, angle) => network.image('/people/get-photo', { propertyId, personId, angle }),
}

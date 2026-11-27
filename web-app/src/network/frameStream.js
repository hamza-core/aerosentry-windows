// Cuts the pictures out of the backend's live picture stream (multipart/x-mixed-replace). Each part is
//   --frame\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n<N bytes of JPEG>\r\n
// The data arrives in pieces of any size, so we keep what is incomplete until the rest comes.
const MAX_BUFFER = 8 * 1024 * 1024

const indexOfHeaderEnd = (bytes) => {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i
  }
  return -1
}

export function createFrameParser(onFrame) {
  let buffer = new Uint8Array(0)
  return (chunk) => {
    const joined = new Uint8Array(buffer.length + chunk.length)
    joined.set(buffer)
    joined.set(chunk, buffer.length)
    buffer = joined
    for (;;) {
      const headerEnd = indexOfHeaderEnd(buffer)
      if (headerEnd < 0) break
      const header = new TextDecoder().decode(buffer.subarray(0, headerEnd))
      const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1])
      if (!length) { buffer = buffer.slice(headerEnd + 4); continue }      // not a picture part: skip it
      const end = headerEnd + 4 + length
      if (buffer.length < end) break                                       // the picture is not complete yet
      onFrame(buffer.slice(headerEnd + 4, end))
      buffer = buffer.slice(end)
    }
    if (buffer.length > MAX_BUFFER) buffer = new Uint8Array(0)             // lost our place: start again
  }
}

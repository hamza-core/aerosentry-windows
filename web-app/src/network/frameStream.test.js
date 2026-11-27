import { describe, expect, it } from 'vitest'
import { createFrameParser } from './frameStream'

const part = (bytes) => {
  const head = new TextEncoder().encode(`\r\n--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${bytes.length}\r\n\r\n`)
  const out = new Uint8Array(head.length + bytes.length + 2)
  out.set(head); out.set(bytes, head.length); out.set([13, 10], head.length + bytes.length)
  return out
}
const join = (...a) => Uint8Array.from(a.flatMap((x) => [...x]))
const first = Uint8Array.from([0xff, 0xd8, 1, 13, 10, 13, 10, 2, 0xff, 0xd9])      // contains a blank-line byte pattern inside
const second = Uint8Array.from([0xff, 0xd8, 9, 9, 0xff, 0xd9])

describe('live detection picture stream', () => {
  for (const size of [1, 3, 7, 64, 1000]) {
    it(`finds both pictures when the data arrives ${size} bytes at a time`, () => {
      const got = []
      const push = createFrameParser((f) => got.push([...f]))
      const all = join(part(first), part(second))
      for (let i = 0; i < all.length; i += size) push(all.slice(i, i + size))
      expect(got).toEqual([[...first], [...second]])
    })
  }
  it('gives nothing for half a picture', () => {
    const got = []
    createFrameParser((f) => got.push(f))(part(first).slice(0, part(first).length - 5))     // the last bytes are missing
    expect(got.length).toBe(0)
  })
})

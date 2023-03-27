import { encoding_length } from 'varint-vectors'
import { createHash, randomBytes } from 'node:crypto'

const MAXUINT8 = 255
const MAXUINT16 = 65535
const MAXUINT32 = 4294967295
const INTSIZE = Uint32Array.BYTES_PER_ELEMENT

const get_prefix_size = cid => {
}

/* The InMemory implementation is meant to
 * operate under the fastest possible performance.
 * As such, it is not "safe" by any means. Byte
 * values are not validated against their digests,
 * input types are not checked and will result in
 * invalid encodings, etc.
 * Consumers are expected to verify the encoded
 * state before transmission in any scenario in
 * which they do not fully trust the consumer
 * and producer.
 */
class InMemory/*32*/ {
  constructor ({ entries,
                 digestSize, blockOffset, largestBlock }={}) {
    this.entries = entries || []
    this.digestSize = digestSize || 0
    this.blockOffset = blockOffset || 0
    this.largestBlock = largestBlock || 0
  }
  find (digest) {
    if (!this.entries.length) return [ 0, false ]

    let NUMBER
    let MAX

    if (this.entries.length <= MAXUINT8) {
      NUMBER = Uint8Array
      MAX = MAXUINT8
    } else if (this.entries.length <= MAXUINT16) {
      NUMBER = Uint16Array
      MAX = MAXUINT16
    } else if (this.entries.length <= MAXUINT32) {
      NUMBER = Uint32Array
      MAX = MAXUINT32
    } else {
      throw new Error('Out of range, this is not a 64b implementation')
    }
    const num = new NUMBER(
      digest.buffer, digest.byteOffset, digest.byteOffset + NUMBER.BYTES_PER_ELEMENT
    )[0]

    let offset = Math.floor(( num / MAX) * this.entries.length)
    const prediction = offset

    /*
    console.log({
      offset, num, MAX, l: this.entries.length,
      f: (num / MAX),
      d: ( this.entries.length / MAX )
    })
    */

    let i = 0
    let open_less = true
    let open_greater = true

    while (true) {
      if (offset >= this.entries.length) {
        offset = this.entries.length -1
      }
      const current = this.entries[offset][0]
      /*
      console.log({
        current: new Uint8Array(current.subarray(0,2)),
        digest:  new Uint8Array(digest.subarray(0,2)),
        i, offset, open_greater, open_less
      })
      */

      if (digest[i] === current[i]) {
        i++
        if (i === digest.byteLength) {
          if (digest.byteLength === current.byteLength) {
            return [ offset, true ]
          } else {
            return [ offset, false ]
          }
        }
        continue
      } else if (digest[i] < current[i]) {
        open_greater = false
        if (open_less) {
          if (offset === 0)  {
            return [ 0, false ]
          }
          i = 0
          offset--
          continue
        } else {
          return [ offset, false ]
        }
      } else if (digest[i] > current[i]) {
        open_less = false
        if (open_greater) {
          if (offset === this.entries.length - 1) {
            return [ offset + 1, false ]
          }
          i = 0
          offset++
          continue
        } else {
          return [ offset + 1, false ]
        }
      }
    }
  }
  has (digest) {
    return this.find(digest)[1]
  }
  insert ({ digest, block }) {
    const [ offset, found ] = this.find(digest)
    if (found) return // already in the set

    if (this.digestSize < digest.byteLength) {
      this.digestSize = digest.byteLength
    }
    let psize
    if (!block[1]) {
      psize = 4
    } else {
      psize = get_prefix_size(block[1])
    }
    let block_size = block[0].byteLength
    block_size += encoding_length(block_size)
    block_size += psize

    if (this.largestBlock < block_size) {
      this.largestBlock = block_size
    }

    // TODO: compact these into a single array
    this.entries.splice(offset, 0, [
      digest, block, [ this.blockOffset, block_size ]
    ])
    this.blockOffset = this.blockOffest + block_size
    // this.verify()
  }
  encode () {
    return Buffer.concat(this.encodeVector())
  }
  encodeVector () {
    return [ ...this.encodeTableVector() ]
  }
  encodeTableVector () {
    const header = [
      , // BYTE_LENGTH of the largest DIGEST
      , // BLOCKS_LENGTH
      , // LARGEST_BLOCK_LENGTH
    ]
    // returns [ header, table ] vectors
  }
  verify () {
    let last = new Uint8Array(this.digestSize)
    for (const entry of this.entries) {
      let i = 0
      const [ digest ] = entry
      while (i < digest.byteLength) {
        if (digest[i] > last[i]) break
        if (digest[i] < last[i]) throw new Error('Out of order')
        i++
      }
      if (i === digest.byteLength) {
        if (digest[i] === last[i]) throw new Error('Duplicate entry')
      }
      last = digest
      if (!this.has(digest)) throw new Error('Failed inclusion check')
    }
  }
}

let inmem = new InMemory()

const slab = randomBytes(1024 * 2)
const range = size => [...Array(size).keys()]

const views = range(slab.byteLength - 1).flatMap(i => {
  return range(i).map(l => slab.subarray(i, l))
})

const hash = view => createHash('sha256').update(view).digest()
const digests = views.map(view => hash(view))

console.log('created', digests.length, 'hashes')

for (let i = 0; i < digests.length; i++) {
  const digest = digests[i]
  const view = views[i]
  inmem.insert({ digest, block: [ view ] })
}

inmem = new InMemory()

let start = performance.now()
for (let i = 0; i < digests.length; i++) {
  const digest = digests[i]
  const view = views[i]
  inmem.insert({ digest, block: [ view ] })
}
let end = performance.now()

inmem.verify()

console.log(digests.length, 'BlockBox inserts in', end - start + 'ms')

const strings = digests.map(d => d.toString('base64'))

const map = new Map()
start = performance.now()
for (let i = 0; i < strings.length; i++) {
  map.set(strings[i], [ views[i] ])
}
end = performance.now()

console.log(digests.length, 'Map() inserts in', end - start + 'ms')

start = performance.now()

for (let i = 0; i < digests.length; i++) {
  const digest = digests[i]
  inmem.has(digest)
}

end = performance.now()

console.log(digests.length, 'BlockSet() positive inclusion checks in', end - start + 'ms')

start = performance.now()
for (let i = 0; i < strings.length; i++) {
  map.has(strings[i])
}
end = performance.now()

console.log(digests.length, 'Map() positive inclusion checks in', end - start + 'ms')



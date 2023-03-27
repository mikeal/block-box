import { encoding_length } from 'varint-vectors'
import { createHash, randomBytes } from 'node:crypto'

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
    let offset = (new Uint32Array(
      digest.buffer, digest.byteOffset, digest.byteOffset + INTSIZE)
    )[0]
    // there's more efficient math here that avoids floating
    // point calculations, by traversing down each byte in the
    // hash exactly as long as it is useful based on the size
    // of the digests list, but this is good enough for now.
    offset = Math.floor(
      this.entries.length / ( offset / MAXUINT32 )
    )

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
    this.verify()
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
    }
  }
}

const inmem = new InMemory()

const slab = randomBytes(1024)
const range = size => [...Array(size).keys()]

const views = range(1023).flatMap((x, i) => {
  return [ slab.subarray(0, i), slab.subarray(i) ]
})
.filter(bytes => bytes.byteLength)

const hash = view => createHash('sha256').update(view).digest()
const digests = views.map(view => hash(view))

console.log('created', digests.length, 'hashes')

for (let i = 0; i < digests.length; i++) {
  const digest = digests[i]
  const view = views[i]
  inmem.insert({ digest, block: [ view ] })
}

inmem.verify()



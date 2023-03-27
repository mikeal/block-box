import { encoding_length } from 'varint-vectors'
import { MAXUINT8, MAXUINT16, MAXUINT32, cid_prefix_size, digestv } from './utils.js'

const findnum = num => {
  let NUMBER
  let MAX

  if (num <= MAXUINT8) {
    NUMBER = Uint8Array
    MAX = MAXUINT8
  } else if (num <= MAXUINT16) {
    NUMBER = Uint16Array
    MAX = MAXUINT16
  } else if (num <= MAXUINT32) {
    NUMBER = Uint32Array
    MAX = MAXUINT32
  } else {
    throw new Error('Out of range, this is not a 64b implementation')
  }
  return [ NUMBER, MAX ]
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

    const [ NUMBER, MAX ] = findnum(this.entries.length)

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
      const current = this.digestForOffset(offset)
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
  digestForOffset (offset) {
    return this.entries[offset][0]
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
      psize = cid_prefix_size(block[1])
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
  encodeHeader() {
    /* HEADER ALLOCATION */
    const header = new ArrayBuffer(32)
    let i = 0
    const largest_digest = new BigInt64Array(header, i, i += 8)
    const blocks_length  = new BigInt64Array(i, i += 8)
    const largest_block  = new BigInt64Array(i, i += 8)
    const digests_length = new BigInt64Array(i, i += 8)

    /* HEADER ENCODE */
    largest_digest[0] = BigInt(this.digestSize)
    blocks_length[0]  = BigInt(this.blockOffset)
    largest_block[0]  = BigInt(this.largestBlock)
    digests_length    = BigInt(this.entries.length)
    return header
  }
  encodeVector (include_blocks=true) {
    /* TABLE VECTOR ASSEMBLY */
    const OffsetNumber      = findnum(this.blockOffset)
    const BlockLengthNumber = findnum(this.largestBlock)

    const encodeOffset = encnum(this.blockOffset)
    const encodeLength = encnum(this.largestBlock)

    const blocks = []
    const table = this.entries.flatMap(entry => {
      const [ digest, block, [ offset, block_size ] ] = entry

      // TODO: encode blocks

      return [ digest, encodeOffset(offset), encodeLength(block_size) ]
    })

    if (include_blocks) {
      return [ ...table, ...blocks ]
    } else {
      return [ ...table ]
    }

    // returns [ header, table ] vectors
  }
  table_digest () {
    return digestv(this.encodeVector(false))
  }
  digests () {
    return this.entries.map(([ digest ]) => digest)
  }
  digests_digest () {
    return digestv(this.digests())
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

export { InMemory }

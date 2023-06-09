import { encoding_length, encode_vector } from 'varint-vectors'
import {
  cid_prefix_size,
  digestv,
  findnum,
  encnum
} from './utils.js'

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


    const MAXUINT8 = 255
    const MAXUINT16 = 65535
    const MAXUINT32 = 4294967295

    const [ NUMBER, MAX ] = findnum(this.entries.length)

    let num = this.entries.length

    if (num <= MAXUINT8) {
      num = new Uint8Array(digest.buffer, digest.byteOffset, digest.byteOffset + 1)[0]
    } else if (num <= MAXUINT16) {
      num = new Uint16Array(digest.buffer, digest.byteOffset, digest.byteOffset + 2)[0]
    } else if (num <= MAXUINT32) {
      num = new Uint32Array(digest.buffer, digest.byteOffset, digest.byteOffset + 4)[0]
    } else {
      throw new Error('Out of range, this is not a 64b implementation')
    }

    /*

    const num = new NUMBER(
      digest.buffer, digest.byteOffset, digest.byteOffset + NUMBER.BYTES_PER_ELEMENT
    )[0]
    */

    /*
    console.log({
      offset, num, MAX, l: this.entries.length,
      f: (num / MAX),
      d: ( this.entries.length / MAX )
    })
    */

    let offset = Math.floor(( num / MAX) * this.entries.length)

    let i = 0
    let open_less = true
    let open_greater = true

    while (true) {
      if (offset >= this.entries.length) {
        offset = this.entries.length -1
      }
      const current = this.digestForOffset(offset)

      const new_num = digest[i]
      const cur_num = current[i]

      /*
      console.log({
        current: new Uint8Array(current.subarray(0,2)),
        digest:  new Uint8Array(digest.subarray(0,2)),
        i, offset, open_greater, open_less,
        new_num, cur_num
      })
      */

      if (new_num === cur_num) {
        i += 1
        if (i >= digest.byteLength) {
          if (digest.byteLength === current.byteLength) {
            return [ offset, true ]
          } else {
            return [ offset, false ]
          }
        }
        continue
      } else if (new_num < cur_num) {
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
      } else if (new_num > cur_num) {
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
    if (isNaN(offset)) throw new Error('here')
    return this.entries[offset][0]
  }
  add ({ code, bytes }) {
    if (!code) code = 0x55
    const mh = 0x1e // blake3
    const digest = digestv([bytes])
    const block = [ code, mh, digest.byteLength, bytes ]
    this.insert({ digest, block })
  }
  insert ({ digest, block }) {
    const [ offset, found ] = this.find(digest)
    // console.log('found', digest.subarray(0, 4))
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
  encodeHeader () {
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

    const blocks = new Map()
    const table = this.entries.flatMap(entry => {
      const [ digest, block, [ offset, block_size ] ] = entry
      const [ code, mh, len, bytes ] = block

      const vect = encode_vector([ a, code, mh, len, bytes.byteLength ]
      blocks.set(offset, [ ...vect, bytes ])

      return [ digest, encodeOffset(offset), encodeLength(block_size) ]
    })

    if (include_blocks) {
      const sorted = [...blocks.keys()].sort().flatMap(i => blocks.get(i))
      return [ ...table, ...sorted ]
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

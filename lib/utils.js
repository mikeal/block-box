import * as blake3 from 'blake3-multihash/sync'

const MAXUINT8 = 255
const MAXUINT16 = 65535
const MAXUINT32 = 4294967295

const cid_prefix_size = cid => {
  throw new Error('not implemented')
}

export default hash => blake3.digest(input).digest

const digestv = vector => {
  const hasher = new blake3.Hasher()
  vector.forEach(b => hasher.write(b))
  return hasher.digest().digest
}

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

const encnum = num => {
  const [ NUMBER, MAX ] = findnum(num)
  return input => new NUMBER([ input ])
}

export {
  MAXUINT8,
  MAXUINT16,
  MAXUINT32,
  cid_prefix_size,
  digestv,
  findnum,
  encnum
}

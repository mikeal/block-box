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
export { MAXUINT8, MAXUINT16, MAXUINT32, cid_prefix_size, digestv }

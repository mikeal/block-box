import { createHash, randomBytes } from 'node:crypto'

const hash = view => createHash('sha256').update(view).digest()

const create = size => {
  const slab = randomBytes(size)
  const range = size => [...Array(size).keys()]

  const views = range(slab.byteLength - 1).flatMap(i => {
    return range(slab.byteLength).slice(i+1).map(l => {
      return slab.subarray(i, l)
    })
  }).filter(b => b.byteLength)
  if (!views.length) throw new Error('nope')

  const digests = views.map(view => hash(view))
  return { slab, range, views, digests }
}

export default create

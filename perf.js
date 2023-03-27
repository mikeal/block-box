import { createHash, randomBytes } from 'node:crypto'
import { InMemory } from './lib/inmem.js'

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



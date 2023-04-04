import { InMemory } from '../index.js'
import fixture from './fixture.js'

const { digests, views, slab } = fixture(10)

const inmem = new InMemory()

console.log('writing', digests.length)
for (let i = 0; i < digests.length; i++) {
  const digest = digests[i]
  const block = [ views[i] ]
  console.log('writing', digest.subarray(0,4))
  inmem.insert({ digest, block })
}
console.log('written')
inmem.verify()

const size = inmem.entries.length
console.log({ size, digests: digests.length })



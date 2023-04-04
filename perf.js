import { InMemory } from './lib/inmem.js'
import fixture from './tests/fixture.js'

let inmem = new InMemory()
let budget = []
inmem.spend = n => budget.push(n)

const { digests, slab, range, views } = fixture(100)

console.log('created', digests.length, 'hashes')

for (let i = 0; i < digests.length; i++) {
  const digest = digests[i]
  const view = views[i]
  inmem.insert({ digest, block: [ view ] })
}

inmem = new InMemory()
budget = []
inmem.spend = n => budget.push(n)

let start = performance.now()
for (let i = 0; i < digests.length; i++) {
  const digest = digests[i]
  const view = views[i]
  inmem.insert({ digest, block: [ view ] })
}
let end = performance.now()

inmem.verify()

console.log(budget.length, 'budgeted operations executed')
let spent = budget.reduce((x,y) => x + y, 0)

console.log(digests.length, 'BlockBox inserts in', end - start + 'ms', 'with', spent, 'tracked')

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



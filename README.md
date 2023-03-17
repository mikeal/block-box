# block-box

Universal hash addressed block container.
* fully deterministic verifiable encoding
* incrementally verifiable
* high performance inclusion checks (on-disc and in-memory)
* high performace insert and removal (on-disc and in-memory)

Which makes it a performant means of exchanging block sets
across memory, networks and is even a high performance
ondisc database format.

How fast are we talking?

Local operations (read, insert, bulk inclusion checks) into 
the data structure is comparable to native Map()
implementations and, given access to low level primitives, could
beat performance.

Serialization of the data structure, because it's already prepared
for serialization, is about as fast as you can write a vector of
bytes and does not require a single memcopy operation (outside of
number-to-byte conversions in certain languages).

Within the realm of "hash addressed blocks" you should be able
to serialize these as fast your program can access the related bytes
and move them to the desired space in memory, disc, or network.

## What is a "hash addressed block container?"

Numerous systems exist that hold and exchange hash addressed blocks:
* git
* all blockchains
* IPFS/IPLD
* ssb
* doltdb
* Bittorrent/WebTorrent

Each has at least one custom format and/or transport for the exchange of those blocks.
None of these formats were designed to interop with each other except
for IPFS/IPLD's CAR format and it's indeterministic and has none of
the other features of `block-box` (but is currently in much broader use
since this is literally an idea i just had).

To the extent that these systems have performance issues regarding the
exchange of block data and performant Block Set() combinations with that data,
it can be traced to the fact that these layers have never completely
considered the potential perfomance gains in binary serialization available
when the data is **already hashed**.

Functional data-structures have been the source of underlying performance
gains in base type implementations across numerous programming languages for decades.
In the case of exchanging hash addressed block data, the cryptographic "work" portion 
of these data-structures is *already done!* Surely, if we are suffering from
some performance strain it is do to a loss in power in the selection, compaction,
serialization and exchange of this data.

If the in-memory binary forms of optimal hash tables can be preserved in the
preparation and serialization of these "Block Sets()" those performance gains
can materialize instantly up those stacks. Performance concerns from that point
forward would be evident up the stack where power is being lost elsewhere.

# Format

The format (BOX) is split into a HEADER, DIGESTS and BLOCKS sections.

The DIGESTS read paramaters (length, predictive positioning, etc) 
is computed from a single 32 byte (4 64bit integers) HEADER.
With this, efficient lookups can be performed to find the location of any
BLOCK in the BOX.

These 3 integers represent the following values:
* The size, in bytes, of the LARGEST hash DIGEST.
* The size, in bytes, of the LARGEST block OFFSET (from BLOCKS section start).
* The size, in bytes, of the LARGEST BLOCK_LENGTH.
* The number of TOTAL_DIGESTS in the BOX.

The DIGESTS section is an encoding of every
[ DIGEST, OFFSET, BLOCK_LENGTH ] and since the
largest of all these values was encoded in the HEADER
the length of all these sections is fixed.

This means the HEADER contains all the information we need to know 
* the optimal integer encoding of the OFFSET and BLOCK_LENGTH
* and since all digests smaller than the LARGEST DIGEST will be
   zero filled the encoding size of each DIGEST is static,
* which in combination can be used to determine the total length
  of the DIGESTS section.

DIGESTS MUST be encoded in binary sort order, which means:
* For the cost of a 32 byte header, we've got a perfect HASH
  TABLE encoding that we can seek into for fast inclusion
  checks.
* All the efficient Set() operations we want to do using 
  Block Sets() we can get out of this, whether
  it's in-memory or on-disc.
  
The details of BLOCKS encoding is covered much lower.

# Simple Parser Walk-Through

Since each section provides the information for fast seeking
into the subsequent section you can parse, and build optimizations,
in the following way:
* `read(0, 32)` gives you the HEADER, which gives you fast seeking
into the DIGESTS section.
  * You can load these into memory when a program initializes and even
    store this HEADER anywhere you reference the BOX since it's only 32
    bytes, which would allow you to seek into the DIGESTs on first read.
* Based on the size of the digests and the deterministic position of the hash
  DIGEST you wish to seek into, you can then perform a single and relatively small read into the
  DIGESTS that is deterministically guaranteed to provide the index
  you're looking for (or tell you that the DIGEST isn't in this Set())
  * For most use cases, these DIGESTS sections are pretty small and
    if a program wishes to it can just load the whole section into memory
    or even store this section apart from the blocks section if it
    represents a performance gain based on locality.
  * When the whole structure is in memory looks get even faster since you
    can hold a collection binary views already indexed by offset. Simple
    math will give you the ideal offset to start a lookup or inclusion check
    `const start_offset = Math.floor(TOTAL_DIGESTS / (256 / hash[0]))` where
    `hash[0]` can be replaced with larger number parsing when the size of TOTAL_DIGESTS
    is larger than MAX_UINT8 (256) for greater precision.
* Once you've read the OFFSET and BLOCK_LENGTH from the DIGESTS section
  you can predict the exact byte range you need to use to read the BLOCK
  from the BLOCKs section.

One thing to note is that if you do end up with one hash DIGEST
that is much larger than all the rest there's a performance
penalty as all the DIGESTs will take up that amount of space.
This is a very theoretical problem, most applications have
hashes of all the same length, but if this penalty were ever
to become noticable one could just use a different box for
each differing length to overcome it.

# As a Database

Here's how you can preserve transactional integrity at the filesystem
layer in a very efficient manor that is likely to outperform most
of what has been built.

A database will typically hold some amount of state in memory as
it builds a transaction and then finally COMMITs that transation.
This happens much the same way you build state in your local git
checkout before a COMMIT.

The state it builds in-memory is usually a hybrid of CACHE it has
accumulated from disc, pending alterations to that state, and
other new information being added.

Since data being written to the BOX is stored in an already
efficient sort order (whether on-disc or in-memory), 
it offers a highly optimized binary structure already widely
used and understood to be of the highest potential performance.

Data that is read from the BOX can use deterministic
predictions to efficiently find the location of a DIGEST on-disc and in-memory. 

The fact that you don't have to
do anything else to it and it's already as fast a data structure
as your builtin types is pretty amazing. As is most often the case,
the total DIGESTS will be small enough that you can quickly load the
entire on-disc state into memory.

When you commit a change of the in-memory state to disc you have a few options available
to you depending on where you wanna make a CAP tradeoff:
* You can edit the existing file in-place and risk leaving the file
  in an inconsistent state.
* You could write a new file of the new database, which sounds expensive
  but because you know all the insertion points you can build efficient
  `writev` calls and even work with some `sendfile()` operations.
* But honestly, what you're probably going to want to do if you want a really
  fast database is have MORE THAN ONE FILE. You've got incredibly performant
  search operations once you've read the header, so write a few of them
  out so you don't have to do in-place edits and then compact every once
  in a while, which isn't a big deal because
* Compaction turns out to be pretty cheap when you're concatenating Sets()
   together :) 

# BLOCKS

Ok, here's where things get interesting and a little more IPLD specific.

First, we should acklowdge that CAR has served us well but is probably the slowest
version of a solution to this problem that we'll have from this point forward.

We just didn't have enough experience to design something great back then. We know
a lot more now, and projects like store-the-hash have demonstrated how it's often
worth the effort to write hash aware on-disc block stores because we really can
beat the performance of anything anyone has built for general purpose solutions.

We can actually do a lot more with the existing CID and multihash
address space through deterministic representation because incremental
verifiabilty can be modeled and addressed as a form of validation and thus a valid
multihash. This is already the case with certain addresses in Filecoin that use
both the codec and multihash space. The fact that, in addition to validation,
these same variables would allow for fast seeking and inclusion checks doesn't
mean they don't belong in the multihash :)

Most of the discussion regarding data transfer in IPFS/IPLD is focused on the Graph
layer because it appears as though that's where the performance is slow. Were graph
representations and operations to be serialized into `block-box` for exchange many
problems that today look like Graph problems will become Set() problems, and therefor
easier to solve and the way to optimize them will be clear.

From this point on, this project uses the IPLD `codec` and `multihash` to signal
different formats and program behavior variance through those address spaces.
* Some have fully deterministic block encodings,
* Some don't have fully determinstic block encodings but remain incrementally verifiable.
* Some **include the HEADER!**
  * This is exciting because, when these are stored in a remote location, the client
    can produce Range() requests into the remote without an expensive round-trip for
    the HEADER.
* Some are designed to implement block storage.
* Some are designed to implement **hash addresses indexes** (pointers from one hash address to another).
* Since all of this is accomplished in the form of addressing, all of these forms
  retain the appearance of a BLOCK themselves which enables recursive composition that
  can be used for streaming and aggregation protocols.
 
You can tell the `block-box` retains the benefits of determinism throughout because
all the characteristics of pure functional systems show up :)

## BLOCK

Each individual BLOCK is encoded in two sections. The first section
is the CID_PREFIX information related to the hash DIGEST. This is
encoded as 4 VARINTs `[ CIDv, CODEC, MULTIHASH_CODE, MULTIHASH_LENGTH ]`.
CIDv0 is encoded as `[ 0, 0, 0, SHA256_HASH_LENGTH ]`.

The BLOCK_LENGTH is never in this section, **the OFFSET and BLOCK_LENGTH are
only ever encoded into the DIGESTS section**. So the rest
of the data is the BYTE data that validates against the refering
`multihash`.

It should be noted at this point the BOX standard is recursive!

If this block has a `block-box` CID, the corresponding block
data can be verfied incrementally. There's really no reason
not to implement this recursion in most storage systems, and
this makes this format an obvious choice for streaming use
cases because you can stream as much block data as you have
at any moment and, whatever the size of the serialization, it
will be entirely verifiable.

Aggregators can simply stream into a box, with any level of depth
they wish. There's no limit because the resulting recusion can
be implemented in a memory safe way and is guaranteed not to include
cycles because... we've never left the safety of full verifiability.

Storage systems can easily parse the structure and discover all
blocks regardless of the number of aggregations and depth and flatten
the representation through Set() combinations, which we already
know is the fastest way to do it.

## `block-box` codecs and multihashes

A `block-box` doesn't have a single fixed `code`, but most
codes can be used as both a `codec` and a `multihash` code
and the `multihash` includes other `multihashes` for
wide ranging compatibility and future proofing.

When a `codec` is used and THE SAME `

When used as a `multihash`, this indicated the hash digest
is encoded as one of the following:
* [ 0, HEADER, MULTIHASH of the BOX ]
* [ 1, HEADER, MULTIHASH of the DIGESTS ]
* [ 2, HEADER, MULTIHASH of the BOX, MULTIHASH of the DIGESTS ]
* [ 3, HEADER, MULTIHASH of the BLOCKS ]
* [ 4, HEADER, MULTIHASH of the BLOCKS, MULTIHASH of the BOX ]
* [ 5, HEADER, MULTIHASH of the BLOCKS, MULTIHASH of the DIGESTS ]
* [ 6, HEADER, MULTIHASH of the BLOCKS, MULTIHASH of the BOX, MULTIHASH of the DIGESTS ]

Since we've got multihashes in multihashes, any method
we ever want to use to verify each section can be
used and encoded into this new compound MULTIHASH which
we can use in combination with the `codec`, so these
features of "fatness" in the pointer make their
way into CID in a seamless way because they arrive
in the form of verifiability improvements to the `multihash`
address space.

Note that ALL of these multihashes represent full verifiability of all the others.
Since the order of the BLOCK data determines the data in the DIGESTS section
a new DIGEST section can be produced from the BLOCKS section and verified, and
the same is true of the HEADER. These are the sorts of properties we get with fully
deterministic representations, because even when the BLOCKS section is a
stream of blocks encoded in an indeterministic order the DIGESTS section
produced from those blocks in that order is **still fully determinsitic**.

That's why we'll start with a fully deterministic encoding.

## `deterministic-block-box`

* `code`: TBD
* appears as a `codec` and `multihash`

The BLOCKS section MUST be encoded in the same binary sort order as the DIGESTS.

Note that, variances in CID can produce box variants for each CID variant, so
indeterminism in CID prefixes is considered uniquely different.

## `streaming-block-box`

* `code`: TBD
* appears as a `codec` and `multihash`

The BLOCKS section is encoded in an indeterminstic order, as is the case
when streaming data into an append-only file.

Note that this can't be used directly as a "network stream" because the DIGESTS
still must be encoded in binary sort order and appear before the block data.
However, the "network stream" use case is solved using recursive block boxes
which was covered earlier.

Since the DIGESTS and BLOCKS sections can be addressed independently, it may
be common to store them separately. The DIGESTS could be a memmapped file
and the BLOCKS section could be an append-only file, for instance. In the case of a
failure that corrupts the DIGESTS you could regenerate it from the BLOCKS section.
This makes for a pretty safe and high performance database.

## `cid-index-box`

* `code`: TBD
* appears as a `codec` and `multihash`

A `block-box` where the BYTE value of every BLOCK is a referring CID turns out to
be a very good cid indexing structure to keep and move around when you're working
with lots of hashes :)

This box represents a deterministically generated `index`. As such, its verifiability
is limited to parties that have the logic that produced the index and the block
data being referred to in the CID value.

This also means the index is "blind" containing only hashes and meta data. Any actor
that has the means to verify the index can sign claims about the index using an address that
includes the digest of the BLOCKS section.

This provides a means of exchanging verifiable claims about many hash references at
once, and the index itself is held and serialized in a high performance Set().


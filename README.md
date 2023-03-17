# block-box

Universal hash addressed block container.
* fully deterministic verifiable encoding
* incrementally verifiable
* high performance inclusion checks (on-disc and in-memory)
* high performace insert and removal (on-disc and in-memory)

Which makes it a performant means of exchanging block sets
across memory, networks and is even a high performance
ondisc database format.

## What is a "hash addressed block container?"

Numerous systems exist that hold and exchange hash addressed blocks:
* git
* all blockchains
* IPFS/IPLD
* ssb
* doltdb
* Bittorrent/WebTorrent

Each has at least one custom format for the exchange of those blocks.
None of these formats were designed to interop with each other except
for IPFS/IPLD's CAR format and it's indeterministic and has none of
the other features of block-box (but is currently in much broader use
since this is literally an idea i just had).

To the extent that these systems have performance issues regarding the
exchange of block data and perfomant Set() combinations with that data,
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

The format (BOX) is split into a HEADER, DIGESTS and BLOCKS section.

The DIGESTS read paramaters (length, predictive positioning, etc) 
is computed from a single 32 byte read (4 64bit integers) of the HEADER.
With this, efficient lookups can be performed to find the location of any
BLOCK in the BOX.

These 3 integers represent the following values:
* The size, in bytes, of the LARGEST hash DIGEST.
* The size, in bytes, of the LARGEST block OFFSET (from BLOCKS section start).
* The size, in bytes, of the LARGEST BLOCK_LENGTH.
* The number of TOTAL_DIGESTS in the BOX.

With this information we can determine the optimal integer format
of the OFFSET and BLOCK_LENGTH encodings and all digests
smaller than the LARGEST DIGEST will be
zero filled which means the size of the DIGESTS can be determined
from the HEADER read.

All digests in the BOX MUST appear in binary sort order
in both the DIGESTS and their corresponding block data
in the same order in the BLOCKS section.

The DIGESTS section is an encoding of every
[ DIGEST, OFFSET, BLOCK_LENGTH ] and since the
largest of all these values was encoded in the HEADER
the length of all these sections is fixed.

In a single 24 byte header, we've got a perfect HASH
TABLE encoding that we can seek into for fast inclusion
checks.

All the efficient Set() operations we want to do using 
Block Sets() we can get out of this, whether
it's in-memory or on-disc.

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

If you don't care about IPFS/IPLD then this is all you would
care about in terms of how the format looks. The encoding
of each BLOCK gets into some details regarding the preservation
of CID information and how to encode root identifiers into the
blocks in a deterministic way. If you do care about these things
just bear with me and trust that after 5 years of IPLD I'm
not gonna mess this up :)

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

Another thing that the IPLD community has lost sight of in the discussion of "fat
pointers" is that we can actually do a lot more with the existing CID and multihash
address space with fully deterministic representations because incremental
verifiabilty can be modeled and addressed as a form of validation and thus a valid
multihash. This is already the case with certain addresses in Filecoin that use
both the codec and multihash space.

Because the focus in IPLD too often fixates on treating it like a Graph in order
to support existing indeterminsitic representations that are modeled as graphs,
it remains unclear to many how many problems can be solved working with Set()
in the block representations because that serialization layer has been difficult
to evolve.

From this point on, this project uses the IPLD `codec` and `multihash` to signal
change between different formats and in certain ways program behavior variance
through those address spaces.
* Some have fully deterministic block encodings,
* Some don't have fully determinstic block encodings but remain incrementally verifiable.
* Some **include the HEADER!**
  * This is exciting because, when these are stored in a remote location, the client
    can produce Range() requests into the remote without an expensive round-trip for
    the HEADER.
    
## BLOCK

Each individual BLOCK is encoded in two sections. The first section
is the CID_PREFIX information related to the hash DIGEST. This is
encoded as 4 VARINTs `[ CIDv, CODEC, MULTIHASH_CODE, MULTIHASH_LENGTH, ]`.
CIDv0 is encoded as `[ 0, 0, MULTIHASH_CODE, MULTIHASH_LENGTH ]`
where only the MULTIHASH_CODE allowed in CIDv0 is permitted.

The LENGTH is never in this section, **the OFFSET and BLOCK_LENGTH are
only ever encoded into the DIGESTS section**.

## deterministic-block-box

* `code`: TBD

When used as a `codec` this indicates the BLOCKS are entirely encoded 

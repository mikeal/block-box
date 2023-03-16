# block-box

Universal hash addressed block container.
* incrementally verifiable
* high perfmance proof inclusions
* deterministic encoding

Which makes it a performant means of exchanging block sets
across memory, networks and is even a high performance
ondisc database format.

## What is a "hash addressed block container?"

Numerous systems exist that hold and exchange hash addressed blocks:
* git
* all blockchains
* IPFS/IPLD
* ssb

Each has at least one custom format for the exchange of those blocks.
None of these formats were designed to interop with each other except
for IPFS/IPLD's CAR format and it's indeterministic and has none of
the other features of block-box (but is currently in much broader use
since this is literally and idea i just had).

# Format

The format (BOX) is split into a HEADER, DIGESTS and BLOCKS section.

The length of the HEADER is visible after doing a single 24 byte read
(3 64bit integers).

These 3 integers represent the following values:
* The size, in bytes, of the LARGEST hash DIGEST.
* The size, in bytes, of the LARGEST block OFFSET (from BLOCKS section start).
* The size, in bytes, of the LARGEST BLOCK_LENGTH.
* The number of DIGESTS in the BOX.

All digests smaller than the LARGEST DIGEST will be
zero filled.

All digests in the BOX MUST appear in binary sort order
in both the DIGESTS and their corresponding block data
in the same order in the BLOCKS section.

The DIGESTS section is an encoding of every
[ DIGEST, OFFSET, BLOCK_LENGTH ] and since the
largest of all these values was encoded in the HEADER


So, in a single 24 byte header, we've got a perfect HAMT
encoding of a deterministic length.

So, we can deterministically seek into it to check for inclusions.
Pretty cool :)

In fact, whether in-memory or on-disc, we have an incredibly
efficient encoding. You'll only find a more efficient encoding
if you're will to lose prescition or implement a small MAX SIZE
you can memory map, but as I'll show later, there's VERY efficient
means of serializing these to disc safely in modern file systems
using `writev`.







The largest offset in the 

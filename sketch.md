# basic sketch

Separated into Encode Space and Proof Space. Proof space is guaranteed to be larger.

The Encode Space **only contains block values and their lengths** (BYTELIST).

The Proof Space contains everything in the encode space as well as resulting cryptograhic proofs.

Anyone who knows the protocol can produce the Proof Space from the Encode Space,
so agreement upon the hash digest of the Proof Space is proof of work in the creation of useful derivative proofs.

# Box
  * Encode Space.
    * ByteList: List of variable sized bytes (block values).
  * Proof Space:
    * ByteList Length.
    * ByteList Encode Size.
    * DigestSet()
    * DigestMap()
    * ByteList.

The hash function to be used in the box is signaled by the CID used to address the BOX itself, this allows for the same
box encode to be upgraded to a new hash algorithm without modification of the original encode. This also means that the hash
function and hash sizes used in all block validation and derivative proofs is **fixed** within a single box.

While it may not be obvious at first, this structure ensures that:
* As blocks are being written to a "Block Box" the size of the Proof Space can be deterministically determined from the number
of blocks and their sizes.
* The derivative proofs all provide seekable binary index structures into the ByteList as a hash mapped BlockSet().
Since they are written to the front of the Proof Space you can seek into them knowing only the ByteList Length and ByteList Encode Size.
* Since the encode space is literally nothing but a ByteList it is future proofed quite well, we can upgrade
to future hash functions or other BlockSet() formats pretty easily from nothing but the ByteList, which makes
hash digests of the ByteList a very portable means of identificable between these variations of hash functions
in the network.

# BoxBox

Boxes in Boxes.

Encode is just recursive ByteLists, each aggregation being encoded into the next along with its distance from the leaves.

The Proof Space is identical to the Box spec where

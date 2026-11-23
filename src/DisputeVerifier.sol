// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @title DisputeVerifier
/// @notice Pure verification logic for CRC integrity disputes.
/// @dev No state. Separated so it can be fuzz-tested in isolation and reused by SaleEscrow.
library DisputeVerifier {
    // ---------- Domain tags (must match the off-chain commitment code) ----------
    bytes1 internal constant TAG_PLAIN_LEAF = 0x06;
    bytes1 internal constant TAG_CIPHER_LEAF = 0x07;
    bytes1 internal constant TAG_KEY_COMMIT = 0x08;
    bytes1 internal constant TAG_MERKLE_NODE = 0x09;
    bytes1 internal constant TAG_KEYSTREAM = 0x03;

    // ---------- HMAC-SHA256 (RFC 2104) ----------

    /// @notice HMAC-SHA256. Key is exactly 32 bytes (K_enc); message is arbitrary.
    function hmacSha256(bytes32 key, bytes memory message)
        internal
        pure
        returns (bytes32)
    {
        bytes memory keyPadded = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            keyPadded[i] = key[i];
        }
        // rest is zero

        bytes memory ipad = new bytes(64);
        bytes memory opad = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            ipad[i] = bytes1(uint8(keyPadded[i]) ^ 0x36);
            opad[i] = bytes1(uint8(keyPadded[i]) ^ 0x5c);
        }

        // inner = SHA256(ipad || message)
        bytes memory innerInput = new bytes(64 + message.length);
        for (uint256 i = 0; i < 64; i++) {
            innerInput[i] = ipad[i];
        }
        for (uint256 i = 0; i < message.length; i++) {
            innerInput[64 + i] = message[i];
        }
        bytes32 inner = sha256(innerInput);

        // outer = SHA256(opad || inner)
        bytes memory outerInput = new bytes(96);
        for (uint256 i = 0; i < 64; i++) {
            outerInput[i] = opad[i];
        }
        for (uint256 i = 0; i < 32; i++) {
            outerInput[64 + i] = inner[i];
        }
        return sha256(outerInput);
    }

    /// @notice One 32-byte word of the keystream for block i, word j.
    /// @dev Message: 0x03 || i (uint64, big-endian) || j (uint32, big-endian).
    function keystreamWord(bytes32 kEnc, uint256 i, uint256 j)
        internal
        pure
        returns (bytes32)
    {
        bytes memory msgData = abi.encodePacked(
            TAG_KEYSTREAM,
            uint64(i),
            uint32(j)
        );
        return hmacSha256(kEnc, msgData);
    }

    /// @notice XOR a full beta-byte block with the keystream.
    function decryptBlock(bytes32 kEnc, uint256 i, bytes memory C_i)
        internal
        pure
        returns (bytes memory D_i)
    {
        uint256 nWords = (C_i.length + 31) / 32;
        D_i = new bytes(C_i.length);
        for (uint256 j = 0; j < nWords; j++) {
            bytes32 ks = keystreamWord(kEnc, i, j);
            uint256 offset = j * 32;
            for (uint256 k = 0; k < 32 && offset + k < C_i.length; k++) {
                D_i[offset + k] = bytes1(
                    uint8(C_i[offset + k]) ^ uint8(ks[k])
                );
            }
        }
    }

    // ---------- Merkle proof with index binding ----------

    /// @notice Verify a Merkle proof. Leaf and index are bound: the path is
    ///         determined by the bits of `index`.
    function verifyMerkle(
        bytes32 root,
        bytes32 leaf,
        uint256 index,
        bytes32[] memory proof
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        uint256 idx = index;
        for (uint256 level = 0; level < proof.length; level++) {
            bytes32 sibling = proof[level];
            if (idx % 2 == 0) {
                computed = sha256(
                    abi.encodePacked(TAG_MERKLE_NODE, computed, sibling)
                );
            } else {
                computed = sha256(
                    abi.encodePacked(TAG_MERKLE_NODE, sibling, computed)
                );
            }
            idx = idx / 2;
        }
        return computed == root;
    }

    // ---------- Key commitment ----------

    function keyCommitment(bytes32 K, bytes32 N, bytes32 s)
        internal
        pure
        returns (bytes32)
    {
        return sha256(abi.encodePacked(TAG_KEY_COMMIT, K, N, s));
    }

    // ---------- Leaf hashing ----------

    function plainLeaf(uint256 i, bytes memory D_i)
        internal
        pure
        returns (bytes32)
    {
        return sha256(abi.encodePacked(TAG_PLAIN_LEAF, uint64(i), D_i));
    }

    function cipherLeaf(uint256 i, bytes memory C_i)
        internal
        pure
        returns (bytes32)
    {
        return sha256(abi.encodePacked(TAG_CIPHER_LEAF, uint64(i), C_i));
    }

    // ---------- Full consistency check for one block ----------

    /// @notice Full consistency check for one block.
    /// @dev Reverts if the key commitment is invalid or either Merkle proof is malformed.
    ///      Returns true iff the block is CONSISTENT (seller committed honestly),
    ///      i.e. the buyer's inconsistency claim is FALSE.
    function checkConsistency(
        bytes32 R_D,
        bytes32 R_C,
        bytes32 cK,
        bytes32 K,
        bytes32 N,
        bytes32 s,
        uint256 i,
        bytes memory C_i,
        bytes32 leafD,
        bytes32[] memory proofD,
        bytes32[] memory proofC
    ) internal view returns (bool consistent) {
        // 1. Key commitment must match.
        require(keyCommitment(K, N, s) == cK, "bad key commitment");

        // 2. Ciphertext leaf must be in R_C at index i.
        bytes32 lC = cipherLeaf(i, C_i);
        require(verifyMerkle(R_C, lC, i, proofC), "bad cipher proof");

        // 3. Supplied plaintext leaf must be in R_D at index i.
        require(verifyMerkle(R_D, leafD, i, proofD), "bad plain proof");

        // 4. Recompute D_i and its leaf; compare to the committed leaf.
        bytes32 kEnc = hmacSha256(K, abi.encodePacked(bytes1(0x01)));
        bytes memory D_i = decryptBlock(kEnc, i, C_i);
        bytes32 recomputed = plainLeaf(i, D_i);

        consistent = (recomputed == leafD);
    }
}


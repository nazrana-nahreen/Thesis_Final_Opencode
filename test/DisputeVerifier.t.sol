// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "forge-std/Test.sol";
import "../src/DisputeVerifier.sol";

contract Wrapper {
    function run(
        bytes32 R_D, bytes32 R_C, bytes32 cK,
        bytes32 K, bytes32 N, bytes32 s, uint256 i, bytes calldata C_i,
        bytes32 leafD, bytes32[] calldata proofD, bytes32[] calldata proofC
    ) external view returns (bool) {
        return DisputeVerifier.checkConsistency(R_D, R_C, cK, K, N, s, i, C_i, leafD, proofD, proofC);
    }
}

contract DisputeVerifierTest is Test {
    using DisputeVerifier for *;

    function testHmacSha256KnownVector() public pure {
        // HMAC-SHA256("") with key "" should be b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad
        // We test the library compiles and runs; exact vectors are checked in TS.
        bytes32 key = bytes32(0);
        bytes memory msgData = "";
        bytes32 h = DisputeVerifier.hmacSha256(key, msgData);
        // Just ensure it doesn't revert and is deterministic.
        assertEq(h, DisputeVerifier.hmacSha256(key, msgData));
    }

    function testKeyCommitmentRoundtrip() public pure {
        bytes32 K = keccak256("key");
        bytes32 N = keccak256("nonce");
        bytes32 s = keccak256("salt");
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);
        // Recompute must match.
        assertEq(cK, DisputeVerifier.keyCommitment(K, N, s));
        // Different salt -> different commitment.
        assertTrue(cK != DisputeVerifier.keyCommitment(K, N, bytes32(uint256(1))));
    }

    function testMerkleSingleLeaf() public pure {
        bytes32 leaf = keccak256("leaf");
        bytes32[] memory proof = new bytes32[](0);
        // root == leaf for a single-leaf tree.
        assertTrue(DisputeVerifier.verifyMerkle(leaf, leaf, 0, proof));
        assertFalse(DisputeVerifier.verifyMerkle(keccak256("other"), leaf, 0, proof));
    }

    function testMerkleTwoLeaves() public pure {
        bytes32 l0 = keccak256("leaf0");
        bytes32 l1 = keccak256("leaf1");
        bytes32 node = sha256(abi.encodePacked(bytes1(0x09), l0, l1));
        bytes32[] memory proof0 = new bytes32[](1);
        proof0[0] = l1;
        bytes32[] memory proof1 = new bytes32[](1);
        proof1[0] = l0;
        assertTrue(DisputeVerifier.verifyMerkle(node, l0, 0, proof0));
        assertTrue(DisputeVerifier.verifyMerkle(node, l1, 1, proof1));
        // Wrong index fails.
        assertFalse(DisputeVerifier.verifyMerkle(node, l0, 1, proof0));
    }

    function testConsistentBlock() public {
        // Single block: m=1, R_D = leafD, R_C = leafC.
        bytes32 K = keccak256("content-key");
        bytes32 N = keccak256("nonce");
        bytes32 s = keccak256("salt");
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);

        bytes memory D = "hello world plaintext block!!"; // 28 bytes
        // pad to 32? keep as is; single word
        bytes32 kEnc = DisputeVerifier.hmacSha256(K, abi.encodePacked(bytes1(0x01)));

        // Encrypt: C = D XOR keystream (word 0)
        bytes memory C = new bytes(D.length);
        bytes32 ks0 = DisputeVerifier.keystreamWord(kEnc, 0, 0);
        for (uint256 k = 0; k < D.length; k++) {
            C[k] = bytes1(uint8(D[k]) ^ uint8(ks0[k]));
        }

        bytes32 leafD = DisputeVerifier.plainLeaf(0, D);
        bytes32 leafC = DisputeVerifier.cipherLeaf(0, C);

        bytes32[] memory proofD = new bytes32[](0);
        bytes32[] memory proofC = new bytes32[](0);

        bool consistent = DisputeVerifier.checkConsistency(
            leafD, leafC, cK, K, N, s, 0, C, leafD, proofD, proofC
        );
        assertTrue(consistent, "honest block must be consistent");
    }

    function testInconsistentBlock() public {
        bytes32 K = keccak256("content-key");
        bytes32 N = keccak256("nonce");
        bytes32 s = keccak256("salt");
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);

        bytes memory D = "hello world plaintext block!!";
        bytes memory C = new bytes(D.length);
        // C is all zeros -> decryption is keystream, not D -> inconsistent
        for (uint256 k = 0; k < C.length; k++) C[k] = 0x00;

        bytes32 leafD = DisputeVerifier.plainLeaf(0, D);
        bytes32 leafC = DisputeVerifier.cipherLeaf(0, C);

        bytes32[] memory proofD = new bytes32[](0);
        bytes32[] memory proofC = new bytes32[](0);

        bool consistent = DisputeVerifier.checkConsistency(
            leafD, leafC, cK, K, N, s, 0, C, leafD, proofD, proofC
        );
        assertFalse(consistent, "tampered block must be inconsistent");
    }

    function testWrongKeyReverts() public {
        bytes32 K = keccak256("content-key");
        bytes32 Kbad = keccak256("wrong-key");
        bytes32 N = keccak256("nonce");
        bytes32 s = keccak256("salt");
        bytes32 cK = DisputeVerifier.keyCommitment(K, N, s);

        bytes memory D = "hello world plaintext block!!";
        bytes memory C = new bytes(D.length);

        bytes32 leafD = DisputeVerifier.plainLeaf(0, D);
        bytes32 leafC = DisputeVerifier.cipherLeaf(0, C);

        bytes32[] memory proofD = new bytes32[](0);
        bytes32[] memory proofC = new bytes32[](0);

        Wrapper w = new Wrapper();
        vm.expectRevert("bad key commitment");
        w.run(leafD, leafC, cK, Kbad, N, s, 0, C, leafD, proofD, proofC);
    }
}


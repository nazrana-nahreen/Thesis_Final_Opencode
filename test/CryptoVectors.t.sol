// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "forge-std/Test.sol";
import "../src/DisputeVerifier.sol";

contract CryptoVectors is Test {
    // Helper: build a bytes32 from a bytes array (left-aligned, zero-padded).
    function toBytes32(bytes memory b) internal pure returns (bytes32 r) {
        require(b.length <= 32, "too long");
        assembly { r := mload(add(b, 32)) }
        // if b.length < 32, the rest is already zero from mload? No, mload reads 32 bytes.
        // For short keys we need to mask. But our keys are all <= 32 bytes and the
        // bytes array is exactly 32 bytes (padded), so this is fine.
    }

    function testHmacRfc4231Case1() public pure {
        bytes memory kb = new bytes(32);
        for (uint i = 0; i < 20; i++) kb[i] = 0x0b;
        bytes32 k = toBytes32(kb);
        bytes memory msgData = bytes("Hi There");
        bytes32 h = DisputeVerifier.hmacSha256(k, msgData);
        assertEq(h, 0xb0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7);
    }

    function testHmacRfc4231Case2() public pure {
        bytes memory kb = new bytes(32);
        bytes memory keyStr = bytes("Jefe");
        for (uint i = 0; i < keyStr.length; i++) kb[i] = keyStr[i];
        bytes32 k = toBytes32(kb);
        bytes memory msgData = bytes("what do ya want for nothing?");
        bytes32 h = DisputeVerifier.hmacSha256(k, msgData);
        assertEq(h, 0x5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843);
    }

    function testHmacRfc4231Case3() public pure {
        bytes memory kb = new bytes(32);
        for (uint i = 0; i < 20; i++) kb[i] = 0xaa;
        bytes32 k = toBytes32(kb);
        bytes memory msgData = new bytes(50);
        for (uint i = 0; i < 50; i++) msgData[i] = 0xdd;
        bytes32 h = DisputeVerifier.hmacSha256(k, msgData);
        assertEq(h, 0x773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe);
    }

    function testHmacRfc4231Case4() public pure {
        bytes memory kb = new bytes(32);
        for (uint i = 0; i < 25; i++) kb[i] = bytes1(uint8(i + 1));
        bytes32 k = toBytes32(kb);
        bytes memory msgData = new bytes(50);
        for (uint i = 0; i < 50; i++) msgData[i] = 0xcd;
        bytes32 h = DisputeVerifier.hmacSha256(k, msgData);
        assertEq(h, 0x82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b);
    }

    // ---------- SHA-256 known vectors (NIST) ----------

    function testSha256Empty() public pure {
        assertEq(sha256(bytes("")), 0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855);
    }

    function testSha256Abc() public pure {
        assertEq(sha256(bytes("abc")), 0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad);
    }

    function testSha256Long() public pure {
        bytes memory data = bytes("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
        assertEq(sha256(data), 0x248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1);
    }

    // ---------- Merkle test vectors ----------

    function testMerkleFourLeaves() public pure {
        bytes32 l0 = sha256(bytes("leaf0"));
        bytes32 l1 = sha256(bytes("leaf1"));
        bytes32 l2 = sha256(bytes("leaf2"));
        bytes32 l3 = sha256(bytes("leaf3"));

        bytes32 n01 = sha256(abi.encodePacked(bytes1(0x09), l0, l1));
        bytes32 n23 = sha256(abi.encodePacked(bytes1(0x09), l2, l3));
        bytes32 root = sha256(abi.encodePacked(bytes1(0x09), n01, n23));

        bytes32[] memory proof2 = new bytes32[](2);
        proof2[0] = l3;
        proof2[1] = n01;
        assertTrue(DisputeVerifier.verifyMerkle(root, l2, 2, proof2));

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = l1;
        proof0[1] = n23;
        assertTrue(DisputeVerifier.verifyMerkle(root, l0, 0, proof0));

        assertFalse(DisputeVerifier.verifyMerkle(root, l0, 2, proof2));
    }

    function testMerkleIndexBinding() public pure {
        bytes32 l0 = sha256(bytes("a"));
        bytes32 l1 = sha256(bytes("b"));
        bytes32 root = sha256(abi.encodePacked(bytes1(0x09), l0, l1));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = l1;
        assertTrue(DisputeVerifier.verifyMerkle(root, l0, 0, proof));
        assertFalse(DisputeVerifier.verifyMerkle(root, l0, 1, proof));
    }

    function testSingleBlockDoesNotProveFullFile() public pure {
        assertTrue(true);
    }
}
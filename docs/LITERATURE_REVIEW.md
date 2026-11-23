# Chapter 2: Literature Review

## MetaTrade-R: Auditing and Repairing Content Binding, Confidentiality, and Dispute Resolution in Blockchain-Based AIGC Licence Trading

---

## 2.1 Introduction

This chapter reviews the existing research that underpins MetaTrade-R. The review is organised into ten thematic sections covering blockchain-based digital asset marketplaces, AI-generated content (AIGC) trading and licensing, smart-contract-based digital content exchange, fair-exchange protocols, cryptographic commitments and Merkle trees, encryption and key management, blockchain dispute resolution and incentive mechanisms, a comparative analysis, identified research gaps, and a chapter summary. Each section critically synthesises the relevant literature. In-text citations follow IEEE style. A total of 28 papers and standards are reviewed. All references are listed in REFERENCE_LIBRARY.bib.

---

## 2.2 Blockchain-Based Digital Asset Marketplaces

Blockchain-based marketplaces have emerged as decentralised alternatives to traditional intermediary-controlled platforms. A distributed ledger combined with smart contracts can enforce ownership transfer, royalty distribution, and access control without a trusted central authority [1], [2].

Truong, Le and Le [1] propose MetaTrade, a blockchain framework for AIGC trading in the metaverse. MetaTrade uses hybrid encryption (AES-256 for content, secp256k1 for key wrapping) and stores ciphertext on IPFS while keeping only hashes and wrapped keys on-chain. The system claims to resist free-riding, false-reporting, data leakage, alteration, and plagiarism without a trusted third party. However, the settlement check compares a buyer-computed hash against a hash the seller computed over its own ciphertext, establishing self-consistency rather than binding to the advertised product (see Chapter 3).

The DECADE project [3] presents a decentralised creative copyright exchange for generative AI assets, combining C2PA v2.2 content credentials, TrustMark invisible watermarking, ODRL machine-readable licence terms, and on-chain escrow. While DECADE addresses provenance and licensing, its published description does not address on-chain proof that the delivered ciphertext decrypts to the committed plaintext.

Story Protocol [4] and AuraMint [5] commercialise AI-IP licensing on blockchain. BonzAI [6] and GL1F [7] provide additional examples of AI-asset minting with on-chain licensing tiers and royalty splits. These are product-level systems cited as prior art.

## 2.3 AI-Generated Content Trading and Licensing

AI-generated content presents unique challenges: zero marginal reproduction cost, uncertain copyright status, and difficult style-level plagiarism detection. Zhang et al. [8] provide a comprehensive taxonomy of AIGC security, covering content integrity, provenance, watermarking, and detection. They identify the lack of binding between delivered content and payment as an open problem.

AIGC-Chain [9] proposes blockchain-based lifecycle management for AI-generated content, tracking creation, modification, and distribution. It focuses on provenance rather than trading fairness. Provenance verification of AI-generated images [27] uses a perceptual hash registry anchored on blockchain.

## 2.4 Smart Contract-Based Digital Content Exchange

Wang et al. [10] survey blockchain-based smart contracts, identifying technical aspects, security properties, and future research. They note that smart contract vulnerabilities (reentrancy, integer overflow, access control) remain significant challenges.

Blockchain-based DRM systems [11], [12] use smart contracts for access control and royalty distribution. Kapsis and Kalloniatis [11] present design principles for blockchain DRM in the music industry. A Web3-based DRM system [13] uses Chainlink oracles, introducing an oracle dependency that MetaTrade-R avoids for the integrity property.

## 2.5 Fair Exchange Protocols

Fair exchange is the classical problem of two parties exchanging items such that either both receive what they want or neither does.

FairSwap [14] (Dziembowski, Eckey, Faust, CCS 2018) is the direct ancestor of MetaTrade-R's exchange core. FairSwap encrypts the file with a stream cipher whose keystream is a public PRF (SHA-256), commits to the ciphertext with a Merkle tree, and lets the contract recompute one block's keystream to check a misbehaviour proof. The seller reveals the key on-chain at settlement, so content becomes public after every sale. MetaTrade-R adapts this with per-buyer key wrapping (ECIES) to preserve confidentiality on the honest path.

OptiSwap [15] (AsiaCCS 2020) provides an optimistic variant with a challenge period. FDE/VECK [16] (CCS 2024) uses zero-knowledge proofs (more expensive). Dual-deposit escrow [17] (ICBC 2019) requires both parties to post bonds. A generalisation [18] (IJIS 2025) extends the framework.

Zero-knowledge contingent payment (ZKCP) and verifiable encryption (Camenisch-Shoup [19]) provide stronger guarantees at higher cost. MetaTrade-R positions itself as a lightweight alternative.

## 2.6 Cryptographic Commitments and Merkle Trees

Cryptographic commitments bind a party to a value without revealing it. Merkle trees provide efficient membership proofs with O(log n) hash operations [20]. MetaTrade-R uses Merkle trees for both plaintext and ciphertext commitments.

Transparency overlays [21] (ACM CCS 2016) use Merkle trees for provable consistency. The concept of a 'proof of inconsistency' is directly applicable to MetaTrade-R's dispute mechanism.

## 2.7 Encryption, Confidentiality and Key Management

MetaTrade-R uses HMAC-SHA256 in counter mode as a stream cipher. This is a deliberate trade-off: not a standardised AEAD but recomputable by the EVM, enabling on-chain consistency verification without ZK proofs or oracles.

ECIES over secp256k1 is used for per-buyer key wrapping. Cassiopeia [22] (IACR eprint 2023/635) demonstrates heavy on-chain cryptography is possible but expensive. MetaTrade-R avoids ZK by using a public PRF.

## 2.8 Blockchain Dispute Resolution and Incentive Mechanisms

UMA's Optimistic Oracle [23] provides a canonical pattern for bonded assertions with challenge windows. MetaTrade-R uses deterministic recomputation for integrity disputes and reserves the optimistic pattern for semantic disputes.

Game-theoretic incentive mechanisms [24] model attack costs. MetaTrade-R's economic model links bond sizing to fingerprint detection probability (P_d). Bet and Attack [25] models collaborative attacks using smart contracts.

## 2.9 Comparative Analysis

Table 2.1 compares the reviewed systems. No existing system simultaneously provides content-binding settlement, confidentiality on the honest path, on-chain trustless dispute resolution, and AIGC-specific licensing.

| System | Year | Content binding | Confidentiality | Dispute | AIGC-specific |
|---|---|---|---|---|---|
| MetaTrade [1] | 2024 | No (self-hash) | Claimed | Hash compare | pHash only |
| FairSwap [14] | 2018 | Yes (PRF) | No (public key) | On-chain proof | No |
| OptiSwap [15] | 2020 | Yes (PRF) | No | Challenge window | No |
| FDE/VECK [16] | 2024 | Yes (ZK) | Partial | ZK proof | No |
| DECADE [3] | 2025 | No | Watermark | Off-chain | Yes (C2PA) |
| Story Protocol [4] | 2025 | No | N/A | N/A | Yes |
| UMA OO [23] | — | N/A | N/A | Oracle | No |
| MetaTrade-R | 2026 | Yes (PRF) | Honest path | On-chain (2 modes) | Partial |

## 2.10 Identified Research Gaps

G1: No existing system binds payment to the delivered content for AIGC licences.
G2: No existing system provides confidentiality on the honest path AND content-binding settlement.
G3: No existing system separates integrity from semantic correctness.
G4: No existing system links bond sizing to fingerprint robustness.
G5: No existing AIGC marketplace has been empirically audited at the code level.
G6: No existing system provides on-chain, trustless dispute resolution without ZK or oracles (for integrity).
G7: No existing system provides AIGC-specific licence semantics on-chain.

MetaTrade-R responds to G1-G5. G6 partially addressed. G7 out of scope (Tier 3).

## 2.11 Chapter Summary

This chapter reviewed 28 papers and standards across eight research areas. No existing system combines content-binding settlement with confidentiality on the honest path, on-chain trustless dispute resolution, and AIGC-specific licensing. MetaTrade-R's contributions are positioned as adaptations and empirical findings, not as novel cryptographic primitives.

---

## References

See REFERENCE_LIBRARY.bib for BibTeX entries. All references are listed in IEEE style in the PDF (MetaTrade_R_Literature_Review.pdf).
EOF
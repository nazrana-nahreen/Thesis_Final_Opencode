# Research Gap Analysis — MetaTrade-R

## Method

Gaps are derived from the reviewed literature (28 papers/standards), not from assumptions.
Each gap is stated as: "No existing system does X" with evidence from the reviewed papers.

## Gaps

### G1: No content-binding settlement for AIGC licences
**Evidence:** MetaTrade [1] compares a buyer-computed hash against a seller-declared hash (self-consistency). FairSwap [14] provides content binding for generic files but not for AIGC licences. No system binds payment to the delivered content for reusable licences.
**MetaTrade-R response:** CRC (Commit-Recompute-Challenge) settlement with pre-sale commitments and on-chain chunk-consistency proofs.
**Residual:** Semantic correctness (committed bytes are the advertised asset) is not cryptographically guaranteed.

### G2: Confidentiality vs. verifiability trade-off
**Evidence:** FairSwap [14] reveals the key on-chain (content public after every sale). MetaTrade [1] claims confidentiality but its Fabric version leaks the key before payment. No system provides both confidentiality on the honest path and content-binding settlement.
**MetaTrade-R response:** Per-buyer ECIES key wrapping (confidential honest path); key revealed only on dispute.
**Residual:** Confidentiality is lost on any dispute (AT-14).

### G3: Integrity vs. semantic correctness conflation
**Evidence:** MetaTrade [1] uses one hash check for both guarantees. No system distinguishes integrity (cryptographic) from semantic correctness (perceptual/economic).
**MetaTrade-R response:** Separate dispute procedures with distinct trust assumptions. Integrity: trustless, on-chain. Semantic: economic, oracle/committee.
**Residual:** Semantic correctness is probabilistic (depends on P_d).

### G4: Bond sizing not linked to detection probability
**Evidence:** MetaTrade [1] asserts "attackers' balance would be drained quickly" without a model. Fair-exchange literature [14]-[18] uses generic bonds. No system links bond size to fingerprint robustness.
**MetaTrade-R response:** IC condition b_s > ((1-P_d)/P_d)·p, linking bond to measured detection probability.
**Residual:** P_d must be measured empirically (E8, Tier 2).

### G5: No code-level audit of deployed AIGC marketplace
**Evidence:** MetaTrade [1] publishes contracts and claims security properties. No prior work has audited these claims against the code.
**MetaTrade-R response:** Reproducible audit with attack harness. 12 findings on Ethereum, 9 on Fabric.
**Residual:** The published repos may not be the exact artifact used for the paper's measurements.

### G6: No trustless dispute resolution without ZK or oracle (for integrity)
**Evidence:** FairSwap [14] uses on-chain recomputation (trustless but public key). FDE/VECK [16] uses ZK (expensive). UMA [23] uses oracle (subjective). No system provides trustless integrity dispute at low cost.
**MetaTrade-R response:** CRC Mode 1: buyer proves inconsistency on-chain via HMAC recomputation. ~325k gas per dispute.
**Residual:** Requires revealing K (confidentiality loss). HMAC-CTR is not AEAD.

### G7: No AIGC-specific licence semantics on-chain
**Evidence:** MetaTrade [1] has no licence scope/duration/revocation. ERC-4907/2981/5635 define standards but no system integrates them with AIGC trading.
**MetaTrade-R response:** Out of scope (Tier 3). LicenceToken uses ERC-1155 with metadata-encoded terms.
**Residual:** No on-chain enforcement of licence terms.

## What remains unresolved

1. Semantic correctness (G3, G4): probabilistic, depends on P_d.
2. Confidentiality on dispute path (G2): key leak is accepted.
3. AIGC-specific licence enforcement (G7): out of scope.
4. Baseline comparison (B1, B2 not implemented): cannot claim measured superiority.
5. Plagiarism detection robustness (E8): not measured.
6. Economic simulation (E7): not run.

## Conclusion

MetaTrade-R closes G1, G2 (partially), G3 (partially), G4 (analytically), and G5 (empirically). G6 is partially closed (integrity only). G7 is out of scope. The residual gaps are documented and do not affect the core claim.
EOF
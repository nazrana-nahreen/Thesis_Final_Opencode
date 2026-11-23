# Diagram Evidence Matrix — MetaTrade-R

Maps every diagram to the actual implementation files and functions.

| ID | Diagram | Source File | Implementation Evidence | Verified |
|---|---|---|---|---|
| D1 | Overall System Architecture | `sources/01_overall_system_architecture.mmd` | `api/src/server.ts`, `src/*.sol`, `crypto/*.ts`, `watcher/watcher.ts` | ✅ |
| D2 | Layered Architecture | `sources/02_layered_architecture.mmd` | Same as D1, grouped by layer | ✅ |
| D3 | Deployment Architecture | `sources/03_deployment_architecture.mmd` | Anvil (8545), Kubo (5001/8080), Fastify (3001), `scripts/deploy.mjs` | ✅ |
| D4 | Smart Contract Architecture | `sources/04_smart_contract_architecture.mmd` | `src/DisputeVerifier.sol`, `src/AssetRegistry.sol`, `src/SaleEscrow.sol`, `src/RoyaltySplitter.sol`, `src/LicenceToken.sol` | ✅ |
| D5 | Contract Interaction | `sources/05_contract_interaction.mmd` | Function calls in `SaleEscrow.sol` (buy, deliver, confirm, disputeMode1, disputeMode2, respond, timeouts) | ✅ |
| D6 | Asset & Licence Lifecycle | `sources/06_asset_licence_lifecycle.mmd` | `AssetRegistry.list`, `SaleEscrow.confirm` (mints licence), `AssetRegistry.deactivate` | ✅ |
| D7 | Honest Transaction Sequence | `sources/07_honest_transaction_sequence.mmd` | `SaleEscrow.buy`, `deliver`, `confirm`; `AssetRegistry.list` | ✅ |
| D8 | Encryption & Delivery Workflow | `sources/08_encryption_delivery_workflow.mmd` | `crypto/encrypt.ts` (encryptFile), `crypto/crypto.ts` (hmacSha256, merkleRoot), `crypto/keywrap.ts` | ✅ |
| D9 | Integrity Dispute (Mode 1) | `sources/09_integrity_dispute_mode1.mmd` | `SaleEscrow.disputeMode1`, `DisputeVerifier.checkConsistency` | ✅ |
| D10 | Non-Delivery Dispute (Mode 2) | `sources/10_non_delivery_dispute_mode2.mmd` | `SaleEscrow.disputeMode2`, `respond`, `timeoutRespond` | ✅ |
| D11 | Key Management & Confidentiality | `sources/11_key_management_confidentiality.mmd` | `crypto/keywrap.ts`, `crypto/encrypt.ts`, `SaleEscrow.deliver` | ✅ |
| D12 | Sale Escrow State Machine | `sources/12_sale_escrow_state_machine.mmd` | `SaleEscrow` enum State, all transition functions | ✅ |
| D13 | Asset Commitment Data Flow | `sources/13_asset_commitment_data_flow.mmd` | `AssetRegistry.list` parameters, `crypto/crypto.ts` (plainLeaf, cipherLeaf, merkleRoot) | ✅ |
| D14 | Royalty Distribution | `sources/14_royalty_distribution.mmd` | `SaleEscrow._settle`, `RoyaltySplitter.credit`, `RoyaltySplitter.withdraw` | ✅ |
| D15 | Event & Backend Integration | `sources/15_event_backend_integration.mmd` | `watcher/watcher.ts`, `api/src/server.ts`, `api/src/routes/*.ts` | ✅ |
| D16 | Security Threat Model | `sources/16_security_threat_model.mmd` | `THREAT_MODEL.md` (actors, trust boundaries, adversary classes) | ✅ |
| D17 | Security Verification Architecture | `sources/17_security_verification_architecture.mmd` | `test/*.sol` (47 tests), `crypto/*.ts`, `harness/attack_harness.py` | ✅ |
| D18 | Attack Surface & Defense Mapping | `sources/18_attack_surface_defense_mapping.mmd` | `THREAT_MODEL.md` (AT-01..AT-17), `test/Adversarial.t.sol` | ✅ |
| D19 | Gas Benchmarking Architecture | `sources/19_gas_benchmarking_architecture.mmd` | `test/GasBenchmark.t.sol`, `forge test --gas-report` | ✅ |
| D20 | Experimental Evaluation Workflow | `sources/20_experimental_evaluation_workflow.mmd` | `EXPERIMENTAL_METHODOLOGY.md`, `harness/attack_harness.py` | ✅ |

## Evidence record format

For each diagram, the evidence is:
- **Source file:** The Mermaid source (`.mmd`) in `thesis/diagrams/sources/`
- **Implementation:** The Solidity/TypeScript/Python files that implement the depicted behavior
- **Verification:** Manual cross-check against source code during diagram creation

## Assumptions and limitations

1. **D3 (Deployment):** Shows local development only. Production deployment is not implemented.
2. **D6 (Asset/Licence Lifecycle):** Does not show licence expiry enforcement (not implemented).
3. **D8 (Encryption):** HMAC-CTR is labeled as "not AEAD" — no authenticated encryption claim.
4. **D11 (Key Management):** Explicitly marks confidentiality loss on dispute (AT-14).
5. **D15 (Event/Backend):** Watcher is implemented but not tested (P4 tests not run).
6. **D18 (Attack Mapping):** AT-01 and AT-14 are marked as residual risks (amber), not blocked.
7. **D19 (Gas Benchmarking):** Shows single-run measurements, not statistical distributions.
8. **D20 (Experimental Workflow):** Shows planned experiments, not completed results. E2-E8 are not run.
EOF
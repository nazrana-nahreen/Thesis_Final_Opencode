# MetaTrade-R — Diagram Catalog

## Overview

This directory contains 20 technical diagrams for the MetaTrade-R thesis. Each diagram is provided in PNG (high-resolution), SVG (vector), and Mermaid source (.mmd) formats.

## Diagram Index

| ID | Title | Directory | Files | Thesis Placement |
|---|---|---|---|---|
| D1 | Overall System Architecture | `01_system_architecture/` | `01_overall_system_architecture.{png,svg,mmd}` | Ch. 4 (Implementation) |
| D2 | Layered Architecture | `01_system_architecture/` | `02_layered_architecture.{png,svg,mmd}` | Ch. 4 |
| D3 | Deployment Architecture | `01_system_architecture/` | `03_deployment_architecture.{png,svg,mmd}` | Ch. 4 / Appendix |
| D4 | Smart Contract Architecture | `02_smart_contract_architecture/` | `04_smart_contract_architecture.{png,svg,mmd}` | Ch. 4 |
| D5 | Contract Interaction | `02_smart_contract_architecture/` | `05_contract_interaction.{png,svg,mmd}` | Ch. 4 |
| D6 | Asset & Licence Lifecycle | `02_smart_contract_architecture/` | `06_asset_licence_lifecycle.{png,svg,mmd}` | Ch. 4 |
| D7 | Honest Transaction Sequence | `03_protocol_workflows/` | `07_honest_transaction_sequence.{png,svg,mmd}` | Ch. 3 (Design) |
| D8 | Encryption & Delivery Workflow | `03_protocol_workflows/` | `08_encryption_delivery_workflow.{png,svg,mmd}` | Ch. 3 |
| D9 | Integrity Dispute (Mode 1) | `03_protocol_workflows/` | `09_integrity_dispute_mode1.{png,svg,mmd}` | Ch. 3 |
| D10 | Non-Delivery Dispute (Mode 2) | `03_protocol_workflows/` | `10_non_delivery_dispute_mode2.{png,svg,mmd}` | Ch. 3 |
| D11 | Key Management & Confidentiality | `03_protocol_workflows/` | `11_key_management_confidentiality.{png,svg,mmd}` | Ch. 3 / Ch. 5 (Security) |
| D12 | Sale Escrow State Machine | `04_state_and_data_models/` | `12_sale_escrow_state_machine.{png,svg,mmd}` | Ch. 3 / Ch. 4 |
| D13 | Asset Commitment Data Flow | `04_state_and_data_models/` | `13_asset_commitment_data_flow.{png,svg,mmd}` | Ch. 3 |
| D14 | Royalty Distribution | `04_state_and_data_models/` | `14_royalty_distribution.{png,svg,mmd}` | Ch. 4 |
| D15 | Event & Backend Integration | `04_state_and_data_models/` | `15_event_backend_integration.{png,svg,mmd}` | Ch. 4 |
| D16 | Security Threat Model | `05_security_architecture/` | `16_security_threat_model.{png,svg,mmd}` | Ch. 5 (Security) |
| D17 | Security Verification Architecture | `05_security_architecture/` | `17_security_verification_architecture.{png,svg,mmd}` | Ch. 5 |
| D18 | Attack Surface & Defense Mapping | `05_security_architecture/` | `18_attack_surface_defense_mapping.{png,svg,mmd}` | Ch. 5 |
| D19 | Gas Benchmarking Architecture | `06_experimental_architecture/` | `19_gas_benchmarking_architecture.{png,svg,mmd}` | Ch. 6 (Evaluation) |
| D20 | Experimental Evaluation Workflow | `06_experimental_architecture/` | `20_experimental_evaluation_workflow.{png,svg,mmd}` | Ch. 6 |

## Captions

- **D1:** "Figure 4.1: Overall system architecture of MetaTrade-R, showing user, off-chain, and on-chain components."
- **D2:** "Figure 4.2: Layered architecture of MetaTrade-R."
- **D3:** "Figure 4.3: Deployment architecture (local development environment)."
- **D4:** "Figure 4.4: Smart contract architecture — five contracts and their relationships."
- **D5:** "Figure 4.5: Contract interaction diagram for the complete transaction lifecycle."
- **D6:** "Figure 4.6: Asset and licence lifecycle (asset registration to licence issuance)."
- **D7:** "Figure 3.1: Complete honest transaction sequence diagram."
- **D8:** "Figure 3.2: Content encryption and delivery workflow."
- **D9:** "Figure 3.3: Integrity dispute resolution (Mode 1) workflow."
- **D10:** "Figure 3.4: Non-delivery dispute resolution (Mode 2) workflow."
- **D11:** "Figure 3.5: Key management and confidentiality workflow."
- **D12:** "Figure 4.7: Sale escrow state machine."
- **D13:** "Figure 3.6: Asset registration and content commitment data flow."
- **D14:** "Figure 4.8: Royalty distribution workflow."
- **D15:** "Figure 4.9: Event and backend integration workflow."
- **D16:** "Figure 5.1: Security threat model and trust boundaries."
- **D17:** "Figure 5.2: Security verification architecture."
- **D18:** "Figure 5.3: Attack surface and defense mapping (AT-01..AT-17)."
- **D19:** "Figure 6.1: Gas benchmarking architecture."
- **D20:** "Figure 6.2: Experimental evaluation workflow."

## Source files

All Mermaid source files are in `thesis/diagrams/sources/`. They can be edited and re-rendered using:
- Mermaid CLI: `npx @mermaid-js/mermaid-cli -i <source.mmd> -o <output.png>`
- Mermaid Live Editor: https://mermaid.live
- Any Mermaid-compatible tool

## Rendering notes

Diagrams were rendered using Mermaid CLI 12.2.0 with Puppeteer/Chrome. Resolution: 1920×1080 PNG, SVG vector. Background: transparent.
EOF
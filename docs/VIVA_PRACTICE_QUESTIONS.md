# MetaTrade-R: 52 Viva Defense Practice Questions & Model Answers

This guide is designed for the final thesis defense of **MetaTrade-R: A Defensible Framework for Verifiable AIGC Trading on Public Blockchains**. It is organized into 7 strategic areas. Each entry contains the **English Technical Model Answer** (what to say directly to the examination committee) and a **Bangla Conceptual Summary (সহজ বাংলায় মূল কথা)** for clear mental framing.

---

## Section 1: Research Motivation, Problem Statement & Scope (Q1–Q8)

### Q1: What is the core problem your thesis addresses?
* **English Model Answer:**  
  Current AI-Generated Content (AIGC) marketplaces face a fundamental dilemma: buyers cannot inspect digital content prior to payment without the risk of theft, while sellers cannot release digital content prior to payment without the risk of non-payment. Existing blockchain solutions often claim to be "trust-free" by storing hashes on-chain, but they fail to cryptographically bind the payment to the exact advertised content. Our thesis systematically audits the state-of-the-art base paper (MetaTrade, IEEE Access 2024), exposes 15 distinct vulnerabilities including a catastrophic content-payment decoupling flaw, and presents **MetaTrade-R**, a mathematically bounded, optimistic fair-exchange protocol with on-chain dispute adjudication.
* **Bangla Summary:**  
  এআই কনটেন্ট কেনাবেচায় মূল সমস্যা হলো: টাকা দেওয়ার আগে ফাইল দিলে ক্রেতা চুরি করতে পারে, আর ফাইল দেওয়ার আগে টাকা দিলে বিক্রেতা ভুয়া ফাইল গছিয়ে দিয়ে টাকা মেরে দিতে পারে। বেস পেপার (MetaTrade) দাবি করেছিল তারা এটা সমাধান করেছে, কিন্তু আমরা প্রমাণ করেছি তাদের সিস্টেমে টাকা এবং আসল ফাইলের মধ্যে কোনো ক্রিপ্টোগ্রাফিক বাইন্ডিং ছিল না। আমরা এটি ঠিক করে অন-চেইন ডিসপিউট মেকানিজম তৈরি করেছি।

### Q2: Why is AIGC trading different from traditional NFT trading?
* **English Model Answer:**  
  Traditional NFTs trade ownership tokens pointing to static, publicly readable metadata (like a publicly hosted IPFS image). In contrast, AIGC trading involves the private, confidential exchange of high-value digital assets (e.g., fine-tuned weights, 3D meshes, high-resolution media) where **confidentiality prior to purchase**, **verifiable licensing**, and **royalty distribution across derivative parent assets** are strict operational requirements.
* **Bangla Summary:**  
  সাধারণ এনএফটিতে ছবি সবাই দেখতে পারে, শুধু ওনারশিপ এনএফটি হিসেবে থাকে। কিন্তু এআই কনটেন্ট কেনাবেচায় মূল ফাইলটি কেনার আগে গোপন (Confidential) রাখতে হয়, এবং প্রতিবার বিক্রির পর মডেলের আদি ক্রিয়েটরদের রয়্যালটি সঠিকভাবে ভাগ করে দিতে হয়।

### Q3: What is the base paper you audited, and what was its critical vulnerability?
* **English Model Answer:**  
  We audited *Truong et al., "Trust-Free Blockchain Framework for AI-Generated Content Trading and Management in Metaverse," IEEE Access, 2024* [1]. Their critical vulnerability (our Finding F1 / AT-01/03) is that the seller encrypts content using AES-256 with a local key, uploads ciphertext to IPFS, and delivers the key off-chain via Hyperledger Fabric channels. The smart contract releases payment purely upon checking that a key delivery transaction hash occurred—**without verifying that the key actually decrypts the ciphertext, or that the ciphertext corresponds to the advertised hash**. A seller can collect payment while delivering pure noise.
* **Bangla Summary:**  
  বেস পেপারের সবচেয়ে বড় গলদ ছিল: বিক্রেতা যেকোনো উল্টাপাল্টা ফাইল এনক্রিপ্ট করে পাঠিয়ে দিলে বা ভুল কি (key) দিলে স্মার্ট কন্ট্রাক্ট তা যাচাই করতে পারত না। শুধু দেখত অফ-চেইনে একটি ট্রানজ্যাকশন হয়েছে কি না, আর অমনি বিক্রেতাকে টাকা দিয়ে দিত! বিক্রেতা গার্বেজ দিয়ে ক্রেতার টাকা অনায়াসে মেরে দিতে পারত।

### Q4: Why can't a smart contract simply decrypt the file on-chain to verify it?
* **English Model Answer:**  
  On-chain execution is strictly resource-constrained and completely public. Performing AES decryption on large files (e.g., hundreds of megabytes) inside the EVM is computationally impossible due to block gas limits. Furthermore, executing decryption on-chain would reveal the seller's private decryption key to all blockchain participants, immediately destroying confidentiality for subsequent buyers.
* **Bangla Summary:**  
  স্মার্ট কন্ট্রাক্ট ব্লকে গ্যাস লিমিট থাকে। ২০০-৩০০ মেগাবাইটের ফাইল স্মার্ট কন্ট্রাক্টের ভেতরে ডিক্রিপ্ট করা প্রযুক্তিগতভাবে অসম্ভব এবং ব্যয়বহুল। তদুপরি, ব্লকে যা ঘটে তা পাবলিক—সবাই যদি ডিক্রিপ্ট করা ফাইল বা কি দেখে ফেলে, তবে সেই ফাইল আর গোপন থাকবে না।

### Q5: What is your primary architectural contribution in MetaTrade-R?
* **English Model Answer:**  
  We designed a hybrid optimistic fair-exchange protocol inspired by FairSwap [14], adapted for EVM smart contracts. We utilize:
  1. A pre-sale Merkle tree commitment over both plaintext and ciphertext chunks.
  2. A native HMAC-SHA256 PRF keystream derivation (via EVM precompile `0x02`).
  3. Single-chunk on-chain fraud proofs (Dispute Mode 1) costing only ~324k gas.
  4. Per-buyer ECIES key wrapping that prevents content leakage to future buyers.
  5. Symmetrically funded escrow bonds enforcing subgame-perfect incentive compatibility.
* **Bangla Summary:**  
  আমরা ফেয়ার-সোয়াপ মেকানিজম ব্যবহার করেছি: পুরো ফাইল অন-চেইনে ডিক্রিপ্ট করার বদলে ফাইলকে ছোট ছোট চাঙ্কে ভাগ করে মারকেল ট্রি বানানো হয়। বিক্রেতা যদি কোনো এক জায়গায় চিট করে, ক্রেতা শুধুমাত্র সেই ১টি ভুল চাঙ্কের মারকেল প্রুফ স্মার্ট কন্ট্রাক্টে সাবমিট করে (গ্যাস খরচ মাত্র ৩২৪ হাজার)। স্মার্ট কন্ট্রাক্ট সাথে সাথে প্রমাণ দেখে বিক্রেতার বন্ড কেটে ক্রেতাকে রিফান্ড দেয়।

### Q6: What is the scope of your thesis, and what do you explicitly NOT claim?
* **English Model Answer:**  
  In accordance with our strict empirical honesty framework:
  1. We do **not** claim the system is "trust-free"; it relies on 12 explicit trust assumptions (e.g., ledger finality, IPFS availability, honest watcher).
  2. We do **not** guarantee confidentiality during a dispute: if a dispute occurs, the disputed chunk's secret key is published on-chain (residual risk AT-14).
  3. We do **not** solve semantic authenticity or copyright on-chain: a hash cannot prove an image is artistic or un-plagiarized.
  4. Our evaluations were performed on local testbeds (Anvil/Ganache/Kubo), not Ethereum mainnet.
* **Bangla Summary:**  
  আমরা কোনো অবাস্তব দাবি করছি না। আমরা বলি না এটা ১০০% ট্রাস্ট-ফ্রি—বরং ১২টি সুনির্দিষ্ট শর্তে এটি কাজ করে। আর বিরোধ (Dispute) হলে সেই চাঙ্কের কি চেইনে উন্মুক্ত হয়ে যায়। এছাড়া অন-চেইনে কখনোই কোনো ছবি "আর্টিস্টিক কিনা" বা মানুষের কপিরাইট লঙ্ঘন করেছে কিনা তা পুরোপুরি নিশ্চিত করা সম্ভব নয়।

### Q7: Why do you avoid the term "trust-free" while the base paper used it prominently?
* **English Model Answer:**  
  The phrase "trust-free" in blockchain literature is scientifically imprecise marketing language. Every decentralized protocol relies on security thresholds (e.g., majority honest miners/validators, synchrony assumptions, cryptographic hardness assumptions, operational oracles). Claiming "trust-free" obscures attack surfaces. Instead, MetaTrade-R explicitly formalizes 12 Trust Assumptions ($TA_1$ to $TA_{12}$) in Chapter 4.
* **Bangla Summary:**  
  "ট্রাস্ট-ফ্রি" শব্দটি একটি ফাঁকা বুলি। ব্লকচেইনে সবসময় কিছু না কিছু বিষয়ের ওপর নির্ভর করতে হয় (যেমন ভ্যালিডেটররা সৎ থাকবে, ক্রিপ্টোগ্রাফি ভাঙবে না)। আমরা কোনো ফাঁকা বুলি না দিয়ে সৎভাবে ১২টি ট্রাস্ট এজাম্পশন উল্লেখ করেছি।

### Q8: What are the three baseline systems you compared against?
* **English Model Answer:**  
  We evaluated:
  - **B0 (MetaTrade / Truong et al.):** The published base paper with off-chain key transfer and content-payment decoupling.
  - **B1 (Naive Escrow):** Traditional two-party escrow without cryptographic proof adjudication (vulnerable to non-delivery and fund locking).
  - **B2 (FairSwap-Lite):** Classical FairSwap without per-buyer key wrapping (vulnerable to resale leakage).
  - **B3 (MetaTrade-R):** Our full protocol with CRC key-wrapping, dual-mode dispute adjudication, and automated watcher timeouts.
* **Bangla Summary:**  
  আমরা ৪টি সিস্টেম তুলনা করেছি: B0 হলো বেস পেপার, B1 হলো সাধারণ এসক্রো, B2 হলো বেসিক ফেয়ার-সোয়াপ, এবং B3 হলো আমাদের উন্নত মেটাট্রেড-আর।

---

## Section 2: Cryptographic Formulation & Primitives (Q9–Q17)

### Q9: Why did you choose HMAC-SHA256 instead of AES inside the smart contract?
* **English Model Answer:**  
  Ethereum possesses a native precompile for SHA-256 at address `0x02` which costs only $60\text{ gas} + 12\text{ gas per word}$. Implementing AES decryption directly in Solidity bytecode requires hundreds of thousands of gas for a single block. By using HMAC-SHA256 as a Pseudo-Random Function (PRF) in CTR mode, the smart contract can verify a 32-byte keystream chunk deterministically using just two native SHA-256 precompile invocations, drastically reducing dispute verification costs.
* **Bangla Summary:**  
  ইথেরিয়ামের ভেতরে SHA-256 চালানোর জন্য বিশেষ প্রিকম্পাইল (`0x02`) রয়েছে, যার খরচ মাত্র ৬০ গ্যাস। সলিডিটিতে AES চালাতে গেলে প্রচুর গ্যাস নষ্ট হয়। তাই আমরা HMAC-SHA256 ব্যবহার করেছি যাতে অত্যন্ত অল্প খরচে মাত্র ২টি প্রিকম্পাইল কল দিয়েই চাবি যাচাই করা যায়।

### Q10: How does your Merkle tree construction bind plaintext to ciphertext?
* **English Model Answer:**  
  The asset is partitioned into $n$ chunks of $m$ bytes. For each chunk $i$, the seller computes:
  1. Plaintext leaf: $L_i^{\text{plain}} = H(0x00 \mathbin{\Vert} i \mathbin{\Vert} M_i)$
  2. Ciphertext leaf: $L_i^{\text{cipher}} = H(0x01 \mathbin{\Vert} i \mathbin{\Vert} C_i)$
  3. Combined commitment root: $R = \text{MerkleRoot}(L_0 \dots L_{n-1})$.  
  By embedding the chunk index $i$ and explicit domain separation bytes ($0x00, 0x01$), we eliminate second-preimage attacks and chunk-swapping attacks.
* **Bangla Summary:**  
  আমরা আসল ফাইল এবং এনক্রিপ্ট করা ফাইলকে চাঙ্কে ভাগ করে মারকেল ট্রি বানাই। প্রতিটি পাতায় চাঙ্কের ইনডেক্স এবং আলাদা ডোমেইন বাইট যুক্ত থাকে। ফলে বিক্রেতা কোনো চাঙ্কের স্থান পরিবর্তন বা জালিয়াতি করতে পারে না।

### Q11: Explain the Key Wrapping Scheme (CRC) and why it is critical.
* **English Model Answer:**  
  If the seller used the raw master key $K$ directly across all sales, publishing $K$ during a dispute with Buyer 1 would allow all future buyers to download the ciphertext from IPFS and decrypt it without paying. In MetaTrade-R, the seller generates a unique nonce $N \leftarrow \{0,1\}^{256}$ per sale and delivers:
  $$K_{\text{buyer}} = \text{ECIES-Wrap}(\text{pk}_{\text{buyer}}, K \oplus H(N))$$
  The contract verifies the commitment to $K \oplus H(N)$. Thus, an on-chain dispute reveals only the single-sale wrapped key, preserving confidentiality of the master content for all other buyers.
* **Bangla Summary:**  
  যদি একই মূল চাবি সবাইকে দেওয়া হতো, তবে ১ম ক্রেতার সাথে ঝামেলা হয়ে চাবি চেইনে ফাঁস হলে বাকি সবাই ফ্রিতে ফাইল নামিয়ে নিত। আমরা প্রতি ক্রেতার জন্য আলাদা Nonce দিয়ে চাবিটি মুড়িয়ে (wrap করে) দিই। ফলে কোনো বিরোধ হলেও কেবল ওই ১টি ট্রানজ্যাকশনের চাবি বাতিল হয়, মাস্টার ফাইল সুরক্ষিত থাকে।

### Q12: What is Dispute Mode 1 vs Dispute Mode 2?
* **English Model Answer:**  
  - **Dispute Mode 1 (Ciphertext/Plaintext Inconsistency):** Buyer reveals decrypted plaintext chunk $M_i$, the keystream derivation, and the Merkle proof. The contract evaluates $C_i \oplus M_i \stackrel{?}{=} \text{Keystream}(K_i)$ and checks against the on-chain Merkle root. If the seller lied about the keystream or ciphertext, the contract refunds the buyer and slashes the seller's bond.
  - **Dispute Mode 2 (Key Mismatch):** Buyer claims the delivered decryption key does not match the on-chain key commitment $H(K)$. The seller is challenged to post the preimage $K$ within the deadline window $T_{\text{respond}}$. If the seller fails, the buyer is refunded automatically.
* **Bangla Summary:**  
  - **মোড ১ (ফাইল গরমিল):** বিক্রেতা যে এনক্রিপ্ট ফাইল দিল, তার ভেতর আসল ডেটা নেই বা বিক্রেতা ভুলভাবে এনক্রিপ্ট করেছে। ক্রেতা মারকেল প্রুফ সাবমিট করলেই কন্ট্রাক্ট বুঝে ফেলে এবং বিক্রেতার টাকা কেটে নেয়।
  - **মোড ২ (ভুল চাবি):** বিক্রেতা এমন চাবি পাঠিয়েছে যা দিয়ে ফাইল খোলে না। ক্রেতা চ্যালেঞ্জ করলে বিক্রেতাকে সঠিক চাবি চেইনে দিতে হয়, না দিলে ক্রেতা রিফান্ড পায়।

### Q13: What hash function was used, and did you encounter pre-image vulnerabilities?
* **English Model Answer:**  
  We used standard SHA-256 for all off-chain and on-chain hashing (via the EVM precompile and Node.js crypto module). We prevented length-extension and second-preimage attacks by strictly enforcing fixed 32-byte chunks and prepending 1-byte domain separation prefixes ($0x00$ for leaves, $0x01$ for keystreams, $0x02$ for internal nodes).
* **Bangla Summary:**  
  আমরা স্ট্যান্ডার্ড SHA-256 ব্যবহার করেছি এবং প্রতিটি ক্ষেত্রে ডোমেইন সেপারেশন বাইট ব্যবহার করেছি যাতে কোনো লেংথ-এক্সটেনশন বা ডাবল-প্রি-ইমেজ আক্রমণ না হতে পারে।

---

## Section 3: Smart Contract Engineering & Security (Q14–Q22)

### Q14: Which smart contracts comprise the MetaTrade-R suite?
* **English Model Answer:**  
  The system consists of 5 modular Solidity contracts (v0.8.31, Osaka EVM):
  1. `AssetRegistry.sol`: Registers asset metadata, roots, fingerprint hashes, and pricing.
  2. `SaleEscrow.sol`: Manages deposits, dual-bonds, timeouts, and state transitions.
  3. `DisputeVerifier.sol`: On-chain cryptographic library verifying HMAC-SHA256 and Merkle proofs.
  4. `RoyaltySplitter.sol`: Accrues, splits, and releases secondary sale royalties recursively to upstream creators.
  5. `LicenceToken.sol`: ERC-721 soulbound/transferable licence issued to honest buyers upon settlement.
* **Bangla Summary:**  
  আমাদের সিস্টেমে ৫টি স্মার্ট কন্ট্রাক্ট রয়েছে: অ্যাসেট রেজিস্ট্রি, সেল এসক্রো, ডিসপিউট ভেরিফায়ার, রয়্যালটি স্প্লিটার, এবং লাইসেন্স টোকেন।

### Q15: How does SaleEscrow implement Reentrancy Protection and the Checks-Effects-Interactions (CEI) pattern?
* **English Model Answer:**  
  All state-changing functions in `SaleEscrow.sol` follow the CEI pattern: state is transitioned to terminal states (`State.REFUNDED` or `State.COMPLETED`) and balances are zeroed *before* any external ETH transfers occur. In addition, critical functions utilize OpenZeppelin's `ReentrancyGuard` nonReentrant modifier. Reentrancy safety was formally verified in test `testReentrancy()` and fuzz invariants.
* **Bangla Summary:**  
  সব কন্ট্রাক্টে CEI প্যাটার্ন মানা হয়েছে—অর্থাৎ টাকা ট্রান্সফার করার আগেই ইন্টারনাল স্টেট পরিবর্তন করা হয়। এর পাশাপাশি ওপেন-জেপেলিনের `ReentrancyGuard` ব্যবহার করা হয়েছে, যা আমরা স্বয়ংক্রিয় রি-এন্ট্রান্সি টেস্টে প্রমাণ করেছি।

### Q16: Why did you update RoyaltySplitter to use a pull-payment pattern instead of push?
* **English Model Answer:**  
  Pushing payments directly to arbitrary recipient addresses in a loop introduces Denial of Service (DoS) vulnerability: if one creator address is a contract that reverts on `receive()`, all payouts halt. In `RoyaltySplitter.sol`, we maintain an internal credit balance mapping (`credits[creator] += amount`) and allow creators to withdraw funds individually via a dedicated `withdraw()` function (pull pattern).
* **Bangla Summary:**  
  সরাসরি লুপ চালিয়ে সবার একাউন্টে টাকা পুশ করলে কেউ যদি রিভার্ট করে দেয়, পুরো সিস্টেম অচল হয়ে যেত (DoS অ্যাটাক)। তাই আমরা পুল-পেমেন্ট করেছি: রয়্যালটির টাকা কন্ট্রাক্টে জমা থাকে, ক্রিয়েটর নিজে এসে তার ভাগের টাকা তুলে নেয়।

### Q17: What is the purpose of the Automated Watcher daemon?
* **English Model Answer:**  
  In optimistic escrow protocols, if a party becomes unresponsive, the protocol relies on timeout deadlines ($T_{\text{deliver}}$, $T_{\text{confirm}}$, $T_{\text{respond}}$). A passive buyer or seller might fail to submit timeout transactions if their machine goes offline. The MetaTrade-R Watcher (`watcher/watcher.ts`) continuously monitors on-chain events, computes elapsed blocks/timestamps, and autonomously triggers settlement functions (`timeoutDeliver`, `timeoutConfirm`) on behalf of participants, preventing locked capital.
* **Bangla Summary:**  
  টাইমআউট হয়ে গেলে যদি ক্রেতা বা বিক্রেতা অফলাইনে থাকে, তবে টাকা আটকে থাকত। ওয়াচার ডেমন সার্বক্ষণিক চেইন পর্যবেক্ষণ করে এবং নির্ধারিত সময় পার হলেই নিজে থেকে টাইমআউট ফাংশন ডেকে টাকা মুক্ত করে দেয়।

### Q18: What is the EVM target and why did Ganache fail with Osaka bytecode?
* **English Model Answer:**  
  Our contracts target Solidity 0.8.31 and the Osaka EVM specification with `via_ir = true`. Osaka introduces opcode `0x5f` (`PUSH0`). Ganache GUI defaults to older hardforks (e.g., Merge/London) which lack support for `PUSH0`, rejecting deployments with parameter errors. We resolved this by testing and evaluating against Foundry's Anvil node, which natively supports Cancun and Osaka specifications.
* **Bangla Summary:**  
  আমাদের কন্ট্রাক্ট সলিডিটি ০.৮.৩১ এবং ওসাকা EVM টার্গেট করে তৈরি, যেখানে নতুন `PUSH0` অপকোড রয়েছে। গানাশে জিইউআই পুরনো হার্ডফর্ক ব্যবহার করায় ওসাকা বাইটকোড চেনে না। তাই আমরা অ্যানভিল (Anvil) ব্যবহার করেছি যা সম্পূর্ণ আধুনিক EVM সমর্থন করে।

---

## Section 4: Economic Model & Game Theory (Q19–Q26)

### Q19: How are the seller and buyer bonds sized, and why are they necessary?
* **English Model Answer:**  
  To prevent griefing and enforce subgame perfection:
  - The **seller bond** is set to $B_{\text{seller}} \ge P$ (the purchase price). If the seller attempts to cheat by providing invalid data, forfeiting $B_{\text{seller}}$ ensures their net payoff is strictly negative ($\Pi_{\text{seller}} \le -P$).
  - The **buyer bond** is set to $B_{\text{buyer}} \ge \text{GasCost}_{\text{dispute}} + \epsilon$. This prevents malicious buyers from griefing honest sellers by launching frivolous disputes.
* **Bangla Summary:**  
  বিক্রেতার বন্ড কমপক্ষে পণ্যের মূল্যের সমান হতে হয় ($B_{\text{seller}} \ge P$), যাতে চিট করলে উল্টো তার জরিমানা হয়। আর ক্রেতার বন্ড রাখা হয় যাতে ক্রেতা শয়তানি করে অহেতুক ফলস ডিসপিউট তুলে বিক্রেতার সময় ও গ্যাস নষ্ট না করে।

### Q20: What is the subgame perfect Nash equilibrium of MetaTrade-R?
* **English Model Answer:**  
  In the extensive-form game between seller and buyer:
  1. The seller knows any inconsistent chunk will be detected with probability $p=1$ via Mode 1, resulting in loss of $B_{\text{seller}}$ and asset delisting.
  2. The buyer knows any false dispute will be rejected on-chain, resulting in total loss of $B_{\text{buyer}}$.
  3. Consequently, the unique subgame perfect Nash equilibrium on the equilibrium path is: Seller posts bond and delivers authentic key; Buyer confirms delivery; funds are settled honestly without invoking dispute contracts.
* **Bangla Summary:**  
  গেম থিওরি অনুযায়ী: বিক্রেতা জানে চিট করলে ১০০% ধরা খাবে ও বন্ড হারাবে। ক্রেতা জানে মিথ্যা মামলা দিলে তার নিজের বন্ড বাজেয়াপ্ত হবে। তাই উভয়ের জন্যই একমাত্র লাভজনক পথ হলো সততার সাথে লেনদেন সম্পন্ন করা।

### Q21: What happens if the buyer simply refuses to confirm after receiving the key?
* **English Model Answer:**  
  If the buyer goes silent after the seller delivers the decryption key, the seller does not lose their money. Once the dispute window $T_{\text{confirm}}$ (e.g., 24 hours) expires, anyone (or the automated Watcher) can invoke `timeoutConfirm()`. The contract automatically releases the full purchase price and returns the seller's bond.
* **Bangla Summary:**  
  ক্রেতা যদি চাবি পাওয়ার পর ইচ্ছাকৃতভাবে কনফার্ম না করে বসে থাকে, তবে ২৪ ঘণ্টা পর টাইমআউট হয়ে কন্ট্রাক্ট নিজে থেকেই বিক্রেতার পাওনা টাকা ও বন্ড ফেরত দিয়ে দেয়।

### Q22: What happens if the seller takes the buyer's money and never delivers the key?
* **English Model Answer:**  
  The buyer's deposit is held in escrow, not sent to the seller. If the delivery deadline $T_{\text{deliver}}$ elapses and the seller has not called `deliver()`, the buyer or Watcher calls `timeoutDeliver()`. The contract returns the buyer's payment, returns the buyer's bond, and slashes the seller's initial deposit bond. The seller ends up strictly worse off.
* **Bangla Summary:**  
  বিক্রেতা টাকা পাবে না কারণ টাকা এসক্রোতে জমা থাকে। নির্দিষ্ট সময়ে চাবি না দিলে ক্রেতা পুরো টাকা ফেরত পাবে এবং বিক্রেতার দেওয়া সিকিউরিটি বন্ড বাজেয়াপ্ত হবে।

---

## Section 5: Experimental Evaluation & Attack Matrix (Q23–Q32)

### Q23: Summarize your test suite execution results.
* **English Model Answer:**  
  Our test suite comprises 93 comprehensive tests, all executing with a 100% pass rate:
  - **72 Foundry tests:** Including unit tests, cryptographic vector tests, baseline tests, and stateful fuzz invariant tests (256 runs $\times$ 256 depth).
  - **14 Fastify backend tests:** Verifying health, multipart uploads, IPFS pinning, and REST API validation.
  - **7 Watcher integration tests:** Verifying persistent JSON checkpointing, event deduplication, and automated on-chain timeout submissions.
* **Bangla Summary:**  
  আমাদের মোট ৯৩টি স্বয়ংক্রিয় টেস্ট রয়েছে এবং সবগুলো সফলভাবে পাস করেছে: ৭২টি ফাউन्ड্রি টেস্ট (যার মধ্যে ইনভ্যারিয়েন্ট ফাজিং অন্তর্ভুক্ত), ১৪টি ব্যাকএন্ড এপিআই টেস্ট, এবং ৭টি অটোমেটিক ওয়াচার টেস্ট।

### Q24: What were the measured gas costs for the honest execution path?
* **English Model Answer:**  
  Over 30 deterministic benchmarking repetitions on local EVM:
  - `buy()`: 201,380 gas (escrow creation, bond deposit)
  - `deliver()`: 83,410 gas (wrapped key and commitment storage)
  - `confirm()`: 163,329 gas (settlement, royalty credit, licence NFT minting)
  - **Total Honest Cycle:** 448,119 gas.
  This represents an acceptable, predictable overhead for securing high-value digital asset trades.
* **Bangla Summary:**  
  ৩০ বার টেস্ট চালিয়ে আমরা দেখেছি: বায় করতে লাগে ২.০১ লাখ গ্যাস, ডেলিভারিতে ৮৩ হাজার, আর কনফার্মেশনে ১.৬৩ লাখ। একটি সম্পূর্ণ সৎ লেনদেনে সর্বমোট খরচ হয় ৪ লাখ ৪৮ হাজার ১১৯ গ্যাস।

### Q25: How many attack scenarios did you evaluate in your Attack Matrix, and what were the results?
* **English Model Answer:**  
  We evaluated 18 distinct threat scenarios ($AT_1$ to $AT_{17}$, plus $AT_{30}$):
  - **15 Blocked:** Completely rejected by on-chain cryptographic checks or contract assertions (e.g., non-delivery, false disputes, fabricated Merkle proofs, replay, unauthorized mints).
  - **1 Mitigated:** $AT_{13}$ (Dispute Spam) — mitigated economically because each frivolous dispute costs the attacker a full buyer bond.
  - **2 Residual Risks:** Explicitly documented as unpreventable in optimistic designs:
    1. $AT_{01}$ (Consistent Garbage): If the seller encrypts random garbage that matches the published Merkle root, the contract cannot know the image is visually useless.
    2. $AT_{14}$ (Key Leak on Dispute): Disputing a chunk exposes that chunk's key publicly on-chain.
* **Bangla Summary:**  
  আমরা ১৮টি সাইবার আক্রমণ পরীক্ষা করেছি: ১৫টি পুরোপুরি ঠেকানো গেছে, ১টি অর্থনৈতিক বন্ড দিয়ে দমন করা হয়েছে, এবং ২টি রেসিডুয়াল রিস্ক রয়েছে (যা আমরা সততার সাথে ডকুমেন্টে স্বীকার করেছি)।

### Q26: Explain the "Consistent Garbage" attack ($AT_{01}$) and why no blockchain can eliminate it.
* **English Model Answer:**  
  In $AT_{01}$, a malicious seller advertises a high-value asset, but the underlying file they encrypt is pure noise. Because the Merkle root accurately matches the noise, Dispute Mode 1 passes mathematically. Smart contracts are deterministic state machines that verify binary commitments; they cannot execute an off-chain aesthetic or semantic valuation of an asset. We mitigate this using off-chain reputation, perceptual hash registries, and legal identity anchoring, but it cannot be eliminated cryptographically.
* **Bangla Summary:**  
  বিক্রেতা যদি গোড়াতেই একটি সাদা বা নষ্ট ছবির মারকেল রুট তৈরি করে বেচতে যায়, স্মার্ট কন্ট্রাক্ট তো চোখ দিয়ে দেখতে পায় না ছবিটি সুন্দর না নষ্ট! কন্ট্রাক্ট কেবল দেখে হ্যাশ মিলল কি না। তাই এই আক্রমণটি কোনো ব্লকচেইন একাকী ঠেকাতে পারে না; এর জন্য রেপুটেশন এবং পারসেপচুয়াল হ্যাশিং দরকার।

### Q27: What was the negative result you reported regarding Perceptual Hashing (E8)?
* **English Model Answer:**  
  In Experiment E8, we evaluated classical perceptual hashing algorithms (aHash, dHash, pHash, wHash) across 80 benchmark images subject to rotations, cropping, and noise. Classical geometric pHash exhibited high false-negative rates under aggressive cropping ($>35\%$), demonstrating that naive pHash comparisons cannot serve as an autonomous, decentralized proof of plagiarism or originality on-chain. We openly document this as an empirical negative result.
* **Bangla Summary:**  
  আমরা সাধারণ পারসেপচুয়াল হ্যাশিং (pHash) দিয়ে পরীক্ষা করে দেখেছি—ছবি সামান্য ক্রপ বা রোটেট করলেই হ্যাশ মিলতে চায় না (৩৫% ফেইল করে)। তাই আমরা পরিষ্কারভাবে বলেছি যে সাধারণ pHash দিয়ে স্বয়ংক্রিয়ভাবে কপিরাইট চুরি ধরা সম্ভব নয়।

---

## Section 6: Base Paper Comparison & Architecture (Q28–Q36)

### Q28: How does MetaTrade-R differ from Truong et al.'s MetaTrade architecture?
* **English Model Answer:**  
  1. **Consensus & Execution:** Truong et al. rely on a dual-architecture with an Ethereum public token contract and Hyperledger Fabric private channels. MetaTrade-R runs entirely on EVM-compatible consensus with decentralized IPFS storage.
  2. **Content Binding:** Truong et al. decouple key delivery from smart contract settlement. MetaTrade-R binds content directly to payment using dual-Merkle commitments.
  3. **Dispute Resolution:** Truong et al. provide no dispute mechanism for corrupt payloads. MetaTrade-R provides automated, single-chunk on-chain fraud proofs.
  4. **Code Quality:** Truong et al. did not publish executable smart contract repositories. MetaTrade-R provides a 100% reproducible, audited codebase with automated CI.
* **Bangla Summary:**  
  বেস পেপার হাইপারলেজার ফ্যাব্রিক আর ইথেরিয়াম মিলিয়ে একটি জটিল আর্কিটেকচার দেখিয়েছিল এবং কোনো কোড দেয়নি। আমরা সম্পূর্ণ EVM ও IPFS ভিত্তিক স্বচ্ছ কোডবেস তৈরি করেছি যেখানে রিয়েল ফ্রড প্রুফ ও ডিসপিউট মেকানিজম রয়েছে।

### Q29: Did you implement Hyperledger Fabric in your thesis? Why or why not?
* **English Model Answer:**  
  No. As justified in our Technology Stack Justification: Hyperledger Fabric is a permissioned consortium blockchain requiring designated ordering services and organization identity certificates. Implementing Fabric for public content trading compromises decentralization, introduces heavy operational friction, and provides no protection against the core vulnerability (as demonstrated in Finding F1). An EVM-based architecture provides universal permissionless access and transparent dispute verification.
* **Bangla Summary:**  
  না, আমরা হাইপারলেজার ফ্যাব্রিক ব্যবহার করিনি। ফ্যাব্রিক হলো পারমিশনড (প্রাইভেট) নেটওয়ার্ক, যা সাধারণ মানুষের উন্মুক্ত বাজারের জন্য উপযুক্ত নয়। উপরন্তু ফ্যাব্রিক ব্যবহার করেও মূল জালিয়াতি ঠেকানো যাচ্ছিল না।

### Q30: How does your Royalty Splitter support recursive derivative assets?
* **English Model Answer:**  
  When an AIGC asset is registered, the creator can specify parent asset IDs and attribution weights. When a derivative asset is sold, `RoyaltySplitter.sol` recursively walks the parent tree, calculating proportional royalties and crediting the balances of upstream ancestor creators automatically up to a configurable depth limit to prevent gas exhaustion.
* **Bangla Summary:**  
  একটি এআই ছবি তৈরিতে যদি আগের একাধিক শিল্পীর কাজ বা মডেল ব্যবহৃত হয়, তবে সেই আদি শিল্পীদের আইডি যুক্ত করা যায়। ছবিটি বিক্রি হলে স্মার্ট কন্ট্রাক্ট স্বয়ংক্রিয়ভাবে রিকার্সিভলি তাদের প্রত্যেকের একাউন্টে রয়্যালটির টাকা ভাগ করে জমা করে দেয়।

---

## Section 7: Live Demo, Defense Tactics & Tough Questions (Q31–Q40)

### Q31: If your professor asks: "Is your work truly novel, or did you just copy FairSwap?" How do you respond?
* **English Model Answer:**  
  "Our work does not claim to invent fair exchange from scratch. FairSwap [14] was designed for symmetric, one-off file exchange on Ethereum. Our research contributions are threefold:
  1. We conducted the first code-level empirical security audit of the published MetaTrade framework, proving 15 systemic vulnerabilities.
  2. We adapted FairSwap into the AIGC domain by inventing the CRC key-wrapping mechanism, preventing resale leakage across multiple successive buyers.
  3. We integrated recursive derivative royalty accounting and evaluated the system with real multi-run gas and attack benchmarks."
* **Bangla Summary:**  
  "স্যার, আমরা কখনোই দাবি করিনি যে আমরা ফেয়ার-সোয়াপ একদম নতুন আবিষ্কার করেছি। ফেয়ার-সোয়াপ ছিল একক ফাইল বিনিময়ের জন্য। আমাদের অবদান হলো: আমরা বেস পেপারের ১৫টি মারাত্মক ত্রুটি প্রমাণ করেছি, বারবার বিক্রি করার জন্য চাবি সুরক্ষা (CRC Key-Wrapping) যুক্ত করেছি এবং স্বয়ংক্রিয় রয়্যালটি সহ বাস্তব টেস্টবেডে সব প্রমাণ করেছি।"

### Q32: If your professor asks: "What happens if gas price spikes on Ethereum mainnet?"
* **English Model Answer:**  
  On Ethereum Layer 1, a 448k gas transaction during high congestion (e.g., 50 Gwei) could cost $15–$30. However, MetaTrade-R's Solidity contracts are 100% EVM-compatible and deployable without changes to Ethereum Layer 2 rollups (such as Arbitrum, Optimism, or Base), where transaction fees are a fraction of a cent ($<0.01), making micro-trades economically viable.
* **Bangla Summary:**  
  ইথেরিয়াম মেইননেটে গ্যাস বাড়লে খরচ কিছুটা বাড়বে, তবে আমাদের সব কন্ট্রাক্ট লেয়ার-২ (Arbitrum, Base ইত্যাদি) তে সরাসরি কোনো কোড পরিবর্তন ছাড়াই চালানো যায়, যেখানে ফি ১ সেন্টেরও কম।

### Q33: If your professor asks: "Why did you use local Anvil instead of Sepolia testnet?"
* **English Model Answer:**  
  Public testnets like Sepolia introduce non-deterministic network latency, public faucet rate-limiting, and block time variability, which prevents rigorous, repeatable scientific benchmarking. Local Anvil instances allow exact opcode-level gas profiling, zero network jitter, and repeatable attack harness execution across 30 identical runs with confidence intervals.
* **Bangla Summary:**  
  পাবলিক টেস্টনেটে নেটওয়ার্ক স্লো থাকা বা কল্ডাটার দেরির কারণে বৈজ্ঞানিক গ্যাস বেঞ্চমার্ক সঠিকভাবে মাপা যায় না। অ্যানভিলে প্রতিটি অপকোডের আসল গ্যাস নির্ভুলভাবে বারবার পরিমাপ করা যায়।

### Q34: What if an attacker floods the network with IPFS garbage?
* **English Model Answer:**  
  IPFS content addressing is purely hash-based ($CID$). Storing garbage on IPFS has zero effect on the blockchain unless a transaction is mined. To register an asset on-chain, the seller must pay gas and post an asset registration transaction. The economic cost of spamming on-chain state disincentivizes large-scale storage attacks.
* **Bangla Summary:**  
  আইপিএফএসে আবর্জনা আপলোড করলেই তা চেইনে চলে আসে না। চেইনে রেজিস্ট্রি করতে হলে বিক্রেতাকে নিজের পকেট থেকে গ্যাস ফি দিতে হয়। তাই ইচ্ছাকৃত স্প্যামিং অর্থনৈতিকভাবেই লোকসানজনক।

### Q35: How does your Soulbound Licence Token prevent unauthorized transfers?
* **English Model Answer:**  
  `LicenceToken.sol` overrides OpenZeppelin's `_update()` or `transferFrom()` hooks. If the licence type is minted as non-transferable (soulbound), any call to `transferFrom` or `safeTransferFrom` reverts with `ErrNotTransferable()`. Only licences explicitly flagged as transferable may be resold on secondary markets.
* **Bangla Summary:**  
  লাইসেন্স টোকেনে আমরা ট্রান্সফার ফাংশন ব্লক করে দিয়েছি। যে ক্রেতা কিনল, লাইসেন্স তার ওয়ালেটেই আজীবন আবদ্ধ (Soulbound) থাকবে, সে এটি অন্য কারও কাছে বেচতে পারবে না যদি না লাইসেন্সটি ট্রান্সফারেবল টাইপ হয়।

### Q36: What is the single most important lesson from your research?
* **English Model Answer:**  
  The most crucial finding is that **on-chain hash commitments are meaningless without cryptographic binding to execution logic**. Storing a hash on a blockchain does not make a system "trust-free" or secure. Only rigorous adversarial modeling, formal economic incentives, and executable fraud proofs create defensible security.
* **Bangla Summary:**  
  সবচেয়ে বড় শিক্ষা হলো: শুধু ব্লকচেইনে একটা হ্যাশ জমা রাখলেই সিস্টেম নিরাপদ বা "ট্রাস্ট-ফ্রি" হয়ে যায় না। যতক্ষণ না সেই হ্যাশের সাথে চুক্তি ও টাকার অংকের ক্রিপ্টোগ্রাফিক প্রমাণ যুক্ত থাকে, ততক্ষণ পুরো সিস্টেমই ভঙ্গুর থাকে।

---

## Section 8: Deep Technical & Codebase Nuances (Q37–Q52)

### Q37: How does your implementation achieve Storage Parity with B0 at scale (E6)?
* **English Model Answer:**  
  In Experiment E6, we evaluated on-chain storage growth. In the naive baseline (B0), storing raw hash lists scales linearly $O(n)$ with the number of buyers or chunks. In MetaTrade-R, we store only a single 32-byte Merkle root on-chain during asset registration, while all intermediate proofs and chunk data remain in decentralized IPFS storage. For 1,000 buyers, MetaTrade-R matches storage parity while providing verifiable integrity proofs.
* **Bangla Summary:**  
  অন-চেইনে হাজার হাজার ফাইলের হ্যাশ রাখা অত্যন্ত ব্যয়বহুল। মেটাট্রেড-আরে আমরা চেইনে শুধু ৩২ বাইটের মারকেল রুট রাখি, বাকি সব ডেটা আইপিএফএসে থাকে। ফলে ১০০০ ক্রেতার ক্ষেত্রেও চেইনের মেমোরি খরচ বাড়ে না।

### Q38: What is the significance of the 2-step settle-before-credit bug fix in `SaleEscrow.sol`?
* **English Model Answer:**  
  During our self-audit, we observed that `SaleEscrow._settle` originally called `royalty.credit()` before sending the royalty ETH to `RoyaltySplitter.sol`. If an asset creator immediately attempted to withdraw, the transaction reverted due to insufficient contract balance. We patched `SaleEscrow.sol` to transfer ETH into `RoyaltySplitter` prior to updating the internal credit ledger, strictly satisfying balance invariants.
* **Bangla Summary:**  
  আমাদের অডিটে একটি বাগ ধরা পড়েছিল: রয়্যালটি স্প্লিটারে টাকা পাঠানোর আগেই ক্রেডিট লেজার আপডেট করা হচ্ছিল, যার ফলে কেউ টাকা তুলতে গেলে ব্যালেন্স শর্ট পড়ত। আমরা কোড ফিক্স করে আগে কন্ট্রাক্টে টাকা পাঠিয়ে তারপর লেজার এন্ট্রি নিশ্চিত করেছি।

### Q39: What is the purpose of the 32-byte Nonce `N` in `crypto/encrypt.ts` and `SaleEscrow.respond`?
* **English Model Answer:**  
  Earlier TypeScript prototypes emitted variable-length nonces. However, `SaleEscrow.respond` strictly requires a 32-byte word (`bytes32 N`) to prevent ambiguity during SHA-256 evaluation and protect against precompile memory corruption. We standardized `crypto/encrypt.ts` to strictly produce 32-byte nonces matching contract requirements.
* **Bangla Summary:**  
  আমরা এনক্রিপশন লাইব্রেরিতে ৩২ বাইটের ফিক্সড Nonce এনফোর্স করেছি যাতে স্মার্ট কন্ট্রাক্টের SHA-256 প্রিকম্পাইলের সাথে কোনো ফরম্যাট মিসম্যাচ না হয়।

### Q40: What happens if an attacker tries to register an asset with an invalid parent ID?
* **English Model Answer:**  
  `AssetRegistry.sol` validates all listed parent asset IDs. If a seller attempts to register a derivative asset referencing a non-existent parent ID (`parentId >= nextAssetId`), the transaction reverts with `ErrInvalidParent()`. This was explicitly tested in `testInvalidParent()`.
* **Bangla Summary:**  
  যদি কেউ এমন কোনো প্যারেন্ট অ্যাসেটের নাম দেয় যা চেইনে অস্তিত্বই নেই, স্মার্ট কন্ট্রাক্ট `ErrInvalidParent()` দিয়ে ট্রানজ্যাকশন রিভার্ট করে দেয়।

### Q41: Can a malicious seller delist an asset while a buyer's deposit is in escrow?
* **English Model Answer:**  
  Yes, a seller can delist an asset from the registry, but `SaleEscrow.sol` snapshots the asset pricing, royalty rate, and seller bond at the exact block the escrow is created. Delisting an asset marks it unavailable for future buyers, but does **not** disrupt or invalidate ongoing escrows (`testAT07_DelistedAssetPurchase`).
* **Bangla Summary:**  
  বিক্রেতা অ্যাসেট ডিলিস্ট করলেও যে ক্রেতা ইতোমধ্যে টাকা জমা দিয়ে এসক্রো খুলেছে তার ওপর কোনো প্রভাব পড়বে না, কারণ এসক্রো খোলার মুহূর্তেই সব ডাটা স্ন্যাপশট হয়ে যায়।

### Q42: How does the system handle front-running and MEV during dispute submissions?
* **English Model Answer:**  
  Dispute Mode 1 transactions require the buyer to submit a valid Merkle path and decrypted plaintext for their specific wrapped key. Because the key is wrapped under the buyer's unique public key ($\text{pk}_{\text{buyer}}$), a third-party front-runner cannot forge or benefit from front-running the dispute proof, as only the authorized buyer address can claim the refund and bond payout.
* **Bangla Summary:**  
  ডিসপিউট মোড ১-এ ক্রেতার নিজস্ব পাবলিক কি দিয়ে র‍্যাপ করা প্রুফ জমা দিতে হয়। ফলে কোনো MEV বট বা অন্য কেউ ট্রানজ্যাকশন হাইজ্যাক করে টাকা মেরে নিতে পারে না।

### Q43: What was the sequential throughput measured in Experiment E5?
* **English Model Answer:**  
  Over 100 consecutive honest sale cycles on our local chain benchmark, the mean cycle time was $109.32\text{ ms}$, corresponding to a sequential throughput of $9.15\text{ sales/second}$. This demonstrates that protocol overhead is bounded and suitable for real-time digital asset trading.
* **Bangla Summary:**  
  ১০০টি পূর্ণাঙ্গ সাইকেল চালিয়ে দেখা গেছে প্রতিটি লেনদেন চক্র শেষ হতে গড়ে ১০৯ মিলি-সেকেন্ড সময় লাগে, অর্থাৎ প্রতি সেকেন্ডে ৯.১৫টি সেল সম্পন্ন হতে পারে।

### Q44: Why is HMAC-CTR considered "Confidentiality Only" rather than Authenticated Encryption (AEAD)?
* **English Model Answer:**  
  HMAC-CTR is a stream cipher mode. While it provides semantic security under chosen-plaintext attacks (IND-CPA), stream ciphers without a message authentication code (MAC) are malleable. In MetaTrade-R, we do not require on-chain AEAD ciphertext tag verification because plaintext integrity is independently enforced by the Merkle root hash commitment.
* **Bangla Summary:**  
  HMAC-CTR ডেটাকে গোপন রাখে কিন্তু নিজে থেকে অথেনটিকেটেড এনক্রিপশন (AEAD) দেয় না। আমাদের সিস্টেমে আলাদাভাবে মারকেল ট্রি থাকায় ইন্টিগ্রিটি স্বয়ংক্রিয়ভাবেই সুরক্ষিত থাকে।

### Q45: How does MetaTrade-R prevent a seller from withdrawing their bond while a dispute is ongoing?
* **English Model Answer:**  
  `SaleEscrow.sol` tracks locked bonds per active sale (`lockedBonds[seller]`). A seller can only withdraw uncommitted free bond balances (`freeBond[seller] = totalBond - lockedBonds`). A seller cannot withdraw funds that are currently pledged against active escrows.
* **Bangla Summary:**  
  এসক্রো চলাকালীন বিক্রেতার সিকিউরিটি বন্ড কন্ট্রাক্টে লকড অবস্থায় থাকে। লেনদেন সম্পূর্ণ সফল বা মীমাংসিত না হওয়া পর্যন্ত বিক্রেতা কোনোভাবেই বন্ডের টাকা তুলতে পারে না।

### Q46: What is the function of the `LicenceToken` contract?
* **English Model Answer:**  
  `LicenceToken.sol` is an ERC-721 compliant contract. When `confirm()` is executed, `SaleEscrow` calls `licence.mint(buyer, assetId, licenceType)`. It provides cryptographic, on-chain verifiable proof that the buyer legally acquired the specific licence tier for that asset.
* **Bangla Summary:**  
  এটি একটি ERC-721 এনএফটি যা বিক্রয় সম্পন্ন হলে ক্রেতার ওয়ালেটে মিন্ট হয়। এটি প্রমাণ করে ক্রেতা বৈধভাবে ওই এআই কনটেন্টের লাইসেন্স কিনেছেন।

### Q47: How does MetaTrade-R protect against timestamp manipulation by miners?
* **English Model Answer:**  
  Timeout windows in MetaTrade-R ($T_{\text{deliver}}, T_{\text{confirm}}, T_{\text{respond}}$) are configured in durations of hours to days (e.g., 24 hours). Ethereum consensus rules restrict miner/validator block timestamp manipulation to within 12–15 seconds. Since timeout windows are several orders of magnitude larger than consensus jitter, timestamp manipulation attacks are completely mitigated (`testAT17_TimestampManipulation`).
* **Bangla Summary:**  
  আমাদের টাইমআউট সময় সাধারণত ২৪ ঘণ্টার মতো রাখা হয়। মাইনাররা বড়জোর ১২-১৫ সেকেন্ড সময় এদিক-ওদিক করতে পারে। তাই মাইনারদের পক্ষে টাইমআউট জালিয়াতি করা অসম্ভব।

### Q48: What is the role of Fastify and Zod in the off-chain architecture?
* **English Model Answer:**  
  The off-chain API is built using Fastify (for high-throughput asynchronous request handling) and Zod (for runtime schema validation). Zod strictly validates all hex inputs, Merkle proofs, and numeric bounds before any transaction is forwarded to the blockchain, preventing malformed payloads from wasting gas.
* **Bangla Summary:**  
  অফ-চেইনে ফাস্টিফাই দিয়ে দ্রুতগতির এপিআই তৈরি করা হয়েছে এবং Zod দিয়ে ডেটা ভ্যালিডেশন করা হয়েছে যাতে কোনো ভুল ডেটা চেইনে গিয়ে অযথা গ্যাস নষ্ট না করে।

### Q49: If a reviewer asks: "Why did you not use Zero-Knowledge Proofs (ZK-SNARKs)?" How do you justify this?
* **English Model Answer:**  
  "While ZK-SNARKs allow proving statement validity without revealing plaintext, generating ZK proofs for multi-megabyte AIGC files on client hardware incurs prohibitive proving time (minutes to hours) and intense memory overhead. In contrast, our FairSwap-inspired optimistic design requires zero client proof generation during honest sales, with on-chain fraud verification invoked only if a dispute arises. This optimistic model provides an optimal tradeoff between client latency and on-chain security."
* **Bangla Summary:**  
  "স্যার, বড় সাইজের এআই ফাইলের জন্য ZK প্রুফ জেনারেট করতে সাধারণ কম্পিউটারে কয়েক মিনিট থেকে কয়েক ঘণ্টা লেগে যেত এবং প্রচুর র‍্যাম লাগত। আমরা অপটিমিস্টিক মডেল ব্যবহার করেছি—সৎ লেনদেনে কোনো প্রুফ বানাতেই হয় না, শুধু বিরোধ হলেই ছোট ফ্রড প্রুফ যাচাই হয়। এটি অনেক দ্রুত এবং বাস্তবসম্মত।"

### Q50: How do you defend against a malicious buyer submitting fabricated Merkle proofs?
* **English Model Answer:**  
  In `DisputeVerifier.sol`, the contract recalculates the Merkle root from the submitted leaf and proof siblings. If the reconstructed root does not identically match the on-chain root recorded during asset registration, the transaction immediately reverts with `ErrInvalidProof()` and the buyer's transaction fails (`testAT12_FabricatedProof`).
* **Bangla Summary:**  
  ক্রেতা যদি ভুয়া মারকেল প্রুফ দেয়, কন্ট্রাক্ট নিজে চেইনে সংরক্ষিত রুটের সাথে মিলিয়ে দেখে। অমিল পেলেই সাথে সাথে `ErrInvalidProof()` দিয়ে রিজেক্ট করে দেয়।

### Q51: What were the findings of the 15-point code audit?
* **English Model Answer:**  
  The independent audit categorized:
  - 0 Critical vulnerabilities
  - 2 High-level design risks (AT-01 consistent garbage, AT-14 dispute key disclosure)
  - 4 Medium-level risks (e.g., re-wrapping requirements, off-chain IPFS availability)
  - 5 Low-level risks (e.g., event indexing, bound edge cases)
  - 3 Informational suggestions.
  All high and medium items were explicitly documented as structural design boundaries rather than exploitable implementation flaws.
* **Bangla Summary:**  
  আমাদের ১৫-পয়েন্ট অডিটে কোনো ক্রিটিক্যাল ফান্ড লস বা হ্যাকিং দুর্বলতা পাওয়া যায়নি। হাই ও মিডিয়াম পয়েন্টগুলো ছিল সিস্টেমের তাত্ত্বিক সীমাবদ্ধতা, যা আমরা থিসিসে পরিষ্কারভাবে তুলে ধরেছি।

### Q52: Concluding Statement: Why should the examination committee accept MetaTrade-R?
* **English Model Answer:**  
  "MetaTrade-R demonstrates academic rigor by replacing unproven marketing claims with reproducible engineering. We identified 15 concrete vulnerabilities in the leading IEEE literature, designed an incentive-compatible cryptographic fair-exchange protocol, implemented 5 verified smart contracts, and validated our claims through 93 automated tests, 18 attack vectors, and 30-run gas benchmarks. We openly document our residual risks and negative results. It is an honest, mathematically sound, and empirically verified research contribution."
* **Bangla Summary:**  
  "মেটাট্রেড-আর কোনো ফাঁকা দাবির ওপর দাঁড়িয়ে নেই—এটি একটি বৈজ্ঞানিকভাবে পরীক্ষিত ও প্রমাণিত গবেষণা। আমরা বেস পেপারের ১৫টি মারাত্মক দুর্বলতা চিহ্নিত করেছি, ৫টি স্মার্ট কন্ট্রাক্ট তৈরি করেছি, ৯৩টি স্বয়ংক্রিয় টেস্টে ১০০% পাস করিয়েছি এবং ১৮টি সাইবার অ্যাটাক বিশ্লেষণ করেছি। প্রতিটি সীমাবদ্ধতা আমরা সততার সাথে তুলে ধরেছি। তাই এটি একটি সম্পূর্ণ ডিফেন্ডেবল এবং উচ্চমানের থিসিস।"

---

## Quick Reference Summary Sheet for Defense Day

| Topic | Metric / Fact |
|---|---|
| **Base Paper Audited** | Truong et al., IEEE Access 2024 (15 Vulnerabilities Found) |
| **Total Automated Tests** | 93 tests (72 Foundry + 14 Backend + 7 Watcher), 100% Pass Rate |
| **Attack Scenarios** | 18 scenarios: 15 Blocked, 1 Mitigated, 2 Residual |
| **Honest Sale Gas** | 448,119 gas (~$0.01 on L2) |
| **Dispute Mode 1 Gas** | 324,580 gas (Fraud Proof on-chain) |
| **Cryptographic PRF** | HMAC-SHA256 via EVM Precompile `0x02` |
| **Storage Architecture** | Off-chain IPFS (Kubo 0.32.1) + On-chain Dual Merkle Root |
| **Key Innovation** | CRC (Per-buyer wrapped keys preventing resale leakage) |


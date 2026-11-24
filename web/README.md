# MetaTrade-R · Interactive dApp

এই dApp-টা MetaTrade-R contractগুলোর **সব write path** ব্রাউজার থেকে সরাসরি চালায়, যাতে প্রতিটা ধাপের effect (state change, event, gas) চোখে দেখা যায়।

- কোনো mock নেই: প্রতিটা বাটন আসল Anvil লেনদেন পাঠায় এবং tx hash + gas + block + decoded event দেখায়।
- সাইন করে Anvil-এর demo account গুলো দিয়ে, তাই `msg.sender` সত্যিকারের seller/buyer।
- Crypto (HMAC-CTR, Merkle, key commitment) ব্রাউজারেই চলে (`src/lib/crc.ts`), আর **স্বাধীনভাবে তৈরি test vector** (`vectors.json`, Node/OpenSSL) দিয়ে লোডের সময় self-test হয় (Overview tab-এ ১২/১২)।

## যা যা করা যায়

| Tab | কাজ |
| --- | --- |
| **Overview** | সিস্টেম স্ট্যাটাস, crypto self-test, known caveats |
| **Asset studio** | content এনক্রিপ্ট → Merkle tree → IPFS-এ upload → `AssetRegistry.list()`; attack-mode দিয়ে ইচ্ছাকৃত অসামঞ্জস্য তৈরি |
| **Market** | `buy(assetId)` (price + 0.001 ETH bond), seller-এর `deactivate()` |
| **Sales** | `deliver()` (ECIES-wrapped K), buyer-side unwrap + `R_D` recompute, `confirm()`, `disputeMode2()`, `respond()`, তিনটি timeout, Anvil time-travel |
| **Dispute lab** | Merkle proof বানানো, locally `checkConsistency` রিপ্রোডিউস, tamper toggle, `disputeMode1()` |
| **Ledger** | `depositBond()`, `withdrawBondCredit()`, royalty `withdraw()`, licence `balanceOf`, protocol parameters |
| **Timeline** | প্রতিটা tx hash, gas, block, event — filter সহ |

## চালানোর নিয়ম

```powershell
# 1) Anvil + Kubo
anvil --host 127.0.0.1 --port 8545
ipfs daemon --offline

# 2) contract deploy (আগেই `forge build` করা থাকতে হবে)
cd metatrade-r
node scripts/deploy.mjs
# আউটপুটের ৪টা address web/src/lib/deployment.json-এ বসান (অথবা UI-র ⚙ Settings-এ)

# 3) dApp
cd web
npm install
npm run dev
# http://127.0.0.1:5173
```

> Anvil নতুন করে চালু করলে state মুছে যায় — আবার `node scripts/deploy.mjs` চালাতে হবে। একই deployer/nonce হলে address একই আসে।

## Demo actors

| # | Role | Address |
| --- | --- | --- |
| 0 | Seller A (parent creator) | `0xf39F…2266` |
| 1 | Seller B (derivative creator) | `0x7099…79C8` |
| 2 | Buyer | `0x3C44…93BC` |
| 3 | Observer / timeout caller | `0x90F7…b906` |

এগুলো Foundry-র সুপরিচিত **public test key**; শুধু локাল ডেমোর জন্য।

## দুইটা পূর্ণ ডেমো (যা টেস্ট করা হয়েছে)

**A. Honest path:** Seller A prepare+list → `depositBond(0.02)` → Buyer `buy` → Seller A `deliver` → Buyer unwrap+verify (MATCH) → `confirm` → state `SETTLED`, licence minted.

**B. Cheating path:** Seller B "attack mode" asset prepare+list → bond → buy → deliver → Buyer verify (MISMATCH) → Dispute lab-এ proof build → `disputeMode1` → `Refunded`, seller bond buyer-কে।

**C. Key-reveal path:** honest sale → `disputeMode2` → seller `respond(K,N,s)` → আবার `DELIVERED`, `keyRevealed = true`।

## সীমাবদ্ধতা (ইচ্ছাকৃতভাবে দেখানো)

- Content key `K` ব্রাউজারের `localStorage`-এ থাকে — শুধু ডেমোর সুবিধার জন্য, production key management নয়।
- Chain-এ IPFS CID নেই; `assetId → CID` ম্যাপিং localStorage-এ। আসল সিস্টেমে indexer দরকার।
- Dispute-এ `K` calldata-তে প্রকাশ পায় (AT-14) — honest path-এই confidentiality।
- Backend-এর `crypto/encrypt.ts` ১৬-বাইট `N` বানায়, কিন্তু `keyCommitment` চায় ৩২ বাইট; তাই এই dApp ৩২-বাইট `N` ব্যবহার করে। এটা কোড-অডিটের একটি প্রকৃত ফাইন্ডিং, লুকানো হয়নি।

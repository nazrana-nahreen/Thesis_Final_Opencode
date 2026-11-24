import { useState } from "react";
import type { PanelCtx } from "../lib/panel";
import { runSelfTest, vectorSummary } from "../lib/selftest";
import { Card, KV, Mono, Notice, Pill, Btn } from "./ui";

export function Overview({
  ctx,
  status,
  ipfsOk,
}: {
  ctx: PanelCtx;
  status: { blockNumber: bigint; chainId: number; timestamp: number } | null;
  ipfsOk: boolean | null;
}) {
  const [checks, setChecks] = useState(() => runSelfTest());
  const summary = vectorSummary();
  const passed = checks.filter((c) => c.ok).length;
  const groups = Array.from(new Set(checks.map((c) => c.group)));

  return (
    <div className="grid two">
      <Card
        title="What this dApp does"
        subtitle="Every state transition below is a real transaction against the deployed contracts."
      >
        <ol className="steps">
          <li>
            <b>Prepare</b> — encrypt content, build Merkle trees, commit <code>hD, hC, R_D, R_C, cK</code>.
          </li>
          <li>
            <b>List</b> — write the commitments on-chain <i>before any buyer exists</i>.
          </li>
          <li>
            <b>Bond &amp; buy</b> — seller locks a solvency bond; buyer pays price + 0.001 ETH bond.
          </li>
          <li>
            <b>Deliver</b> — seller sends the content key wrapped to the buyer's secp256k1 key.
          </li>
          <li>
            <b>Verify</b> — buyer decrypts, recomputes <code>R_D</code>, compares with the chain.
          </li>
          <li>
            <b>Challenge</b> — on mismatch, the contract recomputes one block and decides.
          </li>
        </ol>
        <Notice tone="info">
          Integrity is cryptographic and trustless. <b>Semantic correctness is not</b> — a seller can still
          commit to garbage that is internally consistent (residual risk AT-01).
        </Notice>
      </Card>

      <Card title="System status" subtitle={`Signed in as ${ctx.actor.role}`}>
        <KV
          k="Chain"
          v={
            status ? (
              <Pill tone="ok">
                block {status.blockNumber.toString()} · id {status.chainId}
              </Pill>
            ) : (
              <Pill tone="bad">offline</Pill>
            )
          }
        />
        <KV k="RPC" v={<Mono value={ctx.cfg.rpcUrl} short />} />
        <KV k="IPFS" v={ipfsOk ? <Pill tone="ok">online</Pill> : <Pill tone="bad">offline</Pill>} />
        <KV k="AssetRegistry" v={<Mono value={ctx.cfg.registry} short />} />
        <KV k="SaleEscrow" v={<Mono value={ctx.cfg.escrow} short />} />
        <KV k="RoyaltySplitter" v={<Mono value={ctx.cfg.royalty} short />} />
        <KV k="LicenceToken" v={<Mono value={ctx.cfg.licence} short />} />
        <Notice tone="warn">
          Anvil accounts are public test keys. The private keys are derived from the standard Foundry
          mnemonic and are visible in this bundle — local development only.
        </Notice>
      </Card>

      <Card
        title="Crypto self-test"
        subtitle="Browser port (@noble) vs. independently generated Node/OpenSSL vectors"
        right={
          <Btn tone="ghost" onClick={() => setChecks(runSelfTest())}>
            Re-run
          </Btn>
        }
      >
        <div className="selftest-head">
          <Pill tone={passed === checks.length ? "ok" : "bad"}>
            {passed}/{checks.length} checks pass
          </Pill>
          <span className="muted">
            vector: {summary.bytes} bytes · {summary.blocks} blocks · β={summary.beta}
          </span>
        </div>
        {groups.map((g) => (
          <div key={g} className="selftest-group">
            <div className="group-title">{g}</div>
            <table className="table compact">
              <tbody>
                {checks
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <tr key={c.name} className={c.ok ? "row-ok" : "row-bad"}>
                      <td className="cell-check">{c.ok ? "✓" : "✗"}</td>
                      <td>{c.name}</td>
                      <td className="mono small">{c.got.slice(0, 22)}…</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>

      <Card title="Known implementation caveats" subtitle="These are stated here on purpose — they are part of the thesis.">
        <div className="caveat">
          <Pill tone="bad">nonce length</Pill>
          <p>
            <code>crypto/encrypt.ts</code> generates a <b>16-byte</b> <code>N</code>, while
            <code> DisputeVerifier.keyCommitment(bytes32 K, bytes32 N, bytes32 s)</code> hashes{" "}
            <b>32 bytes</b>. An asset produced by the backend would therefore fail{" "}
            <code>respond()</code> with <code>InvalidKey</code>. This dApp uses 32-byte <code>N</code> so
            the commitment matches the contract.
          </p>
        </div>
        <div className="caveat">
          <Pill tone="warn">off-chain CID index</Pill>
          <p>
            The chain stores <code>bytes32</code> digests, not IPFS CIDs. Mapping{" "}
            <code>assetId → ciphertext CID</code> lives in this browser's localStorage (a real system
            needs an indexer or an on-chain CID registry).
          </p>
        </div>
        <div className="caveat">
          <Pill tone="warn">dispute reveals K</Pill>
          <p>
            A Mode 1/2 dispute publishes the content key in calldata (AT-14). Confidentiality holds on
            the honest path only.
          </p>
        </div>
        <div className="caveat">
          <Pill tone="warn">HMAC-CTR is not AEAD</Pill>
          <p>
            The stream cipher provides confidentiality. Integrity comes from the hash commitments and
            Merkle proofs, not from the cipher.
          </p>
        </div>
      </Card>
    </div>
  );
}

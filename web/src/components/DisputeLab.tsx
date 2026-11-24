import { useEffect, useMemo, useState } from "react";
import type { PanelCtx } from "../lib/panel";
import {
  ABIS,
  formatEther,
  listSales,
  readAsset,
  send,
  type AssetRow,
  type SaleRow,
} from "../lib/chain";
import {
  buildProof,
  checkConsistencyLocal,
  unhex,
  type Bundle,
  type LocalCheck,
  type Proof,
} from "../lib/crc";
import { Btn, Card, Empty, KV, Mono, Notice, Pill } from "./ui";
import { ciphertextOf, type StoredAsset } from "../lib/store";
import { bytesToHex, type Hex } from "viem";

function bundleFrom(a: StoredAsset): Bundle {
  // Only the fields used by buildProof / checkConsistencyLocal are needed here.
  return {
    D: new Uint8Array(),
    K: unhex(a.K),
    N: unhex(a.N),
    s: unhex(a.s),
    saltD: unhex(a.saltD),
    saltC: unhex(a.saltC),
    C: ciphertextOf(a),
    beta: a.beta,
    m: a.m,
    leafD: a.leafD.map(unhex),
    leafC: a.leafC.map(unhex),
    R_D: unhex(a.R_D),
    R_C: unhex(a.R_C),
    hD: unhex(a.hD),
    hC: unhex(a.hC),
    cK: unhex(a.cK),
    committedD: new Uint8Array(),
    attackMode: a.attackMode,
  };
}

export function DisputeLab({ ctx }: { ctx: PanelCtx }) {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [assetRows, setAssetRows] = useState<Record<string, AssetRow>>({});
  const [saleId, setSaleId] = useState<string>("");
  const [index, setIndex] = useState("0");
  const [proof, setProof] = useState<Proof | null>(null);
  const [tamper, setTamper] = useState(false);
  const [check, setCheck] = useState<LocalCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ hash: string; gas: string; status: string; events: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listSales(ctx.cfg);
        if (!alive) return;
        setSales(list);
        const map: Record<string, AssetRow> = {};
        for (const s of list) {
          if (!map[s.assetId]) {
            try {
              map[s.assetId] = await readAsset(ctx.cfg, s.assetId);
            } catch {
              /* ignore */
            }
          }
        }
        if (alive) {
          setAssetRows(map);
          if (!saleId && list.length) {
            const cand = list.filter((s) => s.stateName === "DELIVERED");
            setSaleId((cand[cand.length - 1] ?? list[list.length - 1]).saleId);
          }
        }
        setError(null);
      } catch (e: any) {
        if (alive) setError(e?.shortMessage ?? e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ctx.cfg, ctx.tick]);

  const sale = useMemo(() => sales.find((s) => s.saleId === saleId) ?? null, [sales, saleId]);
  const row = sale ? assetRows[sale.assetId] : undefined;
  const local = sale ? ctx.assets.find((a) => a.assetId === sale.assetId) : undefined;
  const bundle = useMemo(() => (local ? bundleFrom(local) : null), [local]);

  const eligible = sales.filter(
    (s) =>
      s.stateName === "DELIVERED" ||
      (s.stateName === "CHALLENGED" && s.keyRevealed),
  );

  function build() {
    setError(null);
    setLast(null);
    try {
      if (!bundle || !local) throw new Error("no local bundle for this asset");
      const idx = Number(index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= local.m) {
        throw new Error(`block index must be 0..${local.m - 1}`);
      }
      const p = buildProof(bundle, idx);
      setProof(p);
      setCheck(checkConsistencyLocal(bundle, p));
      setTamper(false);
      ctx.log({
        kind: "crypto",
        title: `Built proof for block ${idx}`,
        detail: `proofD=${p.proofD.length} · proofC=${p.proofC.length} levels`,
      });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  function applyTamper(next: boolean) {
    setTamper(next);
    if (!proof || !bundle) return;
    if (next) {
      const bad = Uint8Array.from(proof.C_i);
      bad[0] ^= 0x01;
      const p: Proof = { ...proof, C_i: bad };
      setProof(p);
      setCheck(checkConsistencyLocal(bundle, p));
    } else {
      // rebuild the honest proof for the same index
      const p = buildProof(bundle, proof.index);
      setProof(p);
      setCheck(checkConsistencyLocal(bundle, p));
    }
  }

  async function submit() {
    setError(null);
    setBusy("dispute");
    try {
      if (!sale || !proof) throw new Error("build a proof first");
      if (ctx.actor.address.toLowerCase() !== sale.buyer.toLowerCase()) {
        throw new Error("only the buyer may call disputeMode1()");
      }
      const r = await send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.escrow,
        abi: ABIS.escrow,
        functionName: "disputeMode1",
        args: [
          BigInt(sale.saleId),
          {
            K: local!.K,
            N: local!.N,
            s: local!.s,
            index: BigInt(proof.index),
            C_i: bytesToHex(proof.C_i) as Hex,
            leafD: bytesToHex(proof.leafD) as Hex,
            proofD: proof.proofD.map((x) => bytesToHex(x) as Hex),
            proofC: proof.proofC.map((x) => bytesToHex(x) as Hex),
          },
        ],
      });
      setLast({
        hash: r.hash,
        gas: r.gasUsed.toString(),
        status: r.status,
        events: r.events.map((e) => e.name),
      });
      ctx.log({
        kind: "ok",
        title: `disputeMode1 on sale #${sale.saleId} — ${check?.consistent ? "claim rejected" : "seller slashed"}`,
        detail: r.events.map((e) => e.name).join(", "),
        hash: r.hash,
        gas: r.gasUsed.toString(),
        block: r.blockNumber.toString(),
        status: r.status,
      });
      ctx.bump();
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setError(msg);
      ctx.log({ kind: "error", title: "disputeMode1 reverted", detail: msg });
    } finally {
      setBusy(null);
    }
  }

  const isBuyer = sale && ctx.actor.address.toLowerCase() === sale.buyer.toLowerCase();

  return (
    <div className="grid two">
      <Card
        title="Dispute lab · Mode 1 recomputation"
        subtitle="The buyer picks one block, attaches Merkle proofs, and the contract recomputes it."
      >
        <div className="row2">
          <label className="field">
            <span className="field-label">Sale</span>
            <select value={saleId} onChange={(e) => { setSaleId(e.target.value); setProof(null); setCheck(null); }}>
              {eligible.length === 0 && <option value="">no disputable sale</option>}
              {eligible.map((s) => (
                <option key={s.saleId} value={s.saleId}>
                  #{s.saleId} · asset {s.assetId} · {s.stateName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Block index</span>
            <input value={index} onChange={(e) => setIndex(e.target.value)} />
          </label>
        </div>

        {sale && (
          <div className="kv-grid">
            <KV k="state" v={<Pill tone="info">{sale.stateName}</Pill>} />
            <KV k="buyer" v={<Mono value={sale.buyer} short />} />
            <KV k="blocks" v={local ? `${local.m} × ${local.beta} B` : row ? `${row.m} × ${row.blockSize} B` : "—"} />
            <KV k="price" v={`${formatEther(sale.price)} ETH`} />
            <KV k="seller bond" v={`${formatEther(sale.bondSeller)} ETH`} />
          </div>
        )}

        {!local && sale && (
          <Notice tone="warn">
            No local bundle for asset #{sale.assetId}, so the buyer cannot construct the proof in this
            browser. Prepare and list the asset from this browser to make it disputable here.
          </Notice>
        )}

        <div className="actions wrap">
          <Btn tone="primary" onClick={build} disabled={!local || busy !== null}>
            Build proof
          </Btn>
          <label className="check inline">
            <input
              type="checkbox"
              checked={tamper}
              onChange={(e) => applyTamper(e.target.checked)}
              disabled={!proof}
            />
            <span>Tamper <code>C_i</code> (flip one bit)</span>
          </label>
        </div>

        {error && <Notice tone="bad">{error}</Notice>}

        {check && (
          <div className="checks">
            <div className={`check-row ${check.keyOk ? "ok" : "bad"}`}>
              <span>{check.keyOk ? "✓" : "✗"}</span> <code>cK == H(K‖N‖s)</code>
            </div>
            <div className={`check-row ${check.cipherProofOk ? "ok" : "bad"}`}>
              <span>{check.cipherProofOk ? "✓" : "✗"}</span> <code>C_i</code> Merkle proof vs{" "}
              <code>R_C</code>
            </div>
            <div className={`check-row ${check.plainProofOk ? "ok" : "bad"}`}>
              <span>{check.plainProofOk ? "✓" : "✗"}</span> committed leaf vs <code>R_D</code>
            </div>
            <div className={`check-row ${check.consistent ? "ok" : "bad"}`}>
              <span>{check.consistent ? "✓" : "✗"}</span> recomputed leaf vs committed leaf
            </div>
            <div className="leaf-compare">
              <div>
                <span className="field-label">recomputed</span>
                <Mono value={check.recomputedLeaf} />
              </div>
              <div>
                <span className="field-label">committed</span>
                <Mono value={check.committedLeaf} />
              </div>
            </div>
          </div>
        )}

        <div className="actions">
          <Btn
            tone={check?.consistent === false ? "danger" : "primary"}
            onClick={submit}
            disabled={!proof || busy !== null}
            title={isBuyer ? "disputeMode1(saleId, proof)" : "switch to the buyer account"}
          >
            {busy === "dispute" ? "Submitting…" : "Send disputeMode1()"}
          </Btn>
          {sale && !isBuyer && <Pill tone="warn">sign in as the buyer</Pill>}
        </div>

        {last && (
          <Notice tone={last.status === "success" ? "ok" : "bad"}>
            <div>
              <b>{last.status}</b> · {last.events.join(", ") || "no events"}
            </div>
            <div className="mono small">{last.hash}</div>
            <div className="mono small">{Number(last.gas).toLocaleString()} gas</div>
          </Notice>
        )}

        <Notice tone="info">
          If the recomputed block matches the committed leaf, the buyer's claim is false and the{" "}
          <b>buyer's bond is forfeited</b> to the seller (anti-spam). If it differs, the buyer is refunded
          and the <b>seller's bond is paid to the buyer</b>.
        </Notice>
      </Card>

      <div className="stack">
        <Card title="What the contract sees" subtitle="Exactly the tuple you are about to send.">
          {!proof ? (
            <Empty>Build a proof to inspect the calldata.</Empty>
          ) : (
            <div className="codeblock">
              <pre>{JSON.stringify(
                {
                  saleId,
                  K: local?.K,
                  N: local?.N,
                  s: local?.s,
                  index: proof.index,
                  C_iBytes: proof.C_i.length,
                  leafD: bytesToHex(proof.leafD),
                  proofD: proof.proofD.map((x) => bytesToHex(x)),
                  proofC: proof.proofC.map((x) => bytesToHex(x)),
                },
                null,
                2,
              )}</pre>
            </div>
          )}
        </Card>

        <Card title="Mode 2 · key-reveal path" subtitle="disputeMode2() does not prove anything on the spot.">
          <p>
            Mode 2 only moves the sale to <code>CHALLENGED</code> and starts the respond window. The seller
            then calls <code>respond(saleId, K, N, s)</code>, which checks{" "}
            <code>H(K‖N‖s) == cK</code> and moves the sale back to <code>DELIVERED</code>. Because{" "}
            <code>respond()</code> resets the state, the <code>CHALLENGED &amp;&amp; keyRevealed</code>{" "}
            branch inside <code>disputeMode1()</code> is effectively unreachable — a known design
            inconsistency, not a cryptographic one.
          </p>
          <Notice tone="warn">
            Revealing <code>K</code> in calldata publishes the content key (residual risk AT-14). After that
            the ciphertext is public.
          </Notice>
        </Card>
      </div>
    </div>
  );
}

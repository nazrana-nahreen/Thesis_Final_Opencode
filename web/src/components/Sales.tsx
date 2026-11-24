import { useEffect, useMemo, useState } from "react";
import type { PanelCtx } from "../lib/panel";
import {
  ABIS,
  formatEther,
  increaseTime,
  listSales,
  pc,
  readAsset,
  send,
  type AssetRow,
  type SaleRow,
} from "../lib/chain";
import { actorByAddress } from "../lib/actors";
import { decryptAll, plaintextRoot, unhex, hex } from "../lib/crc";
import { ipfsCat } from "../lib/ipfs";
import { ciphertextOf } from "../lib/store";
import { decrypt as eciesDecrypt, encrypt as eciesEncrypt } from "eciesjs";
import { bytesToHex } from "viem";
import { Btn, Card, Empty, KV, Mono, Notice, Pill } from "./ui";

const STATES = ["NONE", "ESCROWED", "DELIVERED", "CHALLENGED", "SETTLED", "REFUNDED"];

function fmtDelta(seconds: number): string {
  if (seconds <= 0) return "expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

interface VerifyResult {
  status: "match" | "mismatch" | "error";
  detail: string;
  preview?: string;
  root?: string;
}

export function Sales({ ctx }: { ctx: PanelCtx }) {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [assetRows, setAssetRows] = useState<Record<string, AssetRow>>({});
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<Record<string, VerifyResult>>({});

  const selectedId = ctx.selectedSale ?? sales[sales.length - 1]?.saleId ?? null;
  const selected = useMemo(() => sales.find((s) => s.saleId === selectedId) ?? null, [sales, selectedId]);

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
        if (alive) setAssetRows(map);
        try {
          const blk = await pc(ctx.cfg).getBlock();
          if (alive) setNow(Number(blk.timestamp));
        } catch {
          /* ignore */
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

  const localAsset = selected
    ? ctx.assets.find((a) => a.assetId === selected.assetId)
    : undefined;

  async function runAction(
    key: string,
    label: string,
    fn: () => Promise<{ hash: string; gasUsed: bigint; blockNumber: bigint; status: string; events: { name: string }[] }>,
  ) {
    setError(null);
    setBusy(key);
    try {
      const r = await fn();
      ctx.log({
        kind: "ok",
        title: label,
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
      ctx.log({ kind: "error", title: `${label} reverted`, detail: msg });
    } finally {
      setBusy(null);
    }
  }

  async function deliver(s: SaleRow) {
    const buyer = actorByAddress(s.buyer);
    if (!buyer) throw new Error("buyer is not a demo actor");
    if (!localAsset) throw new Error("no local bundle for this asset (no K available)");
    const encK = bytesToHex(eciesEncrypt(buyer.publicKey, unhex(localAsset.K)));
    await runAction(`deliver-${s.saleId}`, `Delivered wrapped key for sale #${s.saleId}`, () =>
      send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.escrow,
        abi: ABIS.escrow,
        functionName: "deliver",
        args: [BigInt(s.saleId), encK],
      }),
    );
  }

  async function simple(fn: string, s: SaleRow, label: string, args?: unknown[]) {
    await runAction(`${fn}-${s.saleId}`, label, () =>
      send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.escrow,
        abi: ABIS.escrow,
        functionName: fn,
        args: args ?? [BigInt(s.saleId)],
      }),
    );
  }

  async function verifySale(s: SaleRow) {
    const key = `verify-${s.saleId}`;
    setBusy(key);
    try {
      if (ctx.actor.address.toLowerCase() !== s.buyer.toLowerCase()) {
        throw new Error("only the buyer can unwrap the key");
      }
      if (!localAsset) throw new Error("no local ciphertext index for this asset");
      const K = new Uint8Array(eciesDecrypt(ctx.actor.privateKey, unhex(s.encK)));
      let C: Uint8Array;
      try {
        C = await ipfsCat(localAsset.cidC);
      } catch {
        C = ciphertextOf(localAsset);
        ctx.log({ kind: "info", title: "IPFS fetch failed — using local ciphertext copy" });
      }
      const D = decryptAll(K, C, localAsset.beta);
      const root = plaintextRoot(D, localAsset.beta);
      const onchain = assetRows[s.assetId]?.R_D ?? "";
      const match = root.toLowerCase() === onchain.toLowerCase();
      let preview = "";
      try {
        preview = new TextDecoder().decode(D).slice(0, 240);
      } catch {
        preview = "[binary]";
      }
      setVerify((v) => ({
        ...v,
        [s.saleId]: {
          status: match ? "match" : "mismatch",
          detail: match
            ? "recomputed R_D equals the on-chain commitment"
            : "recomputed R_D differs from the on-chain commitment",
          preview,
          root,
        },
      }));
      ctx.log({
        kind: match ? "ok" : "error",
        title: match ? `Buyer verified sale #${s.saleId}` : `Buyer found a mismatch in sale #${s.saleId}`,
        detail: `K=${hex(K).slice(0, 12)}… · root=${root.slice(0, 12)}…`,
      });
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setVerify((v) => ({ ...v, [s.saleId]: { status: "error", detail: msg } }));
      ctx.log({ kind: "error", title: "Verification failed", detail: msg });
    } finally {
      setBusy(null);
    }
  }

  async function timeTravel(seconds: number) {
    try {
      await increaseTime(ctx.cfg, seconds);
      ctx.log({
        kind: "system",
        title: `Advanced chain time by ${seconds}s`,
        detail: "Anvil evm_increaseTime + evm_mine",
      });
      ctx.bump();
    } catch (e: any) {
      ctx.log({ kind: "error", title: "Time travel failed", detail: e?.shortMessage ?? e?.message });
    }
  }

  const isBuyer = selected && ctx.actor.address.toLowerCase() === selected.buyer.toLowerCase();
  const isSeller = selected && ctx.actor.address.toLowerCase() === selected.seller.toLowerCase();
  const v = selected ? verify[selected.saleId] : undefined;

  return (
    <div className="grid sales-layout">
      <Card title="Sales" subtitle="Read from SaleEscrow.getSale()." right={<Btn tone="ghost" onClick={ctx.bump}>Refresh</Btn>}>
        {error && <Notice tone="bad">{error}</Notice>}
        {sales.length === 0 && <Empty>No sales yet. Buy an asset in the Market tab.</Empty>}
        <div className="sale-list">
          {sales.map((s) => (
            <button
              key={s.saleId}
              className={s.saleId === selectedId ? "sale-item active" : "sale-item"}
              onClick={() => ctx.setSelectedSale(s.saleId)}
            >
              <span className="sale-id">#{s.saleId}</span>
              <span className="sale-asset">asset {s.assetId}</span>
              <Pill tone={s.stateName === "SETTLED" ? "ok" : s.stateName === "REFUNDED" ? "bad" : "info"}>
                {s.stateName}
              </Pill>
              <span className="sale-price">{formatEther(s.price)} ETH</span>
            </button>
          ))}
        </div>

        <div className="actions wrap">
          <span className="muted small">Anvil test controls:</span>
          <Btn tone="ghost" onClick={() => timeTravel(3600)}>+1 hour</Btn>
          <Btn tone="ghost" onClick={() => timeTravel(86400)}>+1 day</Btn>
          <Btn tone="ghost" onClick={() => timeTravel(3 * 86400)}>+3 days</Btn>
        </div>
      </Card>

      <div className="stack">
        {!selected && <Card title="Sale detail"><Empty>Select a sale.</Empty></Card>}

        {selected && (
          <>
            <Card
              title={`Sale #${selected.saleId} · asset #${selected.assetId}`}
              subtitle={
                isBuyer ? "You are the buyer" : isSeller ? "You are the seller" : "You are an observer"
              }
              right={<Pill tone={selected.stateName === "SETTLED" ? "ok" : selected.stateName === "REFUNDED" ? "bad" : "info"}>{selected.stateName}</Pill>}
            >
              <div className="stepper">
                {STATES.map((st, i) => {
                  const terminal = selected.state >= 4;
                  const active = terminal
                    ? st === STATES[selected.state]
                    : st === selected.stateName;
                  const past = !terminal && i < selected.state;
                  return (
                    <div
                      key={st}
                      className={`step ${active ? "active" : ""} ${past ? "past" : ""} ${i >= 4 ? "terminal" : ""}`}
                    >
                      {st}
                    </div>
                  );
                })}
              </div>

              <div className="kv-grid">
                <KV k="buyer" v={<Mono value={selected.buyer} short />} />
                <KV k="seller" v={<Mono value={selected.seller} short />} />
                <KV k="price" v={`${formatEther(selected.price)} ETH`} />
                <KV k="buyer bond" v={`${formatEther(selected.bondBuyer)} ETH`} />
                <KV k="seller bond" v={`${formatEther(selected.bondSeller)} ETH`} />
                <KV k="key revealed" v={selected.keyRevealed ? "yes" : "no"} />
                <KV
                  k="deliver by"
                  v={selected.tDeliver ? fmtDelta(selected.tDeliver - now) : "—"}
                />
                <KV
                  k="confirm by"
                  v={selected.tConfirm ? fmtDelta(selected.tConfirm - now) : "—"}
                />
                {selected.tRespond > 0 && (
                  <KV k="respond by" v={fmtDelta(selected.tRespond - now)} />
                )}
                <KV k="encK" v={selected.encK && selected.encK !== "0x" ? `${(selected.encK.length - 2) / 2} bytes` : "—"} />
              </div>

              {selected.encK && selected.encK !== "0x" && (
                <div className="encK">
                  <span className="field-label">Wrapped key (on-chain)</span>
                  <Mono value={selected.encK} />
                </div>
              )}

              <div className="actions wrap">
                {selected.stateName === "ESCROWED" && isSeller && (
                  <Btn tone="primary" disabled={busy !== null} onClick={() => deliver(selected)}>
                    {busy === `deliver-${selected.saleId}` ? "Delivering…" : "Deliver wrapped key"}
                  </Btn>
                )}
                {selected.stateName === "ESCROWED" && now > selected.tDeliver && (
                  <Btn tone="danger" disabled={busy !== null} onClick={() => simple("timeoutDeliver", selected, "timeoutDeliver: refunded buyer")}>
                    timeoutDeliver()
                  </Btn>
                )}
                {selected.stateName === "DELIVERED" && isBuyer && now <= selected.tConfirm && (
                  <>
                    <Btn tone="primary" disabled={busy !== null} onClick={() => simple("confirm", selected, "confirm(): settled")}>
                      confirm()
                    </Btn>
                    <Btn tone="danger" disabled={busy !== null} onClick={() => simple("disputeMode2", selected, "disputeMode2(): CHALLENGED")}>
                      disputeMode2()
                    </Btn>
                    <Btn
                      tone="ghost"
                      onClick={() => {
                        ctx.setTab("dispute");
                        ctx.bump();
                      }}
                    >
                      Build Mode 1 proof →
                    </Btn>
                  </>
                )}
                {selected.stateName === "DELIVERED" && isSeller && now > selected.tConfirm && (
                  <Btn tone="primary" disabled={busy !== null} onClick={() => simple("timeoutConfirm", selected, "timeoutConfirm(): settled")}>
                    timeoutConfirm()
                  </Btn>
                )}
                {selected.stateName === "CHALLENGED" && isSeller && localAsset && now <= selected.tRespond && (
                  <Btn
                    tone="primary"
                    disabled={busy !== null}
                    onClick={() =>
                      simple("respond", selected, `respond(): key revealed for sale #${selected.saleId}`, [
                        BigInt(selected.saleId),
                        localAsset.K,
                        localAsset.N,
                        localAsset.s,
                      ])
                    }
                  >
                    respond() with K, N, s
                  </Btn>
                )}
                {selected.stateName === "CHALLENGED" && now > selected.tRespond && (
                  <Btn tone="danger" disabled={busy !== null} onClick={() => simple("timeoutRespond", selected, "timeoutRespond(): refunded buyer")}>
                    timeoutRespond()
                  </Btn>
                )}
                {isBuyer && selected.stateName === "DELIVERED" && (
                  <Btn tone="ghost" disabled={busy !== null} onClick={() => verifySale(selected)}>
                    {busy === `verify-${selected.saleId}` ? "Verifying…" : "Unwrap & verify against R_D"}
                  </Btn>
                )}
              </div>

              {v && (
                <Notice tone={v.status === "match" ? "ok" : v.status === "mismatch" ? "bad" : "warn"}>
                  <b>{v.status.toUpperCase()}</b> — {v.detail}
                  {v.root && (
                    <div className="mono small">
                      computed R_D: {v.root.slice(0, 18)}… · on-chain: {assetRows[selected.assetId]?.R_D.slice(0, 18)}…
                    </div>
                  )}
                  {v.preview && <pre className="preview">{v.preview}</pre>}
                </Notice>
              )}
            </Card>

            <Card title="Asset commitments" subtitle="The pre-sale binding the seller cannot change.">
              {!assetRows[selected.assetId] ? (
                <Empty>Asset data unavailable.</Empty>
              ) : (
                <div className="commit-grid">
                  <KV k="hD" v={<Mono value={assetRows[selected.assetId].hD} short />} />
                  <KV k="hC" v={<Mono value={assetRows[selected.assetId].hC} short />} />
                  <KV k="R_D" v={<Mono value={assetRows[selected.assetId].R_D} short />} />
                  <KV k="R_C" v={<Mono value={assetRows[selected.assetId].R_C} short />} />
                  <KV k="cK" v={<Mono value={assetRows[selected.assetId].cK} short />} />
                  <KV k="blocks" v={`${assetRows[selected.assetId].m} × ${assetRows[selected.assetId].blockSize} B`} />
                  <KV k="previewCid(b32)" v={<Mono value={assetRows[selected.assetId].previewCid} short />} />
                  <KV k="fingerprint" v={<Mono value={assetRows[selected.assetId].fingerprint} short />} />
                </div>
              )}
              {!localAsset && (
                <Notice tone="warn">
                  No local bundle for this asset — ciphertext CID and K are not in this browser, so delivery
                  and buyer verification are unavailable. (Tier-1 limitation: no on-chain CID index.)
                </Notice>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

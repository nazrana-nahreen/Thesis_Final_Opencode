import { useMemo, useState } from "react";
import type { PanelCtx } from "../lib/panel";
import {
  buildBundle,
  hex,
  sha256,
  toBase64,
  utf8,
  type Bytes,
} from "../lib/crc";
import { ipfsAdd } from "../lib/ipfs";
import { ABIS, formatEther, parseEther, send } from "../lib/chain";
import { makeStoredAsset, upsertAsset, type StoredAsset } from "../lib/store";
import { bytesToHex } from "viem";
import { Btn, Card, Empty, Field, KV, Mono, Notice, Pill } from "./ui";

function concat(list: Uint8Array[]): Uint8Array {
  const total = list.reduce((n, x) => n + x.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const x of list) {
    out.set(x, off);
    off += x.length;
  }
  return out;
}

function fingerprintOf(plaintext: Bytes): `0x${string}` {
  const h = sha256(plaintext).subarray(0, 8);
  const b = new Uint8Array(32);
  b.set(h, 0);
  return bytesToHex(b);
}

export function Studio({ ctx }: { ctx: PanelCtx }) {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState(
    "The Little Lantern — an AIGC illustration licence.\nGenerated locally for the MetaTrade-R demo.",
  );
  const [file, setFile] = useState<File | null>(null);
  const [priceEth, setPriceEth] = useState("0.01");
  const [royaltyBps, setRoyaltyBps] = useState("500");
  const [parentAssetId, setParentAssetId] = useState("0");
  const [attackMode, setAttackMode] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myAssets = useMemo(
    () => ctx.assets.filter((a) => a.sellerIndex === ctx.actor.index),
    [ctx.assets, ctx.actor.index],
  );

  async function prepare() {
    setError(null);
    setBusy("prepare");
    try {
      const bytes =
        mode === "file" && file
          ? new Uint8Array(await file.arrayBuffer())
          : utf8(text);
      if (!bytes.length) throw new Error("empty content");
      if (bytes.length > 2 * 1024 * 1024) throw new Error("demo limit is 2 MB");

      ctx.log({
        kind: "crypto",
        title: "Building asset bundle",
        detail: `${bytes.length} bytes · β=1024 · attack=${attackMode}`,
      });

      const b = buildBundle(bytes, 1024, attackMode);

      const cidC = await ipfsAdd(b.C);
      const cidLeafD = await ipfsAdd(concat(b.leafD));
      const cidLeafC = await ipfsAdd(concat(b.leafC));
      const cidPreview = await ipfsAdd(bytes.subarray(0, Math.min(1024, bytes.length)));

      const stored = makeStoredAsset({
        localId: `a-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: mode === "file" && file ? file.name : text.slice(0, 40) || "inline text",
        sellerIndex: ctx.actor.index,
        assetId: null,
        size: bytes.length,
        beta: b.beta,
        m: b.m,
        hD: hex(b.hD),
        hC: hex(b.hC),
        R_D: hex(b.R_D),
        R_C: hex(b.R_C),
        cK: hex(b.cK),
        leafListD: bytesToHex(sha256(utf8(cidLeafD))),
        leafListC: bytesToHex(sha256(utf8(cidLeafC))),
        previewCidBytes: bytesToHex(sha256(utf8(cidPreview))),
        fingerprint: fingerprintOf(bytes),
        cidC,
        cidLeafD,
        cidLeafC,
        cidPreview,
        K: hex(b.K),
        N: hex(b.N),
        s: hex(b.s),
        saltD: hex(b.saltD),
        saltC: hex(b.saltC),
        leafD: b.leafD.map(hex),
        leafC: b.leafC.map(hex),
        attackMode,
        priceWei: parseEther(priceEth || "0").toString(),
        royaltyBps: Number(royaltyBps || 0),
        parentAssetId: parentAssetId || "0",
        createdAt: Date.now(),
        textPreview: mode === "file" ? "[binary file]" : text.slice(0, 200),
        C: b.C,
      });

      ctx.setAssets(upsertAsset(stored));
      ctx.log({
        kind: "ok",
        title: `Prepared “${stored.name}”`,
        detail: `${b.m} block(s) · C=${cidC.slice(0, 12)}…${attackMode ? " · ATTACK MODE" : ""}`,
      });
      ctx.bump();
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setError(msg);
      ctx.log({ kind: "error", title: "Prepare failed", detail: msg });
    } finally {
      setBusy(null);
    }
  }

  async function listOnChain(a: StoredAsset) {
    setError(null);
    setBusy(`list-${a.localId}`);
    try {
      const r = await send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.registry,
        abi: ABIS.registry,
        functionName: "list",
        args: [
          a.hD,
          a.hC,
          a.R_D,
          a.R_C,
          a.cK,
          a.leafListD,
          a.leafListC,
          a.previewCidBytes,
          a.fingerprint,
          BigInt(a.m),
          BigInt(a.beta),
          BigInt(a.priceWei),
          a.royaltyBps,
          BigInt(a.parentAssetId),
        ],
      });
      const ev = r.events.find((e) => e.name === "AssetListed");
      const rawAssetId = ev?.args?.assetId;
      const assetId = rawAssetId === undefined || rawAssetId === null ? null : String(rawAssetId);
      if (assetId) {
        ctx.setAssets(upsertAsset({ ...a, assetId }));
        ctx.log({
          kind: "ok",
          title: `Listed asset #${assetId}`,
          detail: `${formatEther(BigInt(a.priceWei))} ETH · ${r.events.map((e) => e.name).join(", ")}`,
          hash: r.hash,
          gas: r.gasUsed.toString(),
          block: r.blockNumber.toString(),
          status: r.status,
        });
      }
      ctx.bump();
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setError(msg);
      ctx.log({ kind: "error", title: "list() reverted", detail: msg });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid two">
      <Card
        title="1 · Prepare content"
        subtitle="Encrypt, build Merkle trees, and commit — all in the browser."
      >
        <div className="seg">
          <button className={mode === "text" ? "seg-btn active" : "seg-btn"} onClick={() => setMode("text")}>
            Text
          </button>
          <button className={mode === "file" ? "seg-btn active" : "seg-btn"} onClick={() => setMode("file")}>
            File
          </button>
        </div>

        {mode === "text" ? (
          <Field label="Content" hint="Any text works. The block size is fixed at β = 1024 bytes.">
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        ) : (
          <Field label="File" hint="Demo limit 2 MB (localStorage holds the bundle).">
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}

        <div className="row3">
          <Field label="Price (ETH)">
            <input value={priceEth} onChange={(e) => setPriceEth(e.target.value)} />
          </Field>
          <Field label="Parent asset id" hint="0 = root asset">
            <input value={parentAssetId} onChange={(e) => setParentAssetId(e.target.value)} />
          </Field>
          <Field label="Royalty (bps)" hint="≤ 5000 (50%)">
            <input value={royaltyBps} onChange={(e) => setRoyaltyBps(e.target.value)} />
          </Field>
        </div>

        <label className="check">
          <input type="checkbox" checked={attackMode} onChange={(e) => setAttackMode(e.target.checked)} />
          <span>
            <b>Attack mode</b> — commit <code>R_D / hD</code> over different plaintext while encrypting the
            real content. This simulates AT-02 so you can watch a Mode 1 dispute succeed.
          </span>
        </label>

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="actions">
          <Btn tone="primary" onClick={prepare} disabled={busy !== null}>
            {busy === "prepare" ? "Working…" : "Prepare & upload to IPFS"}
          </Btn>
        </div>
      </Card>

      <Card
        title="2 · List on-chain"
        subtitle="Commitments must exist before any buyer can pay."
        right={<Pill tone="info">{myAssets.length} prepared</Pill>}
      >
        {myAssets.length === 0 && <Empty>No assets prepared by {ctx.actor.role} yet.</Empty>}
        {myAssets.map((a) => (
          <div key={a.localId} className="prepared">
            <div className="prepared-head">
              <strong>{a.name}</strong>
              {a.assetId ? (
                <Pill tone="ok">asset #{a.assetId}</Pill>
              ) : (
                <Pill tone="warn">not listed</Pill>
              )}
              {a.attackMode && <Pill tone="bad">attack mode</Pill>}
            </div>
            <div className="commit-grid">
              <KV k="size" v={`${a.size} B · ${a.m} blocks`} />
              <KV k="price" v={`${formatEther(BigInt(a.priceWei))} ETH`} />
              <KV k="parent" v={a.parentAssetId} />
              <KV k="royalty" v={`${a.royaltyBps} bps`} />
              <KV k="hD" v={<Mono value={a.hD} short />} />
              <KV k="hC" v={<Mono value={a.hC} short />} />
              <KV k="R_D" v={<Mono value={a.R_D} short />} />
              <KV k="R_C" v={<Mono value={a.R_C} short />} />
              <KV k="cK" v={<Mono value={a.cK} short />} />
              <KV k="cid(C)" v={<Mono value={a.cidC} short />} />
            </div>
            <div className="actions">
              {!a.assetId ? (
                <Btn
                  tone="primary"
                  onClick={() => listOnChain(a)}
                  disabled={busy !== null}
                >
                  {busy === `list-${a.localId}` ? "Listing…" : "List on-chain"}
                </Btn>
              ) : (
                <Btn tone="ghost" onClick={() => ctx.setTab("market")}>
                  Open in market →
                </Btn>
              )}
            </div>
          </div>
        ))}
        <Notice tone="warn">
          Before someone can buy, the seller must deposit a bond ≥ price via{" "}
          <code>depositBond()</code> (Ledger tab). This is the solvency guarantee.
        </Notice>
      </Card>
    </div>
  );
}

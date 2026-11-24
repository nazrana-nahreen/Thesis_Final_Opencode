import { useEffect, useState } from "react";
import type { PanelCtx } from "../lib/panel";
import {
  ABIS,
  formatEther,
  listAssets,
  parseEther,
  pc,
  readBondCredit,
  send,
  assetRegistryProbe,
  type AssetRow,
} from "../lib/chain";
import { stringToHex, type Hex } from "viem";
import { Btn, Card, Empty, Mono, Notice, Pill } from "./ui";

export function Market({ ctx }: { ctx: PanelCtx }) {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [bonds, setBonds] = useState<Record<string, bigint>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const list = await listAssets(ctx.cfg);
        if (!alive) return;
        setRows(list);
        const b: Record<string, bigint> = {};
        for (const r of list) {
          if (b[r.seller] === undefined) b[r.seller] = await readBondCredit(ctx.cfg, r.seller);
        }
        if (alive) setBonds(b);
        setError(null);
      } catch (e: any) {
        if (alive) setError(e?.shortMessage ?? e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ctx.cfg, ctx.tick]);

  async function buy(r: AssetRow) {
    setError(null);
    setBusy(`buy-${r.assetId}`);
    try {
      const buyerBond = parseEther("0.001");
      const res = await send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.escrow,
        abi: ABIS.escrow,
        functionName: "buy",
        args: [BigInt(r.assetId)],
        value: r.price + buyerBond,
      });
      const ev = res.events.find((e) => e.name === "SaleCreated");
      const rawSaleId = ev?.args?.saleId;
      const saleId = rawSaleId === undefined || rawSaleId === null ? null : String(rawSaleId);
      ctx.log({
        kind: "ok",
        title: `Bought asset #${r.assetId}${saleId ? ` → sale #${saleId}` : ""}`,
        detail: `paid ${formatEther(r.price + buyerBond)} ETH (price + 0.001 bond)`,
        hash: res.hash,
        gas: res.gasUsed.toString(),
        block: res.blockNumber.toString(),
        status: res.status,
      });
      if (saleId) {
        ctx.setSelectedSale(saleId);
        ctx.setTab("sales");
      }
      ctx.bump();
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? String(e);
      setError(msg);
      ctx.log({ kind: "error", title: "buy() reverted", detail: msg });
    } finally {
      setBusy(null);
    }
  }

  async function deactivate(r: AssetRow) {
    setBusy(`deact-${r.assetId}`);
    try {
      const res = await send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.registry,
        abi: ABIS.registry,
        functionName: "deactivate",
        args: [BigInt(r.assetId), stringToHex("demo", { size: 8 }) as Hex],
      });
      ctx.log({
        kind: "ok",
        title: `Deactivated asset #${r.assetId}`,
        detail: "isActive() now returns false; buy() will revert",
        hash: res.hash,
        gas: res.gasUsed.toString(),
        block: res.blockNumber.toString(),
        status: res.status,
      });
      ctx.bump();
    } catch (e: any) {
      ctx.log({ kind: "error", title: "deactivate() reverted", detail: e?.shortMessage ?? e?.message });
    } finally {
      setBusy(null);
    }
  }

  async function probe(r: AssetRow) {
    try {
      const p = await assetRegistryProbe(ctx.cfg, r.assetId);
      ctx.log({
        kind: "read",
        title: `getters for asset #${r.assetId}`,
        detail: `sellerOf=${p.sellerOf} · parentOf=${p.parentOf} · royaltyOf=${p.royaltyOf} · isActive=${p.isActive}`,
      });
    } catch (e: any) {
      ctx.log({ kind: "error", title: "read failed", detail: e?.shortMessage ?? e?.message });
    }
  }

  return (
    <Card
      title="Market"
      subtitle="Every listing read directly from AssetRegistry.get()."
      right={
        <Btn tone="ghost" onClick={ctx.bump}>
          Refresh
        </Btn>
      }
    >
      {error && <Notice tone="bad">{error}</Notice>}
      {loading && <Empty>Loading listings…</Empty>}
      {!loading && rows.length === 0 && <Empty>No assets listed yet. Prepare one in the Asset studio.</Empty>}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Seller</th>
                <th>Price</th>
                <th>Size</th>
                <th>Parent</th>
                <th>Royalty</th>
                <th>Commitments</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSeller = r.seller.toLowerCase() === ctx.actor.address.toLowerCase();
                const bond = bonds[r.seller] ?? 0n;
                const canBuy = r.active && !isSeller && bond >= r.price;
                return (
                  <tr key={r.assetId}>
                    <td className="mono">{r.assetId}</td>
                    <td>
                      <Mono value={r.seller} short />
                      {isSeller && <Pill tone="info">you</Pill>}
                    </td>
                    <td className="mono">{formatEther(r.price)} ETH</td>
                    <td className="mono">
                      {r.m} × {r.blockSize} B
                    </td>
                    <td className="mono">{r.parentAssetId}</td>
                    <td className="mono">{r.royaltyBps} bps</td>
                    <td>
                      <div className="commit-col">
                        <span title={r.hD}>
                          hD <code>{r.hD.slice(0, 10)}…</code>
                        </span>
                        <span title={r.R_D}>
                          R_D <code>{r.R_D.slice(0, 10)}…</code>
                        </span>
                        <span title={r.cK}>
                          cK <code>{r.cK.slice(0, 10)}…</code>
                        </span>
                      </div>
                    </td>
                    <td>
                      {r.active ? <Pill tone="ok">active</Pill> : <Pill tone="bad">inactive</Pill>}
                      {r.active && bond < r.price && (
                        <div className="tiny warn-text">bond {formatEther(bond)} &lt; price</div>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {!isSeller && (
                          <Btn
                            tone="primary"
                            disabled={!canBuy || busy !== null}
                            onClick={() => buy(r)}
                            title={
                              isSeller
                                ? "self-purchase is blocked"
                                : bond < r.price
                                  ? "seller bond below price"
                                  : "buy()"
                            }
                          >
                            {busy === `buy-${r.assetId}` ? "Buying…" : "Buy"}
                          </Btn>
                        )}
                        {isSeller && r.active && (
                          <Btn
                            tone="danger"
                            disabled={busy !== null}
                            onClick={() => deactivate(r)}
                            title="deactivate(assetId, reason)"
                          >
                            Deactivate
                          </Btn>
                        )}
                        <Btn tone="ghost" onClick={() => probe(r)} title="sellerOf/parentOf/royaltyOf/isActive">
                          Probe
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Notice tone="info">
        Buying sends <code>price + 0.001 ETH</code> exactly (<code>BadPayment</code> otherwise). The seller
        must already hold <code>sellerCredit ≥ price</code> or the call reverts with{" "}
        <code>InsufficientSellerCredit</code>.
      </Notice>
    </Card>
  );
}

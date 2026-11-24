import { useEffect, useState } from "react";
import type { PanelCtx } from "../lib/panel";
import {
  ABIS,
  formatEther,
  parseEther,
  pc,
  readBondCredit,
  readEthBalance,
  readLicenceBalance,
  readRoyaltyCredit,
  send,
} from "../lib/chain";
import { ACTORS } from "../lib/actors";
import { Btn, Card, Empty, Field, KV, Mono, Notice, Pill } from "./ui";

interface Row {
  address: string;
  role: string;
  eth: bigint;
  bond: bigint;
  royalty: bigint;
}

export function Ledger({ ctx }: { ctx: PanelCtx }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [bondAmount, setBondAmount] = useState("0.01");
  const [assetId, setAssetId] = useState("1");
  const [licence, setLicence] = useState<bigint | null>(null);
  const [counters, setCounters] = useState<{ nextAssetId: bigint; nextSaleId: bigint } | null>(null);
  const [windows, setWindows] = useState<{ deliver: bigint; confirm: bigint; respond: bigint; bond: bigint } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const client = pc(ctx.cfg);
        const next: Row[] = [];
        for (const a of ACTORS.slice(0, 4)) {
          next.push({
            address: a.address,
            role: a.role,
            eth: await readEthBalance(ctx.cfg, a.address),
            bond: await readBondCredit(ctx.cfg, a.address),
            royalty: await readRoyaltyCredit(ctx.cfg, a.address),
          });
        }
        const [nextAssetId, nextSaleId, deliver, confirm, respond, bond] = await Promise.all([
          client.readContract({
            address: ctx.cfg.registry,
            abi: ABIS.registry as never,
            functionName: "nextAssetId",
          }),
          client.readContract({
            address: ctx.cfg.escrow,
            abi: ABIS.escrow as never,
            functionName: "nextSaleId",
          }),
          client.readContract({
            address: ctx.cfg.escrow,
            abi: ABIS.escrow as never,
            functionName: "DELIVER_WINDOW",
          }),
          client.readContract({
            address: ctx.cfg.escrow,
            abi: ABIS.escrow as never,
            functionName: "CONFIRM_WINDOW",
          }),
          client.readContract({
            address: ctx.cfg.escrow,
            abi: ABIS.escrow as never,
            functionName: "RESPOND_WINDOW",
          }),
          client.readContract({
            address: ctx.cfg.escrow,
            abi: ABIS.escrow as never,
            functionName: "BUYER_BOND",
          }),
        ]);
        if (alive) {
          setRows(next);
          setCounters({ nextAssetId: BigInt(nextAssetId as bigint), nextSaleId: BigInt(nextSaleId as bigint) });
          setWindows({
            deliver: BigInt(deliver as bigint),
            confirm: BigInt(confirm as bigint),
            respond: BigInt(respond as bigint),
            bond: BigInt(bond as bigint),
          });
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(e?.shortMessage ?? e?.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ctx.cfg, ctx.tick]);

  async function act(key: string, label: string, fn: () => Promise<any>) {
    setError(null);
    setBusy(key);
    try {
      const r = await fn();
      ctx.log({
        kind: "ok",
        title: label,
        detail: r.events.map((e: any) => e.name).join(", "),
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

  function deposit() {
    return act("deposit", `depositBond(): ${bondAmount} ETH from ${ctx.actor.role}`, () =>
      send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.escrow,
        abi: ABIS.escrow,
        functionName: "depositBond",
        value: parseEther(bondAmount || "0"),
      }),
    );
  }

  function withdrawBond() {
    return act("wbond", "withdrawBondCredit()", () =>
      send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.escrow,
        abi: ABIS.escrow,
        functionName: "withdrawBondCredit",
      }),
    );
  }

  function withdrawRoyalty() {
    return act("wroyalty", "RoyaltySplitter.withdraw()", () =>
      send(ctx.cfg, ctx.actor, {
        address: ctx.cfg.royalty,
        abi: ABIS.royalty,
        functionName: "withdraw",
      }),
    );
  }

  async function checkLicence() {
    setError(null);
    try {
      const bal = await readLicenceBalance(ctx.cfg, ctx.actor.address, assetId);
      setLicence(bal);
      ctx.log({
        kind: "read",
        title: `LicenceToken.balanceOf(${ctx.actor.role}, ${assetId})`,
        detail: `${bal} token(s)`,
      });
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? String(e));
    }
  }

  const me = rows.find((r) => r.address === ctx.actor.address);

  return (
    <div className="grid two">
      <Card title="Bond & solvency" subtitle="buy() requires sellerCredit[seller] ≥ price.">
        <div className="kv-grid">
          <KV k="your ETH" v={me ? `${formatEther(me.eth)} ETH` : "—"} />
          <KV k="your bond credit" v={me ? `${formatEther(me.bond)} ETH` : "—"} />
          <KV k="buyer bond" v={windows ? `${formatEther(windows.bond)} ETH` : "—"} />
        </div>

        <Field label="Amount to deposit (ETH)" hint="depositBond() is payable; credit is withdrawable.">
          <input value={bondAmount} onChange={(e) => setBondAmount(e.target.value)} />
        </Field>

        <div className="actions wrap">
          <Btn tone="primary" onClick={deposit} disabled={busy !== null}>
            {busy === "deposit" ? "Depositing…" : "depositBond()"}
          </Btn>
          <Btn tone="ghost" onClick={withdrawBond} disabled={busy !== null}>
            withdrawBondCredit()
          </Btn>
        </div>

        {error && <Notice tone="bad">{error}</Notice>}

        <table className="table compact">
          <thead>
            <tr>
              <th>Actor</th>
              <th>ETH</th>
              <th>Bond credit</th>
              <th>Royalty credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.address} className={r.address === ctx.actor.address ? "row-active" : ""}>
                <td>
                  {r.role}
                  <div className="mono small">
                    {r.address.slice(0, 8)}…{r.address.slice(-4)}
                  </div>
                </td>
                <td className="mono">{Number(formatEther(r.eth)).toFixed(3)}</td>
                <td className="mono">{Number(formatEther(r.bond)).toFixed(4)}</td>
                <td className="mono">{Number(formatEther(r.royalty)).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="stack">
        <Card title="Royalty credit" subtitle="Only credited by SaleEscrow when a derivative sale settles.">
          <div className="kv-grid">
            <KV k="your credit" v={me ? `${formatEther(me.royalty)} ETH` : "—"} />
            <KV k="splitter" v={<Mono value={ctx.cfg.royalty} short />} />
          </div>
          <div className="actions">
            <Btn tone="primary" onClick={withdrawRoyalty} disabled={busy !== null || !me || me.royalty === 0n}>
              withdraw()
            </Btn>
          </div>
          <Notice tone="info">
            <code>credit()</code> is <code>onlyEscrow</code>. Direct parent only, one hop, and the rate is set
            by the child listing.
          </Notice>
        </Card>

        <Card title="Licence tokens" subtitle="ERC-1155: one token id per asset, minted on settlement.">
          <Field label="Asset id">
            <input value={assetId} onChange={(e) => setAssetId(e.target.value)} />
          </Field>
          <div className="actions wrap">
            <Btn tone="ghost" onClick={checkLicence}>
              balanceOf(you, assetId)
            </Btn>
            {licence !== null && <Pill tone={licence > 0n ? "ok" : "neutral"}>{licence.toString()} held</Pill>}
          </div>
        </Card>

        <Card title="Protocol parameters" subtitle="Read from the contracts, not hard-coded in the UI.">
          <div className="kv-grid">
            <KV k="nextAssetId" v={counters ? counters.nextAssetId.toString() : "—"} />
            <KV k="nextSaleId" v={counters ? counters.nextSaleId.toString() : "—"} />
            <KV k="deliver window" v={windows ? `${Number(windows.deliver) / 86400} day(s)` : "—"} />
            <KV k="confirm window" v={windows ? `${Number(windows.confirm) / 86400} day(s)` : "—"} />
            <KV k="respond window" v={windows ? `${Number(windows.respond) / 86400} day(s)` : "—"} />
          </div>
          {!windows && <Empty>Chain offline.</Empty>}
        </Card>

        <Card title="All write paths" subtitle="Everything the contracts expose to demo actors.">
          <ul className="plain-list">
            <li><code>AssetRegistry.list / deactivate</code></li>
            <li><code>SaleEscrow.depositBond / withdrawBondCredit</code></li>
            <li><code>SaleEscrow.buy / deliver / confirm</code></li>
            <li><code>SaleEscrow.disputeMode1 / disputeMode2 / respond</code></li>
            <li><code>SaleEscrow.timeoutDeliver / timeoutConfirm / timeoutRespond</code></li>
            <li><code>RoyaltySplitter.withdraw</code></li>
          </ul>
          <Notice tone="warn">
            <code>setEscrow</code>, <code>setMinter</code> and <code>LicenceToken.mint</code> are deployment
            wiring / escrow-only, so they are not exposed as buttons.
          </Notice>
        </Card>
      </div>
    </div>
  );
}

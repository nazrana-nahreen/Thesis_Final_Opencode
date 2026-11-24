import { useEffect, useState } from "react";
import { ACTORS } from "../lib/actors";
import { formatEther, readBondCredit, readEthBalance } from "../lib/chain";
import type { PanelCtx } from "../lib/panel";

export function ActorBar({ ctx }: { ctx: PanelCtx }) {
  const [eth, setEth] = useState<Record<string, bigint>>({});
  const [bond, setBond] = useState<Record<string, bigint>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const e: Record<string, bigint> = {};
      const b: Record<string, bigint> = {};
      for (const a of ACTORS) {
        try {
          e[a.address] = await readEthBalance(ctx.cfg, a.address);
        } catch {
          /* chain offline */
        }
        try {
          b[a.address] = await readBondCredit(ctx.cfg, a.address);
        } catch {
          /* ignore */
        }
      }
      if (alive) {
        setEth(e);
        setBond(b);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ctx.cfg, ctx.tick]);

  return (
    <div className="actors">
      <div className="actors-label">Sign as</div>
      {ACTORS.slice(0, 4).map((a) => (
        <button
          key={a.address}
          className={ctx.actorIndex === a.index ? "actor active" : "actor"}
          onClick={() => ctx.setActorIndex(a.index)}
          title={`${a.address}\nprivate key: ${a.privateKey}`}
        >
          <span className="actor-role">{a.role}</span>
          <span className="actor-addr">
            {a.address.slice(0, 6)}…{a.address.slice(-4)}
          </span>
          <span className="actor-bal">
            {eth[a.address] !== undefined ? `${Number(formatEther(eth[a.address])).toFixed(2)} ETH` : "—"}
            {bond[a.address] !== undefined && bond[a.address] > 0n && (
              <em> · bond {Number(formatEther(bond[a.address])).toFixed(3)}</em>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

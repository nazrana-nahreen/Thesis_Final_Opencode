import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTORS, DEFAULT_ACTOR_INDEX } from "./lib/actors";
import {
  health as chainHealth,
  loadChainConfig,
  saveChainConfig,
  type ChainConfig,
} from "./lib/chain";
import {
  loadAssets,
  loadTimeline,
  saveAssets,
  saveTimeline,
  type StoredAsset,
  type TimelineEntry,
} from "./lib/store";
import { ipfsPing } from "./lib/ipfs";
import type { LogInput, PanelCtx, TabKey } from "./lib/panel";
import { ActorBar } from "./components/ActorBar";
import { Overview } from "./components/Overview";
import { Studio } from "./components/Studio";
import { Market } from "./components/Market";
import { Sales } from "./components/Sales";
import { DisputeLab } from "./components/DisputeLab";
import { Ledger } from "./components/Ledger";
import { TimelinePanel } from "./components/TimelinePanel";
import { Settings } from "./components/Settings";
import { Pill } from "./components/ui";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "studio", label: "Asset studio" },
  { key: "market", label: "Market" },
  { key: "sales", label: "Sales" },
  { key: "dispute", label: "Dispute lab" },
  { key: "ledger", label: "Ledger" },
  { key: "timeline", label: "Timeline" },
];

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export default function App() {
  const [cfg, setCfg] = useState<ChainConfig>(loadChainConfig);
  const [actorIndex, setActorIndex] = useState(DEFAULT_ACTOR_INDEX);
  const [assets, setAssetsState] = useState<StoredAsset[]>(loadAssets);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(loadTimeline);
  const [tab, setTab] = useState<TabKey>("overview");
  const [tick, setTick] = useState(0);
  const [selectedSale, setSelectedSale] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [status, setStatus] = useState<{ blockNumber: bigint; chainId: number; timestamp: number } | null>(null);
  const [chainErr, setChainErr] = useState<string | null>(null);
  const [ipfsOk, setIpfsOk] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const actor = ACTORS[actorIndex];
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const log = useCallback((e: LogInput) => {
    const entry: TimelineEntry = { id: newId(), ts: Date.now(), ...e };
    setTimeline((prev) => {
      const next = [entry, ...prev].slice(0, 300);
      saveTimeline(next);
      return next;
    });
  }, []);

  const setAssets = useCallback((a: StoredAsset[]) => {
    setAssetsState(a);
    saveAssets(a);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const h = await chainHealth(cfg);
        if (alive) {
          setStatus(h);
          setChainErr(null);
        }
      } catch (e: any) {
        if (alive) {
          setStatus(null);
          setChainErr(e?.shortMessage ?? e?.message ?? String(e));
        }
      }
      try {
        const ok = await ipfsPing();
        if (alive) setIpfsOk(ok);
      } catch {
        if (alive) setIpfsOk(false);
      }
    };
    run();
    const timer = setInterval(run, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [cfg, tick]);

  const ctx: PanelCtx = useMemo(
    () => ({
      cfg,
      actor,
      actorIndex,
      setActorIndex,
      assets,
      setAssets,
      log,
      tick,
      bump,
      tab,
      setTab,
      selectedSale,
      setSelectedSale,
      selectedAsset,
      setSelectedAsset,
    }),
    [cfg, actor, actorIndex, assets, setAssets, log, tick, bump, tab, selectedSale, selectedAsset],
  );

  const last = timeline[0];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">MT<span>R</span></div>
          <div>
            <h1>MetaTrade-R</h1>
            <p>Commit · Recompute · Challenge — interactive settlement lab</p>
          </div>
        </div>

        <div className="status-cluster">
          <Pill tone={status ? "ok" : "bad"}>
            {status ? `block ${status.blockNumber.toString()} · chain ${status.chainId}` : "chain offline"}
          </Pill>
          <Pill tone={ipfsOk ? "ok" : ipfsOk === false ? "bad" : "neutral"}>
            {ipfsOk ? "IPFS online" : ipfsOk === false ? "IPFS offline" : "IPFS ?"}
          </Pill>
          <Pill tone="info">direct-to-contract</Pill>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Connection settings">
            ⚙
          </button>
        </div>
      </header>

      {chainErr && (
        <div className="banner bad">
          Chain unreachable at <code>{cfg.rpcUrl}</code> — start Anvil, then redeploy if the addresses changed.
          <span className="muted"> ({chainErr})</span>
        </div>
      )}

      <ActorBar ctx={ctx} />

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab active" : "tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === "overview" && <Overview ctx={ctx} status={status} ipfsOk={ipfsOk} />}
        {tab === "studio" && <Studio ctx={ctx} />}
        {tab === "market" && <Market ctx={ctx} />}
        {tab === "sales" && <Sales ctx={ctx} />}
        {tab === "dispute" && <DisputeLab ctx={ctx} />}
        {tab === "ledger" && <Ledger ctx={ctx} />}
        {tab === "timeline" && <TimelinePanel ctx={ctx} entries={timeline} />}
      </main>

      <footer className="foot">
        <span>
          Local research prototype · Anvil accounts are public test keys · not for production
        </span>
        {last && (
          <span className={`last-event ${last.kind}`}>
            {last.title}
            {last.gas ? ` · ${Number(last.gas).toLocaleString()} gas` : ""}
          </span>
        )}
      </footer>

      {settingsOpen && (
        <Settings
          cfg={cfg}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            saveChainConfig(next);
            setCfg(next);
            setSettingsOpen(false);
            log({ kind: "system", title: "Connection settings updated", detail: `${next.rpcUrl}` });
          }}
        />
      )}
    </div>
  );
}

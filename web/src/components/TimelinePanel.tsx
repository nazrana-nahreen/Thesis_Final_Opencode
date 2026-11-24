import { useState } from "react";
import type { PanelCtx } from "../lib/panel";
import { clearTimeline, type TimelineEntry, type TimelineKind } from "../lib/store";
import { Btn, Card, Empty, Mono, Pill } from "./ui";

const FILTERS: { key: TimelineKind | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "write", label: "Writes" },
  { key: "ok", label: "Success" },
  { key: "error", label: "Errors" },
  { key: "crypto", label: "Crypto" },
  { key: "read", label: "Reads" },
  { key: "system", label: "System" },
];

function when(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

export function TimelinePanel({ ctx, entries }: { ctx: PanelCtx; entries: TimelineEntry[] }) {
  const [filter, setFilter] = useState<TimelineKind | "all">("all");
  const shown = filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  return (
    <Card
      title="Activity timeline"
      subtitle="Every on-chain write is recorded here with its transaction hash and gas used."
      right={
        <div className="actions">
          <Btn
            tone="ghost"
            onClick={() => {
              clearTimeline();
              ctx.bump();
              location.reload();
            }}
          >
            Clear
          </Btn>
        </div>
      }
    >
      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? "chip active" : "chip"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <Empty>No events recorded yet.</Empty>}

      {shown.length > 0 && (
        <div className="timeline">
          {shown.map((e) => (
            <div key={e.id} className={`tl-row ${e.kind}`}>
              <div className="tl-time">{when(e.ts)}</div>
              <div className="tl-dot" />
              <div className="tl-main">
                <div className="tl-title">
                  {e.title}
                  {e.status && (
                    <Pill tone={e.status === "success" ? "ok" : "bad"}>{e.status}</Pill>
                  )}
                </div>
                {e.detail && <div className="tl-detail">{e.detail}</div>}
                <div className="tl-meta">
                  {e.hash && <Mono value={e.hash} short />}
                  {e.gas && <span className="mono small">{Number(e.gas).toLocaleString()} gas</span>}
                  {e.block && <span className="mono small">block {e.block}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

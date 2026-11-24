import { useState } from "react";
import {
  defaultChainConfig,
  type ChainConfig,
} from "../lib/chain";
import { clearAssets, clearTimeline } from "../lib/store";
import { Btn, Field, Notice } from "./ui";

export function Settings({
  cfg,
  onClose,
  onSave,
}: {
  cfg: ChainConfig;
  onClose: () => void;
  onSave: (next: ChainConfig) => void;
}) {
  const [draft, setDraft] = useState<ChainConfig>(cfg);

  function patch(k: keyof ChainConfig, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Connection settings</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="modal-body">
          <Field label="RPC URL" hint="Anvil default is http://127.0.0.1:8545">
            <input value={draft.rpcUrl} onChange={(e) => patch("rpcUrl", e.target.value)} />
          </Field>
          <Field label="AssetRegistry">
            <input value={draft.registry} onChange={(e) => patch("registry", e.target.value)} />
          </Field>
          <Field label="SaleEscrow">
            <input value={draft.escrow} onChange={(e) => patch("escrow", e.target.value)} />
          </Field>
          <Field label="RoyaltySplitter">
            <input value={draft.royalty} onChange={(e) => patch("royalty", e.target.value)} />
          </Field>
          <Field label="LicenceToken">
            <input value={draft.licence} onChange={(e) => patch("licence", e.target.value)} />
          </Field>

          <Notice tone="info">
            After redeploying, copy the addresses printed by <code>node scripts/deploy.mjs</code> into these
            fields (or update <code>web/src/lib/deployment.json</code> and reload).
          </Notice>

          <div className="actions wrap">
            <Btn tone="ghost" onClick={() => setDraft(defaultChainConfig)}>
              Reset to deployment.json
            </Btn>
            <Btn
              tone="danger"
              onClick={() => {
                clearAssets();
                clearTimeline();
                location.reload();
              }}
            >
              Clear local demo data
            </Btn>
          </div>
        </div>

        <footer className="modal-foot">
          <Btn tone="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn tone="primary" onClick={() => onSave(draft)}>
            Save &amp; reconnect
          </Btn>
        </footer>
      </div>
    </div>
  );
}

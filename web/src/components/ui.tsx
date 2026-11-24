import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          {right && <div className="card-right">{right}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "bad" | "info";
  children: ReactNode;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Btn({
  children,
  onClick,
  disabled,
  tone = "default",
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger" | "ghost";
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button className={`btn ${tone}`} onClick={onClick} disabled={disabled} title={title} type={type}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Mono({ value, short = false, copy = true }: { value: string; short?: boolean; copy?: boolean }) {
  const shown = short && value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
  return (
    <span className="mono" title={value}>
      {shown}
      {copy && (
        <button
          className="copy"
          onClick={() => navigator.clipboard?.writeText(value)}
          title="Copy"
        >
          ⧉
        </button>
      )}
    </span>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "ok"; children: ReactNode }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

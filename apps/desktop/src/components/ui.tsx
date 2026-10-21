import { useEffect, useRef, type ReactNode } from "react";
import { formatBytes } from "../types";

export function Toggle({ on, label, busy, onChange }: { on: boolean; label: string; busy?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

export function ProgressBar({ done, total, label }: { done: number; total?: number | null; label: string }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : undefined;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar" style={{ width: pct != null ? `${pct}%` : "100%" }} data-indeterminate={pct == null || undefined} />
      <span className="ptext">{pct != null ? `${formatBytes(done)} of ${formatBytes(total!)}` : label}</span>
    </div>
  );
}

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener("cancel", onCancel);
    return () => d.removeEventListener("cancel", onCancel);
  }, [onClose]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dlg-title">
      <h2 id="dlg-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">{actions}</div>
    </dialog>
  );
}

export type Toast = { id: number; tone: "ok" | "error" | "info"; text: string; action?: { label: string; run: () => void } };

export function Toasts({ items, dismiss }: { items: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span>{t.text}</span>
          {t.action && <button className="linkish" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button className="x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

/** "saved:Mods/aircraft/A-4E-C" → "Saved Games › Mods › aircraft › A-4E-C" */
export function humanTarget(t: string) {
  const [root, rel] = t.split(":");
  const base = root === "install" ? "DCS folder" : "Saved Games";
  return [base, ...(rel ? rel.split("/") : [])].join(" › ");
}

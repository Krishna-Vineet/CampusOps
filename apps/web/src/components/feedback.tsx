import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { errorMessage } from "../lib/api";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type ToastApi = { ok: (text: string) => void; err: (text: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Global notices so a panel does not have to render its own success banner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: "ok" | "err", text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 8000 : 4500);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({ ok: (text) => push("ok", text), err: (text) => push("err", text) }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <output className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            <button
              type="button"
              className="ghost tiny"
              aria-label="Dismiss"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </output>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

/**
 * Runs an action, reporting failures as a toast instead of leaving the caller to
 * wire up try/catch and an error banner in every panel.
 */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        const message = await fn();
        if (typeof message === "string") toast.ok(message);
        return true;
      } catch (err) {
        toast.err(errorMessage(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

/** Modal confirmation for anything destructive or irreversible. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger = true,
  reasonLabel,
  reasonRequired = false,
  busy = false,
  onCancel: dismiss,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string | undefined;
  confirmLabel?: string | undefined;
  danger?: boolean | undefined;
  reasonLabel?: string | undefined;
  reasonRequired?: boolean | undefined;
  busy?: boolean | undefined;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // A native <dialog> gives a real focus trap, an inert background and Escape
  // handling, which a styled <div> cannot do accessibly.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setReason("");
      if (!el.open) el.showModal();
      confirmRef.current?.focus();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  const blocked = busy || (reasonRequired && reason.trim().length < 3);

  return (
    <dialog
      className="modal"
      ref={dialogRef}
      aria-label={title}
      onCancel={(e) => {
        // Escape must not close a dialog while its request is in flight.
        e.preventDefault();
        if (!busy) dismiss();
      }}
    >
      <h3>{title}</h3>
      {description && <p className="meta">{description}</p>}
      {reasonLabel && (
        <label className="field">
          <span>
            {reasonLabel}
            {reasonRequired ? " *" : ""}
          </span>
          <textarea
            rows={3}
            value={reason}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}
      <div className="row end">
        <button type="button" className="ghost" disabled={busy} onClick={dismiss}>
          Cancel
        </button>
        <button
          type="button"
          ref={confirmRef}
          className={danger ? "danger" : ""}
          disabled={blocked}
          onClick={() => onConfirm(reason.trim())}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="meta">Loading…{label === "Loading…" ? "" : ` ${label}`}</p>;
}

export function Forbidden({ what }: { what: string }) {
  return (
    <p className="warn-note">
      You do not have access to {what}. If you believe you should, ask an administrator to check
      your role assignment.
    </p>
  );
}

/** Offset pagination matching the API's limit/offset contract. */
export function Pager({
  offset,
  limit,
  count,
  total,
  hasMore,
  onChange,
}: {
  offset: number;
  limit: number;
  count: number;
  total?: number | undefined;
  hasMore?: boolean | undefined;
  onChange: (offset: number) => void;
}) {
  const more = hasMore ?? (total !== undefined ? offset + count < total : count === limit);
  if (offset === 0 && !more) return null;
  return (
    <div className="row pager">
      <button
        type="button"
        className="ghost tiny"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Previous
      </button>
      <span className="meta">
        {count === 0 ? "0" : `${offset + 1}–${offset + count}`}
        {total !== undefined ? ` of ${total}` : ""}
      </span>
      <button
        type="button"
        className="ghost tiny"
        disabled={!more}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </button>
    </div>
  );
}

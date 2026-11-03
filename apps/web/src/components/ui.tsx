import {
  APPROVAL_TIER_LABELS,
  type ApprovalStatus,
  type EventStatus,
  type ReservationStatus,
} from "@campusops/shared/ui";
import { type ReactElement, type ReactNode, cloneElement, isValidElement, useId } from "react";

export function Card({
  title,
  actions,
  children,
}: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const EVENT_TONE: Record<EventStatus, string> = {
  DRAFT: "muted",
  PENDING_APPROVALS: "warn",
  READY: "info",
  PUBLISHED: "good",
  LIVE: "good",
  COMPLETED: "muted",
  CANCELLED: "bad",
};

const APPROVAL_TONE: Record<ApprovalStatus, string> = {
  PENDING: "warn",
  APPROVED: "good",
  REJECTED: "bad",
  CHANGES_REQUESTED: "warn",
  CANCELLED: "muted",
};

const RESERVATION_TONE: Record<ReservationStatus, string> = {
  HELD: "warn",
  CONFIRMED: "good",
  RELEASED: "muted",
  EXPIRED: "bad",
};

export function EventBadge({ status }: { status: EventStatus }) {
  return <span className={`badge ${EVENT_TONE[status]}`}>{status.replace(/_/g, " ")}</span>;
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return <span className={`badge ${APPROVAL_TONE[status]}`}>{status.replace(/_/g, " ")}</span>;
}

export function ReservationBadge({ status }: { status: ReservationStatus }) {
  return <span className={`badge ${RESERVATION_TONE[status]}`}>{status}</span>;
}

/**
 * Wraps a single control. The label is explicitly associated with it via a
 * generated id so screen readers announce the field name.
 */
export function Field({
  label,
  children,
  hint,
}: { label: string; children: ReactNode; hint?: string | undefined }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
      {hint ? <small className="hint">{hint}</small> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <p className="note bad-note">{message}</p> : null;
}

export function SuccessNote({ message }: { message: string | null }) {
  return message ? <p className="note good-note">{message}</p> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** datetime-local inputs need a local ISO string without the zone suffix. */
export function toLocalInput(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

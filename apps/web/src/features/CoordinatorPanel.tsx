import {
  EVENT_AUDIENCE_LABELS,
  EVENT_STATUSES,
  EVENT_TEMPLATES,
  EVENT_TEMPLATE_LABELS,
  type EventAudience,
} from "@campusops/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormDialog, Pager, useToast } from "../components/feedback";
import { Icon } from "../components/icons";
import {
  Card,
  Empty,
  ErrorNote,
  EventBadge,
  Field,
  SkeletonRows,
  SuccessNote,
  formatWhen,
  fromLocalInput,
  toLocalInput,
} from "../components/ui";
import { type Page, api, downloadBlob, errorMessage, query } from "../lib/api";
import { PAGE_SIZE } from "../lib/constants";
import { useSession } from "../lib/session";
import type { Approver, AvailabilityItem, ClubRow, EventBundle, EventRow } from "../lib/types";
import { EventApprovals } from "./EventApprovals";
import { EventWorkspace, type EventWorkspaceTab } from "./EventWorkspace";

type DraftForm = {
  clubId: string;
  title: string;
  description: string;
  template: string;
  audience: string;
  admissionMode: string;
  capacity: number;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  venueSummary: string;
};

function defaultForm(clubId: string): DraftForm {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(13);
  const opens = new Date();
  opens.setHours(0, 0, 0, 0);
  return {
    clubId,
    title: "",
    description: "",
    template: "WORKSHOP",
    audience: "COLLEGE_ONLY",
    admissionMode: "FCFS",
    capacity: 60,
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    registrationOpensAt: toLocalInput(opens),
    registrationClosesAt: toLocalInput(start),
    venueSummary: "",
  };
}

function eventDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase();
}

/**
 * The events home. A searchable rail of events on the left, one event cockpit on
 * the right: the next action, the approval story, and every operational tool,
 * grouped so nothing important is buried in a wall of tabs.
 */
export function CoordinatorPanel({
  focusEventId,
  onFocusConsumed,
  newDraftSignal,
}: { focusEventId?: string | null; onFocusConsumed?: () => void; newDraftSignal?: number } = {}) {
  const { isCoordinator, isAdmin, isSenior } = useSession();
  const oversight = isAdmin || isSenior;
  const canCreate = isCoordinator || isAdmin;
  const toast = useToast();
  const draftSignal = newDraftSignal ?? 0;
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<EventBundle | null>(null);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [units, setUnits] = useState<AvailabilityItem[]>([]);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eventOffset, setEventOffset] = useState(0);
  const [eventsMore, setEventsMore] = useState(false);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const selectedId = useRef<string | null>(null);

  const loadEvents = useCallback(
    async (offset = 0) => {
      try {
        const page = await api<Page<EventRow>>(
          `/me/events${query({ limit: PAGE_SIZE, offset, status: statusFilter, q: search })}`,
        );
        setEvents(page.items);
        setEventOffset(offset);
        setEventsMore(page.hasMore ?? false);
        setEventsTotal(page.total ?? page.items.length);
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, search],
  );

  const openEvent = useCallback(async (id: string) => {
    setError(null);
    try {
      const bundle = await api<EventBundle>(`/events/${id}/approval-bundle`);
      setSelected(bundle);
      selectedId.current = id;
      if (!["COMPLETED", "CANCELLED"].includes(bundle.event.status)) {
        const availability = await api<{ items: AvailabilityItem[] }>(
          `/resources/availability${query({
            startsAt: bundle.event.startsAt,
            endsAt: bundle.event.endsAt,
            limit: 100,
          })}`,
        );
        setUnits(availability.items);
      } else {
        setUnits([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const refreshSelected = useCallback(async () => {
    if (selectedId.current) await openEvent(selectedId.current);
    await loadEvents(eventOffset);
  }, [eventOffset, loadEvents, openEvent]);

  useEffect(() => {
    (async () => {
      try {
        const [mine, faculty] = await Promise.all([
          api<{ items: Array<{ club: ClubRow }> }>("/me/clubs"),
          api<{ items: Approver[] }>("/approvals/approvers?tier=FACULTY"),
        ]);
        setClubs(mine.items.map((m) => m.club));
        setApprovers(faculty.items);
      } catch (err) {
        setError(errorMessage(err));
        setLoading(false);
      }
    })();
  }, []);

  // Search and status are part of the query, so reload on change (debounced).
  useEffect(() => {
    const timer = setTimeout(() => void loadEvents(0), 250);
    return () => clearTimeout(timer);
  }, [loadEvents]);

  // Deep links from the dashboard / global search open a specific event once.
  useEffect(() => {
    if (focusEventId) {
      void openEvent(focusEventId);
      onFocusConsumed?.();
    }
  }, [focusEventId, openEvent, onFocusConsumed]);

  const lastSignal = useRef(0);
  useEffect(() => {
    if (draftSignal !== lastSignal.current && clubs.length) {
      lastSignal.current = draftSignal;
      setForm(defaultForm(clubs[0]?.id ?? ""));
    }
  }, [draftSignal, clubs]);

  async function createDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<EventRow>("/events", {
        clubId: form.clubId,
        title: form.title,
        description: form.description,
        template: form.template,
        audience: form.audience,
        admissionMode: form.admissionMode,
        capacity: Number(form.capacity),
        startsAt: fromLocalInput(form.startsAt),
        endsAt: fromLocalInput(form.endsAt),
        registrationOpensAt: fromLocalInput(form.registrationOpensAt),
        registrationClosesAt: fromLocalInput(form.registrationClosesAt),
        venueSummary: form.venueSummary || null,
      });
      setForm(null);
      setNotice("Draft created. Add the permissions it needs, then submit.");
      await loadEvents(eventOffset);
      await openEvent(created.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, body: Record<string, unknown>, message: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/events/${selected.event.id}/${path}`, body);
      setNotice(message);
      await refreshSelected();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const summary = selected?.summary;
  const changes = summary?.changesRequested ?? 0;
  const next =
    selected === null
      ? null
      : selected.event.status === "DRAFT"
        ? selected.bundle
          ? {
              tone: "info" as const,
              title: "This draft still has an approval bundle",
              body: "Review the requests below, or revise the event before submitting it again.",
              action: "Open approvals",
              tab: "approvals" as EventWorkspaceTab,
            }
          : {
              tone: "warn" as const,
              title: "Next: ask for the permissions this event needs",
              body: "Add each permission separately, choose who reviews it, then submit the bundle.",
              action: "Set up approvals",
              tab: "approvals" as EventWorkspaceTab,
            }
        : selected.event.status === "PENDING_APPROVALS" && changes > 0
          ? {
              tone: "warn" as const,
              title: `${changes} reviewer${changes === 1 ? "" : "s"} asked for changes`,
              body: "You do not need to cancel. Read the note, fix the request, and resubmit it.",
              action: "Review changes",
              tab: "approvals" as EventWorkspaceTab,
            }
          : selected.event.status === "PENDING_APPROVALS"
            ? {
                tone: "info" as const,
                title: `${summary?.pending ?? 0} approval${
                  summary?.pending === 1 ? "" : "s"
                } still pending`,
                body: `${summary?.requiredApproved ?? 0} of ${
                  summary?.required ?? 0
                } required permissions approved. You can follow each reviewer here.`,
                action: "Track approvals",
                tab: "approvals" as EventWorkspaceTab,
              }
            : selected.event.status === "READY"
              ? {
                  tone: "ok" as const,
                  title: "Every required approval is in — publish when ready",
                  body: "Publishing opens registration and makes the event visible to its audience.",
                  action: "Publish now",
                  run: () =>
                    act(
                      "publish",
                      { expectedRevision: selected.event.currentRevision },
                      "Event published.",
                    ),
                }
              : selected.event.status === "PUBLISHED"
                ? {
                    tone: "info" as const,
                    title: "Published. Run the event when doors open",
                    body: "Start the event to switch on check-in, then use the access QRs at the desk.",
                    action: "Open day-of controls",
                    tab: "run" as EventWorkspaceTab,
                  }
                : selected.event.status === "LIVE"
                  ? {
                      tone: "ok" as const,
                      title: "The event is live",
                      body: "Scan passes, post announcements, and mark the event complete when it ends.",
                      action: "Open day-of controls",
                      tab: "run" as EventWorkspaceTab,
                    }
                  : selected.event.status === "COMPLETED"
                    ? {
                        tone: "info" as const,
                        title: "Event completed",
                        body: "Reports, attendance and the full audit trail stay available here.",
                        action: "Open history",
                        tab: "history" as EventWorkspaceTab,
                      }
                    : {
                        tone: "warn" as const,
                        title: "Event cancelled",
                        body:
                          selected.event.cancellationReason ??
                          "Resource holds were released when the event was cancelled.",
                        action: "Open history",
                        tab: "history" as EventWorkspaceTab,
                      };

  const overviewNode = (go: (tab: EventWorkspaceTab) => void) => {
    if (!selected || !next) return null;
    const ev = selected.event;
    return (
      <div className="overview">
        <section className={`next-action ${next.tone}`}>
          <div>
            <span className="eyebrow">Next step</span>
            <h3>{next.title}</h3>
            <p>{next.body}</p>
          </div>
          <button
            type="button"
            className="next-action-button"
            disabled={busy}
            onClick={() => {
              if ("run" in next) void next.run();
              else go(next.tab);
            }}
          >
            {next.action}
          </button>
        </section>

        <div className="fact-grid">
          <div className="fact">
            <span>When</span>
            <strong>{formatWhen(ev.startsAt)}</strong>
            <small>to {formatWhen(ev.endsAt)}</small>
          </div>
          <div className="fact">
            <span>Where</span>
            <strong>{ev.venueSummary || "Not set yet"}</strong>
            <small>
              {ev.audience === "COLLEGE_ONLY" ? "College only" : EVENT_AUDIENCE_LABELS[ev.audience]}
            </small>
          </div>
          <div className="fact">
            <span>Audience</span>
            <strong>{EVENT_AUDIENCE_LABELS[ev.audience]}</strong>
            <small>{ev.capacity} seats</small>
          </div>
          <div className="fact">
            <span>Approvals</span>
            <strong>
              {selected.bundle
                ? `${summary?.requiredApproved ?? 0}/${summary?.required ?? 0} required`
                : "Not submitted"}
            </strong>
            <small>
              {changes > 0
                ? `${changes} change request${changes === 1 ? "" : "s"}`
                : `${summary?.pending ?? 0} pending`}
            </small>
          </div>
          <div className="fact">
            <span>Revision</span>
            <strong>v{ev.currentRevision}</strong>
            <small>{statusLabel(ev.status)}</small>
          </div>
          <div className="fact">
            <span>Registration</span>
            <strong>{formatWhen(ev.registrationOpensAt)}</strong>
            <small>closes {formatWhen(ev.registrationClosesAt)}</small>
          </div>
        </div>

        {changes > 0 && (
          <section className="change-banner compact">
            <div>
              <strong>Reviewer feedback is waiting</strong>
              <p>
                Open approvals to read the note. For a resource request you can change the room or
                time and send it straight back; for anything else, revise the event.
              </p>
            </div>
            <button type="button" className="ghost" onClick={() => go("approvals")}>
              Review
            </button>
          </section>
        )}

        <section className="quick-actions">
          <h3>Jump to</h3>
          <div className="quick-grid">
            {(
              [
                ["approvals", "Approvals", "Bundle, decisions, publish"],
                ["edit", "Edit details", "Time, venue, eligibility"],
                ["roster", "Participants", "Registrations and check-in"],
                ["run", "Day of event", "Start, complete, announcements"],
                ["access", "Access QRs", "Gate and desk passes"],
                ["history", "History & audit", "Revisions and record"],
              ] as Array<[EventWorkspaceTab, string, string]>
            ).map(([tab, label, hint]) => (
              <button type="button" key={tab} className="quick" onClick={() => go(tab)}>
                <strong>{label}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </div>
        </section>

        {selected.bundle && (
          <section className="overview-requests">
            <h3>Approval story</h3>
            <ul className="plain">
              {selected.requests.map(({ request, assignee }) => (
                <li key={request.id}>
                  <span className={`dot status-${request.status.toLowerCase()}`} />
                  <strong>{request.title}</strong>
                  <span className="hint">
                    {request.status.replace(/_/g, " ").toLowerCase()} ·{" "}
                    {assignee?.fullName ?? "role queue"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  };

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <div className="events-shell">
        <header className="events-head">
          <div>
            <span className="eyebrow">{oversight ? "Institution-wide" : "Your clubs"}</span>
            <p className="meta">
              {oversight
                ? isAdmin
                  ? "Every club's events across the institution."
                  : "Every club's events in the departments you head."
                : isCoordinator
                  ? "Every draft, submission and published event across the clubs you lead."
                  : "Read-only view of the clubs you are faculty for."}
            </p>
          </div>
          <div className="events-head-actions">
            <label className="search">
              <Icon name="search" size={14} />
              <input
                type="search"
                placeholder="Search events…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={clubs.length === 0 || !canCreate}
              title={canCreate ? undefined : "Only club coordinators and admins can create events."}
              onClick={() => setForm(defaultForm(clubs[0]?.id ?? ""))}
            >
              <Icon name="plus" size={14} /> New event
            </button>
          </div>
        </header>

        <div className="status-pills" role="tablist" aria-label="Filter by status">
          <button
            type="button"
            className={statusFilter === "" ? "pill active" : "pill"}
            onClick={() => setStatusFilter("")}
          >
            All
          </button>
          {EVENT_STATUSES.map((status) => (
            <button
              type="button"
              key={status}
              className={statusFilter === status ? "pill active" : "pill"}
              onClick={() => setStatusFilter(status)}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>

        <div className={selected ? "events-layout has-selection" : "events-layout"}>
          <aside className="events-rail" aria-label="Event list">
            <div className="rail-meta">
              {eventsTotal} event{eventsTotal === 1 ? "" : "s"}
              {statusFilter ? ` · ${statusLabel(statusFilter)}` : ""}
            </div>
            {loading ? (
              <SkeletonRows rows={5} />
            ) : events.length === 0 ? (
              <Empty
                title={search || statusFilter ? "Nothing matches" : "No events yet"}
                icon="calendar"
                action={
                  canCreate && !search && !statusFilter ? (
                    <button
                      type="button"
                      className="ghost tiny"
                      onClick={() => setForm(defaultForm(clubs[0]?.id ?? ""))}
                    >
                      Start a draft
                    </button>
                  ) : undefined
                }
              >
                {search || statusFilter
                  ? "Try a shorter search or clear the status filter."
                  : clubs.length === 0
                    ? "You are not an active coordinator of any club yet."
                    : "Create a draft, add its permissions, and the approval flow begins here."}
              </Empty>
            ) : (
              <div className="event-cards">
                {events.map((ev) => (
                  <button
                    type="button"
                    key={ev.id}
                    className={selected?.event.id === ev.id ? "event-card selected" : "event-card"}
                    onClick={() => void openEvent(ev.id)}
                  >
                    <span className={`event-date status-${ev.status.toLowerCase()}`}>
                      {eventDay(ev.startsAt)}
                    </span>
                    <span className="event-card-body">
                      <strong>{ev.title}</strong>
                      <small>{formatWhen(ev.startsAt)}</small>
                      <span className="event-card-foot">
                        <EventBadge status={ev.status} />
                        <span className="hint">rev {ev.currentRevision}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <Pager
              offset={eventOffset}
              limit={PAGE_SIZE}
              count={events.length}
              total={eventsTotal}
              hasMore={eventsMore}
              onChange={(offset) => void loadEvents(offset)}
            />
          </aside>

          <section className="events-stage" aria-label="Selected event">
            {selected && next ? (
              <>
                <header className="event-hero">
                  <div className="event-hero-main">
                    <div className="row wrap hero-badges">
                      <EventBadge status={selected.event.status} />
                      <span className="badge muted">rev {selected.event.currentRevision}</span>
                      <span className="badge muted">{selected.event.capacity} seats</span>
                    </div>
                    <h2>{selected.event.title}</h2>
                    <p className="meta">
                      {selected.club.name} · {formatWhen(selected.event.startsAt)} –{" "}
                      {formatWhen(selected.event.endsAt)}
                      {selected.event.venueSummary ? ` · ${selected.event.venueSummary}` : ""}
                    </p>
                  </div>
                  <div className="event-hero-actions">
                    <button
                      type="button"
                      className="ghost tiny"
                      onClick={() =>
                        void downloadBlob(
                          `/events/${selected.event.id}/calendar.ics`,
                          `${selected.event.slug}.ics`,
                        ).catch((err) => toast.err(errorMessage(err)))
                      }
                    >
                      <Icon name="calendar" size={14} /> Calendar
                    </button>
                  </div>
                </header>

                <EventWorkspace
                  key={selected.event.id}
                  event={selected.event}
                  onChanged={refreshSelected}
                  initialTab={
                    changes > 0 || selected.event.status === "DRAFT" ? "approvals" : "overview"
                  }
                  overview={overviewNode}
                  approvals={(go) => (
                    <EventApprovals
                      bundle={selected}
                      approvers={approvers}
                      units={units}
                      onRefresh={async () => {
                        await refreshSelected();
                        go("overview");
                      }}
                    />
                  )}
                />
              </>
            ) : (
              <Card title="Pick an event">
                <Empty title="Nothing selected yet" icon="calendar">
                  Choose an event from the list to see its next step, approvals and day-of tools in
                  one place.
                </Empty>
              </Card>
            )}
          </section>
        </div>
      </div>

      <FormDialog
        open={form !== null}
        title="New event draft"
        description="Start with the shape of the event. Permissions and resources come next."
        submitLabel="Create draft"
        size="wide"
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={createDraft}
      >
        <Field label="Club">
          <select
            value={form?.clubId ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, clubId: e.target.value } : f))}
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input
            required
            minLength={3}
            value={form?.title ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, title: e.target.value } : f))}
          />
        </Field>
        <Field label="Template">
          <select
            value={form?.template ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, template: e.target.value } : f))}
          >
            {EVENT_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TEMPLATE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Audience">
          <select
            value={form?.audience ?? ""}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, audience: e.target.value as EventAudience } : f))
            }
          >
            <option value="COLLEGE_ONLY">College only</option>
            <option value="OUTSIDERS_ALLOWED">Outsiders allowed</option>
            <option value="INVITED_ONLY">Invited only</option>
          </select>
        </Field>
        <Field label="Admission">
          <select
            value={form?.admissionMode ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, admissionMode: e.target.value } : f))}
          >
            <option value="FCFS">First come, first served</option>
            <option value="MANUAL">Manual selection</option>
          </select>
        </Field>
        <Field label="Capacity">
          <input
            type="number"
            min={1}
            value={form?.capacity ?? 0}
            onChange={(e) => setForm((f) => (f ? { ...f, capacity: Number(e.target.value) } : f))}
          />
        </Field>
        <Field label="Starts">
          <input
            type="datetime-local"
            required
            value={form?.startsAt ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, startsAt: e.target.value } : f))}
          />
        </Field>
        <Field label="Ends">
          <input
            type="datetime-local"
            required
            value={form?.endsAt ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, endsAt: e.target.value } : f))}
          />
        </Field>
        <Field label="Registration opens">
          <input
            type="datetime-local"
            required
            value={form?.registrationOpensAt ?? ""}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, registrationOpensAt: e.target.value } : f))
            }
          />
        </Field>
        <Field label="Registration closes" hint="Must be at or before the event start.">
          <input
            type="datetime-local"
            required
            value={form?.registrationClosesAt ?? ""}
            onChange={(e) =>
              setForm((f) => (f ? { ...f, registrationClosesAt: e.target.value } : f))
            }
          />
        </Field>
        <Field label="Venue summary">
          <input
            value={form?.venueSummary ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, venueSummary: e.target.value } : f))}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            value={form?.description ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
          />
        </Field>
      </FormDialog>
    </>
  );
}

import {
  APPROVAL_TIER_LABELS,
  APPROVAL_TYPE_LABELS,
  EVENT_STATUSES,
  EVENT_TEMPLATES,
  EVENT_TEMPLATE_LABELS,
} from "@campusops/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pager } from "../components/feedback";
import {
  ApprovalBadge,
  Card,
  Empty,
  ErrorNote,
  EventBadge,
  Field,
  ReservationBadge,
  SuccessNote,
  formatWhen,
  fromLocalInput,
  toLocalInput,
} from "../components/ui";
import { type Page, api, errorMessage, query } from "../lib/api";
import { PAGE_SIZE } from "../lib/constants";
import { useSession } from "../lib/session";
import type {
  ApprovalRequestRow,
  Approver,
  AvailabilityItem,
  ClubRow,
  EventBundle,
  EventRow,
} from "../lib/types";
import { EventWorkspace } from "./EventWorkspace";

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

type RequestDraft = {
  key: string;
  type: "ORGANIZE" | "INVITE_OUTSIDERS" | "RESOURCE_USE" | "CUSTOM";
  title: string;
  isRequired: boolean;
  assignedApproverId: string;
  resourceUnitId: string;
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

export function CoordinatorPanel({
  focusEventId,
  onFocusConsumed,
  newDraftSignal,
}: { focusEventId?: string | null; onFocusConsumed?: () => void; newDraftSignal?: number } = {}) {
  const { isCoordinator } = useSession();
  const draftSignal = newDraftSignal ?? 0;
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<EventBundle | null>(null);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [units, setUnits] = useState<AvailabilityItem[]>([]);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [requests, setRequests] = useState<RequestDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eventOffset, setEventOffset] = useState(0);
  const [eventsMore, setEventsMore] = useState(false);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const loadEvents = useCallback(
    async (offset = 0) => {
      const page = await api<Page<EventRow>>(
        `/me/events${query({ limit: PAGE_SIZE, offset, status: statusFilter, q: search })}`,
      );
      setEvents(page.items);
      setEventOffset(offset);
      setEventsMore(page.hasMore ?? false);
      setEventsTotal(page.total ?? page.items.length);
    },
    [statusFilter, search],
  );

  useEffect(() => {
    (async () => {
      try {
        const mine = await api<{ items: Array<{ club: ClubRow }> }>("/me/clubs");
        setClubs(mine.items.map((m) => m.club));
        await loadEvents(0);
        const faculty = await api<{ items: Approver[] }>("/approvals/approvers?tier=FACULTY");
        setApprovers(faculty.items);
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, [loadEvents]);

  const openEvent = useCallback(async (id: string) => {
    setError(null);
    setNotice(null);
    try {
      const bundle = await api<EventBundle>(`/events/${id}/approval-bundle`);
      setSelected(bundle);
      setRequests([]);
      if (bundle.event.status === "DRAFT") {
        const w = query({
          startsAt: bundle.event.startsAt,
          endsAt: bundle.event.endsAt,
          limit: 100,
        });
        const availability = await api<{ items: AvailabilityItem[] }>(
          `/resources/availability${w}`,
        );
        setUnits(availability.items);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  // Deep links from the dashboard / global search open a specific event once.
  useEffect(() => {
    if (focusEventId) {
      void openEvent(focusEventId);
      onFocusConsumed?.();
    }
  }, [focusEventId, openEvent, onFocusConsumed]);
  const lastSignal = useRef(0);
  useEffect(() => {
    // Wait until clubs are loaded before consuming the "new draft" signal.
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
      setNotice("Draft created. Add the individual approvals it needs, then submit.");
      await loadEvents(eventOffset);
      await openEvent(created.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function addRequestDraft(type: RequestDraft["type"]) {
    setRequests((prev) => [
      ...prev,
      {
        key: `${type}-${Date.now()}-${prev.length}`,
        type,
        title:
          type === "ORGANIZE"
            ? "Permission to organize"
            : type === "INVITE_OUTSIDERS"
              ? "Permission to invite outsiders"
              : type === "RESOURCE_USE"
                ? "Resource use"
                : "Additional permission",
        isRequired: type !== "CUSTOM",
        assignedApproverId: approvers[0]?.id ?? "",
        resourceUnitId: "",
      },
    ]);
  }

  async function submitForApproval() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/events/${selected.event.id}/submit`, {
        expectedRevision: selected.event.currentRevision,
        requests: requests.map((r) => ({
          type: r.type,
          title: r.title,
          isRequired: r.isRequired,
          assignedApproverId: r.assignedApproverId || null,
          resources:
            r.type === "RESOURCE_USE" && r.resourceUnitId
              ? [
                  {
                    resourceUnitId: r.resourceUnitId,
                    startsAt: selected.event.startsAt,
                    endsAt: selected.event.endsAt,
                  },
                ]
              : [],
        })),
      });
      setNotice("Submitted. Each permission is now decided separately.");
      await loadEvents(eventOffset);
      await openEvent(selected.event.id);
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
      await loadEvents(eventOffset);
      await openEvent(selected.event.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent() {
    const reason = window.prompt("Why is this event being cancelled?");
    if (!reason || reason.trim().length < 5) return;
    await act("cancel", { reason }, "Event cancelled and resources released.");
  }

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      <Card
        title={isCoordinator ? "My club events" : "Club events (read-only)"}
        actions={
          <button
            type="button"
            disabled={clubs.length === 0 || !isCoordinator}
            title={
              isCoordinator
                ? undefined
                : "Club faculty have read-only access; coordinators create events"
            }
            onClick={() => setForm(defaultForm(clubs[0]?.id ?? ""))}
          >
            New draft
          </button>
        }
      >
        <div className="toolbar">
          <Field label="Status">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Any status</option>
              {EVENT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search">
            <input
              type="search"
              placeholder="Title contains…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <span className="meta">
            {eventsTotal} event{eventsTotal === 1 ? "" : "s"}
          </span>
        </div>
        {clubs.length === 0 ? (
          <Empty>You are not an active coordinator of any club yet.</Empty>
        ) : events.length === 0 ? (
          <Empty>No events yet. Create a draft to start the approval flow.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>When</th>
                  <th>Status</th>
                  <th>Rev</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{event.title}</td>
                    <td>{formatWhen(event.startsAt)}</td>
                    <td>
                      <EventBadge status={event.status} />
                    </td>
                    <td>{event.currentRevision}</td>
                    <td>
                      <button type="button" onClick={() => openEvent(event.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          offset={eventOffset}
          limit={PAGE_SIZE}
          count={events.length}
          total={eventsTotal}
          hasMore={eventsMore}
          onChange={(o) => void loadEvents(o)}
        />
      </Card>

      {form && (
        <Card title="New event draft">
          <form className="form wide" onSubmit={createDraft}>
            <Field label="Club">
              <select
                value={form.clubId}
                onChange={(e) => setForm({ ...form, clubId: e.target.value })}
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
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Template">
              <select
                value={form.template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
              >
                {EVENT_TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Audience">
              <select
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
              >
                <option value="COLLEGE_ONLY">College only</option>
                <option value="OUTSIDERS_ALLOWED">Outsiders allowed</option>
                <option value="INVITED_ONLY">Invited only</option>
              </select>
            </Field>
            <Field label="Admission">
              <select
                value={form.admissionMode}
                onChange={(e) => setForm({ ...form, admissionMode: e.target.value })}
              >
                <option value="FCFS">First come, first served</option>
                <option value="MANUAL">Manual selection</option>
              </select>
            </Field>
            <Field label="Capacity">
              <input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              />
            </Field>
            <Field label="Starts">
              <input
                type="datetime-local"
                required
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </Field>
            <Field label="Ends">
              <input
                type="datetime-local"
                required
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </Field>
            <Field label="Registration opens">
              <input
                type="datetime-local"
                required
                value={form.registrationOpensAt}
                onChange={(e) => setForm({ ...form, registrationOpensAt: e.target.value })}
              />
            </Field>
            <Field label="Registration closes" hint="Must be at or before the event start.">
              <input
                type="datetime-local"
                required
                value={form.registrationClosesAt}
                onChange={(e) => setForm({ ...form, registrationClosesAt: e.target.value })}
              />
            </Field>
            <Field label="Venue summary">
              <input
                value={form.venueSummary}
                onChange={(e) => setForm({ ...form, venueSummary: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <div className="row">
              <button type="submit" disabled={busy}>
                Create draft
              </button>
              <button type="button" className="ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {selected && (
        <Card title={selected.event.title} actions={<EventBadge status={selected.event.status} />}>
          <p className="meta">
            {selected.club.name} · {formatWhen(selected.event.startsAt)} –{" "}
            {formatWhen(selected.event.endsAt)} · revision {selected.event.currentRevision} ·
            capacity {selected.event.capacity}
          </p>

          {selected.bundle ? (
            <>
              <p className="meta">
                Required approvals: {selected.summary.requiredApproved}/{selected.summary.required}{" "}
                · pending {selected.summary.pending}
                {selected.summary.readyToPublish ? " · ready to publish" : ""}
              </p>
              <div className="requests">
                {selected.requests.map(({ request, assignee, resources }) => (
                  <article key={request.id} className="request">
                    <header>
                      <strong>{request.title}</strong>
                      <ApprovalBadge status={request.status} />
                    </header>
                    <p className="meta">
                      {APPROVAL_TYPE_LABELS[request.type]} ·{" "}
                      {request.isRequired ? "required" : "optional"} · awaiting{" "}
                      {APPROVAL_TIER_LABELS[request.currentTier]} · approver{" "}
                      {assignee?.fullName ?? "role queue"} · v{request.version}
                    </p>
                    {resources.length > 0 && (
                      <ul className="plain">
                        {resources.map((r) => (
                          <li key={r.unit.id}>
                            {r.unit.label}: {formatWhen(r.link.startsAt)} –{" "}
                            {formatWhen(r.link.endsAt)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
              <div className="row">
                <button
                  type="button"
                  disabled={busy || !selected.summary.readyToPublish}
                  onClick={() =>
                    act(
                      "publish",
                      { expectedRevision: selected.event.currentRevision },
                      "Event published.",
                    )
                  }
                >
                  Publish
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    act(
                      "revisions",
                      {
                        expectedRevision: selected.event.currentRevision,
                        note: "Coordinator requested changes.",
                      },
                      "New draft revision created. Re-approval is required.",
                    )
                  }
                >
                  New revision
                </button>
                <button type="button" className="danger" disabled={busy} onClick={cancelEvent}>
                  Cancel event
                </button>
              </div>
              {!selected.summary.readyToPublish && (
                <p className="hint">
                  Publishing unlocks only when every required permission is approved.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="meta">
                This draft has not been submitted. Add each permission separately.
              </p>
              <div className="row">
                <button type="button" onClick={() => addRequestDraft("ORGANIZE")}>
                  + Organize
                </button>
                <button type="button" onClick={() => addRequestDraft("INVITE_OUTSIDERS")}>
                  + Outsiders
                </button>
                <button type="button" onClick={() => addRequestDraft("RESOURCE_USE")}>
                  + Resource
                </button>
                <button type="button" onClick={() => addRequestDraft("CUSTOM")}>
                  + Custom
                </button>
              </div>
              {requests.map((r, index) => (
                <div key={r.key} className="request">
                  <div className="form wide">
                    <Field label="Permission">
                      <input
                        value={r.title}
                        onChange={(e) =>
                          setRequests(
                            requests.map((x, i) =>
                              i === index ? { ...x, title: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Ask faculty">
                      <select
                        value={r.assignedApproverId}
                        onChange={(e) =>
                          setRequests(
                            requests.map((x, i) =>
                              i === index ? { ...x, assignedApproverId: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="">Select faculty…</option>
                        {approvers.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.fullName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {r.type === "RESOURCE_USE" && (
                      <Field
                        label="Resource unit"
                        hint="Only units free for the whole event window are listed."
                      >
                        <select
                          value={r.resourceUnitId}
                          onChange={(e) =>
                            setRequests(
                              requests.map((x, i) =>
                                i === index ? { ...x, resourceUnitId: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          <option value="">Select unit…</option>
                          {units
                            .filter((u) => u.available)
                            .map((u) => (
                              <option key={u.resourceUnitId} value={u.resourceUnitId}>
                                {u.resourceName} — {u.unitLabel}
                              </option>
                            ))}
                        </select>
                      </Field>
                    )}
                    <Field label="Required">
                      <input
                        type="checkbox"
                        checked={r.isRequired}
                        onChange={(e) =>
                          setRequests(
                            requests.map((x, i) =>
                              i === index ? { ...x, isRequired: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setRequests(requests.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={busy || requests.length === 0}
                onClick={submitForApproval}
              >
                Submit for approval
              </button>
            </>
          )}
        </Card>
      )}

      {selected && (
        <EventWorkspace
          key={selected.event.id}
          event={selected.event}
          onChanged={async () => {
            await openEvent(selected.event.id);
          }}
        />
      )}
    </>
  );
}

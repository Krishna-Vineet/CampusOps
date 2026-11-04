import { RESOURCE_STATUS_LABELS, type ResourceStatus } from "@campusops/shared/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ConfirmDialog,
  FormDialog,
  Modal,
  Pager,
  useAction,
  useToast,
} from "../components/feedback";
import {
  Card,
  Empty,
  Field,
  ReservationBadge,
  formatWhen,
  fromLocalInput,
  toLocalInput,
} from "../components/ui";
import { type Page, api, errorMessage, query } from "../lib/api";
import { PAGE_SIZE } from "../lib/constants";
import { useSession } from "../lib/session";
import type { AvailabilityItem } from "../lib/types";

type Unit = {
  id: string;
  label: string;
  status: ResourceStatus;
  notes: string | null;
};
type ResourceRow = {
  id: string;
  name: string;
  status: ResourceStatus;
  capacity: number | null;
  departmentId: string | null;
  description: string | null;
  units: Unit[];
  canManage: boolean;
};
type Booking = {
  reservationId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  eventId: string | null;
  title: string;
};
type CalendarRow = {
  resourceUnitId: string;
  unitLabel: string;
  resourceName: string;
  bookings: Booking[];
};
type Department = { id: string; name: string };

type Sub = "calendar" | "catalogue";

function defaultWindow(daysAhead: number) {
  const a = new Date();
  a.setDate(a.getDate() + daysAhead);
  a.setHours(10, 0, 0, 0);
  const b = new Date(a);
  b.setHours(13, 0, 0, 0);
  return { startsAt: toLocalInput(a), endsAt: toLocalInput(b) };
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ResourcesPanel() {
  const { isAdmin, isSenior } = useSession();
  const [sub, setSub] = useState<Sub>("calendar");
  const mayManage = isAdmin || isSenior;

  return (
    <div className="stack">
      <div className="subtabs">
        {(
          [
            ["calendar", "Calendar"],
            ["catalogue", "Catalogue and units"],
          ] as Array<[Sub, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={sub === id ? "active" : "ghost"}
            onClick={() => setSub(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === "calendar" && <CalendarView />}
      {sub === "catalogue" && <Catalogue mayManage={mayManage} />}
    </div>
  );
}

function CalendarView() {
  const toast = useToast();
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [days, setDays] = useState(7);
  const [windowStart, setWindowStart] = useState(() => startOfDay(new Date()));
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ row: CalendarRow; booking: Booking } | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);

  useEffect(() => {
    api<{ items: Department[] }>("/departments")
      .then((d) => setDepartments(d.items))
      .catch(() => {});
  }, []);

  const windowEnd = useMemo(() => {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + days);
    return d;
  }, [windowStart, days]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ rows: CalendarRow[] }>(
        `/resources/calendar${query({
          startsAt: windowStart.toISOString(),
          endsAt: windowEnd.toISOString(),
          ...(departmentId ? { departmentId } : {}),
        })}`,
      );
      setRows(res.rows);
    } catch (err) {
      toast.err(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [windowStart, windowEnd, departmentId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayList = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const d = new Date(windowStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [windowStart, days],
  );
  const spanMs = Math.max(1, windowEnd.getTime() - windowStart.getTime());

  function shift(delta: number) {
    const next = new Date(windowStart);
    next.setDate(next.getDate() + delta);
    setWindowStart(next);
  }

  return (
    <>
      <Card
        title="Resource calendar"
        actions={
          <div className="row">
            <button type="button" className="ghost tiny" onClick={() => shift(-days)}>
              ← Previous
            </button>
            <button
              type="button"
              className="ghost tiny"
              onClick={() => setWindowStart(startOfDay(new Date()))}
            >
              Today
            </button>
            <button type="button" className="ghost tiny" onClick={() => shift(days)}>
              Next →
            </button>
          </div>
        }
      >
        <p className="meta">
          Every booked room, lab and piece of equipment on one timeline. Click a booking to see its
          details. Other clubs&apos; plans appear as &quot;Reserved&quot; without event details.
        </p>
        <p className="timeline-range">
          <strong>
            {windowStart.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </strong>
          <span aria-hidden="true">→</span>
          <strong>
            {new Date(windowEnd.getTime() - 1).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </strong>
        </p>
        <div className="toolbar">
          <Field label="Starting">
            <input
              type="date"
              value={toDateInput(windowStart)}
              onChange={(e) => {
                if (e.target.value) setWindowStart(fromDateInput(e.target.value));
              }}
            />
          </Field>
          <Field label="Length">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>One week</option>
              <option value={14}>Two weeks</option>
              <option value={30}>One month</option>
            </select>
          </Field>
          <Field label="Department">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="timeline-legend" aria-hidden="true">
          <span>
            <i className="timeline-dot requested" /> Requested
          </span>
          <span>
            <i className="timeline-dot approved" /> Approved
          </span>
          <span>
            <i className="timeline-dot confirmed" /> Confirmed
          </span>
        </div>

        {loading ? (
          <p className="meta">Loading the calendar…</p>
        ) : rows.length === 0 ? (
          <Empty>No resource units match this view.</Empty>
        ) : (
          <div className="scroll-x timeline-scroll">
            <div className="timeline" style={{ ["--timeline-days" as string]: dayList.length }}>
              <div className="timeline-head">
                <div className="timeline-gutter">Resource / unit</div>
                <div className="timeline-track timeline-day-labels">
                  {dayList.map((d) => (
                    <div
                      key={d.toISOString()}
                      className="timeline-day-label"
                      style={{ width: `${100 / dayList.length}%` }}
                    >
                      <span>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <strong>{d.getDate()}</strong>
                    </div>
                  ))}
                </div>
              </div>
              {rows.map((r) => (
                <div className="timeline-row" key={r.resourceUnitId}>
                  <div className="timeline-gutter">
                    <strong>{r.resourceName}</strong>
                    <span className="meta">{r.unitLabel}</span>
                  </div>
                  <div className="timeline-track">
                    {dayList.map((d, i) => (
                      <span
                        key={d.toISOString()}
                        className={`timeline-gridline${i === 0 ? " first" : ""}`}
                        style={{ left: `${(i / dayList.length) * 100}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    {r.bookings.length === 0 ? (
                      <span className="timeline-free meta">Free</span>
                    ) : (
                      r.bookings.map((b) => {
                        const start = Math.max(
                          windowStart.getTime(),
                          new Date(b.startsAt).getTime(),
                        );
                        const end = Math.min(windowEnd.getTime(), new Date(b.endsAt).getTime());
                        const left = ((start - windowStart.getTime()) / spanMs) * 100;
                        const width = Math.max(1.2, ((end - start) / spanMs) * 100);
                        return (
                          <button
                            type="button"
                            key={b.reservationId}
                            className={`timeline-bar ${b.status.toLowerCase()}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${b.title} · ${formatWhen(b.startsAt)} → ${formatWhen(b.endsAt)}`}
                            onClick={() => setDetail({ row: r, booking: b })}
                          >
                            {b.title}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Find a free slot"
        actions={
          <button type="button" className="ghost tiny" onClick={() => setFreeOpen((v) => !v)}>
            {freeOpen ? "Hide" : "Open"}
          </button>
        }
      >
        {freeOpen ? (
          <Availability />
        ) : (
          <p className="meta">
            Search an exact window and see which units are free. The calendar above already shows
            every existing hold; this search answers &quot;can I book this?&quot;.
          </p>
        )}
      </Card>

      <Modal
        open={detail !== null}
        title={detail?.booking.title ?? "Booking"}
        description={detail ? `${detail.row.resourceName} · ${detail.row.unitLabel}` : undefined}
        onClose={() => setDetail(null)}
        footer={
          <button type="button" className="ghost" onClick={() => setDetail(null)}>
            Close
          </button>
        }
      >
        {detail && (
          <div className="stack">
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                <ReservationBadge status={detail.booking.status as never} />
              </dd>
              <dt>Starts</dt>
              <dd>{formatWhen(detail.booking.startsAt)}</dd>
              <dt>Ends</dt>
              <dd>{formatWhen(detail.booking.endsAt)}</dd>
              <dt>Duration</dt>
              <dd>
                {Math.max(
                  1,
                  Math.round(
                    (new Date(detail.booking.endsAt).getTime() -
                      new Date(detail.booking.startsAt).getTime()) /
                      60_000,
                  ),
                )}{" "}
                minutes
              </dd>
              <dt>Event</dt>
              <dd>{detail.booking.eventId ? detail.booking.eventId : "Details withheld"}</dd>
            </dl>
            {detail.booking.eventId && (
              <p className="meta">
                Open the event from Events to change or release this booking. Reservations are only
                changed through the event that owns them.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function Availability() {
  const toast = useToast();
  const [items, setItems] = useState<AvailabilityItem[]>([]);
  const [win, setWin] = useState(() => defaultWindow(7));
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(
    async (nextOffset = 0) => {
      setBusy(true);
      try {
        const page = await api<Page<AvailabilityItem>>(
          `/resources/availability${query({
            startsAt: fromLocalInput(win.startsAt),
            endsAt: fromLocalInput(win.endsAt),
            limit: PAGE_SIZE,
            offset: nextOffset,
          })}`,
        );
        setItems(page.items);
        setHasMore(page.hasMore ?? false);
        setOffset(nextOffset);
        setSearched(true);
      } catch (err) {
        toast.err(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [win, toast],
  );

  return (
    <div className="stack-tight">
      <div className="toolbar">
        <Field label="From">
          <input
            type="datetime-local"
            value={win.startsAt}
            onChange={(e) => setWin({ ...win, startsAt: e.target.value })}
          />
        </Field>
        <Field label="To">
          <input
            type="datetime-local"
            value={win.endsAt}
            onChange={(e) => setWin({ ...win, endsAt: e.target.value })}
          />
        </Field>
        <button type="button" disabled={busy} onClick={() => void search(0)}>
          {busy ? "Searching…" : "Search free slots"}
        </button>
      </div>

      {!searched ? (
        <p className="meta">Choose a window and search to see which units are free.</p>
      ) : items.length === 0 ? (
        <Empty>No resource units match this window.</Empty>
      ) : (
        <>
          <div className="availability-grid">
            {items.map((i) => (
              <div
                className={`availability-card${i.available ? " free" : " busy"}`}
                key={i.resourceUnitId}
              >
                <div>
                  <strong>{i.resourceName}</strong>
                  <span className="meta">{i.unitLabel}</span>
                </div>
                <span className={`badge ${i.available ? "good" : "bad"}`}>
                  {i.available ? "Free" : "Busy"}
                </span>
                <span className="meta">
                  {i.busyBlocks.length === 0
                    ? "No holds in this window"
                    : `${i.busyBlocks.length} hold${i.busyBlocks.length === 1 ? "" : "s"}`}
                </span>
              </div>
            ))}
          </div>
          <Pager
            offset={offset}
            limit={PAGE_SIZE}
            count={items.length}
            hasMore={hasMore}
            onChange={(o) => void search(o)}
          />
        </>
      )}
    </div>
  );
}

function Catalogue({ mayManage }: { mayManage: boolean }) {
  const { isAdmin, scopedDepartmentIds } = useSession();
  const scopedOnly = mayManage && !isAdmin;
  const toast = useToast();
  const action = useAction();
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    capacity: "",
    departmentId: scopedOnly ? (scopedDepartmentIds[0] ?? "") : "",
    description: "",
    unitLabels: "",
  });
  const [selected, setSelected] = useState<ResourceRow | null>(null);
  const [unitForm, setUnitForm] = useState({ label: "", notes: "" });
  const [retire, setRetire] = useState<Unit | null>(null);
  const [unitOpen, setUnitOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api<Page<ResourceRow>>(
        `/resources${query({ q, limit: PAGE_SIZE, offset })}`,
      );
      setRows(page.items);
      setTotal(page.total ?? page.items.length);
    } catch (err) {
      toast.err(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [q, offset, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ items: Department[] }>("/departments")
      .then((d) => setDepartments(d.items))
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await api("/resources", {
        name: form.name,
        ...(form.capacity ? { capacity: Number(form.capacity) } : {}),
        ...(form.departmentId ? { departmentId: form.departmentId } : {}),
        ...(form.description ? { description: form.description } : {}),
        unitLabels: form.unitLabels
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setCreating(false);
      setForm({
        name: "",
        capacity: "",
        departmentId: scopedOnly ? (scopedDepartmentIds[0] ?? "") : "",
        description: "",
        unitLabels: "",
      });
      await load();
      return "Resource created.";
    });
  }

  async function openResource(r: ResourceRow) {
    await action.run(async () => {
      const full = await api<ResourceRow>(`/resources/${r.id}`);
      setSelected({ ...full, canManage: r.canManage });
      setUnitForm({ label: "", notes: "" });
    });
  }

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await action.run(async () => {
      await api(`/resources/${selected.id}/units`, {
        label: unitForm.label,
        ...(unitForm.notes ? { notes: unitForm.notes } : {}),
      });
      const full = await api<ResourceRow>(`/resources/${selected.id}`);
      setSelected({ ...full, canManage: selected.canManage });
      setUnitForm({ label: "", notes: "" });
      setUnitOpen(false);
      await load();
      return "Unit added.";
    });
  }

  async function setResourceStatus(status: ResourceStatus) {
    if (!selected) return;
    await action.run(async () => {
      await api(`/resources/${selected.id}`, { status }, { method: "PATCH" });
      const full = await api<ResourceRow>(`/resources/${selected.id}`);
      setSelected({ ...full, canManage: selected.canManage });
      await load();
      return `Resource marked ${status.toLowerCase()}.`;
    });
  }

  async function doRetire() {
    if (!selected || !retire) return;
    await action.run(async () => {
      await api(`/resource-units/${retire.id}`, { status: "RETIRED" }, { method: "PATCH" });
      const full = await api<ResourceRow>(`/resources/${selected.id}`);
      setSelected({ ...full, canManage: selected.canManage });
      setRetire(null);
      await load();
      return "Unit retired.";
    });
  }

  const deptName = (id: string | null) =>
    id ? (departments.find((d) => d.id === id)?.name ?? "—") : "Institution-wide";

  return (
    <>
      <Card
        title="Catalogue and units"
        actions={
          mayManage ? (
            <button type="button" onClick={() => setCreating(true)}>
              Add resource
            </button>
          ) : undefined
        }
      >
        {!mayManage && (
          <p className="meta">
            Only Admin and HOD/Dean can change the inventory. You can browse it and check
            availability.
          </p>
        )}

        <div className="toolbar">
          <Field label="Search">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <button type="button" className="ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="meta">Loading…</p>
        ) : rows.length === 0 ? (
          <Empty>No resources match this filter.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Department</th>
                  <th>Units</th>
                  <th>Status</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="meta">{deptName(r.departmentId)}</td>
                    <td>{r.units.length}</td>
                    <td>
                      <span className="chip">{RESOURCE_STATUS_LABELS[r.status]}</span>
                    </td>
                    <td>
                      <button type="button" className="ghost tiny" onClick={() => openResource(r)}>
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
          offset={offset}
          limit={PAGE_SIZE}
          count={rows.length}
          total={total}
          onChange={setOffset}
        />
      </Card>

      <FormDialog
        open={creating}
        title="Add a resource"
        description="Bookings attach to a unit, not the resource, so two projectors of the same model can be booked independently."
        submitLabel="Create resource"
        size="lg"
        busy={action.busy}
        onClose={() => setCreating(false)}
        onSubmit={create}
      >
        <div className="grid-2">
          <Field label="Name">
            <input
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Capacity (optional)">
            <input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>
          <Field
            label="Owning department"
            hint={
              scopedOnly
                ? "Resources you add must belong to a department you head."
                : "Leave institution-wide for shared inventory."
            }
          >
            <select
              required={scopedOnly}
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              {!scopedOnly && <option value="">Institution-wide</option>}
              {departments
                .filter((d) => !scopedOnly || scopedDepartmentIds.includes(d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label="Bookable units (one per line)">
          <textarea
            rows={3}
            placeholder={"Lab 2 Room\nProjector 01"}
            value={form.unitLabels}
            onChange={(e) => setForm({ ...form, unitLabels: e.target.value })}
          />
        </Field>
      </FormDialog>

      <Modal
        open={selected !== null}
        size="lg"
        title={selected?.name ?? "Resource"}
        description={selected ? deptName(selected.departmentId) : undefined}
        onClose={() => setSelected(null)}
        footer={
          <>
            {selected?.canManage && (
              <button type="button" className="ghost" onClick={() => setUnitOpen(true)}>
                Add unit
              </button>
            )}
            {selected?.canManage && selected.status !== "RETIRED" && (
              <button
                type="button"
                className="ghost"
                disabled={action.busy}
                onClick={() => void setResourceStatus("RETIRED")}
              >
                Retire resource
              </button>
            )}
            <button type="button" className="ghost" onClick={() => setSelected(null)}>
              Close
            </button>
          </>
        }
      >
        {selected && (
          <div className="stack">
            <dl className="kv">
              <dt>Capacity</dt>
              <dd>{selected.capacity ?? "—"}</dd>
              <dt>Status</dt>
              <dd>{RESOURCE_STATUS_LABELS[selected.status]}</dd>
              <dt>Department</dt>
              <dd>{deptName(selected.departmentId)}</dd>
              <dt>Description</dt>
              <dd>{selected.description || "—"}</dd>
            </dl>

            <h3>Units</h3>
            {selected.units.length === 0 ? (
              <Empty>No units. Add at least one so this resource can be booked.</Empty>
            ) : (
              <div className="scroll-x">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Status</th>
                      <th>Notes</th>
                      {selected.canManage && <th> </th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.units.map((u) => (
                      <tr key={u.id}>
                        <td>{u.label}</td>
                        <td>
                          <span className="chip">{RESOURCE_STATUS_LABELS[u.status]}</span>
                        </td>
                        <td className="meta">{u.notes ?? "—"}</td>
                        {selected.canManage && (
                          <td>
                            {u.status !== "RETIRED" && (
                              <button
                                type="button"
                                className="ghost tiny"
                                onClick={() => setRetire(u)}
                              >
                                Retire
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <FormDialog
        open={unitOpen}
        title="Add a bookable unit"
        description="Each unit is booked independently and appears in the availability calendar."
        submitLabel="Add unit"
        busy={action.busy}
        onClose={() => setUnitOpen(false)}
        onSubmit={addUnit}
      >
        <div className="grid-2">
          <Field label="Label">
            <input
              required
              value={unitForm.label}
              onChange={(e) => setUnitForm({ ...unitForm, label: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <input
              value={unitForm.notes}
              onChange={(e) => setUnitForm({ ...unitForm, notes: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={retire !== null}
        title={`Retire ${retire?.label ?? ""}?`}
        description="A unit with an active or confirmed booking cannot be retired. Past bookings and reports keep their history."
        confirmLabel="Retire unit"
        busy={action.busy}
        onCancel={() => setRetire(null)}
        onConfirm={doRetire}
      />
    </>
  );
}

import {
  RESOURCE_STATUSES,
  RESOURCE_STATUS_LABELS,
  type ResourceStatus,
} from "@campusops/shared/ui";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, Pager, useAction, useToast } from "../components/feedback";
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
type CalendarRow = {
  resourceUnitId: string;
  unitLabel: string;
  resourceName: string;
  bookings: Array<{
    reservationId: string;
    startsAt: string;
    endsAt: string;
    status: string;
    eventId: string | null;
    title: string;
  }>;
};
type Department = { id: string; name: string };

type Sub = "availability" | "catalogue" | "calendar";

function defaultWindow(daysAhead: number) {
  const a = new Date();
  a.setDate(a.getDate() + daysAhead);
  a.setHours(10, 0, 0, 0);
  const b = new Date(a);
  b.setHours(13, 0, 0, 0);
  return { startsAt: toLocalInput(a), endsAt: toLocalInput(b) };
}

export function ResourcesPanel() {
  const { isAdmin, isSenior } = useSession();
  const [sub, setSub] = useState<Sub>("availability");
  const mayManage = isAdmin || isSenior;

  return (
    <div className="stack">
      <div className="subtabs">
        {(
          [
            ["availability", "Find a free slot"],
            ["catalogue", mayManage ? "Catalogue & units" : "Catalogue"],
            ["calendar", "Booking calendar"],
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
      {sub === "availability" && <Availability />}
      {sub === "catalogue" && <Catalogue mayManage={mayManage} />}
      {sub === "calendar" && <CalendarView />}
    </div>
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
    <Card title="Find a free slot">
      <p className="meta">
        Availability is computed for an exact window. Adjacent bookings are allowed; overlapping
        ones are refused by the database when you request the resource.
      </p>
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
        <button type="button" disabled={busy} onClick={() => search(0)}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      {!searched ? (
        <Empty>Choose a window and search to see which units are free.</Empty>
      ) : items.length === 0 ? (
        <Empty>No resource units match this window.</Empty>
      ) : (
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Unit</th>
                <th>Capacity</th>
                <th>Free?</th>
                <th>Conflicts</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.resourceUnitId}>
                  <td>{i.resourceName}</td>
                  <td>{i.unitLabel}</td>
                  <td>{i.capacity ?? "—"}</td>
                  <td>
                    <span className={`badge ${i.available ? "good" : "bad"}`}>
                      {i.available ? "Free" : "Busy"}
                    </span>
                  </td>
                  <td className="meta">
                    {i.busyBlocks.length === 0
                      ? "—"
                      : i.busyBlocks
                          .map((b) => `${formatWhen(b.startsAt)}–${formatWhen(b.endsAt)}`)
                          .join(", ")}
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
        count={items.length}
        hasMore={hasMore}
        onChange={(o) => search(o)}
      />
    </Card>
  );
}

function Catalogue({ mayManage }: { mayManage: boolean }) {
  const { isAdmin, scopedDepartmentIds } = useSession();
  // HOD/Dean may only create inventory inside their own department; Admin may
  // also create institution-wide resources. Mirror that in the form so the
  // control cannot offer a choice the API will refuse.
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
    load();
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
        title="Resource catalogue"
        actions={
          mayManage ? (
            <button type="button" onClick={() => setCreating((v) => !v)}>
              {creating ? "Close" : "Add resource"}
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

        {creating && (
          <form className="form" onSubmit={create}>
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
            <button type="submit" disabled={action.busy}>
              Create resource
            </button>
            <p className="hint">
              Bookings attach to a unit, not the resource, so two projectors of the same model can
              be booked independently.
            </p>
          </form>
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
          <button type="button" className="ghost" onClick={load}>
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

      {selected && (
        <Card
          title={selected.name}
          actions={
            <button type="button" className="ghost" onClick={() => setSelected(null)}>
              Close
            </button>
          }
        >
          <dl className="kv">
            <dt>Capacity</dt>
            <dd>{selected.capacity ?? "—"}</dd>
            <dt>Status</dt>
            <dd>{RESOURCE_STATUS_LABELS[selected.status]}</dd>
            <dt>Department</dt>
            <dd>{deptName(selected.departmentId)}</dd>
          </dl>

          {selected.canManage && (
            <div className="row" style={{ gap: "0.5rem", marginBottom: "0.75rem" }}>
              {RESOURCE_STATUSES.filter((s) => s !== selected.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ghost tiny"
                  disabled={action.busy}
                  onClick={() => setResourceStatus(s)}
                >
                  Mark {RESOURCE_STATUS_LABELS[s].toLowerCase()}
                </button>
              ))}
            </div>
          )}

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

          {selected.canManage && (
            <form className="form" onSubmit={addUnit}>
              <h3>Add a unit</h3>
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
              <button type="submit" disabled={action.busy}>
                Add unit
              </button>
            </form>
          )}
        </Card>
      )}

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

function CalendarView() {
  const toast = useToast();
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [win, setWin] = useState(() => {
    const a = new Date();
    a.setHours(0, 0, 0, 0);
    const b = new Date(a);
    b.setDate(b.getDate() + 7);
    return { startsAt: toLocalInput(a), endsAt: toLocalInput(b) };
  });
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api<{ rows: CalendarRow[] }>(
        `/resources/calendar${query({
          startsAt: fromLocalInput(win.startsAt),
          endsAt: fromLocalInput(win.endsAt),
        })}`,
      );
      setRows(res.rows);
      setSearched(true);
    } catch (err) {
      toast.err(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [win, toast]);

  return (
    <Card title="Booking calendar">
      <p className="meta">
        Bookings for other clubs appear as "Reserved" without event details, so the schedule is
        visible without leaking another club's plans. Windows are limited to 62 days.
      </p>
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
        <button type="button" disabled={busy} onClick={search}>
          {busy ? "Loading…" : "Show bookings"}
        </button>
      </div>
      {!searched ? (
        <Empty>Choose a window to see bookings.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No resource units found.</Empty>
      ) : (
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Unit</th>
                <th>Bookings in window</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.resourceUnitId}>
                  <td>{r.resourceName}</td>
                  <td>{r.unitLabel}</td>
                  <td>
                    {r.bookings.length === 0 ? (
                      <span className="meta">Free for the whole window</span>
                    ) : (
                      <ul className="plain">
                        {r.bookings.map((b) => (
                          <li key={b.reservationId}>
                            <ReservationBadge status={b.status as never} /> {b.title}{" "}
                            <span className="meta">
                              {formatWhen(b.startsAt)} → {formatWhen(b.endsAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

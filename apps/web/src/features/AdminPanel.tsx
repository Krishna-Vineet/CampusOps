import { GLOBAL_ROLES, GLOBAL_ROLE_LABELS } from "@campusops/shared/ui";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, FormDialog, Pager, useAction, useToast } from "../components/feedback";
import { Card, Empty, Field, SkeletonRows, formatWhen } from "../components/ui";
import { type Page, api, errorMessage, query } from "../lib/api";
import { PAGE_SIZE } from "../lib/constants";
import { useSession } from "../lib/session";

type SetupData = {
  counts: {
    departments: number;
    programs: number;
    clubs: number;
    events: number;
    staff: number;
    students: number;
  };
  steps: Array<{ id: string; label: string; done: boolean; detail: string; href: string }>;
  complete: boolean;
  completedSteps: number;
  totalSteps: number;
};

function SetupSection({ onNavigate }: { onNavigate: (sub: Sub) => void }) {
  const toast = useToast();
  const [data, setData] = useState<SetupData | null>(null);
  useEffect(() => {
    api<SetupData>("/admin/setup")
      .then(setData)
      .catch((err) => toast.err(errorMessage(err)));
  }, [toast]);

  if (!data) return <SkeletonRows rows={3} />;
  const percent = Math.round((data.completedSteps / data.totalSteps) * 100);
  return (
    <div className="stack">
      <Card
        title="Your college, set up"
        subtitle="The order that avoids dead ends: structure, people, then events."
      >
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="meta">
            {data.completedSteps} of {data.totalSteps} complete
          </span>
          <strong style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{percent}%</strong>
        </div>
        <div className="progress" aria-label={`Setup ${percent}% complete`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="stack" style={{ marginTop: 16, gap: 8 }}>
          {data.steps.map((step, index) => (
            <div
              key={step.id}
              className="row between"
              style={{
                gap: 12,
                padding: "12px 14px",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                background: step.done ? "var(--good-soft)" : "var(--surface-2)",
              }}
            >
              <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 99,
                    display: "grid",
                    placeItems: "center",
                    flex: "none",
                    background: step.done ? "var(--good)" : "var(--surface)",
                    color: step.done ? "#fff" : "var(--muted)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <div className="meta">{step.detail}</div>
                </div>
              </div>
              <button
                type="button"
                className={step.done ? "ghost tiny" : "tiny"}
                onClick={() => {
                  if (step.href.includes("admin")) onNavigate("departments");
                  else location.hash = step.href.replace(/^#/, "");
                }}
              >
                {step.done ? "Review" : "Open"}
              </button>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Single-college deployment">
        <p className="meta" style={{ margin: 0 }}>
          CampusOps runs one institution per deployment. Departments, programmes, roles and the
          academic calendar are yours alone; there is no cross-college tenancy to configure.
        </p>
        <div className="stats" style={{ marginTop: 14 }}>
          <div>
            <span className="stat-value">{data.counts.departments}</span>
            <span className="stat-label">Departments</span>
          </div>
          <div>
            <span className="stat-value">{data.counts.staff}</span>
            <span className="stat-label">HODs & faculty</span>
          </div>
          <div>
            <span className="stat-value">{data.counts.clubs}</span>
            <span className="stat-label">Clubs</span>
          </div>
          <div>
            <span className="stat-value">{data.counts.events}</span>
            <span className="stat-label">Events</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  eventId: string | null;
  requestId: string | null;
  createdAt: string;
  actor: { fullName: string; email: string } | null;
  before: unknown;
  after: unknown;
};

function AuditSection() {
  const toast = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [action, setAction] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api<Page<AuditRow>>(
        `/admin/audit${query({ limit: PAGE_SIZE, offset, action: appliedAction })}`,
      );
      setRows(page.items);
      setHasMore(Boolean(page.hasMore));
    } catch (err) {
      toast.err(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [offset, appliedAction, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card title="Who changed what" subtitle="Append-only. Redacted at write time.">
      <form
        className="row"
        style={{ gap: 8, marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setAppliedAction(action.trim());
        }}
      >
        <Field label="Action">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="EVENT_PUBLISHED"
          />
        </Field>
        <button type="submit" className="ghost">
          Filter
        </button>
      </form>
      {loading ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <Empty>No audit entries match this filter.</Empty>
      ) : (
        <>
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Request</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="meta">{formatWhen(row.createdAt)}</td>
                    <td>
                      {row.actor ? (
                        <>
                          <div>{row.actor.fullName}</div>
                          <div className="meta">{row.actor.email}</div>
                        </>
                      ) : (
                        <span className="meta">System</span>
                      )}
                    </td>
                    <td>
                      <code>{row.action}</code>
                    </td>
                    <td className="meta">
                      {row.entityType}
                      {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td className="meta">{row.requestId?.slice(0, 12) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            offset={offset}
            limit={PAGE_SIZE}
            count={rows.length}
            hasMore={hasMore}
            onChange={setOffset}
          />
        </>
      )}
    </Card>
  );
}

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  accountType: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
};

type RoleRow = {
  id: string;
  role: string;
  scopeType: string;
  departmentId: string | null;
  isActive: boolean;
};

type UserDetail = {
  user: UserRow;
  staffProfile: {
    designation: string;
    employeeCode: string | null;
    departmentId: string | null;
  } | null;
  studentProfile: {
    rollNumber: string | null;
    institutionName: string;
    departmentId: string | null;
  } | null;
  roles: RoleRow[];
  clubMemberships: Array<{ id: string; clubName: string; clubRole: string; isActive: boolean }>;
};

type Department = { id: string; code: string; name: string };

const STATUSES = ["PENDING_EMAIL", "PENDING_VERIFICATION", "ACTIVE", "REJECTED", "SUSPENDED"];

type Sub = "setup" | "users" | "departments" | "audit" | "jobs";

export function AdminPanel() {
  const [sub, setSub] = useState<Sub>("setup");
  return (
    <div className="stack">
      <div className="subtabs">
        {(
          [
            ["setup", "Get started"],
            ["users", "Users & roles"],
            ["departments", "Departments"],
            ["audit", "Audit trail"],
            ["jobs", "Maintenance"],
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
      {sub === "setup" && <SetupSection onNavigate={setSub} />}
      {sub === "users" && <UsersSection />}
      {sub === "departments" && <DepartmentsSection />}
      {sub === "audit" && <AuditSection />}
      {sub === "jobs" && <JobsSection />}
    </div>
  );
}

function UsersSection() {
  const { me } = useSession();
  const toast = useToast();
  const action = useAction();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [confirm, setConfirm] = useState<{
    kind: "suspend" | "reactivate" | "revoke";
    id: string;
    label: string;
  } | null>(null);
  const [showProvision, setShowProvision] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grant, setGrant] = useState({
    role: "FACULTY",
    scopeType: "DEPARTMENT",
    departmentId: "",
  });
  const [staff, setStaff] = useState({
    email: "",
    fullName: "",
    designation: "",
    employeeCode: "",
    departmentId: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api<Page<UserRow>>(
        `/admin/users${query({ q, status, limit: PAGE_SIZE, offset })}`,
      );
      setRows(page.items);
      setTotal(page.total ?? page.items.length);
    } catch (err) {
      toast.err(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [q, status, offset, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<{ items: Department[] }>("/departments")
      .then((d) => setDepartments(d.items))
      .catch(() => {});
  }, []);

  async function openUser(id: string) {
    await action.run(async () => {
      setDetail(await api<UserDetail>(`/admin/users/${id}`));
    });
  }

  async function refreshDetail(id: string) {
    setDetail(await api<UserDetail>(`/admin/users/${id}`));
  }

  async function provision(e: React.FormEvent) {
    e.preventDefault();
    let createdId = "";
    const ok = await action.run(async () => {
      const res = await api<{ user: UserRow }>("/admin/staff", {
        email: staff.email,
        fullName: staff.fullName,
        designation: staff.designation,
        ...(staff.employeeCode ? { employeeCode: staff.employeeCode } : {}),
        ...(staff.departmentId ? { departmentId: staff.departmentId } : {}),
      });
      createdId = res.user.id;
      setShowProvision(false);
      setStaff({ email: "", fullName: "", designation: "", employeeCode: "", departmentId: "" });
      await load();
      return "Staff created. They can use Forgot password to set their password.";
    });
    if (ok && createdId) await openUser(createdId);
  }

  async function grantRole(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const ok = await action.run(async () => {
      await api(`/admin/users/${detail.user.id}/roles`, {
        role: grant.role,
        scopeType: grant.scopeType,
        ...(grant.scopeType === "DEPARTMENT" ? { departmentId: grant.departmentId } : {}),
      });
      await refreshDetail(detail.user.id);
      return "Role granted.";
    });
    if (ok) {
      setGrantOpen(false);
      setGrant({ role: "FACULTY", scopeType: "DEPARTMENT", departmentId: "" });
    }
  }

  async function runConfirm(reason: string) {
    if (!confirm) return;
    const target = confirm;
    await action.run(async () => {
      if (target.kind === "revoke") {
        if (!detail) return;
        await api(`/admin/users/${detail.user.id}/roles/${target.id}`, undefined, {
          method: "DELETE",
        });
        await refreshDetail(detail.user.id);
        setConfirm(null);
        return "Role revoked.";
      }
      await api(`/admin/users/${target.id}/${target.kind}`, { reason });
      await load();
      if (detail?.user.id === target.id) await refreshDetail(target.id);
      setConfirm(null);
      return target.kind === "suspend" ? "Account suspended." : "Account reactivated.";
    });
  }

  const deptName = (id: string | null) =>
    id ? (departments.find((d) => d.id === id)?.name ?? id.slice(0, 8)) : "—";

  return (
    <>
      <Card
        title="Users"
        actions={
          <button type="button" onClick={() => setShowProvision(true)}>
            Provision staff
          </button>
        }
      >
        <div className="toolbar">
          <Field label="Search">
            <input
              value={q}
              placeholder="Email or name"
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="ghost" onClick={load}>
            Refresh
          </button>
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          <Empty>No accounts match this filter.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.fullName}</td>
                    <td className="meta">{u.email}</td>
                    <td className="meta">{u.accountType.replace(/_/g, " ")}</td>
                    <td>
                      <span className="chip">{u.status.replace(/_/g, " ")}</span>
                    </td>
                    <td className="meta nowrap">{formatWhen(u.createdAt)}</td>
                    <td className="nowrap">
                      <button type="button" className="ghost tiny" onClick={() => openUser(u.id)}>
                        Manage
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

      {detail && (
        <Card
          title={`Manage: ${detail.user.fullName}`}
          actions={
            <>
              <button type="button" className="ghost" onClick={() => setGrantOpen(true)}>
                Grant role
              </button>
              <button type="button" className="ghost" onClick={() => setDetail(null)}>
                Close
              </button>
            </>
          }
        >
          <dl className="kv">
            <dt>Email</dt>
            <dd>{detail.user.email}</dd>
            <dt>Account type</dt>
            <dd>{detail.user.accountType.replace(/_/g, " ")}</dd>
            <dt>Status</dt>
            <dd>{detail.user.status.replace(/_/g, " ")}</dd>
            <dt>Email verified</dt>
            <dd>{detail.user.emailVerifiedAt ? formatWhen(detail.user.emailVerifiedAt) : "No"}</dd>
            {detail.staffProfile && (
              <>
                <dt>Designation</dt>
                <dd>{detail.staffProfile.designation}</dd>
                <dt>Department</dt>
                <dd>{deptName(detail.staffProfile.departmentId)}</dd>
              </>
            )}
            {detail.studentProfile && (
              <>
                <dt>Roll number</dt>
                <dd>{detail.studentProfile.rollNumber ?? "—"}</dd>
                <dt>Institution</dt>
                <dd>{detail.studentProfile.institutionName}</dd>
              </>
            )}
          </dl>

          <div className="row" style={{ gap: "0.5rem" }}>
            {detail.user.status === "SUSPENDED" ? (
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    kind: "reactivate",
                    id: detail.user.id,
                    label: detail.user.fullName,
                  })
                }
              >
                Reactivate account
              </button>
            ) : detail.user.id !== me?.user.id ? (
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setConfirm({ kind: "suspend", id: detail.user.id, label: detail.user.fullName })
                }
              >
                Suspend account
              </button>
            ) : (
              <span className="meta">You cannot suspend your own account.</span>
            )}
          </div>

          <h3>Role assignments</h3>
          {detail.roles.length === 0 ? (
            <Empty>No institutional roles. This account has no staff powers.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Scope</th>
                    <th>Active</th>
                    <th> </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.roles.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {GLOBAL_ROLE_LABELS[r.role as keyof typeof GLOBAL_ROLE_LABELS] ?? r.role}
                      </td>
                      <td className="meta">
                        {r.scopeType === "GLOBAL" ? "Institution-wide" : deptName(r.departmentId)}
                      </td>
                      <td>{r.isActive ? "Yes" : "No"}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost tiny"
                          onClick={() => setConfirm({ kind: "revoke", id: r.id, label: r.role })}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {detail.clubMemberships.length > 0 && (
            <>
              <h3>Club memberships</h3>
              <ul className="plain">
                {detail.clubMemberships.map((m) => (
                  <li key={m.id}>
                    {m.clubName} · {m.clubRole === "LEAD" ? "Lead" : "Coordinator"}
                    {m.isActive ? "" : " (inactive)"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === "suspend"
            ? `Suspend ${confirm.label}?`
            : confirm?.kind === "reactivate"
              ? `Reactivate ${confirm.label}?`
              : `Revoke ${confirm?.label ?? ""}?`
        }
        description={
          confirm?.kind === "suspend"
            ? "This signs the account out everywhere and blocks access until it is reactivated."
            : confirm?.kind === "reactivate"
              ? "The account will be able to sign in again."
              : "The account immediately loses the powers this role grants."
        }
        confirmLabel={confirm?.kind === "revoke" ? "Revoke role" : "Confirm"}
        reasonLabel={confirm?.kind === "revoke" ? undefined : "Reason"}
        reasonRequired={confirm?.kind !== "revoke"}
        busy={action.busy}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />

      <FormDialog
        open={showProvision}
        title="Provision a staff account"
        description="The account is created without a password. The holder uses Forgot password to set one."
        submitLabel="Create staff account"
        busy={action.busy}
        onClose={() => setShowProvision(false)}
        onSubmit={provision}
      >
        <div className="grid-2">
          <Field label="Email">
            <input
              type="email"
              required
              value={staff.email}
              onChange={(e) => setStaff({ ...staff, email: e.target.value })}
            />
          </Field>
          <Field label="Full name">
            <input
              required
              minLength={2}
              value={staff.fullName}
              onChange={(e) => setStaff({ ...staff, fullName: e.target.value })}
            />
          </Field>
          <Field label="Designation">
            <input
              required
              minLength={2}
              placeholder="Assistant Professor"
              value={staff.designation}
              onChange={(e) => setStaff({ ...staff, designation: e.target.value })}
            />
          </Field>
          <Field label="Employee code (optional)">
            <input
              value={staff.employeeCode}
              onChange={(e) => setStaff({ ...staff, employeeCode: e.target.value })}
            />
          </Field>
          <Field label="Department (optional)">
            <select
              value={staff.departmentId}
              onChange={(e) => setStaff({ ...staff, departmentId: e.target.value })}
            >
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormDialog>

      <FormDialog
        open={grantOpen}
        title="Grant a role"
        description="Admin is always institution-wide. The last active Admin cannot be revoked or suspended."
        submitLabel="Grant role"
        busy={action.busy}
        onClose={() => setGrantOpen(false)}
        onSubmit={grantRole}
      >
        <Field label="Role">
          <select
            value={grant.role}
            onChange={(e) =>
              setGrant({
                ...grant,
                role: e.target.value,
                scopeType: e.target.value === "ADMIN" ? "GLOBAL" : grant.scopeType,
              })
            }
          >
            {GLOBAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {GLOBAL_ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scope">
          <select
            value={grant.scopeType}
            disabled={grant.role === "ADMIN"}
            onChange={(e) => setGrant({ ...grant, scopeType: e.target.value })}
          >
            <option value="DEPARTMENT">One department</option>
            <option value="GLOBAL">Institution-wide</option>
          </select>
        </Field>
        {grant.scopeType === "DEPARTMENT" && (
          <Field label="Department">
            <select
              required
              value={grant.departmentId}
              onChange={(e) => setGrant({ ...grant, departmentId: e.target.value })}
            >
              <option value="">Choose…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </FormDialog>
    </>
  );
}

function DepartmentsSection() {
  const action = useAction();
  const toast = useToast();
  const [items, setItems] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [programName, setProgramName] = useState("");
  const [form, setForm] = useState({ code: "", name: "" });
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deptOpen, setDeptOpen] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [departmentResult, programResult] = await Promise.all([
        api<{ items: Department[] }>("/departments"),
        api<{ items: Array<{ id: string; name: string }> }>("/departments/programs"),
      ]);
      setItems(departmentResult.items);
      setPrograms(programResult.items);
    } catch (err) {
      toast.err(errorMessage(err));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await api("/departments", form);
      setForm({ code: "", name: "" });
      setDeptOpen(false);
      await load();
      return "Department created.";
    });
  }

  async function createProgram(e: React.FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await api("/departments/programs", { name: programName.trim() });
      setProgramName("");
      setProgramOpen(false);
      await load();
      return "Programme added.";
    });
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    await action.run(async () => {
      await api(`/departments/${renaming.id}`, { name: renaming.name }, { method: "PATCH" });
      setRenaming(null);
      await load();
      return "Department renamed.";
    });
  }

  return (
    <>
      <Card
        title="Departments"
        actions={
          <button type="button" onClick={() => setDeptOpen(true)}>
            New department
          </button>
        }
      >
        <p className="meta">
          Departments scope role assignments, clubs, resources and student verification. Codes are
          permanent because existing records reference them.
        </p>
        {items.length === 0 ? (
          <Empty>No departments yet. Create one before assigning department-scoped roles.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <code>{d.code}</code>
                    </td>
                    <td>{d.name}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost tiny"
                        onClick={() => setRenaming({ id: d.id, name: d.name })}
                      >
                        Rename
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Student programmes"
        actions={
          <button type="button" className="ghost" onClick={() => setProgramOpen(true)}>
            Add programme
          </button>
        }
      >
        <p className="meta">Add the programme options students can select during registration.</p>
        {programs.length ? (
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            {programs.map((program) => (
              <span className="badge" key={program.id}>
                {program.name}
              </span>
            ))}
          </div>
        ) : (
          <Empty>No programmes added yet.</Empty>
        )}
      </Card>

      <FormDialog
        open={deptOpen}
        title="New department"
        description="Codes are permanent because existing records reference them."
        submitLabel="Create department"
        busy={action.busy}
        onClose={() => setDeptOpen(false)}
        onSubmit={create}
      >
        <div className="grid-2">
          <Field label="Code">
            <input
              required
              minLength={2}
              maxLength={20}
              placeholder="CSE"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label="Name">
            <input
              required
              minLength={2}
              placeholder="Computer Science and Engineering"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>

      <FormDialog
        open={programOpen}
        title="Add a programme"
        description="These become the options a student chooses during registration."
        submitLabel="Add programme"
        busy={action.busy}
        onClose={() => setProgramOpen(false)}
        onSubmit={createProgram}
      >
        <Field label="Programme name">
          <input
            required
            minLength={2}
            maxLength={120}
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            placeholder="Bachelor of Technology"
          />
        </Field>
      </FormDialog>

      <FormDialog
        open={Boolean(renaming)}
        title="Rename department"
        submitLabel="Save name"
        busy={action.busy}
        onClose={() => setRenaming(null)}
        onSubmit={rename}
      >
        <Field label="Name">
          <input
            required
            minLength={2}
            value={renaming?.name ?? ""}
            onChange={(e) =>
              setRenaming((current) => (current ? { ...current, name: e.target.value } : null))
            }
          />
        </Field>
      </FormDialog>
    </>
  );
}

function JobsSection() {
  const action = useAction();
  const toast = useToast();
  const [data, setData] = useState<{
    // job_runs has no status column: a run is finished when finishedAt is set.
    runs: Array<{
      id: string;
      job: string;
      startedAt: string;
      finishedAt: string | null;
      processed: number;
      detail: unknown;
    }>;
    outbox: { pending: number; failed: number };
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api("/admin/jobs"));
    } catch (err) {
      toast.err(errorMessage(err));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      title="Maintenance"
      actions={
        <button
          type="button"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              await api("/admin/jobs/maintenance", {});
              await load();
              return "Maintenance run complete.";
            })
          }
        >
          {action.busy ? "Running…" : "Run now"}
        </button>
      }
    >
      <p className="meta">
        Expires stale resource holds, advances event lifecycles and dispatches queued notifications.
        On a host that sleeps, drive this from cron instead of the in-process timer.
      </p>
      {data && (
        <div className="stats">
          <div>
            <span className="stat-value">{data.outbox.pending}</span>
            <span className="stat-label">Queued notifications</span>
          </div>
          <div>
            <span className="stat-value">{data.outbox.failed}</span>
            <span className="stat-label">Failed notifications</span>
          </div>
        </div>
      )}
      {!data || data.runs.length === 0 ? (
        <Empty>No maintenance runs recorded yet.</Empty>
      ) : (
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th>Job</th>
                <th>State</th>
                <th>Started</th>
                <th>Processed</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.job.replace(/_/g, " ")}</td>
                  <td>
                    <span className="chip">{r.finishedAt ? "Finished" : "Running"}</span>
                  </td>
                  <td className="meta nowrap">{formatWhen(r.startedAt)}</td>
                  <td>{r.processed}</td>
                  <td className="meta">
                    <code>{JSON.stringify(r.detail)}</code>
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

import { CLUB_ROLE_LABELS, type ClubRole } from "@campusops/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog, Pager, useAction, useToast } from "../components/feedback";
import { Card, Empty, Field, SkeletonRows, formatWhen } from "../components/ui";
import { type Page, api, errorMessage, isForbidden, query } from "../lib/api";
import { PAGE_SIZE } from "../lib/constants";
import { useSession } from "../lib/session";

type Club = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  departmentId: string | null;
  isActive: boolean;
};

type MemberRow = {
  membership: { id: string; clubRole: string; isActive: boolean; createdAt: string };
  user: { id: string; email: string; fullName: string; accountType: string; status: string };
};

type Candidate = { id: string; fullName: string; email: string; accountType: string };
type Department = { id: string; name: string };

export function ClubsPanel() {
  const { isAdmin, isSenior, scopedDepartmentIds, me } = useSession();
  const toast = useToast();
  const action = useAction();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Club | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const selectedClubId = useRef<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    departmentId: "",
  });
  const [editing, setEditing] = useState<Club | null>(null);
  const [candidateQ, setCandidateQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [remove, setRemove] = useState<MemberRow | null>(null);
  const [facultyQ, setFacultyQ] = useState("");
  const [facultyCandidates, setFacultyCandidates] = useState<Candidate[]>([]);

  // Faculty membership is granted by the department's HOD/Dean, or Admin — the
  // same rule the API enforces. A club lead cannot add their own faculty.
  const canManageFaculty =
    isAdmin ||
    (isSenior &&
      selected?.departmentId !== null &&
      selected?.departmentId !== undefined &&
      scopedDepartmentIds.includes(selected.departmentId));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api<Page<Club>>(`/clubs${query({ limit: PAGE_SIZE, offset })}`);
      setClubs(page.items);
      setHasMore(page.hasMore ?? false);
    } catch (err) {
      toast.err(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [offset, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<{ items: Department[] }>("/departments")
      .then((d) => setDepartments(d.items))
      .catch(() => {});
  }, []);

  const deptName = (id: string | null) =>
    id ? (departments.find((d) => d.id === id)?.name ?? "—") : "Institution-wide";

  async function openClub(club: Club) {
    selectedClubId.current = club.id;
    setSelected(club);
    setMembersLoading(true);
    setCanManage(false);
    setMembers([]);
    setCandidates([]);
    setCandidateQ("");
    setFacultyCandidates([]);
    setFacultyQ("");
    setEditing(null);
    // Managing coordinators is the club lead's or Admin's right; the API decides,
    // so a 403 here simply means "read-only for you", not a broken screen.
    try {
      const rows = await api<MemberRow[]>(`/clubs/${club.id}/members`);
      if (selectedClubId.current !== club.id) return;
      setMembers(Array.isArray(rows) ? rows : []);
      setCanManage(true);
    } catch (err) {
      // 403 legitimately means "read-only viewer". Anything else is a real
      // failure and must not masquerade as a permission state.
      if (selectedClubId.current === club.id) {
        setCanManage(false);
        if (!isForbidden(err)) toast.err(errorMessage(err));
      }
    } finally {
      if (selectedClubId.current === club.id) setMembersLoading(false);
    }
  }

  async function reloadMembers(clubId: string) {
    const rows = await api<MemberRow[]>(`/clubs/${clubId}/members`);
    if (selectedClubId.current === clubId) setMembers(Array.isArray(rows) ? rows : []);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await action.run(async () => {
      await api("/clubs", {
        name: form.name,
        slug: form.slug,
        ...(form.description ? { description: form.description } : {}),
        ...(form.departmentId ? { departmentId: form.departmentId } : {}),
      });
      setCreating(false);
      setForm({ name: "", slug: "", description: "", departmentId: "" });
      await load();
      return "Club created.";
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    await action.run(async () => {
      const updated = await api<Club>(
        `/clubs/${editing.id}`,
        {
          name: editing.name,
          description: editing.description ?? "",
          ...(editing.departmentId ? { departmentId: editing.departmentId } : {}),
        },
        { method: "PATCH" },
      );
      setSelected(updated);
      setEditing(null);
      await load();
      return "Club updated.";
    });
  }

  async function searchCandidates() {
    if (!selected || candidateQ.trim().length < 2) {
      toast.err("Enter at least two characters to search.");
      return;
    }
    await action.run(async () => {
      const res = await api<{ items: Candidate[] }>(
        `/clubs/${selected.id}/candidates${query({ q: candidateQ.trim(), limit: 10 })}`,
      );
      setCandidates(res.items);
      if (res.items.length === 0) return "No matching active accounts.";
    });
  }

  async function searchFaculty() {
    if (!selected || facultyQ.trim().length < 2) {
      toast.err("Enter at least two characters to search.");
      return;
    }
    await action.run(async () => {
      const res = await api<{ items: Candidate[] }>(
        `/clubs/${selected.id}/candidates${query({ q: facultyQ.trim(), limit: 10, role: "FACULTY" })}`,
      );
      setFacultyCandidates(res.items);
      if (res.items.length === 0) return "No matching faculty accounts.";
    });
  }

  async function addMember(userId: string, clubRole: ClubRole) {
    if (!selected) return;
    await action.run(async () => {
      await api(`/clubs/${selected.id}/members`, { userId, clubRole });
      await reloadMembers(selected.id);
      setCandidates([]);
      setCandidateQ("");
      return "Member added.";
    });
  }

  async function setRole(m: MemberRow, clubRole: ClubRole) {
    if (!selected) return;
    await action.run(async () => {
      await api(
        `/clubs/${selected.id}/members/${m.membership.id}`,
        { clubRole },
        { method: "PATCH" },
      );
      await reloadMembers(selected.id);
      return "Role updated.";
    });
  }

  async function setActive(m: MemberRow, isActive: boolean) {
    if (!selected) return;
    await action.run(async () => {
      await api(
        `/clubs/${selected.id}/members/${m.membership.id}`,
        { isActive },
        { method: "PATCH" },
      );
      await reloadMembers(selected.id);
      return isActive ? "Member reactivated." : "Member deactivated.";
    });
  }

  async function doRemove() {
    if (!selected || !remove) return;
    await action.run(async () => {
      await api(`/clubs/${selected.id}/members/${remove.membership.id}`, undefined, {
        method: "DELETE",
      });
      await reloadMembers(selected.id);
      setRemove(null);
      return "Member removed.";
    });
  }

  return (
    <>
      <Card
        title="Clubs"
        actions={
          isAdmin ? (
            <button type="button" onClick={() => setCreating((v) => !v)}>
              {creating ? "Close" : "Create club"}
            </button>
          ) : undefined
        }
      >
        <p className="meta">
          A club is the unit that owns events, permissions and reports. Every club has coordinators
          who run it and faculty who sign off on it.
        </p>

        {creating && (
          <form className="form" onSubmit={create}>
            <div className="grid-2">
              <Field label="Name">
                <input
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name: e.target.value,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    })
                  }
                />
              </Field>
              <Field label="Slug">
                <input
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </Field>
              <Field label="Department">
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                >
                  <option value="">Institution-wide</option>
                  {departments.map((d) => (
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
                maxLength={1000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <button type="submit" disabled={action.busy}>
              Create club
            </button>
          </form>
        )}

        {loading ? (
          <SkeletonRows rows={5} />
        ) : clubs.length === 0 ? (
          <Empty>No clubs yet.</Empty>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Club</th>
                  <th>Department</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      <div className="meta">{c.slug}</div>
                    </td>
                    <td className="meta">{deptName(c.departmentId)}</td>
                    <td>
                      <button type="button" className="ghost tiny" onClick={() => openClub(c)}>
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
          count={clubs.length}
          hasMore={hasMore}
          onChange={setOffset}
        />
      </Card>

      {selected && (
        <Card
          title={selected.name}
          actions={
            <div className="row" style={{ gap: "0.35rem" }}>
              {canManage && (
                <button type="button" className="ghost" onClick={() => setEditing(selected)}>
                  Edit
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  selectedClubId.current = null;
                  setSelected(null);
                  setMembersLoading(false);
                }}
              >
                Close
              </button>
            </div>
          }
        >
          <dl className="kv">
            <dt>Slug</dt>
            <dd>
              <code>{selected.slug}</code>
            </dd>
            <dt>Department</dt>
            <dd>{deptName(selected.departmentId)}</dd>
            <dt>Description</dt>
            <dd>{selected.description || "—"}</dd>
          </dl>

          {editing && (
            <form className="form" onSubmit={saveEdit}>
              <h3>Edit club</h3>
              <div className="grid-2">
                <Field label="Name">
                  <input
                    required
                    minLength={2}
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </Field>
                <Field label="Department">
                  <select
                    value={editing.departmentId ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, departmentId: e.target.value || null })
                    }
                  >
                    <option value="">Institution-wide</option>
                    {departments.map((d) => (
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
                  maxLength={1000}
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </Field>
              <div className="row" style={{ gap: "0.5rem" }}>
                <button type="submit" disabled={action.busy}>
                  Save
                </button>
                <button type="button" className="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <h3>Club team</h3>
          {membersLoading ? (
            <SkeletonRows rows={3} />
          ) : !canManage ? (
            <p className="meta">
              Coordinator management is limited to the club lead and Admin. Faculty are added by the
              department&apos;s HOD/Dean or Admin.
            </p>
          ) : members.length === 0 ? (
            <Empty>No members yet. Add a lead so the club can create events.</Empty>
          ) : (
            <div className="scroll-x">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Active</th>
                    <th> </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.membership.id}>
                      <td>{m.user.fullName}</td>
                      <td className="meta">{m.user.email}</td>
                      <td>
                        {CLUB_ROLE_LABELS[m.membership.clubRole as ClubRole] ??
                          m.membership.clubRole}
                      </td>
                      <td>{m.membership.isActive ? "Yes" : "No"}</td>
                      <td className="nowrap">
                        {m.membership.clubRole !== "FACULTY" && (
                          <button
                            type="button"
                            className="ghost tiny"
                            onClick={() =>
                              setRole(m, m.membership.clubRole === "LEAD" ? "COORDINATOR" : "LEAD")
                            }
                          >
                            Make {m.membership.clubRole === "LEAD" ? "coordinator" : "lead"}
                          </button>
                        )}{" "}
                        {(m.membership.clubRole !== "FACULTY" || canManageFaculty) && (
                          <>
                            <button
                              type="button"
                              className="ghost tiny"
                              onClick={() => setActive(m, !m.membership.isActive)}
                            >
                              {m.membership.isActive ? "Deactivate" : "Reactivate"}
                            </button>{" "}
                            <button
                              type="button"
                              className="ghost tiny"
                              onClick={() => setRemove(m)}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManage && (
            <div className="detail-panel">
              <h3>Add a coordinator</h3>
              <p className="hint">
                Search by name or email. Only active college accounts appear — outsider students
                cannot be coordinators.
              </p>
              <div className="toolbar">
                <Field label="Search accounts">
                  <input
                    value={candidateQ}
                    placeholder="At least 2 characters"
                    onChange={(e) => setCandidateQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchCandidates();
                      }
                    }}
                  />
                </Field>
                <button type="button" onClick={searchCandidates} disabled={action.busy}>
                  Search
                </button>
              </div>
              {candidates.length > 0 && (
                <div className="scroll-x">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id}>
                          <td>{c.fullName}</td>
                          <td className="meta">{c.email}</td>
                          <td className="nowrap">
                            <button
                              type="button"
                              className="ghost tiny"
                              onClick={() => addMember(c.id, "COORDINATOR")}
                            >
                              Add as coordinator
                            </button>{" "}
                            <button
                              type="button"
                              className="ghost tiny"
                              onClick={() => addMember(c.id, "LEAD")}
                            >
                              Add as lead
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {canManageFaculty && (
            <div className="detail-panel">
              <h3>Club faculty</h3>
              <p className="hint">
                Faculty in this club help run its events, approve its requests and scan access QRs
                at its gates. Only the department&apos;s HOD/Dean or Admin can add or remove them.
              </p>
              <div className="toolbar">
                <Field label="Search faculty">
                  <input
                    value={facultyQ}
                    placeholder="At least 2 characters"
                    onChange={(e) => setFacultyQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchFaculty();
                      }
                    }}
                  />
                </Field>
                <button type="button" onClick={() => void searchFaculty()} disabled={action.busy}>
                  Search
                </button>
              </div>
              {facultyCandidates.length > 0 && (
                <div className="scroll-x">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {facultyCandidates.map((c) => (
                        <tr key={c.id}>
                          <td>{c.fullName}</td>
                          <td className="meta">{c.email}</td>
                          <td className="nowrap">
                            <button
                              type="button"
                              className="ghost tiny"
                              onClick={() =>
                                void addMember(c.id, "FACULTY").then(() => setFacultyCandidates([]))
                              }
                            >
                              Add to club
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={remove !== null}
        title={`Remove ${remove?.user.fullName ?? ""} from the club?`}
        description="They lose the ability to create and manage this club's events. Existing events and their audit history are untouched."
        confirmLabel="Remove member"
        busy={action.busy}
        onCancel={() => setRemove(null)}
        onConfirm={doRemove}
      />
    </>
  );
}

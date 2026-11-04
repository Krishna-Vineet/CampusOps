import { useCallback, useEffect, useState } from "react";
import { FormDialog, useAction, useToast } from "../components/feedback";
import { Card, Empty, Field } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { StaffPanel } from "./StaffPanel";

type Department = { id: string; code: string; name: string };
type Sub = "staff" | "departments";

export function AdminPanel() {
  const [sub, setSub] = useState<Sub>("staff");
  return (
    <div className="stack">
      <div className="subtabs">
        {(
          [
            ["staff", "Staff"],
            ["departments", "Departments"],
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
      {sub === "staff" && <StaffPanel />}
      {sub === "departments" && <DepartmentsSection />}
    </div>
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

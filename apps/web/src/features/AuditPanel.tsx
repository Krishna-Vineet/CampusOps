import { useCallback, useEffect, useState } from "react";
import { Pager, useToast } from "../components/feedback";
import { Card, Empty, Field, SkeletonRows, formatWhen } from "../components/ui";
import { type Page, api, errorMessage, query } from "../lib/api";
import { PAGE_SIZE } from "../lib/constants";

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

export function AuditPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [applied, setApplied] = useState({ action: "", entityType: "" });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api<Page<AuditRow>>(
        `/admin/audit${query({
          limit: PAGE_SIZE,
          offset,
          action: applied.action || undefined,
          entityType: applied.entityType || undefined,
        })}`,
      );
      setRows(page.items);
      setHasMore(Boolean(page.hasMore));
    } catch (err) {
      toast.err(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [offset, applied, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card
      title="Audit trail"
      subtitle="Append-only. Sensitive values are redacted before they are written."
      actions={
        <button type="button" className="ghost tiny" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      }
    >
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied({ action: action.trim(), entityType: entityType.trim() });
        }}
      >
        <Field label="Action">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="EVENT_PUBLISHED"
          />
        </Field>
        <Field label="Entity type">
          <input
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder="event"
          />
        </Field>
        <button type="submit" className="ghost">
          Apply filters
        </button>
      </form>

      {loading ? (
        <SkeletonRows rows={7} />
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
                  <th> </th>
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
                    <td>
                      <button
                        type="button"
                        className="ghost tiny"
                        aria-expanded={expanded === row.id}
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      >
                        {expanded === row.id ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                ))}
                {expanded && (
                  <tr>
                    <td colSpan={6}>
                      <div className="grid-2">
                        <pre className="audit-json">
                          {JSON.stringify(
                            rows.find((r) => r.id === expanded)?.before ?? null,
                            null,
                            2,
                          )}
                        </pre>
                        <pre className="audit-json">
                          {JSON.stringify(
                            rows.find((r) => r.id === expanded)?.after ?? null,
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
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

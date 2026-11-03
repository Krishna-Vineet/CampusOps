import { GLOBAL_ROLE_LABELS } from "@campusops/shared/ui";
import { useState } from "react";
import { ConfirmDialog, useAction } from "../components/feedback";
import { Card, Empty, Field, formatWhen } from "../components/ui";
import { api } from "../lib/api";
import { useSession } from "../lib/session";

/** Profile, roles and session security for the signed-in staff member. */
export function AccountPanel() {
  const { me, roles, signOut, reload } = useSession();
  const action = useAction();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [confirmAll, setConfirmAll] = useState(false);

  if (!me) return null;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return;
    await action.run(async () => {
      await api("/auth/change-password", {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      });
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
      // The API revokes every session, including this one, so end it locally too
      // rather than leaving a screen whose next request would 401.
      await signOut(false);
      return "Password changed. Sign in again with your new password.";
    });
  }

  const mismatch = pw.confirm.length > 0 && pw.newPassword !== pw.confirm;

  return (
    <>
      <Card
        title="Your account"
        actions={
          <button type="button" className="ghost" onClick={() => reload()}>
            Refresh
          </button>
        }
      >
        <dl className="kv">
          <dt>Name</dt>
          <dd>{me.user.fullName}</dd>
          <dt>Email</dt>
          <dd>{me.user.email}</dd>
          <dt>Account type</dt>
          <dd>{me.user.accountType.replace(/_/g, " ")}</dd>
          <dt>Status</dt>
          <dd>{me.user.status.replace(/_/g, " ")}</dd>
        </dl>

        <h3>Institutional roles</h3>
        {me.globalRoles.length === 0 ? (
          <Empty>
            No institutional role. Club coordinators manage events through their club membership.
          </Empty>
        ) : (
          <ul className="plain">
            {me.globalRoles.map((r) => (
              <li key={r.id}>
                <strong>
                  {GLOBAL_ROLE_LABELS[r.role as keyof typeof GLOBAL_ROLE_LABELS] ?? r.role}
                </strong>{" "}
                <span className="meta">
                  {r.scopeType === "GLOBAL" ? "institution-wide" : "department-scoped"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3>Club memberships</h3>
        {me.clubMemberships.length === 0 ? (
          <Empty>No club memberships.</Empty>
        ) : (
          <ul className="plain">
            {me.clubMemberships.map((m) => (
              <li key={`${m.clubId}-${m.clubRole}`}>
                {m.clubName} · {m.clubRole === "LEAD" ? "Lead" : "Coordinator"}
                {m.isActive ? "" : " (inactive)"}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Change password">
        <form className="form" onSubmit={changePassword}>
          <Field label="Current password">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            />
          </Field>
          {mismatch && <p className="bad-note">The two new passwords do not match.</p>}
          <button type="submit" disabled={action.busy || mismatch || pw.newPassword.length < 10}>
            {action.busy ? "Changing…" : "Change password"}
          </button>
          <p className="hint">
            At least 10 characters. Changing your password signs out every session, including this
            one, and you will be asked to sign in again.
          </p>
        </form>
      </Card>

      <Card title="Sessions">
        <p className="meta">
          Your session is kept alive by an httpOnly cookie that JavaScript cannot read. The access
          token is held in memory only and is never stored in the browser.
        </p>
        <div className="row" style={{ gap: "0.5rem" }}>
          <button type="button" className="ghost" onClick={() => signOut(false)}>
            Sign out
          </button>
          <button type="button" className="danger" onClick={() => setConfirmAll(true)}>
            Sign out everywhere
          </button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmAll}
        title="Sign out of every device?"
        description="All refresh tokens are revoked. You will need to sign in again here and anywhere else you are signed in."
        confirmLabel="Sign out everywhere"
        busy={action.busy}
        onCancel={() => setConfirmAll(false)}
        onConfirm={async () => {
          setConfirmAll(false);
          await signOut(true);
        }}
      />
    </>
  );
}

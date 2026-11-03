import { type FormEvent, useState } from "react";
import { Card, ErrorNote, Field, SuccessNote } from "../components/ui";
import { api, errorMessage } from "../lib/api";

type Config = {
  demoMode: boolean;
  emailMode: string | null;
  exposeDemoOtp: boolean;
  storageMode: string;
};
type Challenge = { challengeId: string; demoOtp?: string; delivery: string; expiresAt: string };

type Mode = "login" | "forgot" | "code";

/**
 * Staff sign-in for the management website.
 *
 * Students do not register here: college and outsider students register in the
 * mobile app. Staff accounts are provisioned without a password; they request a
 * setup/reset code themselves through Forgot password.
 */
export function AuthPanel({
  config,
  onAuthenticated,
}: {
  config: Config | null;
  onAuthenticated: (token: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setOtp("");
    setNewPassword("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const normalized = email.trim().toLowerCase();
    try {
      if (mode === "login") {
        const r = await api<{ accessToken: string }>("/auth/login", {
          email: normalized,
          password,
          client: "web",
        });
        onAuthenticated(r.accessToken);
      } else if (mode === "forgot") {
        const r = await api<{ verification?: Challenge }>("/auth/forgot-password", {
          email: normalized,
        });
        if (r.verification) {
          setChallenge(r.verification);
        }
        setNotice("If that account exists, a reset code has been sent.");
        setMode("code");
      } else {
        // One endpoint serves both cases: a PASSWORD_RESET code resets an existing
        // password, a STAFF_SETUP code activates a new staff account and sets it.
        await api("/auth/reset-password", {
          email: normalized,
          otp: otp.trim(),
          newPassword,
        });
        setNotice("Password set. Sign in with your new password.");
        setPassword("");
        setNewPassword("");
        setOtp("");
        setMode("login");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const labels: Record<Mode, string> = {
    login: "Sign in",
    forgot: "Send code",
    code: "Set password",
  };

  return (
    <Card
      title={
        mode === "login"
          ? "Welcome back"
          : mode === "forgot"
            ? "Reset your password"
            : "Enter your code"
      }
    >
      <p className="meta">
        For coordinators, faculty, HOD/Dean and Admin. Students register and take part in the mobile
        app.
      </p>

      <div className="subtabs">
        {(["login", "forgot", "code"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? "active" : "ghost"}
            onClick={() => switchMode(m)}
          >
            {m === "forgot" ? "Forgot password" : m === "code" ? "Enter a code" : "Sign in"}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={submit}>
        <Field label="College email">
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        {mode === "login" && (
          <Field label="Password">
            <input
              name="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}

        {mode === "login" && (
          <label className="checkbox" style={{ marginTop: -6 }}>
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />{" "}
            Show password
          </label>
        )}

        {mode === "code" && (
          <Field label="6-digit code">
            <input
              required
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          </Field>
        )}

        {mode === "code" && (
          <>
            <Field label="New password">
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={10}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <label className="checkbox" style={{ marginTop: -6 }}>
              <input
                type="checkbox"
                checked={showPw}
                onChange={(e) => setShowPw(e.target.checked)}
              />{" "}
              Show new password
            </label>
          </>
        )}

        <button type="submit" disabled={busy}>
          {busy ? "Working…" : labels[mode]}
        </button>
      </form>

      {challenge?.demoOtp && config?.exposeDemoOtp && (
        <p className="note">
          Demo mode: your code is <strong>{challenge.demoOtp}</strong>. In production this is
          emailed instead of shown.
        </p>
      )}

      <ErrorNote message={error} />
      <SuccessNote message={notice} />

      {mode === "login" && (
        <p className="hint">
          Staff accounts are created by an administrator. New staff use{" "}
          <strong>Forgot password</strong>
          to request a code and activate their account.
        </p>
      )}
      {mode === "code" && (
        <p className="hint">
          Use the 6-digit code from your email. This works both for a password reset and for
          activating a newly provisioned staff account.
        </p>
      )}
    </Card>
  );
}

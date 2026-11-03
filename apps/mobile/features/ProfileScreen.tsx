import { ACCOUNT_TYPE_LABELS, GLOBAL_ROLE_LABELS, type GlobalRole } from "@campusops/shared/ui";
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, Field, Muted, Note, Row, Screen, Title } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { registerForPush } from "../lib/push";
import { useSession } from "../lib/session";
import type { Challenge } from "../lib/types";

export function ProfileScreen({ onComplaints }: { onComplaints: () => void }) {
  const { me, config, signOut, reloadMe } = useSession();
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  if (!me) return null;
  const student = me.studentProfile;
  async function changePassword() {
    setBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", { currentPassword, newPassword });
      await signOut();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  async function enablePush() {
    setPushBusy(true);
    setPushNote(null);
    try {
      const result = await registerForPush();
      setPushNote(result.detail);
    } finally {
      setPushBusy(false);
    }
  }

  async function logout(all = false) {
    setBusy(true);
    setError(null);
    try {
      if (all) {
        await api("/auth/logout-all", {});
      }
      await signOut();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Title eyebrow="Your account" title={me.user.fullName} subtitle={me.user.email} />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Badge label={ACCOUNT_TYPE_LABELS[me.user.accountType]} tone="primary" />
        <Badge
          label={
            me.user.status === "ACTIVE"
              ? "Verified & active"
              : me.user.status.replace(/_/g, " ").toLowerCase()
          }
          tone={me.user.status === "ACTIVE" ? "good" : "warn"}
        />
      </View>
      <Note message={error} />
      <Note message={notice} tone="good" />
      {student && (
        <Card title="Student profile">
          <Row label="Institution" value={student.institutionName} />
          <Row label="Roll number" value={student.rollNumber ?? "—"} />
          <Row label="College ID" value={student.collegeIdNumber ?? "—"} />
          <Row label="Program" value={student.program ?? "—"} />
          <Row
            label="Graduation year"
            value={student.graduationYear ? String(student.graduationYear) : "—"}
          />
          <Muted>
            Only faculty can verify or update your student profile. If something is wrong, contact
            your faculty coordinator.
          </Muted>
        </Card>
      )}
      {me.globalRoles.length > 0 && (
        <Card title="Institution roles">
          {me.globalRoles.map((r, i) => (
            <Badge
              key={`${r.role}-${i}`}
              label={GLOBAL_ROLE_LABELS[r.role as GlobalRole] ?? r.role}
            />
          ))}
        </Card>
      )}
      {me.clubMemberships.length > 0 && (
        <Card title="Club team">
          {me.clubMemberships.map((m) => (
            <Row
              key={m.clubId}
              label={m.clubName}
              value={
                m.clubRole === "LEAD"
                  ? "Club lead"
                  : m.clubRole === "FACULTY"
                    ? "Club faculty"
                    : "Coordinator"
              }
            />
          ))}
          <Muted>
            Use Scan to check participants at your events. Approvals and event setup stay on the
            management website.
          </Muted>
        </Card>
      )}
      <Card title="Notifications">
        <Muted>
          Get told about venue changes and seat decisions for your events. Announcements always
          appear under Updates, even with notifications off.
        </Muted>
        <Button
          label="Enable notifications on this phone"
          variant="ghost"
          busy={pushBusy}
          onPress={() => void enablePush()}
          testID="enable-push"
        />
        {pushNote && <Note message={pushNote} tone="neutral" />}
      </Card>
      <Card title="Account & security">
        <Button label="My reported issues" variant="ghost" onPress={onComplaints} />
        <Button
          label={changing ? "Cancel password change" : "Change password"}
          variant="ghost"
          onPress={() => {
            setChanging(!changing);
            setError(null);
          }}
        />
        {changing && (
          <>
            <Field
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
            />
            <Field
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              hint="At least 10 characters. Changing it signs you out everywhere."
            />
            <Button
              label="Update password"
              onPress={() => void changePassword()}
              busy={busy}
              disabled={!currentPassword || newPassword.length < 10}
            />
          </>
        )}
        <Button
          label="Refresh profile"
          variant="ghost"
          onPress={() => {
            setNotice(null);
            void reloadMe()
              .then(() => setNotice("Profile refreshed."))
              .catch((e) => setError(errorMessage(e)));
          }}
        />
        <Button label="Sign out" variant="ghost" onPress={() => void logout()} disabled={busy} />
        <Button
          label="Sign out of all devices"
          variant="danger"
          onPress={() => void logout(true)}
          disabled={busy}
        />
      </Card>
      <Muted>
        CampusOps · Evaluation 1 build. API:{" "}
        {config?.storageMode === "s3"
          ? "private S3 storage"
          : "file storage disabled in this environment"}
        . Email: {config?.emailMode ?? "configured by server"}.
      </Muted>
    </Screen>
  );
}

export function PendingScreen() {
  const { me, signOut, reloadMe, config } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  if (!me) return null;
  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ verification?: Challenge }>("/auth/resend-verification", {
        email: me?.user.email,
      });
      setChallenge(result.verification ?? null);
      setNotice(
        result.verification?.delivery === "DEMO"
          ? "Demo email mode: use the code below."
          : "A new code has been sent to your email.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/verify-email", { challengeId: challenge.challengeId, otp: otp.trim() });
      await reloadMe();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Title
        eyebrow="One more step"
        title={
          me.user.status === "PENDING_EMAIL"
            ? "Verify your email"
            : me.user.status === "PENDING_VERIFICATION"
              ? "Faculty verification pending"
              : "Account unavailable"
        }
        subtitle={me.user.email}
      />
      <Card>
        <Note
          tone="warn"
          message={
            me.user.status === "PENDING_VERIFICATION"
              ? "Your email is verified. A faculty member must verify your college ID before you can register for events. You cannot approve this yourself."
              : me.user.status === "PENDING_EMAIL"
                ? "Enter the code from your email. College students then wait for faculty verification."
                : "Contact your institution about this account."
          }
        />
        <Note message={error} />
        <Note message={notice} tone="good" />
        {me.user.status === "PENDING_EMAIL" && (
          <>
            {config?.exposeDemoOtp && challenge?.demoOtp && (
              <Note
                tone="warn"
                message={`Demo email mode · code ${challenge.demoOtp}. No email was sent.`}
              />
            )}
            {challenge && (
              <>
                <Field
                  label="6-digit code"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="numeric"
                  maxLength={6}
                />
                <Button
                  label="Verify email"
                  onPress={() => void verify()}
                  busy={busy}
                  disabled={otp.trim().length !== 6}
                />
              </>
            )}
            <Button
              label={challenge ? "Resend code" : "Send verification code"}
              variant="ghost"
              onPress={() => void resend()}
              busy={busy}
            />
          </>
        )}
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}

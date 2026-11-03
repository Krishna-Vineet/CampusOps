import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Chip, Field, Muted, Note, Screen, Title } from "../components/ui";
import { type AuthPayload, api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";
import type { Challenge } from "../lib/types";

type Mode = "login" | "college" | "outsider" | "verify" | "forgot" | "reset";
type Department = { id: string; name: string; code: string };
type Program = { id: string; name: string };

export function AuthScreen() {
  const { signIn, config } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [program, setProgram] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "college" && departments.length === 0)
      api<{ items: Department[] }>("/auth/departments")
        .then((d) => setDepartments(d.items))
        .catch((e) => setError(errorMessage(e)));
  }, [mode, departments.length]);

  useEffect(() => {
    if (mode === "college" && programs.length === 0)
      api<{ items: Program[] }>("/auth/programs")
        .then((result) => setPrograms(result.items))
        .catch((e) => setError(errorMessage(e)));
  }, [mode, programs.length]);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setOtp("");
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const normalized = email.trim().toLowerCase();

  async function submit() {
    await run(async () => {
      if (mode === "login") {
        const result = await api<AuthPayload>("/auth/login", {
          email: normalized,
          password,
          client: "mobile",
          deviceLabel: "CampusOps mobile",
        });
        await signIn(result);
      } else if (mode === "college" || mode === "outsider") {
        if (!departmentId && mode === "college") throw new Error("Choose your department.");
        if (!program && mode === "college") throw new Error("Choose your programme.");
        if (mode === "college" && graduationYear && !/^20\d{2}$/.test(graduationYear))
          throw new Error("Enter a valid four-digit graduation year.");
        const body = {
          email: normalized,
          password,
          fullName: fullName.trim(),
          institutionName:
            mode === "college" ? (config?.institutionName ?? "Campus") : institutionName.trim(),
          client: "mobile",
          ...(mode === "college"
            ? {
                rollNumber: rollNumber.trim(),
                program: program.trim() || undefined,
                graduationYear: graduationYear ? Number(graduationYear) : undefined,
                departmentId,
              }
            : {}),
        };
        const result = await api<{ verification: Challenge }>(`/auth/register/${mode}`, body, {
          idempotencyKey: `register-${normalized}-${Date.now()}`,
        });
        setChallenge(result.verification);
        setPassword("");
        setMode("verify");
        setNotice(
          result.verification.delivery === "DEMO"
            ? "Demo email mode: use the code shown below."
            : "Enter the code sent to your email.",
        );
      } else if (mode === "verify") {
        if (!challenge) throw new Error("Request a verification code first.");
        await api("/auth/verify-email", { challengeId: challenge.challengeId, otp: otp.trim() });
        setMode("login");
        setOtp("");
        setNotice("Email verified. Sign in to continue.");
      } else if (mode === "forgot") {
        const result = await api<{ verification?: Challenge }>("/auth/forgot-password", {
          email: normalized,
        });
        setChallenge(result.verification ?? null);
        setMode("reset");
        setNotice("If that account exists, a reset code has been sent.");
      } else {
        await api("/auth/reset-password", {
          email: normalized,
          otp: otp.trim(),
          newPassword: password,
        });
        setMode("login");
        setPassword("");
        setOtp("");
        setNotice("Password set. Sign in with your new password.");
      }
    });
  }

  const registering = mode === "college" || mode === "outsider";
  const labels: Record<Mode, string> = {
    login: "Sign in",
    college: "Create student account",
    outsider: "Create outsider account",
    verify: "Verify email",
    forgot: "Send reset code",
    reset: "Set new password",
  };
  return (
    <Screen>
      <Title
        eyebrow="CampusOps"
        title={
          mode === "login"
            ? "Your campus, in your pocket."
            : registering
              ? "Join your next event."
              : "Account access"
        }
        subtitle="Events, passes and event help — without the queue."
      />
      <Card>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Chip label="Sign in" selected={mode === "login"} onPress={() => go("login")} />
          <Chip
            label="College student"
            selected={mode === "college"}
            onPress={() => go("college")}
          />
          <Chip
            label="Outside student"
            selected={mode === "outsider"}
            onPress={() => go("outsider")}
          />
        </View>
        <Note message={error} />
        <Note message={notice} tone="neutral" />
        {mode !== "verify" && (
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="you@college.edu"
            testID="email"
          />
        )}
        {registering && (
          <>
            <Field
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="sentences"
            />
            {mode === "outsider" && (
              <Field
                label="Institution"
                value={institutionName}
                onChangeText={setInstitutionName}
                autoCapitalize="sentences"
              />
            )}
          </>
        )}
        {mode === "college" && (
          <>
            <Field label="Roll number" value={rollNumber} onChangeText={setRollNumber} />
            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "600" }}>Programme</Text>
              {programs.length === 0 ? (
                <Text style={{ color: "#6b7085" }}>
                  Programmes have not been added yet. Please contact your administrator.
                </Text>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {programs.map((item) => (
                    <Chip
                      key={item.id}
                      label={item.name}
                      selected={program === item.name}
                      onPress={() => setProgram(item.name)}
                    />
                  ))}
                </View>
              )}
            </View>
            <Field
              label="Graduation year"
              value={graduationYear}
              onChangeText={setGraduationYear}
              keyboardType="numeric"
              maxLength={4}
              placeholder={String(new Date().getFullYear() + 4)}
            />
            
            <Text style={{ fontWeight: "600" }}>Department</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {departments.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  selected={departmentId === d.id}
                  onPress={() => setDepartmentId(d.id)}
                />
              ))}
            </View>
          </>
        )}
        {(mode === "verify" || mode === "reset") && (
          <>
            {config?.exposeDemoOtp && challenge?.demoOtp && (
              <Note
                tone="warn"
                message={`Demo email mode · code ${challenge.demoOtp}. No email was sent.`}
              />
            )}
            <Field
              label="6-digit code"
              value={otp}
              onChangeText={setOtp}
              keyboardType="numeric"
              maxLength={6}
            />
          </>
        )}
        {mode !== "forgot" && mode !== "verify" && (
          <Field
            label={mode === "reset" || registering ? "New password" : "Password"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            hint={registering || mode === "reset" ? "At least 10 characters." : undefined}
            testID="password"
          />
        )}
        {mode !== "forgot" && mode !== "verify" && (
          <Button
            label={showPassword ? "Hide password" : "Show password"}
            variant="ghost"
            onPress={() => setShowPassword((value) => !value)}
          />
        )}
        <Button
          label={labels[mode]}
          onPress={() => void submit()}
          busy={busy}
          testID="auth-submit"
        />
        {mode === "login" && (
          <Button label="Forgot password?" variant="ghost" onPress={() => go("forgot")} />
        )}
        {(mode === "forgot" || mode === "reset" || mode === "verify") && (
          <Button label="Back to sign in" variant="ghost" onPress={() => go("login")} />
        )}
        {registering && (
          <Note
            tone="neutral"
            message={
              mode === "college"
                ? "After email verification, a faculty member must verify your student account. You cannot edit your verified profile yourself."
                : "Outside students need email verification only. You will see public events and events you are invited to."
            }
          />
        )}
      </Card>
    </Screen>
  );
}

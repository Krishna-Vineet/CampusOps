import { QR_DIRECTION_LABELS, QR_TYPE_LABELS } from "@campusops/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { QrCode } from "../components/QrCode";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Loading,
  Muted,
  Note,
  Screen,
  Title,
  colors,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { when } from "../lib/format";
import { useSession } from "../lib/session";
import type { Nonce, WalletPass } from "../lib/types";

export function PassesScreen() {
  const { config } = useSession();
  const [passes, setPasses] = useState<WalletPass[]>([]);
  const [passId, setPassId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [nonce, setNonce] = useState<Nonce | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeBusy, setCodeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const generation = useRef(0);
  const pass = passes.find((p) => p.passId === passId) ?? passes[0];
  const qr = pass?.checkpoints.find((c) => c.qrId === qrId) ?? pass?.checkpoints[0];
  const tz = config?.campusTimezone ?? "Asia/Kolkata";

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ items: WalletPass[] }>("/me/passes");
      // Live events first, then the next upcoming event, then history.
      const rank = (p: WalletPass) =>
        p.event.status === "LIVE" ? 0 : new Date(p.event.endsAt).getTime() >= Date.now() ? 1 : 2;
      const items = [...data.items].sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (rank(a) === 2
            ? new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime()
            : new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime()),
      );
      setPasses(items);
      setPassId((old) => (items.some((p) => p.passId === old) ? old : (items[0]?.passId ?? null)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const mint = useCallback(async () => {
    if (!pass || !qr || !qr.availableNow) return;
    const current = ++generation.current;
    setCodeBusy(true);
    setCodeError(null);
    try {
      const result = await api<Nonce>(`/me/passes/${pass.passId}/nonce`, { checkpointId: qr.qrId });
      if (current === generation.current) {
        setNonce(result);
        setSeconds(
          Math.max(1, Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000)),
        );
      }
    } catch (e) {
      if (current === generation.current) {
        setCodeError(errorMessage(e));
        setNonce(null);
      }
    } finally {
      if (current === generation.current) setCodeBusy(false);
    }
  }, [pass, qr]);

  // Invalidate the displayed code whenever the selected QR/pass changes, and
  // never let an old request overwrite the new selection.
  useEffect(() => {
    generation.current++;
    setNonce(null);
    setCodeError(null);
    void mint();
    return () => {
      generation.current++;
    };
  }, [mint]);
  useEffect(() => {
    if (!nonce) return;
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((new Date(nonce.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSeconds(left);
      if (left === 0) {
        setNonce(null);
        void mint();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [nonce, mint]);
  useEffect(() => {
    if (!nonce) return;
    const timer = setTimeout(() => void mint(), nonce.refreshAfterSeconds * 1000);
    return () => clearTimeout(timer);
  }, [nonce, mint]);

  if (loading)
    return (
      <Screen>
        <Loading label="Loading your passes…" />
      </Screen>
    );
  return (
    <Screen>
      <Title
        eyebrow="Your wallet"
        title="Event passes"
        subtitle="Show the right QR at the right place. Codes rotate automatically."
      />
      <Note message={error} />
      {passes.length === 0 ? (
        <Empty
          title="No passes yet"
          detail="A pass appears after your registration is confirmed. Waitlisted and applied registrations do not receive a pass."
        />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {passes.map((p) => (
              <Chip
                key={p.passId}
                label={p.event.title}
                selected={p.passId === pass?.passId}
                onPress={() => {
                  setPassId(p.passId);
                  setQrId(null);
                }}
              />
            ))}
          </ScrollView>
          {pass && (
            <>
              <Card>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>
                  {pass.event.title}
                </Text>
                <Muted>
                  {when(pass.event.startsAt, tz)} ·{" "}
                  {pass.event.venueSummary ?? "Venue to be announced"}
                </Muted>
                {pass.revokedAt && (
                  <Note message="This pass has been revoked. Contact the event coordinator." />
                )}
              </Card>
              {pass.checkpoints.length === 0 ? (
                <Empty
                  title="No QRs defined yet"
                  detail="The coordinator has not added access QRs to this event."
                />
              ) : (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                    accessibilityLabel="Event QR names"
                  >
                    {pass.checkpoints.map((c) => (
                      <Chip
                        key={c.qrId}
                        label={c.name}
                        selected={c.qrId === qr?.qrId}
                        onPress={() => setQrId(c.qrId)}
                      />
                    ))}
                  </ScrollView>
                  {qr && (
                    <Card>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{ fontSize: 22, fontWeight: "800", color: colors.ink, flex: 1 }}
                        >
                          {qr.name}
                        </Text>
                        <Badge
                          label={qr.availableNow ? "Ready" : "Unavailable"}
                          tone={qr.availableNow ? "good" : "warn"}
                        />
                      </View>
                      <Muted>
                        {QR_TYPE_LABELS[qr.qrType]} · {qr.summary.split(" · ")[1]}
                      </Muted>
                      {qr.nextDirection && (
                        <Badge
                          label={`Next scan: ${QR_DIRECTION_LABELS[qr.nextDirection]}`}
                          tone="primary"
                        />
                      )}
                      <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }}>
                        {qr.availableNow && nonce ? (
                          <>
                            <QrCode value={nonce.token} />
                            <Muted>Refreshes in {seconds}s · valid for this QR only</Muted>
                          </>
                        ) : codeBusy ? (
                          <Loading label="Preparing secure code…" />
                        ) : (
                          <Note
                            tone="warn"
                            message={codeError ?? qr.unavailableReason ?? "Preparing code…"}
                          />
                        )}
                      </View>
                      <Note message={codeError} />
                      <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
                        <Muted>Used: {qr.usedCount}</Muted>
                        <Muted>
                          {qr.remaining === null ? "No use limit" : `${qr.remaining} left`}
                        </Muted>
                        {qr.requiresIdCheck && <Muted>College ID check required</Muted>}
                      </View>
                      {qr.validityMode === "WINDOW" && qr.validFrom && qr.validUntil && (
                        <Muted>
                          Valid {when(qr.validFrom, tz)} → {when(qr.validUntil, tz)}
                        </Muted>
                      )}
                      {qr.validityMode === "DATE" && (
                        <Muted>
                          Valid on {qr.validOn} ({tz})
                        </Muted>
                      )}
                      {qr.validityMode === "MANUAL" && (
                        <Muted>The coordinator switches this QR on when it is being served.</Muted>
                      )}
                      <Button
                        label="Refresh code & status"
                        variant="ghost"
                        onPress={() => {
                          void load();
                          void mint();
                        }}
                      />
                    </Card>
                  )}
                </>
              )}
              <Note
                tone="neutral"
                message="Only you may use this pass. The organiser checks your college ID where required; a screenshot or a friend cannot attend on your behalf."
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

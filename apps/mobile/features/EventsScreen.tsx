import {
  ADMISSION_MODE_LABELS,
  ELIGIBILITY_REASON_LABELS,
  EVENT_AUDIENCE_LABELS,
  EVENT_TEMPLATE_LABELS,
  type EligibilityReason,
} from "@campusops/shared/ui";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Loading,
  Muted,
  Note,
  Row,
  Screen,
  Title,
  colors,
} from "../components/ui";
import { type Page, api, errorMessage, query } from "../lib/api";
import { eventTone, statusLabel, when } from "../lib/format";
import { useSession } from "../lib/session";
import type { EventRow, ParticipantView, Registration } from "../lib/types";

export function EventsScreen({
  onOpenPasses,
  onOpenQuiz,
}: {
  onOpenPasses: () => void;
  onOpenQuiz?: (eventId: string, title: string) => void;
}) {
  const { me, config } = useSession();
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ParticipantView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const tz = config?.campusTimezone ?? "Asia/Kolkata";

  const load = useCallback(
    async (offset = 0) => {
      setLoading(true);
      setError(null);
      try {
        if (tab === "discover") {
          const page = await api<Page<EventRow>>(
            `/events${query({ q: appliedSearch, limit: 20, offset })}`,
          );
          setEvents((old) => (offset ? [...old, ...page.items] : page.items));
          setHasMore(Boolean(page.hasMore));
        } else {
          const page = await api<Page<Registration>>(
            `/me/registrations${query({ limit: 20, offset })}`,
          );
          setRegistrations((old) => (offset ? [...old, ...page.items] : page.items));
          setHasMore(Boolean(page.hasMore));
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [tab, appliedSearch],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetail(null);
    setError(null);
    api<ParticipantView>(`/events/${selected}/participant`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  async function withdraw() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/events/${selected}/withdraw`, {});
      setDetail(await api<ParticipantView>(`/events/${selected}/participant`));
      setNotice("You've given up your place. Someone on the waitlist has been moved up.");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ registration: { status: string }; alreadyRegistered: boolean }>(
        `/events/${selected}/register`,
        {},
        { idempotencyKey: `register-${selected}-${me?.user.id}` },
      );
      setDetail(await api<ParticipantView>(`/events/${selected}/participant`));
      setNotice(
        result.registration.status === "CONFIRMED"
          ? "You're confirmed. Your pass is ready."
          : result.registration.status === "WAITLISTED"
            ? "You're on the waitlist. We'll show your position here."
            : "Application submitted for coordinator selection.",
      );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (selected)
    return (
      <Screen>
        <Button
          label="← Back to events"
          variant="ghost"
          onPress={() => {
            setSelected(null);
            setNotice(null);
            setError(null);
          }}
        />
        <Note message={error} />
        <Note message={notice} tone="good" />
        {!detail ? (
          <Loading label="Loading event…" />
        ) : (
          <>
            <Title
              eyebrow={detail.club.name}
              title={detail.event.title}
              subtitle={EVENT_TEMPLATE_LABELS[detail.event.template]}
            />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Badge
                label={statusLabel(detail.event.status)}
                tone={eventTone(detail.event.status)}
              />
              <Badge label={EVENT_AUDIENCE_LABELS[detail.event.audience]} />
            </View>
            <Card title="When & where">
              <Row label="Starts" value={when(detail.event.startsAt, tz)} />
              <Row label="Ends" value={when(detail.event.endsAt, tz)} />
              <Row label="Venue" value={detail.event.venueSummary ?? "To be announced"} />
              <Row
                label="Registration closes"
                value={when(detail.event.registrationClosesAt, tz)}
              />
              <Row label="Admission" value={ADMISSION_MODE_LABELS[detail.event.admissionMode]} />
              <Row
                label="Seats"
                value={
                  detail.seatsRemaining === null
                    ? `${detail.confirmedCount} confirmed / ${detail.event.capacity} capacity`
                    : `${detail.seatsRemaining} left of ${detail.event.capacity}`
                }
              />
            </Card>
            <Card title="About">
              <Muted>
                {detail.event.description || "The coordinator has not added a description yet."}
              </Muted>
            </Card>
            {detail.event.jobDescription && (
              <Card title="Job description">
                <Muted>{detail.event.jobDescription}</Muted>
              </Card>
            )}
            {detail.event.cancellationReason && (
              <Note message={`Cancelled: ${detail.event.cancellationReason}`} />
            )}
            {(detail.event.admissionMode === "QUIZ_TOP_N" ||
              detail.event.admissionMode === "QUIZ_FIRST_QUALIFIED") &&
              onOpenQuiz && (
                <Card title="Seats are decided by a quiz">
                  <Muted>
                    {detail.event.admissionMode === "QUIZ_TOP_N"
                      ? "Take the quiz before it closes. The highest scores get the seats once it is graded."
                      : "Take the quiz and reach the pass mark to claim a seat. Seats go to the first who qualify, until full."}
                  </Muted>
                  <Button
                    label="Open the quiz"
                    onPress={() => onOpenQuiz(detail.event.id, detail.event.title)}
                    testID="open-quiz"
                  />
                </Card>
              )}
            {detail.registration ? (
              <Card title="Your registration">
                <Badge
                  label={statusLabel(detail.registration.status)}
                  tone={detail.registration.status === "CONFIRMED" ? "good" : "warn"}
                />
                {detail.registration.queuePosition && (
                  <Muted>Waitlist position {detail.registration.queuePosition}</Muted>
                )}
                {detail.registration.status === "CONFIRMED" && (
                  <Button label="Open my pass" onPress={onOpenPasses} />
                )}
                {(detail.registration.status === "CONFIRMED" ||
                  detail.registration.status === "WAITLISTED" ||
                  detail.registration.status === "APPLIED") &&
                  detail.event.status !== "LIVE" &&
                  detail.event.status !== "COMPLETED" && (
                    <>
                      <Button
                        label={confirmWithdraw ? "Yes, give up my place" : "Give up my place"}
                        variant={confirmWithdraw ? "danger" : "ghost"}
                        disabled={busy}
                        onPress={() => {
                          if (confirmWithdraw) {
                            setConfirmWithdraw(false);
                            void withdraw();
                          } else setConfirmWithdraw(true);
                        }}
                        testID="withdraw"
                      />
                      {confirmWithdraw && (
                        <>
                          <Muted>
                            This cannot be undone from here, and your QR pass will stop working. Tap
                            again to confirm.
                          </Muted>
                          <Button
                            label="Keep my place"
                            variant="ghost"
                            onPress={() => setConfirmWithdraw(false)}
                          />
                        </>
                      )}
                    </>
                  )}
              </Card>
            ) : (
              <Card title="Join this event">
                {!detail.eligibility.eligible &&
                  detail.eligibility.reasons.map((r) => (
                    <Note
                      key={r}
                      tone="warn"
                      message={ELIGIBILITY_REASON_LABELS[r as EligibilityReason] ?? r}
                    />
                  ))}
                {!detail.eligibility.registrationOpen && (
                  <Muted>Registration is not open at this time.</Muted>
                )}
                {me?.user.accountType === "STAFF" ? (
                  <Muted>
                    Staff accounts organise and scan; participant registration is for students.
                  </Muted>
                ) : (
                  <Button
                    label="Register"
                    onPress={() => void register()}
                    busy={busy}
                    disabled={!detail.eligibility.canApply}
                    testID="register-event"
                  />
                )}
              </Card>
            )}
          </>
        )}
      </Screen>
    );

  const now = Date.now();
  const visible = events.filter(
    (e) =>
      filter === "all" ||
      (filter === "upcoming"
        ? new Date(e.endsAt).getTime() >= now && e.status !== "COMPLETED"
        : new Date(e.endsAt).getTime() < now || e.status === "COMPLETED"),
  );
  return (
    <Screen>
      <Title
        eyebrow={`Hi, ${me?.user.fullName.split(" ")[0] ?? "there"}`}
        title="What's happening on campus"
        subtitle="Find an event, register, and keep your pass handy."
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip
          label="Discover"
          selected={tab === "discover"}
          onPress={() => {
            setTab("discover");
            setHasMore(false);
          }}
        />
        <Chip
          label="My registrations"
          selected={tab === "mine"}
          onPress={() => {
            setTab("mine");
            setHasMore(false);
          }}
        />
      </View>
      {tab === "discover" && (
        <Card>
          <Field
            label="Search events"
            value={search}
            onChangeText={setSearch}
            placeholder="Event name"
          />
          <Button label="Search" variant="ghost" onPress={() => setAppliedSearch(search.trim())} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {(["all", "upcoming", "past"] as const).map((f) => (
              <Chip
                key={f}
                label={f === "all" ? "All" : f === "upcoming" ? "Upcoming" : "Past"}
                selected={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
          </ScrollView>
        </Card>
      )}
      <Note message={error} />
      {loading && (tab === "discover" ? events.length === 0 : registrations.length === 0) ? (
        <Loading />
      ) : (tab === "discover" ? visible.length === 0 : registrations.length === 0) ? (
        <Empty
          title={tab === "mine" ? "No registrations yet" : "No events found"}
          detail={
            tab === "mine"
              ? "Register for an event and it will appear here."
              : "Try another search or check back later."
          }
        />
      ) : tab === "discover" ? (
        visible.map((event) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            onPress={() => setSelected(event.id)}
          >
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Badge label={EVENT_TEMPLATE_LABELS[event.template]} tone="primary" />
                <Badge label={statusLabel(event.status)} tone={eventTone(event.status)} />
              </View>
              <Text style={{ fontSize: 19, fontWeight: "700", color: colors.ink }}>
                {event.title}
              </Text>
              <Muted>
                {when(event.startsAt, tz)} · {event.venueSummary ?? "Venue to be announced"}
              </Muted>
              <Text numberOfLines={2} style={{ color: colors.muted, lineHeight: 20 }}>
                {event.description}
              </Text>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>View event →</Text>
            </Card>
          </Pressable>
        ))
      ) : (
        registrations.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => setSelected(r.eventId)}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink, flex: 1 }}>
                  {r.event.title}
                </Text>
                <Badge
                  label={statusLabel(r.status)}
                  tone={
                    r.status === "CONFIRMED"
                      ? "good"
                      : r.status === "REJECTED" || r.status === "CANCELLED"
                        ? "bad"
                        : "warn"
                  }
                />
              </View>
              <Muted>
                {r.clubName} · {when(r.event.startsAt, tz)}
              </Muted>
              {r.queuePosition && <Muted>Waitlist position {r.queuePosition}</Muted>}
              {r.passRevokedAt && (
                <Note message="Your pass was revoked. Contact the coordinator." />
              )}
            </Card>
          </Pressable>
        ))
      )}
      {hasMore && !loading && (
        <Button
          label="Load more"
          variant="ghost"
          onPress={() => void load(tab === "discover" ? events.length : registrations.length)}
        />
      )}
    </Screen>
  );
}

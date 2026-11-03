import type { EventStatus } from "@campusops/shared/ui";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { Card, Empty, EventBadge, formatWhen } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/session";

export type DashboardData = {
  generatedAt: string;
  scope: "INSTITUTION" | "DEPARTMENT" | "CLUBS" | "PERSONAL";
  events: {
    total: number;
    live: number;
    upcoming: number;
    draft: number;
    pendingApprovals: number;
    completed: number;
  };
  registrations: { confirmed: number; waitlisted: number; applied: number };
  work: {
    approvalsPending: number;
    verificationPending: number;
    openComplaints: number;
    resourceHolds: number;
  };
  upcoming: Array<{
    id: string;
    title: string;
    status: EventStatus;
    startsAt: string;
    endsAt: string;
    venueSummary: string | null;
    capacity: number;
    clubName: string;
    confirmed: number;
  }>;
  confirmationTrend: Array<{ day: string; confirmed: number }>;
  approvalQueue: Array<{
    request: { id: string; title: string; dueAt: string | null };
    event: { id: string; title: string; startsAt: string };
    club: { name: string };
  }>;
};

const SCOPE_LABEL: Record<DashboardData["scope"], string> = {
  INSTITUTION: "Institution-wide",
  DEPARTMENT: "Your departments",
  CLUBS: "Your clubs",
  PERSONAL: "Your workload",
};

export function DashboardPanel({
  onNavigate,
  onOpenEvent,
}: { onNavigate: (tab: string) => void; onOpenEvent: (id: string) => void }) {
  const { me, isCoordinator, isClubMember, isStaff, isFaculty, isSenior } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api<DashboardData>("/me/dashboard"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = me?.user.fullName.split(" ")[0] ?? "there";

  if (loading) return <DashboardSkeleton />;
  if (error)
    return (
      <Card title="Dashboard">
        <p className="bad-note" role="alert">
          {error}
        </p>
        <button type="button" className="ghost" onClick={() => void load()}>
          <Icon name="refresh" size={15} /> Retry
        </button>
      </Card>
    );
  if (!data) return null;

  const total =
    data.registrations.confirmed + data.registrations.waitlisted + data.registrations.applied;
  const workItems = [
    isStaff && {
      icon: "inbox",
      tone: "tone-brand",
      label: "Approvals waiting on you",
      sub: "Decide or escalate individually",
      n: data.work.approvalsPending,
      tab: "approvals",
    },
    (isFaculty || isSenior) && {
      icon: "shield",
      tone: "tone-mint",
      label: "Students to verify",
      sub: "College ID checks in your scope",
      n: data.work.verificationPending,
      tab: "verification",
    },
    (isClubMember || isStaff) && {
      icon: "alert",
      tone: "tone-peach",
      label: "Open participant issues",
      sub: "Only events you organise/oversee",
      n: data.work.openComplaints,
      tab: "events",
    },
    {
      icon: "box",
      tone: "tone-sky",
      label: "Resource holds",
      sub: "Awaiting approval decisions",
      n: data.work.resourceHolds,
      tab: "resources",
    },
  ].filter(Boolean) as Array<{
    icon: string;
    tone: string;
    label: string;
    sub: string;
    n: number;
    tab: string;
  }>;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {SCOPE_LABEL[data.scope]} · updated{" "}
            {new Date(data.generatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <h1>
            {greeting}, {firstName}
          </h1>
          <p className="lead">
            Here is what needs your attention across events, approvals and campus resources.
          </p>
        </div>
        <div className="quick-actions">
          {isCoordinator && (
            <button type="button" onClick={() => onNavigate("events:new")}>
              <Icon name="plus" size={15} /> New event
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() => void load()}
            aria-label="Refresh dashboard"
          >
            <Icon name="refresh" size={15} /> Refresh
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <Stat
          label="Live right now"
          value={data.events.live}
          sub={`${data.events.upcoming} published & ready`}
          icon="spark"
          tone="tone-mint"
        />
        <Stat
          label="Upcoming events"
          value={data.events.upcoming}
          sub={`${data.events.draft} drafts · ${data.events.pendingApprovals} in approval`}
          icon="calendar"
          tone="tone-brand"
        />
        <Stat
          label="Confirmed registrations"
          value={data.registrations.confirmed}
          sub={`${data.registrations.waitlisted} waitlisted · ${data.registrations.applied} applied`}
          icon="users"
          tone="tone-sky"
          trend={data.confirmationTrend.map((d) => d.confirmed)}
        />
        <div className="stat-card accent">
          <div className="stat-top">
            <span className="stat-label">Needs attention</span>
            <span className="stat-icon">
              <Icon name="bell" size={18} />
            </span>
          </div>
          <div className="stat-value">
            {data.work.approvalsPending + data.work.verificationPending + data.work.openComplaints}
          </div>
          <div className="stat-sub">approvals · verifications · issues</div>
          <div className="progress" style={{ background: "rgba(255,255,255,.25)" }}>
            <span
              style={{
                width: `${total ? Math.min(100, Math.round((data.registrations.confirmed / total) * 100)) : 0}%`,
                background: "#fff",
              }}
            />
          </div>
          <div className="stat-sub">
            {total ? Math.round((data.registrations.confirmed / total) * 100) : 0}% of registrations
            confirmed
          </div>
        </div>
      </div>

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="stack">
          <Card
            title="Confirmed registrations · last 14 days"
            actions={
              <span className="badge info">
                {data.confirmationTrend.reduce((a, d) => a + d.confirmed, 0)} total
              </span>
            }
          >
            <TrendChart points={data.confirmationTrend} />
          </Card>
          <Card
            title="Upcoming & live events"
            actions={
              isCoordinator ? (
                <button type="button" className="link" onClick={() => onNavigate("events")}>
                  View all <Icon name="chevron" size={14} />
                </button>
              ) : undefined
            }
          >
            {data.upcoming.length === 0 ? (
              <Empty>
                No upcoming events in your scope. Published and ready events will appear here.
              </Empty>
            ) : (
              <div className="event-list">
                {data.upcoming.map((e) => {
                  const d = new Date(e.startsAt);
                  const pct = e.capacity
                    ? Math.min(100, Math.round((e.confirmed / e.capacity) * 100))
                    : 0;
                  return (
                    <div className="event-item" key={e.id}>
                      <div className="event-date">
                        <div>
                          <b>{d.getDate()}</b>
                          <span>{d.toLocaleString([], { month: "short" })}</span>
                        </div>
                      </div>
                      <div className="ev-body">
                        <b>{e.title}</b>
                        <p className="meta">
                          {e.clubName} · {formatWhen(e.startsAt)} · {e.venueSummary ?? "Venue TBA"}
                        </p>
                        <div
                          className="progress"
                          aria-label={`${e.confirmed} of ${e.capacity} seats confirmed`}
                        >
                          <span style={{ width: `${pct}%` }} />
                        </div>
                        <span className="hint">
                          {e.confirmed}/{e.capacity} seats confirmed
                        </span>
                      </div>
                      <div className="ev-side">
                        <EventBadge status={e.status} />
                        {isClubMember && (
                          <button
                            type="button"
                            className="ghost tiny"
                            onClick={() => onOpenEvent(e.id)}
                          >
                            Open <Icon name="arrow" size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Your work queue">
            <div className="work-list">
              {workItems.map((w) => (
                <button
                  type="button"
                  className="work-item"
                  key={w.label}
                  onClick={() => onNavigate(w.tab)}
                >
                  <span className={`stat-icon ${w.tone}`}>
                    <Icon name={w.icon} size={17} />
                  </span>
                  <span>
                    <b>{w.label}</b>
                    <span>{w.sub}</span>
                  </span>
                  <span className="n">{w.n}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Event pipeline">
            <Pipeline data={data} />
          </Card>
          <Card
            title="Next approvals"
            actions={
              isStaff ? (
                <button type="button" className="link" onClick={() => onNavigate("approvals")}>
                  Inbox <Icon name="chevron" size={14} />
                </button>
              ) : undefined
            }
          >
            {data.approvalQueue.length === 0 ? (
              <Empty>Nothing waiting on your decision.</Empty>
            ) : (
              <ul className="plain">
                {data.approvalQueue.map((a) => (
                  <li
                    key={a.request.id}
                    style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}
                  >
                    <strong>{a.request.title}</strong>
                    <div className="meta">
                      {a.event.title} · {a.club.name}
                      {a.request.dueAt ? ` · due ${formatWhen(a.request.dueAt)}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  tone,
  trend,
}: { label: string; value: number; sub: string; icon: string; tone: string; trend?: number[] }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="stat-value">{value.toLocaleString()}</div>
      {trend ? <Sparkline values={trend} /> : null}
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * 84},${30 - (v / max) * 26}`)
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 84 32" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `day` is a campus-calendar YYYY-MM-DD key, not an instant. Format the parts
 * directly so a viewer in any browser timezone sees the same campus day.
 */
function campusDayLabel(day: string) {
  const [, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`.trim();
}

function TrendChart({ points }: { points: Array<{ day: string; confirmed: number }> }) {
  const W = 720;
  const H = 220;
  const P = 32;
  const max = Math.max(1, ...points.map((p) => p.confirmed));
  const x = (i: number) => P + (i / Math.max(1, points.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const line = points.map((p, i) => `${x(i)},${y(p.confirmed)}`).join(" ");
  const area = `${P},${H - P} ${line} ${W - P},${H - P}`;
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t)))].map(
    (n) => n / max,
  );
  const empty = points.every((p) => p.confirmed === 0);
  return (
    <div className="chart-card">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Confirmed registrations per day for the last 14 days; maximum ${max} in a day`}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={P}
              x2={W - P}
              y1={y(max * t)}
              y2={y(max * t)}
              stroke="var(--line)"
              strokeDasharray="4 5"
            />
            <text x={P - 8} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        <polygon points={area} fill="url(#trendFill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <g key={p.day}>
            <circle
              cx={x(i)}
              cy={y(p.confirmed)}
              r={p.confirmed ? 4 : 2.5}
              fill="var(--surface)"
              stroke="var(--brand)"
              strokeWidth="2"
            >
              <title>
                {p.day}: {p.confirmed} confirmed
              </title>
            </circle>
            {(i % 2 === 0 || i === points.length - 1) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {campusDayLabel(p.day)}
              </text>
            )}
          </g>
        ))}
      </svg>
      {empty && (
        <p className="hint" style={{ textAlign: "center" }}>
          No confirmations recorded in this window yet. The chart fills as students register.
        </p>
      )}
    </div>
  );
}

function Pipeline({ data }: { data: DashboardData }) {
  const rows = [
    { label: "Draft", n: data.events.draft, color: "var(--muted)" },
    { label: "In approval", n: data.events.pendingApprovals, color: "var(--warn)" },
    { label: "Published / ready", n: data.events.upcoming, color: "var(--brand)" },
    { label: "Live", n: data.events.live, color: "var(--good)" },
    { label: "Completed", n: data.events.completed, color: "var(--info)" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="donut-legend" style={{ gap: 12 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gap: 4 }}>
          <div>
            <span>
              <i style={{ background: r.color }} />
              {r.label}
            </span>
            <strong>{r.n}</strong>
          </div>
          <div className="progress">
            <span style={{ width: `${(r.n / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="skeleton" style={{ height: 34, width: 320, marginBottom: 20 }} />
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 130 }} />
        ))}
      </div>
      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="skeleton" style={{ height: 320 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    </div>
  );
}

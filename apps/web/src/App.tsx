import {
  Component,
  type ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToastProvider } from "./components/feedback";
import { Icon, Logo } from "./components/icons";
import { Card } from "./components/ui";
import { AuthPanel } from "./features/AuthPanel";
import { type DashboardData, DashboardPanel } from "./features/DashboardPanel";
import { type Page, api, query } from "./lib/api";
import { SessionProvider, useSession } from "./lib/session";
import type { EventRow } from "./lib/types";

const AccountPanel = lazy(() =>
  import("./features/AccountPanel").then((m) => ({ default: m.AccountPanel })),
);
const AdminPanel = lazy(() =>
  import("./features/AdminPanel").then((m) => ({ default: m.AdminPanel })),
);
const ApprovalsPanel = lazy(() =>
  import("./features/ApprovalsPanel").then((m) => ({ default: m.ApprovalsPanel })),
);
const ClubsPanel = lazy(() =>
  import("./features/ClubsPanel").then((m) => ({ default: m.ClubsPanel })),
);
const CoordinatorPanel = lazy(() =>
  import("./features/CoordinatorPanel").then((m) => ({ default: m.CoordinatorPanel })),
);
const ReportsPanel = lazy(() =>
  import("./features/ReportsPanel").then((m) => ({ default: m.ReportsPanel })),
);
const ResourcesPanel = lazy(() =>
  import("./features/ResourcesPanel").then((m) => ({ default: m.ResourcesPanel })),
);
const VerificationPanel = lazy(() =>
  import("./features/VerificationPanel").then((m) => ({ default: m.VerificationPanel })),
);

type Health = { status: string; phase: number; checks: { database: string } };
type Config = {
  demoMode: boolean;
  emailMode: string | null;
  exposeDemoOtp: boolean;
  storageMode: string;
};
type Tab =
  | "dashboard"
  | "events"
  | "approvals"
  | "verification"
  | "resources"
  | "clubs"
  | "reports"
  | "admin"
  | "account";
const TAB_META: Record<
  Tab,
  { label: string; icon: string; group: "Workspace" | "Institution" | "You" }
> = {
  dashboard: { label: "Dashboard", icon: "dashboard", group: "Workspace" },
  events: { label: "Events", icon: "calendar", group: "Workspace" },
  approvals: { label: "Approvals", icon: "inbox", group: "Workspace" },
  verification: { label: "Student verification", icon: "shield", group: "Workspace" },
  resources: { label: "Resources", icon: "box", group: "Institution" },
  clubs: { label: "Clubs", icon: "users", group: "Institution" },
  reports: { label: "Reports", icon: "file", group: "Institution" },
  admin: { label: "Administration", icon: "settings", group: "Institution" },
  account: { label: "Account", icon: "user", group: "You" },
};
const SECTION_LEDE: Record<Tab, string> = {
  dashboard: "",
  events: "Draft, submit for individual approvals, publish, run and report on your club's events.",
  approvals:
    "Each permission is decided separately. Approve, request changes, or escalate up the chain.",
  verification:
    "Verify college students' IDs and keep their profiles accurate. Only faculty may verify.",
  resources: "Rooms, labs and equipment with conflict-free holds enforced by the database.",
  clubs: "Club structure, coordinators and club faculty. HOD/Dean owns faculty membership.",
  reports: "Instant, immutable PDF event reports: approvals trail, resource usage and attendance.",
  admin: "Institutional authority: users, roles, departments and maintenance jobs.",
  account: "Your profile, roles, password and active sessions.",
};
const TABS = Object.keys(TAB_META) as Tab[];
const isTab = (v: string): v is Tab => (TABS as string[]).includes(v);
const tabFromHash = (): Tab | null => {
  const h = location.hash.replace(/^#\/?/, "").split("/")[0] ?? "";
  return isTab(h) ? h : null;
};

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </ToastProvider>
    </SessionProvider>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("campusops-theme");
    if (saved === "light" || saved === "dark") return saved;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("campusops-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) };
}

function Shell() {
  const session = useSession();
  const {
    me,
    loading,
    isCoordinator,
    isClubMember,
    isStaff,
    isFaculty,
    isSenior,
    isAdmin,
    signIn,
    signOut,
  } = session;
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [tab, setTab] = useState<Tab | null>(tabFromHash);
  const [drawer, setDrawer] = useState(false);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [dashTick, setDashTick] = useState(0);
  const [focusEvent, setFocusEvent] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<EventRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadMeta = useCallback(() => {
    api<Health>("/health/ready")
      .then(setHealth)
      .catch(() => setHealth(null));
    api<Config>("/config")
      .then(setConfig)
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadMeta();
    const t = setInterval(loadMeta, 60_000);
    return () => clearInterval(t);
  }, [loadMeta]);
  useEffect(() => {
    const on = () => setTab(tabFromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setResults(null);
        setNotifOpen(false);
        setDrawer(false);
      }
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !me) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api<Page<EventRow>>(`/events${query({ q, limit: 6 })}`)
        .then((p) => setResults(p.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, me]);

  const available = useMemo(() => {
    const list: Tab[] = ["dashboard"];
    if (isClubMember) list.push("events");
    if (isStaff) list.push("approvals");
    if (isFaculty || isSenior) list.push("verification");
    list.push("resources");
    if (isClubMember || isStaff) list.push("clubs", "reports");
    if (isAdmin) list.push("admin");
    list.push("account");
    return list;
  }, [isClubMember, isStaff, isFaculty, isSenior, isAdmin]);
  const allowed = new Set(available);
  const active: Tab = tab && allowed.has(tab) ? tab : "dashboard";
  const mayUseConsole = isStaff || isClubMember;
  // biome-ignore lint/correctness/useExhaustiveDependencies: dashTick is the manual refresh trigger
  useEffect(() => {
    if (!me) return;
    api<DashboardData>("/me/dashboard")
      .then(setDash)
      .catch(() => {});
  }, [me, dashTick]);

  const navigate = useCallback((next: string) => {
    setDrawer(false);
    setNotifOpen(false);
    setResults(null);
    setSearch("");
    if (next === "events:new") {
      setTab("events");
      location.hash = "/events";
      setNewDraft((n) => n + 1);
      return;
    }
    if (isTab(next)) {
      setTab(next);
      location.hash = `/${next}`;
    }
  }, []);
  const openEvent = useCallback(
    (id: string) => {
      setFocusEvent(id);
      navigate("events");
    },
    [navigate],
  );

  async function onAuthenticated(token: string) {
    await signIn(token);
    setTab(null);
    location.hash = "/dashboard";
  }

  const themeBtn = (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      title="Toggle theme"
    >
      <Icon name={theme === "light" ? "moon" : "sun"} size={17} />
    </button>
  );

  if (loading)
    return (
      <div className="auth-panel" style={{ minHeight: "100vh" }}>
        <Card title="CampusOps">
          <p className="meta">Restoring your session…</p>
          <div className="skeleton" style={{ height: 12, width: "70%" }} />
        </Card>
      </div>
    );

  if (!me)
    return (
      <div className="auth-layout">
        <a className="skip-link" href="#auth-form">
          Skip to sign in
        </a>
        <aside className="auth-hero">
          <Logo />
          <div>
            <p className="eyebrow" style={{ color: "#c7c4ff" }}>
              Management console
            </p>
            <h1>Run every campus event from one calm workspace.</h1>
            <p>
              Plan events, route individual approvals, allocate rooms and equipment, publish
              coordinator-defined QR passes, and close the loop with instant PDF reports.
            </p>
            <div className="hero-cards">
              <div className="hero-card">
                <b>1 workflow</b>
                <span>draft → approvals → publish → live → report</span>
              </div>
              <div className="hero-card">
                <b>4 QR types</b>
                <span>one-time · toggle · counted · unlimited</span>
              </div>
              <div className="hero-card">
                <b>0 double bookings</b>
                <span>database-enforced resource holds</span>
              </div>
            </div>
          </div>
          <p className="hint" style={{ color: "rgba(255,255,255,.55)" }}>
            Students take part in the CampusOps mobile app. This console is for coordinators,
            faculty, HOD/Dean and Admin.
          </p>
        </aside>
        <div className="auth-panel" id="auth-form">
          <div className="auth-top">{themeBtn}</div>
          <AuthPanel config={config} onAuthenticated={onAuthenticated} />
        </div>
      </div>
    );

  if (!mayUseConsole)
    return (
      <div className="auth-panel" style={{ minHeight: "100vh" }}>
        <Card title="This console is for staff and club coordinators" actions={themeBtn}>
          <p className="lead">
            Your account does not coordinate a club and has no staff role, so there is nothing for
            you to manage here.
          </p>
          <p className="meta">
            Use the CampusOps mobile app to browse events, register, get your entry QR and report an
            issue. If you believe you should have access, ask your club lead, your department&apos;s
            HOD/Dean, or the administrator.
          </p>
          <button type="button" className="ghost" onClick={() => signOut(false)}>
            <Icon name="logout" size={15} /> Sign out
          </button>
        </Card>
      </div>
    );

  const initials = me.user.fullName
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const roleLabel = isAdmin
    ? "Admin"
    : isSenior
      ? "HOD/Dean"
      : isFaculty
        ? "Faculty"
        : "Club coordinator";
  const attention = dash
    ? dash.work.approvalsPending + dash.work.verificationPending + dash.work.openComplaints
    : 0;
  const groups = ["Workspace", "Institution", "You"] as const;

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {drawer && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Primary">
        <button
          type="button"
          className="link"
          style={{ padding: "4px 8px 18px", justifyContent: "flex-start" }}
          onClick={() => navigate("dashboard")}
          aria-label="CampusOps dashboard"
        >
          <Logo />
        </button>
        <nav className="tabs" aria-label="Sections">
          {groups.map((g) => {
            const items = available.filter((t) => TAB_META[t].group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="nav-label">{g}</div>
                {items.map((t) => {
                  const count =
                    t === "approvals"
                      ? dash?.work.approvalsPending
                      : t === "verification"
                        ? dash?.work.verificationPending
                        : undefined;
                  return (
                    <button
                      key={t}
                      type="button"
                      className={active === t ? "active" : ""}
                      aria-current={active === t ? "page" : undefined}
                      onClick={() => navigate(t)}
                    >
                      <Icon name={TAB_META[t].icon} size={18} />
                      {TAB_META[t].label}
                      {count ? <span className="nav-count">{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-card">
            <strong>
              <span className={`status-dot ${health ? "" : "bad"}`} />
              {health ? "All systems connected" : "API unreachable"}
            </strong>
            <div className="status-bar">
              <span>
                DB <strong>{health?.checks.database ?? "—"}</strong>
              </span>
              <span>
                Email <strong>{config?.emailMode ?? "—"}</strong>
              </span>
              <span>
                Files <strong>{config?.storageMode ?? "—"}</strong>
              </span>
            </div>
            {config?.demoMode && (
              <span className="badge warn" style={{ marginTop: 8 }}>
                Demo mode
              </span>
            )}
          </div>
          <div className="sidebar-user">
            <span className="avatar">{initials}</span>
            <span className="who">
              <b>{me.user.fullName}</b>
              <span>{roleLabel}</span>
            </span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 34, height: 34 }}
              aria-label="Sign out"
              title="Sign out"
              onClick={() => signOut(false)}
            >
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" size={18} />
          </button>
          <div className="crumb">
            CampusOps <Icon name="chevron" size={14} /> <b>{TAB_META[active].label}</b>
          </div>
          <div className="searchbox">
            <Icon name="search" size={16} className="search-icon" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search events…"
              aria-label="Search events"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>Ctrl K</kbd>
            {results && (
              <div
                className="popover"
                style={{ left: 0, right: "auto", width: "100%" }}
                aria-label="Event search results"
              >
                <h4>
                  {searching
                    ? "Searching…"
                    : `${results.length} event${results.length === 1 ? "" : "s"}`}
                </h4>
                {results.length === 0 && !searching && (
                  <p className="meta" style={{ padding: "0 10px 8px" }}>
                    No visible events match.
                  </p>
                )}
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="popover-item"
                    onClick={() => (isClubMember ? openEvent(r.id) : navigate("reports"))}
                  >
                    <span className="pi-icon tone-brand">
                      <Icon name="calendar" size={16} />
                    </span>
                    <span>
                      <b>{r.title}</b>
                      <span>
                        {new Date(r.startsAt).toLocaleDateString()} ·{" "}
                        {r.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="topbar-group">
            {themeBtn}
            <button
              type="button"
              className="icon-btn"
              aria-label={`Notifications${attention ? `, ${attention} need attention` : ""}`}
              aria-expanded={notifOpen}
              onClick={() => setNotifOpen((o) => !o)}
            >
              <Icon name="bell" size={17} />
              {attention > 0 && <span className="dot" />}
            </button>
            {notifOpen && (
              <div className="popover">
                <h4>Needs attention</h4>
                {attention === 0 && (
                  <p className="meta" style={{ padding: "0 10px 8px" }}>
                    You are all caught up.
                  </p>
                )}
                {isStaff && dash && dash.work.approvalsPending > 0 && (
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => navigate("approvals")}
                  >
                    <span className="pi-icon tone-brand">
                      <Icon name="inbox" size={16} />
                    </span>
                    <span>
                      <b>
                        {dash.work.approvalsPending} approval
                        {dash.work.approvalsPending === 1 ? "" : "s"} awaiting your decision
                      </b>
                      <span>Open the approvals inbox</span>
                    </span>
                  </button>
                )}
                {(isFaculty || isSenior) && dash && dash.work.verificationPending > 0 && (
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => navigate("verification")}
                  >
                    <span className="pi-icon tone-mint">
                      <Icon name="shield" size={16} />
                    </span>
                    <span>
                      <b>
                        {dash.work.verificationPending} student
                        {dash.work.verificationPending === 1 ? "" : "s"} to verify
                      </b>
                      <span>College ID checks in your scope</span>
                    </span>
                  </button>
                )}
                {dash && dash.work.openComplaints > 0 && (
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => navigate(isClubMember ? "events" : "reports")}
                  >
                    <span className="pi-icon tone-peach">
                      <Icon name="alert" size={16} />
                    </span>
                    <span>
                      <b>
                        {dash.work.openComplaints} open participant issue
                        {dash.work.openComplaints === 1 ? "" : "s"}
                      </b>
                      <span>Event complaint inboxes</span>
                    </span>
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              className="avatar"
              style={{ border: "1px solid var(--line)", cursor: "pointer" }}
              aria-label="Account settings"
              onClick={() => navigate("account")}
            >
              {initials}
            </button>
          </div>
        </header>

        <main id="main-content" className="content">
          {me.user.status !== "ACTIVE" && (
            <p className="warn-note">
              Your account status is {me.user.status.replace(/_/g, " ")}. Some actions are
              unavailable until it is active.
            </p>
          )}
          {active !== "dashboard" && (
            <div className="page-head">
              <div>
                <p className="eyebrow">{TAB_META[active].group}</p>
                <h1>{TAB_META[active].label}</h1>
                <p className="lead">{SECTION_LEDE[active]}</p>
              </div>
            </div>
          )}
          <ErrorBoundary key={active}>
            <Suspense
              fallback={
                <div aria-busy="true">
                  <div className="skeleton" style={{ height: 28, width: 240, marginBottom: 16 }} />
                  <div className="skeleton" style={{ height: 220 }} />
                </div>
              }
            >
              {active === "dashboard" && (
                <DashboardPanel onNavigate={navigate} onOpenEvent={openEvent} />
              )}
              {active === "events" && isClubMember && (
                <CoordinatorPanel
                  focusEventId={focusEvent}
                  onFocusConsumed={() => setFocusEvent(null)}
                  newDraftSignal={newDraft}
                />
              )}
              {active === "approvals" && isStaff && <ApprovalsPanel />}
              {active === "verification" && (isFaculty || isSenior) && <VerificationPanel />}
              {active === "resources" && <ResourcesPanel />}
              {active === "clubs" && (isClubMember || isStaff) && <ClubsPanel />}
              {active === "reports" && (isClubMember || isStaff) && <ReportsPanel />}
              {active === "admin" && isAdmin && <AdminPanel />}
              {active === "account" && <AccountPanel />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <Card title="Something went wrong in this screen">
          <p className="bad-note" role="alert">
            {this.state.error.message}
          </p>
          <p className="meta">
            Your data is safe. Reload the screen; if it keeps happening, share the request id from
            the API response with the administrator.
          </p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </Card>
      );
    return this.props.children;
  }
}

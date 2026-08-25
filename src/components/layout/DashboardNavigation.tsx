// @refresh reset
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  HomeIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BookOpenIcon,
  ChartBarIcon,
  CogIcon,
  BuildingOfficeIcon,
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  DocumentChartBarIcon,
  UserIcon,
  BellIcon,
  EnvelopeIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  SignalIcon,
  TrophyIcon,
  ShieldCheckIcon,
  CodeBracketIcon,
  RocketLaunchIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  VideoCameraIcon,
  UserPlusIcon,
  FireIcon,
  ArchiveBoxIcon,
  CommandLineIcon,
  CreditCardIcon,
  ChatBubbleLeftEllipsisIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  BeakerIcon,
  BoltIcon,
  QuestionMarkCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ExclamationTriangleIcon,
  DocumentDuplicateIcon,
} from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";
import ViewAsSwitcher from "./ViewAsSwitcher";
import NotificationDropdown from "@/components/notifications/NotificationDropdown";
import MobileNavSheet from "@/components/mobile/MobileNavSheet";

// ── Types ────────────────────────────────────────────────────────────────────
type NavItem = { name: string; href: string; icon: any };
type NavDivider = { divider: true; label: string };
type NavEntry = NavItem | NavDivider;

function isDivider(e: NavEntry): e is NavDivider {
  return "divider" in e;
}

function isNavActive(pathname: string, href: string) {
  const targetPath = href.split("?")[0].replace(/\/$/, "") || "/";
  const currentPath = pathname.replace(/\/$/, "") || "/";
  if (targetPath === "/dashboard") return currentPath === targetPath;
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export default function DashboardNavigation() {
  const { profile, user, profileLoading, isLoading, signingOut, signOut } =
    useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMinimal = searchParams.get("minimal") === "true";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [lmsSettings, setLmsSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleNativeBack = (event: Event) => {
      if (!mobileOpen) return;
      event.preventDefault();
      setMobileOpen(false);
    };
    window.addEventListener("rillcod:native-back", handleNativeBack);
    return () =>
      window.removeEventListener("rillcod:native-back", handleNativeBack);
  }, [mobileOpen]);

  useEffect(() => {
    if (isMinimal) return;
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, isMinimal]);

  // Edge swipe opens the menu on Android-style layouts.
  // Disabled on iOS Safari — the leading edge is reserved for system Back (HIG).
  useEffect(() => {
    if (isMinimal || typeof window === "undefined") return;

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (event: TouchEvent) => {
      if (window.innerWidth >= 768 || mobileOpen) return;
      const touch = event.touches[0];
      if (!touch) return;
      const rtl = getComputedStyle(document.documentElement).direction === "rtl";
      const fromLeadingEdge = rtl
        ? touch.clientX > window.innerWidth - 24
        : touch.clientX < 24;
      if (!fromLeadingEdge) return;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    };

    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const rtl = getComputedStyle(document.documentElement).direction === "rtl";
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      const opened = rtl ? dx < -64 && dy < 48 : dx > 64 && dy < 48;
      if (opened) setMobileOpen(true);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isMinimal, mobileOpen]);

  useEffect(() => {
    if (isMinimal || !profile) return;
    const db = createClient();

    const isStaff = ["admin", "teacher", "school"].includes(profile.role);
    let waQuery = db.from("whatsapp_conversations").select("unread_count");
    if (isStaff) {
      if (profile.role === "teacher") {
        waQuery = waQuery.eq("assigned_staff_id", profile.id);
      }
    } else {
      waQuery = waQuery.eq("portal_user_id", profile.id);
    }

    Promise.all([
      waQuery,
      db
        .from("newsletter_delivery" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_viewed", false),
      db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("is_read", false),
      db.from("app_settings").select("key, value"),
    ]).then(([waRes, nwlRes, notifRes, settingsRes]) => {
      const waCount = (waRes.data ?? []).reduce(
        (sum: number, c: any) => sum + (c.unread_count || 0),
        0
      );
      const nc = notifRes.count ?? 0;
      const total = waCount + (nwlRes.count ?? 0) + nc;
      setUnreadCount(total);
      setNotifUnread(nc);

      const settingsMap: Record<string, string> = {};
      (settingsRes.data ?? []).forEach((s) => {
        settingsMap[s.key] = s.value;
      });
      setLmsSettings(settingsMap);
    });
  }, [profile?.id, isMinimal]); // eslint-disable-line

  if (isMinimal) return null;

  // Full-screen feedback while logout clears cookies + local session
  if (signingOut) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md px-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl space-y-3">
          <div className="mx-auto h-9 w-9 rounded-full border-2 border-rose-500/30 border-t-rose-500 animate-spin" />
          <p className="text-sm font-semibold text-foreground">
            Signing you out…
          </p>
          <p className="text-xs text-muted-foreground">
            Clearing your session so you won&apos;t stay logged in.
          </p>
        </div>
      </div>
    );
  }

  // Before full nav: show session status clearly (loading vs signed out)
  if (!profile) {
    const stillSignedIn = !!(user || profileLoading || isLoading);
    const emailHint =
      user?.email ||
      (typeof user?.user_metadata?.email === "string"
        ? user.user_metadata.email
        : null);

    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-sidebar border-b border-sidebar-foreground/10 min-h-14 flex items-center justify-between gap-3 px-4 sm:px-6 py-2">
        <div className="min-w-0 flex items-center gap-3">
          <span className="text-sidebar-foreground/40 text-[10px] font-black uppercase tracking-widest shrink-0">
            Rillcod
          </span>
          {stillSignedIn ? (
            <div className="min-w-0 flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-sidebar-foreground truncate">
                  {isLoading || profileLoading
                    ? "Still signed in — loading your account…"
                    : "Signed in"}
                </p>
                {emailHint && (
                  <p className="text-[10px] text-sidebar-foreground/50 truncate font-mono">
                    {emailHint}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-sidebar-foreground/45">
              Not signed in
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {stillSignedIn ? (
            <button
              type="button"
              onClick={() => {
                void signOut();
              }}
              disabled={signingOut}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-rose-700/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white text-xs sm:text-sm font-bold rounded-xl border border-rose-500/20 transition-all disabled:opacity-60"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Sign out
            </button>
          ) : (
            <a
              href="/login"
              className="text-xs font-bold text-primary hover:text-violet-700 dark:hover:text-violet-300 transition-colors underline underline-offset-2"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Nav entries per role ────────────────────────────────────────────────────
  const getNavEntries = (): NavEntry[] => {
    const base: NavItem[] = [
      { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
      {
        name: "Help Requests",
        href: "/dashboard/cases",
        icon: ChatBubbleLeftEllipsisIcon,
      },
    ];

    const filterEntries = (entries: NavEntry[]) => {
      const isGamificationOff =
        lmsSettings.lms_gamification_enabled === "false";
      return entries.filter((e) => {
        if (isDivider(e)) return true;
        if (
          isGamificationOff &&
          [
            "Gamification",
            "Leaderboard",
            "Practice & Community",
            "Study Groups",
          ].includes(e.name)
        )
          return false;
        return true;
      });
    };

    switch (profile.role) {
      // ─────────────────────────────────────────────────────────────────────────
      // ADMIN — Platform manager. Sees everything. Owns operations.
      // ─────────────────────────────────────────────────────────────────────────
      case "admin":
        return filterEntries([
          { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
          { divider: true, label: "Office" },
          {
            name: "Office Center",
            href: "/dashboard/office",
            icon: BuildingOfficeIcon,
          },
          {
            name: "Help Requests",
            href: "/dashboard/office?workspace=cases",
            icon: ChatBubbleLeftEllipsisIcon,
          },
          {
            name: "Contact Directory",
            href: "/dashboard/customer-book",
            icon: ClipboardDocumentListIcon,
          },
          { divider: true, label: "People" },
          {
            name: "Records",
            href: "/dashboard/records",
            icon: ClipboardDocumentListIcon,
          },
          {
            name: "Schools",
            href: "/dashboard/schools",
            icon: BuildingOfficeIcon,
          },
          {
            name: "Teachers",
            href: "/dashboard/teachers",
            icon: AcademicCapIcon,
          },
          {
            name: "Students",
            href: "/dashboard/students",
            icon: UserGroupIcon,
          },
          { name: "Parents", href: "/dashboard/parents", icon: UserPlusIcon },
          { name: "Users", href: "/dashboard/users", icon: ShieldCheckIcon },
          {
            name: "Approvals",
            href: "/dashboard/approvals",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Resend Credentials",
            href: "/dashboard/students/resend-credentials",
            icon: EnvelopeIcon,
          },
          {
            name: "Card Studio",
            href: "/dashboard/card-studio",
            icon: CreditCardIcon,
          },

          { divider: true, label: "Academic Office" },
          {
            name: "0 · Overview",
            href: "/dashboard/academic",
            icon: ShieldCheckIcon,
          },
          // Curriculum lane, in the order of src/lib/academic/lanes.ts.
          {
            name: "1 · Build",
            href: "/dashboard/academic/build",
            icon: BookOpenIcon,
          },
          {
            // Certify, distribute and timing were three pages, but publishing already
            // performs the rollout — they were never three decisions, only three screens.
            name: "2 · Rollout",
            href: "/dashboard/academic/rollout",
            icon: ShieldCheckIcon,
          },
          {
            // Setup, not a step. Programmes and courses are created once and then left alone,
            // so numbering this ahead of Build implied a task to repeat for every curriculum.
            // The page keeps its full create/edit/delete function — only its place changed.
            name: "Programmes & Courses",
            href: "/dashboard/programs",
            icon: PresentationChartLineIcon,
          },
          {
            name: "Guide",
            href: "/dashboard/academic/guide",
            icon: DocumentTextIcon,
          },
          // ── Lane B — delivery to a class, in the order of src/lib/academic/lanes.ts.
          // Kept apart from the curriculum lane above: these follow a class through the
          // term, whereas the numbered steps build the curriculum the class teaches.
          //
          // The lane's own steps lead, then the tools that support them. Its last two
          // steps live in later sections where they group with related work:
          // Evidence is "Gradebook & Reports" under Assessment, and Results is
          // "Write report cards" under Reports & Analytics.
          { divider: true, label: "Delivery" },
          {
            // Lane B steps 1 and 2 — plan the class, then teach it.
            name: "Classes",
            href: "/dashboard/classes",
            icon: UserGroupIcon,
          },
          {
            // Lane B step 3 — coverage of what has actually been taught.
            name: "Learner Progress",
            href: "/dashboard/learner-progress",
            icon: ChartBarIcon,
          },
          { name: "Courses", href: "/dashboard/courses", icon: BookOpenIcon },
          {
            name: "Timetable",
            href: "/dashboard/timetable",
            icon: CalendarDaysIcon,
          },
          {
            name: "Live Sessions",
            href: "/dashboard/live-sessions",
            icon: VideoCameraIcon,
          },
          {
            name: "Special Programmes",
            href: "/dashboard/special-programs",
            icon: SparklesIcon,
          },
          {
            // Seven pages existed here with no link to any of them. The only
            // mention of /dashboard/progression outside its own folder was the
            // permission list, so the whole subsystem was reachable only by
            // typing the URL — which is why its 21,354-project catalogue has
            // never been used once. It is not part of the curriculum spine: the
            // spine carries a course week by week, this carries the practical
            // build that goes with it, keyed by track and year/term/week. They
            // meet in `assignments`, where both eventually write.
            name: "Practical Projects",
            href: "/dashboard/learner-progress?view=projects",
            icon: BeakerIcon,
          },
          { divider: true, label: "Assessment" },
          {
            name: "Grading Queue",
            href: "/dashboard/grading",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Gradebook & Reports",
            href: "/dashboard/grades",
            icon: ChartBarIcon,
          },
          {
            name: "Grading Guide",
            href: "/dashboard/grades/waec",
            icon: DocumentTextIcon,
          },
          // "Publish & Share" appeared twice in the admin sidebar, in two
          // different sections, both pointing here. It is kept once, beside
          // Report Builder, which is where results are actually prepared.
          {
            name: "Certificates",
            href: "/dashboard/certificates/management",
            icon: TrophyIcon,
          },

          { divider: true, label: "Engagement" },
          {
            name: "Class Engagement",
            href: "/dashboard/engagement",
            icon: BoltIcon,
          },
          {
            name: "Gamification",
            href: "/dashboard/gamification",
            icon: FireIcon,
          },
          {
            name: "Leaderboard",
            href: "/dashboard/leaderboard",
            icon: TrophyIcon,
          },
          {
            name: "Showcase Board",
            href: "/dashboard/showcase",
            icon: SignalIcon,
          },
          {
            name: "Code Playground",
            href: "/dashboard/playground",
            icon: CodeBracketIcon,
          },
          {
            name: "Study Groups",
            href: "/dashboard/study-groups",
            icon: UserGroupIcon,
          },
          {
            name: "Practice & Community",
            href: "/dashboard/activity-hub",
            icon: SparklesIcon,
          },

          { divider: true, label: "Reports & Analytics" },
          {
            name: "Write",
            href: "/dashboard/reports/builder",
            icon: DocumentTextIcon,
          },
          {
            name: "Publish",
            href: "/dashboard/results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "Auto-fill",
            href: "/dashboard/academic/results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "Accountability",
            href: "/dashboard/accountability",
            icon: ClipboardDocumentListIcon,
          },
          {
            name: "Email & Messaging",
            href: "/dashboard/email-log",
            icon: EnvelopeIcon,
          },
          {
            name: "School Reports",
            href: "/dashboard/school-reports",
            icon: DocumentChartBarIcon,
          },
          { divider: true, label: "Learner Support" },
          {
            name: "Learner Safety",
            href: "/dashboard/learner-safety",
            icon: ShieldCheckIcon,
          },

          { divider: true, label: "Finance" },
          {
            name: "Finance Center",
            href: "/dashboard/finance",
            icon: BanknotesIcon,
          },
          {
            name: "Partnerships",
            href: "/dashboard/partnerships",
            icon: DocumentDuplicateIcon,
          },

          { divider: true, label: "Danger zone" },
          {
            name: "Roster repair & cleanup",
            href: "/dashboard/classes/heal",
            icon: ExclamationTriangleIcon,
          },
          {
            name: "Deletion Requests",
            href: "/dashboard/account-deletion-requests",
            icon: ExclamationTriangleIcon,
          },

          { divider: true, label: "Platform" },
          {
            name: "Activity & Audit Trail",
            href: "/dashboard/activity-logs",
            icon: ClipboardDocumentListIcon,
          },
          {
            name: "Platform Configuration",
            href: "/dashboard/platform-operations",
            icon: CogIcon,
          },
          {
            name: "Consent Forms",
            href: "/dashboard/consent-forms",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Parent QR Claims",
            href: "/dashboard/parent-claims",
            icon: ShieldCheckIcon,
          },

          { divider: true, label: "Account" },
          {
            name: "Notifications",
            href: "/dashboard/notifications",
            icon: BellIcon,
          },
          {
            name: "Account Settings",
            href: "/dashboard/settings",
            icon: UserIcon,
          },
        ]);

      // ─────────────────────────────────────────────────────────────────────────
      // TEACHER — One class at a time. Teach, mark, write the report, talk to
      // the family. Office, CRM, finance, card studio, registration queues and
      // student-game surfaces stay off this map even when the route still exists.
      // ─────────────────────────────────────────────────────────────────────────
      case "teacher":
        return filterEntries([
          { name: "Dashboard", href: "/dashboard", icon: HomeIcon },

          { divider: true, label: "Teaching" },
          {
            name: "My Classes",
            href: "/dashboard/classes",
            icon: UserGroupIcon,
          },
          {
            name: "Class progress",
            href: "/dashboard/learner-progress?view=delivery",
            icon: ChartBarIcon,
          },
          {
            name: "Approvals",
            href: "/dashboard/teaching/approvals",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Library",
            href: "/dashboard/library",
            icon: ArchiveBoxIcon,
          },

          { divider: true, label: "Schedule" },
          {
            name: "Timetable",
            href: "/dashboard/timetable",
            icon: CalendarDaysIcon,
          },
          {
            name: "Attendance",
            href: "/dashboard/attendance",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Live Sessions",
            href: "/dashboard/live-sessions",
            icon: VideoCameraIcon,
          },

          { divider: true, label: "Assessment" },
          {
            name: "Mark work",
            href: "/dashboard/grades",
            icon: ChartBarIcon,
          },

          { divider: true, label: "People" },
          {
            name: "Students",
            href: "/dashboard/students",
            icon: UserGroupIcon,
          },
          { name: "Parents", href: "/dashboard/parents", icon: UserPlusIcon },
          {
            name: "Inbox",
            href: "/dashboard/inbox",
            icon: ChatBubbleLeftRightIcon,
          },

          { divider: true, label: "Reports" },
          {
            name: "Results",
            href: "/dashboard/academic/results",
            icon: DocumentChartBarIcon,
          },

          { divider: true, label: "Account" },
          {
            name: "Notifications",
            href: "/dashboard/notifications",
            icon: BellIcon,
          },
          {
            name: "Account Settings",
            href: "/dashboard/settings",
            icon: UserIcon,
          },
        ]);

      // ─────────────────────────────────────────────────────────────────────────
      // STUDENT — Learns, submits work, tracks own progress.
      // ─────────────────────────────────────────────────────────────────────────
      case "student":
        return filterEntries([
          { name: "Dashboard", href: "/dashboard", icon: HomeIcon },

          { divider: true, label: "Classwork" },
          {
            name: "Learning Center",
            href: "/dashboard/learning",
            icon: RocketLaunchIcon,
          },
          {
            name: "Assignments",
            href: "/dashboard/assignments",
            icon: ClipboardDocumentListIcon,
          },
          { name: "CBT Exams", href: "/dashboard/cbt", icon: CommandLineIcon },
          {
            name: "Live Sessions",
            href: "/dashboard/live-sessions",
            icon: VideoCameraIcon,
          },

          { divider: true, label: "Schedule" },
          {
            name: "Timetable",
            href: "/dashboard/timetable",
            icon: CalendarDaysIcon,
          },
          {
            name: "Attendance",
            href: "/dashboard/attendance",
            icon: ClipboardDocumentCheckIcon,
          },

          { divider: true, label: "Results" },
          { name: "Grades", href: "/dashboard/grades", icon: ChartBarIcon },
          {
            name: "My Report Card",
            href: "/dashboard/results",
            icon: DocumentChartBarIcon,
          },

          { divider: true, label: "School" },
          { name: "My Fees", href: "/dashboard/finance", icon: CreditCardIcon },
          {
            name: "Messages",
            href: "/dashboard/inbox",
            icon: ChatBubbleLeftRightIcon,
          },

          { divider: true, label: "Account" },
          {
            name: "Notifications",
            href: "/dashboard/notifications",
            icon: BellIcon,
          },
          {
            name: "Support",
            href: "/dashboard/support",
            icon: QuestionMarkCircleIcon,
          },
          {
            name: "My Profile",
            href: "/dashboard/profile",
            icon: UserIcon,
          },
        ]);

      // ─────────────────────────────────────────────────────────────────────────
      // SCHOOL — Partner school. Views, monitors, manages its own students.
      // ─────────────────────────────────────────────────────────────────────────
      case "school":
        return [
          { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
          { divider: true, label: "My School" },
          {
            name: "School Overview",
            href: "/dashboard/school-overview",
            icon: ChartBarIcon,
          },
          {
            name: "Records",
            href: "/dashboard/records",
            icon: ClipboardDocumentListIcon,
          },
          {
            name: "My Students",
            href: "/dashboard/students",
            icon: UserGroupIcon,
          },
          { name: "Classes", href: "/dashboard/classes", icon: UserGroupIcon },
          {
            name: "Card Studio & ID Cards",
            href: "/dashboard/card-studio",
            icon: CreditCardIcon,
          },

          { divider: true, label: "Schedule" },
          {
            name: "Timetable",
            href: "/dashboard/timetable",
            icon: CalendarDaysIcon,
          },
          {
            name: "Attendance",
            href: "/dashboard/attendance",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Live Sessions",
            href: "/dashboard/live-sessions",
            icon: VideoCameraIcon,
          },

          { divider: true, label: "Academic" },
          {
            name: "Academic Overview",
            href: "/dashboard/academic",
            icon: ShieldCheckIcon,
          },
          {
            name: "How It Works",
            href: "/dashboard/academic/guide",
            icon: DocumentTextIcon,
          },
          {
            name: "Learner Progress",
            href: "/dashboard/learner-progress",
            icon: PresentationChartLineIcon,
          },

          { divider: true, label: "Reports" },
          {
            name: "Student Reports",
            href: "/dashboard/results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "Published School Reports",
            href: "/dashboard/school-reports",
            icon: PresentationChartLineIcon,
          },
          {
            name: "Gradebook & Outcomes",
            href: "/dashboard/grades",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Grading Guide",
            href: "/dashboard/grades/waec",
            icon: DocumentTextIcon,
          },
          {
            name: "Showcase Board",
            href: "/dashboard/showcase",
            icon: SignalIcon,
          },

          { divider: true, label: "Finance" },
          {
            name: "Finance Center",
            href: "/dashboard/finance",
            icon: CreditCardIcon,
          },
          {
            name: "School Billing",
            href: "/dashboard/school-billing",
            icon: BanknotesIcon,
          },

          { divider: true, label: "More" },
          {
            name: "Consent Forms",
            href: "/dashboard/consent-forms",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Parent QR Claims",
            href: "/dashboard/parent-claims",
            icon: ShieldCheckIcon,
          },
          {
            name: "WhatsApp Inbox",
            href: "/dashboard/inbox",
            icon: ChatBubbleLeftRightIcon,
          },
          {
            name: "WhatsApp Groups",
            href: "/dashboard/whatsapp-groups",
            icon: ChatBubbleLeftRightIcon,
          },
          {
            name: "Notifications",
            href: "/dashboard/notifications",
            icon: BellIcon,
          },
          // Same bounce as the student row: /dashboard/settings is platform
          // administration and is blocked for partner schools.
          {
            name: "My Profile",
            href: "/dashboard/profile",
            icon: UserIcon,
          },
        ];

      // ─────────────────────────────────────────────────────────────────────────
      // PARENT — Monitors child's progress. Read-only.
      // ─────────────────────────────────────────────────────────────────────────
      case "parent":
        return [
          { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
          { divider: true, label: "My Children" },
          {
            name: "My Children",
            href: "/dashboard/my-children",
            icon: UserGroupIcon,
          },

          { divider: true, label: "Academic Progress" },
          {
            name: "Report Cards",
            href: "/dashboard/parent-results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "Path Progress",
            href: "/dashboard/parent-path-progress",
            icon: BookOpenIcon,
          },
          {
            name: "Grades",
            href: "/dashboard/parent-grades",
            icon: ChartBarIcon,
          },
          {
            name: "Attendance",
            href: "/dashboard/parent-attendance",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Certificates",
            href: "/dashboard/parent-certificates",
            icon: TrophyIcon,
          },

          { divider: true, label: "Finance" },
          {
            name: "Finance Center",
            href: "/dashboard/finance",
            icon: CreditCardIcon,
          },

          { divider: true, label: "Account & help" },
          {
            name: "Consent Forms",
            href: "/dashboard/consent-forms",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            // "WhatsApp Inbox" is what we call this internally. To a parent it
            // reads as a staff tool, and the page is their own message thread.
            name: "Messages",
            href: "/dashboard/inbox",
            icon: ChatBubbleLeftRightIcon,
          },
          {
            name: "Access Card",
            href: "/dashboard/my-card",
            icon: CreditCardIcon,
          },
          {
            name: "Notifications",
            href: "/dashboard/notifications",
            icon: BellIcon,
          },
          {
            name: "Support",
            href: "/dashboard/support",
            icon: QuestionMarkCircleIcon,
          },
          // Parents are on an allow-list that does not include
          // /dashboard/settings, so this row bounced them too.
          {
            name: "My Profile",
            href: "/dashboard/profile",
            icon: UserIcon,
          },
        ];

      default:
        return base;
    }
  };

  const navEntries = getNavEntries();

  // Extract plain nav items for bottom tab bar
  const navItems = navEntries.filter((e): e is NavItem => !isDivider(e));

  const bottomNavByRole: Record<string, string[]> = {
    student: ["Dashboard", "Learning Center", "Assignments", "Grades"],
    school: ["Dashboard", "Classes", "Finance Center", "WhatsApp Inbox"],
    admin: ["Dashboard", "Office Center", "Records", "Write"],
    teacher: ["Dashboard", "My Classes", "Mark work", "Class progress"],
    parent: ["Dashboard", "My Children", "Report Cards", "Finance Center"],
  };
  const bottomNavNames = bottomNavByRole[profile?.role ?? ""] ?? ["Dashboard"];
  const bottomNavItems = bottomNavNames
    .map((name) => navItems.find((item) => item.name === name))
    .filter((item): item is NavItem => !!item)
    .slice(0, 4);
  const activeMobileItem = [...navItems]
    .filter((item) => isNavActive(pathname, item.href))
    .sort((a, b) => b.href.split('?')[0].length - a.href.split('?')[0].length)[0];
  const mobileTitle = activeMobileItem?.name ?? 'Dashboard';
  const menuActive = !bottomNavItems.some((item) => isNavActive(pathname, item.href));

  const handleLogout = () => {
    void signOut();
  };

  return (
    <>
      {/* ── Mobile Top Header ── */}
      <div className="app-mobile-header md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-card/95 backdrop-blur-xl px-3 sm:px-4 border-b border-border shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          {pathname !== '/dashboard' && (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/80 text-foreground hover:bg-muted active:scale-90 transition-transform shrink-0"
              aria-label="Go back to previous page"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
          )}
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="Go to dashboard">
            <div className="w-8 h-8 rounded-xl bg-white dark:bg-card border border-border flex items-center justify-center shadow-sm shrink-0">
              <Image
                src="/images/logo.png"
                alt="Rillcod"
                width={20}
                height={20}
                className="object-contain"
                priority
              />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-[10px] font-semibold text-muted-foreground">Rillcod Technologies</p>
              <p className="text-[14px] font-bold text-foreground truncate">{mobileTitle}</p>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <NotificationDropdown />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full active:bg-muted"
            aria-label="Open account and app menu"
          >
            <span className="flex w-9 h-9 items-center justify-center rounded-full bg-primary text-white font-bold text-sm shadow-sm">
              {profile.full_name?.charAt(0) ?? 'U'}
            </span>
          </button>
        </div>
      </div>
      <MobileNavSheet
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        navEntries={navEntries}
      />

      {/* ── Desktop Sidebar (Hidden on mobile) ── */}
      <nav
        id="dashboard-navigation-drawer"
        className="hidden md:flex flex-col w-64 xl:w-72 bg-sidebar border-r border-border/70 md:h-screen md:flex-shrink-0 sticky top-0"
        aria-label="Dashboard navigation"
      >
        {/* Logo */}
        <div className="relative hidden items-center gap-3 overflow-hidden border-b border-border/70 px-4 py-4 md:flex">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] to-transparent pointer-events-none" />
          <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-2 shadow-sm dark:bg-card">
            <Image
              src="/images/logo.png"
              alt="Rillcod Technologies"
              width={32}
              height={32}
              className="object-contain"
              priority
            />
          </div>
          <div className="relative z-10 min-w-0 text-left leading-none">
            <h1 className="text-[18px] font-black uppercase tracking-[0.25em] text-foreground italic">
              RILLCOD<span className="text-brand-red-500 not-italic">.</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground italic mt-0.5">
              TECHNOLOGIES
            </p>
          </div>
        </div>

        {/* User badge */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-border/70 bg-card/50 backdrop-blur-sm">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-primary/25 font-black text-sm">
            {profile.full_name?.charAt(0) ?? "U"}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-black truncate text-foreground tracking-wide">
              {profile.full_name}
            </span>
            <div className="mt-0.5">
              <span className="bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block">
                {profile.role === "school" && profile.school_name
                  ? profile.school_name
                  : profile.role}
              </span>
            </div>
          </div>
        </div>

        {/* Role simulator — admin/teacher only (enforced inside component) */}
        {(profile.role === "admin" || profile.role === "teacher") && (
          <div className="px-4 py-2 border-b border-sidebar-foreground/[0.08]">
            <ViewAsSwitcher />
          </div>
        )}

        {/* Links */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 custom-scrollbar">
          {(() => {
            const groups: { label: string; items: NavItem[] }[] = [];
            let currentGroup: { label: string; items: NavItem[] } | null = null;

            navEntries.forEach((entry) => {
              if (isDivider(entry)) {
                currentGroup = { label: entry.label, items: [] };
                groups.push(currentGroup);
              } else if (currentGroup) {
                currentGroup.items.push(entry);
              } else {
                // Base items before first divider (e.g. Dashboard)
                groups.push({ label: "", items: [entry] });
              }
            });

            return groups.map((group, gIdx) => {
              const isFirst = gIdx === 0 && !group.label;
              if (isFirst) {
                return group.items.map((item) => (
                  <NavLink
                    key={item.name}
                    item={item}
                    active={isNavActive(pathname, item.href)}
                    setMobileOpen={setMobileOpen}
                  />
                ));
              }

              return (
                <NavSection
                  key={group.label}
                  label={group.label}
                  items={group.items}
                  pathname={pathname}
                  setMobileOpen={setMobileOpen}
                />
              );
            });
          })()}
        </div>

        {/* Bottom */}
        <div className="border-t border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.02]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-foreground/[0.06]">
            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-sidebar-foreground/30">
              Display
            </span>
            <ThemeToggle />
          </div>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="flex items-center gap-3 w-full px-5 py-4 text-[12px] font-black uppercase tracking-[0.25em] text-rose-600 dark:text-rose-400 hover:text-white hover:bg-rose-600 transition-all group active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
          >
            <ArrowRightOnRectangleIcon
              className={`w-5 h-5 flex-shrink-0 transition-transform ${
                signingOut ? "animate-pulse" : "group-hover:translate-x-1"
              }`}
            />
            {signingOut ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      </nav>

      {/* ── Mobile Bottom Navigation (Floating Island Dock) ── */}
      <div
        role="navigation"
        aria-label="Primary app navigation"
        className="app-mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-start justify-around border-t border-border bg-card/95 px-1 pt-1.5 shadow-[0_-8px_32px_rgba(15,23,42,0.12)] backdrop-blur-2xl"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {bottomNavItems.map(({ name, href, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          const shortName =
            name === "My Classes"
              ? "Classes"
              : name === "Report Cards" || name === "Write"
                ? "Reports"
                : name === "Learning Center"
                  ? "Learn"
                  : name === "Finance Center"
                    ? "Finance"
                    : name;

          return (
            <Link
              key={`mobile-${name}`}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
              className="flex min-h-14 flex-1 min-w-0 flex-col items-center justify-start gap-0.5 px-0.5 py-0.5 transition-transform active:scale-95"
            >
              <span className={`relative flex h-8 min-w-12 items-center justify-center rounded-full px-3 transition-colors ${active ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground"}`}>
                <Icon className="w-5 h-5" />
                {(name === "WhatsApp Inbox" || name === "Office Center") && unreadCount > 0 && (
                  <span className="absolute -top-0.5 right-1 h-4 min-w-4 rounded-full bg-brand-red-accent px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-card">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className={`max-w-full truncate text-[10px] leading-4 ${active ? "font-bold text-primary" : "font-medium text-muted-foreground"}`}>
                {shortName}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-expanded={mobileOpen}
          aria-label="Open app menu"
          className="flex min-h-14 flex-1 min-w-0 flex-col items-center justify-start gap-0.5 px-0.5 py-0.5 active:scale-95"
        >
          <span className={`flex h-8 min-w-12 items-center justify-center rounded-full px-3 transition-colors ${menuActive || mobileOpen ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground"}`}>
            <Bars3Icon className="w-5 h-5" />
          </span>
          <span className={`text-[10px] leading-4 ${menuActive || mobileOpen ? "font-bold text-primary" : "font-medium text-muted-foreground"}`}>
            Menu
          </span>
        </button>
      </div>
    </>
  );
}

function NavLink({
  item,
  active,
  setMobileOpen,
  sub = false,
}: {
  item: NavItem;
  active: boolean;
  setMobileOpen: (o: boolean) => void;
  sub?: boolean;
}) {
  const { name, href, icon: Icon } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={() => setMobileOpen(false)}
      className={`relative flex items-center gap-3 px-3.5 py-2.5 text-[12px] font-black tracking-[0.08em] uppercase transition-all duration-200 group rounded-xl ${
        active
          ? "bg-primary/10 text-primary border-l-4 border-l-brand-red-500 shadow-sm"
          : "text-muted-foreground/75 hover:text-foreground hover:bg-muted/70"
      } ${sub ? "ml-3 py-2" : "py-2.5"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
          active
            ? "bg-primary text-white shadow-md shadow-primary/30 scale-105"
            : "bg-muted/40 group-hover:bg-muted group-hover:text-foreground"
        }`}
      >
        <Icon
          className={`w-4 h-4 flex-shrink-0 transition-colors ${
            active ? "text-white" : "text-muted-foreground group-hover:text-foreground"
          }`}
        />
      </div>
      <span className="truncate font-bold">{name}</span>
      {active && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-red-500 flex-shrink-0 animate-pulse" />
      )}
    </Link>
  );
}

function NavSection({
  label,
  items,
  pathname,
  setMobileOpen,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  setMobileOpen: (o: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="space-y-px">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 mt-4 group hover:bg-sidebar-foreground/[0.03] transition-colors"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sidebar-foreground/35 group-hover:text-sidebar-foreground/60 transition-colors">
          {label}
        </p>
        <ChevronDownIcon
          className={`w-3 h-3 text-sidebar-foreground/20 group-hover:text-sidebar-foreground/40 transition-all ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-px">
              {items.map((item) => (
                <NavLink
                  key={item.name}
                  item={item}
                  active={isNavActive(pathname, item.href)}
                  setMobileOpen={setMobileOpen}
                  sub
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

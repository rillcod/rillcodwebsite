// @refresh reset
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
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
  XMarkIcon,
  SignalIcon,
  TrophyIcon,
  ShieldCheckIcon,
  CodeBracketIcon,
  RocketLaunchIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  VideoCameraIcon,
  UserPlusIcon,
  SunIcon,
  MoonIcon,
  FireIcon,
  ArchiveBoxIcon,
  CommandLineIcon,
  CreditCardIcon,
  ChatBubbleLeftEllipsisIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  BoltIcon,
  QuestionMarkCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import ThemeToggle from "@/components/ThemeToggle";
import ViewAsSwitcher from "./ViewAsSwitcher";
import NotificationDropdown from "@/components/notifications/NotificationDropdown";

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
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white text-xs sm:text-sm font-bold rounded-xl border border-rose-500/20 transition-all disabled:opacity-60"
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
            name: "1 · Programmes",
            href: "/dashboard/programs",
            icon: PresentationChartLineIcon,
          },
          {
            name: "2 · Curriculum",
            href: "/dashboard/curriculum",
            icon: BookOpenIcon,
          },
          {
            name: "3 · Certify",
            href: "/dashboard/academic/certify",
            icon: ShieldCheckIcon,
          },
          {
            name: "4 · Distribute",
            href: "/dashboard/academic/distribute",
            icon: BuildingOfficeIcon,
          },
          {
            name: "5 · School Timing",
            href: "/dashboard/academic/timing",
            icon: CalendarDaysIcon,
          },
          {
            name: "How It Works",
            href: "/dashboard/academic/guide",
            icon: DocumentTextIcon,
          },
          {
            name: "Learner Progress",
            href: "/dashboard/learner-progress",
            icon: ChartBarIcon,
          },
          {
            name: "Special Programmes",
            href: "/dashboard/special-programs",
            icon: SparklesIcon,
          },
          { name: "Courses", href: "/dashboard/courses", icon: BookOpenIcon },
          { name: "Classes", href: "/dashboard/classes", icon: UserGroupIcon },
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
          {
            name: "Publish & Share",
            href: "/dashboard/results",
            icon: DocumentChartBarIcon,
          },
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
            name: "Results Workspace",
            href: "/dashboard/academic/results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "Report Builder",
            href: "/dashboard/reports/builder",
            icon: DocumentTextIcon,
          },
          {
            name: "Publish & Share",
            href: "/dashboard/results",
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
            name: "Platform Operations",
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
      // TEACHER — Teaches classes, creates content, grades, tracks campus students.
      // ─────────────────────────────────────────────────────────────────────────
      case "teacher":
        return filterEntries([
          { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
          {
            name: "Help Requests",
            href: "/dashboard/cases",
            icon: ChatBubbleLeftEllipsisIcon,
          },

          { divider: true, label: "Teaching" },
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
            icon: ChartBarIcon,
          },
          {
            name: "Teaching Plans",
            href: "/dashboard/lesson-plans",
            icon: ClipboardDocumentListIcon,
          },
          {
            name: "Curriculum",
            href: "/dashboard/curriculum",
            icon: BookOpenIcon,
          },
          {
            name: "Teaching Resources",
            href: "/dashboard/academic#teaching-resources",
            icon: ArchiveBoxIcon,
          },
          { divider: true, label: "My Classes" },
          {
            name: "My Classes",
            href: "/dashboard/classes",
            icon: UserGroupIcon,
          },
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

          { divider: true, label: "People" },
          {
            name: "Records",
            href: "/dashboard/records",
            icon: ClipboardDocumentListIcon,
          },
          {
            name: "Students",
            href: "/dashboard/students",
            icon: UserGroupIcon,
          },
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
          { name: "Parents", href: "/dashboard/parents", icon: UserPlusIcon },

          { divider: true, label: "Ops" },
          {
            name: "Finance Center",
            href: "/dashboard/finance",
            icon: BanknotesIcon,
          },
          {
            name: "Card Studio",
            href: "/dashboard/card-studio",
            icon: CreditCardIcon,
          },
          {
            name: "Study Groups",
            href: "/dashboard/study-groups",
            icon: UserGroupIcon,
          },
          {
            name: "Gamification",
            href: "/dashboard/gamification",
            icon: FireIcon,
          },

          { divider: true, label: "Engagement" },
          {
            name: "Class Engagement",
            href: "/dashboard/engagement",
            icon: BoltIcon,
          },
          {
            name: "Practice & Community",
            href: "/dashboard/activity-hub",
            icon: SparklesIcon,
          },
          {
            name: "Showcase Board",
            href: "/dashboard/showcase",
            icon: SignalIcon,
          },
          {
            name: "Leaderboard",
            href: "/dashboard/leaderboard",
            icon: TrophyIcon,
          },
          {
            name: "Code Playground",
            href: "/dashboard/playground",
            icon: CodeBracketIcon,
          },

          { divider: true, label: "Reports" },
          {
            name: "Results Workspace",
            href: "/dashboard/academic/results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "Report Builder",
            href: "/dashboard/reports/builder",
            icon: DocumentTextIcon,
          },
          {
            name: "Publish & Share",
            href: "/dashboard/results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "School Reports",
            href: "/dashboard/school-reports",
            icon: PresentationChartLineIcon,
          },
          {
            name: "Certificates",
            href: "/dashboard/certificates/management",
            icon: TrophyIcon,
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

          { divider: true, label: "CRM" },
          {
            name: "Customer Retention",
            href: "/dashboard/crm",
            icon: UserPlusIcon,
          },
          {
            name: "Contact Directory",
            href: "/dashboard/customer-book",
            icon: ClipboardDocumentListIcon,
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

          { divider: true, label: "Learning" },
          {
            name: "Learning Center",
            href: "/dashboard/learning",
            icon: RocketLaunchIcon,
          },
          {
            name: "Learning Slides",
            href: "/dashboard/slides",
            icon: PresentationChartLineIcon,
          },
          { name: "Flashcards", href: "/dashboard/flashcards", icon: BoltIcon },
          { name: "Library", href: "/dashboard/library", icon: ArchiveBoxIcon },
          {
            name: "Code Playground",
            href: "/dashboard/playground",
            icon: CodeBracketIcon,
          },
          {
            name: "Live Sessions",
            href: "/dashboard/live-sessions",
            icon: VideoCameraIcon,
          },

          { divider: true, label: "Assignments & Exams" },
          {
            name: "Assignments",
            href: "/dashboard/assignments",
            icon: ClipboardDocumentListIcon,
          },
          { name: "Projects", href: "/dashboard/projects", icon: SparklesIcon },
          { name: "CBT Exams", href: "/dashboard/cbt", icon: CommandLineIcon },

          { divider: true, label: "Community" },
          {
            name: "Practice & Community",
            href: "/dashboard/activity-hub",
            icon: SparklesIcon,
          },
          {
            name: "Study Groups",
            href: "/dashboard/study-groups",
            icon: UserGroupIcon,
          },
          { name: "Showcase", href: "/dashboard/showcase", icon: SignalIcon },

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

          { divider: true, label: "My Progress" },
          {
            name: "Path Progress",
            href: "/dashboard/path-progress",
            icon: BookOpenIcon,
          },
          { name: "Grades", href: "/dashboard/grades", icon: ChartBarIcon },
          {
            name: "How Grading Works",
            href: "/dashboard/grades/waec",
            icon: DocumentTextIcon,
          },
          {
            name: "My Report Card",
            href: "/dashboard/results",
            icon: DocumentChartBarIcon,
          },
          {
            name: "Certificates",
            href: "/dashboard/certificates",
            icon: TrophyIcon,
          },
          {
            name: "My Portfolio",
            href: "/dashboard/portfolio",
            icon: AcademicCapIcon,
          },

          { divider: true, label: "Account" },
          {
            name: "My Access Card",
            href: "/dashboard/my-card",
            icon: CreditCardIcon,
          },
          { name: "My Fees", href: "/dashboard/finance", icon: CreditCardIcon },
          {
            name: "Messages",
            href: "/dashboard/inbox",
            icon: ChatBubbleLeftRightIcon,
          },
          {
            name: "Support",
            href: "/dashboard/support",
            icon: QuestionMarkCircleIcon,
          },
          {
            name: "Notifications",
            href: "/dashboard/notifications",
            icon: BellIcon,
          },
          {
            name: "Newsletters",
            href: "/dashboard/newsletters",
            icon: DocumentTextIcon,
          },
          {
            name: "Account Settings",
            href: "/dashboard/settings",
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
          {
            name: "Account Settings",
            href: "/dashboard/settings",
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
          {
            name: "Grading Guide",
            href: "/dashboard/grades/waec",
            icon: DocumentTextIcon,
          },
          {
            name: "Access Cards",
            href: "/dashboard/my-card",
            icon: CreditCardIcon,
          },

          { divider: true, label: "Finance" },
          {
            name: "Finance Center",
            href: "/dashboard/finance",
            icon: CreditCardIcon,
          },

          { divider: true, label: "More" },
          {
            name: "WhatsApp Inbox",
            href: "/dashboard/inbox",
            icon: ChatBubbleLeftRightIcon,
          },
          {
            name: "Share Feedback",
            href: "/dashboard/parent-feedback",
            icon: ChatBubbleLeftEllipsisIcon,
          },
          {
            name: "Support",
            href: "/dashboard/support",
            icon: QuestionMarkCircleIcon,
          },
          {
            name: "Consent Forms",
            href: "/dashboard/consent-forms",
            icon: ClipboardDocumentCheckIcon,
          },
          {
            name: "Notifications",
            href: "/dashboard/notifications",
            icon: BellIcon,
          },
          {
            name: "Newsletters",
            href: "/dashboard/newsletters",
            icon: DocumentTextIcon,
          },
          {
            name: "Account Settings",
            href: "/dashboard/settings",
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
    student: ["Dashboard", "Learning Center", "Assignments", "Path Progress"],
    school: ["Dashboard", "Classes", "WhatsApp Inbox", "Finance Center"],
    admin: ["Dashboard", "Office Center", "Classes", "Results Workspace"],
    teacher: ["Dashboard", "My Classes", "Grading Queue", "WhatsApp Inbox"],
    parent: ["Dashboard", "My Children", "WhatsApp Inbox", "Finance Center"],
  };
  const bottomNavNames = bottomNavByRole[profile?.role ?? ""] ?? ["Dashboard"];
  const bottomNavItems = bottomNavNames
    .map((name) => navItems.find((item) => item.name === name))
    .filter((item): item is NavItem => !!item)
    .slice(0, 5);

  const handleLogout = () => {
    void signOut();
  };

  return (
    <>
      {/* ── Mobile Top Header ── */}
      <div className="app-mobile-header md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-sidebar/95 backdrop-blur-xl px-4 py-2 border-b border-sidebar-foreground/[0.08] shadow-[0_1px_20px_rgba(0,0,0,0.05)]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Image
              src="/images/logo.png"
              alt="Rillcod"
              width={16}
              height={16}
              className="object-contain"
              priority
            />
          </div>
          <span className="font-black uppercase tracking-widest text-[13px] text-sidebar-foreground italic">
            Rillcod<span className="text-brand-red-600 not-italic">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          <NotificationDropdown />
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="dashboard-navigation-drawer"
            className="flex h-11 w-11 items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] transition-all"
          >
            {mobileOpen ? (
              <XMarkIcon className="w-6 h-6" />
            ) : (
              <Bars3Icon className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* ── Backdrop (mobile only) ── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-foreground/35 dark:bg-black/70 z-40 md:hidden backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <nav
        id="dashboard-navigation-drawer"
        className={`
          fixed top-[var(--app-header-height)] left-0 bottom-[var(--app-bottom-nav-height)] z-40 md:bottom-0
          md:static md:top-auto md:bottom-auto md:z-auto
          flex flex-col w-[240px] md:w-64 xl:w-72
          bg-sidebar
          border-r border-sidebar-foreground/[0.08]
          shadow-[4px_0_40px_rgba(0,0,0,0.3)]
          transform transition-transform duration-300 ease-in-out
          md:translate-x-0 md:h-screen md:flex-shrink-0
          ${
            mobileOpen
              ? "visible translate-x-0"
              : "invisible -translate-x-full md:visible md:translate-x-0"
          }
        `}
        aria-label="Dashboard navigation"
      >
        {/* Logo */}
        <div className="hidden md:flex flex-col items-center justify-center py-7 border-b border-sidebar-foreground/[0.08] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent pointer-events-none" />
          <div className="w-11 h-11 bg-primary/10 border border-primary/25 flex items-center justify-center shadow-[0_0_24px_rgba(26,58,143,0.15)] mb-3 relative z-10">
            <Image
              src="/images/logo.png"
              alt="Rillcod Technologies"
              width={28}
              height={28}
              className="object-contain"
              priority
            />
          </div>
          <div className="text-center leading-none relative z-10">
            <h1 className="text-[18px] font-black uppercase tracking-[0.25em] text-sidebar-foreground italic">
              RILLCOD<span className="text-brand-red-500">.</span>
            </h1>
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-brand-red-500/80 italic mt-0.5">
              TECHNOLOGIES
            </p>
          </div>
        </div>

        {/* User badge */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.03]">
          <div className="w-9 h-9 bg-primary/10 border border-primary/25 flex items-center justify-center flex-shrink-0 shadow-[0_0_14px_rgba(26,58,143,0.12)]">
            <span className="text-primary text-sm font-black uppercase">
              {profile.full_name?.charAt(0) ?? "U"}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-black truncate text-sidebar-foreground/90 tracking-wide">
              {profile.full_name}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70 mt-0.5">
              {profile.role === "school" && profile.school_name
                ? profile.school_name
                : profile.role}
            </span>
          </div>
          <div className="ml-auto flex-shrink-0">
            <NotificationDropdown />
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

      {/* ── Mobile Bottom Navigation ── */}
      <div
        role="navigation"
        aria-label="Primary app navigation"
        className="app-mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar/97 backdrop-blur-xl border-t border-sidebar-foreground/[0.08] flex items-center justify-around px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
      >
        {bottomNavItems.map(({ name, href, icon: Icon }) => {
          const active = isNavActive(pathname, href);
          const shortName =
            name === "My Courses"
              ? "Courses"
              : name === "My Classes"
              ? "Classes"
              : name === "My Report Card"
              ? "Report"
              : name === "My Access Card"
              ? "My Card"
              : name === "My Payments"
              ? "Payments"
              : name === "Code Playground"
              ? "Code"
              : name === "Progress Reports"
              ? "Reports"
              : name === "Results Workspace"
              ? "Results"
              : name === "Publish & Share"
              ? "Publish"
              : name === "Student Reports"
              ? "Reports"
              : name === "My Students"
              ? "Students"
              : name === "School Overview"
              ? "Overview"
              : name === "Learning Center"
              ? "Learn"
              : name === "WhatsApp Inbox"
              ? "WhatsApp"
              : name === "Office Center"
              ? "Office"
              : name === "My Children"
              ? "Children"
              : name === "Report Cards"
              ? "Reports"
              : name;
          return (
            <Link
              key={`mobile-${name}`}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
              className="flex min-h-11 flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-1 transition-all duration-200"
            >
              <div
                className={`relative flex items-center justify-center w-10 h-7 rounded-lg transition-all duration-200 ${
                  active ? "bg-primary/10" : ""
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    active ? "text-primary" : "text-sidebar-foreground/35"
                  }`}
                />
                {(name === "WhatsApp Inbox" || name === "Office Center") &&
                  unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-brand-red-600 text-foreground text-[7px] font-black flex items-center justify-center rounded-full ring-2 ring-sidebar">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
              </div>
              <span
                className={`text-[9px] font-black uppercase tracking-[0.08em] leading-none truncate max-w-full px-0.5 transition-colors ${
                  active ? "text-primary" : "text-sidebar-foreground/25"
                }`}
              >
                {shortName}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={
            mobileOpen ? "Close navigation menu" : "Open navigation menu"
          }
          className="flex min-h-11 flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-1 transition-all group"
        >
          <div
            className={`flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200 ${
              mobileOpen ? "bg-primary/15" : ""
            }`}
          >
            {mobileOpen ? (
              <XMarkIcon className="w-5 h-5 text-primary" />
            ) : (
              <Bars3Icon className="w-5 h-5 text-sidebar-foreground/35" />
            )}
          </div>
          <span
            className={`text-[9px] font-black uppercase tracking-[0.08em] leading-none transition-colors ${
              mobileOpen ? "text-primary" : "text-sidebar-foreground/25"
            }`}
          >
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
      className={`relative flex items-center gap-3 px-3 py-2 text-[12px] font-black tracking-[0.08em] uppercase transition-all duration-200 group ${
        active
          ? "bg-primary/[0.08] text-sidebar-foreground"
          : "text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-foreground/[0.05]"
      } ${sub ? "ml-4 py-1.5" : "py-2.5"}`}
    >
      {active && (
        <div className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-brand-red-600 shadow-[0_0_12px_rgba(196,30,58,0.6)]" />
      )}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
          active
            ? "bg-primary/10 shadow-lg scale-110"
            : "bg-transparent group-hover:bg-sidebar-foreground/5"
        }`}
      >
        <Icon
          className={`w-3.5 h-3.5 flex-shrink-0 transition-all ${
            active
              ? "text-primary drop-shadow-[0_0_6px_rgba(26,58,143,0.7)]"
              : "text-sidebar-foreground/30 group-hover:text-sidebar-foreground/60"
          }`}
        />
      </div>
      <span className="truncate">{name}</span>
      {active && (
        <div className="ml-auto w-1 h-1 rounded-full bg-brand-red-600/80 flex-shrink-0" />
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
  const [isOpen, setIsOpen] = useState(() => {
    // Auto-expand if any item inside is active
    return items.some((item) => isNavActive(pathname, item.href));
  });

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

// @refresh reset
"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  UserIcon,
  BellIcon,
  ShieldCheckIcon,
  CogIcon,
  EyeIcon,
  EyeSlashIcon,
  CameraIcon,
  PencilIcon,
  CheckIcon,
  KeyIcon,
  EnvelopeIcon,
  PhoneIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  MapPinIcon,
  StarIcon,
  CpuChipIcon,
  DocumentTextIcon,
  TableCellsIcon,
  CommandLineIcon,
  XMarkIcon,
  BookOpenIcon,
  BoltIcon,
  TrashIcon,
  PlusIcon,
  SparklesIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@/lib/icons";
import MobilePageHero from '@/components/mobile/MobilePageHero';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import { LANE_LABELS } from "@/lib/qa/resolveQaSpineLane";
import { liveAcademicSession } from "@/lib/reports/academic-period";

// ── Types ─────────────────────────────────────────────────────────────────────

type OpsData = Record<string, Record<string, unknown>>;

type PolicyProgram = {
  id: string;
  name: string;
  delivery_type: "optional" | "compulsory";
  session_frequency_per_week: 1 | 2;
  school_progression_enabled: boolean;
  progression_policy: Record<string, unknown> | null;
};

type EditablePolicy = {
  strict_route_default: boolean;
  auto_flashcards_default: boolean;
  project_based_default: boolean;
  essential_routes_only: boolean;
  mastery_mode: "strict" | "soft";
  track_priority: string[];
  qa_min_pass_score: number;
  qa_required_teacher_steps: number;
  qa_required_student_steps: number;
  qa_assessment_drift_mode: "warn" | "fail";
  qa_exam_drift_mode: "warn" | "fail";
  qa_five_step_mode: "warn" | "fail";
  program_start_term: 1 | 2 | 3;
};

type CatalogSummary = {
  total_rows: number;
  active_catalog_version: string | null;
  program_count: number;
  last_seed_at: string | null;
  lane_counts: Array<{ lane_index: number; count: number }>;
  versions: Array<{ catalog_version: string; count: number }>;
};

type AcademicTermRow = {
  id: string;
  academic_year: string;
  term_number: number;
  term_label: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const OPS_PILLARS = [
  {
    id: "setup",
    label: "School Setup",
    sections: ["lms.ops.calendar", "lms.ops.permissions", "lms.ops.approvals"],
  },
  {
    id: "academic",
    label: "Academic Standards",
    sections: ["lms.ops.assessment", "lms.ops.promotion"],
  },
  {
    id: "intelligence",
    label: "Alerts & Safety",
    sections: [
      "lms.ops.alerts",
      "lms.ops.communication",
      "lms.ops.integrity",
      "lms.ops.pwa",
    ],
  },
];

const OPS_SECTION_META: Record<string, { label: string; desc: string }> = {
  "lms.ops.calendar": {
    label: "Academic Calendar",
    desc: "Term cycles, holidays, and school year dates.",
  },
  "lms.ops.permissions": {
    label: "User Permissions",
    desc: "What teachers, parents, and schools can see or edit.",
  },
  "lms.ops.approvals": {
    label: "Student & School Enrollment",
    desc: "Manual or automatic approval for new students and schools.",
  },
  "lms.ops.assessment": {
    label: "Grading Rules",
    desc: "Global rules for retries, marking schemes, and submission limits.",
  },
  "lms.ops.promotion": {
    label: "Promotion Rules",
    desc: "What a student must achieve to move to the next level.",
  },
  "lms.ops.alerts": {
    label: "Attendance & Performance Alerts",
    desc: "Auto-notifications for attendance drops and low scores.",
  },
  "lms.ops.communication": {
    label: "Messaging Limits",
    desc: "Platform-wide limits and safety rules for student messaging.",
  },
  "lms.ops.integrity": {
    label: "System Health",
    desc: "Backup frequency and record cleanup settings.",
  },
  "lms.ops.pwa": {
    label: "App Experience",
    desc: "Offline behavior and performance mode for mobile users.",
  },
};

// LANE_LABELS imported from resolveQaSpineLane — 1-14 skill lanes

const DEFAULT_POLICY: EditablePolicy = {
  strict_route_default: true,
  auto_flashcards_default: true,
  project_based_default: false,
  essential_routes_only: false,
  mastery_mode: "strict",
  track_priority: [],
  qa_min_pass_score: 75,
  qa_required_teacher_steps: 5,
  qa_required_student_steps: 5,
  qa_assessment_drift_mode: "warn",
  qa_exam_drift_mode: "fail",
  qa_five_step_mode: "warn",
  program_start_term: 1,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function humaniseKey(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function toEditablePolicy(prog: PolicyProgram): EditablePolicy {
  const p = prog.progression_policy ?? {};
  const tp = Array.isArray(p.track_priority)
    ? p.track_priority.filter((v): v is string => typeof v === "string")
    : [];
  return {
    strict_route_default: p.strict_route_default !== false,
    auto_flashcards_default: p.auto_flashcards_default !== false,
    project_based_default: p.project_based_default === true,
    essential_routes_only: p.essential_routes_only === true,
    mastery_mode: p.mastery_mode === "soft" ? "soft" : "strict",
    track_priority: tp,
    qa_min_pass_score: Number(p.qa_min_pass_score ?? 75) || 75,
    qa_required_teacher_steps: Number(p.qa_required_teacher_steps ?? 5) || 5,
    qa_required_student_steps: Number(p.qa_required_student_steps ?? 5) || 5,
    qa_assessment_drift_mode:
      p.qa_assessment_drift_mode === "fail" ? "fail" : "warn",
    qa_exam_drift_mode: p.qa_exam_drift_mode === "warn" ? "warn" : "fail",
    qa_five_step_mode: p.qa_five_step_mode === "fail" ? "fail" : "warn",
    program_start_term: ([1, 2, 3].includes(Number(p.program_start_term))
      ? Number(p.program_start_term)
      : 1) as 1 | 2 | 3,
  };
}

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-all ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow transition-all ${
          checked ? "left-5.5 translate-x-0.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

// ── Base tab list ─────────────────────────────────────────────────────────────

const BASE_TABS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "security", label: "Security", icon: ShieldCheckIcon },
  { id: "notifications", label: "Notifications", icon: BellIcon },
];

// ── Main component ────────────────────────────────────────────────────────────

function SettingsPageContent({
  embedded = false,
  forcedTab,
}: {
  embedded?: boolean;
  forcedTab?: string;
}) {
  const { profile, refreshProfile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(
    forcedTab ??
      (embedded ? "academic-rules" : searchParams.get("tab") ?? "profile")
  );
  useEffect(() => {
    if (forcedTab) setTab(forcedTab);
  }, [forcedTab]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pushState, setPushState] = useState<string>("default");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const canManageAcademic = ["admin", "teacher"].includes(profile?.role ?? "");
  const isAdmin = profile?.role === "admin";

  // Account Settings contains personal controls only. Academic and platform controls are embedded in their own workspaces.
  const TABS = BASE_TABS;

  // ── AI / LMS Config state ──────────────────────────────────────────────────
  const [aiSettings, setAiSettings] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  // ── Templates state ────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  // ── Audit Log state ────────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ── Repair state ───────────────────────────────────────────────────────────
  const [mismatches, setMismatches] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [repairLoading, setRepairLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // ── Academic Rules state ───────────────────────────────────────────────────
  // Teachers default to Program Rules; only admins can access Platform Settings
  // ?sub=platform from curriculum page link lands directly on Platform sub-tab
  const subParam = searchParams.get("sub");
  const [academicSubTab, setAcademicSubTab] = useState<"platform" | "programs">(
    () => {
      if (subParam === "platform" && profile?.role === "admin")
        return "platform";
      if (subParam === "programs") return "programs";
      return profile?.role === "admin" ? "platform" : "programs";
    }
  );

  // Term calendar (per school or platform)
  const [termCalendar, setTermCalendar] = useState({
    term1_start: "",
    term1_end: "",
    term2_start: "",
    term2_end: "",
    term3_start: "",
    term3_end: "",
  });
  const [termCalendarSaving, setTermCalendarSaving] = useState(false);
  const [academicYearSetting, setAcademicYearSetting] = useState("");
  const [academicYearSaving, setAcademicYearSaving] = useState(false);
  const [academicTerms, setAcademicTerms] = useState<AcademicTermRow[]>([]);
  const [currentTermId, setCurrentTermId] = useState("");
  const [currentTermSaving, setCurrentTermSaving] = useState(false);

  // Platform settings (operations)
  const [opsData, setOpsData] = useState<OpsData>({});
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsSaving, setOpsSaving] = useState(false);
  const [opsActivePillar, setOpsActivePillar] = useState("setup");
  const [opsReadonly, setOpsReadonly] = useState(false);

  // Program rules (policies)
  const [programs, setPrograms] = useState<PolicyProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [policyForm, setPolicyForm] = useState<EditablePolicy>(DEFAULT_POLICY);
  const [policyDelivery, setPolicyDelivery] = useState<
    "optional" | "compulsory"
  >("compulsory");
  const [policyFreq, setPolicyFreq] = useState<1 | 2>(1);
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyDirty, setPolicyDirty] = useState(false);

  // ── Teaching Templates state ───────────────────────────────────────────────
  const [catalogData, setCatalogData] = useState<CatalogSummary | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSubTab, setCatalogSubTab] = useState<"overview" | "manage">(
    "overview"
  );
  const [catalogVersion, setCatalogVersion] = useState("");
  const [catalogBlueprints, setCatalogBlueprints] = useState<any[]>([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(false);
  const [purging, setPurging] = useState<string | null>(null);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateAiLoading, setTemplateAiLoading] = useState(false);
  const [manageExpandedLane, setManageExpandedLane] = useState<number | null>(
    null
  );
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editRowTopic, setEditRowTopic] = useState("");
  const [editRowSubs, setEditRowSubs] = useState("");
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [spineSearch, setSpineSearch] = useState("");
  const [spineYearFilter, setSpineYearFilter] = useState(0); // 0 = all
  const [templateForm, setTemplateForm] = useState({
    catalog_version: "",
    program_id: "",
    lane_index: 1,
    track: "core",
    week_number: 1,
    topic: "",
    subtopics: "",
    year_number: 1,
    term_number: 1,
  });

  // ── Profile / auth state ───────────────────────────────────────────────────
  const [profileData, setProfileData] = useState({
    full_name: "",
    email: "",
    phone: "",
    bio: "",
  });
  const [pwData, setPwData] = useState({ newPw: "", confirm: "" });
  const [notifs, setNotifs] = useState<Record<string, boolean>>(() => {
    try {
      const s = localStorage.getItem("rillcod_notif_prefs");
      if (s) return JSON.parse(s);
    } catch {}
    return {
      assignments: true,
      grades: true,
      announcements: true,
      newsletters: false,
    };
  });

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window)
      setPushState(Notification.permission);
    if (profile)
      setProfileData({
        full_name: profile.full_name ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        bio: profile.bio ?? "",
      });
  }, [profile]);

  useEffect(() => {
    if (!profile || profile.role !== "teacher") return;
    let cancelled = false;
    setSchoolsLoading(true);
    createClient()
      .from("teacher_schools")
      .select(
        "id, is_primary, assigned_at, notes, schools(id, name, city, state, phone, email, is_active)"
      )
      .eq("teacher_id", profile.id)
      .order("is_primary", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setSchools(data ?? []);
        setSchoolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    if (
      profile?.role !== "admin" ||
      (tab !== "ai-config" && tab !== "lms-config")
    )
      return;
    setAiLoading(true);
    fetch("/api/app-settings")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {};
        (d.data ?? []).forEach((row: any) => {
          map[row.key] = row.value ?? "";
        });
        setAiSettings(map);
      })
      .finally(() => setAiLoading(false));
  }, [profile?.role, tab]);

  useEffect(() => {
    if (profile?.role !== "admin" || tab !== "templates") return;
    (async () => {
      setTemplatesLoading(true);
      const { data } = await createClient()
        .from("notification_templates")
        .select("*")
        .order("type")
        .order("name");
      setTemplates(data ?? []);
      setTemplatesLoading(false);
    })();
  }, [profile?.role, tab]);

  useEffect(() => {
    if (profile?.role !== "admin" || tab !== "audit-log") return;
    (async () => {
      setAuditLoading(true);
      const { data } = await createClient()
        .from("activity_logs")
        .select("*, portal_users!activity_logs_user_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(5);
      setAuditLogs(data ?? []);
      setAuditLoading(false);
    })();
  }, [profile?.role, tab]);

  useEffect(() => {
    if (profile?.role !== "admin" || tab !== "repair") return;
    loadMismatches();
    loadSuggestions();
  }, [profile?.role, tab]);

  // Operations + term calendar
  useEffect(() => {
    if (
      !canManageAcademic ||
      tab !== "academic-rules" ||
      academicSubTab !== "platform"
    )
      return;
    setOpsLoading(true);
    fetch("/api/progression/operations-settings")
      .then((r) => r.json())
      .then((j) => {
        setOpsData((j.data ?? {}) as OpsData);
        setOpsReadonly(Boolean(j.readonly));
      })
      .catch(() => showToast("Failed to load platform settings", false))
      .finally(() => setOpsLoading(false));
    loadAcademicCalendarSettings();
  }, [canManageAcademic, tab, academicSubTab, profile?.school_id]);

  const loadAcademicCalendarSettings = async () => {
    const schoolId = profile?.school_id;
    const qs = schoolId ? `?school_id=${schoolId}` : "";
    const j = await fetch(`/api/settings/academic-year${qs}`, {
      cache: "no-store",
    }).then((r) => r.json());
    setAcademicYearSetting(j.effective ?? j.platform ?? "");
    const tc = j.term_calendar ?? {};
    setTermCalendar({
      term1_start: tc.term1?.start ?? "",
      term1_end: tc.term1?.end ?? "",
      term2_start: tc.term2?.start ?? "",
      term2_end: tc.term2?.end ?? "",
      term3_start: tc.term3?.start ?? "",
      term3_end: tc.term3?.end ?? "",
    });
    setAcademicTerms((j.terms ?? []) as AcademicTermRow[]);
    setCurrentTermId(j.current_term?.id ?? "");
  };

  // Policies — load when on either the Program Rules sub-tab or the Teaching Templates tab
  // (Teaching Templates needs the program list for the Add Template dropdown)
  useEffect(() => {
    if (!canManageAcademic) return;
    if (
      tab === "teaching-templates" ||
      (tab === "academic-rules" && academicSubTab === "programs")
    ) {
      if (programs.length > 0) return; // already loaded
      setPolicyLoading(true);
      fetch("/api/progression/policies")
        .then((r) => r.json())
        .then((j) => {
          const rows = (j.data ?? []) as PolicyProgram[];
          setPrograms(rows);
          if (rows.length > 0 && !selectedProgramId)
            setSelectedProgramId(rows[0].id);
        })
        .catch(() => showToast("Failed to load program rules", false))
        .finally(() => setPolicyLoading(false));
    }
  }, [canManageAcademic, tab, academicSubTab]);

  useEffect(() => {
    const prog = programs.find((p) => p.id === selectedProgramId);
    if (!prog) return;
    setPolicyForm(toEditablePolicy(prog));
    setPolicyDelivery(prog.delivery_type ?? "compulsory");
    setPolicyFreq(prog.session_frequency_per_week === 2 ? 2 : 1);
    setPolicyEnabled(Boolean(prog.school_progression_enabled));
    setPolicyDirty(false);
  }, [selectedProgramId, programs]);

  // Catalog
  useEffect(() => {
    if (!canManageAcademic || tab !== "teaching-templates") return;
    setCatalogLoading(true);
    fetch("/api/platform-syllabus-catalog/summary")
      .then((r) => r.json())
      .then((j) => {
        const d = (j.data ?? null) as CatalogSummary | null;
        setCatalogData(d);
        if (d?.active_catalog_version && !catalogVersion) {
          setCatalogVersion(d.active_catalog_version);
          setTemplateForm((f) => ({
            ...f,
            catalog_version: d.active_catalog_version || "",
          }));
        }
      })
      .catch(() => showToast("Failed to load templates", false))
      .finally(() => setCatalogLoading(false));
  }, [canManageAcademic, tab]);

  useEffect(() => {
    if (
      !canManageAcademic ||
      tab !== "teaching-templates" ||
      catalogSubTab !== "manage" ||
      !catalogVersion
    )
      return;
    loadBlueprints();
  }, [catalogSubTab, catalogVersion, canManageAcademic, tab]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/portal-users/${profile?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: profileData.full_name,
          phone: profileData.phone,
          bio: profileData.bio,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed");
      }
      await refreshProfile();
      setEditing(false);
      showToast("Profile updated");
    } catch (e: any) {
      showToast(e.message ?? "Failed", false);
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setPushState(perm);
    showToast(
      perm === "granted"
        ? "Push notifications enabled!"
        : "Push permission denied.",
      perm === "granted"
    );
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwData.newPw !== pwData.confirm) {
      showToast("Passwords do not match", false);
      return;
    }
    if (pwData.newPw.length < 8) {
      showToast("Password must be at least 8 characters", false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await createClient().auth.updateUser({
        password: pwData.newPw,
      });
      if (error) throw error;
      setPwData({ newPw: "", confirm: "" });
      showToast("Password changed");
    } catch (e: any) {
      showToast(e.message ?? "Failed", false);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", false);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("Image must be under 2MB", false);
      return;
    }
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Upload failed");
      }
      await refreshProfile();
      showToast("Avatar updated");
    } catch (e: any) {
      showToast(e.message || "Upload failed", false);
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveAiSettings = async () => {
    setAiSaving(true);
    try {
      const res = await fetch("/api/app-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: Object.entries(aiSettings).map(([key, value]) => ({
            key,
            value,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      showToast("Settings saved");
    } catch (e: any) {
      showToast(e.message ?? "Failed", false);
    } finally {
      setAiSaving(false);
    }
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    setTemplateSaving(true);
    try {
      const { id, ...payload } = editingTemplate;
      const { error } = await createClient()
        .from("notification_templates")
        .upsert(
          { ...payload, ...(id ? { id } : {}) },
          { onConflict: "name,type" }
        );
      if (error) throw error;
      setEditingTemplate(null);
      const { data } = await createClient()
        .from("notification_templates")
        .select("*")
        .order("type")
        .order("name");
      setTemplates(data ?? []);
      showToast("Template saved");
    } catch (e: any) {
      showToast(e.message ?? "Failed", false);
    } finally {
      setTemplateSaving(false);
    }
  };

  const loadMismatches = async () => {
    setRepairLoading(true);
    try {
      const r = await fetch("/api/admin/fix-school-mismatch");
      const d = await r.json();
      setMismatches(d.mismatches ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setRepairLoading(false);
    }
  };

  const loadSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const r = await fetch("/api/admin/fix-school-mismatch", {
        method: "PATCH",
      });
      const d = await r.json();
      setSuggestions(d.suggestions ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const runRepair = async (
    action: "align_student" | "unenroll" | "restore_from_history",
    studentIds: string[]
  ) => {
    if (!confirm(`Apply "${action}" to ${studentIds.length} records?`)) return;
    setRepairing(true);
    try {
      const res = await fetch("/api/admin/fix-school-mismatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, studentIds }),
      });
      const d = await res.json();
      if (d.success) {
        showToast(`Repaired ${d.applied} records`);
        loadMismatches();
        loadSuggestions();
      } else throw new Error(d.error || "Repair failed");
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setRepairing(false);
    }
  };

  // Operations
  const saveOps = async () => {
    if (opsReadonly) return;
    setOpsSaving(true);
    try {
      const res = await fetch("/api/progression/operations-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: opsData }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      showToast("Settings saved");
    } catch (e: any) {
      showToast(e.message ?? "Save failed", false);
    } finally {
      setOpsSaving(false);
    }
  };

  const updateOpsValue = (section: string, key: string, value: unknown) => {
    setOpsData((prev) => ({
      ...prev,
      [section]: { ...(prev[section] ?? {}), [key]: value },
    }));
  };

  const saveAcademicYear = async () => {
    if (!academicYearSetting) return;
    setAcademicYearSaving(true);
    try {
      const body: Record<string, string> = { year: academicYearSetting };
      if (profile?.school_id) body.school_id = profile.school_id;
      const res = await fetch("/api/settings/academic-year", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      await loadAcademicCalendarSettings();
      showToast("Academic year saved");
    } catch (e: any) {
      showToast(e.message ?? "Save failed", false);
    } finally {
      setAcademicYearSaving(false);
    }
  };

  const saveTermCalendar = async () => {
    setTermCalendarSaving(true);
    try {
      const calendar = {
        term1: { start: termCalendar.term1_start, end: termCalendar.term1_end },
        term2: { start: termCalendar.term2_start, end: termCalendar.term2_end },
        term3: { start: termCalendar.term3_start, end: termCalendar.term3_end },
      };
      const body: Record<string, unknown> = {
        year: academicYearSetting,
        term_calendar: calendar,
      };
      if (profile?.school_id) body.school_id = profile.school_id;
      const res = await fetch("/api/settings/academic-year", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      await loadAcademicCalendarSettings();
      showToast(
        "Term dates saved" +
          (profile?.school_id ? " for your school" : " platform-wide")
      );
    } catch (e: any) {
      showToast(e.message ?? "Save failed", false);
    } finally {
      setTermCalendarSaving(false);
    }
  };

  const saveCurrentTerm = async () => {
    if (!currentTermId) return;
    setCurrentTermSaving(true);
    try {
      const body: Record<string, unknown> = { current_term_id: currentTermId };
      if (profile?.school_id) body.school_id = profile.school_id;
      const res = await fetch("/api/settings/academic-year", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      await loadAcademicCalendarSettings();
      showToast("Current academic term updated");
    } catch (e: any) {
      showToast(e.message ?? "Save failed", false);
    } finally {
      setCurrentTermSaving(false);
    }
  };

  const updatePolicy = <K extends keyof EditablePolicy>(
    key: K,
    value: EditablePolicy[K]
  ) => {
    setPolicyForm((f) => ({ ...f, [key]: value }));
    setPolicyDirty(true);
  };

  // Policy
  const savePolicy = async () => {
    const prog = programs.find((p) => p.id === selectedProgramId);
    if (!prog) return;
    setPolicySaving(true);
    try {
      const res = await fetch("/api/progression/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: prog.id,
          delivery_type: policyDelivery,
          session_frequency_per_week: policyFreq,
          school_progression_enabled: policyEnabled,
          ...policyForm,
          track_priority: policyForm.track_priority.filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setPrograms((prev) =>
        prev.map((p) =>
          p.id === prog.id
            ? {
                ...p,
                delivery_type: policyDelivery,
                session_frequency_per_week: policyFreq,
                school_progression_enabled: policyEnabled,
              }
            : p
        )
      );
      setPolicyDirty(false);
      showToast("Rules saved for " + prog.name);
    } catch (e: any) {
      showToast(e.message ?? "Save failed", false);
    } finally {
      setPolicySaving(false);
    }
  };

  // Catalog
  const loadBlueprints = async () => {
    if (!catalogVersion) return;
    setBlueprintsLoading(true);
    try {
      const res = await fetch(
        `/api/platform-syllabus-template?catalog_version=${catalogVersion}`
      );
      const json = await res.json();
      setCatalogBlueprints(json.data?.rows ?? []);
    } catch {
      showToast("Failed to load templates", false);
    } finally {
      setBlueprintsLoading(false);
    }
  };

  const purgeBlueprint = async (id: string) => {
    setPurging(id);
    try {
      const res = await fetch(`/api/platform-syllabus-template?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      setCatalogBlueprints((prev) => prev.filter((b) => b.id !== id));
      setCatalogData((prev) =>
        prev ? { ...prev, total_rows: prev.total_rows - 1 } : prev
      );
      showToast("Template deleted");
    } catch {
      showToast("Delete failed", false);
    } finally {
      setPurging(null);
    }
  };

  const saveSpineRow = async (id: string) => {
    if (!editRowTopic.trim()) return;
    setSavingRowId(id);
    try {
      const res = await fetch("/api/platform-syllabus-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          topic: editRowTopic.trim(),
          subtopics: editRowSubs
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(j.error || "Save failed", false);
        return;
      }
      setCatalogBlueprints((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, topic: j.data.topic, subtopics: j.data.subtopics }
            : r
        )
      );
      setEditingRowId(null);
      showToast("Topic updated");
    } catch {
      showToast("Save failed", false);
    } finally {
      setSavingRowId(null);
    }
  };

  const addTemplate = async () => {
    if (
      !templateForm.topic ||
      !templateForm.catalog_version ||
      !templateForm.program_id
    ) {
      showToast("Version, Program, and Topic are required", false);
      return;
    }
    setTemplateBusy(true);
    try {
      const subtopicsArr = templateForm.subtopics
        ? templateForm.subtopics
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const res = await fetch("/api/platform-syllabus-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...templateForm,
          subtopics: subtopicsArr,
          week_index: templateForm.week_number,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast("Template added");
      setShowAddTemplate(false);
      setCatalogLoading(true);
      fetch("/api/platform-syllabus-catalog/summary")
        .then((r) => r.json())
        .then((j) => setCatalogData(j.data ?? null))
        .finally(() => setCatalogLoading(false));
      if (catalogSubTab === "manage") loadBlueprints();
    } catch {
      showToast("Save failed", false);
    } finally {
      setTemplateBusy(false);
    }
  };

  const aiSuggestTopic = async () => {
    if (!templateForm.program_id || !templateForm.lane_index) {
      showToast("Select Program and Lane first", false);
      return;
    }
    setTemplateAiLoading(true);
    try {
      const res = await fetch("/api/platform-syllabus-template/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: templateForm.program_id,
          lane_index: templateForm.lane_index,
          year_number: templateForm.year_number,
          term_number: templateForm.term_number,
          week_number: templateForm.week_number,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI failed");
      setTemplateForm((f) => ({
        ...f,
        topic: j.topic ?? f.topic,
        subtopics: Array.isArray(j.subtopics)
          ? j.subtopics.join("\n")
          : f.subtopics,
      }));
      showToast("AI suggestion applied");
    } catch (e: any) {
      showToast(e.message ?? "AI suggestion failed", false);
    } finally {
      setTemplateAiLoading(false);
    }
  };

  // ── Role colors ────────────────────────────────────────────────────────────
  const roleColor: Record<string, string> = {
    admin: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    teacher: "bg-primary/20 text-primary border-primary/30",
    student: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  };

  const currentOpsPillar =
    OPS_PILLARS.find((p) => p.id === opsActivePillar) || OPS_PILLARS[0];

  if (authLoading)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
        <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  if (!profile) return null;

  return (
    <div className={`min-h-screen bg-background text-foreground ${embedded ? '' : MOBILE_PAGE_BOTTOM}`}>
      <div
        className={`${
          embedded ? "max-w-5xl" : "max-w-4xl"
        } mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8`}
      >
        {!embedded ? (
          <MobilePageHero
            badge="Account · Settings"
            title="Settings"
            description="Manage your account, academic rules, and platform configuration."
            icon={CogIcon}
          />
        ) : null}

        {/* Toast */}
        {toast && (
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${
              toast.ok
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
            }`}
          >
            {toast.ok ? (
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
            )}
            {toast.msg}
          </div>
        )}

        <div
          className={
            embedded ? "block" : "grid grid-cols-1 lg:grid-cols-4 gap-6"
          }
        >
          {/* Sidebar */}
          <div className={embedded ? "hidden" : "lg:col-span-1 space-y-4"}>
            <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl text-center">
              <div className="relative inline-block mb-4">
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl font-black text-foreground mx-auto overflow-hidden border border-primary/20">
                  {profile.profile_image_url ? (
                    <img
                      src={profile.profile_image_url}
                      alt={profile.full_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (profile.full_name ?? "U")[0].toUpperCase()
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <ArrowPathIcon className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-background border border-border rounded-xl flex items-center justify-center hover:bg-muted transition-colors cursor-pointer">
                  <CameraIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={avatarUploading}
                  />
                </label>
              </div>
              <p className="font-bold text-foreground text-sm truncate">
                {profile.full_name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {profile.email}
              </p>
              <span
                className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${
                  roleColor[profile.role] ??
                  "bg-muted text-muted-foreground border-border"
                }`}
              >
                {profile.role}
              </span>
            </div>

            <nav className="bg-card shadow-sm border border-border rounded-xl p-2 space-y-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    tab === t.id
                      ? "bg-primary text-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className={embedded ? "w-full" : "lg:col-span-3"}>
            {/* ── Profile ── */}
            {tab === "profile" && (
              <div className="space-y-6">
                <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-6 border-b border-border">
                    <div>
                      <h2 className="font-bold text-foreground">
                        Profile Information
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Update your personal details
                      </p>
                    </div>
                    {!editing ? (
                      <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-white/15 rounded-xl text-sm font-bold transition-colors"
                      >
                        <PencilIcon className="w-3.5 h-3.5" /> Edit
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(false)}
                          className="px-4 py-2 bg-card hover:bg-muted rounded-xl text-sm font-bold text-muted-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveProfile}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-primary rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                        >
                          {saving ? (
                            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckIcon className="w-3.5 h-3.5" />
                          )}{" "}
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Full Name
                      </label>
                      {editing ? (
                        <input
                          type="text"
                          value={profileData.full_name}
                          onChange={(e) =>
                            setProfileData((p) => ({
                              ...p,
                              full_name: e.target.value,
                            }))
                          }
                          className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                        />
                      ) : (
                        <p className="text-foreground font-semibold">
                          {profileData.full_name || "—"}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Email Address
                      </label>
                      <div className="flex items-center gap-2">
                        <EnvelopeIcon className="w-4 h-4 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                          {profileData.email}
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-card border border-border rounded-full text-muted-foreground">
                          Cannot edit
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Phone Number
                      </label>
                      {editing ? (
                        <div className="relative">
                          <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input
                            type="tel"
                            value={profileData.phone}
                            onChange={(e) =>
                              setProfileData((p) => ({
                                ...p,
                                phone: e.target.value,
                              }))
                            }
                            placeholder="+234 800 000 0000"
                            className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                          />
                        </div>
                      ) : (
                        <p className="text-foreground font-semibold">
                          {profileData.phone || (
                            <span className="text-muted-foreground">
                              Not set
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Bio
                      </label>
                      {editing ? (
                        <textarea
                          value={profileData.bio}
                          rows={3}
                          onChange={(e) =>
                            setProfileData((p) => ({
                              ...p,
                              bio: e.target.value,
                            }))
                          }
                          placeholder="Tell us a little about yourself…"
                          className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors resize-none placeholder-muted-foreground"
                        />
                      ) : (
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {profileData.bio || "No bio yet"}
                        </p>
                      )}
                    </div>
                    <div className="pt-4 border-t border-border">
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Account Role
                      </label>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-bold border capitalize ${
                          roleColor[profile.role] ??
                          "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {profile.role}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Contact an admin to change your role.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6">
                  <h3 className="text-sm font-black text-foreground flex items-center gap-2 uppercase tracking-wider">
                    <ExclamationTriangleIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    Danger Zone
                  </h3>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Permanently delete your account and all associated personal
                    data. This action cannot be undone.
                  </p>
                  <a
                    href="/account-deletion"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-black text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-all uppercase tracking-wider"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    Request Account Deletion
                  </a>
                </div>
              </div>
            )}

            {/* ── Security ── */}
            {tab === "security" && (
              <div className="space-y-4">
                <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                        <KeyIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-bold">Change Password</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          You are already signed in — no current password needed
                        </p>
                      </div>
                    </div>
                  </div>
                  <form onSubmit={changePassword} className="p-6 space-y-4">
                    {(["newPw", "confirm"] as const).map((field) => (
                      <div key={field}>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                          {field === "newPw"
                            ? "New Password"
                            : "Confirm New Password"}
                        </label>
                        <div className="relative">
                          <input
                            type={showPw ? "text" : "password"}
                            value={pwData[field]}
                            onChange={(e) =>
                              setPwData((p) => ({
                                ...p,
                                [field]: e.target.value,
                              }))
                            }
                            required
                            minLength={8}
                            placeholder="Minimum 8 characters"
                            className="w-full pl-4 pr-10 py-3 bg-card border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPw((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          >
                            {showPw ? (
                              <EyeSlashIcon className="w-4 h-4" />
                            ) : (
                              <EyeIcon className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                    {pwData.newPw && pwData.confirm && (
                      <p
                        className={`text-xs font-semibold flex items-center gap-1.5 ${
                          pwData.newPw === pwData.confirm
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {pwData.newPw === pwData.confirm ? (
                          <CheckIcon className="w-3.5 h-3.5" />
                        ) : (
                          "✗"
                        )}
                        {pwData.newPw === pwData.confirm
                          ? "Passwords match"
                          : "Passwords do not match"}
                      </p>
                    )}
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-600 dark:text-amber-400">
                      For security, you will be signed out of other devices
                      after changing your password.
                    </div>
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        pwData.newPw !== pwData.confirm ||
                        pwData.newPw.length < 8
                      }
                      className="flex items-center gap-2 px-6 py-3 bg-primary rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      {saving ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheckIcon className="w-4 h-4" />
                      )}{" "}
                      Update Password
                    </button>
                  </form>
                </div>
                <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-3">
                  <h3 className="font-bold flex items-center gap-2">
                    <ShieldCheckIcon className="w-4 h-4 text-primary" /> Account
                    Security
                  </h3>
                  <div className="space-y-2 text-sm">
                    {[
                      ["Email", profile.email],
                      ["Role", profile.role],
                      ["Status", "Active"],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between py-2 border-b border-border last:border-0"
                      >
                        <span className="text-muted-foreground">{k}</span>
                        <span
                          className={`font-bold ${
                            k === "Status"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground capitalize"
                          }`}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Notifications ── */}
            {tab === "notifications" && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border">
                  <h2 className="font-bold">Notification Preferences</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose what you want to be notified about
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  {Object.entries(notifs).map(([key, val]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-3 border-b border-border last:border-0"
                    >
                      <div>
                        <p className="font-semibold capitalize text-sm">
                          {key}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {key === "assignments" &&
                            "New assignments and due date reminders"}
                          {key === "grades" &&
                            "When your submissions are graded"}
                          {key === "announcements" &&
                            "Important school announcements"}
                          {key === "newsletters" &&
                            "Monthly newsletters and updates"}
                        </p>
                      </div>
                      <Toggle
                        checked={val}
                        onChange={(v) => setNotifs((p) => ({ ...p, [key]: v }))}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem(
                          "rillcod_notif_prefs",
                          JSON.stringify(notifs)
                        );
                        showToast("Preferences saved");
                      } catch {
                        showToast("Failed to save", false);
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary rounded-xl text-sm font-bold transition-all mt-4"
                  >
                    <CheckIcon className="w-4 h-4" /> Save Preferences
                  </button>
                  <div className="mt-8 pt-6 border-t border-border">
                    <h3 className="font-bold text-sm">App & device alerts</h3>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                      {pushState === "granted"
                        ? "Alerts are enabled on this device for classes, payments, and important updates. You can turn them off anytime in system settings."
                        : pushState === "denied"
                        ? "Notifications are blocked. Enable them in your phone or browser settings if you want alerts."
                        : "Optional: enable alerts for classes, payments, and important updates. You can decline and still use the app fully."}
                    </p>
                    {pushState !== "granted" && pushState !== "denied" && (
                      <button
                        onClick={enablePush}
                        className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground rounded-xl text-xs font-bold transition-all"
                      >
                        <BellIcon className="w-4 h-4 text-primary" /> Enable
                        alerts on this device
                      </button>
                    )}
                    {pushState === "granted" && (
                      <button
                        onClick={async () => {
                          const res = await fetch("/api/test-push", {
                            method: "POST",
                          });
                          const d = await res.json();
                          showToast(
                            res.ok && d.debug?.success
                              ? "Test sent!"
                              : `Failed: ${d.error || "Unknown"}`,
                            res.ok && d.debug?.success
                          );
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold transition-all"
                      >
                        <BellIcon className="w-4 h-4" /> Send test notification
                      </button>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-3">
                      See our{" "}
                      <a
                        href="/privacy-policy"
                        className="text-primary underline underline-offset-2"
                      >
                        Privacy Policy
                      </a>{" "}
                      for how notification tokens are used.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── My Schools (teacher) ── */}
            {tab === "schools" && profile?.role === "teacher" && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <BuildingOfficeIcon className="w-4 h-4 text-primary" />
                      <h2 className="font-bold">Assigned Schools</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Partner schools you currently teach at
                    </p>
                  </div>
                  <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
                    {schools.length} school{schools.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {schoolsLoading ? (
                  <div className="p-8 flex items-center justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                  </div>
                ) : schools.length === 0 ? (
                  <div className="p-10 text-center">
                    <BuildingOfficeIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-semibold">
                      No schools assigned yet
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Ask an admin to assign you to a school.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {schools.map((ts: any) => {
                      const s = ts.schools ?? {};
                      return (
                        <div
                          key={ts.id}
                          className="p-5 hover:bg-card transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                              <BuildingOfficeIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <p className="font-bold">{s.name}</p>
                                {ts.is_primary && (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-full border border-amber-500/30">
                                    <StarIcon className="w-3 h-3" /> Primary
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                                    s.is_active
                                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                      : "bg-muted text-muted-foreground border-border"
                                  }`}
                                >
                                  {s.is_active ? "Active" : "Inactive"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {(s.city || s.state) && (
                                  <span className="flex items-center gap-1">
                                    <MapPinIcon className="w-3.5 h-3.5" />
                                    {[s.city, s.state]
                                      .filter(Boolean)
                                      .join(", ")}
                                  </span>
                                )}
                                {s.phone && <span>{s.phone}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="p-4 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">
                    Contact an admin to update your school assignments.
                  </p>
                </div>
              </div>
            )}

            {/* ── Academic Rules ── */}
            {tab === "academic-rules" && canManageAcademic && (
              <div className="space-y-4">
                <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-border">
                    <h2 className="font-bold">Academic Rules</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Platform-wide settings and per-program delivery rules
                    </p>
                  </div>
                  {/* Sub-tabs — Platform Settings visible to admin + teacher */}
                  <div className="flex gap-1 p-2 bg-muted/20 border-b border-border">
                    {[
                      {
                        id: "platform",
                        label: "Calendar & Settings",
                        adminOnly: false,
                      },
                      {
                        id: "programs",
                        label: "Program Rules",
                        adminOnly: false,
                      },
                    ]
                      .filter((st) => !st.adminOnly || isAdmin)
                      .map((st) => (
                        <button
                          key={st.id}
                          onClick={() => setAcademicSubTab(st.id as any)}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                            academicSubTab === st.id
                              ? "bg-card shadow text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                  </div>

                  {/* Platform Settings sub-tab */}
                  {academicSubTab === "platform" && (
                    <div className="divide-y divide-border">
                      {/* ── Academic Year ── */}
                      <div className="p-4 space-y-3">
                        <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                          Academic Year
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {profile?.school_id
                            ? "Sets the academic year for your school. Admins can set it platform-wide."
                            : "Platform-wide default — applies to all schools that have not set their own."}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={academicYearSetting}
                            onChange={(e) =>
                              setAcademicYearSetting(e.target.value)
                            }
                            className="px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                          >
                            {[
                              "2023/2024",
                              "2024/2025",
                              "2025/2026",
                              "2026/2027",
                            ].map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={saveAcademicYear}
                            disabled={academicYearSaving}
                            className="flex items-center gap-2 px-5 py-2 bg-primary rounded-xl text-xs font-bold disabled:opacity-50"
                          >
                            {academicYearSaving ? (
                              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckIcon className="w-3.5 h-3.5" />
                            )}
                            Save Year
                          </button>
                        </div>
                      </div>

                      {/* ── Current Term ── */}
                      <div className="p-4 space-y-3 bg-primary/5 border-y border-primary/10">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                              Current Active Term
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              This controls the default term used by class
                              placement, attendance sessions, lesson plans, and
                              reports.
                            </p>
                          </div>
                          {(() => {
                            const live = liveAcademicSession();
                            const selected = academicTerms.find(
                              (t) => t.id === currentTermId
                            );
                            const isLive = !!(
                              selected &&
                              selected.academic_year === live.periodLabel &&
                              selected.term_label === live.termLabel
                            );
                            return isLive ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                                Active Now
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                          <select
                            value={currentTermId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setCurrentTermId(id);
                              const term = academicTerms.find(
                                (t) => t.id === id
                              );
                              if (term?.academic_year)
                                setAcademicYearSetting(term.academic_year);
                              if (term) {
                                setTermCalendar((p) => ({
                                  ...p,
                                  [`term${term.term_number}_start`]:
                                    term.start_date ??
                                    p[
                                      `term${term.term_number}_start` as keyof typeof p
                                    ],
                                  [`term${term.term_number}_end`]:
                                    term.end_date ??
                                    p[
                                      `term${term.term_number}_end` as keyof typeof p
                                    ],
                                }));
                              }
                            }}
                            className="px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                          >
                            <option value="">Select current term</option>
                            {academicTerms.map((term) => {
                              const live = liveAcademicSession();
                              const isLive =
                                term.academic_year === live.periodLabel &&
                                term.term_label === live.termLabel;
                              return (
                                <option key={term.id} value={term.id}>
                                  {term.academic_year} · {term.term_label}
                                  {isLive ? " (Current)" : ""}
                                </option>
                              );
                            })}
                          </select>
                          <button
                            onClick={saveCurrentTerm}
                            disabled={
                              currentTermSaving || !currentTermId || !isAdmin
                            }
                            className="flex items-center justify-center gap-2 px-5 py-2 bg-primary rounded-xl text-xs font-bold text-primary-foreground disabled:opacity-50"
                          >
                            {currentTermSaving ? (
                              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckIcon className="w-3.5 h-3.5" />
                            )}
                            {isAdmin ? "Set Current Term" : "Admin Only"}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {academicTerms
                            .filter(
                              (t) => t.academic_year === academicYearSetting
                            )
                            .sort((a, b) => a.term_number - b.term_number)
                            .map((term) => (
                              <div
                                key={term.id}
                                className={`rounded-xl border p-3 ${
                                  term.id === currentTermId
                                    ? "border-primary bg-primary/10"
                                    : "border-border bg-background"
                                }`}
                              >
                                <p className="text-xs font-black text-foreground">
                                  {term.term_label}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {term.start_date || "No start"} →{" "}
                                  {term.end_date || "No end"}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* ── Term Calendar ── */}
                      <div className="p-4 space-y-3">
                        <div>
                          <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                            Term Calendar
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {profile?.school_id
                              ? "Configure actual term start and end dates for your school. The system uses these to auto-detect the current term."
                              : "Default dates for all schools (Nigerian national calendar). Schools can override with their own dates."}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {(
                            [
                              {
                                label: "First Term",
                                startKey: "term1_start",
                                endKey: "term1_end",
                                hint: "Sept – Dec",
                              },
                              {
                                label: "Second Term",
                                startKey: "term2_start",
                                endKey: "term2_end",
                                hint: "Jan – Apr",
                              },
                              {
                                label: "Third Term",
                                startKey: "term3_start",
                                endKey: "term3_end",
                                hint: "May – Aug",
                              },
                            ] as const
                          ).map((t) => (
                            <div
                              key={t.startKey}
                              className="grid grid-cols-[120px_1fr_1fr] gap-2 items-center"
                            >
                              <span className="text-xs font-semibold text-foreground">
                                {t.label}{" "}
                                <span className="text-[10px] text-muted-foreground">
                                  ({t.hint})
                                </span>
                              </span>
                              <div>
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-1">
                                  Start
                                </label>
                                <input
                                  type="date"
                                  value={termCalendar[t.startKey]}
                                  onChange={(e) =>
                                    setTermCalendar((p) => ({
                                      ...p,
                                      [t.startKey]: e.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs focus:outline-none focus:border-primary"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-1">
                                  End
                                </label>
                                <input
                                  type="date"
                                  value={termCalendar[t.endKey]}
                                  onChange={(e) =>
                                    setTermCalendar((p) => ({
                                      ...p,
                                      [t.endKey]: e.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 bg-background border border-border rounded-xl text-xs focus:outline-none focus:border-primary"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={saveTermCalendar}
                          disabled={termCalendarSaving}
                          className="flex items-center gap-2 px-5 py-2 bg-primary rounded-xl text-xs font-bold disabled:opacity-50"
                        >
                          {termCalendarSaving ? (
                            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckIcon className="w-3.5 h-3.5" />
                          )}
                          Save Term Dates
                          {profile?.school_id
                            ? " for My School"
                            : " (Platform Default)"}
                        </button>
                      </div>

                      {/* ── OPS Pillars (admin only) ── */}
                      {isAdmin && (
                        <div>
                          {opsLoading ? (
                            <div className="p-10 flex justify-center">
                              <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                            </div>
                          ) : Object.keys(opsData).length === 0 ? (
                            <div className="p-10 text-center space-y-3">
                              <BoltIcon className="w-10 h-10 mx-auto text-muted-foreground/30" />
                              <p className="text-sm font-semibold text-muted-foreground">
                                No platform settings have been configured yet
                              </p>
                              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                                Settings are created the first time you save
                                this section. Contact your system administrator
                                if you expect to see options here.
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {/* Pillar selector */}
                              <div className="p-4 flex gap-2 flex-wrap">
                                {OPS_PILLARS.map((p) => (
                                  <button
                                    key={p.id}
                                    onClick={() => setOpsActivePillar(p.id)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                                      opsActivePillar === p.id
                                        ? "bg-primary text-white border-primary"
                                        : "border-border text-muted-foreground hover:border-primary/40"
                                    }`}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                              {/* Settings for active pillar */}
                              <div className="p-4 space-y-4">
                                {currentOpsPillar.sections.map((sectionId) => {
                                  const block = opsData[sectionId] || {};
                                  const meta = OPS_SECTION_META[sectionId] || {
                                    label: sectionId,
                                    desc: "",
                                  };
                                  if (Object.keys(block).length === 0)
                                    return null;
                                  return (
                                    <div
                                      key={sectionId}
                                      className="border border-border rounded-xl overflow-hidden"
                                    >
                                      <div className="px-4 py-3 bg-muted/20 border-b border-border">
                                        <p className="text-xs font-bold text-foreground">
                                          {meta.label}
                                        </p>
                                        {meta.desc && (
                                          <p className="text-[10px] text-muted-foreground mt-0.5">
                                            {meta.desc}
                                          </p>
                                        )}
                                      </div>
                                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {Object.entries(block).map(
                                          ([key, value]) => (
                                            <div key={key}>
                                              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                                {humaniseKey(key)}
                                              </label>
                                              {isBool(value) ? (
                                                <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-background">
                                                  <span className="text-xs font-bold text-foreground">
                                                    {value ? "On" : "Off"}
                                                  </span>
                                                  <Toggle
                                                    checked={value}
                                                    onChange={(v) =>
                                                      updateOpsValue(
                                                        sectionId,
                                                        key,
                                                        v
                                                      )
                                                    }
                                                  />
                                                </div>
                                              ) : isNum(value) ? (
                                                <input
                                                  type="number"
                                                  value={value}
                                                  disabled={
                                                    opsReadonly ||
                                                    ![
                                                      "admin",
                                                      "teacher",
                                                    ].includes(
                                                      profile?.role ?? ""
                                                    )
                                                  }
                                                  onChange={(e) =>
                                                    updateOpsValue(
                                                      sectionId,
                                                      key,
                                                      Number(e.target.value)
                                                    )
                                                  }
                                                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                                                />
                                              ) : (
                                                <input
                                                  type="text"
                                                  value={String(value ?? "")}
                                                  disabled={
                                                    opsReadonly ||
                                                    ![
                                                      "admin",
                                                      "teacher",
                                                    ].includes(
                                                      profile?.role ?? ""
                                                    )
                                                  }
                                                  onChange={(e) =>
                                                    updateOpsValue(
                                                      sectionId,
                                                      key,
                                                      e.target.value
                                                    )
                                                  }
                                                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                                                />
                                              )}
                                            </div>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                {currentOpsPillar.sections.every(
                                  (s) =>
                                    Object.keys(opsData[s] || {}).length === 0
                                ) && (
                                  <p className="text-sm text-muted-foreground text-center py-8">
                                    No settings configured for this category
                                    yet.
                                  </p>
                                )}
                              </div>
                              {!opsReadonly &&
                                ["admin", "teacher"].includes(
                                  profile?.role ?? ""
                                ) &&
                                Object.keys(opsData).length > 0 && (
                                  <div className="p-4 border-t border-border">
                                    <button
                                      onClick={saveOps}
                                      disabled={opsSaving}
                                      className="flex items-center gap-2 px-6 py-2.5 bg-primary rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
                                    >
                                      {opsSaving ? (
                                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <CheckIcon className="w-4 h-4" />
                                      )}
                                      {opsSaving
                                        ? "Saving…"
                                        : "Save Platform Settings"}
                                    </button>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Program Rules sub-tab */}
                  {academicSubTab === "programs" && (
                    <div>
                      {policyLoading ? (
                        <div className="p-10 flex justify-center">
                          <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                        </div>
                      ) : programs.length === 0 ? (
                        <div className="p-10 text-center text-muted-foreground text-sm">
                          No programs found.{" "}
                          <a
                            href="/dashboard/programs"
                            className="text-primary underline"
                          >
                            Create one →
                          </a>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {/* Program selector */}
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                Select Program
                              </label>
                              {policyDirty && (
                                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full animate-pulse">
                                  Unsaved changes
                                </span>
                              )}
                            </div>
                            <select
                              value={selectedProgramId}
                              onChange={(e) => {
                                if (
                                  policyDirty &&
                                  !confirm(
                                    "You have unsaved changes. Switch program and lose them?"
                                  )
                                )
                                  return;
                                setSelectedProgramId(e.target.value);
                              }}
                              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                            >
                              {programs.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {/* Program Basics */}
                          <div className="p-4 space-y-4">
                            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                              Program Basics
                            </p>
                            <div className="flex items-center justify-between py-2">
                              <div>
                                <p className="font-semibold text-sm">
                                  Program Active
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  When off, progression tracking is paused.
                                </p>
                              </div>
                              <Toggle
                                checked={policyEnabled}
                                onChange={(v) => {
                                  setPolicyEnabled(v);
                                  setPolicyDirty(true);
                                }}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                  Completion
                                </label>
                                <select
                                  value={policyDelivery}
                                  onChange={(e) => {
                                    setPolicyDelivery(
                                      e.target.value === "optional"
                                        ? "optional"
                                        : "compulsory"
                                    );
                                    setPolicyDirty(true);
                                  }}
                                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                                >
                                  <option value="compulsory">
                                    Required (Core)
                                  </option>
                                  <option value="optional">
                                    Optional (Elective)
                                  </option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                  Sessions / Week
                                </label>
                                <select
                                  value={policyFreq}
                                  onChange={(e) => {
                                    setPolicyFreq(
                                      e.target.value === "2" ? 2 : 1
                                    );
                                    setPolicyDirty(true);
                                  }}
                                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                                >
                                  <option value="1">Standard (1/week)</option>
                                  <option value="2">Intensive (2/week)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          {/* Programme Calendar */}
                          <div className="p-4 space-y-4 border-b border-border">
                            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                              Programme Calendar
                            </p>
                            <div>
                              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                Which term does this programme start?
                              </label>
                              <select
                                value={policyForm.program_start_term}
                                onChange={(e) =>
                                  updatePolicy(
                                    "program_start_term",
                                    Number(e.target.value) as 1 | 2 | 3
                                  )
                                }
                                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                              >
                                <option value={1}>
                                  Term 1 — September (default)
                                </option>
                                <option value={2}>
                                  Term 2 — January (started coding mid-year)
                                </option>
                                <option value={3}>
                                  Term 3 — May (started coding in third term)
                                </option>
                              </select>
                              <p className="text-[10px] text-muted-foreground mt-1.5">
                                This tells the AI which national calendar term
                                is "Year 1 — Foundations" for schools running
                                this programme. Curriculum generation will place
                                foundational content in the selected term.
                              </p>
                            </div>
                          </div>
                          {/* Learning Experience */}
                          <div className="p-4 space-y-4">
                            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                              How Students Learn
                            </p>
                            <div>
                              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                Content Unlocking
                              </label>
                              <select
                                value={policyForm.mastery_mode}
                                onChange={(e) =>
                                  setPolicyForm((f) => ({
                                    ...f,
                                    mastery_mode:
                                      e.target.value === "soft"
                                        ? "soft"
                                        : "strict",
                                  }))
                                }
                                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                              >
                                <option value="strict">
                                  Step by Step (pass one to unlock next)
                                </option>
                                <option value="soft">
                                  Open Access (browse freely)
                                </option>
                              </select>
                            </div>
                            {[
                              {
                                key: "strict_route_default",
                                label: "Follow Lesson Order",
                                desc: "Students must follow the designed sequence.",
                              },
                              {
                                key: "essential_routes_only",
                                label: "Core Content Only",
                                desc: "Hide bonus content, focus on main objectives.",
                              },
                              {
                                key: "auto_flashcards_default",
                                label: "Auto-Generate Flashcards",
                                desc: "Create flashcard sets from new lesson content.",
                              },
                              {
                                key: "project_based_default",
                                label: "Prioritise Projects",
                                desc: "Favour hands-on projects over lecture-style lessons.",
                              },
                            ].map((opt) => (
                              <div
                                key={opt.key}
                                className="flex items-center justify-between py-2"
                              >
                                <div>
                                  <p className="font-semibold text-sm">
                                    {opt.label}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {opt.desc}
                                  </p>
                                </div>
                                <Toggle
                                  checked={
                                    policyForm[
                                      opt.key as keyof EditablePolicy
                                    ] as boolean
                                  }
                                  onChange={(v) =>
                                    updatePolicy(
                                      opt.key as keyof EditablePolicy,
                                      v as never
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                          {/* Quality Standards */}
                          <div className="p-4 space-y-4">
                            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                              Quality Standards
                            </p>
                            <div className="grid grid-cols-3 gap-4">
                              {[
                                {
                                  key: "qa_min_pass_score",
                                  label: "Pass Mark (%)",
                                  min: 40,
                                  max: 100,
                                },
                                {
                                  key: "qa_required_teacher_steps",
                                  label: "Teaching Steps",
                                  min: 1,
                                  max: 8,
                                },
                                {
                                  key: "qa_required_student_steps",
                                  label: "Student Activities",
                                  min: 1,
                                  max: 8,
                                },
                              ].map((f) => (
                                <div key={f.key}>
                                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                    {f.label}
                                  </label>
                                  <input
                                    type="number"
                                    min={f.min}
                                    max={f.max}
                                    value={
                                      policyForm[
                                        f.key as keyof EditablePolicy
                                      ] as number
                                    }
                                    onChange={(e) =>
                                      updatePolicy(
                                        f.key as keyof EditablePolicy,
                                        Math.min(
                                          f.max,
                                          Math.max(
                                            f.min,
                                            Number(e.target.value)
                                          )
                                        ) as never
                                      )
                                    }
                                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-center focus:outline-none focus:border-primary"
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              {[
                                {
                                  key: "qa_assessment_drift_mode",
                                  label: "Assignment Variance",
                                },
                                {
                                  key: "qa_exam_drift_mode",
                                  label: "Exam Variance",
                                },
                                {
                                  key: "qa_five_step_mode",
                                  label: "Structure Check",
                                },
                              ].map((f) => (
                                <div key={f.key}>
                                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                    {f.label}
                                  </label>
                                  <select
                                    value={
                                      policyForm[
                                        f.key as keyof EditablePolicy
                                      ] as string
                                    }
                                    onChange={(e) =>
                                      updatePolicy(
                                        f.key as keyof EditablePolicy,
                                        e.target.value as never
                                      )
                                    }
                                    className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none"
                                  >
                                    <option value="warn">Warn only</option>
                                    <option value="fail">
                                      Block & Enforce
                                    </option>
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="p-4 flex items-center gap-3">
                            <button
                              onClick={savePolicy}
                              disabled={policySaving || !policyDirty}
                              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                policyDirty
                                  ? "bg-primary shadow-lg shadow-primary/20"
                                  : "bg-muted text-muted-foreground cursor-not-allowed"
                              } disabled:opacity-50`}
                            >
                              {policySaving ? (
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckIcon className="w-4 h-4" />
                              )}
                              {policySaving ? "Saving…" : "Save Program Rules"}
                            </button>
                            {!policyDirty && !policySaving && (
                              <span className="text-xs text-muted-foreground">
                                No changes to save
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Teaching Templates ── */}
            {tab === "teaching-templates" && canManageAcademic && (
              <div className="space-y-4">
                <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <div>
                      <h2 className="font-bold">Teaching Templates</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Week-by-week spine used to auto-fill syllabi — organised
                        by skill lane
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setTemplateForm((f) => ({
                            ...f,
                            catalog_version:
                              catalogData?.active_catalog_version ?? "",
                          }));
                          setShowAddTemplate(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shrink-0"
                      >
                        <PlusIcon className="w-3.5 h-3.5" /> Add Template
                      </button>
                    )}
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex gap-1 p-3 bg-muted/20 border-b border-border">
                    {[
                      { id: "overview", label: "Overview" },
                      { id: "manage", label: "Manage by Lane" },
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setCatalogSubTab(st.id as any)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          catalogSubTab === st.id
                            ? "bg-card shadow text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  {catalogLoading ? (
                    <div className="p-10 flex justify-center">
                      <div className="w-7 h-7 border-4 border-border border-t-emerald-500 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      {/* ── Overview ── */}
                      {catalogSubTab === "overview" && (
                        <div className="p-5 space-y-5">
                          {/* Status banner */}
                          <div
                            className={`rounded-xl border p-4 flex items-center gap-4 ${
                              catalogData && catalogData.total_rows > 0
                                ? "border-emerald-500/20 bg-emerald-500/5"
                                : "border-rose-500/20 bg-rose-500/5"
                            }`}
                          >
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${
                                catalogData && catalogData.total_rows > 0
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                              }`}
                            >
                              <BookOpenIcon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm">
                                {catalogData && catalogData.total_rows > 0
                                  ? `${
                                      catalogData.total_rows
                                    } week templates across ${
                                      (catalogData.lane_counts ?? []).length
                                    } lanes — auto-fill ready`
                                  : "No templates found — add templates to enable auto-fill"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {catalogData?.program_count ?? 0} programs ·
                                version{" "}
                                {catalogData?.active_catalog_version || "—"}
                              </p>
                            </div>
                          </div>

                          {/* Lane breakdown */}
                          {(catalogData?.lane_counts ?? []).length > 0 && (
                            <div className="border border-border rounded-xl overflow-hidden">
                              <div className="px-4 py-3 border-b border-border bg-muted/20">
                                <p className="text-xs font-bold text-foreground uppercase tracking-widest">
                                  Template Coverage by Skill Lane
                                </p>
                              </div>
                              <div className="divide-y divide-border/30">
                                {(catalogData?.lane_counts ?? []).map((row) => {
                                  const label =
                                    LANE_LABELS[row.lane_index] ??
                                    `Lane ${row.lane_index}`;
                                  const max = Math.max(
                                    ...(catalogData?.lane_counts ?? []).map(
                                      (r) => r.count
                                    ),
                                    1
                                  );
                                  const pct = Math.round(
                                    (row.count / max) * 100
                                  );
                                  return (
                                    <div
                                      key={row.lane_index}
                                      className="px-4 py-3 flex items-center gap-4"
                                    >
                                      <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded px-2 py-0.5 shrink-0 w-12 text-center">
                                        L{row.lane_index}
                                      </span>
                                      <div className="flex-1 min-w-0 space-y-1">
                                        <p className="text-xs font-semibold text-foreground truncate">
                                          {label}
                                        </p>
                                        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                      </div>
                                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 w-14 text-right">
                                        {row.count} wks
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Manage by Lane ── */}
                      {catalogSubTab === "manage" && (
                        <div>
                          {/* Toolbar: version + search + year filter */}
                          <div className="p-3 border-b border-border bg-muted/10 space-y-2">
                            {(catalogData?.versions ?? []).length > 1 && (
                              <select
                                value={catalogVersion}
                                onChange={(e) =>
                                  setCatalogVersion(e.target.value)
                                }
                                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                              >
                                {(catalogData?.versions ?? []).map((v) => (
                                  <option
                                    key={v.catalog_version}
                                    value={v.catalog_version}
                                  >
                                    {v.catalog_version} ({v.count} templates)
                                  </option>
                                ))}
                              </select>
                            )}
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                <input
                                  type="search"
                                  placeholder="Search topics…"
                                  value={spineSearch}
                                  onChange={(e) => {
                                    setSpineSearch(e.target.value);
                                    setManageExpandedLane(null);
                                  }}
                                  className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                              </div>
                              <select
                                value={spineYearFilter}
                                onChange={(e) =>
                                  setSpineYearFilter(Number(e.target.value))
                                }
                                className="px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary shrink-0"
                              >
                                <option value={0}>All years</option>
                                <option value={1}>Year 1</option>
                                <option value={2}>Year 2</option>
                                <option value={3}>Year 3</option>
                              </select>
                            </div>
                          </div>

                          {blueprintsLoading ? (
                            <div className="p-10 flex justify-center">
                              <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                            </div>
                          ) : catalogBlueprints.length === 0 ? (
                            <div className="p-10 text-center text-sm text-muted-foreground">
                              No templates for this version.
                            </div>
                          ) : (
                            (() => {
                              const q = spineSearch.toLowerCase().trim();
                              // Filter + group
                              const byLane = new Map<
                                number,
                                typeof catalogBlueprints
                              >();
                              for (const row of catalogBlueprints) {
                                if (
                                  spineYearFilter &&
                                  row.year_number !== spineYearFilter
                                )
                                  continue;
                                if (q && !row.topic?.toLowerCase().includes(q))
                                  continue;
                                const lane = row.lane_index ?? 0;
                                if (!byLane.has(lane)) byLane.set(lane, []);
                                byLane.get(lane)!.push(row);
                              }
                              const isSearching = !!(q || spineYearFilter);
                              if (byLane.size === 0)
                                return (
                                  <div className="p-10 text-center text-sm text-muted-foreground">
                                    No results matching your search.
                                  </div>
                                );

                              const TERM_NAMES = [
                                "",
                                "First Term",
                                "Second Term",
                                "Third Term",
                              ];

                              return (
                                <div className="divide-y divide-border/30">
                                  {Array.from(byLane.entries())
                                    .sort((a, b) => a[0] - b[0])
                                    .map(([laneIdx, laneRows]) => {
                                      const label =
                                        LANE_LABELS[laneIdx] ??
                                        `Lane ${laneIdx}`;
                                      const isExpanded =
                                        isSearching ||
                                        manageExpandedLane === laneIdx;

                                      // Sub-group by year then term
                                      const byYear = new Map<
                                        number,
                                        Map<number, typeof laneRows>
                                      >();
                                      for (const row of laneRows) {
                                        const yr = row.year_number ?? 1;
                                        const tm = row.term_number ?? 1;
                                        if (!byYear.has(yr))
                                          byYear.set(yr, new Map());
                                        const ytMap = byYear.get(yr)!;
                                        if (!ytMap.has(tm)) ytMap.set(tm, []);
                                        ytMap.get(tm)!.push(row);
                                      }

                                      return (
                                        <div key={laneIdx}>
                                          {/* Lane accordion header */}
                                          <button
                                            onClick={() => {
                                              setManageExpandedLane(
                                                isExpanded && !isSearching
                                                  ? null
                                                  : laneIdx
                                              );
                                              setSpineSearch("");
                                              setSpineYearFilter(0);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-4 active:bg-muted/20 hover:bg-muted/10 transition-colors text-left min-h-[56px]"
                                          >
                                            <span className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary text-[11px] font-black">
                                              {laneIdx}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-bold text-foreground leading-snug">
                                                {label}
                                              </p>
                                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                                {laneRows.length} week
                                                {laneRows.length !== 1
                                                  ? "s"
                                                  : ""}
                                              </p>
                                            </div>
                                            <ChevronRightIcon
                                              className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200 ${
                                                isExpanded ? "rotate-90" : ""
                                              }`}
                                            />
                                          </button>

                                          {/* Expanded content — card list per year/term */}
                                          {isExpanded && (
                                            <div className="border-t border-border/30 bg-muted/5">
                                              {Array.from(byYear.entries())
                                                .sort((a, b) => a[0] - b[0])
                                                .map(([yr, termMap]) => (
                                                  <div key={yr}>
                                                    {/* Year header */}
                                                    <div className="px-4 py-2 bg-muted/15 border-b border-border/20 flex items-center gap-2">
                                                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                                                        Year {yr}
                                                      </span>
                                                      <span className="text-[10px] text-muted-foreground/50">
                                                        ·
                                                      </span>
                                                      <span className="text-[10px] text-muted-foreground">
                                                        {yr === 1
                                                          ? "Foundations"
                                                          : yr === 2
                                                          ? "Application"
                                                          : "Mastery"}
                                                      </span>
                                                    </div>

                                                    {Array.from(
                                                      termMap.entries()
                                                    )
                                                      .sort(
                                                        (a, b) => a[0] - b[0]
                                                      )
                                                      .map(([tm, termRows]) => (
                                                        <div key={tm}>
                                                          {/* Term divider */}
                                                          <div className="px-4 py-1.5 bg-muted/10 border-b border-border/15">
                                                            <span className="text-[10px] font-bold text-muted-foreground">
                                                              {TERM_NAMES[tm] ??
                                                                `Term ${tm}`}
                                                            </span>
                                                          </div>

                                                          {/* Week cards */}
                                                          <div className="divide-y divide-border/20">
                                                            {termRows
                                                              .sort(
                                                                (a, b) =>
                                                                  (a.week_number ??
                                                                    0) -
                                                                  (b.week_number ??
                                                                    0)
                                                              )
                                                              .map((row) => {
                                                                const isEditing =
                                                                  editingRowId ===
                                                                  row.id;
                                                                return (
                                                                  <div
                                                                    key={row.id}
                                                                    className={`px-4 py-3 transition-colors ${
                                                                      isEditing
                                                                        ? "bg-primary/5 border-l-2 border-primary"
                                                                        : "hover:bg-muted/10"
                                                                    }`}
                                                                  >
                                                                    {isEditing ? (
                                                                      /* ── Edit mode ── */
                                                                      <div className="space-y-3">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                          <span className="text-[10px] font-black text-primary/70 bg-primary/10 rounded px-2 py-0.5">
                                                                            W
                                                                            {
                                                                              row.week_number
                                                                            }
                                                                          </span>
                                                                          <span className="text-[10px] text-muted-foreground">
                                                                            Editing
                                                                            topic
                                                                          </span>
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                            Topic
                                                                          </label>
                                                                          <input
                                                                            autoFocus
                                                                            className="w-full text-sm rounded-xl border border-primary/40 bg-background px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                                                            value={
                                                                              editRowTopic
                                                                            }
                                                                            onChange={(
                                                                              e
                                                                            ) =>
                                                                              setEditRowTopic(
                                                                                e
                                                                                  .target
                                                                                  .value
                                                                              )
                                                                            }
                                                                            onKeyDown={(
                                                                              e
                                                                            ) => {
                                                                              if (
                                                                                e.key ===
                                                                                  "Enter" &&
                                                                                !e.shiftKey
                                                                              ) {
                                                                                e.preventDefault();
                                                                                void saveSpineRow(
                                                                                  row.id
                                                                                );
                                                                              }
                                                                              if (
                                                                                e.key ===
                                                                                "Escape"
                                                                              )
                                                                                setEditingRowId(
                                                                                  null
                                                                                );
                                                                            }}
                                                                            maxLength={
                                                                              100
                                                                            }
                                                                          />
                                                                          <p className="text-right text-[10px] text-muted-foreground/50">
                                                                            {
                                                                              editRowTopic.length
                                                                            }
                                                                            /100
                                                                          </p>
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                                            Classroom
                                                                            activities{" "}
                                                                            <span className="font-normal">
                                                                              (one
                                                                              per
                                                                              line)
                                                                            </span>
                                                                          </label>
                                                                          <textarea
                                                                            className="w-full text-sm rounded-xl border border-border/50 bg-background px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 resize-none leading-relaxed"
                                                                            rows={
                                                                              4
                                                                            }
                                                                            placeholder={
                                                                              "e.g. Write a Python function that calculates BMI\ne.g. Debug a loop that prints wrong values"
                                                                            }
                                                                            value={
                                                                              editRowSubs
                                                                            }
                                                                            onChange={(
                                                                              e
                                                                            ) =>
                                                                              setEditRowSubs(
                                                                                e
                                                                                  .target
                                                                                  .value
                                                                              )
                                                                            }
                                                                          />
                                                                        </div>
                                                                        <div className="flex gap-2 pt-1">
                                                                          <button
                                                                            onClick={() =>
                                                                              void saveSpineRow(
                                                                                row.id
                                                                              )
                                                                            }
                                                                            disabled={
                                                                              savingRowId ===
                                                                                row.id ||
                                                                              !editRowTopic.trim()
                                                                            }
                                                                            className="flex-1 py-2.5 text-sm font-black rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 disabled:opacity-50 transition-all"
                                                                          >
                                                                            {savingRowId ===
                                                                            row.id
                                                                              ? "Saving…"
                                                                              : "Save changes"}
                                                                          </button>
                                                                          <button
                                                                            onClick={() =>
                                                                              setEditingRowId(
                                                                                null
                                                                              )
                                                                            }
                                                                            className="px-4 py-2.5 text-sm font-bold rounded-xl border border-border text-muted-foreground hover:bg-muted/20 active:scale-95 transition-all"
                                                                          >
                                                                            Cancel
                                                                          </button>
                                                                        </div>
                                                                      </div>
                                                                    ) : (
                                                                      /* ── View mode ── */
                                                                      <div className="flex items-start gap-3">
                                                                        <span className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg bg-muted/30 text-[11px] font-black text-muted-foreground">
                                                                          {
                                                                            row.week_number
                                                                          }
                                                                        </span>
                                                                        <div className="flex-1 min-w-0">
                                                                          <p
                                                                            className={`text-sm font-semibold leading-snug ${
                                                                              q &&
                                                                              row.topic
                                                                                ?.toLowerCase()
                                                                                .includes(
                                                                                  q
                                                                                )
                                                                                ? "text-primary"
                                                                                : "text-foreground"
                                                                            }`}
                                                                          >
                                                                            {
                                                                              row.topic
                                                                            }
                                                                          </p>
                                                                          {Array.isArray(
                                                                            row.subtopics
                                                                          ) &&
                                                                            row
                                                                              .subtopics
                                                                              .length >
                                                                              0 && (
                                                                              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                                                                                {row.subtopics.join(
                                                                                  " · "
                                                                                )}
                                                                              </p>
                                                                            )}
                                                                        </div>
                                                                        {isAdmin && (
                                                                          <div className="flex items-center gap-1 shrink-0 ml-1">
                                                                            <button
                                                                              onClick={() => {
                                                                                setEditingRowId(
                                                                                  row.id
                                                                                );
                                                                                setEditRowTopic(
                                                                                  row.topic ??
                                                                                    ""
                                                                                );
                                                                                setEditRowSubs(
                                                                                  Array.isArray(
                                                                                    row.subtopics
                                                                                  )
                                                                                    ? row.subtopics.join(
                                                                                        "\n"
                                                                                      )
                                                                                    : ""
                                                                                );
                                                                              }}
                                                                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/5 text-primary/60 hover:bg-primary/15 hover:text-primary active:scale-90 transition-all"
                                                                              title="Edit topic"
                                                                            >
                                                                              <PencilIcon className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <button
                                                                              onClick={() =>
                                                                                purgeBlueprint(
                                                                                  row.id
                                                                                )
                                                                              }
                                                                              disabled={
                                                                                purging ===
                                                                                row.id
                                                                              }
                                                                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-500/5 text-rose-600/70 dark:text-rose-400/70 hover:bg-rose-500 hover:text-white active:scale-90 disabled:opacity-40 transition-all"
                                                                              title="Delete"
                                                                            >
                                                                              <TrashIcon className="w-3.5 h-3.5" />
                                                                            </button>
                                                                          </div>
                                                                        )}
                                                                      </div>
                                                                    )}
                                                                  </div>
                                                                );
                                                              })}
                                                          </div>
                                                        </div>
                                                      ))}
                                                  </div>
                                                ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ── Add Template modal (admin) ── */}
                {showAddTemplate && isAdmin && (
                  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col max-h-[90vh]">
                      {/* Modal header */}
                      <div className="flex items-start justify-between p-6 border-b border-border shrink-0">
                        <div>
                          <h2 className="text-xl font-black">
                            Add Week Template
                          </h2>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Add a single week to the teaching spine, or use AI
                            to generate it.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowAddTemplate(false)}
                          className="p-2 rounded-lg bg-muted/50 hover:bg-rose-500 hover:text-white transition-all shrink-0"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Modal body */}
                      <div className="p-6 space-y-4 overflow-y-auto">
                        {/* Row 1: Program + Catalog Version */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              Program
                            </label>
                            {programs.length > 0 ? (
                              <select
                                value={templateForm.program_id}
                                onChange={(e) =>
                                  setTemplateForm((f) => ({
                                    ...f,
                                    program_id: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500 appearance-none"
                              >
                                <option value="">Select…</option>
                                {programs.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                disabled
                                placeholder="Loading…"
                                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm opacity-50"
                              />
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              Catalog Version
                            </label>
                            <input
                              value={templateForm.catalog_version}
                              onChange={(e) =>
                                setTemplateForm((f) => ({
                                  ...f,
                                  catalog_version: e.target.value,
                                }))
                              }
                              placeholder="qa_spine_v1"
                              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        {/* Row 2: Skill Lane (full width) */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Skill Lane
                          </label>
                          <select
                            value={templateForm.lane_index}
                            onChange={(e) =>
                              setTemplateForm((f) => ({
                                ...f,
                                lane_index: Number(e.target.value),
                              }))
                            }
                            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500 appearance-none"
                          >
                            {Object.entries(LANE_LABELS).map(([idx, label]) => (
                              <option key={idx} value={idx}>
                                L{idx} — {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Row 3: Year · Term · Week */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              Year
                            </label>
                            <select
                              value={templateForm.year_number}
                              onChange={(e) =>
                                setTemplateForm((f) => ({
                                  ...f,
                                  year_number: Number(e.target.value),
                                }))
                              }
                              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500 appearance-none"
                            >
                              <option value={1}>Year 1</option>
                              <option value={2}>Year 2</option>
                              <option value={3}>Year 3</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              Term
                            </label>
                            <select
                              value={templateForm.term_number}
                              onChange={(e) =>
                                setTemplateForm((f) => ({
                                  ...f,
                                  term_number: Number(e.target.value),
                                }))
                              }
                              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500 appearance-none"
                            >
                              <option value={1}>First</option>
                              <option value={2}>Second</option>
                              <option value={3}>Third</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              Week
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={templateForm.week_number}
                              onChange={(e) =>
                                setTemplateForm((f) => ({
                                  ...f,
                                  week_number: Number(e.target.value),
                                }))
                              }
                              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        {/* AI generate row */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={aiSuggestTopic}
                            disabled={
                              templateAiLoading ||
                              !templateForm.program_id ||
                              !templateForm.lane_index
                            }
                            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-primary/10 border border-primary/30 text-primary rounded-xl hover:bg-primary/20 transition-all disabled:opacity-40"
                          >
                            {templateAiLoading ? (
                              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <SparklesIcon className="w-3.5 h-3.5" />
                            )}
                            {templateAiLoading
                              ? "Generating…"
                              : "AI Suggest Topic"}
                          </button>
                          <p className="text-[11px] text-muted-foreground">
                            Select program + lane first, then let AI fill topic
                            &amp; subtopics.
                          </p>
                        </div>

                        {/* Topic */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Week Topic
                          </label>
                          <input
                            placeholder="e.g. Introduction to Python Variables"
                            value={templateForm.topic}
                            onChange={(e) =>
                              setTemplateForm((f) => ({
                                ...f,
                                topic: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* Subtopics */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Subtopics{" "}
                            <span className="normal-case font-normal text-muted-foreground/60">
                              (one per line)
                            </span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder={
                              "Variables and data types\nInput and output\nBasic arithmetic"
                            }
                            value={templateForm.subtopics}
                            onChange={(e) =>
                              setTemplateForm((f) => ({
                                ...f,
                                subtopics: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-emerald-500 resize-none"
                          />
                        </div>
                      </div>

                      {/* Modal footer */}
                      <div className="p-6 border-t border-border shrink-0">
                        <button
                          onClick={addTemplate}
                          disabled={
                            templateBusy ||
                            !templateForm.topic ||
                            !templateForm.program_id
                          }
                          className="w-full py-3 bg-emerald-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-emerald-600 transition-all"
                        >
                          {templateBusy ? "Saving…" : "Save Template"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── AI Config (admin) ── */}
            {tab === "ai-config" && profile?.role === "admin" && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center gap-2">
                  <CpuChipIcon className="w-4 h-4 text-primary" />
                  <div>
                    <h2 className="font-bold">AI Configuration</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      API keys for AI features. Stored securely in the database.
                    </p>
                  </div>
                </div>
                {aiLoading ? (
                  <div className="p-10 flex justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="p-6 space-y-5">
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                      <p className="text-xs text-primary leading-relaxed">
                        These keys are loaded at runtime for AI features.
                        Changes take effect immediately.
                      </p>
                    </div>
                    {[
                      {
                        key: "openrouter_api_key",
                        label: "OpenRouter API Key",
                        hint: "Used for text generation fallback. Get it at openrouter.ai",
                        placeholder: "sk-or-v1-...",
                      },
                      {
                        key: "gemini_api_key",
                        label: "Google Gemini API Key",
                        hint: "Primary key for Gemini 2.5 Flash text and image generation.",
                        placeholder: "AIza...",
                      },
                      {
                        key: "pollinations_enabled",
                        label: "Pollinations Fallback",
                        hint: 'Set to "true" to enable the free Pollinations.ai image fallback.',
                        placeholder: "true or false",
                      },
                    ].map(({ key, label, hint, placeholder }) => (
                      <div key={key}>
                        <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                          {label}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={aiSettings[key] ?? ""}
                            onChange={(e) =>
                              setAiSettings((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            placeholder={placeholder}
                            className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                          />
                          {(aiSettings[key] ?? "").length > 4 && (
                            <button
                              onClick={() =>
                                setAiSettings((prev) => ({
                                  ...prev,
                                  [key]: "",
                                }))
                              }
                              className="px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-black hover:bg-rose-500/20 transition-colors"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {hint}
                        </p>
                      </div>
                    ))}
                    {Object.entries(aiSettings)
                      .filter(
                        ([k]) =>
                          ![
                            "openrouter_api_key",
                            "gemini_api_key",
                            "pollinations_enabled",
                          ].includes(k)
                      )
                      .map(([key, value]) => (
                        <div key={key}>
                          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                            {key.replace(/_/g, " ")}
                          </label>
                          <input
                            type="text"
                            value={value}
                            onChange={(e) =>
                              setAiSettings((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      ))}
                    <button
                      onClick={saveAiSettings}
                      disabled={aiSaving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-primary disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-all mt-2"
                    >
                      {aiSaving ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckIcon className="w-4 h-4" />
                      )}{" "}
                      {aiSaving ? "Saving…" : "Save AI Settings"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── LMS Config (admin) ── */}
            {tab === "lms-config" && profile?.role === "admin" && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border bg-primary/5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                    <CogIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold">Platform Policy & Branding</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Global LMS behavior, academic rules, and brand assets.
                    </p>
                  </div>
                </div>
                {aiLoading ? (
                  <div className="p-10 flex justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="p-6 space-y-8">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4">
                        Branding
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-xs font-bold mb-1.5">
                            Brand Color
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={
                                aiSettings.brand_primary_color || "#1A3A8F"
                              }
                              onChange={(e) =>
                                setAiSettings((p) => ({
                                  ...p,
                                  brand_primary_color: e.target.value,
                                }))
                              }
                              className="w-10 h-10 cursor-pointer border border-border bg-transparent p-0 rounded-lg"
                            />
                            <input
                              type="text"
                              value={
                                aiSettings.brand_primary_color || "#1A3A8F"
                              }
                              onChange={(e) =>
                                setAiSettings((p) => ({
                                  ...p,
                                  brand_primary_color: e.target.value,
                                }))
                              }
                              className="flex-1 px-4 py-2 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:border-primary"
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Affects navigation, buttons, and accents globally.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1.5">
                            Platform Logo URL
                          </label>
                          <input
                            type="text"
                            value={aiSettings.platform_logo_url || ""}
                            onChange={(e) =>
                              setAiSettings((p) => ({
                                ...p,
                                platform_logo_url: e.target.value,
                              }))
                            }
                            placeholder="https://..."
                            className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                          />
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            SVG or transparent PNG (128×128px).
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4">
                        Daily Academic Rules
                      </h3>
                      <div className="space-y-4">
                        {[
                          {
                            key: "lms_teacher_isolation",
                            label: "Class Privacy for Teachers",
                            desc: "Teachers only see their own assigned classes.",
                          },
                          {
                            key: "lms_auto_portals",
                            label: "Instant Student Access",
                            desc: "Auto-create accounts for new student registrations.",
                          },
                          {
                            key: "lms_gamification_enabled",
                            label: "Learning Rewards & Badges",
                            desc: "XP points, badges, and leaderboard.",
                          },
                          {
                            key: "lms_auto_certificates",
                            label: "Automatic Certificates",
                            desc: "Generate certificates when a student finishes a course.",
                          },
                          {
                            key: "lms_course_locking",
                            label: "Step-by-Step Learning Mode",
                            desc: "Students must finish lessons in order before moving ahead.",
                          },
                          {
                            key: "show_report_indicator",
                            label: "Progress Report Indicator",
                            desc: "Show who still needs a published report on rosters, cards and the dashboard.",
                          },
                          {
                            key: "allow_paste_claim_students",
                            label: "Allow Paste-Name Claim",
                            desc: "Sensitive: lets admins/teachers paste names and immediately claim existing students into a class (including kids under another teacher). Off by default.",
                          },
                        ].map((opt) => (
                          <div
                            key={opt.key}
                            className="flex items-start justify-between py-2"
                          >
                            <div className="max-w-md">
                              <p className="font-bold text-sm">{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {opt.desc}
                              </p>
                            </div>
                            <Toggle
                              checked={aiSettings[opt.key] === "true"}
                              onChange={(v) =>
                                setAiSettings((p) => ({
                                  ...p,
                                  [opt.key]: v ? "true" : "false",
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4">
                        Communication Controls
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-xs font-bold mb-1.5">
                            Messaging Restriction
                          </label>
                          <select
                            value={aiSettings.lms_messaging_policy || "open"}
                            onChange={(e) =>
                              setAiSettings((p) => ({
                                ...p,
                                lms_messaging_policy: e.target.value,
                              }))
                            }
                            className="w-full px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary appearance-none cursor-pointer"
                          >
                            <option value="open">Open (Collaborative)</option>
                            <option value="support_only">
                              Support Only (Staff-to-Student)
                            </option>
                            <option value="restricted">
                              Restricted (No peer-to-peer)
                            </option>
                          </select>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Who students and parents can message.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1.5">
                            Attendance Threshold
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              value={
                                aiSettings.lms_attendance_threshold || "75"
                              }
                              onChange={(e) =>
                                setAiSettings((p) => ({
                                  ...p,
                                  lms_attendance_threshold: e.target.value,
                                }))
                              }
                              className="w-24 px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                            />
                            <span className="text-sm font-bold text-muted-foreground">
                              %
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Minimum attendance for exam eligibility.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={saveAiSettings}
                        disabled={aiSaving}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary shadow-lg shadow-primary/20 disabled:opacity-50 rounded-xl text-sm font-black text-white transition-all uppercase tracking-widest"
                      >
                        {aiSaving ? (
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircleIcon className="w-4 h-4" />
                        )}
                        {aiSaving ? "Saving…" : "Save Settings"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Reset all LMS policies to defaults?"))
                            setAiSettings((p) => ({
                              ...p,
                              lms_teacher_isolation: "false",
                              lms_auto_portals: "true",
                              lms_gamification_enabled: "true",
                              lms_auto_certificates: "false",
                              lms_course_locking: "true",
                              lms_messaging_policy: "open",
                              brand_primary_color: "#1A3A8F",
                              show_report_indicator: "true",
                              allow_paste_claim_students: "false",
                            }));
                        }}
                        className="px-6 py-3 border border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl text-sm font-bold transition-all"
                      >
                        Reset Defaults
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Notification Templates (admin) ── */}
            {tab === "templates" && profile?.role === "admin" && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4 text-primary" />
                  <div>
                    <h2 className="font-bold">Notification Templates</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Edit email and SMS templates used by the system.
                    </p>
                  </div>
                </div>
                {templatesLoading ? (
                  <div className="p-10 flex justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {templates.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        No templates found. They are seeded on first use.
                      </div>
                    )}
                    {templates.map((tmpl) => (
                      <div key={tmpl.id} className="p-5">
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border ${
                                tmpl.type === "email"
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              }`}
                            >
                              {tmpl.type}
                            </span>
                            <p className="text-sm font-bold">{tmpl.name}</p>
                          </div>
                          <button
                            onClick={() =>
                              setEditingTemplate(
                                editingTemplate?.id === tmpl.id
                                  ? null
                                  : { ...tmpl }
                              )
                            }
                            className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                          >
                            <PencilIcon className="w-3.5 h-3.5" /> Edit
                          </button>
                        </div>
                        {editingTemplate?.id === tmpl.id ? (
                          <div className="space-y-3 border border-border p-4 bg-background">
                            {editingTemplate.subject !== undefined && (
                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                                  Subject
                                </label>
                                <input
                                  value={editingTemplate.subject ?? ""}
                                  onChange={(e) =>
                                    setEditingTemplate((t: any) => ({
                                      ...t,
                                      subject: e.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-2.5 bg-card border border-border text-sm focus:outline-none focus:border-primary"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                                Content
                              </label>
                              <textarea
                                rows={6}
                                value={editingTemplate.content ?? ""}
                                onChange={(e) =>
                                  setEditingTemplate((t: any) => ({
                                    ...t,
                                    content: e.target.value,
                                  }))
                                }
                                className="w-full px-3 py-2.5 bg-card border border-border text-sm font-mono resize-none focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingTemplate(null)}
                                className="flex-1 py-2.5 text-xs font-bold text-muted-foreground border border-border hover:text-foreground"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveTemplate}
                                disabled={templateSaving}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black bg-primary text-white disabled:opacity-50"
                              >
                                {templateSaving ? (
                                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckIcon className="w-3.5 h-3.5" />
                                )}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground font-mono leading-relaxed line-clamp-3">
                            {tmpl.content}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Audit Log (admin) ── */}
            {tab === "audit-log" && profile?.role === "admin" && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TableCellsIcon className="w-4 h-4 text-muted-foreground/70" />
                    <div>
                      <h2 className="font-bold">Activity & Audit Log</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Recent platform activity — last 5 events.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setAuditLoading(true);
                      const { data } = await createClient()
                        .from("activity_logs")
                        .select(
                          "*, portal_users!activity_logs_user_id_fkey(full_name)"
                        )
                        .order("created_at", { ascending: false })
                        .limit(5);
                      setAuditLogs(data ?? []);
                      setAuditLoading(false);
                    }}
                    className="p-2 bg-white/5 hover:bg-white/10 text-muted-foreground border border-border transition-all"
                  >
                    <ArrowPathIcon
                      className={`w-4 h-4 ${
                        auditLoading ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                </div>
                {auditLoading ? (
                  <div className="p-10 flex justify-center">
                    <div className="w-7 h-7 border-4 border-border border-t-slate-400 rounded-full animate-spin" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No activity logged yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {auditLogs.slice(0, 5).map((log: any) => (
                      <div
                        key={log.id}
                        className="px-5 py-3 flex items-center gap-3"
                      >
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap shrink-0">
                          {log.event_type}
                        </span>
                        <span className="text-xs font-medium flex-1 truncate">
                          {log.portal_users?.full_name ?? "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(log.created_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-4 border-t border-border space-y-2">
                  <a
                    href="/dashboard/platform-operations?view=activity"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl transition-all"
                  >
                    View Full Activity Log →
                  </a>
                  <a
                    href="/dashboard/learner-progress?view=history"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-sm font-bold rounded-xl transition-all"
                  >
                    View Academic Change History →
                  </a>
                </div>
              </div>
            )}

            {/* ── Database Repair (admin) ── */}
            {tab === "repair" && profile?.role === "admin" && (
              <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border flex items-center gap-2 bg-rose-500/5">
                  <CommandLineIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <div>
                    <h2 className="font-bold">Database Repair Tools</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Roster repair and debris cleanup live in System Health.
                    </p>
                  </div>
                </div>
                <div className="p-6 space-y-6">
                  <div className="p-5 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-4">
                    <CommandLineIcon className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold mb-1">System Health</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Full platform sanitation: roster repair and debris purge
                        (orphans, soft-deleted users, broken parent links, empty
                        classes). Dry-run available first.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href="/dashboard/classes/heal"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition"
                        >
                          Open roster repair →
                        </Link>
                        <Link
                          href="/dashboard/classes/heal?tab=cleanup"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 transition"
                        >
                          Open full sanitation →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage({
  embedded = false,
  forcedTab,
}: { embedded?: boolean; forcedTab?: string } = {}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
          <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <SettingsPageContent embedded={embedded} forcedTab={forcedTab} />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, X, ArrowRight, ArrowLeft, MessageSquareText } from "lucide-react";
import { contactInfo } from "@/config/brand";
import { useFeaturedSpecialProgram } from "@/hooks/useFeaturedSpecialProgram";
import { formatWhatsApp, isValidWhatsApp } from "@/lib/form-helpers";
import {
  type WaIntent,
  type WaIntakeDraft,
  EMPTY_WA_DRAFT,
  SUMMER_TRACK_OPTIONS,
  WA_DISMISS_KEY,
  loadWaIntakeDraft,
  saveWaIntakeDraft,
  clearWaIntakeDraft,
  buildWaBrief,
  applyIntakeToSpecialDraft,
  stashStudentPrefill,
  openWhatsAppChat,
} from "@/lib/whatsapp/mini-intake";
import { STUDENT_REGISTRATION_PATH, SCHOOL_REGISTRATION_PATH } from "@/lib/registration/enrollment-types";

const HIDE_ON = [
  "/dashboard",
  "/login",
  "/signup",
  "/student-registration",
  "/school-registration",
  "/reset-password",
  "/verify",
];

type Step = "intent" | "details";

const INTENTS: { id: WaIntent; title: string; desc: string }[] = [
  { id: "summer", title: "Secure a Summer seat", desc: "AI / special cohort — quick intake" },
  { id: "enrol", title: "Term enrolment", desc: "Partner school or online live classes" },
  { id: "school", title: "School partnership", desc: "Bring Rillcod to your school" },
  { id: "help", title: "Quick help", desc: "Ask support anything" },
];

export default function SmartWhatsAppWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const { cta } = useFeaturedSpecialProgram();
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<Step>("intent");
  const [draft, setDraft] = useState<WaIntakeDraft>(EMPTY_WA_DRAFT);
  const [attempted, setAttempted] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hiddenRoute = HIDE_ON.some(
    (p) => pathname === p || pathname?.startsWith(`${p}/`),
  );
  const onSpecialPage = !!pathname?.startsWith("/special/");
  /** Sit above the summer sticky “Secure a seat” bar on special pages. */
  const bottomClass = onSpecialPage
    ? "bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
    : "bottom-[max(1.25rem,env(safe-area-inset-bottom))]";

  useEffect(() => {
    const saved = loadWaIntakeDraft();
    if (saved) setDraft(saved);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    saveWaIntakeDraft(draft);
  }, [draft, isOpen]);

  useEffect(() => {
    if (hiddenRoute || dismissed) {
      setVisible(false);
      return;
    }

    try {
      if (sessionStorage.getItem(WA_DISMISS_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {
      /* ignore */
    }

    const showAfter = window.setTimeout(() => setVisible(true), onSpecialPage ? 1800 : 3500);

    const onScroll = () => {
      if (isOpen) return; // keep panel open while filling
      setVisible(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setVisible(true), 1600);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(showAfter);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [hiddenRoute, dismissed, onSpecialPage, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const pickIntent = (id: WaIntent) => {
    setDraft((d) => ({ ...d, intent: id }));
    setStep("details");
    setAttempted(false);
  };

  const detailsValid = (() => {
    if (!draft.parentName.trim()) return false;
    if (!isValidWhatsApp(formatWhatsApp(draft.phone))) return false;
    if (draft.intent === "summer" || draft.intent === "enrol") {
      if (!draft.studentName.trim()) return false;
      if (draft.intent === "summer") {
        const age = parseInt(draft.age, 10);
        if (!draft.age || Number.isNaN(age) || age < 5 || age > 99) return false;
      }
    }
    return true;
  })();

  const finalizeDraft = (): WaIntakeDraft => ({
    ...draft,
    phone: formatWhatsApp(draft.phone),
  });

  const chatNow = () => {
    setAttempted(true);
    if (!detailsValid) return;
    const ready = finalizeDraft();
    if (ready.intent === "summer") applyIntakeToSpecialDraft(cta.slug, ready);
    if (ready.intent === "enrol") stashStudentPrefill(ready);
    const message = buildWaBrief(ready, {
      programmeTitle: cta.title,
      pagePath: typeof window !== "undefined" ? window.location.pathname : pathname || undefined,
    });
    openWhatsAppChat(message, contactInfo.whatsapp || "+2348116600091");
    clearWaIntakeDraft();
    setIsOpen(false);
  };

  const continueOnSite = () => {
    setAttempted(true);
    if (!detailsValid) return;
    const ready = finalizeDraft();
    clearWaIntakeDraft();
    setIsOpen(false);

    if (ready.intent === "summer") {
      applyIntakeToSpecialDraft(cta.slug, ready);
      window.location.assign(cta.registerHref || "/special/ai-summer-school-2026#register");
      return;
    }
    if (ready.intent === "enrol") {
      stashStudentPrefill(ready);
      router.push(STUDENT_REGISTRATION_PATH);
      return;
    }
    if (ready.intent === "school") {
      router.push(SCHOOL_REGISTRATION_PATH);
      return;
    }
    // help → still useful to chat, fall through to WhatsApp
    const message = buildWaBrief(ready, {
      programmeTitle: cta.title,
      pagePath: pathname || undefined,
    });
    openWhatsAppChat(message, contactInfo.whatsapp || "+2348116600091");
  };

  const dismiss = () => {
    setIsOpen(false);
    setDismissed(true);
    setVisible(false);
    try {
      sessionStorage.setItem(WA_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const fieldCls =
    "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/60";
  const err = (cond: boolean) =>
    attempted && cond ? "border-rose-500/60" : "";

  if (hiddenRoute || dismissed || !visible) return null;

  return (
    <div
      ref={widgetRef}
      className={`fixed right-4 sm:right-6 ${bottomClass} z-[60] transition-opacity duration-300`}
    >
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-[min(100vw-2rem,340px)] bg-card border border-border shadow-2xl rounded-2xl p-4 mb-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <MessageSquareText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <h3 className="text-xs font-black uppercase text-foreground tracking-wider truncate">
                  Rillcod Assist
                </h3>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {step === "intent"
                  ? "What do you need? Takes ~20 seconds."
                  : "We’ll open WhatsApp with your brief — or continue on the site."}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg border border-border shrink-0"
              aria-label="Hide for this visit"
              title="Hide for this visit"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {step === "intent" && (
            <div className="space-y-1.5">
              {INTENTS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => pickIntent(opt.id)}
                  className="w-full flex items-center justify-between gap-2 p-3 bg-muted/30 hover:bg-emerald-500/10 border border-border/80 hover:border-emerald-500/40 rounded-xl text-left transition-colors"
                >
                  <div className="min-w-0">
                    <h4 className="text-[11px] font-black uppercase tracking-wide text-foreground truncate">
                      {opt.title}
                    </h4>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {step === "details" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setStep("intent");
                  setAttempted(false);
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3 h-3" /> Change intent
              </button>

              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  Your name *
                </label>
                <input
                  className={`${fieldCls} mt-1 ${err(!draft.parentName.trim())}`}
                  value={draft.parentName}
                  onChange={(e) => setDraft((d) => ({ ...d, parentName: e.target.value }))}
                  placeholder="Parent / contact name"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  WhatsApp number *
                </label>
                <input
                  className={`${fieldCls} mt-1 ${err(!isValidWhatsApp(formatWhatsApp(draft.phone)))}`}
                  value={draft.phone}
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                  onBlur={() =>
                    setDraft((d) => ({ ...d, phone: d.phone ? formatWhatsApp(d.phone) : "" }))
                  }
                  placeholder="080…"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>

              {(draft.intent === "summer" || draft.intent === "enrol") && (
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Learner name *
                  </label>
                  <input
                    className={`${fieldCls} mt-1 ${err(!draft.studentName.trim())}`}
                    value={draft.studentName}
                    onChange={(e) => setDraft((d) => ({ ...d, studentName: e.target.value }))}
                    placeholder="Child’s full name"
                    autoComplete="off"
                  />
                </div>
              )}

              {draft.intent === "summer" && (
                <>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Learner age *
                    </label>
                    <input
                      className={`${fieldCls} mt-1 ${err(!draft.age.trim())}`}
                      value={draft.age}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          age: e.target.value.replace(/[^\d]/g, "").slice(0, 2),
                        }))
                      }
                      placeholder="e.g. 12"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Track interest
                    </label>
                    <select
                      className={`${fieldCls} mt-1`}
                      value={draft.track}
                      onChange={(e) => setDraft((d) => ({ ...d, track: e.target.value }))}
                    >
                      {SUMMER_TRACK_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {attempted && !detailsValid && (
                <p className="text-[10px] text-rose-500 font-bold">
                  Please complete the required fields with a valid WhatsApp number.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  onClick={chatNow}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat now on WhatsApp
                </button>
                {draft.intent !== "help" && (
                  <button
                    type="button"
                    onClick={continueOnSite}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-muted hover:bg-muted/80 border border-border text-foreground text-[11px] font-black uppercase tracking-widest rounded-xl transition-colors"
                  >
                    Continue on site
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <p className="text-[9px] text-muted-foreground leading-snug text-center">
                Chat sends a ready brief to our team. Continue opens the form with your details filled in.
              </p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsOpen((v) => !v);
          if (!isOpen) setStep(loadWaIntakeDraft()?.parentName ? "details" : "intent");
        }}
        className="flex items-center justify-center w-12 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg border border-emerald-700/40 transition-transform hover:scale-105"
        aria-label={isOpen ? "Close assist" : "Open Rillcod Assist"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>
    </div>
  );
}

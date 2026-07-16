"use client";

import { useState, useEffect } from "react";
import {
  Calendar, MapPin, Clock, Phone, Mail, Sparkles,
  ShieldCheck, ArrowRight, CheckCircle, Loader2,
  QrCode, BookOpen, Award, Terminal, Flame, Gamepad2, Laptop, X
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { isValidWhatsApp } from "@/lib/form-helpers";
import { useSummerSchoolRegistration, summerFormStyles } from "@/hooks/useSummerSchoolRegistration";
import { SummerSchoolSuccessTicket } from "@/components/summer-school/SummerSchoolSuccessTicket";
import { brandContact } from '@/config/brand';
import { SUMMER_CENTRE } from '@/lib/summer-school/venue';

import type { SpecialProgramPage } from '@/lib/special-programs/types';
import {
  formatSpecialDate,
  isRegistrationOpen,
  specialProgramPublicPath,
  specialTuitionLabels,
  resolveSpecialBonus,
  resolveSpecialOutcomes,
  DEFAULT_WEEKS_HEADING,
  DEFAULT_WEEKS_INTRO,
  DEFAULT_OUTCOMES_HEADING,
  DEFAULT_OUTCOMES_INTRO,
  DEFAULT_REGISTER_HEADING,
  DEFAULT_NEXT_PATH_HEADING,
  DEFAULT_NEXT_PATH_INTRO,
} from '@/lib/special-programs/types';
import {
  SPECIAL_LEARNER_AGE_MAX,
  SPECIAL_LEARNER_GRADE_OPTIONS,
  AFTER_COHORT_BANNER,
} from '@/lib/special-programs/learner-path';
import { REGISTRATION_HEAR_ABOUT_OPTIONS } from '@/lib/registration/programme-map';

type Props = { page: SpecialProgramPage };

export default function SpecialProgramLanding({ page }: Props) {
  const content = page.content || {};
  const TRACKS = content.tracks || [];
  const WEEKS = content.weeks || [];
  const bonus = resolveSpecialBonus(content);
  const outcomes = resolveSpecialOutcomes(content);
  const weeksHeading = (content.weeks_heading || '').trim() || DEFAULT_WEEKS_HEADING;
  const weeksIntro = (content.weeks_intro || '').trim() || DEFAULT_WEEKS_INTRO;
  const outcomesHeading = (content.outcomes_heading || '').trim() || DEFAULT_OUTCOMES_HEADING;
  const outcomesIntro = (content.outcomes_intro || '').trim() || DEFAULT_OUTCOMES_INTRO;
  const registerHeading = (content.register_heading || '').trim() || DEFAULT_REGISTER_HEADING;
  const nextPathHeading = (content.next_path_heading || '').trim() || DEFAULT_NEXT_PATH_HEADING;
  const nextPathIntro = (content.next_path_intro || '').trim() || DEFAULT_NEXT_PATH_INTRO || AFTER_COHORT_BANNER.body;
  const lsKey = `rillcod_special_${page.slug}_draft`;
  const registrationOpen = isRegistrationOpen(page);
  const ageMin = content.age_min ?? 8;
  const ageMax = content.age_max ?? SPECIAL_LEARNER_AGE_MAX;
  const reg = useSummerSchoolRegistration({
    lsKey,
    receiptInputId: `page-receipt-upload-${page.slug}`,
    specialProgramId: page.id,
    specialProgramSlug: page.slug,
    pricingPage: page,
    ageMin,
    ageMax,
  });
  const {
    form, setForm, loading, bankAccounts, isSuccess, setIsSuccess, successInfo, setSuccessInfo,
    attempted, emailHint, setEmailHint, schoolsList, focusedSchoolIdx, setFocusedSchoolIdx,
    uploadingReceipt, restored, whatsappGroupLink, tuition, handleChange, handlePhoneBlur,
    handleStudentPhoneBlur, handleEmailBlur, handleReceiptUpload, handleReceiptRemove, handleSubmit, clearDraft,
  } = reg;

  const [appUrl, setAppUrl] = useState(`https://www.rillcod.com${specialProgramPublicPath(page.slug)}`);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const { labelCls, inputCls } = summerFormStyles("page");
  const { total: tuitionTotalLabel, deposit: tuitionDepositLabel, fullShort: fullTuitionLabel, splitShort: splitTuitionLabel, isOnsite } = tuition;
  const onlineLabels = specialTuitionLabels(page, 'Online');
  const onsiteLabels = specialTuitionLabels(page, 'Onsite');
  const showStickyCta = registrationOpen && !isSuccess && !verifyingPayment;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAppUrl(window.location.origin + specialProgramPublicPath(page.slug));

    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference")?.trim();
    if (params.get("payment") === "success" && reference) {
      setVerifyingPayment(true);
      fetch(`/api/summer-school/verify?reference=${encodeURIComponent(reference)}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || "Payment could not be verified.");
          setSuccessInfo({
            studentName: params.get("name") || data.studentName || "Student",
            parentPhone: "",
            plan: params.get("plan") || "full",
            method: params.get("method") || "paystack",
            reference,
            paymentVerified: true,
          });
          setIsSuccess(true);
          try { localStorage.removeItem(lsKey); } catch { }
          // Fire the fallback onboarding in the background in case the webhook hasn't run yet.
          // Idempotent — safe to call even if the webhook already ran.
          fetch("/api/summer-school/ensure-onboarded", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference }),
          }).catch(() => { /* non-critical */ });
        })
        .catch((err: Error) => {
          toast.error(err.message || "Payment verification failed. Contact support if you were charged.");
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .finally(() => setVerifyingPayment(false));
    }
  }, [setIsSuccess, setSuccessInfo]);

  const downloadQRCode = () => {
    const svg = document.getElementById("summer-school-page-qr-svg");
    if (!svg) return;
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.setAttribute("width", "200");
    clonedSvg.setAttribute("height", "200");
    const svgString = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const DOMURL = window.URL || window.webkitURL || window;
    const img = new Image();
    const svgUrl = DOMURL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 250;
      canvas.height = 250;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 250, 250);
        ctx.drawImage(img, 25, 25, 200, 200);
        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = "rillcod_summer_school_qr.png";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        toast.success("QR Code downloaded as PNG!");
      }
      DOMURL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  const copyRegisterLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(appUrl);
      toast.success("Registration link copied to clipboard!");
    }
  };

  return (
    <div className={`min-h-screen bg-background text-foreground pt-24 relative overflow-hidden ${showStickyCta ? 'pb-28 sm:pb-24' : 'pb-16'}`}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden no-print">
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute top-[800px] left-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-6 py-8 no-print">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-500 dark:text-yellow-400 rounded-full text-[10px] font-black uppercase tracking-widest">
            ☀️ {content.season_badge || page.title} · Batch B · 2nd cohort
          </div>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-none">
            {content.title_line1 || 'Rillcod'} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500">
              {content.title_line2 || page.title}
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {content.hero_blurb || page.title}
          </p>

          {/* Conversion strip — Batch B · physical cheaper · class days */}
          <div className="flex flex-col items-center justify-center gap-2 max-w-2xl mx-auto pt-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
              Batch B · 2nd cohort
            </p>
            <p className="text-xs sm:text-sm font-bold text-foreground text-center">
              <span className="text-emerald-500">In-person {onsiteLabels.total}</span>
              <span className="text-muted-foreground"> · </span>
              Online {onlineLabels.total}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium text-center">
              Physical seats (₦40k) · Online (₦50k) · Classes tentatively Tue · Thu · Sat
              {page.registration_deadline ? (
                <> · Closes <span className="text-rose-500 font-bold">{formatSpecialDate(page.registration_deadline)}</span></>
              ) : null}
            </p>
          </div>

          {registrationOpen && (
            <div className="pt-2">
              <a
                href="#register"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-xl shadow-xl shadow-orange-500/20 hover:opacity-95 transition-all"
              >
                Secure a seat
                <ArrowRight className="w-4 h-4" />
              </a>
              <p className="text-[10px] text-muted-foreground mt-3 font-medium">
                Receipt sent instantly · Seat reserved on payment · WhatsApp group after confirmation
              </p>
            </div>
          )}

          {!registrationOpen && (
            <div className="max-w-xl mx-auto rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-500">
              Registration is closed for this programme.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto pt-6">
            {[
              { label: "Start Date", val: formatSpecialDate(page.starts_on) },
              { label: "Deadline", val: formatSpecialDate(page.registration_deadline), highlight: true },
              { label: "Ending Date", val: formatSpecialDate(page.ends_on) },
              { label: "Duration", val: content.duration_label || "Cohort" },
              { label: "Audience", val: content.ages_label || `Ages ${ageMin} – ${ageMax}` }
            ].map(m => (
              <div key={m.label} className={`border p-4 rounded-xl transition-all ${m.highlight ? 'bg-rose-500/15 border-rose-500/30 text-rose-500 dark:text-rose-400' : 'bg-card border-border text-foreground'}`}>
                <p className={`text-[9px] uppercase font-black tracking-widest ${m.highlight ? 'text-rose-500 dark:text-rose-400' : 'text-muted-foreground'}`}>{m.label}</p>
                <p className={`text-xs sm:text-sm font-black mt-1 ${m.highlight ? 'animate-pulse' : ''}`}>{m.val}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Restored draft banner */}
        {restored && !isSuccess && (
          <div className="flex items-center justify-between gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 max-w-4xl mx-auto no-print">
            <p className="text-xs text-primary font-bold">Your previous registration draft has been loaded.</p>
            <button
              type="button"
              onClick={clearDraft}
              className="text-[10px] font-black text-primary hover:opacity-80 transition-all uppercase"
            >
              Clear Draft
            </button>
          </div>
        )}

        {/* Tracks Overview */}
        <section className="space-y-8 no-print">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">{content.curriculum_heading || 'Curriculum'}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
              {content.curriculum_intro || ''}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TRACKS.map(t => (
              <div key={t.id} className="bg-card border border-border p-6 rounded-2xl flex flex-col justify-between hover:border-primary/40 transition-all">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{t.icon}</span>
                    <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {t.week}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-foreground uppercase">{t.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>

                  <div className="space-y-2 pt-2">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Core Topics Covered:</p>
                    <ul className="grid grid-cols-1 gap-1.5">
                      {t.topics.map(topic => (
                        <li key={topic} className="text-xs text-foreground/80 flex items-start gap-2">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 shrink-0" />
                          <span>{topic}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bonus Video Module */}
        {bonus.enabled && (
          <section className="bg-gradient-to-r from-amber-500/5 to-emerald-500/5 border border-amber-500/20 rounded-3xl p-6 sm:p-10 space-y-6 no-print">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{bonus.icon}</span>
              <div>
                <p className="text-[9px] text-amber-500 uppercase font-black tracking-widest">{bonus.badge}</p>
                <h3 className="text-xl sm:text-2xl font-black uppercase text-foreground">{bonus.title}</h3>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-3xl">
              {bonus.desc}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {bonus.items.map((b) => (
                <div key={b.label} className="bg-card/50 border border-border/50 p-4 rounded-xl">
                  <p className="text-xs font-black text-foreground">{b.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{b.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Schedule */}
        <section className="space-y-8 no-print">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">{weeksHeading}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
              {weeksIntro}
            </p>
          </div>

          <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border bg-card">
            {WEEKS.map(w => (
              <div key={w.num} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-start hover:bg-muted/30 transition-colors">
                <div className="space-y-1.5">
                  <span className="text-xs font-black text-amber-500 uppercase tracking-widest">{w.num}</span>
                  <div className="text-[9px] font-black text-foreground/50 bg-muted border border-border w-fit px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {w.tag}
                  </div>
                </div>
                <div className="md:col-span-3 space-y-1">
                  <h4 className="text-sm font-black text-foreground uppercase">{w.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Outcomes */}
        <section className="space-y-8 no-print">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">{outcomesHeading}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
              {outcomesIntro}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {outcomes.map(o => (
              <div key={o.title} className="bg-card border border-border p-5 rounded-xl text-center space-y-2">
                <span className="text-3xl block">{o.icon}</span>
                <h4 className="text-xs font-black text-foreground uppercase tracking-wider">{o.title}</h4>
                <p className="text-[11px] text-muted-foreground leading-normal">{o.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* After cohort / matriculation path */}
        <section className="space-y-4 no-print rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
          <div className="text-center space-y-2 max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black uppercase">{nextPathHeading}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{nextPathIntro}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto pt-2">
            {[
              { title: 'Kids (~8–10)', path: 'Young Innovators → Teen Developers' },
              { title: 'Teens', path: 'Teen Developers → Web / AI / Design / Robotics' },
              { title: 'Adults & individuals', path: 'Foundations or specialist track by goal' },
            ].map((row) => (
              <div key={row.title} className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">{row.title}</p>
                <p className="text-xs font-bold text-foreground mt-2">{row.path}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <a
              href="/student-registration"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90"
            >
              Continue with term enrolment
            </a>
            <a
              href="#register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted"
            >
              Register for this cohort now
            </a>
          </div>
        </section>

        {/* Form + QR Code Grid */}
        <section id="register" className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pt-8">
          {/* Form / Success Ticket Column */}
          {verifyingPayment ? (
            <div className="lg:col-span-2 flex items-center justify-center gap-3 py-16 text-muted-foreground bg-card border border-border rounded-2xl">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm font-bold uppercase tracking-widest">Verifying your payment…</p>
            </div>
          ) : isSuccess && successInfo ? (
            <div className="lg:col-span-2 bg-card border border-border p-6 sm:p-10 rounded-2xl shadow-2xl relative overflow-hidden border-t-8 border-t-emerald-500">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] pointer-events-none" />
              <SummerSchoolSuccessTicket
                successInfo={successInfo}
                whatsappGroupLink={whatsappGroupLink}
                variant="page"
                programmeTitle={page.title}
                learnerAge={form.age ? parseInt(form.age, 10) : null}
                learnerGrade={form.currentClass || null}
                onRegisterAnother={() => {
                  setIsSuccess(false);
                  clearDraft();
                  window.history.replaceState({}, document.title, window.location.pathname);
                }}
              />
            </div>
          ) : (
            <div className="lg:col-span-2 bg-card border border-border p-6 sm:p-8 rounded-2xl space-y-6 shadow-2xl">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-black uppercase text-foreground">{registerHeading}</h3>
              </div>

              <div className="bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl flex items-center gap-2.5">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                <p className="text-xs font-black text-rose-500 dark:text-rose-400 uppercase tracking-wider">
                  Registration Deadline: {formatSpecialDate(page.registration_deadline)}. Secure your slot now.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className={`space-y-4 ${!registrationOpen ? 'opacity-50 pointer-events-none' : ''}`}
                aria-disabled={!registrationOpen}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls(attempted && !form.studentName.trim())}>Learner full name *</label>
                    <input type="text" name="studentName" required value={form.studentName} onChange={handleChange}
                      className={inputCls(attempted && !form.studentName.trim())} placeholder="First & Last Name" />
                    {attempted && !form.studentName.trim() && <p className="text-rose-500 text-[10px] font-bold mt-1">Student's name is required</p>}
                  </div>
                  <div>
                    <label className={labelCls(attempted && !form.parentName.trim())}>Parent / guardian / self (if adult) *</label>
                    <input type="text" name="parentName" required value={form.parentName} onChange={handleChange}
                      className={inputCls(attempted && !form.parentName.trim())} placeholder="Parent's Name" />
                    {attempted && !form.parentName.trim() && <p className="text-rose-500 text-[10px] font-bold mt-1">Parent's name is required</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Parent Phone (WhatsApp) */}
                  <div>
                    <label className={labelCls(attempted && (!form.phone.trim() || !isValidWhatsApp(form.phone)))}>Parent Phone Number (WhatsApp) *</label>
                    <div className="relative">
                      <input type="tel" name="phone" required value={form.phone} onChange={handleChange} onBlur={handlePhoneBlur}
                        className={inputCls(attempted && (!form.phone.trim() || !isValidWhatsApp(form.phone))) + " pr-10"} placeholder={`e.g. ${brandContact.phoneShort}`} />
                      {form.phone && (
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-base font-black ${isValidWhatsApp(form.phone) ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {isValidWhatsApp(form.phone) ? '✓' : '…'}
                        </span>
                      )}
                    </div>
                    {form.phone && !isValidWhatsApp(form.phone) && (
                      <p className="text-[10px] text-rose-500 font-bold mt-1">⚠ Must be exactly 13 digits (including +234 prefix) or a valid 11-digit local format.</p>
                    )}
                    {attempted && !form.phone.trim() && <p className="text-rose-500 text-[10px] font-bold mt-1">Parent's WhatsApp number is required</p>}
                  </div>

                  {/* Student Phone (WhatsApp) */}
                  <div>
                    <label className={labelCls(!!(attempted && form.studentPhone.trim() && !isValidWhatsApp(form.studentPhone)))}>Student Phone Number (WhatsApp) (Optional)</label>
                    <div className="relative">
                      <input type="tel" name="studentPhone" value={form.studentPhone} onChange={handleChange} onBlur={handleStudentPhoneBlur}
                        className={inputCls(!!(attempted && form.studentPhone.trim() && !isValidWhatsApp(form.studentPhone))) + " pr-10"} placeholder="e.g. 08022334455" />
                      {form.studentPhone && (
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-base font-black ${isValidWhatsApp(form.studentPhone) ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {isValidWhatsApp(form.studentPhone) ? '✓' : '…'}
                        </span>
                      )}
                    </div>
                    {form.studentPhone && !isValidWhatsApp(form.studentPhone) && (
                      <p className="text-[10px] text-rose-500 font-bold mt-1">⚠ Must be exactly 13 digits (including +234 prefix) or a valid 11-digit local format.</p>
                    )}
                  </div>
                </div>

                {/* Parent Email Address */}
                <div>
                  <label className={labelCls(attempted && !form.email.trim())}>Parent Email Address *</label>
                  <input type="email" name="email" required value={form.email} onChange={handleChange} onBlur={handleEmailBlur}
                    className={inputCls(attempted && !form.email.trim())} placeholder="parent@example.com" />
                  {attempted && !form.email.trim() && <p className="text-rose-500 text-[10px] font-bold mt-1">Parent's email is required for credentials and receipt delivery</p>}
                  {emailHint && (
                    <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 mt-2 flex items-center justify-between">
                      <p className="text-xs text-primary font-bold">Did you mean <span className="underline select-all">{emailHint}</span>?</p>
                      <button
                        type="button"
                        onClick={() => {
                          setForm(prev => ({ ...prev, email: emailHint }));
                          setEmailHint(null);
                        }}
                        className="text-[10px] font-black text-primary hover:opacity-80 transition-all uppercase"
                      >
                        Yes, Fix
                      </button>
                    </div>
                  )}
                </div>

                {/* Consent — parental (required) + WhatsApp opt-in (optional) */}
                <div className="space-y-3">
                  <label className={`flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-all ${attempted && !form.parentConsent ? 'border-rose-500 ring-1 ring-rose-500/30 bg-rose-500/5' : 'border-border bg-card hover:border-primary/40'}`}>
                    <input
                      type="checkbox"
                      name="parentConsent"
                      checked={form.parentConsent}
                      onChange={handleChange}
                      className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-xs text-foreground leading-relaxed">
                      <span className="font-black uppercase tracking-wide text-[10px] text-primary">Consent (Required)</span><br />
                      I confirm I am the learner (adult/individual) or the parent/guardian of this learner, and I consent to participation in {page.title} and processing of academic records.
                    </span>
                  </label>
                  {attempted && !form.parentConsent && <p className="text-rose-500 text-[10px] font-bold mt-1">Consent is required to register.</p>}

                  <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-all">
                    <input
                      type="checkbox"
                      name="whatsappConsent"
                      checked={form.whatsappConsent}
                      onChange={handleChange}
                      className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-xs text-foreground leading-relaxed">
                      <span className="font-black uppercase tracking-wide text-[10px] text-muted-foreground">WhatsApp Opt-in (Optional)</span><br />
                      I consent to receiving login credentials, payment receipts, and student updates via WhatsApp.
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Current School with Autocomplete */}
                  <div className="relative">
                    <label className={labelCls()}>Current School (Optional)</label>
                    <input
                      type="text"
                      name="school"
                      value={form.school}
                      onChange={handleChange}
                      onFocus={() => setFocusedSchoolIdx(0)}
                      onBlur={() => {
                        setTimeout(() => setFocusedSchoolIdx(null), 250);
                      }}
                      className={inputCls()}
                      placeholder="Type school name (or enter custom school)"
                    />
                    {focusedSchoolIdx === 0 && (
                      <div className="absolute left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-56 overflow-y-auto">
                        {(() => {
                          const query = (form.school || '').trim();
                          const filtered = schoolsList.filter(s =>
                            s.toLowerCase().includes(query.toLowerCase())
                          ).slice(0, 5);

                          return (
                            <>
                              {filtered.map(schoolName => (
                                <button
                                  key={schoolName}
                                  type="button"
                                  onMouseDown={() => {
                                    setForm(prev => ({ ...prev, school: schoolName }));
                                    setFocusedSchoolIdx(null);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                                >
                                  🏫 {schoolName}
                                </button>
                              ))}
                              {query && !schoolsList.some(s => s.toLowerCase() === query.toLowerCase()) && (
                                <button
                                  type="button"
                                  onMouseDown={() => {
                                    setForm(prev => ({ ...prev, school: query }));
                                    setFocusedSchoolIdx(null);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors border-t border-border bg-primary/5"
                                >
                                  ✨ Use custom school: "{query}"
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Current Grade */}
                  <div>
                    <label className={labelCls(attempted && !form.currentClass)}>Current grade / status *</label>
                    <select name="currentClass" required value={form.currentClass} onChange={handleChange}
                      className={inputCls(attempted && !form.currentClass) + " appearance-none cursor-pointer select-premium"}>
                      <option value="">Select grade or status</option>
                      {SPECIAL_LEARNER_GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    {attempted && !form.currentClass && <p className="text-rose-500 text-[10px] font-bold mt-1">Grade or learner status is required</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls(attempted && !form.age)}>Age *</label>
                    <input type="number" name="age" required min={ageMin} max={ageMax} value={form.age} onChange={handleChange}
                      className={inputCls(attempted && !form.age)} placeholder={`${ageMin}–${ageMax}`} />
                    {attempted && !form.age && <p className="text-rose-500 text-[10px] font-bold mt-1">Age is required ({ageMin}–{ageMax}; adults & individuals welcome)</p>}
                  </div>
                  <div>
                    <label className={labelCls(attempted && !form.gender)}>Gender *</label>
                    <select name="gender" required value={form.gender} onChange={handleChange}
                      className={inputCls(attempted && !form.gender) + " appearance-none cursor-pointer select-premium"}>
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                    {attempted && !form.gender && <p className="text-rose-500 text-[10px] font-bold mt-1">Student's gender is required</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls(attempted && !form.preferredMode)}>Attendance Mode *</label>
                    <select name="preferredMode" required value={form.preferredMode} onChange={handleChange}
                      className={inputCls(attempted && !form.preferredMode) + " appearance-none cursor-pointer select-premium"}>
                      <option value="">Select Mode</option>
                      <option value="Online">Online (Remote) — ₦50,000 · Batch B · Tue / Thu / Sat</option>
                      <option value="Onsite">Onsite (In-Person centre) — ₦40,000 for the cohort</option>
                      <option value="Hybrid">Hybrid (Once in 3 weeks check-up)</option>
                    </select>
                    {attempted && !form.preferredMode && <p className="text-rose-500 text-[10px] font-bold mt-1">Attendance mode is required</p>}
                    {(form.preferredMode === 'Online' || form.preferredMode === 'Hybrid') && (
                      <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg text-[10px] text-foreground/80 mt-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        <strong className="text-amber-600 dark:text-amber-400">Batch B · 2nd cohort</strong>
                        {' — '}Classes tentatively Tuesday, Thursday &amp; Saturday.
                      </div>
                    )}
                    {(form.preferredMode === 'Onsite' || form.preferredMode === 'Hybrid') && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-lg text-[10px] text-foreground/80 mt-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200 flex gap-2">
                        <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-emerald-600 dark:text-emerald-400">{SUMMER_CENTRE.name}</strong>
                          {' — '}{SUMMER_CENTRE.address}
                          {' · '}{SUMMER_CENTRE.landmark}
                        </span>
                      </div>
                    )}
                    {form.preferredMode === "Hybrid" && (
                      <div className="bg-primary/5 border border-primary/20 p-2.5 rounded-lg text-[10px] text-muted-foreground mt-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                        💡 <strong>Hybrid Mode:</strong> Remote attendance with a mandatory physical check-up/project presentation at {SUMMER_CENTRE.name} **once every 3 weeks** (Week 3 and Week 6) of the 7-week program.
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelCls()}>How Did You Hear About Us?</label>
                    <select name="hearAboutUs" value={form.hearAboutUs} onChange={handleChange}
                      className={inputCls() + " appearance-none cursor-pointer select-premium"}>
                      <option value="">Select Option</option>
                      {REGISTRATION_HEAR_ABOUT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Track Selection */}
                <div className="bg-primary/5 border border-primary/20 p-5 rounded-xl">
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Included Program Track</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xl">🚀</span>
                    <div>
                      <h4 className="text-sm font-black text-foreground uppercase">FULL AI EXPLORER COHORT</h4>
                      <p className="text-[11px] text-muted-foreground">Covers all 4 core AI & Coding Tracks + the bonus Video Marketing module.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelCls()}>Additional Information (Optional)</label>
                  <input name="additionalInfo" value={form.additionalInfo} onChange={handleChange}
                    className={inputCls()} placeholder="Any special needs or inquiries" />
                </div>

                {/* Payment Section */}
                <div className="border-t border-border pt-6 mt-6 space-y-6">
                  <div>
                    <h4 className="text-sm font-black uppercase text-foreground mb-4">Payment Setup & Tuition</h4>
                    <div className="bg-yellow-500/15 border border-yellow-500/40 p-4 rounded-xl mb-4">
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                        {page.title} tuition is <strong className="text-yellow-500 dark:text-yellow-400 font-bold">{tuitionTotalLabel}</strong> for {isOnsite ? 'Onsite' : 'Online / Hybrid'} attendance. You can choose to pay in full or pay a <strong className="text-yellow-500 dark:text-yellow-400 font-bold">{page.deposit_percent}% installment deposit ({tuitionDepositLabel})</strong> to secure your slot. The remaining balance will be due by the third week of the cohort.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Payment Plan selection */}
                    <div>
                      <label className={labelCls()}>Tuition Plan *</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, paymentPlan: "full" }))}
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentPlan === "full"
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-card text-foreground border-border hover:bg-muted"
                            }`}
                        >
                          {fullTuitionLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, paymentPlan: "installment" }))}
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentPlan === "installment"
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-card text-foreground border-border hover:bg-muted"
                            }`}
                        >
                          {splitTuitionLabel}
                        </button>
                      </div>
                    </div>

                    {/* Payment Method selection */}
                    <div>
                      <label className={labelCls()}>Payment Method *</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, paymentMethod: "paystack" }))}
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentMethod === "paystack"
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-card text-foreground border-border hover:bg-muted"
                            }`}
                        >
                          💳 Online
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, paymentMethod: "bank_transfer" }))}
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentMethod === "bank_transfer"
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-card text-foreground border-border hover:bg-muted"
                            }`}
                        >
                          🏦 Transfer
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Display instructions based on payment method */}
                  {form.paymentMethod === "bank_transfer" && (
                    <div className="bg-card border border-border p-5 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <h5 className="text-xs font-black text-yellow-500 dark:text-yellow-400 uppercase tracking-widest leading-none">Official Bank Details</h5>

                      {bankAccounts.map((account, index) => (
                        <div key={index} className="space-y-1.5 p-3.5 bg-background rounded-lg border border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-black">{account.label || 'Bank Account'}</span>
                            <span className="text-xs font-black text-foreground">{account.bank_name}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm font-mono font-bold text-yellow-500 select-all">{account.account_number}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(account.account_number);
                                toast.success("Account number copied!");
                              }}
                              className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest bg-muted px-2.5 py-1.5 rounded border border-border transition-colors cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground uppercase font-bold pt-1">{account.account_name}</p>
                        </div>
                      ))}

                      <div className="space-y-2 pt-2">
                        <label className={labelCls(attempted && !form.paymentReference.trim())}>Transfer Reference / Sender Account Name *</label>
                        <input
                          type="text"
                          name="paymentReference"
                          required
                          value={form.paymentReference.startsWith('http') ? 'Receipt Screenshot Uploaded' : form.paymentReference}
                          readOnly={form.paymentReference.startsWith('http')}
                          onChange={handleChange}
                          className={inputCls(attempted && !form.paymentReference.trim())}
                          placeholder="e.g. Providus Ref or Sender's Name"
                        />

                        <div className="flex items-center gap-3 mt-2">
                          <div className="relative flex-1">
                            <input
                              type="file"
                              id="page-receipt-upload"
                              accept="image/*"
                              onChange={handleReceiptUpload}
                              disabled={uploadingReceipt}
                              className="hidden"
                            />
                            <label
                              htmlFor="page-receipt-upload"
                              className={`w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${uploadingReceipt
                                ? "bg-muted text-muted-foreground border-muted animate-pulse"
                                : form.paymentReference.startsWith('http')
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                                  : "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                                }`}
                            >
                              {uploadingReceipt ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading Receipt...</>
                              ) : form.paymentReference.startsWith('http') ? (
                                <>✅ Change Receipt Screenshot</>
                              ) : (
                                <>📸 Upload Receipt Screenshot</>
                              )}
                            </label>
                          </div>
                          {form.paymentReference.startsWith('http') && (
                            <div className="mt-3.5 p-3.5 bg-background rounded-xl border border-border space-y-3 relative group overflow-hidden w-full">
                              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest leading-none mb-1.5">Receipt Screenshot Preview</p>
                              <div className="relative aspect-video max-w-sm rounded-lg overflow-hidden border border-border/80 bg-muted/20">
                                <img
                                  src={form.paymentReference}
                                  alt="Receipt Screenshot"
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleReceiptRemove}
                                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-wider rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
                                >
                                  Remove Receipt
                                </button>
                                <a
                                  href={form.paymentReference}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-[10px] font-black uppercase tracking-wider rounded-lg border border-border transition-colors text-center"
                                >
                                  View Full Size
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                        {attempted && !form.paymentReference.trim() && <p className="text-rose-500 text-[10px] font-bold mt-1">Transfer reference is required for bank transfer</p>}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-4.5 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:opacity-90 transition-opacity rounded-xl shadow-lg disabled:opacity-50 mt-2 h-14 cursor-pointer"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4" /> Complete Registration <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* QR Code Scan Card */}
          <div className="bg-card border border-border p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-6 shadow-2xl h-full lg:sticky lg:top-24 overflow-hidden relative no-print">
            <style>{`
              @keyframes rillcodScan {
                0% { transform: translateY(0); opacity: 0.3; }
                50% { transform: translateY(160px); opacity: 0.9; }
                100% { transform: translateY(0); opacity: 0.3; }
              }
              .rillcod-scan-line {
                animation: rillcodScan 3s infinite ease-in-out;
              }
            `}</style>

            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl text-primary">📱</div>

            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase text-foreground">Scan to Share or Open</h3>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed font-medium">
                Scan this barcode to instantly open this registration form on your phone or share it with others on WhatsApp.
              </p>
            </div>

            {/* Glowing scan target container */}
            <div className="relative p-6 bg-white dark:bg-zinc-950 border-2 border-primary/30 rounded-2xl shadow-[0_0_30px_-5px_rgba(245,158,11,0.25)] flex items-center justify-center overflow-hidden w-48 h-48 select-none">
              {/* Target bracket corners */}
              <div className="absolute top-2.5 left-2.5 w-4.5 h-4.5 border-t-2 border-l-2 border-primary rounded-tl-md" />
              <div className="absolute top-2.5 right-2.5 w-4.5 h-4.5 border-t-2 border-r-2 border-primary rounded-tr-md" />
              <div className="absolute bottom-2.5 left-2.5 w-4.5 h-4.5 border-b-2 border-l-2 border-primary rounded-bl-md" />
              <div className="absolute bottom-2.5 right-2.5 w-4.5 h-4.5 border-b-2 border-r-2 border-primary rounded-br-md" />

              {/* Red/Amber Scanning laser */}
              <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_10px_3px_rgba(245,158,11,0.6)] rillcod-scan-line z-20 pointer-events-none top-0" />

              <div className="p-2 bg-white rounded-lg">
                <QRCode id="summer-school-page-qr-svg" value={appUrl} size={130} />
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={downloadQRCode}
                className="flex-1 py-3 bg-muted hover:bg-muted/80 border border-border text-foreground font-black text-[10px] uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                📥 Download
              </button>
              <button
                type="button"
                onClick={copyRegisterLink}
                className="flex-1 py-3 bg-primary text-primary-foreground hover:opacity-90 font-black text-[10px] uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                🔗 Copy Link
              </button>
            </div>

            <div className="text-[10px] text-muted-foreground font-mono select-all break-all w-full px-2 py-1 bg-background rounded border border-border">
              {appUrl}
            </div>
          </div>
        </section>
      </div>

      {showStickyCta && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-500/30 bg-background/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.25)] no-print pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="min-w-0 text-center sm:text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 truncate">
                ☀️ {page.title} · Batch B
              </p>
              <p className="text-xs font-bold text-foreground">
                In-person {onsiteLabels.total}
                {' · '}Online {onlineLabels.total}
                {' · '}Tue · Thu · Sat
                {page.registration_deadline ? (
                  <span className="text-rose-500">
                    {' · '}Closes {formatSpecialDate(page.registration_deadline)}
                  </span>
                ) : null}
              </p>
            </div>
            <a
              href="#register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 text-white text-[11px] font-black uppercase tracking-[0.18em] rounded-xl shadow-lg shadow-orange-500/20 hover:opacity-95 transition-all shrink-0"
            >
              Secure a seat
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

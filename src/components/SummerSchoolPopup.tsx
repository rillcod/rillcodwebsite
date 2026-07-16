"use client";

import { useState } from "react";
import { X, Calendar, MapPin, Clock, Phone, Mail, Sparkles, ShieldCheck, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { isValidWhatsApp } from "@/lib/form-helpers";
import { useSummerSchoolRegistration, summerFormStyles } from "@/hooks/useSummerSchoolRegistration";
import { SummerSchoolSuccessTicket } from "@/components/summer-school/SummerSchoolSuccessTicket";
import { brandContact } from '@/config/brand';
import { SUMMER_CENTRE } from '@/lib/summer-school/venue';
import { useFeaturedSpecialProgram } from '@/hooks/useFeaturedSpecialProgram';
import {
  SPECIAL_LEARNER_GRADE_OPTIONS,
} from '@/lib/special-programs/learner-path';
import { REGISTRATION_HEAR_ABOUT_OPTIONS } from '@/lib/registration/programme-map';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { NativeSummerRegistrationForm } from '@/components/summer-school/NativeSummerRegistrationForm';

interface SummerSchoolPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const LS_KEY = "rillcod_summer_school_popup_draft";

export default function SummerSchoolPopup({ isOpen, onClose }: SummerSchoolPopupProps) {
  const isNativeApp = useIsNativeApp();
  const { cta } = useFeaturedSpecialProgram();
  const registerUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${cta.href}`
    : `${brandContact.siteUrl}${cta.href}`;
  const reg = useSummerSchoolRegistration({
    lsKey: LS_KEY,
    receiptInputId: "popup-receipt-upload",
    specialProgramSlug: cta.slug || undefined,
    ageMin: cta.ageMin,
    ageMax: cta.ageMax,
  });
  const {
    form, setForm, loading, bankAccounts, isSuccess, setIsSuccess, successInfo,
    attempted, setAttempted, emailHint, setEmailHint, schoolsList, focusedSchoolIdx, setFocusedSchoolIdx,
    uploadingReceipt, restored, whatsappGroupLink, tuition, handleChange, handlePhoneBlur,
    handleStudentPhoneBlur, handleEmailBlur, handleReceiptUpload, handleReceiptRemove, handleSubmit, resetForm, clearDraft,
  } = reg;

  const [activeTab, setActiveTab] = useState<'form' | 'qr'>('form');
  const { labelCls, inputCls } = summerFormStyles("popup");
  const { total: tuitionTotalLabel, deposit: tuitionDepositLabel, fullShort: fullTuitionLabel, splitShort: splitTuitionLabel, isOnsite } = tuition;

  const downloadQRCode = () => {
    const svg = document.getElementById("summer-school-popup-qr-svg");
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

  const handleClose = () => {
    if (isSuccess) {
      setIsSuccess(false);
      resetForm();
    }
    setAttempted(false);
    onClose();
  };

  const copyRegisterLink = () => {
    if (navigator.clipboard) {
      const url = registerUrl;
      navigator.clipboard.writeText(url);
      toast.success("Summer School registration link copied to clipboard!");
    }
  };

  if (!isOpen) return null;

  if (isNativeApp) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="max-h-[94dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-card p-6 shadow-2xl sm:rounded-3xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Summer School</p>
              <h2 className="mt-1 text-xl font-black text-foreground">{cta.title}</h2>
            </div>
            <button type="button" onClick={handleClose} className="rounded-xl bg-muted p-2 text-muted-foreground" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <NativeSummerRegistrationForm registration={reg} programmeTitle={cta.title} ageMin={cta.ageMin} ageMax={cta.ageMax} />
          <p className="mt-4 text-center text-xs text-muted-foreground">Registration assistance and programme updates are available through your account email and support team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-foreground/35 dark:bg-black/70 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card text-card-foreground border border-border w-full max-w-3xl max-h-[92vh] overflow-y-auto relative shadow-2xl border-t-8 border-t-primary rounded-t-3xl sm:rounded-none">

        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-2.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all z-20 cursor-pointer no-print"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="relative p-8 sm:p-12 border-b border-border no-print">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] pointer-events-none" />

          <div className="flex items-center gap-3 mb-6">
            <div className="px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
              Summer School 2026
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Now Enrolling</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-foreground tracking-tighter leading-[0.9] mb-5 uppercase">
            LEVEL UP <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary">THIS SUMMER.</span>
          </h1>

          <p className="max-w-xl text-muted-foreground font-medium text-sm sm:text-base leading-relaxed">
            An intensive programme covering coding, robotics, and AI — online and onsite. Open to kids, teens, adults, and individual learners.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-10">
            {[
              { icon: Calendar, text: "June 28th, 2026", sub: "Cohort Start Date" },
              { icon: Calendar, text: "July 1st, 2026", sub: "Registration Deadline" },
              { icon: Calendar, text: "September 7th, 2026", sub: "Programme Ending Date" },
              { icon: MapPin, text: "Online & Onsite", sub: "Flexible Attendance" },
            ].map((item, i) => (
              <div key={i} className="p-5 bg-muted/30 border border-border">
                <item.icon className="w-4 h-4 text-primary mb-3" />
                <div className="text-[10px] font-black text-foreground uppercase tracking-widest">{item.text}</div>
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 sm:p-12 space-y-10">
          {/* Restored draft banner */}
          {restored && !isSuccess && (
            <div className="flex items-center justify-between gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-xs no-print">
              <p className="text-primary font-bold">Your previous draft has been restored.</p>
              <button
                type="button"
                onClick={clearDraft}
                className="text-[9px] font-black text-primary hover:opacity-85 transition-all uppercase"
              >
                Clear
              </button>
            </div>
          )}

          {/* Programme Highlights */}
          <div className="no-print">
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-5 flex items-center gap-3">
              <div className="w-6 h-px bg-primary" />
              Programme Highlights
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { title: "JSS3 Preparation", desc: "Advanced programming and logic for exam excellence." },
                { title: "Project-Based Learning", desc: "Build real apps, games, and systems from scratch." },
                { title: "Career Readiness", desc: "Tech skills and guidance for the future." },
                { title: "Certificate Award", desc: "Recognised certificate on programme completion." },
              ].map((mod, i) => (
                <div key={i} className="p-5 border border-border bg-muted/20 flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-primary mt-1.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-[11px] font-black text-foreground uppercase tracking-widest mb-1">{mod.title}</h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{mod.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Registration Mode Tabs */}
          <div className="bg-muted/20 border border-border p-7 sm:p-10">
            {isSuccess && successInfo ? (
              <SummerSchoolSuccessTicket
                successInfo={successInfo}
                whatsappGroupLink={whatsappGroupLink}
                variant="popup"
                programmeTitle={cta.title || 'Rillcod special programme'}
                learnerAge={form.age ? parseInt(form.age, 10) : null}
                learnerGrade={form.currentClass || null}
                onRegisterAnother={() => {
                  setIsSuccess(false);
                  resetForm();
                }}
              />
            ) : (
              <>
                <div className="flex border border-border mb-8">
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === 'form' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                      }`}
                  >
                    ✍️ Register Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('qr')}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === 'qr' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                      }`}
                  >
                    📱 Scan QR Code
                  </button>
                </div>

                {activeTab === 'form' ? (
                  <>
                    <div className="flex items-center gap-3 mb-8">
                      <Sparkles className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Register Your Child</h3>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className={labelCls(attempted && !form.studentName.trim())}>Learner full name *</label>
                          <input type="text" name="studentName" required value={form.studentName} onChange={handleChange}
                            className={inputCls(attempted && !form.studentName.trim())} placeholder="Student's full name" />
                          {attempted && !form.studentName.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Student's name is required</p>}
                        </div>
                        <div>
                          <label className={labelCls(attempted && !form.parentName.trim())}>Parent / guardian / self (if adult) *</label>
                          <input type="text" name="parentName" required value={form.parentName} onChange={handleChange}
                            className={inputCls(attempted && !form.parentName.trim())} placeholder="Your name or parent/guardian" />
                          {attempted && !form.parentName.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Contact name is required</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Parent Phone */}
                        <div>
                          <label className={labelCls(attempted && (!form.phone.trim() || !isValidWhatsApp(form.phone)))}>Parent Phone Number *</label>
                          <div className="relative">
                            <input type="tel" name="phone" required value={form.phone} onChange={handleChange} onBlur={handlePhoneBlur}
                              className={inputCls(attempted && (!form.phone.trim() || !isValidWhatsApp(form.phone))) + " pr-10"} placeholder="+234..." />
                            {form.phone && (
                              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-base font-black ${isValidWhatsApp(form.phone) ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                {isValidWhatsApp(form.phone) ? '✓' : '…'}
                              </span>
                            )}
                          </div>
                          {form.phone && !isValidWhatsApp(form.phone) && (
                            <p className="text-[9px] text-rose-500 font-bold mt-1">⚠ Must be exactly 13 digits (including +234 prefix) or a valid 11-digit local format.</p>
                          )}
                          {attempted && !form.phone.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Parent's phone is required</p>}
                        </div>

                        {/* Student Phone */}
                        <div>
                          <label className={labelCls(!!(attempted && form.studentPhone.trim() && !isValidWhatsApp(form.studentPhone)))}>Student Phone Number (Optional)</label>
                          <div className="relative">
                            <input type="tel" name="studentPhone" value={form.studentPhone} onChange={handleChange} onBlur={handleStudentPhoneBlur}
                              className={inputCls(!!(attempted && form.studentPhone.trim() && !isValidWhatsApp(form.studentPhone))) + " pr-10"} placeholder="+234..." />
                            {form.studentPhone && (
                              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-base font-black ${isValidWhatsApp(form.studentPhone) ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                {isValidWhatsApp(form.studentPhone) ? '✓' : '…'}
                              </span>
                            )}
                          </div>
                          {form.studentPhone && !isValidWhatsApp(form.studentPhone) && (
                            <p className="text-[9px] text-rose-500 font-bold mt-1">⚠ Must be exactly 13 digits (including +234 prefix) or a valid 11-digit local format.</p>
                          )}
                        </div>
                      </div>

                      {/* Parent Email Address */}
                      <div>
                        <label className={labelCls(attempted && !form.email.trim())}>Parent Email Address *</label>
                        <input type="email" name="email" required value={form.email} onChange={handleChange} onBlur={handleEmailBlur}
                          className={inputCls(attempted && !form.email.trim())} placeholder="parent@example.com" />
                        {attempted && !form.email.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Parent's email is required for credentials and receipt delivery</p>}
                        {emailHint && (
                          <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 mt-2 flex items-center justify-between text-xs">
                            <p className="text-primary font-bold">Did you mean <span className="underline select-all">{emailHint}</span>?</p>
                            <button
                              type="button"
                              onClick={() => {
                                setForm(prev => ({ ...prev, email: emailHint }));
                                setEmailHint(null);
                              }}
                              className="text-[9px] font-black text-primary hover:opacity-85 transition-all uppercase"
                            >
                              Yes, Fix
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Consent — parental (required) + WhatsApp opt-in (optional) */}
                      <div className="space-y-2.5">
                        <label className={`flex items-start gap-2.5 cursor-pointer rounded-xl border p-3 transition-all ${attempted && !form.parentConsent ? 'border-rose-500 ring-1 ring-rose-500/30 bg-rose-500/5' : 'border-border bg-card hover:border-primary/40'}`}>
                          <input type="checkbox" name="parentConsent" checked={form.parentConsent} onChange={handleChange} className="mt-0.5 w-4 h-4 accent-primary shrink-0" />
                          <span className="text-[11px] text-foreground leading-relaxed">
                            <span className="font-black uppercase tracking-wide text-[9px] text-primary">Consent (Required)</span><br />
                            I confirm I am the learner (adult/individual) or the parent/guardian, and I consent to participation and processing of academic records.
                          </span>
                        </label>
                        {attempted && !form.parentConsent && <p className="text-rose-500 text-[9px] font-bold mt-1">Consent is required to register.</p>}

                        <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-border bg-card p-3 hover:border-primary/40 transition-all">
                          <input type="checkbox" name="whatsappConsent" checked={form.whatsappConsent} onChange={handleChange} className="mt-0.5 w-4 h-4 accent-primary shrink-0" />
                          <span className="text-[11px] text-foreground leading-relaxed">
                            <span className="font-black uppercase tracking-wide text-[9px] text-muted-foreground">WhatsApp Opt-in (Optional)</span><br />
                            I consent to receiving login credentials, payment receipts, and student updates via WhatsApp.
                          </span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Current School with autocomplete */}
                        <div className="relative">
                          <label className={labelCls()}>Current School (Optional)</label>
                          <input type="text" name="school" value={form.school} onChange={handleChange}
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
                        <div>
                          <label className={labelCls(attempted && !form.currentClass)}>Current grade / status *</label>
                          <select name="currentClass" required value={form.currentClass} onChange={handleChange}
                            className={inputCls(attempted && !form.currentClass) + " appearance-none cursor-pointer select-premium"}>
                            <option value="">Select grade or status</option>
                            {SPECIAL_LEARNER_GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                          {attempted && !form.currentClass && <p className="text-rose-500 text-[9px] font-bold mt-1">Grade or status is required</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className={labelCls(attempted && !form.age)}>Age *</label>
                          <input type="number" name="age" required min={cta.ageMin} max={cta.ageMax} value={form.age} onChange={handleChange}
                            className={inputCls(attempted && !form.age)} placeholder="8–99 (adults welcome)" />
                          {attempted && !form.age && <p className="text-rose-500 text-[9px] font-bold mt-1">Age is required (adults & individuals welcome)</p>}
                        </div>
                        <div>
                          <label className={labelCls(attempted && !form.gender)}>Gender *</label>
                          <select name="gender" required value={form.gender} onChange={handleChange}
                            className={inputCls(attempted && !form.gender) + " appearance-none cursor-pointer select-premium"}>
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
                          {attempted && !form.gender && <p className="text-rose-500 text-[9px] font-bold mt-1">Gender is required</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className={labelCls(attempted && !form.preferredMode)}>Preferred Attendance Mode *</label>
                          <select name="preferredMode" required value={form.preferredMode} onChange={handleChange}
                            className={inputCls(attempted && !form.preferredMode) + " appearance-none cursor-pointer select-premium"}>
                            <option value="">Select Mode</option>
                            <option value="Online">Online (Remote) — ₦50,000 · Batch B · Tue / Thu / Sat</option>
                            <option value="Onsite">Onsite (In-Person centre) — ₦40,000 for the cohort</option>
                            <option value="Hybrid">Hybrid (Once in 3 weeks check-up)</option>
                          </select>
                          {attempted && !form.preferredMode && <p className="text-rose-500 text-[9px] font-bold mt-1">Mode is required</p>}
                          {(form.preferredMode === 'Online' || form.preferredMode === 'Hybrid') && (
                            <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg text-[9px] text-foreground/80 mt-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                              <strong className="text-amber-600 dark:text-amber-400">Batch B · 2nd cohort</strong>
                              {' — '}Classes tentatively Tuesday, Thursday &amp; Saturday.
                            </div>
                          )}
                          {(form.preferredMode === 'Onsite' || form.preferredMode === 'Hybrid') && (
                            <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-lg text-[9px] text-foreground/80 mt-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200 flex gap-2">
                              <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              <span>
                                <strong className="text-emerald-600 dark:text-emerald-400">{SUMMER_CENTRE.name}</strong>
                                {' — '}{SUMMER_CENTRE.address}
                                {' · '}{SUMMER_CENTRE.landmark}
                              </span>
                            </div>
                          )}
                          {form.preferredMode === "Hybrid" && (
                            <div className="bg-primary/5 border border-primary/20 p-2.5 rounded-lg text-[9px] text-muted-foreground mt-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                              💡 <strong>Hybrid Mode:</strong> Remote attendance with a mandatory physical check-up/project presentation at {SUMMER_CENTRE.name} **once every 3 weeks** (Week 3 and Week 6) of the 7-week program.
                            </div>
                          )}
                        </div>
                        <div>
                          <label className={labelCls()}>How Did You Hear About Us?</label>
                          <select name="hearAboutUs" value={form.hearAboutUs} onChange={handleChange}
                            className={inputCls() + " appearance-none cursor-pointer select-premium"}>
                            <option value="">Select Source</option>
                            {REGISTRATION_HEAR_ABOUT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Track Options */}
                      <div className="bg-primary/5 border border-primary/20 p-5 rounded-xl text-left">
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
                          className={inputCls()} placeholder="Any special requirements, questions, or comments" />
                      </div>

                      {/* Payment Section */}
                      <div className="border-t border-border pt-6 mt-6 space-y-6">
                        <div>
                          <h4 className="text-xs font-black uppercase text-foreground mb-4">Payment Setup & Tuition</h4>
                          <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl mb-4 text-xs text-muted-foreground leading-relaxed">
                            Summer School Tuition is <strong className="text-primary font-black">{tuitionTotalLabel}</strong> for {isOnsite ? 'Onsite' : 'Online / Hybrid'} attendance. You can choose to pay in full or pay a <strong className="text-primary font-black">50% installment deposit ({tuitionDepositLabel})</strong> to secure your slot.
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelCls()}>Tuition Plan *</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentPlan: "full" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentPlan === "full"
                                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                  }`}
                              >
                                {fullTuitionLabel}
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentPlan: "installment" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentPlan === "installment"
                                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                  }`}
                              >
                                {splitTuitionLabel}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className={labelCls()}>Payment Method *</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentMethod: "paystack" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentMethod === "paystack"
                                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                  }`}
                              >
                                💳 Online
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentMethod: "bank_transfer" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${form.paymentMethod === "bank_transfer"
                                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                                  : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                  }`}
                              >
                                🏦 Transfer
                              </button>
                            </div>
                          </div>
                        </div>

                        {form.paymentMethod === "bank_transfer" && (
                          <div className="bg-muted/30 border border-border p-4 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <h5 className="text-[10px] font-black text-primary uppercase tracking-widest">Official Bank Accounts</h5>

                            {bankAccounts.map((account, index) => (
                              <div key={index} className="space-y-1.5 p-3 bg-background/50 rounded-lg border border-border/50 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-black">{account.label}</span>
                                  <span className="font-black text-foreground">{account.bank_name}</span>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                  <span className="font-mono font-bold text-primary select-all">{account.account_number}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(account.account_number);
                                      toast.success("Account number copied!");
                                    }}
                                    className="text-[8px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest bg-muted px-2 py-1 rounded border border-border cursor-pointer"
                                  >
                                    Copy
                                  </button>
                                </div>
                                <p className="text-[9px] text-muted-foreground uppercase font-bold">{account.account_name}</p>
                              </div>
                            ))}

                            <div className="space-y-2 pt-2">
                              <label className={labelCls(attempted && !form.paymentReference.trim())}>Transfer Reference / Depositor Name *</label>
                              <input
                                type="text"
                                name="paymentReference"
                                required
                                value={form.paymentReference.startsWith('http') ? 'Receipt Screenshot Uploaded' : form.paymentReference}
                                readOnly={form.paymentReference.startsWith('http')}
                                onChange={handleChange}
                                className={inputCls(attempted && !form.paymentReference.trim())}
                                placeholder="e.g. Providus Ref or Sender Name"
                              />

                              <div className="flex items-center gap-3 mt-2">
                                <div className="relative flex-1">
                                  <input
                                    type="file"
                                    id="popup-receipt-upload"
                                    accept="image/*"
                                    onChange={handleReceiptUpload}
                                    disabled={uploadingReceipt}
                                    className="hidden"
                                  />
                                  <label
                                    htmlFor="popup-receipt-upload"
                                    className={`w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${uploadingReceipt
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
                                  <div className="mt-3 p-3 bg-background rounded-xl border border-border space-y-2 relative group overflow-hidden w-full text-xs">
                                    <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest leading-none mb-1">Receipt Screenshot Preview</p>
                                    <div className="relative aspect-video max-w-[240px] rounded-lg overflow-hidden border border-border/80 bg-muted/20">
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
                                        className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[9px] font-black uppercase tracking-wider rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
                                      >
                                        Remove Receipt
                                      </button>
                                      <a
                                        href={form.paymentReference}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-[9px] font-black uppercase tracking-wider rounded-lg border border-border transition-colors text-center"
                                      >
                                        View Full Size
                                      </a>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {attempted && !form.paymentReference.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Reference name is required</p>}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 py-5 bg-primary text-primary-foreground font-black text-sm uppercase tracking-widest hover:opacity-95 transition-opacity shadow-xl shadow-primary/20 disabled:opacity-50 cursor-pointer"
                      >
                        {loading ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4" /> Complete Registration <ArrowRight className="w-4 h-4" /></>
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center space-y-6 relative overflow-hidden">
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
                        <QRCode
                          id="summer-school-popup-qr-svg"
                          value={registerUrl}
                          size={130}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 w-full max-w-[240px]">
                      <button
                        type="button"
                        onClick={downloadQRCode}
                        className="flex-1 py-2.5 bg-muted hover:bg-muted/80 border border-border text-foreground font-black text-[10px] uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                      >
                        📥 Download
                      </button>
                      <button
                        type="button"
                        onClick={copyRegisterLink}
                        className="flex-1 py-2.5 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                      >
                        🔗 Copy Link
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground uppercase tracking-widest">Scan to Register on Mobile</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                        Open your phone's camera and point it at the code to load the Rillcod registration form instantly on your mobile device.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Contact */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold no-print">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-foreground">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <span className="uppercase tracking-widest">{brandContact.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="w-3.5 h-3.5 text-primary" />
                <span className="uppercase tracking-widest">{brandContact.email}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-[9px] uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" /> SSL Secured
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

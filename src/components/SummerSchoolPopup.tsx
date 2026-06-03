"use client";

import { useState, useEffect, useRef } from "react";
import { X, Calendar, MapPin, Clock, Phone, Mail, Sparkles, ShieldCheck, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";

interface SummerSchoolPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── WhatsApp formatting helpers ──
function formatWhatsApp(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234') && digits.length >= 4) return '+' + digits;
  if (digits.startsWith('0') && digits.length >= 2) return '+234' + digits.slice(1);
  return '+234' + digits;
}
function isValidWhatsApp(v: string): boolean {
  const digits = v.replace(/\D/g, '');
  return digits.startsWith('234') && digits.length === 13;
}

// ── Email typo helpers ──
const EMAIL_TYPOS: Record<string, string> = {
  'gmail.con': 'gmail.com',  'gmail.cm': 'gmail.com',   'gmial.com': 'gmail.com',
  'gmal.com':  'gmail.com',  'gmail.co': 'gmail.com',   'gmaill.com': 'gmail.com',
  'yaoo.com':  'yahoo.com',  'yaho.com': 'yahoo.com',   'yahoo.con': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',  'yaho.co':  'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'icolud.com':  'icloud.com',  'icoud.com':  'icloud.com',
};
function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const fix = EMAIL_TYPOS[domain];
  if (!fix) return null;
  return email.slice(0, at + 1) + fix;
}

const LS_KEY = "rillcod_summer_school_popup_draft";

export default function SummerSchoolPopup({ isOpen, onClose }: SummerSchoolPopupProps) {
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    studentName: "",
    parentName: "",
    phone: "",
    email: "",
    studentPhone: "",
    school: "",
    currentClass: "",
    age: "",
    gender: "",
    preferredMode: "",
    hearAboutUs: "",
    trackInterest: "all", // "all" = Full AI Explorer
    additionalInfo: "",
    paymentMethod: "paystack", // "paystack" | "bank_transfer"
    paymentPlan: "full", // "full" | "installment"
    paymentReference: "",
  });

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'qr'>('form');
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successInfo, setSuccessInfo] = useState<any>(null);
  const [attempted, setAttempted] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [schoolsList, setSchoolsList] = useState<string[]>([]);
  const [focusedSchoolIdx, setFocusedSchoolIdx] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setForm(prev => ({ ...prev, ...saved }));
        setRestored(true);
      }
    } catch {}
  }, []);

  // Save draft on change
  useEffect(() => {
    if (isSuccess) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(form));
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [form, isSuccess]);

  // Load parent profile values
  useEffect(() => {
    if (profile) {
      setForm(prev => ({
        ...prev,
        parentName: prev.parentName || profile.full_name || "",
        email: prev.email || profile.email || user?.email || "",
        phone: prev.phone || profile.phone || "",
      }));
    }
  }, [profile, user]);

  useEffect(() => {
    if (!isOpen) return;
    
    const supabase = createClient();
    supabase
      .from('payment_accounts')
      .select('bank_name, account_number, account_name, label')
      .eq('is_active', true)
      .eq('owner_type', 'global')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setBankAccounts(data);
        } else {
          setBankAccounts([
            {
              bank_name: "Zenith Bank",
              account_number: "1228741369",
              account_name: "Rillcod Technologies Limited",
              label: "Corporate Operations"
            }
          ]);
        }
      });

    supabase
      .from('schools')
      .select('name')
      .order('name')
      .then(({ data }) => {
        if (data) {
          setSchoolsList(data.map((s: any) => s.name).filter(Boolean));
        }
      });
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePhoneBlur = () => {
    if (form.phone) {
      setForm(prev => ({ ...prev, phone: formatWhatsApp(prev.phone) }));
    }
  };

  const handleStudentPhoneBlur = () => {
    if (form.studentPhone) {
      setForm(prev => ({ ...prev, studentPhone: formatWhatsApp(prev.studentPhone) }));
    }
  };

  const handleEmailBlur = () => {
    if (form.email) {
      setEmailHint(suggestEmail(form.email));
    } else {
      setEmailHint(null);
    }
  };

  const canSubmit =
    form.studentName.trim() &&
    form.parentName.trim() &&
    form.phone.trim() &&
    isValidWhatsApp(form.phone) &&
    form.studentPhone.trim() &&
    isValidWhatsApp(form.studentPhone) &&
    form.email.trim() &&
    form.currentClass &&
    form.age &&
    form.gender &&
    form.preferredMode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setAttempted(true);
      toast.error("Please fill in all required fields correctly.");
      return;
    }
    setLoading(true);
    try {
      const selectedTrackLabel = form.trackInterest === "all" 
        ? "Full AI Explorer (All Tracks)" 
        : form.trackInterest === "generative_art" 
          ? "Generative Art" 
          : form.trackInterest === "ai_foundations"
            ? "AI Foundations"
            : form.trackInterest === "web_app"
              ? "Web & App"
              : "AI Game Design";
      
      const fullNotes = `[Track Choice: ${selectedTrackLabel}] [Plan: ${form.paymentPlan}] [Method: ${form.paymentMethod}] ${form.paymentReference ? `[Ref: ${form.paymentReference}]` : ''} ${form.additionalInfo}`;

      const res = await fetch('/api/summer-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name:   form.studentName,
          parent_name:    form.parentName,
          parent_phone:   form.phone,
          parent_email:   form.email     || undefined,
          student_phone:  form.studentPhone,
          school:         form.school    || undefined,
          current_class:  form.currentClass || undefined,
          age:            form.age ? parseInt(form.age, 10) : undefined,
          gender:         form.gender    || undefined,
          preferred_mode: form.preferredMode || undefined,
          hear_about_us:  form.hearAboutUs || undefined,
          additional_info: fullNotes,
          payment_method: form.paymentMethod,
          payment_plan: form.paymentPlan,
          payment_reference: form.paymentReference || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      // Clear saved session
      try { localStorage.removeItem(LS_KEY); } catch {}

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        setSuccessInfo({
          studentName: form.studentName,
          parentPhone: form.phone,
          plan: form.paymentPlan,
          method: form.paymentMethod,
          reference: data.reference,
        });
        setIsSuccess(true);
        toast.success("Summer School registration submitted. Our team will verify your payment details shortly.");
      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
      setForm({
        studentName: "", parentName: "", phone: "", email: "", studentPhone: "", school: "",
        currentClass: "", age: "", gender: "", preferredMode: "", hearAboutUs: "",
        trackInterest: "all", additionalInfo: "", paymentMethod: "paystack", paymentPlan: "full", paymentReference: ""
      });
    }
    setAttempted(false);
    onClose();
  };

  const copyRegisterLink = () => {
    if (navigator.clipboard) {
      const url = typeof window !== 'undefined' ? `${window.location.origin}/summer-school` : 'https://www.rillcod.com/summer-school';
      navigator.clipboard.writeText(url);
      toast.success("Summer School registration link copied to clipboard!");
    }
  };

  if (!isOpen) return null;

  const inputCls = (hasError = false) =>
    `w-full bg-background border ${hasError ? 'border-rose-500 ring-1 ring-rose-500/30' : 'border-border'} px-5 py-4 text-foreground text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/40`;

  const labelCls = (hasError = false) =>
    `block text-[10px] font-black ${hasError ? 'text-rose-500' : 'text-muted-foreground'} uppercase tracking-widest mb-2`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto relative shadow-2xl border-t-8 border-t-primary">

        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-2.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all z-20 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="relative p-8 sm:p-12 border-b border-border">
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
            An intensive programme covering coding, robotics, and AI — available online and onsite. Open JSS1 – SS3 students.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-10">
            {[
              { icon: Calendar, text: "June 8th – 12th, 2026", sub: "Cohort Start Window" },
              { icon: Calendar, text: "June 12th, 2026",       sub: "Registration Deadline" },
              { icon: Calendar, text: "August 8th, 2026",      sub: "Programme Ending Date" },
              { icon: MapPin,   text: "Online & Onsite",       sub: "Flexible Attendance" },
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
            <div className="flex items-center justify-between gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 text-xs">
              <p className="text-primary font-bold">Your previous draft has been restored.</p>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.removeItem(LS_KEY); } catch {}
                  setForm({
                    studentName: "", parentName: "", phone: "", email: "", studentPhone: "", school: "",
                    currentClass: "", age: "", gender: "", preferredMode: "", hearAboutUs: "",
                    trackInterest: "all", additionalInfo: "", paymentMethod: "paystack", paymentPlan: "full", paymentReference: ""
                  });
                  setRestored(false);
                }}
                className="text-[9px] font-black text-primary hover:opacity-85 transition-all uppercase"
              >
                Clear
              </button>
            </div>
          )}

          {/* Programme Highlights */}
          <div>
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-5 flex items-center gap-3">
              <div className="w-6 h-px bg-primary" />
              Programme Highlights
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { title: "JSS3 Preparation",       desc: "Advanced programming and logic for exam excellence." },
                { title: "Project-Based Learning",  desc: "Build real apps, games, and systems from scratch." },
                { title: "Career Readiness",        desc: "Tech skills and guidance for the future." },
                { title: "Certificate Award",       desc: "Recognised certificate on programme completion." },
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
            {isSuccess ? (
              <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 text-center">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500 text-2xl font-black">
                  ✓
                </div>
                <div>
                  <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                    Admission Ticket Issued
                  </span>
                  <h3 className="text-xl font-black uppercase text-foreground mt-4">Registration Completed</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Thank you for enrolling {successInfo?.studentName} in the Rillcod AI Summer School 2026.
                  </p>
                </div>

                {/* Ticket Detail Block */}
                <div className="border border-dashed border-border bg-background/50 p-6 rounded-xl space-y-4 text-left text-xs font-bold relative">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-[#141618] rounded-r-full border-r border-border -ml-1.5" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-[#141618] rounded-l-full border-l border-border -mr-1.5" />
                  
                  <div className="flex justify-between items-start border-b border-border pb-3">
                    <div>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Student</p>
                      <p className="text-sm font-black text-foreground">{successInfo?.studentName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cohort Window</p>
                      <p className="text-xs font-black text-amber-500">June 8 – August 8</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs font-bold border-b border-border pb-3 text-foreground">
                    <div>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Plan Selected</p>
                      <p className="uppercase">{successInfo?.plan === 'installment' ? 'Installment Deposit' : 'Full Payment'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Payment Method</p>
                      <p className="uppercase">{successInfo?.method === 'bank_transfer' ? 'Manual Transfer' : 'Online checkout'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Reference / Notes</p>
                      <p className="font-mono text-[10px] truncate select-all">{successInfo?.reference}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Payment Status</p>
                      <p className={successInfo?.method === 'bank_transfer' ? 'text-amber-500 animate-pulse uppercase' : 'text-emerald-500 uppercase'}>
                        {successInfo?.method === 'bank_transfer' ? 'Verification Pending' : 'Paid / Confirmed'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-1 text-center">
                    <p className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">rillcod technologies limited • summer admissions</p>
                  </div>
                </div>

                {/* WhatsApp button */}
                <div className="space-y-3">
                  <a
                    href="https://chat.whatsapp.com/G5l4M9x8Z8B7V6C5X4Z3Y2"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/50 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📱</span>
                      <div className="text-left">
                        <p className="text-xs font-black text-emerald-400 uppercase tracking-wide">Join Student WhatsApp Group</p>
                        <p className="text-[9px] text-muted-foreground leading-none mt-0.5">Lesson materials, schedules & project updates</p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-emerald-400 group-hover:translate-x-1 transition-transform uppercase tracking-wider">Join →</span>
                  </a>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-border">
                  <button
                    onClick={() => window.print()}
                    className="flex-1 py-3 bg-muted hover:bg-muted/80 border border-border rounded-xl text-[10px] font-black uppercase tracking-widest text-foreground transition-colors cursor-pointer"
                  >
                    🖨️ Print Ticket
                  </button>
                  <button
                    onClick={() => {
                      setIsSuccess(false);
                      setForm({
                        studentName: "", parentName: "", phone: "", email: "", studentPhone: "", school: "",
                        currentClass: "", age: "", gender: "", preferredMode: "", hearAboutUs: "",
                        trackInterest: "all", additionalInfo: "", paymentMethod: "paystack", paymentPlan: "full", paymentReference: ""
                      });
                    }}
                    className="flex-1 py-3 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                  >
                    Register Another
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex border border-border mb-8">
                  <button
                    type="button"
                    onClick={() => setActiveTab('form')}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                      activeTab === 'form' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    ✍️ Register Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('qr')}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                      activeTab === 'qr' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
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
                          <label className={labelCls(attempted && !form.studentName.trim())}>Student Full Name *</label>
                          <input type="text" name="studentName" required value={form.studentName} onChange={handleChange}
                            className={inputCls(attempted && !form.studentName.trim())} placeholder="Student's full name" />
                          {attempted && !form.studentName.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Student's name is required</p>}
                        </div>
                        <div>
                          <label className={labelCls(attempted && !form.parentName.trim())}>Parent / Guardian Name *</label>
                          <input type="text" name="parentName" required value={form.parentName} onChange={handleChange}
                            className={inputCls(attempted && !form.parentName.trim())} placeholder="Parent's full name" />
                          {attempted && !form.parentName.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Parent's name is required</p>}
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
                          <label className={labelCls(attempted && (!form.studentPhone.trim() || !isValidWhatsApp(form.studentPhone)))}>Student Phone Number *</label>
                          <div className="relative">
                            <input type="tel" name="studentPhone" required value={form.studentPhone} onChange={handleChange} onBlur={handleStudentPhoneBlur}
                              className={inputCls(attempted && (!form.studentPhone.trim() || !isValidWhatsApp(form.studentPhone))) + " pr-10"} placeholder="+234..." />
                            {form.studentPhone && (
                              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-base font-black ${isValidWhatsApp(form.studentPhone) ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                {isValidWhatsApp(form.studentPhone) ? '✓' : '…'}
                              </span>
                            )}
                          </div>
                          {form.studentPhone && !isValidWhatsApp(form.studentPhone) && (
                            <p className="text-[9px] text-rose-500 font-bold mt-1">⚠ Must be exactly 13 digits (including +234 prefix) or a valid 11-digit local format.</p>
                          )}
                          {attempted && !form.studentPhone.trim() && <p className="text-rose-500 text-[9px] font-bold mt-1">Student's phone is required</p>}
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
                          <label className={labelCls(attempted && !form.currentClass)}>Current Grade *</label>
                          <select name="currentClass" required value={form.currentClass} onChange={handleChange}
                            className={inputCls(attempted && !form.currentClass) + " appearance-none cursor-pointer select-premium"}>
                            <option value="">Select Grade</option>
                            {["JSS1","JSS2","JSS3","SS1","SS2","SS3"].map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                          {attempted && !form.currentClass && <p className="text-rose-500 text-[9px] font-bold mt-1">Grade is required</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                          <label className={labelCls(attempted && !form.age)}>Student Age *</label>
                          <input type="number" name="age" required min={5} max={25} value={form.age} onChange={handleChange}
                            className={inputCls(attempted && !form.age)} placeholder="Age in years" />
                          {attempted && !form.age && <p className="text-rose-500 text-[9px] font-bold mt-1">Age is required</p>}
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
                            <option value="Online">Online (Remote)</option>
                            <option value="Onsite">Onsite (In-Person)</option>
                            <option value="Hybrid">Hybrid</option>
                          </select>
                          {attempted && !form.preferredMode && <p className="text-rose-500 text-[9px] font-bold mt-1">Mode is required</p>}
                        </div>
                        <div>
                          <label className={labelCls()}>How Did You Hear About Us?</label>
                          <select name="hearAboutUs" value={form.hearAboutUs} onChange={handleChange}
                            className={inputCls() + " appearance-none cursor-pointer select-premium"}>
                            <option value="">Select Source</option>
                            <option value="Social Media">Social Media</option>
                            <option value="School / Teacher">School or Teacher</option>
                            <option value="Friend / Family">Friend or Family</option>
                            <option value="Website">Website</option>
                            <option value="Flyer / Poster">Flyer or Poster</option>
                            <option value="Other">Other</option>
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
                            Summer School Tuition is <strong className="text-primary font-black">₦70,000</strong>. You can choose to pay in full or pay a <strong className="text-primary font-black">50% installment deposit (₦35,000)</strong> to secure your slot.
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelCls()}>Tuition Plan *</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentPlan: "full" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${
                                  form.paymentPlan === "full"
                                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                }`}
                              >
                                Full (₦70k)
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentPlan: "installment" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${
                                  form.paymentPlan === "installment"
                                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                }`}
                              >
                                Split (₦35k)
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className={labelCls()}>Payment Method *</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentMethod: "paystack" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${
                                  form.paymentMethod === "paystack"
                                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                }`}
                              >
                                💳 Online
                              </button>
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, paymentMethod: "bank_transfer" }))}
                                className={`py-3 px-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-wider cursor-pointer ${
                                  form.paymentMethod === "bank_transfer"
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
                                value={form.paymentReference}
                                onChange={handleChange}
                                className={inputCls(attempted && !form.paymentReference.trim())}
                                placeholder="e.g. Zenith Ref or Sender Name"
                              />
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
                          value={typeof window !== 'undefined' ? `${window.location.origin}/summer-school` : 'https://www.rillcod.com/summer-school'}
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
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-foreground">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <span className="uppercase tracking-widest">+234 811 660 0091</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="w-3.5 h-3.5 text-primary" />
                <span className="uppercase tracking-widest">support@rillcod.com</span>
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

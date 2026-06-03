"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Calendar, MapPin, Clock, Phone, Mail, Sparkles, 
  ShieldCheck, ArrowRight, CheckCircle, Loader2, 
  QrCode, BookOpen, Award, Terminal, Flame, Gamepad2, Laptop, X
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";

const TRACKS = [
  {
    id: "generative_art",
    icon: "🎨",
    week: "Module 1 · Weeks 1–2",
    title: "Generative Art & Visual Storytelling",
    desc: "Create stunning visuals, digital art, and narrative storyboards using advanced text-to-image AI tools.",
    topics: [
      "Introduction to generative AI & prompting",
      "Prompt engineering for art & illustration",
      "Style consistency and creative direction",
      "AI-assisted graphic design & branding",
      "Project: Personal AI Art Portfolio"
    ]
  },
  {
    id: "ai_foundations",
    icon: "🧠",
    week: "Module 2 · Weeks 1–3",
    title: "AI Foundations",
    desc: "Understand what Artificial Intelligence is, how machine learning models learn, and the ethics of AI.",
    topics: [
      "AI vs. Machine Learning basics",
      "How neural networks train on data",
      "Ethics: bias, fairness, and safety in AI",
      "Python programming fundamentals",
      "Project: Interactive AI-powered script"
    ]
  },
  {
    id: "web_app",
    icon: "🌐",
    week: "Module 3 · Weeks 3–5",
    title: "Web & App Creation with AI",
    desc: "Code and deploy real web applications integrated with live AI intelligence APIs like Gemini.",
    topics: [
      "HTML, CSS, and JavaScript basics",
      "Connecting web frontends to AI APIs",
      "Flask backend framework in Python",
      "Building a custom AI chatbot helper",
      "Project: Launch your own AI web tool"
    ]
  },
  {
    id: "game_design",
    icon: "🎮",
    week: "Module 4 · Weeks 4–6",
    title: "AI Game Design",
    desc: "Design and program video games containing intelligent AI opponents and procedural levels.",
    topics: [
      "Core game design & mechanics",
      "Procedural world generation",
      "Decision trees and basic game pathfinding",
      "Coding games using Python & Pygame",
      "Project: Build and publish an AI game"
    ]
  }
];

const WEEKS = [
  { num: "Week 1", tag: "Foundations", title: "AI Basics & Prompts Kickoff", desc: "Understanding how models think, prompt mechanics, and starting image generation." },
  { num: "Week 2", tag: "Creative AI", title: "Storytelling & Digital Art", desc: "Creating consistent characters, layout planning, and assembling the art portfolio." },
  { num: "Week 3", tag: "Coding", title: "Python & Your First Chatbot", desc: "Learning Python logic and writing scripts that connect to Google Gemini APIs." },
  { num: "Week 4", tag: "Build", title: "AI Web Apps & Game Logic", desc: "Setting up a web server, rendering data, and designing intelligent game behaviors." },
  { num: "Week 5", tag: "Media", title: "Bonus Track: Video Ads & Marketing", desc: "Scriptwriting, generating AI voiceovers, producing video ads, and packaging products." },
  { num: "Week 6", tag: "Demo Day", title: "Final Projects & Graduation", desc: "Polishing code, presenting products, game showcases, and receiving Rillcod certificates." }
];

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

const LS_KEY = "rillcod_summer_school_draft";

export default function SummerSchoolPage() {
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
  const [appUrl, setAppUrl] = useState("https://www.rillcod.com/summer-school");
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

  // Load parent profiles & schools list
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
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin + "/summer-school");
      
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "success") {
        setSuccessInfo({
          studentName: params.get("name") || "Student",
          parentPhone: "",
          plan: params.get("plan") || "full",
          method: params.get("method") || "paystack",
          reference: params.get("reference") || "",
        });
        setIsSuccess(true);
      }
    }

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
  }, []);

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
        : TRACKS.find(t => t.id === form.trackInterest)?.title || form.trackInterest;
      
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
      toast.error(err.message || "Something went wrong. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

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
      toast.success("Summer School registration link copied to clipboard!");
    }
  };

  const inputCls = (hasError = false) =>
    `w-full bg-card border ${hasError ? 'border-rose-500 ring-1 ring-rose-500/30' : 'border-border'} px-5 py-4 text-foreground text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/40 rounded-xl`;

  const labelCls = (hasError = false) =>
    `block text-[10px] font-black ${hasError ? 'text-rose-500' : 'text-muted-foreground'} uppercase tracking-widest mb-2`;

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute top-[800px] left-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-6 py-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 rounded-full text-[10px] font-black uppercase tracking-widest">
            ☀️ Active Season: Summer 2026
          </div>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-none">
            Rillcod AI <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-400 dark:to-amber-500">
              Summer School
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            An intensive hands-on programme teaching kids and teens (ages 8-18) to create, code, and innovate using modern Artificial Intelligence tools.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto pt-6">
            {[
              { label: "Start Date", val: "June 8 – 12, 2026" },
              { label: "Deadline", val: "June 12, 2026", highlight: true },
              { label: "Ending Date", val: "August 8, 2026" },
              { label: "Duration", val: "6 Weeks Cohort" },
              { label: "Audience", val: "Ages 8 – 18" }
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
          <div className="flex items-center justify-between gap-3 bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 max-w-4xl mx-auto">
            <p className="text-xs text-primary font-bold">Your previous summer school draft has been loaded.</p>
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
              className="text-[10px] font-black text-primary hover:opacity-80 transition-all uppercase"
            >
              Clear Draft
            </button>
          </div>
        )}

        {/* Tracks Overview */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">Unified All-In-One Curriculum</h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
              Our 6-week cohort is fully integrated. Students do not choose a single track — they go through all 4 modules sequentially to build complete AI engineering proficiency.
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
        <section className="bg-gradient-to-r from-amber-500/5 to-emerald-500/5 border border-amber-500/20 rounded-3xl p-6 sm:p-10 space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎬</span>
            <div>
              <p className="text-[9px] text-amber-500 uppercase font-black tracking-widest">Included Free Bonus Track</p>
              <h3 className="text-xl sm:text-2xl font-black uppercase text-foreground">AI Video Ads &amp; Product Creation</h3>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-3xl">
            Go beyond coding. Students learn how to build digital products, produce professional commercial-quality video advertisements using AI, script with LLMs, and synthesize AI voiceovers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {[
              { label: "AI Video Editing", desc: "Producing visual media and dynamic sequences" },
              { label: "Voice Synthesis", desc: "Generating scripts and digital voice models" },
              { label: "Digital Entrepreneur", desc: "Designing landing pages and launching projects" }
            ].map(b => (
              <div key={b.label} className="bg-card/50 border border-border/50 p-4 rounded-xl">
                <p className="text-xs font-black text-foreground">{b.label}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Schedule */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">Weekly Curriculum</h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
              A detailed schedule showing our student learning progression over the 6 weeks.
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
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">Expected Outcomes</h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
              What your child will create and take home upon graduating from the program.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { icon: "🖼️", title: "AI Art Portfolio", desc: "A collection of generated consistent character storylines" },
              { icon: "💬", title: "Live Chatbot Web App", desc: "A working Python/JS chatbot program powered by Gemini" },
              { icon: "🎮", title: "Playable AI Game", desc: "A self-coded Pygame featuring intelligent pathfinding" },
              { icon: "📣", title: "Video Ad Campaign", desc: "A commercial video ad demonstrating their tech project" },
              { icon: "🏆", title: "Academy Certificate", desc: "Official credentials of graduation from Rillcod" },
              { icon: "🚀", title: "Entrepreneur Mindset", desc: "Experience taking a project from design to web launch" }
            ].map(o => (
              <div key={o.title} className="bg-card border border-border p-5 rounded-xl text-center space-y-2">
                <span className="text-3xl block">{o.icon}</span>
                <h4 className="text-xs font-black text-foreground uppercase tracking-wider">{o.title}</h4>
                <p className="text-[11px] text-muted-foreground leading-normal">{o.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Form + QR Code Grid */}
        <section id="register" className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pt-8">
          {/* Form / Success Ticket Column */}
          {isSuccess ? (
            <div className="lg:col-span-2 bg-card border border-border p-6 sm:p-10 rounded-2xl space-y-8 shadow-2xl relative overflow-hidden border-t-8 border-t-emerald-500 animate-in fade-in zoom-in-95 duration-500">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] pointer-events-none" />
              
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500 text-3xl font-black">
                  ✓
                </div>
                <div>
                  <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                    Admission Ticket Issued
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black uppercase text-foreground mt-4">Registration Completed</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Thank you for enrolling {successInfo?.studentName} in the Rillcod AI Summer School 2026.
                  </p>
                </div>
              </div>

              {/* Ticket Graphic */}
              <div className="border border-dashed border-border bg-background p-6 rounded-xl space-y-4 font-sans relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-card rounded-r-full border-r border-border -ml-2" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-card rounded-l-full border-l border-border -mr-2" />
                
                <div className="flex justify-between items-start border-b border-border pb-4">
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Student</p>
                    <p className="text-base font-black text-foreground">{successInfo?.studentName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cohort Window</p>
                    <p className="text-xs font-black text-amber-500">June 8 – August 8</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-bold border-b border-border pb-4">
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Plan Selected</p>
                    <p className="text-foreground uppercase">{successInfo?.plan === 'installment' ? 'Installment Deposit' : 'Full Payment'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Payment Method</p>
                    <p className="text-foreground uppercase">{successInfo?.method === 'bank_transfer' ? 'Manual Transfer' : 'Online checkout'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Reference</p>
                    <p className="text-foreground font-mono text-[11px] truncate select-all">{successInfo?.reference}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Payment Status</p>
                    <p className={successInfo?.method === 'bank_transfer' ? 'text-amber-500 animate-pulse uppercase' : 'text-emerald-500 uppercase'}>
                      {successInfo?.method === 'bank_transfer' ? 'Verification Pending' : 'Paid / Confirmed'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <p className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">rillcod technologies limited • summer school admissions</p>
                </div>
              </div>

              {/* Next Steps */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest">Essential Action Steps</h4>
                
                <div className="grid grid-cols-1 gap-3">
                  <a
                    href="https://chat.whatsapp.com/G5l4M9x8Z8B7V6C5X4Z3Y2"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/50 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📱</span>
                      <div className="text-left">
                        <p className="text-xs font-black text-emerald-500 dark:text-emerald-400 uppercase tracking-wide">Join Student WhatsApp Group</p>
                        <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Get real-time lessons, links, and schedule updates</p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-emerald-500 dark:text-emerald-400 group-hover:translate-x-1 transition-transform uppercase tracking-wider">Join →</span>
                  </a>

                  <div className="flex items-start gap-3 p-4 bg-muted/20 border border-border rounded-xl">
                    <span className="text-xl">📧</span>
                    <div className="text-left">
                      <p className="text-xs font-black text-foreground uppercase tracking-wide">Check Your Inbox</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">We have sent a detailed confirmation email with orientation information and access tokens.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-3.5 bg-muted hover:bg-muted/80 border border-border rounded-xl text-xs font-black uppercase tracking-widest text-foreground transition-all cursor-pointer"
                >
                  🖨️ Print Ticket
                </button>
                <button
                  onClick={() => {
                    setIsSuccess(false);
                    window.history.replaceState({}, document.title, window.location.pathname);
                  }}
                  className="flex-1 py-3.5 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                >
                  Register Another Student
                </button>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-card border border-border p-6 sm:p-8 rounded-2xl space-y-6 shadow-2xl">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-black uppercase text-foreground">Summer Registration Form</h3>
              </div>
              
              <div className="bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl flex items-center gap-2.5">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                <p className="text-xs font-black text-rose-500 dark:text-rose-400 uppercase tracking-wider">
                  Registration Deadline: Friday, June 12, 2026. Secure your slot now.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls(attempted && !form.studentName.trim())}>Student Full Name *</label>
                    <input type="text" name="studentName" required value={form.studentName} onChange={handleChange}
                      className={inputCls(attempted && !form.studentName.trim())} placeholder="First & Last Name" />
                    {attempted && !form.studentName.trim() && <p className="text-rose-500 text-[10px] font-bold mt-1">Student's name is required</p>}
                  </div>
                  <div>
                    <label className={labelCls(attempted && !form.parentName.trim())}>Parent / Guardian Name *</label>
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
                        className={inputCls(attempted && (!form.phone.trim() || !isValidWhatsApp(form.phone))) + " pr-10"} placeholder="e.g. 08116600091" />
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
                    <label className={labelCls(attempted && (!form.studentPhone.trim() || !isValidWhatsApp(form.studentPhone)))}>Student Phone Number (WhatsApp) *</label>
                    <div className="relative">
                      <input type="tel" name="studentPhone" required value={form.studentPhone} onChange={handleChange} onBlur={handleStudentPhoneBlur}
                        className={inputCls(attempted && (!form.studentPhone.trim() || !isValidWhatsApp(form.studentPhone))) + " pr-10"} placeholder="e.g. 08022334455" />
                      {form.studentPhone && (
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-base font-black ${isValidWhatsApp(form.studentPhone) ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {isValidWhatsApp(form.studentPhone) ? '✓' : '…'}
                        </span>
                      )}
                    </div>
                    {form.studentPhone && !isValidWhatsApp(form.studentPhone) && (
                      <p className="text-[10px] text-rose-500 font-bold mt-1">⚠ Must be exactly 13 digits (including +234 prefix) or a valid 11-digit local format.</p>
                    )}
                    {attempted && !form.studentPhone.trim() && <p className="text-rose-500 text-[10px] font-bold mt-1">Student's WhatsApp number is required</p>}
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
                    <label className={labelCls(attempted && !form.currentClass)}>Current Grade *</label>
                    <select name="currentClass" required value={form.currentClass} onChange={handleChange}
                      className={inputCls(attempted && !form.currentClass) + " appearance-none cursor-pointer select-premium"}>
                      <option value="">Select Grade</option>
                      {["JSS1","JSS2","JSS3","SS1","SS2","SS3"].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    {attempted && !form.currentClass && <p className="text-rose-500 text-[10px] font-bold mt-1">Student's grade is required</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls(attempted && !form.age)}>Student Age *</label>
                    <input type="number" name="age" required min={5} max={25} value={form.age} onChange={handleChange}
                      className={inputCls(attempted && !form.age)} placeholder="Age" />
                    {attempted && !form.age && <p className="text-rose-500 text-[10px] font-bold mt-1">Student's age is required</p>}
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
                      <option value="Online">Online (Remote)</option>
                      <option value="Onsite">Onsite (In-Person)</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                    {attempted && !form.preferredMode && <p className="text-rose-500 text-[10px] font-bold mt-1">Attendance mode is required</p>}
                  </div>
                  <div>
                    <label className={labelCls()}>How Did You Hear About Us?</label>
                    <select name="hearAboutUs" value={form.hearAboutUs} onChange={handleChange}
                      className={inputCls() + " appearance-none cursor-pointer select-premium"}>
                      <option value="">Select Option</option>
                      <option value="Social Media">Social Media</option>
                      <option value="School Announcement">School / Teacher</option>
                      <option value="Friend/Family">Friend or Family</option>
                      <option value="Flyer/Poster">Flyer or Poster</option>
                      <option value="Other">Other</option>
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
                    <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl mb-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Summer School Tuition is <strong className="text-amber-500 dark:text-amber-400">₦70,000</strong>. You can choose to pay in full or pay a <strong className="text-amber-500 dark:text-amber-400">50% installment deposit (₦35,000)</strong> to secure your slot. The remaining balance will be due by the third week of the cohort.
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
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${
                            form.paymentPlan === "full"
                              ? "bg-primary text-primary-foreground border-primary shadow-md"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          Full (₦70k)
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, paymentPlan: "installment" }))}
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${
                            form.paymentPlan === "installment"
                              ? "bg-primary text-primary-foreground border-primary shadow-md"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          Split (₦35k)
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
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${
                            form.paymentMethod === "paystack"
                              ? "bg-primary text-primary-foreground border-primary shadow-md"
                              : "bg-card text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          💳 Online
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, paymentMethod: "bank_transfer" }))}
                          className={`py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all tracking-wider cursor-pointer ${
                            form.paymentMethod === "bank_transfer"
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
                      <h5 className="text-xs font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest leading-none">Official Bank Details</h5>
                      
                      {bankAccounts.map((account, index) => (
                        <div key={index} className="space-y-1.5 p-3.5 bg-background rounded-lg border border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-black">{account.label || 'Bank Account'}</span>
                            <span className="text-xs font-black text-foreground">{account.bank_name}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm font-mono font-bold text-amber-500 select-all">{account.account_number}</span>
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
                          value={form.paymentReference}
                          onChange={handleChange}
                          className={inputCls(attempted && !form.paymentReference.trim())}
                          placeholder="e.g. Zenith Ref or Sender's Name"
                        />
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
          <div className="bg-card border border-border p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-6 shadow-2xl h-full lg:sticky lg:top-24">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl text-primary">📱</div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase text-foreground">Scan to Share or Open</h3>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                Scan this barcode to instantly open this Summer School registration form on your phone or share it with others on WhatsApp.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-inner border-4 border-primary/20">
              <QRCode id="summer-school-page-qr-svg" value={appUrl} size={150} />
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
    </div>
  );
}

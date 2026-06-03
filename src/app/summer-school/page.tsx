"use client";

import { useState, useEffect } from "react";
import { 
  Calendar, MapPin, Clock, Phone, Mail, Sparkles, 
  ShieldCheck, ArrowRight, CheckCircle, Loader2, 
  QrCode, BookOpen, Award, Terminal, Flame, Gamepad2, Laptop
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";

const TRACKS = [
  {
    id: "generative_art",
    icon: "🎨",
    week: "Track 1 · Weeks 1–2",
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
    week: "Track 2 · Weeks 1–3",
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
    week: "Track 3 · Weeks 3–5",
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
    week: "Track 4 · Weeks 4–6",
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

export default function SummerSchoolPage() {
  const [form, setForm] = useState({
    studentName: "",
    parentName: "",
    phone: "",
    email: "",
    school: "",
    currentClass: "",
    age: "",
    gender: "",
    preferredMode: "",
    hearAboutUs: "",
    trackInterest: "all", // "all" = Full AI Explorer, or individual track ids
    additionalInfo: "",
  });

  const [loading, setLoading] = useState(false);
  const [appUrl, setAppUrl] = useState("https://www.rillcod.com/summer-school");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin + "/summer-school");
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const selectedTrackLabel = form.trackInterest === "all" 
        ? "Full AI Explorer (All Tracks)" 
        : TRACKS.find(t => t.id === form.trackInterest)?.title || form.trackInterest;
      
      const fullNotes = `[Track Choice: ${selectedTrackLabel}] ${form.additionalInfo}`;

      const res = await fetch('/api/summer-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name:   form.studentName,
          parent_name:    form.parentName,
          parent_phone:   form.phone,
          parent_email:   form.email     || undefined,
          school:         form.school    || undefined,
          current_class:  form.currentClass || undefined,
          age:            form.age ? parseInt(form.age, 10) : undefined,
          gender:         form.gender    || undefined,
          preferred_mode: form.preferredMode || undefined,
          hear_about_us:  form.hearAboutUs || undefined,
          additional_info: fullNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      
      toast.success("Summer School registration successful! Our team will contact you shortly.");
      setForm({
        studentName: "", parentName: "", phone: "", email: "", school: "",
        currentClass: "", age: "", gender: "", preferredMode: "", hearAboutUs: "",
        trackInterest: "all", additionalInfo: "",
      });
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full bg-[#141618] border border-[#2a2d33] px-5 py-4 text-white text-sm font-medium focus:outline-none focus:border-amber-500 transition-all placeholder:text-[#52525b] rounded-xl";
  const labelCls = "block text-[10px] font-black text-[#71717a] uppercase tracking-widest mb-2";

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-white pt-24 pb-16 relative overflow-hidden">
      {/* Ambient backgrounds */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute top-[800px] left-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-6 py-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full text-[10px] font-black uppercase tracking-widest">
            ☀️ Active Season: Summer 2026
          </div>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-none">
            Rillcod AI <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
              Summer School
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-[#a1a1aa] max-w-2xl mx-auto leading-relaxed">
            An intensive hands-on programme teaching kids and teens (ages 8-18) to create, code, and innovate using modern Artificial Intelligence tools.
          </p>

          {/* Quick meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto pt-6">
            {[
              { label: "Start Date", val: "June 8 – 12, 2026" },
              { label: "Deadline", val: "June 12, 2026", highlight: true },
              { label: "Ending Date", val: "August 8, 2026" },
              { label: "Duration", val: "6 Weeks Cohort" },
              { label: "Audience", val: "Ages 8 – 18" }
            ].map(m => (
              <div key={m.label} className={`border p-4 rounded-xl transition-all ${m.highlight ? 'bg-rose-500/10 border-rose-500/30' : 'bg-[#141618] border-[#2a2d33]'}`}>
                <p className={`text-[9px] uppercase font-black tracking-widest ${m.highlight ? 'text-rose-400' : 'text-[#71717a]'}`}>{m.label}</p>
                <p className={`text-xs sm:text-sm font-black mt-1 ${m.highlight ? 'text-rose-400 animate-pulse' : 'text-white'}`}>{m.val}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tracks Overview */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">Four Learning Tracks</h2>
            <p className="text-xs sm:text-sm text-[#71717a] max-w-xl mx-auto">
              Our structured path guides students from AI fundamentals to launching real coding projects and visual media.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TRACKS.map(t => (
              <div key={t.id} className="bg-[#141618] border border-[#2a2d33] p-6 rounded-2xl flex flex-col justify-between hover:border-[#3a3d43] transition-all">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{t.icon}</span>
                    <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {t.week}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-white uppercase">{t.title}</h3>
                  <p className="text-xs text-[#a1a1aa] leading-relaxed">{t.desc}</p>
                  
                  <div className="space-y-2 pt-2">
                    <p className="text-[9px] font-black text-[#71717a] uppercase tracking-wider">Core Topics Covered:</p>
                    <ul className="grid grid-cols-1 gap-1.5">
                      {t.topics.map(topic => (
                        <li key={topic} className="text-xs text-[#d4d4d8] flex items-start gap-2">
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
              <p className="text-[9px] text-amber-400 uppercase font-black tracking-widest">Included Free Bonus Track</p>
              <h3 className="text-xl sm:text-2xl font-black uppercase text-white">AI Video Ads &amp; Product Creation</h3>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[#a1a1aa] leading-relaxed max-w-3xl">
            Go beyond coding. Students learn how to build digital products, produce professional commercial-quality video advertisements using AI, script with LLMs, and synthesize AI voiceovers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {[
              { label: "AI Video Editing", desc: "Producing visual media and dynamic sequences" },
              { label: "Voice Synthesis", desc: "Generating scripts and digital voice models" },
              { label: "Digital Entrepreneur", desc: "Designing landing pages and launching projects" }
            ].map(b => (
              <div key={b.label} className="bg-[#141618]/50 border border-[#2a2d33]/50 p-4 rounded-xl">
                <p className="text-xs font-black text-white">{b.label}</p>
                <p className="text-[11px] text-[#71717a] mt-1">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Schedule */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">Weekly Curriculum</h2>
            <p className="text-xs sm:text-sm text-[#71717a] max-w-xl mx-auto">
              A detailed schedule showing our student learning progression over the 6 weeks.
            </p>
          </div>

          <div className="border border-[#2a2d33] rounded-2xl overflow-hidden divide-y divide-[#2a2d33]">
            {WEEKS.map(w => (
              <div key={w.num} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-start hover:bg-[#141618]/30 transition-colors">
                <div className="space-y-1.5">
                  <span className="text-xs font-black text-amber-500 uppercase tracking-widest">{w.num}</span>
                  <div className="text-[9px] font-black text-white/50 bg-[#1c1e22] border border-[#2a2d33] w-fit px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {w.tag}
                  </div>
                </div>
                <div className="md:col-span-3 space-y-1">
                  <h4 className="text-sm font-black text-white uppercase">{w.title}</h4>
                  <p className="text-xs text-[#a1a1aa] leading-relaxed">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Outcomes */}
        <section className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-4xl font-black uppercase">Expected Outcomes</h2>
            <p className="text-xs sm:text-sm text-[#71717a] max-w-xl mx-auto">
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
              <div key={o.title} className="bg-[#141618] border border-[#2a2d33] p-5 rounded-xl text-center space-y-2">
                <span className="text-3xl block">{o.icon}</span>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">{o.title}</h4>
                <p className="text-[11px] text-[#71717a] leading-normal">{o.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Form + QR Code Grid */}
        <section id="register" className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pt-8">
          {/* Form */}
          <div className="lg:col-span-2 bg-[#141618] border border-[#2a2d33] p-6 sm:p-8 rounded-2xl space-y-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-black uppercase">Summer Registration Form</h3>
            </div>
            
            <div className="bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl flex items-center gap-2.5">
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
              <p className="text-xs font-black text-rose-400 uppercase tracking-wider">
                Registration Deadline: Friday, June 12, 2026. Secure your slot now.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Student Full Name *</label>
                  <input type="text" name="studentName" required value={form.studentName} onChange={handleChange}
                    className={inputCls} placeholder="First & Last Name" />
                </div>
                <div>
                  <label className={labelCls}>Parent / Guardian Name *</label>
                  <input type="text" name="parentName" required value={form.parentName} onChange={handleChange}
                    className={inputCls} placeholder="Parent's Name" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Parent Phone Number (WhatsApp) *</label>
                  <input type="tel" name="phone" required value={form.phone} onChange={handleChange}
                    className={inputCls} placeholder="e.g. 08116600091" />
                </div>
                <div>
                  <label className={labelCls}>Parent Email Address</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange}
                    className={inputCls} placeholder="email@example.com" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Current School (Optional)</label>
                  <input type="text" name="school" value={form.school} onChange={handleChange}
                    className={inputCls} placeholder="School name" />
                </div>
                <div>
                  <label className={labelCls}>Current Grade *</label>
                  <select name="currentClass" required value={form.currentClass} onChange={handleChange}
                    className={inputCls + " appearance-none cursor-pointer"}>
                    <option value="">Select Grade</option>
                    {["JSS1","JSS2","JSS3","SS1","SS2","SS3"].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Student Age *</label>
                  <input type="number" name="age" required min={5} max={25} value={form.age} onChange={handleChange}
                    className={inputCls} placeholder="Age" />
                </div>
                <div>
                  <label className={labelCls}>Gender *</label>
                  <select name="gender" required value={form.gender} onChange={handleChange}
                    className={inputCls + " appearance-none cursor-pointer"}>
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Attendance Mode *</label>
                  <select name="preferredMode" required value={form.preferredMode} onChange={handleChange}
                    className={inputCls + " appearance-none cursor-pointer"}>
                    <option value="">Select Mode</option>
                    <option value="Online">Online (Remote)</option>
                    <option value="Onsite">Onsite (In-Person)</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>How Did You Hear About Us?</label>
                  <select name="hearAboutUs" value={form.hearAboutUs} onChange={handleChange}
                    className={inputCls + " appearance-none cursor-pointer"}>
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
              <div>
                <label className={labelCls}>Track Options *</label>
                <select name="trackInterest" required value={form.trackInterest} onChange={handleChange}
                  className={inputCls + " appearance-none cursor-pointer border-amber-500/30 text-amber-400 font-bold bg-amber-500/5"}>
                  <option value="all">🚀 FULL AI EXPLORER (All 4 Tracks + Bonus Video) — Recommended</option>
                  <option value="generative_art">🎨 Track 1 Only: Generative Art &amp; Visual Storytelling</option>
                  <option value="ai_foundations">🧠 Track 2 Only: AI Foundations (Basic Coding &amp; Ethic)</option>
                  <option value="web_app">🌐 Track 3 Only: Web &amp; App Creation with AI</option>
                  <option value="game_design">🎮 Track 4 Only: AI Game Design</option>
                </select>
              </div>

              <div>
                <label className={labelCls}>Additional Information (Optional)</label>
                <input name="additionalInfo" value={form.additionalInfo} onChange={handleChange}
                  className={inputCls} placeholder="Any special needs or inquiries" />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-4.5 bg-amber-500 text-black font-black text-xs uppercase tracking-widest hover:bg-amber-400 transition-colors rounded-xl shadow-lg disabled:opacity-50 mt-2 h-14"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Complete Registration <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </div>

          {/* QR Code Scan Card */}
          <div className="bg-[#141618] border border-[#2a2d33] p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-6 shadow-2xl h-full lg:sticky lg:top-24">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-xl text-amber-500">📱</div>
            
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase text-white">Scan to Share or Open</h3>
              <p className="text-xs text-[#71717a] max-w-xs leading-relaxed">
                Scan this barcode to instantly open this Summer School registration form on your phone or share it with others on WhatsApp.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-inner border-4 border-amber-500/20">
              <QRCode value={appUrl} size={150} />
            </div>

            <div className="text-[10px] text-[#52525b] font-mono select-all break-all w-full px-2 py-1 bg-black/40 rounded border border-[#2a2d33]">
              {appUrl}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

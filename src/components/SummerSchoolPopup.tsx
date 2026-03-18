"use client";
import { useState } from "react";
import { X, Calendar, MapPin, Clock, Users, Star, CheckCircle, ArrowRight, Phone, Mail, GraduationCap, Zap, Heart, Sparkles, ShieldCheck, ClipboardIcon } from "lucide-react";
import { toast } from "sonner";

interface SummerSchoolPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SummerSchoolPopup({ isOpen, onClose }: SummerSchoolPopupProps) {
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
    additionalInfo: ""
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/summer-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: form.studentName,
          parent_name: form.parentName,
          parent_phone: form.phone,
          parent_email: form.email || undefined,
          school: form.school || undefined,
          current_class: form.currentClass || undefined,
          age: form.age ? parseInt(form.age, 10) : undefined,
          gender: form.gender || undefined,
          preferred_mode: form.preferredMode || undefined,
          additional_info: form.additionalInfo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      toast.success("Uplink successful! Records updated. Our coordination team will reach out via secure email.");
      setForm({
        studentName: "",
        parentName: "",
        phone: "",
        email: "",
        school: "",
        currentClass: "",
        age: "",
        gender: "",
        preferredMode: "",
        additionalInfo: ""
      });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Uplink failed. Signal lost.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputCls = "w-full bg-black/40 border border-border px-6 py-4 text-white text-sm font-medium focus:outline-none focus:border-orange-500/50 transition-all placeholder:text-white/10 uppercase tracking-widest rounded-none";
  const labelCls = "block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3 italic";

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto relative shadow-2xl shadow-orange-500/5 rounded-none border-t-8 border-t-orange-500">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-3 bg-white/5 border border-border hover:bg-white/10 text-white/40 hover:text-white transition-all z-20 group"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        {/* Content Header */}
        <div className="relative p-10 sm:p-16 border-b border-border">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none"></div>
          
          <div className="flex items-center gap-3 mb-8">
            <div className="px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-black uppercase tracking-[0.4em] italic shadow-lg">
              System Event // Summer School 2026
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Active Recruitment</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-7xl font-black text-white tracking-tighter leading-[0.9] mb-6 uppercase">
            UPGRADE YOUR <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-400">COGNITION.</span>
          </h1>
          
          <p className="max-w-xl text-slate-400 font-bold italic text-sm sm:text-base leading-relaxed uppercase tracking-tight">
            ACCELERATE YOUR TECH JOURNEY THIS SUMMER WITH OUR INTENSIVE 6-WEEK OPERATIONAL PROTOCOL. ONSITE AND SECURE REMOTE UPLINKS AVAILABLE.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-12">
            {[
              { icon: Calendar, text: "ST. JUNE 15, 2026", sub: "PHASE ONE START" },
              { icon: MapPin, text: "HYBRID UPLINK", sub: "OFFICE OR REMOTE" },
              { icon: Clock, text: "06 WEEKS", sub: "INTENSIVE MODULE" }
            ].map((item, i) => (
              <div key={i} className="p-6 bg-white/[0.02] border border-border group hover:bg-white/[0.04] transition-all">
                <item.icon className="w-5 h-5 text-orange-500 mb-4 group-hover:scale-110 transition-transform" />
                <div className="text-[10px] font-black text-white uppercase tracking-widest">{item.text}</div>
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-1">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-10 sm:p-16 space-y-16">
          {/* Modules section */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] mb-10 flex items-center gap-4">
              <div className="w-8 h-px bg-orange-500"></div>
              <span>CORE MODULE HIGHLIGHTS</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title: "JSS3 Preparation", desc: "ADVANCED LOGIC & PROGRAMMING STRUCTURES FOR EXCELLENCE." },
                { title: "Project Architecture", desc: "BUILD REAL-WORLD PROTOCOLS, GAMES, AND SYSTEMS." },
                { title: "Career Readiness", desc: "PROFESSIONAL WORKFLOWS & TECH OPPORTUNITY MAPPING." },
                { title: "Certifications", desc: "RECOGNIZED ACHIEVEMENT TOKENS UPON PROTOCOL COMPLETION." }
              ].map((mod, i) => (
                <div key={i} className="p-8 border border-border bg-black/20 hover:border-orange-500/30 transition-all flex items-start gap-4">
                  <div className="w-1.5 h-1.5 bg-orange-500 mt-1.5 shadow-lg shadow-orange-500/50"></div>
                  <div>
                    <h4 className="text-[11px] font-black text-white uppercase tracking-widest mb-2">{mod.title}</h4>
                    <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-widest">{mod.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Registration Form */}
          <div className="bg-black/20 border border-border p-10 sm:p-12">
             <div className="flex items-center gap-4 mb-12">
                <Sparkles className="w-6 h-6 text-orange-500" />
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Initialize Registration</h3>
             </div>

             <form onSubmit={handleSubmit} className="space-y-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className={labelCls}>Student Identity *</label>
                    <input type="text" name="studentName" required value={form.studentName} onChange={handleChange} className={inputCls} placeholder="FULL LEGAL NAME" />
                  </div>
                  <div>
                    <label className={labelCls}>Guardian / Parent *</label>
                    <input type="text" name="parentName" required value={form.parentName} onChange={handleChange} className={inputCls} placeholder="PRIMARY CONTACT NAME" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className={labelCls}>Secure Phone *</label>
                    <input type="tel" name="phone" required value={form.phone} onChange={handleChange} className={inputCls} placeholder="+234 CALLSIGN" />
                  </div>
                  <div>
                    <label className={labelCls}>Email Address</label>
                    <input type="email" name="email" value={form.email} onChange={handleChange} className={inputCls} placeholder="SECURE@DOMAIN.COM" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className={labelCls}>Current Sector (School)</label>
                    <input type="text" name="school" value={form.school} onChange={handleChange} className={inputCls} placeholder="INSTITUTION NAME" />
                  </div>
                  <div>
                    <label className={labelCls}>Current Grade *</label>
                    <select name="currentClass" required value={form.currentClass} onChange={handleChange} className={inputCls + " appearance-none cursor-pointer"}>
                      <option value="">SELECT GRADE</option>
                      {["JSS1","JSS2","JSS3","SS1","SS2","SS3"].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className={labelCls}>Student Age *</label>
                    <input type="number" name="age" required min={5} max={25} value={form.age} onChange={handleChange} className={inputCls} placeholder="YEARS" />
                  </div>
                  <div>
                    <label className={labelCls}>Student Gender *</label>
                    <select name="gender" required value={form.gender} onChange={handleChange} className={inputCls + " appearance-none cursor-pointer"}>
                      <option value="">SELECT GENDER</option>
                      <option value="Male">MALE</option>
                      <option value="Female">FEMALE</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <label className={labelCls}>Operation Mode *</label>
                    <select name="preferredMode" required value={form.preferredMode} onChange={handleChange} className={inputCls + " appearance-none cursor-pointer"}>
                      <option value="">SELECT MODE</option>
                      <option value="Online">SECURE REMOTE (ONLINE)</option>
                      <option value="Onsite">PHYSICAL UPLINK (ONSITE)</option>
                      <option value="Hybrid">HYBRID PROTOCOL</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Additional Parameters</label>
                    <input name="additionalInfo" value={form.additionalInfo} onChange={handleChange} className={inputCls} placeholder="OPTIONAL REQUIREMENTS" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full group relative flex items-center justify-center gap-6 py-8 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.5em] hover:bg-orange-600 transition-all shadow-2xl shadow-orange-500/20 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="flex items-center gap-4">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-border"></div>
                      EXECUTING UPLINK...
                    </div>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      INITIALIZE PROTOCOL ENROLLMENT
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                    </>
                  )}
                </button>
             </form>
          </div>

          {/* Contact Node */}
          <div className="pt-10 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-8 sm:gap-0 font-black italic">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3 text-white">
                <Phone className="w-4 h-4 text-orange-500" />
                <span className="text-[10px] uppercase tracking-widest">+234 811 660 0091</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <Mail className="w-4 h-4 text-orange-500" />
                <span className="text-[10px] uppercase tracking-widest">INFO@RILLCOD.COM</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-slate-600 uppercase tracking-widest text-[8px]">
              <ShieldCheck className="w-4 h-4" /> SECURE TRANSMISSION VERIFIED
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
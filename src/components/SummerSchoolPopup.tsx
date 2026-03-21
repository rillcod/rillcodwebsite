"use client";
import { useState } from "react";
import { X, Calendar, MapPin, Clock, Phone, Mail, Sparkles, ShieldCheck, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
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
    hearAboutUs: "",
    additionalInfo: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
          additional_info: form.additionalInfo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      toast.success("Registration successful! Our team will be in touch within 24 hours.");
      setForm({
        studentName: "", parentName: "", phone: "", email: "", school: "",
        currentClass: "", age: "", gender: "", preferredMode: "", hearAboutUs: "", additionalInfo: "",
      });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputCls = "w-full bg-background border border-border px-5 py-4 text-foreground text-sm font-medium focus:outline-none focus:border-orange-500 transition-all placeholder:text-muted-foreground/40";
  const labelCls = "block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto relative shadow-2xl border-t-8 border-t-orange-500">

        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="relative p-8 sm:p-12 border-b border-border">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none" />

          <div className="flex items-center gap-3 mb-6">
            <div className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-black uppercase tracking-widest">
              Summer School 2026
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Now Enrolling</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-foreground tracking-tighter leading-[0.9] mb-5 uppercase">
            LEVEL UP <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-400">THIS SUMMER.</span>
          </h1>

          <p className="max-w-xl text-muted-foreground font-medium text-sm sm:text-base leading-relaxed">
            An intensive 6-week programme covering coding, robotics, and AI — available online and onsite. Open to JSS1 – SS3 students.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-10">
            {[
              { icon: Calendar, text: "June 15, 2026",   sub: "JSS3 Start Date" },
              { icon: MapPin,   text: "Online & Onsite", sub: "Flexible Attendance" },
              { icon: Clock,    text: "6 Weeks",         sub: "Intensive Programme" },
            ].map((item, i) => (
              <div key={i} className="p-5 bg-muted/30 border border-border">
                <item.icon className="w-4 h-4 text-orange-500 mb-3" />
                <div className="text-[10px] font-black text-foreground uppercase tracking-widest">{item.text}</div>
                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 sm:p-12 space-y-10">
          {/* Programme Highlights */}
          <div>
            <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-5 flex items-center gap-3">
              <div className="w-6 h-px bg-orange-500" />
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
                  <div className="w-1.5 h-1.5 bg-orange-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-[11px] font-black text-foreground uppercase tracking-widest mb-1">{mod.title}</h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{mod.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Registration Form */}
          <div className="bg-muted/20 border border-border p-7 sm:p-10">
            <div className="flex items-center gap-3 mb-8">
              <Sparkles className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Register Your Child</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls}>Student Full Name *</label>
                  <input type="text" name="studentName" required value={form.studentName} onChange={handleChange}
                    className={inputCls} placeholder="Student's full name" />
                </div>
                <div>
                  <label className={labelCls}>Parent / Guardian Name *</label>
                  <input type="text" name="parentName" required value={form.parentName} onChange={handleChange}
                    className={inputCls} placeholder="Parent's full name" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls}>Parent Phone Number *</label>
                  <input type="tel" name="phone" required value={form.phone} onChange={handleChange}
                    className={inputCls} placeholder="+234..." />
                </div>
                <div>
                  <label className={labelCls}>Parent Email Address</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange}
                    className={inputCls} placeholder="parent@example.com" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls}>Student Age *</label>
                  <input type="number" name="age" required min={5} max={25} value={form.age} onChange={handleChange}
                    className={inputCls} placeholder="Age in years" />
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className={labelCls}>Preferred Attendance Mode *</label>
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

              <div>
                <label className={labelCls}>Additional Information (Optional)</label>
                <input name="additionalInfo" value={form.additionalInfo} onChange={handleChange}
                  className={inputCls} placeholder="Any special requirements, questions, or comments" />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-5 bg-orange-500 text-white font-black text-sm uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Register for Summer School <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </div>

          {/* Contact */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-foreground">
                <Phone className="w-3.5 h-3.5 text-orange-500" />
                <span className="uppercase tracking-widest">+234 811 660 0091</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="w-3.5 h-3.5 text-orange-500" />
                <span className="uppercase tracking-widest">info@rillcod.com</span>
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

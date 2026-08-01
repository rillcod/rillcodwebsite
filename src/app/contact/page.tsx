"use client";
import { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, Building2, User, Calendar, CheckCircle2, ArrowRight, Sparkles, Globe2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { brandContact } from '@/config/brand';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    school: "",
    subject: "",
    message: "",
    preferredContact: "email"
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const contactInfo = [
    {
      icon: <Phone className="w-5 h-5 text-blue-500" />,
      title: "Phone Support",
      details: [brandContact.phoneShort, "07036402679"],
      action: `tel:${brandContact.phoneShort}`,
      actionText: "Call Us Direct"
    },
    {
      icon: <Mail className="w-5 h-5 text-emerald-500" />,
      title: "Email Assistance",
      details: [brandContact.email],
      action: `mailto:${brandContact.email}`,
      actionText: "Send an Email"
    },
    {
      icon: <MapPin className="w-5 h-5 text-purple-500" />,
      title: "STEM Centre Address",
      details: [brandContact.address],
      action: "https://maps.google.com",
      actionText: "Open in Maps"
    },
    {
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      title: "Working Hours",
      details: ["Monday – Friday: 8:00 AM – 6:00 PM", "Saturday: 9:00 AM – 3:00 PM"],
      action: "/school-registration",
      actionText: "Schedule Visit"
    }
  ];

  const contactMethods = [
    {
      icon: <MessageSquare className="w-6 h-6 text-emerald-500" />,
      title: "WhatsApp Chat",
      description: "Fast responses for inquiries, student enrolment, & urgent support.",
      contact: brandContact.phoneShort,
      action: brandContact.whatsapp,
      actionText: "Chat on WhatsApp"
    },
    {
      icon: <Mail className="w-6 h-6 text-blue-500" />,
      title: "Official Email",
      description: "For formal school partnerships, documentation, & enterprise inquiries.",
      contact: brandContact.email,
      action: `mailto:${brandContact.email}`,
      actionText: "Email Support Team"
    },
    {
      icon: <Building2 className="w-6 h-6 text-purple-500" />,
      title: "Physical Consultation",
      description: "Visit our STEM Innovation Centre for live demos & administrator briefings.",
      contact: "Benin City, Nigeria",
      action: "/school-registration",
      actionText: "Book Onsite Visit"
    }
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Full name is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }
    if (!formData.subject.trim()) newErrors.subject = "Please select a topic";
    if (!formData.message.trim()) newErrors.message = "Message details are required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSubmitted(true);
    setIsLoading(false);
    
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        school: "",
        subject: "",
        message: "",
        preferredContact: "email"
      });
    }, 6000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden public-page-root transition-colors duration-300">
      {/* Dynamic Ambient Accents */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none translate-y-1/2 -translate-x-1/3" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative z-10">
        
        {/* Header / Hero */}
        <div className="text-center mb-16 sm:mb-20 bg-card border border-border p-8 sm:p-14 rounded-3xl shadow-xl border-t-4 border-t-primary relative overflow-hidden backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Direct Communication Channel
          </div>
          
          <h1 className="text-3xl sm:text-5xl font-black text-foreground mb-4 uppercase tracking-tight">
            Get in <span className="text-primary">Touch</span>
          </h1>
          
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
            Have questions about partnering your school, enrolling a student, or adopting our progressive STEM curriculum? We are here to assist you every step of the way.
          </p>
        </div>

        {/* Contact Channels Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {contactMethods.map((method, index) => (
            <div key={index} className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl sm:p-8 hover:border-primary/50 transition-all duration-300 shadow-md hover:shadow-xl flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  {method.icon}
                </div>
                <h3 className="text-lg font-black text-foreground mb-2 uppercase tracking-tight">{method.title}</h3>
                <p className="text-xs text-muted-foreground font-medium mb-4 leading-relaxed">{method.description}</p>
                <p className="text-xs font-bold text-foreground mb-6 font-mono">{method.contact}</p>
              </div>
              <Link
                href={method.action}
                className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl bg-muted hover:bg-primary hover:text-white border border-border text-foreground text-[11px] font-black uppercase tracking-wider transition-all duration-200"
              >
                {method.actionText} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>

        {/* Main Grid: Form + Info */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Contact Form */}
          <div className="lg:col-span-7 bg-card border border-border rounded-3xl p-6 sm:p-10 shadow-xl border-l-4 border-l-primary relative">
            <div className="mb-8">
              <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">Send Us a Message</h2>
              <p className="text-xs text-muted-foreground mt-1">Fill out the form below and our team will get back to you within 24 hours.</p>
            </div>

            {isSubmitted ? (
              <div className="text-center py-16 bg-muted/30 border border-emerald-500/30 p-8 rounded-2xl animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-black text-foreground mb-2 uppercase tracking-tight">Message Received!</h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-8 leading-relaxed max-w-md mx-auto">
                  Thank you for contacting Rillcod Technologies. One of our education advisors has received your request and will reach out shortly.
                </p>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="px-8 py-3.5 bg-primary text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                >
                  Send Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">Full Name *</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <input
                        type="text" name="name" value={formData.name} onChange={handleChange} required
                        placeholder="John Doe"
                        className="w-full bg-background border border-border pl-11 pr-4 py-3.5 rounded-xl text-foreground font-medium text-xs focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                    {errors.name && <p className="text-rose-500 text-[10px] font-bold mt-1">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">Email Address *</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <input
                        type="email" name="email" value={formData.email} onChange={handleChange} required
                        placeholder="you@example.com"
                        className="w-full bg-background border border-border pl-11 pr-4 py-3.5 rounded-xl text-foreground font-medium text-xs focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                    {errors.email && <p className="text-rose-500 text-[10px] font-bold mt-1">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">Phone Number (Optional)</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <input
                        type="tel" name="phone" value={formData.phone} onChange={handleChange}
                        placeholder="+234 800 000 0000"
                        className="w-full bg-background border border-border pl-11 pr-4 py-3.5 rounded-xl text-foreground font-medium text-xs focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">School / Organization (Optional)</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <input
                        type="text" name="school" value={formData.school} onChange={handleChange}
                        placeholder="e.g. St. Jude Academy"
                        className="w-full bg-background border border-border pl-11 pr-4 py-3.5 rounded-xl text-foreground font-medium text-xs focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">Inquiry Type *</label>
                  <select
                    name="subject" value={formData.subject} onChange={handleChange} required
                    className="w-full bg-background border border-border px-4 py-3.5 rounded-xl text-foreground font-medium text-xs focus:outline-none focus:border-primary transition-all"
                  >
                    <option value="">Select Inquiry Topic</option>
                    <option value="School Partnership">School STEM Partnership Inquiry</option>
                    <option value="Student Enrollment">Student Enrolment Assistance</option>
                    <option value="Curriculum Inquiries">Curriculum & Learning Paths</option>
                    <option value="Demo Request">Request Onsite or Virtual Demo</option>
                    <option value="General Inquiry">General Inquiries & Support</option>
                  </select>
                  {errors.subject && <p className="text-rose-500 text-[10px] font-bold mt-1">{errors.subject}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-muted-foreground uppercase tracking-wider">Message Details *</label>
                  <div className="relative">
                    <MessageSquare className="absolute left-4 top-4 w-4 h-4 text-muted-foreground/60" />
                    <textarea
                      name="message" value={formData.message} onChange={handleChange} required rows={5}
                      placeholder="Please let us know how we can assist you..."
                      className="w-full bg-background border border-border pl-11 pr-4 py-3.5 rounded-xl text-foreground font-medium text-xs focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 resize-none"
                    ></textarea>
                  </div>
                  {errors.message && <p className="text-rose-500 text-[10px] font-bold mt-1">{errors.message}</p>}
                </div>

                <button
                  type="submit" disabled={isLoading}
                  className="w-full py-4 bg-primary text-white font-black text-xs uppercase tracking-[0.25em] rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isLoading ? 'Submitting Message...' : (
                    <>
                      <Send className="w-4 h-4" /> Send Message
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Sidebar Info & Quick Links */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-xl">
              <h3 className="text-lg font-black text-foreground mb-6 uppercase tracking-tight flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-primary" /> Key Access Points
              </h3>
              <div className="space-y-4">
                {contactInfo.map((info, index) => (
                  <div key={index} className="p-4 rounded-2xl bg-muted/40 border border-border/80 flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-card border border-border shrink-0">
                      {info.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-foreground uppercase tracking-wider">{info.title}</p>
                      {info.details.map((detail, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground font-medium mt-0.5">{detail}</p>
                      ))}
                      <Link href={info.action} className="inline-flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-widest mt-2 hover:underline">
                        {info.actionText} →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Shortcuts Card */}
            <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/30 p-6 sm:p-8 rounded-3xl shadow-xl">
              <h3 className="text-base font-black text-foreground mb-2 uppercase tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Quick Action Links
              </h3>
              <p className="text-xs text-muted-foreground mb-6 font-medium">Looking for immediate portal access or school partnership onboarding?</p>
              
              <div className="space-y-3">
                {[
                  { label: "Partner Your School", href: "/school-registration", desc: "For principals & school administrators" },
                  { label: "Enrol a Student", href: "/student-registration", desc: "Term & online learner registration" },
                  { label: "View Curriculum Catalogue", href: "/curriculum", desc: "Explore our 12-year STEM framework" }
                ].map((action, i) => (
                  <Link
                    key={i} href={action.href}
                    className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all group"
                  >
                    <div>
                      <p className="text-xs font-black text-foreground uppercase tracking-wide">{action.label}</p>
                      <p className="text-[10px] text-muted-foreground">{action.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-1 transition-transform shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
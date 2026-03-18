"use client";
import { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, Building, User, Calendar, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

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
      icon: <Phone className="w-6 h-6" />,
      title: "Phone Numbers",
      details: ["08116600091", "07036402679"],
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      action: "tel:08116600091",
      actionText: "Call Now"
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: "Email Addresses",
      details: ["info@rillcod.tech", "rillcod@gmail.com"],
      color: "text-green-600",
      bgColor: "bg-green-50",
      action: "mailto:info@rillcod.tech",
      actionText: "Send Email"
    },
    {
      icon: <MapPin className="w-6 h-6" />,
      title: "Office Address",
      details: ["No. 26 Ogiesoba Avenue", "Off Airport Road, Benin City", "Edo State, Nigeria"],
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      action: "https://maps.google.com",
      actionText: "View on Map"
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Business Hours",
      details: ["Monday–Friday: 8:00 AM–6:00 PM", "Saturday: 9:00 AM–3:00 PM"],
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      action: "/school-registration",
      actionText: "Schedule Visit"
    }
  ];

  const contactMethods = [
    {
      icon: <MessageSquare className="w-8 h-8" />,
      title: "WhatsApp",
      description: "Quick questions and instant support",
      contact: "08116600091",
      color: "from-green-500 to-green-600",
      action: "https://wa.me/2348116600091"
    },
    {
      icon: <Mail className="w-8 h-8" />,
      title: "Email",
      description: "Detailed inquiries and documentation",
      contact: "info@rillcod.tech",
      color: "from-blue-500 to-blue-600",
      action: "mailto:info@rillcod.tech"
    },
    {
      icon: <Building className="w-8 h-8" />,
      title: "Office Visit",
      description: "In-person consultation and demo",
      contact: "Benin City",
      color: "from-purple-500 to-purple-600",
      action: "/school-registration"
    }
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }
    if (!formData.subject.trim()) newErrors.subject = "Subject is required";
    if (!formData.message.trim()) newErrors.message = "Message is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsSubmitted(true);
    setIsLoading(false);
    
    // Reset form after 5 seconds
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
    }, 5000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-none pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-none pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative z-10">
        {/* Hero Section */}
        <div className="text-center mb-24 bg-[#1a1a1a] border border-white/10 p-16 rounded-none shadow-2xl border-t-8 border-t-orange-500 relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none"></div>
          <h1 className="text-4xl md:text-6xl font-black text-white mb-8 uppercase tracking-tight italic">
            Get in <span className="text-orange-500">Touch.</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto font-medium italic border-l-2 border-orange-500 pl-8 inline-block text-left mb-0">
            Ready to transform your school with cutting-edge technology education? 
            We're here to help you get started on this exciting journey at Rillcod Technologies.
          </p>
          <div className="w-24 h-1 bg-orange-500 mx-auto mt-12"></div>
        </div>

        {/* Contact Methods */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          {contactMethods.map((method, index) => (
            <div key={index} className="bg-[#1a1a1a] border border-white/10 rounded-none p-10 hover:border-orange-500 transition-all group">
              <div className={`w-16 h-16 bg-white/5 border border-white/5 group-hover:border-orange-500 rounded-none flex items-center justify-center text-orange-500 mb-8 transition-all`}>
                {method.icon}
              </div>
              <h3 className="text-xl font-black text-white mb-3 uppercase italic tracking-tighter">{method.title}</h3>
              <p className="text-xs text-slate-500 font-bold italic mb-6 leading-relaxed">{method.description}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">{method.contact}</p>
              <Link
                href={method.action}
                className={`flex items-center justify-center w-full px-8 py-4 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-none hover:bg-orange-500 hover:border-orange-500 transition-all`}
              >
                Establish Uplink
              </Link>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Contact Form */}
          <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-12 shadow-2xl relative border-l-8 border-l-orange-500">
            <h2 className="text-2xl font-black text-white mb-10 uppercase italic tracking-tight">Transmission Portal</h2>
            
            {isSubmitted ? (
              <div className="text-center py-20 bg-[#121212] border border-white/5 border-l-4 border-l-emerald-500 p-8 rounded-none">
                <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-none flex items-center justify-center mx-auto mb-8">
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-black text-white mb-4 uppercase italic">Data Transmitted.</h3>
                <p className="text-sm text-slate-400 font-medium italic mb-10">We've received your data. Protocol response within 24 hours.</p>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="px-12 py-5 bg-white text-black font-black text-[10px] uppercase tracking-widest rounded-none hover:bg-slate-200 transition-all"
                >
                  Send New Transmission
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 italic">Identity Name</label>
                    <div className="relative group">
                       <User className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors" />
                       <input
                          type="text" name="name" value={formData.name} onChange={handleChange} required
                          placeholder="Your identity"
                          className="w-full bg-[#121212] border border-white/10 pl-14 pr-6 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900"
                       />
                    </div>
                    {errors.name && <p className="text-orange-500 text-[9px] font-black uppercase tracking-widest mt-2">{errors.name}</p>}
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 italic">Return Address</label>
                    <div className="relative group">
                       <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors" />
                       <input
                          type="email" name="email" value={formData.email} onChange={handleChange} required
                          placeholder="uplink@domain.com"
                          className="w-full bg-[#121212] border border-white/10 pl-14 pr-6 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900"
                       />
                    </div>
                    {errors.email && <p className="text-orange-500 text-[9px] font-black uppercase tracking-widest mt-2">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 italic">Uplink Code (Phone)</label>
                    <div className="relative group">
                       <Phone className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors" />
                       <input
                          type="tel" name="phone" value={formData.phone} onChange={handleChange}
                          placeholder="+234 XXX XXX XXXX"
                          className="w-full bg-[#121212] border border-white/10 pl-14 pr-6 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900"
                       />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 italic">Entity Name (School)</label>
                    <div className="relative group">
                       <Building className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors" />
                       <input
                          type="text" name="school" value={formData.school} onChange={handleChange}
                          placeholder="Institutional Name"
                          className="w-full bg-[#121212] border border-white/10 pl-14 pr-6 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900"
                       />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 italic">Subject Vector</label>
                  <select
                    name="subject" value={formData.subject} onChange={handleChange} required
                    className="w-full bg-[#121212] border border-white/10 px-6 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all"
                  >
                    <option value="" className="bg-[#121212]">SELECT CATEGORY</option>
                    <option value="School Partnership" className="bg-[#121212]">PARTNERSHIP INQUIRY</option>
                    <option value="Student Enrollment" className="bg-[#121212]">ENROLLMENT PROTOCOL</option>
                    <option value="Curriculum Information" className="bg-[#121212]">CURRICULUM DATA</option>
                    <option value="Demo Request" className="bg-[#121212]">DEMO REQUEST</option>
                    <option value="General Inquiry" className="bg-[#121212]">GENERAL TRANSMISSION</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 italic">Payload Message</label>
                  <div className="relative group">
                    <MessageSquare className="absolute left-6 top-6 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors" />
                    <textarea
                      name="message" value={formData.message} onChange={handleChange} required rows={5}
                      placeholder="Enter detailed payload..."
                      className="w-full bg-[#121212] border border-white/10 pl-14 pr-6 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900 resize-none"
                    ></textarea>
                  </div>
                </div>

                <button
                  type="submit" disabled={isLoading}
                  className="w-full py-6 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.5em] rounded-none hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-4"
                >
                  {isLoading ? 'Processing...' : (
                    <>
                      <Send className="w-4 h-4" /> Initiating Transfer
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Contact Information */}
          <div className="space-y-12">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-none p-12 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] pointer-events-none" />
              <h2 className="text-xl font-black text-white mb-10 uppercase italic tracking-tight">Access Points</h2>
              <div className="space-y-8">
                {contactInfo.map((info, index) => (
                  <div key={index} className="bg-[#121212] border border-white/5 rounded-none p-8 hover:border-orange-500/30 transition-all group">
                    <div className="flex items-start gap-6">
                      <div className="w-12 h-12 bg-white/5 border border-white/5 group-hover:border-orange-500 rounded-none flex items-center justify-center text-orange-500 transition-all">
                        {info.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xs font-black text-white mb-3 uppercase tracking-widest">{info.title}</h3>
                        <div className="space-y-2">
                          {info.details.map((detail, idx) => (
                            <p key={idx} className="text-xs text-slate-500 font-bold italic">{detail}</p>
                          ))}
                        </div>
                        <Link
                          href={info.action}
                          className="inline-flex items-center gap-2 mt-6 text-[9px] font-black text-orange-500 uppercase tracking-widest hover:text-white transition-colors"
                        >
                          {info.actionText} →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-[#1a1a1a] border border-white/10 border-t-8 border-t-orange-500 p-12 text-white shadow-2xl">
              <h3 className="text-lg font-black mb-8 uppercase italic tracking-widest">Protocol Shortcuts</h3>
              <div className="space-y-4">
                {[
                  { label: "REGISTER SCHOOL", href: "/school-registration", icon: Building },
                  { label: "ENROLL STUDENT", href: "/student-registration", icon: User },
                  { label: "VIEW SYLLABUS", href: "/curriculum", icon: Calendar }
                ].map((action, i) => (
                  <Link
                    key={i} href={action.href}
                    className="flex items-center justify-between p-6 bg-[#121212] border border-white/5 hover:border-orange-500/50 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <action.icon className="w-4 h-4 text-orange-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{action.label}</span>
                    </div>
                    <span className="text-orange-500 group-hover:translate-x-2 transition-transform">→</span>
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
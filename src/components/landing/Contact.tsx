"use client";

import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, MessageSquare, ShieldCheck, HelpCircle, Command, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { contactInfo } from '@/config/brand';

const contactCards = [
  { icon: Mail, title: 'Network Hub', value: contactInfo.email, sub: 'Inquiry Matrix', accent: 'text-orange-500', bg: 'bg-orange-500/10' },
  { icon: Phone, title: 'Direct Uplink', value: contactInfo.phone, sub: 'Voice Protocol', accent: 'text-blue-500', bg: 'bg-blue-500/10' },
  { icon: MapPin, title: 'Physical Node', value: 'Lagos, Nigeria', sub: 'Geospatial Data', accent: 'text-emerald-500', bg: 'bg-emerald-500/10' },
];

const Contact: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [sending, setSending] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const response = await fetch('https://formspree.io/f/mqakeevn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        toast.success('UPLINK INITIALIZED: Our coordination team will reach out shortly.');
        setFormData({ name: '', email: '', message: '' });
      } else {
        throw new Error();
      }
    } catch {
      toast.error('Transmission Failed. Please check your matrix signal.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section id="contact" className="py-24 bg-[#121212] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-none" />

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-20 relative z-10">

        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-16 gap-10">
          <div>
              <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-none">
                 <Sparkles className="w-4 h-4 text-orange-500" />
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Connect Matrix</span>
              </div>
              <h3 className="text-3xl sm:text-6xl font-black text-white leading-[1.05] tracking-tight uppercase">
                Stay in the <br />
                <span className="text-white/40 italic">Loop.</span>
              </h3>
          </div>
          <p className="text-slate-400 text-sm sm:text-lg font-medium leading-relaxed max-w-sm italic border-l-2 border-orange-500 pl-6">
            Whether you're a school owner or a curious parent, our team is ready to help you deploy Rillcod in your institution.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-10 items-start">
          
          {/* Info Side (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            {contactCards.map((c, i) => (
              <div key={i} className="group flex items-center gap-5 bg-white/[0.02] border border-border rounded-none p-6 hover:bg-white/[0.04] transition-all border-l-2 border-l-transparent hover:border-l-orange-500">
                 <div className={`w-12 h-12 ${c.bg} ${c.accent} rounded-none flex items-center justify-center shrink-0 text-white`}>
                    <c.icon className="w-6 h-6" />
                 </div>
                 <div>
                    <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{c.title}</h4>
                    <p className="text-sm font-black text-white tracking-tight">{c.value}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{c.sub}</p>
                 </div>
              </div>
            ))}

            {/* Protocol Notice */}
            <div className="mt-8 p-8 bg-orange-500/5 border border-border rounded-none relative overflow-hidden group border-t-2 border-t-orange-500 shadow-2xl">
               <HelpCircle className="absolute -top-6 -right-6 w-32 h-32 text-orange-500/5 rotate-12" />
               <h5 className="text-white font-black uppercase text-[10px] tracking-widest mb-4 flex items-center gap-3">
                 <ShieldCheck className="w-4 h-4 text-orange-500" /> Secure Protocol
               </h5>
               <p className="text-sm text-slate-400 leading-relaxed font-bold italic">
                 All school inquiries are processed within 12 standard business hours by our coordination team.
               </p>
            </div>
          </div>

          {/* Form Side (8 Cols) */}
          <div className="lg:col-span-8">
             <div className="bg-[#1a1a1a] border border-border rounded-none p-8 md:p-16 shadow-2xl relative overflow-hidden border-t-4 border-t-orange-500">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-none blur-[100px] pointer-events-none" />
                
                <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                   <div className="grid md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Entity Name</label>
                        <input
                          type="text" name="name" value={formData.name} onChange={handleChange} required
                          placeholder="Full Name / School Name"
                          className="w-full bg-[#121212] border border-border px-6 py-5 rounded-none text-white font-bold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-700"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Secure Email</label>
                        <input
                          type="email" name="email" value={formData.email} onChange={handleChange} required
                          placeholder="Contact Email Address"
                          className="w-full bg-[#121212] border border-border px-6 py-5 rounded-none text-white font-bold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-700"
                        />
                      </div>
                   </div>

                   <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Message Content</label>
                      <textarea
                        name="message" value={formData.message} onChange={handleChange} required rows={5}
                        placeholder="Detail your request or partnership proposal..."
                        className="w-full bg-[#121212] border border-border px-6 py-5 rounded-none text-white font-bold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-700 resize-none italic"
                      />
                   </div>

                   <button
                     type="submit" disabled={sending}
                     className="group flex items-center justify-center gap-4 w-full md:w-auto px-12 py-6 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 hover:scale-[1.02] active:scale-95"
                   >
                     {sending ? 'Processing...' : 'Initialize Uplink'}
                     <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                   </button>
                </form>
             </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default Contact;
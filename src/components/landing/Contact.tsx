"use client";

import React, { useState } from 'react';
import { Mail, Phone, MapPin, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const contactCards = [
  {
    icon: Phone,
    title: 'Phone',
    lines: ['+234 811 660 0091', '+234 703 640 2679'],
    accent: 'bg-[#FF914D]',
  },
  {
    icon: Mail,
    title: 'Email',
    lines: ['info@rillcod.tech', 'rillcod@gmail.com'],
    accent: 'bg-blue-600',
  },
  {
    icon: MapPin,
    title: 'Address',
    lines: ['No 26 Ogiesoba Avenue', 'Off Airport Road, Benin City'],
    accent: 'bg-black',
  },
];

const Contact: React.FC = () => {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const response = await fetch('https://formspree.io/f/rillcod@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        toast.success('Message sent!');
        setFormData({ name: '', email: '', message: '' });
      } else {
        throw new Error();
      }
    } catch {
      toast.error('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <section id="contact" className="py-24 bg-[#0a0a0f] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 bg-orange-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16 gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF914D]/10 border border-[#FF914D]/20 text-[#FF914D] text-[10px] font-black uppercase tracking-widest mb-4">
              <Mail className="w-3 h-3" />
              Contact
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight">
              Get In Touch
            </h2>
          </div>
          <p className="text-white/50 max-w-sm text-sm leading-relaxed">
            Have questions about our programs? Reach out and we&apos;ll get back to you within one business day.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Cards */}
          <div className="flex flex-col gap-6">
            {contactCards.map(({ icon: Icon, title, lines, accent }) => (
              <div
                key={title}
                className="group flex items-center gap-8 bg-white/[0.03] backdrop-blur-md border border-white/10 p-8 rounded-[2rem] hover:bg-white/[0.06] hover:border-[#FF914D]/30 transition-all duration-300 shadow-2xl"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${accent} bg-opacity-20 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-7 h-7 ${accent.includes('bg-black') ? 'text-white/40' : accent.replace('bg-', 'text-')}`} />
                </div>
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF914D] mb-2">{title}</h3>
                  {lines.map((line) => (
                    <p key={line} className="text-white text-lg font-bold tracking-tight">{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Contact Form */}
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-10 md:p-14 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity">
              <Mail className="w-32 h-32 text-white" />
            </div>

            <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-10 relative z-10">Send a Message</h3>
            <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
              <div className="grid sm:grid-cols-2 gap-8">
                <div>
                  <label htmlFor="name" className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 ml-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Your name"
                    className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D] focus:bg-white/10 transition-all text-sm font-bold shadow-inner"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 ml-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="your@email.com"
                    className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D] focus:bg-white/10 transition-all text-sm font-bold shadow-inner"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 ml-1">
                  Your Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={5}
                  required
                  placeholder="How can we help your school?"
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D] focus:bg-white/10 transition-all text-sm font-bold resize-none shadow-inner"
                />
              </div>
              <button
                type="submit"
                disabled={sending}
                className="w-full flex items-center justify-center gap-4 px-10 py-6 bg-gradient-to-r from-[#FF914D] to-orange-600 text-white font-black text-sm rounded-2xl shadow-2xl shadow-orange-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50"
              >
                {sending ? 'Processing...' : 'Send Message'}
                {!sending && <ArrowRight className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
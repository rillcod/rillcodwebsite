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
    <section id="contact" className="py-24 bg-[#0a0a0f] border-t-4 border-[#FF914D]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16 gap-4">
          <div>
            <span className="inline-block text-xs font-black uppercase tracking-widest text-[#FF914D] border-2 border-[#FF914D] px-3 py-1 mb-3">
              Contact
            </span>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
              Get In Touch
            </h2>
          </div>
          <p className="text-white/50 max-w-xs text-sm leading-relaxed">
            Have questions about our programs? Reach out and we'll get back to you within one business day.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10">
          {/* Contact Cards */}
          <div className="flex flex-col gap-4">
            {contactCards.map(({ icon: Icon, title, lines, accent }) => (
              <div
                key={title}
                className="flex items-start gap-5 border-2 border-white/10 p-6 hover:border-[#FF914D]/50 transition-colors"
              >
                <div className={`w-10 h-10 flex items-center justify-center flex-shrink-0 ${accent}`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-[#FF914D] mb-1">{title}</h3>
                  {lines.map((line) => (
                    <p key={line} className="text-white/70 text-sm">{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Contact Form */}
          <div className="border-2 border-white/10 shadow-[6px_6px_0_0_rgba(255,145,77,0.4)] p-8">
            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-6">Send a Message</h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-xs font-black uppercase tracking-widest text-white/50 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Your name"
                    className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D] text-sm font-bold transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs font-black uppercase tracking-widest text-white/50 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D] text-sm font-bold transition-colors"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="block text-xs font-black uppercase tracking-widest text-white/50 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={5}
                  required
                  placeholder="How can we help you?"
                  className="w-full px-4 py-3 bg-white/5 border-2 border-white/20 text-white placeholder-white/20 focus:outline-none focus:border-[#FF914D] text-sm font-bold transition-colors resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={sending}
                className="flex items-center gap-2 px-7 py-4 bg-[#FF914D] text-black font-black text-sm border-2 border-[#FF914D] shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] hover:shadow-[5px_5px_0_0_rgba(255,255,255,0.3)] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all uppercase tracking-wide disabled:opacity-60"
              >
                {sending ? 'Sending...' : 'Send Message'}
                {!sending && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
"use client";

import React, { useState } from "react";
import {
  XMarkIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
} from "@/lib/icons";
import type { SchoolRow, IssuedDocumentRow } from "./types";

interface Props {
  school: SchoolRow;
  latestDoc?: IssuedDocumentRow | null;
  isOpen: boolean;
  onClose: () => void;
}

type Angle = "cold_pitch" | "free_demo" | "check_in" | "resumption_slot";

const ANGLES: { id: Angle; label: string; icon: string; desc: string }[] = [
  {
    id: "cold_pitch",
    label: "Cold Executive Pitch",
    icon: "🌟",
    desc: "Introduce Rillcod's 12-Year STEM Department, ₦0 CapEx guarantee & 30% revenue share.",
  },
  {
    id: "free_demo",
    label: "30-Min Free Demo Invite",
    icon: "🤖",
    desc: "Invite learners & school management to a live hands-on robotics trial on their campus.",
  },
  {
    id: "check_in",
    label: "48-Hour Proposal Check-In",
    icon: "💬",
    desc: "Polite follow-up on recently prepared proposal with direct online review link.",
  },
  {
    id: "resumption_slot",
    label: "Resumption Slot Reservation",
    icon: "📅",
    desc: "Urge agreement sign-off to lock in dedicated facilitator & hardware shipment.",
  },
];

export function PartnershipOutreachModal({ school, latestDoc, isOpen, onClose }: Props) {
  const [angle, setAngle] = useState<Angle>("cold_pitch");
  const [recipientEmail, setRecipientEmail] = useState(school.email || "");
  const [contactPerson, setContactPerson] = useState(school.contact_person || "");
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const cleanSlug = latestDoc?.reference || latestDoc?.share_token;
  const shareUrl = cleanSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${cleanSlug}`
    : "";

  const greeting = contactPerson ? `Dear ${contactPerson},` : `Dear ${school.name} Leadership,`;

  let subject = `Artificial Intelligence & Robotics Partnership for ${school.name}`;
  let bodySummary = "";

  if (angle === "cold_pitch") {
    subject = `Equipping ${school.name} with an Elite Artificial Intelligence & Robotics Department (Zero CapEx)`;
    bodySummary = `${greeting}\n\nIn today's fast-evolving world, traditional computer studies (typing in Word and memorizing PC parts) no longer prepares learners for global leadership — nor does it give parents a reason to choose your school.\n\nAt Rillcod Technologies, we partner with visionary schools to run an accredited 12-Year Artificial Intelligence, Robotics & Software Engineering Department directly on your timetable.\n\nKey Institutional Highlights:\n• 🧠 Practical AI & ML: From Basic 1 interactive AI models to SS3 neural networks, Python AI algorithms, and prompt engineering.\n• 🤖 Physical Robotics & IoT: Hands-on micro:bit and Arduino circuits, sensors, and autonomous rovers every term.\n• ₦0 Equipment CapEx: All robotics kits, electronic boards, laptops, and devices provided by Rillcod.\n• 👨‍🏫 Certified Facilitators: 100% delivered by our certified instructors — zero burden on your existing staff.\n• 📱 Parent Progress Cards: Scan-to-Watch QR codes on termly report cards showing each child demonstrating working code.\n• 💰 Guaranteed Revenue Share: 30% profit-sharing settled directly to your school account each term.\n\nWe would love to bring a live robotics kit and interactive AI demo to ${school.name} for a brief 20-minute discussion or a complimentary hands-on trial.\n\nWarm regards,\nThe Rillcod Technologies Team`;
  } else if (angle === "free_demo") {
    subject = `Complimentary Live AI & Robotics Classroom Trial for ${school.name}`;
    bodySummary = `${greeting}\n\nWe would love to visit ${school.name} this week to deliver a complimentary 30-minute interactive Artificial Intelligence & Robotics trial for your learners.\n\nWhat students will experience:\n• Train on-screen AI computer vision models using camera gestures.\n• Assemble and code physical micro-controller circuits with LED sensors & motors.\n• Write and execute real logic commands that control hardware in real time.\n\nThere is zero cost or obligation. It gives your leadership and learners a firsthand view of modern applied technology education.\n\nWarm regards,\nThe Rillcod Technologies Team`;
  } else if (angle === "resumption_slot") {
    subject = `Securing Dedicated AI Facilitator & Robotics Kit Allocation for ${school.name}`;
    bodySummary = `${greeting}\n\nAs we finalize our certified AI instructor rosters and robotics hardware allocations for the upcoming academic term, we want to ensure ${school.name} has reserved its preferred weekly timetable slot.\n\nExecuting your Memorandum of Understanding reserves your dedicated facilitator and secures physical robotics inventory so teaching commences smoothly upon school resumption.\n\n${shareUrl ? `Review & digitally sign agreement online: ${shareUrl}\n\n` : ""}Warm regards,\nThe Rillcod Technologies Team`;
  } else {
    subject = `Following up: AI, Coding & Robotics Partnership Proposal for ${school.name}${latestDoc?.reference ? ` (${latestDoc.reference})` : ""}`;
    bodySummary = `${greeting}\n\nI am following up on the Artificial Intelligence, Coding & Robotics Education Proposal we recently prepared for ${school.name}.\n\n${shareUrl ? `Review proposal online: ${shareUrl}\n\n` : ""}I wanted to see if your leadership team had any questions regarding the 12-Year AI syllabus, the ₦0 equipment guarantee, or our 30% termly revenue-share model.\n\nWould you be available for a brief 10-minute call or an in-person visit so we can demonstrate the physical robotics and AI kits?\n\nWarm regards,\nThe Rillcod Technologies Team`;
  }

  async function handleSendEmail() {
    if (!recipientEmail || !recipientEmail.includes("@")) {
      setError("Please enter a valid recipient email address.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/partnerships/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: school.id,
          to: recipientEmail.trim(),
          angle,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to dispatch email.");
      }

      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
      }, 4000);
    } catch (err: any) {
      setError(err.message || "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  function handleCopyEmail() {
    const fullText = `Subject: ${subject}\n\n${bodySummary}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleOpenWhatsApp() {
    const phone = (school.phone || "").replace(/[^0-9]/g, "");
    const target = phone.length >= 10 ? (phone.startsWith("0") ? "234" + phone.slice(1) : phone) : "";
    const msg = `Hello ${contactPerson || school.name} Leadership,\n\n${bodySummary}`;
    const url = target ? `https://wa.me/${target}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card border border-border rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <SparklesIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground">
                School Outreach &amp; Conversion Engine
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Refined cold pitches, follow-ups, and demo invitations for <strong className="text-foreground">{school.name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Angle Selection Grid */}
          <div>
            <label className="text-xs font-bold text-foreground block mb-2">
              Select Outreach Strategy &amp; Marketing Angle
            </label>
            <div className="grid sm:grid-cols-2 gap-2">
              {ANGLES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAngle(a.id)}
                  className={`text-left p-3 rounded-2xl border transition-all ${
                    angle === a.id
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-sm"
                      : "bg-muted/30 border-border/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-foreground mb-0.5">
                    <span>{a.icon}</span>
                    <span>{a.label}</span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground leading-snug line-clamp-2">
                    {a.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Contact Fields */}
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                Recipient Email Address
              </label>
              <input
                type="email"
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500"
                placeholder="e.g. principal@school.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                Contact Person / Proprietor Name
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500"
                placeholder="e.g. Dr. Johnson (Proprietor)"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="rounded-2xl bg-muted/40 border border-border p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">
                Email Subject Preview
              </span>
              <span className="text-[10px] font-bold text-emerald-400">SendPulse Branded HTML</span>
            </div>
            <p className="text-xs font-bold text-foreground">{subject}</p>
            <div className="bg-card/70 border border-border/60 rounded-xl p-3 text-[11.5px] text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {bodySummary}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {sentSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 shrink-0" />
              <span>Outreach email successfully sent to {recipientEmail}!</span>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-6 py-4 border-t border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyEmail}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold border border-border transition-colors"
            >
              <ClipboardDocumentCheckIcon className="w-4 h-4 text-emerald-400" />
              <span>{copied ? "Copied to Clipboard!" : "Copy Email Body"}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition-colors"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4 text-emerald-400" />
              <span>Open in WhatsApp</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={handleSendEmail}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black shadow-md transition-all"
            >
              <PaperAirplaneIcon className="w-3.5 h-3.5" />
              <span>{sending ? "Dispatching..." : "Send via SendPulse Email"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

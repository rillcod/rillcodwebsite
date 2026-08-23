"use client";

import React, { useState } from "react";
import {
  XMarkIcon,
  PaperAirplaneIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
} from "@/lib/icons";
import {
  OUTREACH_ANGLES,
  outreachPlainText,
  type OutreachAngle,
} from "@/lib/partnerships/outreach-copy";
import { publicDocumentSharePath } from "@/lib/partnerships/signing";
import type { SchoolRow, IssuedDocumentRow } from "./types";

interface Props {
  school: SchoolRow;
  latestDoc?: IssuedDocumentRow | null;
  isOpen: boolean;
  onClose: () => void;
}

type Angle = OutreachAngle;

// The angles, their words and their descriptions all come from one file, which
// the outbound email renders from too. What you read here is what the school
// receives — this modal used to hold its own second copy of the pitch.
const ANGLES = OUTREACH_ANGLES;

export function PartnershipOutreachModal({ school, latestDoc, isOpen, onClose }: Props) {
  const [angle, setAngle] = useState<Angle>("cold_pitch");
  const [recipientEmail, setRecipientEmail] = useState(school.email || "");
  const [contactPerson, setContactPerson] = useState(school.contact_person || "");
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  /*
    The link is built from the share token alone.

    It read `reference || share_token`, and a reference is always present — so
    every message this modal produced carried /p/RC-PROP-2026-00042, which the
    public route refuses by design: a reference is sequential and printed on the
    face of the document, so honouring it would let one school's copy unlock
    every other school's fees. Prospects were being sent a dead link.

    Relative on purpose. This is a client component that also renders on the
    server, and reading window.location during render is a hydration mismatch;
    the absolute URL is composed once, below, only for the copy that leaves.
  */
  const sharePath = publicDocumentSharePath(latestDoc?.share_token ?? null, latestDoc?.status);
  const shareUrl =
    sharePath && typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : "";

  const { subject, body: bodySummary } = outreachPlainText(angle, {
    schoolName: school.name,
    contactName: contactPerson,
    reference: latestDoc?.reference ?? null,
    shareUrl: shareUrl || null,
  });

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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-black shadow-md transition-all"
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

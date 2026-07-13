"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, ArrowRight } from "lucide-react";
import { contactInfo } from "@/config/brand";
import { useFeaturedSpecialProgram } from "@/hooks/useFeaturedSpecialProgram";

const HIDE_ON = [
  "/dashboard",
  "/login",
  "/signup",
  "/student-registration",
  "/school-registration",
  "/reset-password",
  "/verify",
];

const DISMISS_KEY = "rillcod-wa-dismissed";

export default function SmartWhatsAppWidget() {
  const pathname = usePathname();
  const { cta } = useFeaturedSpecialProgram();
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hiddenRoute = HIDE_ON.some(
    (p) => pathname === p || pathname?.startsWith(`${p}/`),
  );

  const enquiries = [
    {
      id: "enrol",
      title: "Enrol a Learner",
      desc: "Term classes — school, online, or centre",
      message:
        "Hello Rillcod Team! I'd like to enrol a learner for your coding programmes. Please share the next steps.",
    },
    ...(cta.slug
      ? [
          {
            id: "special",
            title: cta.title || "Special Programme",
            desc: "Ask about the current seasonal cohort",
            message: `Hello Rillcod Team! I am interested in ${cta.title || "your special programme"}. I'd like to ask a few questions.`,
          },
        ]
      : []),
    {
      id: "school",
      title: "School Partnership",
      desc: "Bring Rillcod to your school",
      message:
        "Hello! We would like to learn more about how Rillcod partners with schools.",
    },
    {
      id: "general",
      title: "General Enquiry",
      desc: "Chat with support",
      message: "Hello! I have a question about Rillcod Technologies.",
    },
  ];

  // Show only after a short delay, and tuck away while the user is scrolling.
  useEffect(() => {
    if (hiddenRoute || dismissed) {
      setVisible(false);
      return;
    }

    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {
      /* ignore */
    }

    const showAfter = window.setTimeout(() => setVisible(true), 4500);

    const onScroll = () => {
      setVisible(false);
      setIsOpen(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setVisible(true), 1800);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(showAfter);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [hiddenRoute, dismissed]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelectOption = (message: string) => {
    const cleanPhone = (contactInfo.whatsapp || "+2348116600091").replace(/\D/g, "");
    window.open(
      `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setIsOpen(false);
  };

  const dismiss = () => {
    setIsOpen(false);
    setDismissed(true);
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (hiddenRoute || dismissed || !visible) return null;

  return (
    <div
      ref={widgetRef}
      className="fixed right-5 sm:right-6 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-50 transition-opacity duration-300"
    >
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-[280px] sm:w-[320px] bg-card border border-border shadow-2xl rounded-2xl p-4 mb-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3 mb-3">
            <div>
              <h3 className="text-xs font-black uppercase text-foreground tracking-wider">
                Chat on WhatsApp
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Pick a topic — we open WhatsApp with your message ready.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg border border-border"
              aria-label="Hide WhatsApp for this visit"
              title="Hide for this visit"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5">
            {enquiries.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectOption(opt.message)}
                className="w-full flex items-center justify-between gap-2 p-3 bg-muted/30 hover:bg-emerald-500/10 border border-border/80 hover:border-emerald-500/40 rounded-xl text-left transition-colors"
              >
                <div className="min-w-0">
                  <h4 className="text-[11px] font-black uppercase tracking-wide text-foreground truncate">
                    {opt.title}
                  </h4>
                  <p className="text-[9px] text-muted-foreground mt-0.5 leading-snug">
                    {opt.desc}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center justify-center w-12 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg border border-emerald-700/40 transition-transform hover:scale-105"
        aria-label={isOpen ? "Close WhatsApp menu" : "Chat on WhatsApp"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>
    </div>
  );
}

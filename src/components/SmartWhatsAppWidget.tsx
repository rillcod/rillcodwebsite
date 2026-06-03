"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Sparkles, ArrowRight } from "lucide-react";
import { contactInfo } from "@/config/brand";

const ENQUIRIES = [
  {
    id: "summer_school",
    icon: "☀️",
    title: "AI Summer School",
    desc: "Enquire about the 2026 cohort",
    message: "Hello Rillcod Team! I am interested in registering my child for the AI Summer School 2026. I'd like to ask a few questions."
  },
  {
    id: "regular_academy",
    icon: "🚀",
    title: "Regular Coding Academy",
    desc: "Enquire about student curriculums",
    message: "Hello Rillcod Team! I'd like to get more information about your regular term coding classes and options."
  },
  {
    id: "school_partnership",
    icon: "🏫",
    title: "School Partnerships",
    desc: "Bring Rillcod to your school",
    message: "Hello! We would like to learn more about how Rillcod partner with schools to deliver world-class tech training."
  },
  {
    id: "general",
    icon: "💬",
    title: "General Enquiry",
    desc: "Chat with a support advisor",
    message: "Hello! I have a general question about Rillcod Technologies."
  }
];

export default function SmartWhatsAppWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasStickyOffset, setHasStickyOffset] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSticky = (e: Event) => {
      const customEvent = e as CustomEvent;
      setHasStickyOffset(!!customEvent.detail);
    };
    
    if (typeof window !== "undefined") {
      const dismissed = sessionStorage.getItem("summer-school-sticky-dismissed");
      const isHome = window.location.pathname === "/";
      if (isHome && !dismissed) {
        setHasStickyOffset(true);
      }
      
      window.addEventListener("rillcod-sticky-visible", handleSticky as EventListener);
    }
    
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("rillcod-sticky-visible", handleSticky as EventListener);
      }
    };
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectOption = (message: string) => {
    // Standardize to only digits for wa.me redirect
    const cleanPhone = (contactInfo.whatsapp || '+2348116600091').replace(/\D/g, "");
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  };

  return (
    <div 
      ref={widgetRef} 
      className="fixed right-6 z-50 transition-all duration-300" 
      style={{ bottom: hasStickyOffset ? "108px" : "24px" }}
    >
      {/* Popover Card */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-[290px] sm:w-[330px] bg-card border border-border shadow-2xl rounded-2xl p-5 mb-2 animate-in fade-in slide-in-from-bottom-5 duration-300 z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
            <div>
              <h3 className="text-xs font-black uppercase text-foreground tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                Select Enquiry Topic
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">We'll open WhatsApp with a pre-filled enquiry.</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Options Grid */}
          <div className="space-y-2">
            {ENQUIRIES.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelectOption(opt.message)}
                className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-primary hover:text-primary-foreground border border-border/80 hover:border-primary rounded-xl text-left transition-all duration-200 group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl shrink-0">{opt.icon}</span>
                  <div>
                    <h4 className="text-[11px] font-black uppercase tracking-wide group-hover:text-inherit text-foreground">{opt.title}</h4>
                    <p className="text-[9px] group-hover:text-inherit/80 text-muted-foreground mt-0.5 leading-none">{opt.desc}</p>
                  </div>
                </div>
                <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-inherit group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            ))}
          </div>

          <div className="text-center pt-3 mt-3 border-t border-border">
            <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">rillcod technologies support</span>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center p-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-2xl transition-all duration-300 hover:scale-110 relative border-2 border-border cursor-pointer"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="w-6 h-6" />
        <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 rounded-full border border-background flex items-center justify-center animate-pulse">
          <span className="w-1.5 h-1.5 bg-white rounded-full" />
        </div>
      </button>
    </div>
  );
}

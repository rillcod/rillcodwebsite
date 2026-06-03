"use client";

import Link from "next/link";
import type { SummerSuccessInfo } from "@/hooks/useSummerSchoolRegistration";

type Props = {
  successInfo: SummerSuccessInfo;
  whatsappGroupLink?: string | null;
  variant?: "page" | "popup";
  onRegisterAnother: () => void;
};

export function SummerSchoolSuccessTicket({
  successInfo,
  whatsappGroupLink,
  variant = "page",
  onRegisterAnother,
}: Props) {
  const compact = variant === "popup";
  const waLink = whatsappGroupLink || "https://chat.whatsapp.com/G5l4M9x8Z8B7V6C5X4Z3Y2";
  const isBank = successInfo.method === "bank_transfer";
  const isInstallment = successInfo.plan === "installment";

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-4">
        <div className={`${compact ? "w-14 h-14 text-2xl" : "w-16 h-16 text-3xl"} bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500 font-black`}>
          ✓
        </div>
        <div>
          <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
            Admission Ticket Issued
          </span>
          <h3 className={`${compact ? "text-xl" : "text-2xl sm:text-3xl"} font-black uppercase text-foreground mt-4`}>
            Registration Completed
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Thank you for enrolling {successInfo.studentName} in the Rillcod AI Summer School 2026.
          </p>
        </div>
      </div>

      <div className="border border-dashed border-border bg-background p-5 sm:p-6 rounded-xl space-y-4 relative text-left">
        <div className="flex justify-between items-start border-b border-border pb-3 sm:pb-4">
          <div>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Student</p>
            <p className={`${compact ? "text-sm" : "text-base"} font-black text-foreground`}>{successInfo.studentName}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cohort Window</p>
            <p className="text-xs font-black text-amber-500">June 8 – August 28</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs font-bold border-b border-border pb-3 sm:pb-4">
          <div>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Plan</p>
            <p className="uppercase">{isInstallment ? "Installment Deposit" : "Full Payment"}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Method</p>
            <p className="uppercase">{isBank ? "Manual Transfer" : "Online checkout"}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Reference</p>
            <p className="font-mono text-[10px] sm:text-[11px] truncate select-all">{successInfo.reference}</p>
          </div>
          <div>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Payment Status</p>
            <p className={isBank ? "text-amber-500 animate-pulse uppercase" : "text-emerald-500 uppercase"}>
              {isBank ? "Verification Pending" : successInfo.paymentVerified ? "Payment Received" : "Processing"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {isInstallment && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-left">
            <p className="text-xs font-black text-amber-500 uppercase">Installment — balance due week 3</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Pay the remaining 50% before week 3 on the{" "}
              <Link href="/summer-school/pay-balance" className="text-primary font-bold hover:underline">balance payment page</Link>.
            </p>
          </div>
        )}

        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/50 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📱</span>
            <div className="text-left">
              <p className="text-xs font-black text-emerald-500 uppercase tracking-wide">Join Student WhatsApp Group</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Lessons, schedules & project updates</p>
            </div>
          </div>
          <span className="text-xs font-black text-emerald-500 group-hover:translate-x-1 transition-transform uppercase">Join →</span>
        </a>

        {!compact && (
          <div className="flex items-start gap-3 p-4 bg-muted/20 border border-border rounded-xl text-left">
            <span className="text-xl">📧</span>
            <div>
              <p className="text-xs font-black text-foreground uppercase tracking-wide">Check Your Inbox</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                {isBank
                  ? "You will receive a confirmation email once our team verifies your bank transfer (usually within 1–2 business days)."
                  : "A confirmation email with portal credentials will arrive shortly once payment processing completes."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex-1 py-3 sm:py-3.5 bg-muted hover:bg-muted/80 border border-border rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
        >
          🖨️ Print
        </button>
        <button
          type="button"
          onClick={onRegisterAnother}
          className="flex-1 py-3 sm:py-3.5 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
        >
          Register Another
        </button>
      </div>
    </div>
  );
}

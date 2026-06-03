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
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide all non-printable page layout items */
          nav, footer, header, #whatsapp-widget, .whatsapp-button, .no-print {
            display: none !important;
          }

          /* Hide other page elements on the summer-school page */
          div.min-h-screen > div.max-w-6xl > *:not(#register) {
            display: none !important;
          }
          #register {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          #register > *:not(.lg\\:col-span-2) {
            display: none !important;
          }
          
          /* Hide other components inside the popup modal wrapper */
          div[class*="z-[100]"] {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }
          div[class*="z-[100]"] > div {
            border: none !important;
            max-height: none !important;
            height: auto !important;
            box-shadow: none !important;
            background: #ffffff !important;
            padding: 20px !important;
            margin: 0 !important;
          }
          
          /* Hide popup modal elements not part of the ticket */
          div[class*="z-[100]"] button.absolute,
          div[class*="z-[100]"] div.relative.p-8.sm\\:p-12.border-b,
          div[class*="z-[100]"] h3.text-muted-foreground.uppercase.tracking-widest.mb-5,
          div[class*="z-[100]"] div.grid.grid-cols-1.sm\\:grid-cols-2.gap-3,
          div[class*="z-[100]"] div.pt-6.border-t.border-border,
          div[class*="z-[100]"] div.bg-muted\\/20.border.border-border.p-7.sm\\:p-10 {
            display: none !important;
          }

          /* Force print ticket column to fill width */
          .lg\\:col-span-2 {
            display: block !important;
            width: 100% !important;
            max-width: 600px !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }

          /* Target the printable ticket container card */
          .printable-ticket-box {
            border: 2px dashed #64748b !important;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 30px !important;
            border-radius: 16px !important;
            box-shadow: none !important;
            max-width: 550px !important;
            margin: 0 auto !important;
          }

          .printable-ticket-box * {
            color: #000000 !important;
            border-color: #cbd5e1 !important;
            background-color: transparent !important;
            background: transparent !important;
          }

          /* Make the checkmark icon and badging stand out on paper */
          .printable-badge {
            background-color: #f0fdf4 !important;
            color: #16a34a !important;
            border: 1px solid #bbf7d0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .printable-checkmark-bg {
            background-color: #f0fdf4 !important;
            color: #16a34a !important;
            border: 1px solid #bbf7d0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .printable-highlight {
            color: #d97706 !important;
            font-weight: 900 !important;
          }

          body, html {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      ` }} />

      <div className="printable-ticket-box">
        <div className="text-center space-y-4">
          <div className={`${compact ? "w-14 h-14 text-2xl" : "w-16 h-16 text-3xl"} bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500 font-black printable-checkmark-bg`}>
            ✓
          </div>
          <div>
            <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest printable-badge">
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

        <div className="border border-dashed border-border bg-background p-5 sm:p-6 rounded-xl space-y-4 relative text-left mt-6 sm:mt-8">
          <div className="flex justify-between items-start border-b border-border pb-3 sm:pb-4">
            <div>
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Student</p>
              <p className={`${compact ? "text-sm" : "text-base"} font-black text-foreground`}>{successInfo.studentName}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Cohort Window</p>
              <p className="text-xs font-black text-amber-500 printable-highlight">June 8 – August 28</p>
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
              <p className={isBank ? "text-amber-500 animate-pulse uppercase printable-highlight" : "text-emerald-500 uppercase printable-badge"}>
                {isBank ? "Verification Pending" : successInfo.paymentVerified ? "Payment Received" : "Processing"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {isInstallment && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-left no-print">
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
          className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/50 rounded-xl transition-all group no-print"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">📱</span>
            <div className="text-left">
              <p className="text-xs font-black text-emerald-500 uppercase tracking-wide">Join Student WhatsApp Group</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Lessons, schedules & project updates</p>
            </div>
          </div>
          <span className="text-xs font-black text-emerald-500 group-hover:translate-x-1 transition-transform uppercase no-print">Join →</span>
        </a>

        {!compact && (
          <div className="flex items-start gap-3 p-4 bg-muted/20 border border-border rounded-xl text-left no-print">
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

      <div className="flex items-center gap-3 pt-4 border-t border-border no-print">
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

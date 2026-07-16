"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, CheckCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { NativeBillingNotice } from "@/components/billing/NativeBillingNotice";

export default function PayBalancePage() {
  const isNativeApp = useIsNativeApp();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    studentName: string;
    balanceDue: number;
    balanceLabel: string;
    amountPaid: number;
    totalTuition: number;
    status: string;
  } | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("email");
    if (prefill) setEmail(prefill);

    const reference = params.get("reference")?.trim();
    if (params.get("payment") === "success" && reference) {
      fetch(`/api/summer-school/verify?reference=${encodeURIComponent(reference)}`)
        .then(async (res) => {
          const data = await res.json();
          if (res.ok && data.ok) {
            setVerified(true);
            toast.success("Balance payment received. Thank you!");
            fetch("/api/summer-school/ensure-onboarded", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reference }),
            }).catch(() => { /* webhook fallback is non-critical for the UI */ });
            window.history.replaceState({}, document.title, "/summer-school/pay-balance");
          } else {
            toast.error(data.error || "Payment could not be verified.");
          }
        })
        .catch(() => toast.error("Payment verification failed."));
    }
  }, []);

  const checkBalance = async () => {
    if (!email.trim()) {
      toast.error("Enter the parent email used during registration.");
      return;
    }
    setChecking(true);
    setBalanceInfo(null);
    try {
      const res = await fetch(`/api/summer-school/balance?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find balance");
      setBalanceInfo(data);
      if (data.status === "paid" || data.balanceDue <= 0) {
        toast.success("Tuition is fully paid — no balance due.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setChecking(false);
    }
  };

  const payBalance = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/summer-school/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed to start");
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Summer School 2026</p>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">{isNativeApp ? 'Tuition Status' : 'Pay Remaining Tuition'}</h1>
          <p className="text-sm text-muted-foreground">
            {isNativeApp ? 'Review the current tuition status for your registration.' : 'Installment registrants can complete the remaining 50% balance here (due by week 3 of the cohort).'}
          </p>
        </div>

        {isNativeApp && <NativeBillingNotice />}

        {verified && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-emerald-500 uppercase">Balance Paid</p>
              <p className="text-xs text-muted-foreground mt-1">Your remaining tuition has been received. Check your email for confirmation.</p>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-xl">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parent Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
              className="mt-1.5 w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <button
            type="button"
            onClick={checkBalance}
            disabled={checking}
            className="w-full py-3 bg-muted border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-muted/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {checking ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Checking…</> : "Check Balance"}
          </button>

          {balanceInfo && balanceInfo.balanceDue > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-muted-foreground">Student</span>
                <span>{balanceInfo.studentName}</span>
              </div>
              <div className="flex justify-between text-xs font-bold">
                <span className="text-muted-foreground">Paid so far</span>
                <span>₦{balanceInfo.amountPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-border pt-3">
                <span className="text-amber-500 uppercase">Balance due</span>
                <span className="text-amber-500">{balanceInfo.balanceLabel}</span>
              </div>
              <button
                type="button"
                onClick={payBalance}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Pay Balance Online
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/summer-school" className="text-primary font-bold hover:underline">← Back to Summer School</Link>
        </p>
      </div>
    </div>
  );
}

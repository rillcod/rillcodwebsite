"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, CheckCircle, CreditCard, Building2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { isAllowedReceiptFile, receiptAcceptAttribute } from "@/lib/summer-school/receipt-upload";
import { resolveBalanceTransferSettlement } from "@/lib/summer-school/bank-transfer-amount";
import { BankTransferAmountField } from "@/components/summer-school/BankTransferAmountField";
import { NativeBillingNotice } from "@/components/billing/NativeBillingNotice";
import { STUDENT_REGISTRATION_PATH, TERM_BALANCE_PATH } from "@/lib/registration/enrollment-types";

export default function TermPayBalancePage() {
  const isNativeApp = useIsNativeApp();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"paystack" | "bank_transfer">("paystack");
  const [transferAmount, setTransferAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verifyingReturn, setVerifyingReturn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    studentName: string;
    balanceDue: number;
    balanceLabel: string;
    amountPaid: number;
    totalTuition: number;
    status: string;
    programName?: string | null;
  } | null>(null);
  const [verified, setVerified] = useState(false);

  const bankSettlement = useMemo(() => {
    if (!balanceInfo || balanceInfo.balanceDue <= 0) return null;
    return resolveBalanceTransferSettlement({
      outstandingBalance: balanceInfo.balanceDue,
      totalTuition: balanceInfo.totalTuition,
      amountPaidSoFar: balanceInfo.amountPaid,
      declaredAmount: transferAmount || balanceInfo.balanceDue,
    });
  }, [balanceInfo, transferAmount]);

  const bankTransferReady =
    paymentMethod !== "bank_transfer" ||
    (bankSettlement?.ok === true && paymentReference.trim().length > 0 && !uploadingReceipt);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("email");
    if (prefill) setEmail(prefill);

    const reference = params.get("reference")?.trim();
    if (params.get("payment") !== "success" || !reference) return;

    setVerifyingReturn(true);
    (async () => {
      const res = await fetch(
        `/api/payments/registration/balance/verify?reference=${encodeURIComponent(reference)}`,
      );
      const result = await res.json();
      if (!result.ok) {
        toast.error(result.error || "Payment could not be verified yet.");
        setVerifyingReturn(false);
        return;
      }
      setVerified(true);
      toast.success("Balance payment received. Thank you!");
      if (prefill) setEmail(prefill);
      window.history.replaceState(
        {},
        document.title,
        prefill
          ? `${TERM_BALANCE_PATH}?email=${encodeURIComponent(prefill)}`
          : TERM_BALANCE_PATH,
      );
      setVerifyingReturn(false);
    })();
  }, []);

  const checkBalance = async () => {
    if (!email.trim()) {
      toast.error("Enter the parent email used during registration.");
      return;
    }
    setChecking(true);
    setBalanceInfo(null);
    setSubmitted(false);
    try {
      const res = await fetch(
        `/api/payments/registration/balance?email=${encodeURIComponent(email.trim())}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find balance");
      setBalanceInfo(data);
      if (data.balanceDue > 0 && !transferAmount) {
        setTransferAmount(String(data.balanceDue));
      }
      if (data.status === "paid" || data.balanceDue <= 0) {
        toast.success("Registration tuition is fully paid — no balance due.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setChecking(false);
    }
  };

  const handleReceiptUpload = async (file: File) => {
    if (!isAllowedReceiptFile(file)) {
      toast.error("Please upload a receipt image (PNG, JPG, HEIC) or PDF.");
      return;
    }
    setUploadingReceipt(true);
    const toastId = toast.loading("Uploading receipt...");
    try {
      const body = new FormData();
      body.append("file", file);
      if (paymentReference.startsWith("http") || paymentReference.startsWith("/")) {
        body.append("previousUrl", paymentReference);
      }
      const res = await fetch("/api/summer-school/receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPaymentReference(data.url);
      toast.success("Receipt uploaded.", { id: toastId });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload receipt.", { id: toastId });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const payBalance = async () => {
    setAttempted(true);
    if (!email.trim()) {
      toast.error("Enter the parent email used during registration.");
      return;
    }
    if (paymentMethod === "bank_transfer" && !bankTransferReady) {
      toast.error(
        uploadingReceipt
          ? "Please wait for your receipt upload to finish."
          : "Upload a receipt or enter your transfer reference.",
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/payments/registration/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          payment_method: paymentMethod,
          payment_reference: paymentMethod === "bank_transfer" ? paymentReference.trim() : undefined,
          transfer_amount: paymentMethod === "bank_transfer" ? transferAmount : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed to start");

      if (paymentMethod === "bank_transfer") {
        setSubmitted(true);
        toast.success(data.message || "Balance payment submitted for verification.");
        setLoading(false);
        return;
      }

      if (!data.paymentUrl) {
        throw new Error("Payment link was not returned. Please try again or contact support.");
      }
      toast.message("Redirecting to secure checkout…");
      window.location.href = data.paymentUrl;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
      setLoading(false);
    }
  };

  const labelCls = (err?: boolean) =>
    `text-[10px] font-black uppercase tracking-widest ${err ? "text-rose-500" : "text-muted-foreground"}`;
  const inputCls = (err?: boolean) =>
    `mt-1.5 w-full px-4 py-3 bg-background border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 ${
      err ? "border-rose-500" : "border-border"
    }`;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Term registration</p>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
            {isNativeApp ? "Registration balance" : "Pay registration balance"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Instalment registrants can complete the remaining term fee here (Paystack or bank transfer).
          </p>
        </div>

        {isNativeApp && <NativeBillingNotice />}

        {verifyingReturn && (
          <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
            <p className="text-sm font-medium">Confirming your payment with Paystack…</p>
          </div>
        )}

        {verified && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-emerald-500 uppercase">Balance paid</p>
              <p className="text-xs text-muted-foreground mt-1">Your remaining registration fee has been received.</p>
            </div>
          </div>
        )}

        {submitted && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-amber-500 uppercase">Submitted for verification</p>
              <p className="text-xs text-muted-foreground mt-1">Our team will verify your bank transfer and email you once confirmed.</p>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-xl">
          <div>
            <label className={labelCls()}>Parent email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
              className={inputCls()}
            />
          </div>

          <button
            type="button"
            onClick={checkBalance}
            disabled={checking || verifyingReturn}
            className="w-full py-3 bg-muted border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-muted/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {checking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Checking…
              </>
            ) : (
              "Check balance"
            )}
          </button>

          {balanceInfo && balanceInfo.balanceDue > 0 && !submitted && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-4">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-muted-foreground">Student</span>
                <span>{balanceInfo.studentName}</span>
              </div>
              {balanceInfo.programName && (
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-muted-foreground">Programme</span>
                  <span>{balanceInfo.programName}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold">
                <span className="text-muted-foreground">Paid so far</span>
                <span>₦{balanceInfo.amountPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-border pt-3">
                <span className="text-amber-500 uppercase">Balance due</span>
                <span className="text-amber-500">{balanceInfo.balanceLabel}</span>
              </div>

              {!isNativeApp && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("paystack")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors cursor-pointer ${
                      paymentMethod === "paystack"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Paystack
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank_transfer")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors cursor-pointer ${
                      paymentMethod === "bank_transfer"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border"
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Bank transfer
                  </button>
                </div>
              )}

              {paymentMethod === "bank_transfer" && !isNativeApp && (
                <div className="space-y-3 border-t border-border pt-3">
                  <BankTransferAmountField
                    value={transferAmount}
                    onChange={setTransferAmount}
                    attempted={attempted}
                    totalTuition={balanceInfo.totalTuition}
                    suggestedAmount={balanceInfo.balanceDue}
                    depositPercent={100}
                    settlement={bankSettlement}
                    labelCls={labelCls}
                    inputCls={inputCls}
                    compact
                    balanceMode={{
                      outstandingBalance: balanceInfo.balanceDue,
                      amountPaidSoFar: balanceInfo.amountPaid,
                    }}
                  />
                  <div>
                    <label className={labelCls(attempted && !paymentReference.trim())}>
                      Receipt or transfer reference *
                    </label>
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept={receiptAcceptAttribute()}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleReceiptUpload(file);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex gap-2 mt-1.5">
                      <input
                        type="text"
                        value={paymentReference.startsWith("http") ? "Receipt uploaded ✓" : paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Transfer reference or upload receipt"
                        className={inputCls(attempted && !paymentReference.trim())}
                        readOnly={paymentReference.startsWith("http")}
                      />
                      <button
                        type="button"
                        onClick={() => receiptInputRef.current?.click()}
                        disabled={uploadingReceipt}
                        className="shrink-0 px-3 py-3 bg-muted border border-border rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 cursor-pointer"
                      >
                        {uploadingReceipt ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={payBalance}
                disabled={
                  loading ||
                  verifyingReturn ||
                  uploadingReceipt ||
                  (paymentMethod === "bank_transfer" && !bankTransferReady)
                }
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : paymentMethod === "bank_transfer" ? (
                  <Building2 className="w-4 h-4" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {paymentMethod === "bank_transfer" ? "Submit balance transfer" : "Pay balance online"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <Link href={STUDENT_REGISTRATION_PATH} className="text-primary font-bold hover:underline">
            ← Back to registration
          </Link>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, CheckCircle, CreditCard, Building2, Upload, Copy, Check, FileCheck, Sun } from "lucide-react";
import { toast } from "sonner";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { NativeBillingNotice } from "@/components/billing/NativeBillingNotice";
import {
  ensureSummerPaymentOnboarded,
  verifySummerPaymentWithRetry,
} from "@/lib/summer-school/client-payment-return";
import { isAllowedReceiptFile, receiptAcceptAttribute } from "@/lib/summer-school/receipt-upload";
import { resolveBalanceTransferSettlement } from "@/lib/summer-school/bank-transfer-amount";
import { BankTransferAmountField } from "@/components/summer-school/BankTransferAmountField";
import { fetchActionJson } from "@/lib/async-timeout";

const BANK_DETAILS = {
  bankName: "Zenith Bank",
  accountName: "RILLCOD TECHNOLOGIES",
  accountNumber: "1228492019",
};

export default function PayBalancePage() {
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
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{
    studentName: string;
    balanceDue: number;
    balanceLabel: string;
    amountPaid: number;
    totalTuition: number;
    status: string;
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
      const result = await verifySummerPaymentWithRetry(reference);
      if (!result.ok) {
        toast.error(result.error);
        setVerifyingReturn(false);
        return;
      }

      setVerified(true);
      toast.success("Balance payment received. Thank you!");
      const onboard = await ensureSummerPaymentOnboarded(reference);
      if (!onboard.ok) {
        toast.message(
          "Payment confirmed. Your receipt may take a few minutes — check your email.",
        );
      }

      if (prefill) setEmail(prefill);
      window.history.replaceState({}, document.title, prefill
        ? `/summer-school/pay-balance?email=${encodeURIComponent(prefill)}`
        : "/summer-school/pay-balance");
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
      const { response, data } = await fetchActionJson<{
        error: string; studentName: string; balanceDue: number; balanceLabel: string;
        amountPaid: number; totalTuition: number; status: string;
      }>(`/api/summer-school/balance?email=${encodeURIComponent(email.trim())}`, {}, "The balance lookup is taking longer than expected. Please try again.");
      if (!response.ok) {
        if (response.status >= 500) console.error("Summer balance lookup failed", { status: response.status, data });
        toast.error(response.status < 500 && typeof data.error === "string" ? data.error : "We could not check the balance. Please try again.");
        return;
      }
      if (typeof data.balanceDue !== "number" || typeof data.studentName !== "string") {
        console.error("Summer balance response was incomplete", data);
        toast.error("We could not read the balance. Please try again.");
        return;
      }
      setBalanceInfo({
        studentName: data.studentName,
        balanceDue: data.balanceDue,
        balanceLabel: typeof data.balanceLabel === "string" ? data.balanceLabel : "Balance due",
        amountPaid: typeof data.amountPaid === "number" ? data.amountPaid : 0,
        totalTuition: typeof data.totalTuition === "number" ? data.totalTuition : data.balanceDue,
        status: typeof data.status === "string" ? data.status : "pending",
      });
      if (data.balanceDue > 0 && !transferAmount) {
        setTransferAmount(String(data.balanceDue));
      }
      if (data.status === "paid" || data.balanceDue <= 0) {
        toast.success("Tuition is fully paid — no balance due.");
      }
    } catch (err: unknown) {
      console.error("Summer balance lookup request failed", err);
      toast.error(err instanceof Error && err.message.includes("taking longer") ? err.message : "We could not check the balance. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  };

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(BANK_DETAILS.accountNumber);
      setCopiedAccount(true);
      toast.success("Account number copied to clipboard!");
      setTimeout(() => setCopiedAccount(false), 2500);
    } catch (error) {
      console.error("Account number copy failed", error);
      toast.error("Copy is unavailable. Select and copy the account number manually.");
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
      const { response, data } = await fetchActionJson<{ error: string; url: string }>("/api/summer-school/receipt", { method: "POST", body }, "The receipt upload is taking longer than expected. Please try again.");
      if (!response.ok || typeof data.url !== "string") {
        if (response.status >= 500) console.error("Balance receipt upload failed", { status: response.status, data });
        toast.error(response.status < 500 && typeof data.error === "string" ? data.error : "We could not upload the receipt. Please try again.", { id: toastId });
        return;
      }
      setPaymentReference(data.url);
      toast.success("Receipt uploaded successfully.", { id: toastId });
    } catch (err: unknown) {
      console.error("Balance receipt upload request failed", err);
      toast.error(err instanceof Error && err.message.includes("taking longer") ? err.message : "We could not upload the receipt. Check your connection and try again.", { id: toastId });
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
      toast.error(uploadingReceipt
        ? "Please wait for your receipt upload to finish."
        : "Upload a receipt or enter your transfer reference.");
      return;
    }
    setLoading(true);
    try {
      const { response, data } = await fetchActionJson<{ error: string; message: string; paymentUrl: string }>("/api/summer-school/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          payment_method: paymentMethod,
          payment_reference: paymentMethod === "bank_transfer" ? paymentReference.trim() : undefined,
          transfer_amount: paymentMethod === "bank_transfer" ? transferAmount : undefined,
        }),
      }, "Payment setup is taking longer than expected. Please try again.");
      if (!response.ok) {
        if (response.status >= 500) console.error("Summer balance payment setup failed", { status: response.status, data });
        toast.error(response.status < 500 && typeof data.error === "string" ? data.error : "We could not start the payment. Please try again.");
        return;
      }

      if (paymentMethod === "bank_transfer") {
        setSubmitted(true);
        toast.success(data.message || "Balance payment submitted for verification.");
        return;
      }

      if (!data.paymentUrl) {
        console.error("Summer balance payment response omitted paymentUrl", data);
        toast.error("We could not open secure checkout. Please try again or contact support.");
        return;
      }
      toast.message("Redirecting to secure checkout…");
      window.location.href = data.paymentUrl;
    } catch (err: unknown) {
      console.error("Summer balance payment request failed", err);
      toast.error(err instanceof Error && err.message.includes("taking longer") ? err.message : "We could not start the payment. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const labelCls = (err?: boolean) =>
    `text-[10px] font-black uppercase tracking-widest transition-colors ${err ? "text-destructive" : "text-muted-foreground"}`;
  const inputCls = (err?: boolean) =>
    `mt-1.5 w-full px-4 py-3 bg-background text-foreground border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all ${
      err ? "border-destructive text-destructive" : "border-input"
    }`;

  const currentStep = verified || submitted ? 3 : balanceInfo && balanceInfo.balanceDue > 0 ? 2 : 1;

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12 transition-colors duration-200 public-page-root overflow-x-clip">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest">
            <Sun className="w-3.5 h-3.5" />
            <span>Summer School 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-foreground">
            {isNativeApp ? "Tuition Status" : "Pay Remaining Tuition"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
            {isNativeApp
              ? "Review the current tuition status for your registration."
              : "Deposit registrants can complete remaining summer school tuition here via online card payment or bank transfer."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 bg-muted/60 dark:bg-card border border-border p-1.5 rounded-2xl">
          {[
            { step: 1, label: "Lookup Email" },
            { step: 2, label: "Select Method" },
            { step: 3, label: "Confirmation" },
          ].map(({ step, label }) => {
            const isActive = currentStep === step;
            const isDone = currentStep > step;
            return (
              <div
                key={step}
                className={`flex flex-col items-center py-2 px-1 rounded-xl transition-all text-center ${
                  isActive
                    ? "bg-card text-foreground border border-border shadow-sm"
                    : isDone
                    ? "text-amber-500 font-semibold"
                    : "text-muted-foreground opacity-60"
                }`}
              >
                <span className={`text-[10px] font-black uppercase tracking-wider ${isActive ? "text-amber-500" : ""}`}>
                  Step 0{step}
                </span>
                <span className="text-[11px] font-bold truncate max-w-full">{label}</span>
              </div>
            );
          })}
        </div>

        {isNativeApp && <NativeBillingNotice />}

        {verifyingReturn && (
          <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl flex items-center gap-3 shadow-md">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500 shrink-0" />
            <p className="text-sm font-medium text-foreground">Confirming your payment with Paystack…</p>
          </div>
        )}

        {verified && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 flex items-start gap-3.5 shadow-sm">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Tuition Paid</p>
              <p className="text-xs text-muted-foreground mt-1">Your summer school tuition is fully paid. Thank you!</p>
            </div>
          </div>
        )}

        {submitted && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-start gap-3.5 shadow-sm">
            <CheckCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-amber-600 dark:text-amber-400 uppercase tracking-wide">Submitted for Verification</p>
              <p className="text-xs text-muted-foreground mt-1">Our team will verify your bank transfer reference and email you once confirmed.</p>
            </div>
          </div>
        )}

        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl space-y-5 shadow-xl transition-colors">
          <div>
            <label className={labelCls()}>Parent Email *</label>
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
            className="w-full py-3 bg-muted text-foreground border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-secondary transition-colors disabled:opacity-50 cursor-pointer"
          >
            {checking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Checking Balance…
              </>
            ) : (
              "Check Tuition Balance"
            )}
          </button>

          {balanceInfo && balanceInfo.balanceDue > 0 && !submitted && (
            <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/30 rounded-xl p-4 space-y-4">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-muted-foreground">Student</span>
                <span className="text-foreground">{balanceInfo.studentName}</span>
              </div>
              <div className="flex justify-between text-xs font-bold">
                <span className="text-muted-foreground">Paid so far</span>
                <span className="text-foreground">₦{balanceInfo.amountPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-border/60 pt-3">
                <span className="text-amber-600 dark:text-amber-400 uppercase">Balance Due</span>
                <span className="text-amber-600 dark:text-amber-400">{balanceInfo.balanceLabel}</span>
              </div>

              {!isNativeApp && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("paystack")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                      paymentMethod === "paystack"
                        ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                        : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Paystack
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank_transfer")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                      paymentMethod === "bank_transfer"
                        ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                        : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Bank Transfer
                  </button>
                </div>
              )}

              {paymentMethod === "bank_transfer" && !isNativeApp && (
                <div className="space-y-4 border-t border-border/60 pt-3">
                  <div className="bg-card border border-border rounded-xl p-3.5 space-y-2.5 text-xs shadow-inner">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bank Account Details</span>
                      <button
                        type="button"
                        onClick={copyAccountNumber}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        {copiedAccount ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedAccount ? "Copied!" : "Copy Account #"}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-[11px]">
                      <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground">Bank Name</p>
                        <p className="font-bold text-foreground">{BANK_DETAILS.bankName}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground">Account Name</p>
                        <p className="font-bold text-foreground">{BANK_DETAILS.accountName}</p>
                      </div>
                      <div className="col-span-2 bg-muted/50 p-2 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-[9px] uppercase font-bold text-muted-foreground">Account Number</p>
                          <p className="font-mono text-sm font-black tracking-wider text-amber-600 dark:text-amber-400">{BANK_DETAILS.accountNumber}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <BankTransferAmountField
                    value={transferAmount}
                    onChange={setTransferAmount}
                    attempted={attempted}
                    totalTuition={balanceInfo.totalTuition}
                    suggestedAmount={balanceInfo.balanceDue}
                    depositPercent={50}
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
                      Receipt or Transfer Reference *
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

                    {paymentReference.startsWith("http") || paymentReference.startsWith("/") ? (
                      <div className="mt-1.5 flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate">
                          <FileCheck className="w-4 h-4 shrink-0" />
                          <span className="truncate">Receipt uploaded & attached</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => receiptInputRef.current?.click()}
                          disabled={uploadingReceipt}
                          className="shrink-0 text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 hover:underline ml-2 cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-1.5">
                        <input
                          type="text"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Transfer reference number or upload receipt"
                          className={inputCls(attempted && !paymentReference.trim())}
                        />
                        <button
                          type="button"
                          onClick={() => receiptInputRef.current?.click()}
                          disabled={uploadingReceipt}
                          title="Upload receipt image/PDF"
                          className="shrink-0 px-3.5 py-3 bg-muted text-foreground border border-border rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-secondary disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {uploadingReceipt ? (
                            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                          ) : (
                            <Upload className="w-4 h-4 text-foreground" />
                          )}
                        </button>
                      </div>
                    )}
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
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-800 transition-colors disabled:opacity-50 cursor-pointer shadow-md"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : paymentMethod === "bank_transfer" ? (
                  <Building2 className="w-4 h-4" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {paymentMethod === "bank_transfer" ? "Submit Balance Transfer" : "Pay Balance Online"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/summer-school" className="text-amber-600 dark:text-amber-400 font-bold hover:underline transition-colors">
            ← Back to Summer School
          </Link>
        </p>
      </div>
    </div>
  );
}

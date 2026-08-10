"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  formatWhatsApp,
  isValidWhatsApp,
  suggestEmail,
  fetchActiveSchoolNames,
} from "@/lib/form-helpers";
import { tuitionLabels, getSummerTotalTuition, getSummerDepositAmount } from "@/lib/summer-school/pricing";
import { isAllowedReceiptFile, receiptAcceptAttribute } from "@/lib/summer-school/receipt-upload";
import { resolveBankTransferSettlement } from "@/lib/summer-school/bank-transfer-amount";
import { getSpecialTotalTuition, getSpecialDepositAmount, specialTuitionLabels } from "@/lib/special-programs/types";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { useContactCapture } from "@/hooks/useContactCapture";
import { fetchActionJson } from "@/lib/async-timeout";

export type SummerFormState = {
  studentName: string;
  parentName: string;
  phone: string;
  email: string;
  studentPhone: string;
  school: string;
  currentClass: string;
  age: string;
  gender: string;
  preferredMode: string;
  hearAboutUs: string;
  trackInterest: string;
  additionalInfo: string;
  paymentMethod: string;
  paymentPlan: string;
  paymentReference: string;
  transferAmount: string;
  parentConsent: boolean;
  whatsappConsent: boolean;
};

export const EMPTY_SUMMER_FORM: SummerFormState = {
  studentName: "",
  parentName: "",
  phone: "",
  email: "",
  studentPhone: "",
  school: "",
  currentClass: "",
  age: "",
  gender: "",
  preferredMode: "",
  hearAboutUs: "",
  trackInterest: "all",
  additionalInfo: "",
  paymentMethod: "paystack",
  paymentPlan: "full",
  paymentReference: "",
  transferAmount: "",
  parentConsent: false,
  whatsappConsent: false,
};

export type SummerSuccessInfo = {
  studentName: string;
  parentPhone: string;
  plan: string;
  method: string;
  reference: string;
  paymentVerified?: boolean;
  parentEmail?: string;
  paymentEmailSent?: boolean;
  paymentEmailError?: string | null;
  amountPaid?: number;
  totalTuition?: number;
  balanceDue?: number;
  effectivePlan?: string;
};

type UseSummerSchoolRegistrationOptions = {
  lsKey: string;
  receiptInputId?: string;
  specialProgramId?: string;
  specialProgramSlug?: string;
  pricingPage?: {
    online_fee: number;
    onsite_fee: number;
    deposit_percent: number;
  };
  ageMin?: number;
  ageMax?: number;
};

export function useSummerSchoolRegistration({
  lsKey,
  receiptInputId = "ss-receipt-upload",
  specialProgramId,
  specialProgramSlug,
  pricingPage,
  ageMin = 8,
  ageMax = 99,
}: UseSummerSchoolRegistrationOptions) {
  const { user, profile } = useAuth();
  const isNativeApp = useIsNativeApp();
  const [form, setForm] = useState<SummerFormState>(EMPTY_SUMMER_FORM);
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SummerSuccessInfo | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [schoolsList, setSchoolsList] = useState<string[]>([]);
  const [focusedSchoolIdx, setFocusedSchoolIdx] = useState<number | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [submitLocked, setSubmitLocked] = useState(false);
  const [restored, setRestored] = useState(false);
  const [whatsappGroupLink, setWhatsappGroupLink] = useState<string | null>(null);

  const tuition = pricingPage
    ? specialTuitionLabels(pricingPage, form.preferredMode)
    : tuitionLabels(form.preferredMode);

  const tuitionNumbers = useMemo(() => {
    if (!form.preferredMode) return null;
    if (pricingPage) {
      const total = getSpecialTotalTuition(pricingPage, form.preferredMode);
      const deposit = getSpecialDepositAmount(pricingPage, form.preferredMode);
      const depositPercent = Number(pricingPage.deposit_percent) || 50;
      const suggested = form.paymentPlan === "installment" ? deposit : total;
      return { total, deposit, depositPercent, suggested };
    }
    const total = getSummerTotalTuition(form.preferredMode);
    const deposit = getSummerDepositAmount(form.preferredMode);
    return { total, deposit, depositPercent: 50, suggested: form.paymentPlan === "installment" ? deposit : total };
  }, [pricingPage, form.preferredMode, form.paymentPlan]);

  const bankTransferSettlement = useMemo(() => {
    if (form.paymentMethod !== "bank_transfer" || !tuitionNumbers) return null;
    return resolveBankTransferSettlement({
      totalTuition: tuitionNumbers.total,
      declaredAmount: form.transferAmount,
      selectedPlan: form.paymentPlan,
      depositPercent: tuitionNumbers.depositPercent,
    });
  }, [form.paymentMethod, form.transferAmount, form.paymentPlan, tuitionNumbers]);

  const bankTransferAmountOk =
    form.paymentMethod !== "bank_transfer" || bankTransferSettlement?.ok === true;

  const canSubmit =
    form.studentName.trim() &&
    form.parentName.trim() &&
    form.phone.trim() &&
    isValidWhatsApp(form.phone) &&
    (!form.studentPhone.trim() || isValidWhatsApp(form.studentPhone)) &&
    form.email.trim() &&
    form.currentClass &&
    form.age &&
    parseInt(form.age, 10) >= ageMin &&
    parseInt(form.age, 10) <= ageMax &&
    form.gender &&
    form.preferredMode &&
    form.parentConsent === true &&
    !uploadingReceipt &&
    bankTransferAmountOk &&
    (isNativeApp || form.paymentMethod !== "bank_transfer" || form.paymentReference.trim());

  const getCapturePayload = useCallback(() => ({
    parentName: form.parentName,
    email: form.email,
    phone: form.phone,
    studentName: form.studentName,
    school: form.school,
    currentClass: form.currentClass,
    age: form.age,
    gender: form.gender,
    preferredSchedule: form.preferredMode,
    hearAboutUs: form.hearAboutUs,
    studentPhone: form.studentPhone,
    paymentMethod: form.paymentMethod,
    paymentPlan: form.paymentPlan,
  }), [form]);

  const { scheduleCapture, captureOnBlur, captureSubmitted, capturePaymentStarted } = useContactCapture({
    formType: 'special_program',
    programSlug: specialProgramSlug,
    getPayload: getCapturePayload,
    enabled: !isSuccess,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setForm((prev) => ({ ...prev, ...saved }));
        setRestored(true);
      }
    } catch { /* ignore */ }
  }, [lsKey]);

  useEffect(() => {
    if (isSuccess) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(lsKey, JSON.stringify(form));
      } catch { /* ignore */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [form, isSuccess, lsKey]);

  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        parentName: prev.parentName || profile.full_name || "",
        email: prev.email || profile.email || user?.email || "",
        phone: prev.phone || profile.phone || "",
      }));
    }
  }, [profile, user]);

  useEffect(() => {
    if (form.paymentMethod !== "bank_transfer" || !tuitionNumbers) return;
    setForm((prev) => {
      if (prev.transferAmount.trim()) return prev;
      return { ...prev, transferAmount: String(tuitionNumbers.suggested) };
    });
  }, [form.paymentMethod, form.paymentPlan, form.preferredMode, tuitionNumbers?.suggested]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("payment_accounts")
      .select("bank_name, account_number, account_name, label")
      .eq("is_active", true)
      .in("owner_type", ["rillcod", "global"])
      .then(({ data }) => {
        setBankAccounts(
          data?.length
            ? data
            : [{
                bank_name: "Providus Bank",
                account_number: "7901178957",
                account_name: "Rillcod Ltd",
                label: "Corporate Operations",
              }]
        );
      });
    fetchActiveSchoolNames(supabase).then(setSchoolsList);
    fetch("/api/summer-school/whatsapp-group")
      .then((r) => r.json())
      .then((d) => { if (d.link) setWhatsappGroupLink(d.link); })
      .catch(() => { /* fallback handled in UI */ });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    if (type === "checkbox") {
      const { checked } = e.target as HTMLInputElement;
      setForm((prev) => ({ ...prev, [name]: checked }));
      return;
    }
    if (name === "email") setEmailHint(null);
    setForm((prev) => ({ ...prev, [name]: value }));
    scheduleCapture(name);
  };

  const handlePhoneBlur = () => {
    if (form.phone) setForm((prev) => ({ ...prev, phone: formatWhatsApp(prev.phone) }));
    captureOnBlur();
  };

  const handleStudentPhoneBlur = () => {
    if (form.studentPhone) setForm((prev) => ({ ...prev, studentPhone: formatWhatsApp(prev.studentPhone) }));
    captureOnBlur();
  };

  const handleEmailBlur = () => {
    if (form.email) setEmailHint(suggestEmail(form.email));
    else setEmailHint(null);
    captureOnBlur();
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && !isAllowedReceiptFile(file)) {
      toast.error("Please upload a receipt image (PNG, JPG, HEIC) or PDF.");
      return;
    }
    setUploadingReceipt(true);
    const toastId = toast.loading("Uploading receipt...");
    try {
      const body = new FormData();
      body.append("file", file);
      if (form.paymentReference && form.paymentReference.startsWith("http")) {
        body.append("previousUrl", form.paymentReference);
      }
      const { response, data } = await fetchActionJson<{ error: string; url: string }>(
        "/api/summer-school/receipt",
        { method: "POST", body },
        "The upload is taking longer than expected. Please try again.",
      );
      if (!response.ok || typeof data.url !== "string") {
        if (response.status >= 500) console.error("Receipt upload failed", { status: response.status, data });
        toast.error(response.status < 500 && typeof data.error === "string" ? data.error : "We could not upload the receipt. Please try again.", { id: toastId });
        return;
      }
      setForm((prev) => ({ ...prev, paymentReference: data.url }));
      toast.success("Receipt uploaded successfully!", { id: toastId });
    } catch (err: unknown) {
      console.error("Receipt upload request failed", err);
      toast.error(err instanceof Error && err.message.includes("taking longer") ? err.message : "We could not upload the receipt. Check your connection and try again.", { id: toastId });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleReceiptRemove = async () => {
    if (!form.paymentReference || !form.paymentReference.startsWith("http")) return;

    const toastId = toast.loading("Removing receipt screenshot...");
    try {
      const { response, data } = await fetchActionJson<{ error: string }>(
        `/api/summer-school/receipt?url=${encodeURIComponent(form.paymentReference)}`,
        { method: "DELETE" },
        "Removing the receipt is taking longer than expected. Please try again.",
      );
      if (!response.ok) {
        if (response.status >= 500) console.error("Receipt removal failed", { status: response.status, data });
        toast.error(response.status < 500 && typeof data.error === "string" ? data.error : "We could not remove the receipt. Please try again.", { id: toastId });
        return;
      }

      setForm((prev) => ({ ...prev, paymentReference: "" }));
      toast.success("Receipt screenshot removed successfully!", { id: toastId });
    } catch (err: unknown) {
      console.error("Receipt remove error:", err);
      toast.error(err instanceof Error && err.message.includes("taking longer") ? err.message : "We could not remove the receipt. Check your connection and try again.", { id: toastId });
    }
  };

  const resetForm = useCallback(() => {
    setForm(EMPTY_SUMMER_FORM);
    setAttempted(false);
    setEmailHint(null);
    setRestored(false);
  }, []);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
    resetForm();
  }, [lsKey, resetForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingReceipt || submitLocked) {
      toast.error(uploadingReceipt
        ? "Please wait for your receipt upload to finish."
        : "Your registration is already being submitted.");
      return;
    }
    if (!canSubmit) {
      setAttempted(true);
      toast.error("Please fill in all required fields correctly.");
      return;
    }
    setLoading(true);
    setSubmitLocked(true);
    captureSubmitted();
    try {
      const effectivePaymentMethod = isNativeApp ? "paystack" : form.paymentMethod;
      const consentNotes = `[Parental Consent: Yes] [WhatsApp Opt-in: ${form.whatsappConsent ? "Yes" : "No"}]`;
      const fullNotes = `[Track Choice: Full AI Explorer (All Tracks)] [Plan: ${form.paymentPlan}] [Method: ${effectivePaymentMethod}] ${form.paymentReference ? `[Ref: ${form.paymentReference}]` : ""} ${consentNotes} ${form.additionalInfo}`;

      const { response, data } = await fetchActionJson<{
        error: string;
        paymentUrl: string;
        paymentEmailSent: boolean;
        paymentEmailError: string;
        effectivePlan: string;
        reference: string;
        amountPaid: number;
        totalTuition: number;
        balanceDue: number;
      }>("/api/summer-school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: form.studentName,
          parent_name: form.parentName,
          parent_phone: form.phone,
          parent_email: form.email,
          student_phone: form.studentPhone,
          school: form.school || undefined,
          current_class: form.currentClass || undefined,
          age: parseInt(form.age, 10),
          gender: form.gender,
          preferred_mode: form.preferredMode,
          hear_about_us: form.hearAboutUs || undefined,
          additional_info: fullNotes.trim(),
          payment_method: effectivePaymentMethod,
          payment_plan: form.paymentPlan,
          payment_reference: form.paymentReference || undefined,
          transfer_amount: form.paymentMethod === "bank_transfer" ? form.transferAmount : undefined,
          parent_consent: form.parentConsent,
          whatsapp_consent: form.whatsappConsent,
          is_app_enrolment: isNativeApp,
          special_program_id: specialProgramId || undefined,
          special_program_slug: specialProgramSlug || undefined,
        }),
      }, "Registration is taking longer than expected. Your draft is saved, so please try again.");
      if (!response.ok) {
        if (response.status >= 500) console.error("Summer registration failed", { status: response.status, data });
        toast.error(response.status < 500 && typeof data.error === "string"
          ? data.error
          : "We could not complete registration just now. Your draft is saved; please try again.");
        return;
      }

      try { localStorage.removeItem(lsKey); } catch { /* ignore */ }

      const paymentEmailFailed = data.paymentEmailSent !== true;
      if (paymentEmailFailed && data.paymentEmailError) {
        console.warn("Registration payment email was not delivered", data.paymentEmailError);
      }
      const savedRegistration: SummerSuccessInfo = {
        studentName: form.studentName,
        parentPhone: form.phone,
        plan: data.effectivePlan || form.paymentPlan,
        method: effectivePaymentMethod,
        reference: typeof data.reference === "string" ? data.reference : "Registration saved",
        parentEmail: form.email.trim().toLowerCase(),
        paymentEmailSent: data.paymentEmailSent === true,
        paymentEmailError: paymentEmailFailed
          ? "Registration is saved, but the payment email has not arrived yet. Use Resend or contact support for help."
          : null,
        amountPaid: typeof data.amountPaid === "number" ? data.amountPaid : undefined,
        totalTuition: typeof data.totalTuition === "number" ? data.totalTuition : undefined,
        balanceDue: typeof data.balanceDue === "number" ? data.balanceDue : undefined,
        effectivePlan: typeof data.effectivePlan === "string" ? data.effectivePlan : form.paymentPlan,
      };

      if (data.paymentUrl && !isNativeApp) {
        capturePaymentStarted();
        toast.message("Redirecting to secure checkout…");
        window.location.href = data.paymentUrl;
        return;
      }

      if (effectivePaymentMethod === "paystack" && !isNativeApp) {
        setSuccessInfo(savedRegistration);
        setIsSuccess(true);
        toast.warning(data.paymentEmailSent === true
          ? "Registration saved. We emailed you a secure payment link."
          : "Registration saved. Use Resend on the confirmation screen to request a payment link.");
        return;
      }

      setSuccessInfo(savedRegistration);
      setIsSuccess(true);
      if (isNativeApp && data.paymentEmailSent !== true) {
        toast.warning("Registration saved, but the payment email was not delivered. Use Resend on the confirmation screen.");
      } else {
        toast.success(
          isNativeApp
            ? "Registration saved. Check your email for the next step."
            : effectivePaymentMethod === "bank_transfer"
              ? form.paymentReference.startsWith("http")
                ? "Registration submitted with receipt. We'll verify your payment shortly."
                : "Registration submitted. We'll verify your bank transfer shortly."
              : "Registration submitted successfully.",
        );
      }
      if (effectivePaymentMethod === "bank_transfer" && data.paymentEmailSent !== true) {
        toast.warning("Registration saved, but the confirmation email could not be sent. Keep your reference and contact support if needed.");
      }
    } catch (err: unknown) {
      console.error("Summer registration request failed", err);
      toast.error(err instanceof Error && err.message.includes("taking longer")
        ? err.message
        : "We could not reach the registration service. Your draft is saved; check your connection and try again.");
    } finally {
      setLoading(false);
      setSubmitLocked(false);
    }
  };

  return {
    form,
    setForm,
    loading,
    bankAccounts,
    isSuccess,
    setIsSuccess,
    successInfo,
    setSuccessInfo,
    attempted,
    setAttempted,
    emailHint,
    setEmailHint,
    schoolsList,
    focusedSchoolIdx,
    setFocusedSchoolIdx,
    uploadingReceipt,
    restored,
    whatsappGroupLink,
    tuition,
    tuitionNumbers,
    bankTransferSettlement,
    canSubmit,
    handleChange,
    handlePhoneBlur,
    handleStudentPhoneBlur,
    handleEmailBlur,
    handleReceiptUpload,
    handleReceiptRemove,
    handleSubmit,
    resetForm,
    clearDraft,
    receiptInputId,
    receiptAccept: receiptAcceptAttribute(),
  };
}

export function summerFormStyles(variant: "page" | "popup") {
  const compact = variant === "popup";
  return {
    inputCls: (err?: boolean) =>
      compact
        ? `w-full bg-card border ${err ? "border-rose-500 ring-1 ring-rose-500/30" : "border-border"} px-4 py-3 text-foreground text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/40 rounded-xl`
        : `w-full bg-card border ${err ? "border-rose-500 ring-1 ring-rose-500/30" : "border-border"} px-5 py-4 text-foreground text-sm font-medium focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/40 rounded-xl`,
    labelCls: (err?: boolean) =>
      `block ${compact ? "text-[9px]" : "text-[10px]"} font-black ${err ? "text-rose-500" : "text-muted-foreground"} uppercase tracking-widest ${compact ? "mb-1.5" : "mb-2"}`,
    errText: compact ? "text-rose-500 text-[9px] font-bold mt-1" : "text-rose-500 text-[10px] font-bold mt-1",
  };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  formatWhatsApp,
  isValidWhatsApp,
  suggestEmail,
  fetchActiveSchoolNames,
} from "@/lib/form-helpers";
import { tuitionLabels } from "@/lib/summer-school/pricing";

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
};

export type SummerSuccessInfo = {
  studentName: string;
  parentPhone: string;
  plan: string;
  method: string;
  reference: string;
  paymentVerified?: boolean;
};

type UseSummerSchoolRegistrationOptions = {
  lsKey: string;
  receiptInputId?: string;
};

export function useSummerSchoolRegistration({ lsKey, receiptInputId = "ss-receipt-upload" }: UseSummerSchoolRegistrationOptions) {
  const { user, profile } = useAuth();
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
  const [restored, setRestored] = useState(false);
  const [whatsappGroupLink, setWhatsappGroupLink] = useState<string | null>(null);

  const tuition = tuitionLabels(form.preferredMode);

  const canSubmit =
    form.studentName.trim() &&
    form.parentName.trim() &&
    form.phone.trim() &&
    isValidWhatsApp(form.phone) &&
    form.studentPhone.trim() &&
    isValidWhatsApp(form.studentPhone) &&
    form.email.trim() &&
    form.currentClass &&
    form.age &&
    parseInt(form.age, 10) >= 8 &&
    parseInt(form.age, 10) <= 18 &&
    form.gender &&
    form.preferredMode &&
    (form.paymentMethod !== "bank_transfer" || form.paymentReference.trim());

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
                bank_name: "Zenith Bank",
                account_number: "1215267233",
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
    const { name, value } = e.target;
    if (name === "email") setEmailHint(null);
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhoneBlur = () => {
    if (form.phone) setForm((prev) => ({ ...prev, phone: formatWhatsApp(prev.phone) }));
  };

  const handleStudentPhoneBlur = () => {
    if (form.studentPhone) setForm((prev) => ({ ...prev, studentPhone: formatWhatsApp(prev.studentPhone) }));
  };

  const handleEmailBlur = () => {
    if (form.email) setEmailHint(suggestEmail(form.email));
    else setEmailHint(null);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPG, JPEG).");
      return;
    }
    setUploadingReceipt(true);
    const toastId = toast.loading("Uploading receipt...");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/summer-school/receipt", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setForm((prev) => ({ ...prev, paymentReference: data.url }));
      toast.success("Receipt uploaded successfully!", { id: toastId });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload receipt.", { id: toastId });
    } finally {
      setUploadingReceipt(false);
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
    if (!canSubmit) {
      setAttempted(true);
      toast.error("Please fill in all required fields correctly.");
      return;
    }
    setLoading(true);
    try {
      const fullNotes = `[Track Choice: Full AI Explorer (All Tracks)] [Plan: ${form.paymentPlan}] [Method: ${form.paymentMethod}] ${form.paymentReference ? `[Ref: ${form.paymentReference}]` : ""} ${form.additionalInfo}`;

      const res = await fetch("/api/summer-school", {
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
          payment_method: form.paymentMethod,
          payment_plan: form.paymentPlan,
          payment_reference: form.paymentReference || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      try { localStorage.removeItem(lsKey); } catch { /* ignore */ }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      setSuccessInfo({
        studentName: form.studentName,
        parentPhone: form.phone,
        plan: form.paymentPlan,
        method: form.paymentMethod,
        reference: data.reference,
      });
      setIsSuccess(true);
      toast.success("Registration submitted. Our team will verify your payment shortly.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
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
    canSubmit,
    handleChange,
    handlePhoneBlur,
    handleStudentPhoneBlur,
    handleEmailBlur,
    handleReceiptUpload,
    handleSubmit,
    resetForm,
    clearDraft,
    receiptInputId,
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

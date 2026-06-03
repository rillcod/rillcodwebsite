import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEmail } from "@/lib/validation";

/** Format a raw phone input to standard Nigerian WhatsApp format (+234…). */
export function formatWhatsApp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234") && digits.length >= 4) return "+" + digits;
  if (digits.startsWith("0") && digits.length >= 2) return "+234" + digits.slice(1);
  return "+234" + digits;
}

/** True when value is a valid Nigerian WhatsApp number (+234 + 10 digits). */
export function isValidWhatsApp(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.startsWith("234") && digits.length === 13;
}

const EMAIL_TYPOS: Record<string, string> = {
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmaill.com": "gmail.com",
  "yaoo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhaoo.com": "yahoo.com",
  "yaho.co": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "icolud.com": "icloud.com",
  "icoud.com": "icloud.com",
};

/** Suggest a corrected email when the domain matches a common typo. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const fix = EMAIL_TYPOS[domain];
  if (!fix) return null;
  return email.slice(0, at + 1) + fix;
}

/** Load active school names for autocomplete suggestions. */
export async function fetchActiveSchoolNames(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("schools")
    .select("name")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .order("name");

  return (data ?? []).map((s) => s.name).filter(Boolean);
}

const SUMMER_MODES = new Set(["Online", "Onsite", "Hybrid"]);
const SUMMER_PAYMENT_METHODS = new Set(["paystack", "bank_transfer"]);
const SUMMER_PAYMENT_PLANS = new Set(["full", "installment"]);

export type SummerSchoolPayload = {
  student_name?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  student_phone?: string;
  age?: number | string;
  preferred_mode?: string;
  payment_method?: string;
  payment_plan?: string;
  payment_reference?: string;
};

/** Returns an error message when the payload fails validation, otherwise null. */
export function validateSummerSchoolPayload(body: SummerSchoolPayload): string | null {
  const studentName = body.student_name?.trim();
  const parentName = body.parent_name?.trim();
  const parentPhone = body.parent_phone?.trim();
  const studentPhone = body.student_phone?.trim();
  const parentEmail = body.parent_email?.trim();

  if (!studentName || !parentName || !parentPhone || !studentPhone) {
    return "Student name, parent name, parent phone, and student phone are required";
  }
  if (!parentEmail) {
    return "Parent email is required";
  }
  if (!validateEmail(parentEmail)) {
    return "Please provide a valid parent email address";
  }
  if (!isValidWhatsApp(parentPhone)) {
    return "Parent phone must be a valid Nigerian WhatsApp number";
  }
  if (!isValidWhatsApp(studentPhone)) {
    return "Student phone must be a valid Nigerian WhatsApp number";
  }

  const age = typeof body.age === "number" ? body.age : parseInt(String(body.age ?? ""), 10);
  if (!Number.isFinite(age) || age < 8 || age > 18) {
    return "Student age must be between 8 and 18";
  }

  if (!body.preferred_mode || !SUMMER_MODES.has(body.preferred_mode)) {
    return "Attendance mode is required";
  }
  if (!body.payment_method || !SUMMER_PAYMENT_METHODS.has(body.payment_method)) {
    return "Payment method is required";
  }
  if (!body.payment_plan || !SUMMER_PAYMENT_PLANS.has(body.payment_plan)) {
    return "Payment plan is required";
  }
  if (body.payment_method === "bank_transfer" && !body.payment_reference?.trim()) {
    return "Bank transfer reference or receipt is required";
  }

  return null;
}

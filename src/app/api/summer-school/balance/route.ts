import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { getSummerSchoolAdminClient } from "@/lib/summer-school/admin";
import {
  getSummerBalanceDueFromTotal,
  formatNaira,
  resolveLockedTuitionTotal,
} from "@/lib/summer-school/pricing";
import { checkCustomRateLimit } from "@/proxies/rateLimit.proxy";
import { RateLimitError } from "@/lib/errors";
import { validateEmail } from "@/lib/validation";
import { SPECIAL_BALANCE_PATH, SPECIAL_BALANCE_PAYMENT_TYPE } from "@/lib/registration/enrollment-types";

async function findPartialProspect(email: string) {
  const supabase = getSummerSchoolAdminClient();
  const { data } = await supabase
    .from("prospective_students")
    .select("*")
    .eq("parent_email", email)
    .in("status", ["partially_paid", "paid"])
    .eq("is_deleted", false)
    .ilike("course_interest", "%Summer School%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getAmountPaid(prospectId: string): Promise<number> {
  const supabase = getSummerSchoolAdminClient();
  const { data: txs } = await supabase
    .from("payment_transactions")
    .select("amount")
    .contains("payment_gateway_response", { prospect_id: prospectId })
    .in("payment_status", ["completed", "success", "paid"]);

  if (!txs?.length) return 0;

  return txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

/** Prefer total_tuition stamped when they first paid (locks legacy ₦50k quotes). */
async function getLockedTuitionFromPayments(prospectId: string): Promise<number | null> {
  const supabase = getSummerSchoolAdminClient();
  const { data: txs } = await supabase
    .from("payment_transactions")
    .select("payment_gateway_response, created_at")
    .contains("payment_gateway_response", { prospect_id: prospectId })
    .order("created_at", { ascending: true })
    .limit(20);

  for (const tx of txs ?? []) {
    const meta = (tx.payment_gateway_response || {}) as Record<string, unknown>;
    const locked = Number(meta.total_tuition);
    if (Number.isFinite(locked) && locked > 0) return locked;
  }
  return null;
}

async function getSpecialPageTuition(notes: string | null, preferredMode: string): Promise<number | null> {
  if (!notes) return null;
  const match = notes.match(/\[SpecialPage:\s*([0-9a-fA-F-]{36})\]/);
  if (!match) return null;
  
  try {
    const supabase = getSummerSchoolAdminClient();
    const { data } = await supabase
      .from("special_program_pages")
      .select("online_fee, onsite_fee")
      .eq("id", match[1])
      .maybeSingle();
      
    if (data) {
      return preferredMode === 'Onsite' ? Number(data.onsite_fee) : Number(data.online_fee);
    }
  } catch (err) {
    console.error("Failed to fetch special page tuition from DB:", err);
  }
  return null;
}

function resolveProspectTuition(preferredMode: string, amountPaid: number, locked: number | null) {
  return resolveLockedTuitionTotal({ preferredMode, amountPaid, lockedFromPayments: locked });
}

/** GET /api/summer-school/balance?email=parent@example.com */
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email || !validateEmail(email)) {
    return NextResponse.json({ error: "Valid parent email is required" }, { status: 400 });
  }

  const prospect = await findPartialProspect(email);
  if (!prospect) {
    return NextResponse.json({ error: "No outstanding balance found for this email" }, { status: 404 });
  }

  const preferredMode = prospect.preferred_schedule || "Online";
  const amountPaid = await getAmountPaid(prospect.id);
  const locked = await getLockedTuitionFromPayments(prospect.id);
  const dbTuition = await getSpecialPageTuition(prospect.notes, preferredMode);
  const total = locked || dbTuition || resolveProspectTuition(preferredMode, amountPaid, locked);
  const balanceDue = getSummerBalanceDueFromTotal(total, amountPaid);

  if (balanceDue <= 0) {
    return NextResponse.json({
      studentName: prospect.full_name,
      status: "paid",
      totalTuition: total,
      amountPaid,
      balanceDue: 0,
    });
  }

  return NextResponse.json({
    studentName: prospect.full_name,
    status: "partially_paid",
    totalTuition: total,
    amountPaid,
    balanceDue,
    balanceLabel: formatNaira(balanceDue),
    preferredMode,
  });
}

/** POST /api/summer-school/balance — initialize Paystack for remaining tuition */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !validateEmail(email)) {
      return NextResponse.json({ error: "Valid parent email is required" }, { status: 400 });
    }

    try {
      await checkCustomRateLimit({ key: `ss-balance:${email}`, max: 5, window: 600 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
      }
      throw err;
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: "Payment gateway is not configured" }, { status: 500 });
    }

    const prospect = await findPartialProspect(email);
    if (!prospect) {
      return NextResponse.json({ error: "No outstanding balance found for this email" }, { status: 404 });
    }

    const preferredMode = prospect.preferred_schedule || "Online";
    const amountPaid = await getAmountPaid(prospect.id);
    const locked = await getLockedTuitionFromPayments(prospect.id);
    const dbTuition = await getSpecialPageTuition(prospect.notes, preferredMode);
    const totalTuition = locked || dbTuition || resolveProspectTuition(preferredMode, amountPaid, locked);
    const balanceDue = getSummerBalanceDueFromTotal(totalTuition, amountPaid);

    if (balanceDue <= 0) {
      return NextResponse.json({ error: "Tuition is already fully paid" }, { status: 400 });
    }

    const reference = `SUM-BAL-${Date.now()}-${prospect.id.substring(0, 6)}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.rillcod.com";

    const supabase = getSummerSchoolAdminClient();
    const { data: tx } = await supabase
      .from("payment_transactions")
      .insert({
        portal_user_id: null,
        school_id: null,
        course_id: null,
        amount: balanceDue,
        currency: "NGN",
        payment_method: "paystack",
        payment_status: "pending",
        transaction_reference: reference,
        payment_gateway_response: {
          prospect_id: prospect.id,
          student_name: prospect.full_name,
          parent_email: email,
          payment_type: SPECIAL_BALANCE_PAYMENT_TYPE,
          preferred_mode: preferredMode,
          balance_payment: true,
          total_tuition: totalTuition,
        },
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: balanceDue * 100,
        reference,
        callback_url: `${baseUrl}${SPECIAL_BALANCE_PATH}?payment=success&reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(email)}`,
        metadata: {
          prospect_id: prospect.id,
          student_name: prospect.full_name,
          payment_type: SPECIAL_BALANCE_PAYMENT_TYPE,
          transaction_id: tx?.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackData.status) {
      if (tx?.id) await supabase.from("payment_transactions").delete().eq("id", tx.id);
      return NextResponse.json(
        { error: paystackData.message || "Payment gateway failed to initialize" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paystackData.data.authorization_url,
      reference,
      balanceDue,
      balanceLabel: formatNaira(balanceDue),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    console.error("Summer school balance payment error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

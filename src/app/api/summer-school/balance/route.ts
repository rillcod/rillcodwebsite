import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { getSummerSchoolAdminClient } from "@/lib/summer-school/admin";
import {
  getSummerBalanceDue,
  getSummerTotalTuition,
  formatNaira,
} from "@/lib/summer-school/pricing";
import { checkCustomRateLimit } from "@/proxies/rateLimit.proxy";
import { RateLimitError } from "@/lib/errors";
import { validateEmail } from "@/lib/validation";

async function findPartialProspect(email: string) {
  const supabase = getSummerSchoolAdminClient();
  const { data } = await supabase
    .from("prospective_students")
    .select("*")
    .eq("parent_email", email)
    .eq("status", "partially_paid")
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
    .select("amount, payment_status, payment_gateway_response")
    .eq("payment_status", "completed")
    .order("created_at", { ascending: false });

  if (!txs?.length) return 0;

  for (const tx of txs) {
    const gw = (tx.payment_gateway_response ?? {}) as Record<string, unknown>;
    if (gw.prospect_id === prospectId) {
      return Number(tx.amount) || 0;
    }
  }
  return 0;
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
  const total = getSummerTotalTuition(preferredMode);
  const balanceDue = getSummerBalanceDue(preferredMode, amountPaid);

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
    const balanceDue = getSummerBalanceDue(preferredMode, amountPaid);

    if (balanceDue <= 0) {
      return NextResponse.json({ error: "Tuition is already fully paid" }, { status: 400 });
    }

    const supabase = getSummerSchoolAdminClient();
    const reference = `SUM-BAL-${Date.now()}-${prospect.id.substring(0, 6)}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.rillcod.com";

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
          payment_type: "summer_school_balance",
          preferred_mode: preferredMode,
          balance_payment: true,
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
        callback_url: `${baseUrl}/summer-school/pay-balance?payment=success&reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(email)}`,
        metadata: {
          prospect_id: prospect.id,
          student_name: prospect.full_name,
          payment_type: "summer_school_balance",
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

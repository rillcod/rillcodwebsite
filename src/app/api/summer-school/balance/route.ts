import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { getSummerSchoolAdminClient } from "@/lib/summer-school/admin";
import { findProspectForBalancePayment } from "@/lib/summer-school/balance-prospect";
import { checkCustomRateLimit } from "@/proxies/rateLimit.proxy";
import { RateLimitError } from "@/lib/errors";
import { validateEmail } from "@/lib/validation";
import { SPECIAL_BALANCE_PATH, SPECIAL_BALANCE_PAYMENT_TYPE } from "@/lib/registration/enrollment-types";

/** GET /api/summer-school/balance?email=parent@example.com */
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email || !validateEmail(email)) {
    return NextResponse.json({ error: "Valid parent email is required" }, { status: 400 });
  }

  const match = await findProspectForBalancePayment(email);
  if (!match) {
    return NextResponse.json(
      {
        error:
          "No outstanding balance found for this email. If you paid a deposit, use the same parent email from registration. Contact support if you need help.",
      },
      { status: 404 },
    );
  }

  const { prospect, amountPaid, totalTuition, balanceDue, balanceLabel, preferredMode } = match;

  if (balanceDue <= 0) {
    return NextResponse.json({
      studentName: prospect.full_name,
      status: "paid",
      totalTuition,
      amountPaid,
      balanceDue: 0,
    });
  }

  return NextResponse.json({
    studentName: prospect.full_name,
    status: "partially_paid",
    totalTuition,
    amountPaid,
    balanceDue,
    balanceLabel,
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
      return NextResponse.json(
        { error: "Online payment is temporarily unavailable. Please contact support to complete payment." },
        { status: 503 },
      );
    }

    const match = await findProspectForBalancePayment(email);
    if (!match) {
      return NextResponse.json(
        {
          error:
            "No outstanding balance found for this email. Use the parent email from your registration form.",
        },
        { status: 404 },
      );
    }

    const { prospect, balanceDue, balanceLabel, preferredMode, totalTuition } = match;

    if (balanceDue <= 0) {
      return NextResponse.json({ error: "Tuition is already fully paid — thank you!" }, { status: 400 });
    }

    const reference = `SUM-BAL-${Date.now()}-${prospect.id.substring(0, 6)}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.rillcod.com";

    const supabase = getSummerSchoolAdminClient();
    const { data: tx, error: txErr } = await supabase
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

    if (txErr || !tx?.id) {
      console.error("[summer-school/balance] pending tx insert failed:", txErr);
      return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 500 });
    }

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
          transaction_id: tx.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackData.status || !paystackData.data?.authorization_url) {
      await supabase.from("payment_transactions").delete().eq("id", tx.id);
      return NextResponse.json(
        {
          error:
            paystackData.message ||
            "Payment gateway did not respond. Your balance is saved — please try again in a moment.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paystackData.data.authorization_url,
      reference,
      balanceDue,
      balanceLabel,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    console.error("Summer school balance payment error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

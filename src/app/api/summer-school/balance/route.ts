import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { getSummerSchoolAdminClient } from "@/lib/summer-school/admin";
import { findProspectForBalancePayment } from "@/lib/summer-school/balance-prospect";
import { checkCustomRateLimit, getClientIp } from "@/proxies/rateLimit.proxy";
import { RateLimitError } from "@/lib/errors";
import { validateEmail } from "@/lib/validation";
import { SPECIAL_BALANCE_PATH, SPECIAL_BALANCE_PAYMENT_TYPE } from "@/lib/registration/enrollment-types";
import { createPendingPayment } from "@/lib/payments/pending-transaction";
import { parseBankTransferReference } from "@/lib/summer-school/receipt-upload";
import { sendRegistrationPaymentEmail } from "@/lib/registration/payment-link-email";
import { notifySpecialProgramAdminOps } from "@/lib/summer-school/admin-ops-notify";
import {
  bankTransferProofMatches,
  buildBalancePaymentGatewayMeta,
  resolveBalancePaymentCharge,
} from "@/lib/summer-school/registration-intake";

/**
 * Enough for a parent to recognise their own child, not enough to harvest.
 *
 * This endpoint takes an unauthenticated email and answers with who is
 * registered — so it doubles as a lookup table for anyone working through a
 * list of addresses. A parent only needs to confirm they are paying for the
 * right child, and a first name plus an initial does that.
 */
function maskLearnerName(fullName: string | null | undefined): string {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Your child';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** GET /api/summer-school/balance?email=parent@example.com */
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email || !validateEmail(email)) {
    return NextResponse.json({ error: "Valid parent email is required" }, { status: 400 });
  }

  // POST was rate limited and GET was not, which left the cheaper, more
  // useful call — the one that answers "is this address a customer, and what
  // is the child called" — completely open.
  const ip = getClientIp(req);
  try {
    if (ip !== '127.0.0.1') {
      await checkCustomRateLimit({ key: `ss-balance-lookup-ip:${ip}`, max: 12, window: 600 });
    }
    await checkCustomRateLimit({ key: `ss-balance-lookup:${email}`, max: 5, window: 600 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Too many lookups. Please wait a moment and try again." },
        { status: 429 },
      );
    }
    throw err;
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
      studentName: maskLearnerName(prospect.full_name),
      status: "paid",
      totalTuition,
      amountPaid,
      balanceDue: 0,
    });
  }

  return NextResponse.json({
    studentName: maskLearnerName(prospect.full_name),
    status: "partially_paid",
    totalTuition,
    amountPaid,
    balanceDue,
    balanceLabel,
    preferredMode,
  });
}

/** POST /api/summer-school/balance — Paystack or bank transfer for remaining tuition */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const paymentMethod = String(body.payment_method || "paystack").trim().toLowerCase();
    const paymentReference = body.payment_reference != null ? String(body.payment_reference) : undefined;
    const transferAmount = body.transfer_amount;

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

    const { prospect, balanceDue, balanceLabel, preferredMode, totalTuition, amountPaid } = match;

    if (balanceDue <= 0) {
      return NextResponse.json({ error: "Tuition is already fully paid — thank you!" }, { status: 400 });
    }

    const chargeResult = resolveBalancePaymentCharge({
      paymentMethod,
      outstandingBalance: balanceDue,
      totalTuition,
      amountPaidSoFar: amountPaid,
      transferAmount,
    });
    if (!chargeResult.ok) {
      return NextResponse.json({ error: chargeResult.error }, { status: 400 });
    }
    const { chargeAmount, balanceDue: balanceAfter } = chargeResult.charge;

    const gatewayMeta = buildBalancePaymentGatewayMeta({
      prospectId: prospect.id,
      studentName: prospect.full_name,
      parentEmail: email,
      preferredMode,
      totalTuition,
      amountPaidSoFar: amountPaid,
      charge: chargeResult.charge,
    });

    const supabase = getSummerSchoolAdminClient();

    if (paymentMethod === "bank_transfer") {
      const parsedRef = parseBankTransferReference(paymentReference);
      if (!parsedRef.ok) {
        return NextResponse.json({ error: parsedRef.error }, { status: 400 });
      }

      const { data: recentPending } = await supabase
        .from("payment_transactions")
        .select("id, transaction_reference, payment_gateway_response, created_at, payment_status")
        .contains("payment_gateway_response", { prospect_id: prospect.id, balance_payment: true })
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const recentMeta = (recentPending?.payment_gateway_response || {}) as Record<string, unknown>;
      const recentAgeMs = recentPending?.created_at
        ? Date.now() - new Date(recentPending.created_at).getTime()
        : Number.POSITIVE_INFINITY;
      const sameProof = bankTransferProofMatches(recentMeta, {
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        chargeAmount,
      });
      if (recentPending && recentAgeMs < 5 * 60 * 1000 && sameProof) {
        return NextResponse.json({
          success: true,
          reference: recentPending.transaction_reference,
          paymentMethod: "bank_transfer",
          receiptUploaded: Boolean(parsedRef.receiptUrl),
          amountPaid: chargeAmount,
          totalTuition,
          balanceDue: balanceAfter,
          message: "Balance payment already submitted. Our team is verifying your transfer.",
          idempotent: true,
        });
      }

      const txReference = parsedRef.receiptUrl
        ? `RCPT-BAL-${Date.now()}-${prospect.id.substring(0, 6)}`
        : parsedRef.transferReference!;

      const pending = await createPendingPayment(supabase as any, {
        amount: chargeAmount,
        currency: "NGN",
        method: "bank_transfer",
        reference: txReference,
        subject: { type: "prospect", id: prospect.id },
        metadata: {
          ...gatewayMeta,
          receipt_url: parsedRef.receiptUrl,
          transfer_reference: parsedRef.transferReference,
        },
      });
      if (!pending.ok) {
        return NextResponse.json(
          { error: pending.error.message },
          { status: pending.error.code === "conflict" ? 409 : 500 },
        );
      }

      await notifySpecialProgramAdminOps({
        studentName: prospect.full_name,
        parentEmail: email,
        amount: chargeAmount,
        method: "Bank transfer — balance payment (pending verification)",
        reference: txReference,
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        totalTuition,
        balanceDue: balanceAfter,
        context: "balance",
      });

      const emailDelivery = await sendRegistrationPaymentEmail({
        supabase,
        subjectId: prospect.id,
        reference: txReference,
        parentEmail: email,
        studentName: prospect.full_name,
        amount: chargeAmount,
        totalTuition,
        balanceDue: balanceAfter,
        paymentMethod: "bank_transfer",
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        balancePageKind: 'special',
      });

      return NextResponse.json({
        success: true,
        reference: txReference,
        paymentMethod: "bank_transfer",
        receiptUploaded: Boolean(parsedRef.receiptUrl),
        paymentEmailSent: emailDelivery.delivered,
        paymentEmailError: emailDelivery.error ?? null,
        amountPaid: chargeAmount,
        totalTuition,
        balanceDue: balanceAfter,
        message: parsedRef.receiptUrl
          ? "Balance payment submitted with receipt. Our team will verify your transfer shortly."
          : "Balance payment submitted. Our team will verify your bank transfer reference shortly.",
      });
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Online payment is temporarily unavailable. Please contact support or pay by bank transfer." },
        { status: 503 },
      );
    }

    const reference = `SUM-BAL-${Date.now()}-${prospect.id.substring(0, 6)}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.rillcod.com";

    // Retire earlier unfinished attempts, the way registration already does.
    // Without this every abandoned checkout stayed 'pending' forever, so a
    // parent who tried twice left two live-looking links behind — and once
    // their balance changed, those links were for an amount they no longer
    // owed. Nothing consumes a pending row, but they misread as money in
    // flight and they cannot be paid.
    const { error: supersedeError } = await supabase
      .from("payment_transactions")
      .update({ payment_status: "failed", updated_at: new Date().toISOString() })
      .eq("payment_status", "pending")
      .contains("payment_gateway_response", { prospect_id: prospect.id, balance_payment: true });
    if (supersedeError) {
      console.error("[summer-school/balance] could not retire earlier attempts:", supersedeError);
    }

    const { data: tx, error: txErr } = await supabase
      .from("payment_transactions")
      .insert({
        portal_user_id: null,
        school_id: null,
        course_id: null,
        amount: chargeAmount,
        currency: "NGN",
        payment_method: "paystack",
        payment_status: "pending",
        transaction_reference: reference,
        payment_gateway_response: gatewayMeta,
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
        amount: chargeAmount * 100,
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
      balanceDue: chargeAmount,
      balanceLabel,
      totalTuition,
      amountPaid,
      balanceAfter,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    console.error("Summer school balance payment error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

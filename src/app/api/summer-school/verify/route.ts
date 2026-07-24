import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { processSuccessfulPayment } from "@/lib/payments/process-successful-payment";
import { isSpecialProgramPaymentType } from "@/lib/registration/enrollment-types";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** GET /api/summer-school/verify?reference=SUM-REG-... — verify Paystack payment before showing success UI */
export async function GET(req: Request) {
  try {
    const reference = new URL(req.url).searchParams.get("reference")?.trim();
    if (!reference) {
      return NextResponse.json({ error: "Payment reference is required" }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("transaction_reference, payment_status, payment_gateway_response")
      .eq("transaction_reference", reference)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ error: "Unknown payment reference" }, { status: 404 });
    }

    const gateway = (tx.payment_gateway_response ?? {}) as Record<string, unknown>;
    const paymentType = gateway.payment_type as string | undefined;
    if (!isSpecialProgramPaymentType(paymentType)) {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: "Payment gateway is not configured" }, { status: 500 });
    }

    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } }
    );
    const paystackData = await paystackRes.json();
    const paystackStatus = paystackData?.data?.status as string | undefined;
    const verified = paystackData.status === true && paystackStatus === "success";
    if (verified && tx.payment_status !== "completed") {
      await processSuccessfulPayment(reference, "paystack", paystackData.data);
    }

    return NextResponse.json({
      ok: verified,
      status: paystackStatus ?? "unknown",
      paymentStatus: verified ? "completed" : tx.payment_status,
      studentName: (gateway.student_name as string | undefined) ?? null,
      reference,
      ...(verified ? {} : {
        error: paystackStatus === "pending"
          ? "Payment is still processing. Wait a moment and refresh — or check your email for confirmation."
          : "Payment was not successful on Paystack.",
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Verification failed";
    console.error("Summer school payment verify error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

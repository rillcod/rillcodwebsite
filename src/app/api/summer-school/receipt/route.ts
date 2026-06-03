import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { storageService } from "@/services/storage.service";
import { getSummerSchoolAdminClient } from "@/lib/summer-school/admin";
import { checkCustomRateLimit, getClientIp } from "@/proxies/rateLimit.proxy";
import { RateLimitError } from "@/lib/errors";

const MAX_BYTES = 5 * 1024 * 1024;

/** POST /api/summer-school/receipt — public receipt upload (service role, rate-limited) */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    try {
      await checkCustomRateLimit({ key: `ss-receipt:${ip}`, max: 10, window: 3600 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many uploads. Please try again later." },
          { status: 429 }
        );
      }
      throw err;
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
    const filename = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (env.R2_BUCKET_NAME) {
      await storageService.uploadFile("summer-school-receipts", filename, buffer, file.type);
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
      return NextResponse.json({
        success: true,
        url: `${baseUrl}/api/media/summer-school-receipts/${filename}`,
      });
    }

    const supabase = getSummerSchoolAdminClient();
    const path = `summer-school-receipts/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from("portfolio-images")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("Summer school receipt upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message || "Upload failed" }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from("portfolio-images").getPublicUrl(path);
    return NextResponse.json({ success: true, url: publicUrlData.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Summer school receipt route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

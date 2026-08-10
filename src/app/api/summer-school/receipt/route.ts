import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { storageService } from "@/services/storage.service";
import { getSummerSchoolAdminClient } from "@/lib/summer-school/admin";
import { isAllowedReceiptFile, isAllowedReceiptStorageUrl, publicAppBaseUrl } from "@/lib/summer-school/receipt-upload";
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
    if (!isAllowedReceiptFile(file)) {
      return NextResponse.json(
        { error: "Only receipt images (PNG, JPG, HEIC) or PDF files are allowed" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });
    }

    const previousUrl = formData.get("previousUrl");
    if (typeof previousUrl === "string" && previousUrl.startsWith("http")) {
      const parts = previousUrl.split("/");
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        try {
          if (env.R2_BUCKET_NAME) {
            await storageService.deleteFile("summer-school-receipts", lastPart);
          } else {
            const supabase = getSummerSchoolAdminClient();
            await supabase.storage
              .from("portfolio-images")
              .remove([`summer-school-receipts/${lastPart}`]);
          }
        } catch (deleteErr) {
          console.error("Failed to delete previous receipt:", deleteErr);
        }
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
    const filename = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (env.R2_BUCKET_NAME) {
      await storageService.uploadFile("summer-school-receipts", filename, buffer, file.type);
      return NextResponse.json({
        success: true,
        url: `${publicAppBaseUrl()}/api/media/summer-school-receipts/${filename}`,
      });
    }

    const supabase = getSummerSchoolAdminClient();
    const path = `summer-school-receipts/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from("portfolio-images")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("Summer school receipt upload error:", uploadError);
      return NextResponse.json({ error: "Could not upload your receipt. Please try again, or type your transfer reference instead." }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from("portfolio-images").getPublicUrl(path);
    return NextResponse.json({ success: true, url: publicUrlData.publicUrl });
  } catch (err: unknown) {
    // Public endpoint: log the detail, show parents something they can act on.
    console.error("Summer school receipt route error:", err);
    return NextResponse.json(
      { error: "Could not upload your receipt. Please try again, or type your transfer reference instead." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    try {
      await checkCustomRateLimit({ key: `ss-receipt-del:${ip}`, max: 20, window: 3600 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: "Too many delete attempts. Please try again later." },
          { status: 429 },
        );
      }
      throw err;
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url || (!url.startsWith("http") && !url.startsWith("/"))) {
      return NextResponse.json({ error: "Invalid URL provided" }, { status: 400 });
    }
    if (!isAllowedReceiptStorageUrl(url)) {
      return NextResponse.json({ error: "Receipt URL is not allowed" }, { status: 403 });
    }

    const parts = url.split("/");
    const lastPart = parts[parts.length - 1];
    if (!lastPart) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    if (env.R2_BUCKET_NAME) {
      await storageService.deleteFile("summer-school-receipts", lastPart);
    } else {
      const supabase = getSummerSchoolAdminClient();
      await supabase.storage
        .from("portfolio-images")
        .remove([`summer-school-receipts/${lastPart}`]);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Summer school receipt delete error:", err);
    return NextResponse.json(
      { error: "Could not remove the receipt. Please try again." },
      { status: 500 },
    );
  }
}

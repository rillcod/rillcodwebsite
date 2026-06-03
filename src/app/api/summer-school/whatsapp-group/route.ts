import { NextResponse } from "next/server";
import { getSummerSchoolWhatsAppLink } from "@/lib/summer-school/whatsapp-group";

/** GET /api/summer-school/whatsapp-group */
export async function GET() {
  const link = await getSummerSchoolWhatsAppLink();
  return NextResponse.json({ link });
}

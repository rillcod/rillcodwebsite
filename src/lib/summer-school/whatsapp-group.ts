import { getSummerSchoolAdminClient } from "@/lib/summer-school/admin";

const FALLBACK_LINK =
  process.env.NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP?.trim() ||
  "https://chat.whatsapp.com/ChzAUa0MYPD9pbmknSVTuP";

/** Resolve the active Summer School WhatsApp invite link from DB or env fallback. */
export async function getSummerSchoolWhatsAppLink(): Promise<string> {
  try {
    const supabase = getSummerSchoolAdminClient();
    const { data } = await supabase
      .from("whatsapp_groups")
      .select("link")
      .eq("status", "active")
      .or("name.ilike.%summer%,class_name.ilike.%summer%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const link = data?.link?.trim();
    if (link && (link.startsWith("https://chat.whatsapp.com/") || link.startsWith("https://wa.me/"))) {
      return link;
    }
  } catch {
    /* use fallback */
  }
  return FALLBACK_LINK;
}

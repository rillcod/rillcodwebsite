import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProgressPage from "./panel";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("portal_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (["admin", "teacher", "school"].includes(profile?.role ?? "")) {
      redirect("/dashboard/learner-progress?view=overview");
    }
  }
  return <ProgressPage />;
}

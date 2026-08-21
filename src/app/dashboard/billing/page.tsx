import { redirect } from "next/navigation";

export default function LegacyFinanceRedirect() {
  redirect("/dashboard/finance?workspace=settings");
}

import { redirect } from "next/navigation";

/** Raw policy JSON is an implementation detail, not a customer-facing tool. */
export default function ReportPolicyRedirect() {
  redirect("/dashboard/school-reports");
}

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard/learner-safety?view=cases");
}

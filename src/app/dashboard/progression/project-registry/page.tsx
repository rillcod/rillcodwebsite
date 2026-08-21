import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard/learner-progress?view=projects");
}

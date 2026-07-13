import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register a Learner — Kids, Teens, Adults & Individuals | Rillcod Technologies",
  description:
    "Enrol kids, teens, adults, and individual learners at Rillcod Technologies. Partner schools, online, in-person, or the featured special AI programme. Python, Scratch, Web, Robotics & AI across Edo State.",
  keywords: [
    "enroll coding Nigeria",
    "student registration STEM",
    "adult coding classes Nigeria",
    "individual learner programming",
    "coding classes for kids Benin City",
    "online school registration Nigeria",
    "special programme Rillcod",
    "AI summer school enrollment",
    "Python classes Nigeria",
  ],
  alternates: {
    canonical: "https://www.rillcod.com/student-registration",
  },
  openGraph: {
    title: "Register a Learner at Rillcod — Kids, Teens, Adults & Individuals",
    description:
      "One learner registration page for partner school, online, and in-person. Featured special programmes register on their live page.",
    url: "https://www.rillcod.com/student-registration",
  },
};

export default function StudentRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

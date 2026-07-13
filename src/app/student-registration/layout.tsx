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
      "Partner school, online, in-person, or featured special programme. Coding, STEM & AI for every age.",
    url: "https://www.rillcod.com/student-registration",
  },
};

export default function StudentRegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

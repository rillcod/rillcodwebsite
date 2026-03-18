import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Programs — Coding, Robotics & STEM Courses for Kids | Rillcod Technologies",
  description:
    "Explore Rillcod Technologies's STEM programs: ICT Fundamentals, Scratch Programming, Python, Web Development, Robotics & AI. Available in schools across Benin City, Ekpoma, Uromi, Auchi, and Edo State.",
  keywords: [
    "coding programs Nigeria",
    "STEM courses for kids",
    "Python programming kids Nigeria",
    "Scratch programming Benin City",
    "robotics course Edo State",
    "web development kids Nigeria",
    "ICT fundamentals Nigeria",
    "coding classes Ekpoma",
    "programming Uromi",
    "tech courses Auchi",
  ],
  alternates: {
    canonical: "https://rillcod.com/programs",
  },
  openGraph: {
    title: "STEM & Coding Programs for Kids — Rillcod Technologies",
    description:
      "ICT, Scratch, Python, Web Dev, Robotics & AI programs for Nigerian children. Delivered in partner schools across Benin City, Ekpoma, Uromi, and Auchi.",
    url: "https://rillcod.com/programs",
  },
};

export default function ProgramsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

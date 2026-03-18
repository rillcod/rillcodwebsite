import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curriculum — STEM & Coding Curriculum for Nigerian Schools | Rillcod Technologies",
  description:
    "Explore Rillcod Technologies's structured STEM curriculum designed for Nigerian schools. From ICT Fundamentals to advanced Python, Robotics & AI — aligned with Nigerian education standards for JSS1 to SS3.",
  keywords: [
    "STEM curriculum Nigeria",
    "coding curriculum Nigerian schools",
    "ICT curriculum Benin City",
    "programming syllabus Edo State",
    "robotics curriculum Nigeria",
    "Python curriculum kids",
    "Scratch curriculum schools",
    "technology education curriculum",
  ],
  alternates: {
    canonical: "https://rillcod.com/curriculum",
  },
  openGraph: {
    title: "STEM & Coding Curriculum — Rillcod Technologies",
    description:
      "Structured coding and STEM curriculum for JSS1 to SS3. ICT, Scratch, Python, Web Dev, Robotics & AI — aligned with Nigerian education standards.",
    url: "https://rillcod.com/curriculum",
  },
};

export default function CurriculumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Programs — STEM, AI & Coding Courses | Rillcod Technologies",
  description:
    "Explore Rillcod Technologies' 10-program STEM & AI curriculum: from Young Innovators Club (ages 6–10) through Full-Stack Development, AI Engineering, Robotics & IoT, and UI/UX Design Mastery. Delivered in partner schools across Edo State.",
  keywords: [
    "STEM programs Nigeria",
    "coding for kids Benin City",
    "AI machine learning course Nigeria",
    "full stack development bootcamp Nigeria",
    "robotics IoT engineering Edo State",
    "UI UX design course Nigeria",
    "junior tech academy",
    "data analysis python Nigeria",
    "coding classes Ekpoma Uromi Auchi",
    "tech entrepreneurship Nigeria",
    "web development bootcamp Nigeria",
    "young innovators coding club",
  ],
  alternates: {
    canonical: "https://rillcod.com/programs",
  },
  openGraph: {
    title: "10-Program STEM & AI Curriculum — Rillcod Technologies",
    description:
      "From curious beginners (age 6) to professional AI engineers — four learning tiers, ten structured programmes, delivered in partner schools across Benin City, Ekpoma, Uromi, and Auchi.",
    url: "https://rillcod.com/programs",
  },
};

export default function ProgramsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ — Frequently Asked Questions | Rillcod Technologies",
  description:
    "Find answers to common questions about Rillcod Technologies's coding and STEM programs, enrollment process, pricing, partner school requirements, and more.",
  keywords: [
    "Rillcod Technologies FAQ",
    "coding academy questions Nigeria",
    "STEM education FAQ",
    "coding classes enrollment questions",
    "school partnership FAQ",
    "kids coding program questions",
  ],
  alternates: {
    canonical: "https://rillcod.com/faq",
  },
  openGraph: {
    title: "Frequently Asked Questions — Rillcod Technologies",
    description:
      "Answers to common questions about enrollment, programs, pricing, and school partnerships at Rillcod Technologies.",
    url: "https://rillcod.com/faq",
  },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

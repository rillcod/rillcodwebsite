import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers — Join Our Team | Rillcod Academy",
  description:
    "Join Rillcod Academy's team of passionate educators and technologists. We're hiring STEM instructors, curriculum developers, and more in Benin City, Edo State, Nigeria.",
  keywords: [
    "Rillcod Academy careers",
    "STEM teaching jobs Nigeria",
    "coding instructor jobs Benin City",
    "technology education careers Edo State",
    "teaching jobs coding academy",
    "STEM educator positions Nigeria",
  ],
  alternates: {
    canonical: "https://rillcod.com/careers",
  },
  openGraph: {
    title: "Careers at Rillcod Academy — Join Our Team",
    description:
      "We're hiring passionate STEM educators and technologists in Benin City, Edo State. Shape the future of tech education in Nigeria.",
    url: "https://rillcod.com/careers",
  },
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

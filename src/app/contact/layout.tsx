import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us — Rillcod Technologies | Benin City, Edo State, Nigeria",
  description:
    "Get in touch with Rillcod Technologies. Visit us at No 26 Ogiesoba Avenue, Benin City, Edo State. Call +234 811 660 0091 or email support@rillcod.com. Partner your school or enroll your child today.",
  keywords: [
    "contact Rillcod Technologies",
    "coding academy Benin City contact",
    "STEM school phone number Nigeria",
    "Rillcod Technologies address",
    "Ogiesoba Avenue Benin City",
    "coding school Edo State contact",
  ],
  alternates: {
    canonical: "https://rillcod.com/contact",
  },
  openGraph: {
    title: "Contact Rillcod Technologies — Benin City, Edo State",
    description:
      "Reach Rillcod Technologies at No 26 Ogiesoba Avenue, Benin City. Phone: +234 811 660 0091. Email: support@rillcod.com.",
    url: "https://rillcod.com/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

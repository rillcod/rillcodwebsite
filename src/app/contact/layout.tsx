import type { Metadata } from "next";
import { brandContact } from '@/config/brand';

export const metadata: Metadata = {
  title: "Contact Us — Rillcod Technologies | Benin City, Edo State, Nigeria",
  description:
    `Get in touch with Rillcod Technologies. Visit us at ${brandContact.address}. Call ${brandContact.phone} or email ${brandContact.email}. Partner your school or enroll your child today.`,
  keywords: [
    "contact Rillcod Technologies",
    "coding academy Benin City contact",
    "STEM school phone number Nigeria",
    "Rillcod Technologies address",
    "Ogiesoba Avenue Benin City",
    "coding school Edo State contact",
  ],
  alternates: {
    canonical: "https://www.rillcod.com/contact",
  },
  openGraph: {
    title: "Contact Rillcod Technologies — Benin City, Edo State",
    description:
      `Reach Rillcod Technologies at ${brandContact.address}. Phone: ${brandContact.phone}. Email: ${brandContact.email}.`,
    url: "https://www.rillcod.com/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

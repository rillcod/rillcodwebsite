import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/layout/AppProviders";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rillcod Academy — Nigeria's Leading STEM & Coding Academy",
  description: "Rillcod Academy empowers Nigerian children with hands-on coding, robotics, and STEM skills. Delivered in partner schools across Nigeria from JSS1 to SS3.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0f0f1a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0f0f1a] text-white`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

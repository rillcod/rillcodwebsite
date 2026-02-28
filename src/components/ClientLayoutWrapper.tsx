"use client";

import dynamic from "next/dynamic";

const RootLayoutClient = dynamic(() => import('@/components/RootLayoutClient'), {
  ssr: false,
});

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  return <RootLayoutClient>{children}</RootLayoutClient>;
}

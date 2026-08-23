import { LaneChrome } from "@/components/academic/LaneChrome";
import { Suspense } from "react";

/**
 * Every Academic route shares this shell. LaneChrome draws the curriculum lane
 * stepper for Academic Office roles only. Teachers and schools see the page
 * itself — never Overview / Build / Rollout. Order still comes from
 * src/lib/academic/lanes.ts.
 */
export default function AcademicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <LaneChrome lane="asset" />
      </Suspense>
      {children}
    </>
  );
}

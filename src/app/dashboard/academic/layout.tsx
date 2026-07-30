import { LaneChrome } from "@/components/academic/LaneChrome";
import { Suspense } from "react";

/**
 * Every Academic route shares this shell. LaneChrome draws the curriculum lane
 * stepper on the stage pages and nothing on the home, guide or results, so the
 * order shown always comes from src/lib/academic/lanes.ts.
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

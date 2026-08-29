export type TeachingWorkflowStage = "prepare" | "review" | "teach" | "complete";

type TeachingWorkflowRow = {
  week: number;
  taught: boolean;
  recommendedAction: string;
  packageStatus: { complete: boolean; missing: readonly string[] };
  visibilitySummary: {
    fullyLive: boolean;
    needsRelease: boolean;
  };
};

export type TeachingWorkflowSummary = {
  curriculumWeeks: number;
  totalSessions: number;
  missingContent: number;
  missingItems: number;
  readyToShare: number;
  shared: number;
  taught: number;
  nextStage: TeachingWorkflowStage;
};

/** One action summary derived from the same session rows shown to teachers. */
export function summarizeTeachingWorkflow(
  rows: readonly TeachingWorkflowRow[],
): TeachingWorkflowSummary {
  const curriculumWeeks = new Set(
    rows
      .map((row) => Number(row.week))
      .filter((week) => Number.isInteger(week) && week > 0),
  ).size;
  const missingContent = rows.filter(
    (row) =>
      !row.packageStatus.complete ||
      row.recommendedAction === "prepare" ||
      row.recommendedAction === "refresh",
  ).length;
  const readyToShare = rows.filter(
    (row) => row.packageStatus.complete && row.visibilitySummary.needsRelease,
  ).length;
  const shared = rows.filter((row) => row.visibilitySummary.fullyLive).length;
  const taught = rows.filter((row) => row.taught).length;
  const missingItems = rows.reduce(
    (total, row) => total + (Array.isArray(row.packageStatus.missing) ? row.packageStatus.missing.length : 0),
    0,
  );

  return {
    curriculumWeeks,
    totalSessions: rows.length,
    missingContent,
    missingItems,
    readyToShare,
    shared,
    taught,
    nextStage:
      missingContent > 0
        ? "prepare"
        : readyToShare > 0
          ? "review"
          : taught < rows.length
            ? "teach"
            : "complete",
  };
}

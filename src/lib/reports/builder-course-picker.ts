export type ReportPickerCourse = {
  id: string;
  program_id?: string | null;
};

/**
 * Course list for the report-writer start screen.
 * An empty programme must still show courses so a teacher can pick by hand.
 * A selected course stays visible even if it sits on another programme.
 */
export function coursesVisibleForReportPicker<T extends ReportPickerCourse>(
  courses: T[],
  programId: string,
  selectedCourseId: string,
): T[] {
  if (!programId) return courses;
  return courses.filter((course) => course.program_id === programId || course.id === selectedCourseId);
}

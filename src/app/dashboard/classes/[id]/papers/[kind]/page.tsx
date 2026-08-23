'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { HostPaperDatasheet } from '@/components/academic/HostPaperDatasheet';
import { parseHostAssessmentKind } from '@/lib/academic/host-marks';

export default function ClassPaperDatasheetPage() {
  const params = useParams() as { id?: string; kind?: string };
  const search = useSearchParams();
  const kind = parseHostAssessmentKind(params.kind);
  if (!kind || !params.id) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
        This is not a First Test, Second Test or Examination paper.
      </div>
    );
  }
  return (
    <HostPaperDatasheet
      classId={params.id}
      kind={kind}
      courseId={search.get('course_id')}
      programId={search.get('program_id')}
      schoolId={search.get('school_id')}
      studentId={search.get('student_id')}
      from={search.get('from')}
    />
  );
}

'use client';

type Pathway = {
  id: string;
  title: string;
  enrollment_type: string;
  programme_id?: string | null;
  school_id?: string | null;
};

export function ClassPathwayPicker({ enrollmentType, offeringId, programmeId, schoolId, pathways, inputClass, onChange }: {
  enrollmentType: string;
  offeringId: string;
  programmeId: string;
  schoolId: string;
  pathways: Pathway[];
  inputClass: string;
  onChange: (next: { enrollmentType: string; offeringId: string }) => void;
}) {
  const compatible = pathways.filter(pathway =>
    pathway.enrollment_type === enrollmentType
    && (!programmeId || pathway.programme_id === programmeId)
    && (!pathway.school_id || pathway.school_id === schoolId),
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="text-xs font-bold text-muted-foreground">
        Learning pathway
        <select value={enrollmentType} onChange={event => onChange({ enrollmentType: event.target.value, offeringId: '' })} className={`${inputClass} mt-1.5`}>
          <option value="school">Regular School</option>
          <option value="online">Online School</option>
          <option value="special">Special Programme</option>
          <option value="in_person">In-person Programme</option>
        </select>
        <span className="mt-1.5 block text-[10px] font-normal">Registration decides each learner's pathway. Only matching learners can join.</span>
      </label>
      <label className="text-xs font-bold text-muted-foreground">
        Academic pathway
        <select value={offeringId} onChange={event => onChange({ enrollmentType, offeringId: event.target.value })} className={`${inputClass} mt-1.5`}>
          <option value="">{enrollmentType === 'school' ? 'Match Regular School automatically' : 'Select the exact pathway…'}</option>
          {compatible.map(pathway => <option key={pathway.id} value={pathway.id}>{pathway.title}</option>)}
        </select>
        <span className="mt-1.5 block text-[10px] font-normal">Online and Special classes keep their own curriculum direction.</span>
      </label>
    </div>
  );
}

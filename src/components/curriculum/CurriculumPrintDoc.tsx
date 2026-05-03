'use client';

/**
 * CurriculumPrintDoc
 *
 * Official A4 print document for a curriculum week's lesson/assessment plan.
 * Rendered hidden in the DOM; becomes the only visible element when the user
 * invokes window.print() via the "Print Plan" button.
 *
 * Design: Rillcod Technologies official letterhead, structured content
 * sections, signature/stamp lines — suitable as a formal school handout
 * or archival record.
 */

import React from 'react';

// ── Prop types (mirrors the curriculum page's local interfaces) ──────────────

interface LessonPlan {
  duration_minutes?: number;
  objectives?: string[];
  teacher_activities?: string[];
  student_activities?: string[];
  classwork?: { title?: string; instructions?: string; materials?: string[] } | null;
  assignment?: { title?: string; instructions?: string; due?: string } | null;
  project?: { title?: string; description?: string; deliverables?: string[] } | null;
  resources?: string[];
  engagement_tips?: string[];
}

interface AssessmentPlan {
  type?: string;
  title?: string;
  coverage?: string[];
  format?: string;
  duration_minutes?: number;
  scoring_guide?: string;
  teacher_prep?: string[];
  sample_questions?: string[];
}

interface ActiveWeek {
  week: number;
  type: 'lesson' | 'assessment' | 'examination';
  topic: string;
  subtopics?: string[];
  lesson_plan?: LessonPlan | null;
  assessment_plan?: AssessmentPlan | null;
  termNumber?: number;
}

interface CurriculumTerm {
  term: number;
  title: string;
  objectives?: string[];
}

interface CurriculumDoc {
  id: string;
  version?: number;
  created_at?: string;
  schools?: { name: string } | null;
  content: {
    course_title?: string;
    overview?: string;
    learning_outcomes?: string[];
    assessment_strategy?: string;
    materials_required?: string[];
    recommended_tools?: string[];
    terms?: CurriculumTerm[];
  };
}

export interface CurriculumPrintDocProps {
  curriculum: CurriculumDoc | null;
  activeWeek: ActiveWeek | null;
  activeTerm: number;
  courseTitle?: string;
  programName?: string;
  teacherName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function docRef(curriculumId: string, term: number, week: number): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const short = curriculumId.slice(-6).toUpperCase();
  return `RCT-CUR-${yy}${mm}-${short}-T${term}W${week}`;
}

function termLabel(n: number): string {
  return n === 1 ? 'First Term' : n === 2 ? 'Second Term' : n === 3 ? 'Third Term' : `Term ${n}`;
}

function weekTypeLabel(type: ActiveWeek['type']): string {
  return type === 'lesson' ? 'Lesson Plan' : type === 'assessment' ? 'Assessment Plan' : 'Examination Plan';
}

function mins(m?: number): string {
  if (!m) return '—';
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ''}`.trim();
  return `${m} min`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px', breakInside: 'avoid' }}>
      <div style={{
        background: '#1e3a8a', color: 'white', fontSize: '9px', fontWeight: 900,
        textTransform: 'uppercase', letterSpacing: '2px', padding: '5px 10px',
        marginBottom: '8px',
      }}>
        {title}
      </div>
      <div style={{ padding: '0 4px' }}>{children}</div>
    </div>
  );
}

function BulletList({ items, empty = '—' }: { items?: string[]; empty?: string }) {
  if (!items?.length) return <p style={{ fontSize: '10px', color: '#6b7280' }}>{empty}</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: '16px' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '10.5px', color: '#111827', marginBottom: '3px', lineHeight: 1.5 }}>{item}</li>
      ))}
    </ul>
  );
}

function InfoGrid({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: '4px' }}>
      {rows.map(({ label, value }) => (
        <div key={label} style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>
          <div style={{ fontSize: '8px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>{label}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>{value || '—'}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CurriculumPrintDoc({
  curriculum,
  activeWeek,
  activeTerm,
  courseTitle,
  programName,
  teacherName,
}: CurriculumPrintDocProps) {
  if (!curriculum || !activeWeek) return null;

  const plan = activeWeek.lesson_plan;
  const assessment = activeWeek.assessment_plan;
  const school = curriculum.schools?.name ?? null;
  const course = curriculum.content?.course_title || courseTitle || 'Course';
  const ref = docRef(curriculum.id, activeTerm, activeWeek.week);
  const academicYear = currentAcademicYear();
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const termObj = curriculum.content?.terms?.find(t => t.term === activeTerm);
  const termTitle = termObj?.title || termLabel(activeTerm);
  const docType = weekTypeLabel(activeWeek.type);
  const isLesson = activeWeek.type === 'lesson';

  return (
    <>
      {/* Print-only global styles injected as a style tag */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body > * { display: none !important; }
          .curriculum-print-root { display: block !important; }
          @page {
            size: A4 portrait;
            margin: 14mm 15mm 18mm 15mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        .curriculum-print-root { display: none; }
      `}} />

      <div className="curriculum-print-root" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', color: '#111827' }}>

        {/* ── LETTERHEAD ────────────────────────────────────────────── */}
        <div style={{ borderBottom: '4px solid #1e3a8a', paddingBottom: '14px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          {/* Logo badge */}
          <div style={{ width: '72px', height: '72px', background: '#fff', border: '2px solid #1e3a8a', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Rillcod" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          {/* Brand block */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e3a8a', letterSpacing: '-0.5px', lineHeight: 1, textTransform: 'uppercase' }}>
              RILLCOD TECHNOLOGIES
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Coding Today, Innovating Tomorrow
            </div>
            <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '5px' }}>
              26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City, Edo State&nbsp;&nbsp;·&nbsp;&nbsp;08116600091&nbsp;&nbsp;·&nbsp;&nbsp;support@rillcod.com&nbsp;&nbsp;·&nbsp;&nbsp;academy.rillcod.com
            </div>
            {school && (
              <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '3px 8px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '1px' }}>Partner School:</span>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#1e3a8a' }}>{school}</span>
              </div>
            )}
          </div>

          {/* Doc ref */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Document Ref.</div>
            <div style={{ fontSize: '11px', fontWeight: 900, color: '#1e3a8a', fontFamily: 'monospace', marginTop: '2px' }}>{ref}</div>
            <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '4px' }}>Issued: {today}</div>
            <div style={{ fontSize: '9px', color: '#6b7280' }}>Academic Year: {academicYear}</div>
          </div>
        </div>

        {/* ── DOCUMENT TITLE BANNER ──────────────────────────────────── */}
        <div style={{ background: '#1e3a8a', color: '#fff', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '2px' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#93c5fd', marginBottom: '2px' }}>
              Official Curriculum Document
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
              {docType} — Week {activeWeek.week}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#93c5fd' }}>Classification</div>
            <div style={{ fontSize: '11px', fontWeight: 900, background: '#fff', color: '#1e3a8a', padding: '2px 10px', borderRadius: '12px', marginTop: '3px' }}>
              {activeWeek.type === 'lesson' ? 'INSTRUCTIONAL' : activeWeek.type === 'assessment' ? 'ASSESSMENT' : 'EXAMINATION'}
            </div>
          </div>
        </div>

        {/* ── DOCUMENT META GRID ─────────────────────────────────────── */}
        <Section title="Document Information">
          <InfoGrid rows={[
            { label: 'Programme', value: programName || 'Rillcod STEM Programme' },
            { label: 'Course / Subject', value: course },
            { label: 'Term', value: `${termLabel(activeTerm)} — ${termTitle}` },
            { label: 'Week', value: `Week ${activeWeek.week}` },
            { label: 'Topic', value: activeWeek.topic },
            { label: 'Week Type', value: docType },
            ...(isLesson && plan?.duration_minutes ? [{ label: 'Duration', value: mins(plan.duration_minutes) }] : []),
            ...(!isLesson && assessment?.duration_minutes ? [{ label: 'Duration', value: mins(assessment.duration_minutes) }] : []),
            { label: 'Teacher / Instructor', value: teacherName || 'Class Teacher' },
            { label: 'School', value: school || 'Rillcod Academy' },
          ]} />
        </Section>

        {/* ── SUBTOPICS ──────────────────────────────────────────────── */}
        {activeWeek.subtopics?.length ? (
          <Section title="Sub-topics / Coverage">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {activeWeek.subtopics.map((s, i) => (
                <span key={i} style={{ fontSize: '10px', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 8px' }}>
                  {s}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════
            LESSON PLAN CONTENT
        ══════════════════════════════════════════════════════════════ */}
        {isLesson && plan && (
          <>
            {plan.objectives?.length ? (
              <Section title="Learning Objectives">
                <BulletList items={plan.objectives} />
              </Section>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', breakInside: 'avoid' }}>
              {plan.teacher_activities?.length ? (
                <Section title="Teacher Activities">
                  <BulletList items={plan.teacher_activities} />
                </Section>
              ) : null}
              {plan.student_activities?.length ? (
                <Section title="Student Activities">
                  <BulletList items={plan.student_activities} />
                </Section>
              ) : null}
            </div>

            {plan.classwork?.title && (
              <Section title="Classwork">
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#111827', marginBottom: '4px' }}>{plan.classwork.title}</p>
                {plan.classwork.instructions && (
                  <p style={{ fontSize: '10.5px', color: '#374151', marginBottom: '6px', lineHeight: 1.5 }}>{plan.classwork.instructions}</p>
                )}
                {plan.classwork.materials?.length ? (
                  <div>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Materials: </span>
                    <span style={{ fontSize: '10px', color: '#374151' }}>{plan.classwork.materials.join(', ')}</span>
                  </div>
                ) : null}
              </Section>
            )}

            {plan.assignment?.title && (
              <Section title="Assignment">
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#111827', marginBottom: '4px' }}>{plan.assignment.title}</p>
                {plan.assignment.instructions && (
                  <p style={{ fontSize: '10.5px', color: '#374151', marginBottom: '6px', lineHeight: 1.5 }}>{plan.assignment.instructions}</p>
                )}
                {plan.assignment.due && (
                  <p style={{ fontSize: '9px', fontWeight: 700, color: '#dc2626' }}>Due: {plan.assignment.due}</p>
                )}
              </Section>
            )}

            {plan.project?.title && (
              <Section title="Project / Practical">
                <p style={{ fontSize: '11px', fontWeight: 800, color: '#111827', marginBottom: '4px' }}>{plan.project.title}</p>
                {plan.project.description && (
                  <p style={{ fontSize: '10.5px', color: '#374151', marginBottom: '6px', lineHeight: 1.5 }}>{plan.project.description}</p>
                )}
                {plan.project.deliverables?.length ? (
                  <BulletList items={plan.project.deliverables} />
                ) : null}
              </Section>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              {plan.resources?.length ? (
                <Section title="Resources / Materials">
                  <BulletList items={plan.resources} />
                </Section>
              ) : null}
              {plan.engagement_tips?.length ? (
                <Section title="Engagement Tips">
                  <BulletList items={plan.engagement_tips} />
                </Section>
              ) : null}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ASSESSMENT / EXAMINATION PLAN CONTENT
        ══════════════════════════════════════════════════════════════ */}
        {!isLesson && assessment && (
          <>
            <Section title="Assessment Details">
              <InfoGrid rows={[
                { label: 'Assessment Title', value: assessment.title },
                { label: 'Type', value: assessment.type },
                { label: 'Format', value: assessment.format },
                { label: 'Duration', value: mins(assessment.duration_minutes) },
                { label: 'Scoring Guide', value: assessment.scoring_guide },
              ]} />
            </Section>

            {assessment.coverage?.length ? (
              <Section title="Topics Covered / Scope">
                <BulletList items={assessment.coverage} />
              </Section>
            ) : null}

            {assessment.teacher_prep?.length ? (
              <Section title="Teacher Preparation Checklist">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  {assessment.teacher_prep.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '10.5px', color: '#111827', marginBottom: '4px' }}>
                      <span style={{ width: '12px', height: '12px', border: '1.5px solid #6b7280', borderRadius: '2px', flexShrink: 0, marginTop: '1px', display: 'inline-block' }} />
                      {item}
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            {assessment.sample_questions?.length ? (
              <Section title="Sample / Practice Questions">
                <ol style={{ margin: 0, paddingLeft: '16px' }}>
                  {assessment.sample_questions.map((q, i) => (
                    <li key={i} style={{ fontSize: '10.5px', color: '#111827', marginBottom: '5px', lineHeight: 1.5 }}>{q}</li>
                  ))}
                </ol>
              </Section>
            ) : null}
          </>
        )}

        {/* ── TERM OBJECTIVES (context) ──────────────────────────────── */}
        {termObj?.objectives?.length ? (
          <Section title="Term Learning Outcomes (Context)">
            <BulletList items={termObj.objectives} />
          </Section>
        ) : null}

        {/* ── SIGNATURE BLOCK ────────────────────────────────────────── */}
        <div style={{ marginTop: '28px', borderTop: '2px solid #1e3a8a', paddingTop: '20px', breakInside: 'avoid' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            {[
              { role: 'Class Teacher / Instructor', name: teacherName },
              { role: 'Head of Department / HOD', name: '' },
              { role: 'School Administrator', name: '' },
            ].map(({ role, name }) => (
              <div key={role} style={{ textAlign: 'center' }}>
                {name && (
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>{name}</div>
                )}
                <div style={{ height: '36px', borderBottom: '1.5px solid #374151', marginBottom: '5px' }} />
                <div style={{ fontSize: '8.5px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1.4 }}>{role}</div>
                <div style={{ fontSize: '8px', color: '#9ca3af', marginTop: '3px' }}>Signature &amp; Date</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── OFFICIAL STAMP AREA ────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <div style={{ width: '110px', height: '110px', border: '2px dashed #d1d5db', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', padding: '10px' }}>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#d1d5db', textTransform: 'uppercase', letterSpacing: '1px', lineHeight: 1.4 }}>Official<br />School Stamp</div>
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '8px', color: '#9ca3af' }}>
            © {new Date().getFullYear()} Rillcod Technologies — Confidential Curriculum Document — Not for External Distribution
          </div>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontFamily: 'monospace' }}>
            {ref} &nbsp;·&nbsp; v{curriculum.version ?? 1}
          </div>
        </div>

      </div>
    </>
  );
}

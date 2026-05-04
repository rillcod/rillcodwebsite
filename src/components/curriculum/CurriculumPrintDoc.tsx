'use client';

/**
 * CurriculumPrintDoc
 *
 * Official A4 print document for a curriculum week's lesson/assessment plan.
 * Rendered hidden in the DOM; becomes the only visible element when the user
 * invokes window.print() via the "Print Plan" button.
 *
 * Design: Professional official letterhead, Markdown rendering for content,
 * structured metadata grid, and approval signature blocks.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Prop types ──────────────────────────────────────────────────────────────

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
  activities?: string;
  objectives?: string;
  notes?: string;
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
    <div style={{ marginBottom: '20px', breakInside: 'avoid' }}>
      <div style={{
        borderLeft: '4px solid #111827',
        background: '#f9fafb',
        color: '#111827',
        fontSize: '10px',
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        padding: '6px 12px',
        marginBottom: '10px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {title}
      </div>
      <div style={{ padding: '0 8px' }}>{children}</div>
    </div>
  );
}

function MarkdownArea({ content }: { content?: string }) {
  if (!content) return <p style={{ fontSize: '10.5px', color: '#9ca3af', fontStyle: 'italic' }}>No content specified.</p>;
  return (
    <div className="prose prose-sm max-w-none print-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function BulletList({ items, empty = '—' }: { items?: string[]; empty?: string }) {
  if (!items?.length) return <p style={{ fontSize: '10.5px', color: '#6b7280' }}>{empty}</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: '18px' }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: '10.5px', color: '#111827', marginBottom: '4px', lineHeight: 1.6 }}>{item}</li>
      ))}
    </ul>
  );
}

function InfoGrid({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 30px', marginBottom: '6px' }}>
      {rows.map(({ label, value }) => (
        <div key={label} style={{ borderBottom: '0.5px solid #f3f4f6', paddingBottom: '6px' }}>
          <div style={{ fontSize: '8px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>{label}</div>
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
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .curriculum-print-root { display: block !important; position: absolute; top: 0; left: 0; width: 100%; z-index: 999999; background: white; min-height: 100vh; }
          @page {
            size: A4 portrait;
            margin: 15mm 15mm 20mm 15mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-markdown h1, .print-markdown h2, .print-markdown h3 { 
            font-weight: 800; color: #111827; margin-top: 1em; margin-bottom: 0.5em; font-size: 1.1em;
          }
          .print-markdown p { font-size: 10.5px; color: #374151; line-height: 1.6; margin-bottom: 0.8em; }
          .print-markdown ul, .print-markdown ol { padding-left: 1.2em; margin-bottom: 0.8em; }
          .print-markdown li { font-size: 10.5px; color: #374151; margin-bottom: 0.3em; }
          .print-markdown table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
          .print-markdown th, .print-markdown td { border: 1px solid #e5e7eb; padding: 6px; font-size: 9.5px; text-align: left; }
          .print-markdown th { background: #f9fafb; font-weight: 800; }
        }
        .curriculum-print-root { display: none; }
      `}} />

      <div className="curriculum-print-root" style={{ fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", background: '#fff', color: '#111827', padding: '0' }}>

        {/* ── LETTERHEAD ────────────────────────────────────────────── */}
        <div style={{ borderBottom: '2px solid #111827', paddingBottom: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '80px', height: '80px', background: '#fff', border: '1.5px solid #111827', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', flexShrink: 0 }}>
            <img src="/logo.png" alt="Rillcod" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#111827', letterSpacing: '-0.8px', lineHeight: 1, textTransform: 'uppercase' }}>
              RILLCOD TECHNOLOGIES
            </div>
            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '4px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Official Academic & Instructional Document
            </div>
            <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px', lineHeight: 1.4 }}>
              26 Ogiesoba Avenue, GRA, Benin City, Edo State&nbsp;&nbsp;·&nbsp;&nbsp;+234 811 660 0091&nbsp;&nbsp;·&nbsp;&nbsp;support@rillcod.com
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Document No.</div>
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#111827', fontFamily: 'monospace', marginTop: '2px' }}>{ref}</div>
            <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px' }}>Issued: {today}</div>
            <div style={{ fontSize: '9px', color: '#6b7280' }}>Academic Year: {academicYear}</div>
          </div>
        </div>

        {/* ── DOCUMENT TITLE ────────────────────────────────────────── */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '2px', color: '#111827', margin: 0 }}>
            {docType}
          </h1>
          <div style={{ height: '3px', width: '60px', background: '#111827', margin: '8px auto' }}></div>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Week {activeWeek.week} — {activeWeek.topic}
          </p>
        </div>

        {/* ── METADATA GRID ─────────────────────────────────────────── */}
        <Section title="Institutional Context">
          <InfoGrid rows={[
            { label: 'Programme Name', value: programName || 'Rillcod STEM Path' },
            { label: 'Course / Module', value: course },
            { label: 'Academic Term', value: `${termLabel(activeTerm)} (${termTitle})` },
            { label: 'Target School', value: school || 'Rillcod Managed Academy' },
            { label: 'Instructor / Lead', value: teacherName || 'Authorized Instructor' },
            { label: 'Duration / Session', value: isLesson ? mins(plan?.duration_minutes) : mins(assessment?.duration_minutes) },
          ]} />
        </Section>

        {/* ── CONTENT RENDERING ─────────────────────────────────────── */}
        {activeWeek.subtopics?.length ? (
          <Section title="Scope of Work">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {activeWeek.subtopics.map((s, i) => (
                <span key={i} style={{ fontSize: '10px', fontWeight: 700, background: '#f3f4f6', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '3px 10px' }}>
                  {s}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {/* OBJECTIVES */}
        <Section title="Learning Objectives">
          {activeWeek.objectives ? (
            <MarkdownArea content={activeWeek.objectives} />
          ) : (
            <BulletList items={plan?.objectives} />
          )}
        </Section>

        {/* ACTIVITIES / METHODOLOGY */}
        <Section title="Instructional Methodology">
          {activeWeek.activities ? (
            <MarkdownArea content={activeWeek.activities} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {plan?.teacher_activities?.length ? (
                <div>
                  <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px' }}>Teacher Led</p>
                  <BulletList items={plan.teacher_activities} />
                </div>
              ) : null}
              {plan?.student_activities?.length ? (
                <div>
                  <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px' }}>Student Led</p>
                  <BulletList items={plan.student_activities} />
                </div>
              ) : null}
            </div>
          )}
        </Section>

        {/* RESOURCES */}
        {plan?.resources?.length ? (
          <Section title="Teaching Materials & Resources">
            <BulletList items={plan.resources} />
          </Section>
        ) : null}

        {/* ASSESSMENT / NOTES */}
        {assessment && !isLesson && (
          <Section title="Assessment Specifications">
             <MarkdownArea content={assessment.scoring_guide} />
             {assessment.sample_questions?.length ? (
               <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', color: '#6b7280', marginBottom: '6px' }}>Sample Questions</p>
                  <ol style={{ paddingLeft: '1.2em' }}>
                    {assessment.sample_questions.map((q, i) => <li key={i} style={{ fontSize: '10.5px', marginBottom: '4px' }}>{q}</li>)}
                  </ol>
               </div>
             ) : null}
          </Section>
        )}

        {activeWeek.notes && (
          <Section title="Instructor Special Notes">
            <MarkdownArea content={activeWeek.notes} />
          </Section>
        )}

        {/* ── APPROVAL BLOCK ────────────────────────────────────────── */}
        <div style={{ marginTop: 'auto', paddingTop: '40px', breakInside: 'avoid' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px' }}>
            {[
              { role: 'Course Instructor', name: teacherName },
              { role: 'Quality Assurance / HOD', name: '' },
              { role: 'School Registry / Admin', name: '' },
            ].map(({ role, name }) => (
              <div key={role} style={{ textAlign: 'center' }}>
                <div style={{ height: '40px', borderBottom: '1px solid #111827', marginBottom: '6px', position: 'relative' }}>
                  {name && <span style={{ fontSize: '10px', fontWeight: 700, position: 'absolute', bottom: '2px', left: 0, right: 0 }}>{name}</span>}
                </div>
                <div style={{ fontSize: '8px', fontWeight: 800, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{role}</div>
                <div style={{ fontSize: '7px', color: '#9ca3af', marginTop: '2px' }}>Date & Signature</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <div style={{ marginTop: '30px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontWeight: 600 }}>
            © {new Date().getFullYear()} RILLCOD TECHNOLOGIES&nbsp;&nbsp;·&nbsp;&nbsp;STRICTLY CONFIDENTIAL&nbsp;&nbsp;·&nbsp;&nbsp;FOR AUTHORIZED USE ONLY
          </div>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontFamily: 'monospace' }}>
            ID: {curriculum.id.slice(0, 8)} &nbsp;·&nbsp; VER: {curriculum.version ?? 1} &nbsp;·&nbsp; PAGE 1 OF 1
          </div>
        </div>

      </div>
    </>
  );
}

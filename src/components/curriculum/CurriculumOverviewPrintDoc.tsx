'use client';

/**
 * CurriculumOverviewPrintDoc
 *
 * Official A4 print document for a full curriculum syllabus overview.
 * Rendered hidden in the DOM; becomes visible only when window.print()
 * is called with printMode === 'overview'.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { brandContact } from '@/config/brand';
import { getCurrentAcademicYear } from '@/lib/reports/academic-period';

interface CurriculumTerm {
  term: number;
  title: string;
  objectives?: string[];
  weeks?: {
    week: number;
    type: 'lesson' | 'assessment' | 'examination';
    topic: string;
    subtopics?: string[];
  }[];
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

export interface PrintSectionOptions {
  terms: number[];           // which term numbers to include
  showOverview: boolean;
  showLearningOutcomes: boolean;
  showAssessmentStrategy: boolean;
  showMaterials: boolean;
  showTools: boolean;
  showApprovalSection: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintSectionOptions = {
  terms: [1, 2, 3],
  showOverview: true,
  showLearningOutcomes: true,
  showAssessmentStrategy: true,
  showMaterials: true,
  showTools: true,
  showApprovalSection: true,
};

export interface CurriculumOverviewPrintDocProps {
  curriculum: CurriculumDoc | null;
  programName?: string;
  isActive: boolean;
  options?: PrintSectionOptions;
}

function docRef(curriculumId: string): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const short = curriculumId.slice(-6).toUpperCase();
  return `RCT-CUR-SYL-${yy}${mm}-${short}`;
}

function termLabel(n: number): string {
  return n === 1 ? 'First Term' : n === 2 ? 'Second Term' : n === 3 ? 'Third Term' : `Term ${n}`;
}

export function CurriculumOverviewPrintDoc({ curriculum, programName, isActive, options }: CurriculumOverviewPrintDocProps) {
  if (!curriculum || !isActive) return null;

  const opts: PrintSectionOptions = { ...DEFAULT_PRINT_OPTIONS, ...options };

  const school = curriculum.schools?.name ?? null;
  const course = curriculum.content?.course_title || 'Course';
  const ref = docRef(curriculum.id);
  const academicYear = getCurrentAcademicYear();
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const visibleTerms = (curriculum.content?.terms ?? []).filter(t => opts.terms.includes(t.term));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          html, body {
            width: 210mm !important;
            min-width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          body * {
            visibility: hidden !important;
          }
          .curriculum-overview-print-root,
          .curriculum-overview-print-root * {
            visibility: visible !important;
          }
          .curriculum-overview-print-root {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 210mm !important;
            max-width: 210mm !important;
            min-height: 297mm !important;
            z-index: 999999 !important;
            background: white !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 15mm 15mm 20mm 15mm;
          }
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .curriculum-overview-print-root table {
            width: 100% !important;
            table-layout: fixed !important;
          }
          .curriculum-overview-print-root th,
          .curriculum-overview-print-root td {
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          .curriculum-overview-print-root img {
            max-width: 100% !important;
            height: auto !important;
          }
          .print-markdown h1, .print-markdown h2, .print-markdown h3 {
            font-weight: 800; color: #111827; margin-top: 1em; margin-bottom: 0.5em; font-size: 1.1em;
          }
          .print-markdown p { font-size: 10.5px; color: #374151; line-height: 1.6; margin-bottom: 0.8em; }
          .print-markdown ul, .print-markdown ol { padding-left: 1.2em; margin-bottom: 0.8em; }
          .print-markdown li { font-size: 10.5px; color: #374151; margin-bottom: 0.3em; }
        }
        .curriculum-overview-print-root { display: none; }
      `}} />

      <div className="curriculum-overview-print-root" style={{ fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", background: '#fff', color: '#111827', padding: '0' }}>

        {/* LETTERHEAD */}
        <div style={{ borderBottom: '2px solid #111827', paddingBottom: '16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '80px', height: '80px', background: '#fff', border: '1.5px solid #111827', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', flexShrink: 0 }}>
            <img src="/logo.png" alt="Rillcod" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#111827', letterSpacing: '-0.8px', lineHeight: 1, textTransform: 'uppercase' }}>
              {brandContact.legalName}
            </div>
            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '4px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Official Syllabus & Course Specification
            </div>
            <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px', lineHeight: 1.4 }}>
              {brandContact.address}&nbsp;&nbsp;·&nbsp;&nbsp;{brandContact.phone}&nbsp;&nbsp;·&nbsp;&nbsp;{brandContact.email}
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Document No.</div>
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#111827', fontFamily: 'monospace', marginTop: '2px' }}>{ref}</div>
            <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px' }}>Issued: {today}</div>
            <div style={{ fontSize: '9px', color: '#6b7280' }}>Academic Year: {academicYear}</div>
          </div>
        </div>

        {/* DOCUMENT TITLE */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '2px', color: '#111827', margin: 0 }}>
            Full Syllabus Overview
          </h1>
          <div style={{ height: '3px', width: '60px', background: '#111827', margin: '8px auto' }}></div>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {course}
          </p>
        </div>

        {/* METADATA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 30px', marginBottom: '24px' }}>
          <div style={{ borderBottom: '0.5px solid #f3f4f6', paddingBottom: '6px' }}>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Programme Name</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>{programName || 'Rillcod STEM Path'}</div>
          </div>
          <div style={{ borderBottom: '0.5px solid #f3f4f6', paddingBottom: '6px' }}>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Authorized School</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>{school || 'Rillcod Managed Academy'}</div>
          </div>
          <div style={{ borderBottom: '0.5px solid #f3f4f6', paddingBottom: '6px' }}>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Academic Year</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>{academicYear}</div>
          </div>
          <div style={{ borderBottom: '0.5px solid #f3f4f6', paddingBottom: '6px' }}>
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Syllabus Version</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>v{curriculum.version ?? 1}</div>
          </div>
        </div>

        {/* OVERVIEW */}
        {opts.showOverview && curriculum.content?.overview && (
          <div style={{ marginBottom: '24px', breakInside: 'avoid' }}>
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
              Course Specification & Learning Goals
            </div>
            <div className="print-markdown" style={{ padding: '0 8px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {curriculum.content.overview}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* LEARNING OUTCOMES */}
        {opts.showLearningOutcomes && curriculum.content?.learning_outcomes && curriculum.content.learning_outcomes.length > 0 && (
          <div style={{ marginBottom: '24px', breakInside: 'avoid' }}>
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
              Learning Outcomes
            </div>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {curriculum.content.learning_outcomes.map((o, i) => (
                <li key={i} style={{ fontSize: '10px', color: '#374151', marginBottom: '4px', lineHeight: 1.5 }}>{o}</li>
              ))}
            </ul>
          </div>
        )}

        {/* TERMS ITERATION */}
        {visibleTerms.map(term => (
          <div key={term.term} style={{ marginBottom: '32px', breakInside: 'avoid' }}>
            <div style={{
              background: '#111827',
              color: 'white',
              fontSize: '11px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              padding: '8px 14px',
              marginBottom: '12px'
            }}>
              {termLabel(term.term)}: {term.title}
            </div>

            {term.objectives && term.objectives.length > 0 && (
              <div style={{ marginBottom: '10px', paddingLeft: '4px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Term Objectives</div>
                <ul style={{ paddingLeft: '16px', margin: 0 }}>
                  {term.objectives.map((o, i) => (
                    <li key={i} style={{ fontSize: '9.5px', color: '#374151', marginBottom: '3px', lineHeight: 1.4 }}>{o}</li>
                  ))}
                </ul>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #111827', textAlign: 'left' }}>
                  <th style={{ padding: '8px', width: '40px', fontWeight: 800 }}>Week</th>
                  <th style={{ padding: '8px', fontWeight: 800 }}>Instructional Topic</th>
                  <th style={{ padding: '8px', fontWeight: 800, width: '250px' }}>Core Coverage / Sub-topics</th>
                  <th style={{ padding: '8px', fontWeight: 800, width: '90px', textAlign: 'center' }}>Module Type</th>
                </tr>
              </thead>
              <tbody>
                {(term.weeks || []).map(week => (
                  <tr key={week.week} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px', fontWeight: 800 }}>{week.week}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{week.topic}</td>
                    <td style={{ padding: '8px', color: '#4b5563', fontSize: '9px', lineHeight: 1.4 }}>
                      {(week.subtopics || []).join(' · ')}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '7.5px',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        border: '1px solid #111827',
                        background: week.type === 'lesson' ? '#fff' : '#f9fafb',
                      }}>
                        {week.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* ASSESSMENT STRATEGY */}
        {opts.showAssessmentStrategy && curriculum.content?.assessment_strategy && (
          <div style={{ marginBottom: '24px', breakInside: 'avoid' }}>
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
              Assessment Strategy
            </div>
            <p style={{ fontSize: '10px', color: '#374151', lineHeight: 1.6, padding: '0 8px' }}>
              {curriculum.content.assessment_strategy}
            </p>
          </div>
        )}

        {/* MATERIALS */}
        {opts.showMaterials && curriculum.content?.materials_required && curriculum.content.materials_required.length > 0 && (
          <div style={{ marginBottom: '16px', breakInside: 'avoid' }}>
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
              Materials Required
            </div>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {curriculum.content.materials_required.map((m, i) => (
                <li key={i} style={{ fontSize: '10px', color: '#374151', marginBottom: '4px' }}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {/* TOOLS */}
        {opts.showTools && curriculum.content?.recommended_tools && curriculum.content.recommended_tools.length > 0 && (
          <div style={{ marginBottom: '24px', breakInside: 'avoid' }}>
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
              Recommended Tools & Resources
            </div>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              {curriculum.content.recommended_tools.map((t, i) => (
                <li key={i} style={{ fontSize: '10px', color: '#374151', marginBottom: '4px' }}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {/* APPROVAL SECTION */}
        {opts.showApprovalSection && (
          <div style={{ marginTop: 'auto', paddingTop: '40px', breakInside: 'avoid' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px' }}>
              {[
                { role: 'Course Developer' },
                { role: 'Curriculum Auditor' },
                { role: 'Quality Assurance' },
              ].map(({ role }) => (
                <div key={role} style={{ textAlign: 'center' }}>
                  <div style={{ height: '40px', borderBottom: '1px solid #111827', marginBottom: '6px' }}></div>
                  <div style={{ fontSize: '8px', fontWeight: 800, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{role}</div>
                  <div style={{ fontSize: '7px', color: '#9ca3af', marginTop: '2px' }}>Date & Signature</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={{ marginTop: '40px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontWeight: 600 }}>
            © {new Date().getFullYear()} RILLCOD TECHNOLOGIES&nbsp;&nbsp;·&nbsp;&nbsp;OFFICIAL COURSE SPECIFICATION
          </div>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontFamily: 'monospace' }}>
            ID: {curriculum.id.slice(0, 8)} &nbsp;·&nbsp; VER: {curriculum.version ?? 1}
          </div>
        </div>
      </div>
    </>
  );
}

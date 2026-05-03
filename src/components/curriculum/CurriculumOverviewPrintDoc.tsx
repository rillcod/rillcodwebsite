'use client';

import React from 'react';

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

export interface CurriculumOverviewPrintDocProps {
  curriculum: CurriculumDoc | null;
  programName?: string;
  isActive: boolean;
}

function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
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

export function CurriculumOverviewPrintDoc({ curriculum, programName, isActive }: CurriculumOverviewPrintDocProps) {
  if (!curriculum || !isActive) return null;

  const school = curriculum.schools?.name ?? null;
  const course = curriculum.content?.course_title || 'Course';
  const ref = docRef(curriculum.id);
  const academicYear = currentAcademicYear();
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body > * { display: none !important; }
          .curriculum-overview-print-root { display: block !important; }
          @page {
            size: A4 portrait;
            margin: 14mm 15mm 18mm 15mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        .curriculum-overview-print-root { display: none; }
      `}} />

      <div className="curriculum-overview-print-root" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', color: '#111827' }}>
        
        {/* LETTERHEAD */}
        <div style={{ borderBottom: '4px solid #1e3a8a', paddingBottom: '14px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ width: '72px', height: '72px', background: '#fff', border: '2px solid #1e3a8a', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', flexShrink: 0 }}>
            <img src="/logo.png" alt="Rillcod" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e3a8a', letterSpacing: '-0.5px', lineHeight: 1, textTransform: 'uppercase' }}>
              RILLCOD TECHNOLOGIES
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Coding Today, Innovating Tomorrow
            </div>
            <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '5px' }}>
              26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City, Edo State&nbsp;&nbsp;·&nbsp;&nbsp;08116600091&nbsp;&nbsp;·&nbsp;&nbsp;support@rillcod.com
            </div>
            {school && (
              <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '3px 8px' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '1px' }}>Partner School:</span>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#1e3a8a' }}>{school}</span>
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Document Ref.</div>
            <div style={{ fontSize: '11px', fontWeight: 900, color: '#1e3a8a', fontFamily: 'monospace', marginTop: '2px' }}>{ref}</div>
            <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '4px' }}>Issued: {today}</div>
            <div style={{ fontSize: '9px', color: '#6b7280' }}>Academic Year: {academicYear}</div>
          </div>
        </div>

        {/* DOCUMENT TITLE BANNER */}
        <div style={{ background: '#1e3a8a', color: '#fff', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '2px' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: '#93c5fd', marginBottom: '2px' }}>
              Official Syllabus Document
            </div>
            <div style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
              {course}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#93c5fd' }}>Classification</div>
            <div style={{ fontSize: '11px', fontWeight: 900, background: '#fff', color: '#1e3a8a', padding: '2px 10px', borderRadius: '12px', marginTop: '3px' }}>
              SYLLABUS
            </div>
          </div>
        </div>

        {/* DOCUMENT META */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
             <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Programme</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>{programName || 'Rillcod STEM Programme'}</div>
             </div>
             <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>
                <div style={{ fontSize: '8px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>School</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#111827' }}>{school || 'Rillcod Academy'}</div>
             </div>
          </div>
        </div>

        {/* OVERVIEW */}
        {curriculum.content?.overview && (
          <div style={{ marginBottom: '18px', breakInside: 'avoid' }}>
            <div style={{ background: '#1e3a8a', color: 'white', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', padding: '5px 10px', marginBottom: '8px' }}>
              Course Overview
            </div>
            <p style={{ fontSize: '10.5px', color: '#374151', padding: '0 4px', lineHeight: 1.5 }}>
              {curriculum.content.overview}
            </p>
          </div>
        )}

        {/* TERMS ITERATION */}
        {(curriculum.content?.terms || []).map(term => (
          <div key={term.term} style={{ marginBottom: '24px', breakInside: 'avoid' }}>
            <div style={{ background: '#2563eb', color: 'white', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', padding: '6px 10px', marginBottom: '10px' }}>
              {termLabel(term.term)}: {term.title}
            </div>
            
            {/* Term Outline */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db', textAlign: 'left' }}>
                  <th style={{ padding: '6px', width: '40px', color: '#4b5563' }}>Wk</th>
                  <th style={{ padding: '6px', color: '#4b5563' }}>Topic</th>
                  <th style={{ padding: '6px', color: '#4b5563', width: '200px' }}>Coverage</th>
                  <th style={{ padding: '6px', color: '#4b5563', width: '80px', textAlign: 'center' }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {(term.weeks || []).map(week => (
                  <tr key={week.week} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '6px', fontWeight: 800, color: '#1f2937' }}>{week.week}</td>
                    <td style={{ padding: '6px', fontWeight: 700, color: '#1f2937' }}>{week.topic}</td>
                    <td style={{ padding: '6px', color: '#4b5563', fontSize: '9.5px' }}>
                      {(week.subtopics || []).join(', ')}
                    </td>
                    <td style={{ padding: '6px', textAlign: 'center' }}>
                      <span style={{ 
                        fontSize: '8px', 
                        fontWeight: 800, 
                        textTransform: 'uppercase', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        background: week.type === 'lesson' ? '#dcfce7' : week.type === 'assessment' ? '#fef3c7' : '#fee2e2',
                        color: week.type === 'lesson' ? '#166534' : week.type === 'assessment' ? '#92400e' : '#991b1b'
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

        {/* FOOTER */}
        <div style={{ marginTop: '30px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '8px', color: '#9ca3af' }}>
            © {new Date().getFullYear()} Rillcod Technologies — Official Syllabus Document
          </div>
          <div style={{ fontSize: '8px', color: '#9ca3af', fontFamily: 'monospace' }}>
            {ref} &nbsp;·&nbsp; v{curriculum.version ?? 1}
          </div>
        </div>
      </div>
    </>
  );
}

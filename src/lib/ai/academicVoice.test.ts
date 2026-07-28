import { describe, expect, it } from 'vitest';
import { academicVoiceInstruction, cleanAcademicVoice, voiceForRole } from './academicVoice';

describe('academic AI voices', () => {
  it('gives each user an appropriate human voice', () => {
    expect(voiceForRole('admin', 'quality')).toBe('academic_reviewer');
    expect(voiceForRole('teacher', 'lesson_delivery')).toBe('teaching_coach');
    expect(voiceForRole('school', 'timing')).toBe('school_support');
  });

  it('explicitly prevents machine language and hidden engine terms', () => {
    const instruction = academicVoiceInstruction('teaching_coach');
    expect(instruction).toContain('Never say “as an AI”');
    expect(instruction).toContain('QA lanes');
  });

  it('cleans machine phrases and technical leakage from generated guidance', () => {
    expect(cleanAcademicVoice('As an AI language model, use qa_spine_v1 with lane_index 2.'))
      .toBe('use the academic standard with learning pathway 2.');
  });
});


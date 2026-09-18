import { describe, expect, it } from 'vitest';
import {
  generatePredictiveComments,
  getStrengthBankSuggestions,
  getGrowthBankSuggestions,
  determinePerformanceBand,
  resolvePronouns,
  detectDomain,
  detectArchetype
} from './comment-warehouse';

describe('comment warehouse', () => {
  it('resolves pronouns accurately for boys and girls', () => {
    const boy = resolvePronouns('male', 'Chidi Okafor');
    expect(boy.subject).toBe('he');
    expect(boy.possessive).toBe('his');

    const girl = resolvePronouns('female', 'Amina Yusuf');
    expect(girl.subject).toBe('she');
    expect(girl.possessive).toBe('her');
  });

  it('determines performance bands reliably', () => {
    expect(determinePerformanceBand(88)).toBe('distinction');
    expect(determinePerformanceBand(72)).toBe('merit');
    expect(determinePerformanceBand(55)).toBe('pass');
    expect(determinePerformanceBand(40)).toBe('support');
  });

  it('generates grounded, personalized comments instantly', () => {
    const res = generatePredictiveComments({
      studentName: 'David Adeleke',
      gender: 'male',
      topic: 'Python Loops & Functions',
      overallScore: 88,
      theoryScore: 90,
      practicalScore: 85,
      recommendations: ['practice nested loops at home']
    });

    expect(res.key_strengths).toContain('David');
    expect(res.key_strengths.length).toBeGreaterThan(40);
    expect(res.areas_for_growth).toContain('David');
    expect(res.areas_for_growth).toContain('nested loops');
  });

  it('detects domain-specific subject areas accurately', () => {
    expect(detectDomain('Python Data Types', 'Intro to Coding')).toBe('python');
    expect(detectDomain('Sprite Game Design', 'Scratch Animation')).toBe('scratch');
    expect(detectDomain('Responsive CSS Grid', 'Web Development')).toBe('web');
    expect(detectDomain('Micro:bit Ultrasonic Sensor', 'Robotics & STEM')).toBe('robotics');
    expect(detectDomain('Poster Composition', 'Graphic Design')).toBe('design');
  });

  it('identifies student learning archetypes from score balance', () => {
    const tinkerer = detectArchetype({ practicalScore: 95, theoryScore: 75 });
    expect(tinkerer).toBe('tinkerer');

    const theorist = detectArchetype({ practicalScore: 70, theoryScore: 92 });
    expect(theorist).toBe('theorist');

    const diligent = detectArchetype({ attendanceScore: 95, classworkScore: 90 });
    expect(diligent).toBe('diligent');
  });

  it('generates unique, non-repetitive comments for students in the same class', () => {
    const student1 = generatePredictiveComments({
      studentName: 'Aisha Bello',
      gender: 'female',
      topic: 'Python Loops',
      overallScore: 85,
      theoryScore: 85,
      practicalScore: 85
    });

    const student2 = generatePredictiveComments({
      studentName: 'Zainab Mohammed',
      gender: 'female',
      topic: 'Python Loops',
      overallScore: 85,
      theoryScore: 85,
      practicalScore: 85
    });

    // Both are distinction in the exact same subject with the exact same score,
    // but their opening sentences and narrative styles MUST be distinct!
    expect(student1.key_strengths).not.toBe(student2.key_strengths);
    expect(student1.areas_for_growth).not.toBe(student2.areas_for_growth);
  });

  it('provides varied bank suggestions for single-click swapping', () => {
    const suggestions = getStrengthBankSuggestions({
      studentName: 'Fatima Bello',
      gender: 'female',
      topic: 'Web Design HTML/CSS',
      overallScore: 78
    });

    expect(suggestions.length).toBe(4);
    expect(suggestions[0]).toContain('Fatima');
    // Ensure the 4 suggestions offer different stylistic flavors
    expect(suggestions[0]).not.toBe(suggestions[1]);
    expect(suggestions[1]).not.toBe(suggestions[2]);
  });
});

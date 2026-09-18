import { describe, expect, it } from 'vitest';
import {
  generatePredictiveComments,
  getStrengthBankSuggestions,
  getGrowthBankSuggestions,
  determinePerformanceBand,
  resolvePronouns
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

  it('provides varied bank suggestions for single-click swapping', () => {
    const suggestions = getStrengthBankSuggestions({
      studentName: 'Fatima Bello',
      gender: 'female',
      topic: 'Web Design HTML/CSS',
      overallScore: 78
    });

    expect(suggestions.length).toBe(4);
    expect(suggestions[0]).toContain('Fatima');
  });
});

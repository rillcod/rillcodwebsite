import { describe, expect, it } from 'vitest';
import { cleanStudentName } from './clean-name';

describe('cleanStudentName', () => {
  it.each([
    ['john doe', 'John Doe'],
    ['JOHN DOE', 'John Doe'],
    ['jOhN dOe', 'John Doe'],
    ['mary-jane oke', 'Mary-Jane Oke'],
    ["o'brien", "O'Brien"],
    ["O'BRIEN", "O'Brien"],
    ['34. melvin okafor', 'Melvin Okafor'],
    ['Jenika Jerry.', 'Jenika Jerry'],
    ['edric imuetinyan a.', 'Edric Imuetinyan A.'],
  ])('normalises %s → %s', (input, expected) => {
    expect(cleanStudentName(input)).toBe(expected);
  });
});

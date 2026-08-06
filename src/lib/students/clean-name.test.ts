import { describe, expect, it } from 'vitest';
import { cleanStudentName, nameNeedsCleaning } from './clean-name';

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

describe('leading table/list punctuation', () => {
  it('strips a pipe carried in from a pasted table', () => {
    // A whole HILLTOP intake arrived this way and the pipe reached report cards.
    expect(cleanStudentName('| Alvin Osemeahon')).toBe('Alvin Osemeahon');
    expect(cleanStudentName('|Divya Obahaya')).toBe('Divya Obahaya');
  });

  it('strips bullets and dashes from pasted lists', () => {
    expect(cleanStudentName('• Jesse George')).toBe('Jesse George');
    expect(cleanStudentName('- Precious Obiocha')).toBe('Precious Obiocha');
    expect(cleanStudentName('* Divya Obahaya')).toBe('Divya Obahaya');
  });

  it('still strips a spreadsheet index behind the junk', () => {
    expect(cleanStudentName('| 3. Alvin Osemeahon')).toBe('Alvin Osemeahon');
  });

  it('leaves a clean name untouched', () => {
    expect(cleanStudentName('Ojokoh Enoch')).toBe('Ojokoh Enoch');
    expect(cleanStudentName("O'Brien Mary-Jane")).toBe("O'Brien Mary-Jane");
  });

  it('flags the damaged name for the heal panel', () => {
    expect(nameNeedsCleaning('| Alvin Osemeahon')).toBe(true);
    expect(nameNeedsCleaning('Ojokoh Enoch')).toBe(false);
  });
});

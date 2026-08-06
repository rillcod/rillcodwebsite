import { describe, expect, it } from 'vitest';
import { cleanStudentName, nameNeedsCleaning, nameLooksIncomplete } from './clean-name';

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

describe('nameLooksIncomplete', () => {
  it('flags a lone first name or lone surname', () => {
    // Live records, most already carrying report cards, that nothing surfaced.
    for (const name of ['Adele', 'Goodness', 'Triumph', 'Edokpolor', 'Osebumhese', 'JAYDEN']) {
      expect(nameLooksIncomplete(name), name).toBe(true);
    }
  });

  it('accepts any name with two or more words', () => {
    for (const name of ['Ojokoh Enoch', 'Johnson Bethel Osahenoman', 'Kendra Madako Kevwe']) {
      expect(nameLooksIncomplete(name), name).toBe(false);
    }
  });

  it('treats a compound surname as complete', () => {
    // "Franco-Emeni" is a live record and is a whole surname, not half a name.
    expect(nameLooksIncomplete('Franco-Emeni')).toBe(false);
    expect(nameLooksIncomplete("O'Brien")).toBe(false);
  });

  it('does not count a bulk-register number as the missing half', () => {
    // bulk-register appends digits to disambiguate; a digit is not a surname.
    expect(nameLooksIncomplete('Joseph 3')).toBe(true);
    expect(nameLooksIncomplete('5 Goodness')).toBe(true);
  });

  it('still flags a name that is only junk or empty', () => {
    expect(nameLooksIncomplete('')).toBe(true);
    expect(nameLooksIncomplete(null)).toBe(true);
    expect(nameLooksIncomplete('   ')).toBe(true);
  });

  it('sees through the leading junk the cleaner strips', () => {
    expect(nameLooksIncomplete('| 3. Adele')).toBe(true);
    expect(nameLooksIncomplete('| 3. Adele Okoro')).toBe(false);
  });
});

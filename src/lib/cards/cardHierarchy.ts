import { compareClassNames, compareSectionNames } from '@/lib/cards/exportRoster';

export type HierarchyItemFields = {
  school?: string | null;
  grade?: string | null;
  section?: string | null;
  name?: string | null;
};

export type HierarchyFilterState = {
  schoolLock?: string;
  /** 'all' or a school name */
  school?: string;
  /** 'all' or a grade label */
  grade?: string;
  /** 'all', '__NONE__', or a section label */
  section?: string;
};

export type HierarchyGroup<T> = {
  className: string;
  sections: Array<{ sectionName: string; items: T[] }>;
};

function normalizeSchool(v?: string | null): string {
  return (v ?? '').trim() || '—';
}

function normalizeGrade(v?: string | null): string {
  return (v ?? '').trim();
}

function normalizeSection(v?: string | null): string {
  return (v ?? '').trim();
}

function fieldsOf(item: HierarchyItemFields): Required<Pick<HierarchyItemFields, 'school' | 'grade' | 'section' | 'name'>> {
  return {
    school: normalizeSchool(item.school),
    grade: normalizeGrade(item.grade),
    section: normalizeSection(item.section),
    name: (item.name ?? '').trim(),
  };
}

function gradeLabel(grade: string): string {
  return grade || '— No Class —';
}

function sectionLabel(section: string): string {
  return section || '— No Section —';
}

/** School → class → section → name — shared by Design and Manage. */
export function sortBySchoolHierarchy<T>(
  items: T[],
  pick: (item: T) => HierarchyItemFields,
): T[] {
  return [...items].sort((a, b) => {
    const fa = fieldsOf(pick(a));
    const fb = fieldsOf(pick(b));
    const sc = fa.school.localeCompare(fb.school, undefined, { sensitivity: 'base' });
    if (sc !== 0) return sc;
    const gc = compareClassNames(gradeLabel(fa.grade), gradeLabel(fb.grade));
    if (gc !== 0) return gc;
    const sec = compareSectionNames(sectionLabel(fa.section), sectionLabel(fb.section));
    if (sec !== 0) return sec;
    return fa.name.localeCompare(fb.name, undefined, { sensitivity: 'base' });
  });
}

export function matchesHierarchyFilter<T>(
  item: T,
  pick: (item: T) => HierarchyItemFields,
  filter: HierarchyFilterState,
  opts?: { skip?: 'school' | 'grade' | 'section' },
): boolean {
  const f = fieldsOf(pick(item));
  if (filter.schoolLock && f.school !== filter.schoolLock) return false;
  if (opts?.skip !== 'school' && filter.school && filter.school !== 'all' && f.school !== filter.school) return false;
  if (opts?.skip !== 'grade' && filter.grade && filter.grade !== 'all') {
    if (gradeLabel(f.grade) !== filter.grade) return false;
  }
  if (opts?.skip !== 'section' && filter.section && filter.section !== 'all') {
    if (filter.section === '__NONE__') {
      if (f.section) return false;
    } else if (f.section !== filter.section) {
      return false;
    }
  }
  return true;
}

export function listHierarchySchools<T>(
  items: T[],
  pick: (item: T) => HierarchyItemFields,
  filter: HierarchyFilterState,
): string[] {
  const set = new Set<string>();
  items.forEach((item) => {
    if (!matchesHierarchyFilter(item, pick, filter, { skip: 'school' })) return;
    set.add(fieldsOf(pick(item)).school);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function listHierarchyGrades<T>(
  items: T[],
  pick: (item: T) => HierarchyItemFields,
  filter: HierarchyFilterState,
): string[] {
  const set = new Set<string>();
  items.forEach((item) => {
    if (!matchesHierarchyFilter(item, pick, filter, { skip: 'grade' })) return;
    const g = normalizeGrade(pick(item).grade);
    if (g) set.add(g);
  });
  return Array.from(set).sort(compareClassNames);
}

export function listHierarchySections<T>(
  items: T[],
  pick: (item: T) => HierarchyItemFields,
  filter: HierarchyFilterState,
): string[] {
  const set = new Set<string>();
  let hasEmpty = false;
  items.forEach((item) => {
    if (!matchesHierarchyFilter(item, pick, filter, { skip: 'section' })) return;
    const sec = normalizeSection(pick(item).section);
    if (sec) set.add(sec);
    else hasEmpty = true;
  });
  const list = Array.from(set).sort(compareSectionNames);
  if (hasEmpty) list.unshift('__NONE__');
  return list;
}

export function countHierarchy<T>(
  items: T[],
  pick: (item: T) => HierarchyItemFields,
  filter: HierarchyFilterState,
  key: 'school' | 'grade' | 'section',
  value: string,
): number {
  let n = 0;
  items.forEach((item) => {
    if (!matchesHierarchyFilter(item, pick, filter, { skip: key })) return;
    const f = fieldsOf(pick(item));
    if (key === 'school' && f.school === value) n += 1;
    else if (key === 'grade' && gradeLabel(f.grade) === value) n += 1;
    else if (key === 'section') {
      if (value === '__NONE__' && !f.section) n += 1;
      else if (f.section === value) n += 1;
    }
  });
  return n;
}

/** Nested class → section groups, each level sorted. */
export function buildHierarchyGroups<T>(
  items: T[],
  pick: (item: T) => HierarchyItemFields,
): HierarchyGroup<T>[] {
  const sorted = sortBySchoolHierarchy(items, pick);
  const classMap = new Map<string, Map<string, T[]>>();
  sorted.forEach((item) => {
    const f = fieldsOf(pick(item));
    const cls = gradeLabel(f.grade);
    const sec = sectionLabel(f.section);
    if (!classMap.has(cls)) classMap.set(cls, new Map());
    const secMap = classMap.get(cls)!;
    if (!secMap.has(sec)) secMap.set(sec, []);
    secMap.get(sec)!.push(item);
  });
  return Array.from(classMap.entries())
    .sort(([a], [b]) => compareClassNames(a, b))
    .map(([className, secMap]) => ({
      className,
      sections: Array.from(secMap.entries())
        .sort(([a], [b]) => compareSectionNames(a, b))
        .map(([sectionName, sectionItems]) => ({ sectionName, items: sectionItems })),
    }));
}

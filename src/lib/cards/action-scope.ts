/** Selection always takes priority; never silently include people outside it. */
export function cardActionScope<T extends { id: string; isHidden?: boolean }>(
  filtered: readonly T[], selectedIds: ReadonlySet<string>, issued: ReadonlyMap<string, unknown>,
) {
  const people = selectedIds.size ? filtered.filter(person => selectedIds.has(person.id)) : [...filtered];
  return { people, missing: people.filter(person => !person.isHidden && !issued.has(person.id)) };
}

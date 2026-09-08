/** Preview limits never mutate the collection used by printing or bulk actions. */
export function cardPreviewPage<T>(records: readonly T[], requestedPage: number) {
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1));
  return {
    pageSize, pageCount, currentPage,
    visibleRecords: records.slice((currentPage - 1) * pageSize, currentPage * pageSize),
  };
}

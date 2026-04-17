/**
 * Pagination utilities for API routes
 * Provides consistent pagination across all list endpoints
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorPaginationMeta {
  limit: number;
  hasNext: boolean;
  nextCursor: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

// Default pagination limits
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Parse pagination parameters from URL search params
 */
export function parsePaginationParams(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10))
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Parse cursor pagination parameters
 */
export function parseCursorParams(searchParams: URLSearchParams): {
  cursor: string | null;
  limit: number;
} {
  const cursor = searchParams.get('cursor');
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10))
  );

  return { cursor, limit };
}

/**
 * Build pagination metadata
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Build cursor pagination metadata
 */
export function buildCursorMeta<T extends { id: string }>(
  data: T[],
  limit: number
): CursorPaginationMeta {
  const hasNext = data.length > limit;
  const items = hasNext ? data.slice(0, limit) : data;
  const nextCursor = hasNext && items.length > 0 ? items[items.length - 1].id : null;

  return {
    limit,
    hasNext,
    nextCursor,
  };
}

/**
 * Apply pagination to Supabase query builder
 */
export function applyPagination<T>(
  query: any,
  page: number,
  limit: number
): any {
  const offset = (page - 1) * limit;
  return query.range(offset, offset + limit - 1);
}

/**
 * Apply cursor pagination to Supabase query builder
 * Fetches limit + 1 to determine if there are more results
 */
export function applyCursorPagination<T>(
  query: any,
  cursor: string | null,
  limit: number,
  orderColumn: string = 'created_at'
): any {
  let q = query.order(orderColumn, { ascending: false }).limit(limit + 1);
  
  if (cursor) {
    q = q.lt(orderColumn, cursor);
  }
  
  return q;
}

/**
 * Helper to create paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginatedResponse<T> {
  return {
    data,
    meta: buildPaginationMeta(page, limit, total),
  };
}

/**
 * Helper to create cursor paginated response
 */
export function cursorPaginatedResponse<T extends { id: string }>(
  data: T[],
  limit: number
): CursorPaginatedResponse<T> {
  const meta = buildCursorMeta(data, limit);
  const items = meta.hasNext ? data.slice(0, limit) : data;

  return {
    data: items,
    meta,
  };
}

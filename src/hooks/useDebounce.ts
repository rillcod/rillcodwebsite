import { useState, useEffect } from 'react';

/**
 * Debounces a value — only updates after the user stops changing it for
 * `delay` ms (default 300 ms).
 *
 * Special case (Req 19.4): when `value` is an empty string or null the
 * debounce is bypassed and the state is reset immediately so that clearing
 * a search field takes effect without waiting.
 *
 * @example
 * const debouncedSearch = useDebounce(searchTerm, 300);
 * useEffect(() => { fetchResults(debouncedSearch); }, [debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    // Bypass debounce for empty / null values so clearing a search is instant
    if (value === '' || value === null) {
      setDebounced(value);
      return;
    }

    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

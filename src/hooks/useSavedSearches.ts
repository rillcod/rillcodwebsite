import { useState, useEffect } from 'react';

export interface SavedSearch {
  id: string;
  query: string;
  filters: {
    type?: string;
    status?: string;
    skill_level?: string;
    date_from?: string;
    date_to?: string;
    course_id?: string;
  };
  createdAt: string;
  label?: string;
}

const STORAGE_KEY = 'rillcod_saved_searches';

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSearches(JSON.parse(stored));
      } catch (error) {
        console.error('[v0] Error loading saved searches:', error);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever searches change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    }
  }, [searches, isLoaded]);

  const saveSearch = (query: string, filters: any, label?: string) => {
    const newSearch: SavedSearch = {
      id: `search_${Date.now()}`,
      query,
      filters,
      createdAt: new Date().toISOString(),
      label: label || query,
    };

    setSearches((prev) => {
      // Avoid duplicates
      const filtered = prev.filter(
        (s) => !(s.query === query && JSON.stringify(s.filters) === JSON.stringify(filters))
      );
      return [newSearch, ...filtered].slice(0, 10); // Keep only 10 most recent
    });

    return newSearch;
  };

  const deleteSearch = (id: string) => {
    setSearches((prev) => prev.filter((s) => s.id !== id));
  };

  const clearAllSearches = () => {
    setSearches([]);
  };

  return {
    searches,
    saveSearch,
    deleteSearch,
    clearAllSearches,
    isLoaded,
  };
}

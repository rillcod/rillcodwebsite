'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdvancedSearchBar } from '@/components/search/AdvancedSearchBar';
import { SearchResults } from '@/components/search/SearchResults';
import { ArrowLeftIcon } from '@/lib/icons';
import Link from 'next/link';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialType = searchParams.get('type') || 'all';
  const initialStatus = searchParams.get('status') || '';
  const initialSkillLevel = searchParams.get('skill_level') || '';

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState({
    type: initialType,
    status: initialStatus,
    skill_level: initialSkillLevel,
  });
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Fetch results when query or filters change
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          ...(filters.type !== 'all' && { type: filters.type }),
          ...(filters.status && { status: filters.status }),
          ...(filters.skill_level && { skill_level: filters.skill_level }),
        });

        const response = await fetch(`/api/search?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
          setResults(data.data);
        }
      } catch (error) {
        console.error('[v0] Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    // Debounce search
    const timer = setTimeout(() => {
      fetchResults();
    }, 300);

    return () => clearTimeout(timer);
  }, [query, filters]);

  const handleSearch = (newQuery: string, newFilters: any) => {
    setQuery(newQuery);
    setFilters(newFilters);
  };

  const totalResults = results
    ? (results.lessons?.length || 0) +
      (results.assignments?.length || 0) +
      (results.courses?.length || 0) +
      (results.students?.length || 0)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">Search</h1>
          <p className="text-muted-foreground">
            Find lessons, assignments, courses, and students across your institution
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8 bg-muted/30 p-6 rounded-lg border border-border">
          <AdvancedSearchBar
            onSearch={handleSearch}
            showFilters={true}
            placeholder="Search lessons, assignments, courses, students..."
          />
        </div>

        {/* Results Summary */}
        {query && (
          <div className="mb-6 text-sm text-muted-foreground">
            {loading ? (
              <span>Searching...</span>
            ) : totalResults > 0 ? (
              <span>
                Found <span className="font-semibold text-foreground">{totalResults}</span> result{totalResults !== 1 ? 's' : ''} for &quot;<span className="font-semibold text-foreground">{query}</span>&quot;
              </span>
            ) : (
              <span>No results found for &quot;<span className="font-semibold text-foreground">{query}</span>&quot;</span>
            )}
          </div>
        )}

        {/* Search Results */}
        <div>
          {query ? (
            <SearchResults
              loading={loading}
              results={results}
              query={query}
            />
          ) : (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                Enter a search query to get started
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

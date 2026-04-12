'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon, XMarkIcon, ChevronDownIcon } from '@/lib/icons';

interface AdvancedSearchBarProps {
  onSearch?: (query: string, filters: any) => void;
  showFilters?: boolean;
  placeholder?: string;
  compact?: boolean;
}

export function AdvancedSearchBar({
  onSearch,
  showFilters = true,
  placeholder = 'Search lessons, assignments, courses...',
  compact = false,
}: AdvancedSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [expandFilters, setExpandFilters] = useState(false);
  const [type, setType] = useState<'all' | 'lesson' | 'assignment' | 'course' | 'student'>('all');
  const [status, setStatus] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  // Update active filter count
  useEffect(() => {
    let count = 0;
    if (type !== 'all') count++;
    if (status) count++;
    if (skillLevel) count++;
    setActiveFilterCount(count);
  }, [type, status, skillLevel]);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;

    const filters: any = {
      type: type !== 'all' ? type : undefined,
      status: status || undefined,
      skill_level: skillLevel || undefined,
    };

    if (onSearch) {
      onSearch(query, filters);
    } else {
      // Navigate to search results page with query params
      const params = new URLSearchParams({
        q: query,
        ...(type !== 'all' && { type }),
        ...(status && { status }),
        ...(skillLevel && { skill_level: skillLevel }),
      });
      router.push(`/dashboard/search?${params.toString()}`);
    }
  }, [query, type, status, skillLevel, onSearch, router]);

  const handleClearFilters = () => {
    setType('all');
    setStatus('');
    setSkillLevel('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
          <MagnifyingGlassIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-foreground placeholder-muted-foreground outline-none text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-background rounded transition-colors"
              aria-label="Clear search"
            >
              <XMarkIcon className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Toggle & Search Button */}
      {showFilters && (
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setExpandFilters(!expandFilters)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 border border-border rounded-lg transition-colors relative"
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-orange-500 text-white rounded-full ml-1">
                {activeFilterCount}
              </span>
            )}
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${expandFilters ? 'rotate-180' : ''}`} />
          </button>
          
          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Search
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Advanced Filters */}
      {showFilters && expandFilters && (
        <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-4">
          {/* Type Filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Types</option>
              <option value="lesson">Lessons</option>
              <option value="assignment">Assignments</option>
              <option value="course">Courses</option>
              <option value="student">Students</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="submitted">Submitted</option>
              <option value="graded">Graded</option>
            </select>
          </div>

          {/* Skill Level Filter */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Skill Level</label>
            <select
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All Levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

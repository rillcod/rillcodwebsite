'use client';

import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon } from '@/lib/icons';

interface InlineSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  onAdvancedSearch?: () => void;
}

export function InlineSearchBar({
  query,
  onQueryChange,
  placeholder = 'Search...',
  onAdvancedSearch,
}: InlineSearchBarProps) {
  const router = useRouter();

  const handleGlobalSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      router.push(`/dashboard/search?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="relative flex-1">
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleGlobalSearch}
        className="w-full pl-10 pr-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
        title="Press Enter to perform a global search across all content"
      />
      {query && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          Press Enter to search all
        </div>
      )}
    </div>
  );
}

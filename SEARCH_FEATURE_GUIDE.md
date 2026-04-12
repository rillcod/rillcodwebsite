# Advanced Search & Filter System - Feature Guide

## Overview

The Advanced Search & Filter System enables users to perform powerful cross-entity searches across lessons, assignments, courses, and students with advanced filtering capabilities. No SQL migrations were required.

## Features

### 1. Unified Search Endpoint
**Location**: `/api/search`

**Parameters**:
- `q` (required): Search query string
- `type` (optional): Filter by entity type (`all`, `lesson`, `assignment`, `course`, `student`)
- `status` (optional): Filter by status (e.g., `active`, `draft`, `completed`, `submitted`, `graded`)
- `skill_level` (optional): Filter by skill level (`beginner`, `intermediate`, `advanced`)
- `date_from` (optional): Filter by start date (ISO format)
- `date_to` (optional): Filter by end date (ISO format)
- `course_id` (optional): Filter by specific course
- `program_id` (optional): Filter by specific program

**Example Request**:
```
GET /api/search?q=Python&type=lesson&status=active&skill_level=beginner
```

**Response**:
```json
{
  "success": true,
  "query": "Python",
  "data": {
    "lessons": [...],
    "assignments": [...],
    "courses": [...],
    "students": [...]
  }
}
```

### 2. Search Components

#### AdvancedSearchBar
Comprehensive search UI with expandable filters.

**Location**: `/src/components/search/AdvancedSearchBar.tsx`

**Usage**:
```tsx
import { AdvancedSearchBar } from '@/components/search/AdvancedSearchBar';

<AdvancedSearchBar
  onSearch={(query, filters) => console.log(query, filters)}
  showFilters={true}
  placeholder="Search lessons, assignments..."
  compact={false}
/>
```

**Props**:
- `onSearch`: Callback function when user searches
- `showFilters`: Show/hide advanced filters UI
- `placeholder`: Input placeholder text
- `compact`: Compact mode for inline use

#### InlineSearchBar
Lightweight search bar for page-level search with global search trigger.

**Location**: `/src/components/search/InlineSearchBar.tsx`

**Usage**:
```tsx
import { InlineSearchBar } from '@/components/search/InlineSearchBar';

<InlineSearchBar
  query={search}
  onQueryChange={setSearch}
  placeholder="Search by name..."
/>
```

#### SearchResults
Displays grouped search results with metadata.

**Location**: `/src/components/search/SearchResults.tsx`

**Usage**:
```tsx
import { SearchResults } from '@/components/search/SearchResults';

<SearchResults
  loading={isLoading}
  results={searchResults}
  query="Python"
/>
```

### 3. Search Results Page
**Location**: `/app/dashboard/search`

A dedicated page for performing comprehensive searches across the entire platform.

**Features**:
- Full-text search across lessons, assignments, courses, and students
- Advanced filter panel
- Results grouped by type with metadata
- Role-based filtering (automatically scoped to user's access)
- Debounced search for optimal performance
- Saved search capability (localStorage)

### 4. Saved Searches Hook
**Location**: `/src/hooks/useSavedSearches.ts`

Manage user's saved search filter combinations using localStorage (no database changes).

**Usage**:
```tsx
import { useSavedSearches } from '@/hooks/useSavedSearches';

const { searches, saveSearch, deleteSearch, clearAllSearches } = useSavedSearches();

// Save a search
saveSearch('Python', { type: 'lesson', status: 'active' }, 'Python Lessons');

// Delete a search
deleteSearch(searchId);
```

## Integration

### Search Service Enhancement
**Location**: `/src/services/search.service.ts`

The SearchService class has been enhanced with:
- `searchAll()`: Parallel searches across multiple entities
- `searchLessons()`: Search lessons with filters
- `searchAssignments()`: Search assignments with filters
- `searchCourses()`: Search courses with filters
- `searchTeachers()`: Search teachers/students
- Support for `SearchFilters` interface with advanced options

### API Route Enhancement
**Location**: `/src/app/api/search/route.ts`

Updated to handle advanced filter parameters and pass them to the SearchService.

## Role-Based Filtering

Search results are automatically scoped based on user role:

| Role | Sees |
|------|------|
| **Admin** | All lessons, assignments, courses, students across all schools |
| **Teacher** | Own lessons/assignments, courses they teach, students in their classes |
| **School** | All content within their school |
| **Student** | Enrolled lessons/courses, assigned assignments |
| **Parent** | Data related to their children |

## Usage Examples

### Global Search from Dashboard
Users can navigate to `/dashboard/search` to perform cross-entity searches.

### Local Page Search
Integrate `InlineSearchBar` in existing pages (lessons, assignments, courses) while maintaining existing filters. On Enter, users can trigger a global search from that context.

### Programmatic Search
```tsx
const response = await fetch(
  `/api/search?q=Python&type=lesson&status=active&skill_level=beginner`
);
const { data } = await response.json();
```

## Performance Considerations

1. **Debounced Search**: Search requests are debounced to 300ms to reduce API calls
2. **Result Limits**: Each entity type returns max 10 results
3. **Parallel Fetching**: Multiple entity searches execute in parallel
4. **Role-Based Scoping**: Queries are scoped by user role at database level

## No Database Changes

This feature uses existing Supabase tables and columns:
- `lessons`: title, description, lesson_type, status, created_at, course_id, school_id
- `assignments`: title, description, assignment_type, status, due_date, course_id, school_id
- `courses`: title, description, skill_level, is_active, school_id, program_id
- `portal_users`: full_name, email, role, school_id

No migrations or schema modifications required.

## Future Enhancements

Potential improvements for next iterations:
1. Search analytics tracking (popular searches, search success rate)
2. Smart suggestions based on search history
3. Advanced date range picker UI
4. Search result sorting/ranking options
5. Bulk actions on search results (export, assign, etc.)
6. AI-powered search suggestion
7. Saved search automation (recurring searches)

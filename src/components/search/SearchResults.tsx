'use client';

import Link from 'next/link';
import { 
  BookOpenIcon, 
  CheckCircleIcon, 
  ClockIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  UserGroupIcon,
  ArrowRightIcon
} from '@/lib/icons';

interface SearchResult {
  id: string;
  title?: string;
  name?: string;
  full_name?: string;
  description?: string;
  status?: string;
  lesson_type?: string;
  assignment_type?: string;
  due_date?: string;
  created_at?: string;
  courses?: { id: string; title: string }[];
  programs?: { id: string; name: string }[];
  skill_level?: string;
  email?: string;
  profile_image_url?: string;
}

interface SearchResultsProps {
  loading: boolean;
  results?: {
    lessons: SearchResult[];
    assignments: SearchResult[];
    courses: SearchResult[];
    students: SearchResult[];
  };
  query: string;
}

const TYPE_COLORS = {
  lesson: 'bg-blue-500/10 text-blue-400',
  assignment: 'bg-purple-500/10 text-purple-400',
  course: 'bg-emerald-500/10 text-emerald-400',
  student: 'bg-amber-500/10 text-amber-400',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500/20 text-emerald-400',
  active: 'bg-blue-500/20 text-blue-400',
  scheduled: 'bg-amber-500/20 text-amber-400',
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-cyan-500/20 text-cyan-400',
  graded: 'bg-emerald-500/20 text-emerald-400',
};

function ResultItem({ 
  result, 
  type, 
  href 
}: { 
  result: SearchResult; 
  type: 'lesson' | 'assignment' | 'course' | 'student';
  href: string;
}) {
  const title = result.title || result.name || result.full_name || '';
  const description = result.description || '';
  const status = result.status;

  return (
    <Link href={href}>
      <div className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-orange-400 transition-colors truncate">
                {title}
              </h3>
              <span className={`text-xs font-medium px-2 py-1 rounded whitespace-nowrap flex-shrink-0 ${TYPE_COLORS[type]}`}>
                {type === 'lesson' ? 'Lesson' : type === 'assignment' ? 'Assignment' : type === 'course' ? 'Course' : 'Student'}
              </span>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {description}
              </p>
            )}
          </div>
          <ArrowRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-orange-400 transition-colors flex-shrink-0 mt-1" />
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
          {status && (
            <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[status] || 'bg-muted text-muted-foreground'}`}>
              {status}
            </span>
          )}
          
          {result.courses && result.courses.length > 0 && (
            <span className="flex items-center gap-1">
              <BookOpenIcon className="w-3 h-3" />
              {result.courses[0].title}
            </span>
          )}

          {result.lesson_type && (
            <span className="flex items-center gap-1">
              <DocumentTextIcon className="w-3 h-3" />
              {result.lesson_type}
            </span>
          )}

          {result.due_date && (
            <span className="flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              Due {new Date(result.due_date).toLocaleDateString()}
            </span>
          )}

          {result.skill_level && (
            <span className="text-xs">
              {result.skill_level.charAt(0).toUpperCase() + result.skill_level.slice(1)}
            </span>
          )}

          {result.email && (
            <span className="text-xs text-muted-foreground">
              {result.email}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function SearchResults({ loading, results, query }: SearchResultsProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-4 border border-border rounded-lg animate-pulse bg-muted/30 h-24" />
        ))}
      </div>
    );
  }

  const hasResults = results && (
    results.lessons.length > 0 ||
    results.assignments.length > 0 ||
    results.courses.length > 0 ||
    results.students.length > 0
  );

  if (!hasResults) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4">
          <BookOpenIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
        </div>
        <p className="text-foreground font-medium mb-2">No results found</p>
        <p className="text-muted-foreground text-sm">
          Try adjusting your search query or filters to find what you&apos;re looking for
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Lessons Section */}
      {results!.lessons.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BookOpenIcon className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Lessons ({results!.lessons.length})
            </h3>
          </div>
          <div className="grid gap-3">
            {results!.lessons.map((lesson) => (
              <ResultItem
                key={lesson.id}
                result={lesson}
                type="lesson"
                href={`/dashboard/lessons/${lesson.id}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Assignments Section */}
      {results!.assignments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <DocumentTextIcon className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Assignments ({results!.assignments.length})
            </h3>
          </div>
          <div className="grid gap-3">
            {results!.assignments.map((assignment) => (
              <ResultItem
                key={assignment.id}
                result={assignment}
                type="assignment"
                href={`/dashboard/assignments/${assignment.id}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Courses Section */}
      {results!.courses.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AcademicCapIcon className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Courses ({results!.courses.length})
            </h3>
          </div>
          <div className="grid gap-3">
            {results!.courses.map((course) => (
              <ResultItem
                key={course.id}
                result={course}
                type="course"
                href={`/dashboard/courses/${course.id}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Students Section */}
      {results!.students.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <UserGroupIcon className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Students ({results!.students.length})
            </h3>
          </div>
          <div className="grid gap-3">
            {results!.students.map((student) => (
              <ResultItem
                key={student.id}
                result={student}
                type="student"
                href={`/dashboard/students/${student.id}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

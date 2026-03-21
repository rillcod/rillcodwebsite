"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Calendar, Users, Clock, CheckCircle, BookOpen, Star,
  MapPin, GraduationCap, ChevronRight,
} from "lucide-react";

const LEVEL_COLORS: Record<string, string> = {
  beginner:     "bg-emerald-500",
  intermediate: "bg-blue-500",
  advanced:     "bg-purple-500",
};

const GRAD_COLORS: Record<string, string> = {
  beginner:     "from-emerald-400 to-emerald-600",
  intermediate: "from-blue-400 to-blue-600",
  advanced:     "from-purple-400 to-purple-600",
};

export default function ProgramPage() {
  const params = useParams();
  const id = params?.id as string;

  const [program, setProgram]   = useState<any | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/programs/${id}`, { cache: "no-store" })
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(json => {
        if (!json) return;
        setProgram(json.data ?? null);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !program) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Program Not Found</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            The program you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/programs"
            className="bg-[#FF914D] text-white px-6 py-3 rounded-full hover:bg-[#e67e3d] transition-colors"
          >
            View All Programs
          </Link>
        </div>
      </div>
    );
  }

  const level     = program.difficulty_level ?? "beginner";
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
  const gradColor = GRAD_COLORS[level] ?? GRAD_COLORS.beginner;
  const levelBg   = LEVEL_COLORS[level] ?? LEVEL_COLORS.beginner;
  const courses: any[] = program.courses ?? [];
  const activeCourses  = courses.filter(c => c.is_active !== false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Gradient Header */}
      <div className={`bg-gradient-to-r ${gradColor} text-white py-16`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center mb-6">
            <Link href="/programs" className="flex items-center text-white/80 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Programs
            </Link>
          </div>

          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4 flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${levelBg}`}>
                  {levelLabel}
                </span>
                {program.duration_weeks && (
                  <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                    {program.duration_weeks} Weeks
                  </span>
                )}
                {activeCourses.length > 0 && (
                  <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                    {activeCourses.length} Course{activeCourses.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-4">{program.name}</h1>
              <p className="text-xl mb-6 opacity-90">{program.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {program.duration_weeks && (
                  <div className="text-center">
                    <div className="text-2xl font-bold">{program.duration_weeks} wks</div>
                    <div className="text-sm opacity-80">Duration</div>
                  </div>
                )}
                {program.price > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold">₦{Number(program.price).toLocaleString()}</div>
                    <div className="text-sm opacity-80">Price</div>
                  </div>
                )}
                {program.max_students && (
                  <div className="text-center">
                    <div className="text-2xl font-bold">{program.max_students}</div>
                    <div className="text-sm opacity-80">Max Students</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-2xl font-bold">{activeCourses.length}</div>
                  <div className="text-sm opacity-80">Courses</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/student-registration"
                  className="bg-white text-gray-800 px-8 py-4 rounded-full font-bold hover:bg-gray-100 transition-colors text-center"
                >
                  Enroll Now
                </Link>
                <Link
                  href="/contact"
                  className="border-2 border-white/40 text-white px-8 py-4 rounded-full font-bold hover:bg-white hover:text-gray-800 transition-colors text-center"
                >
                  Get More Info
                </Link>
              </div>
            </div>

            <div className="flex-shrink-0">
              <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <BookOpen className="w-16 h-16 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">

            {/* Courses — the key new section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center">
                <BookOpen className="w-6 h-6 text-[#FF914D] mr-3" />
                Courses in This Program
              </h2>
              {activeCourses.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 italic">
                  Courses for this program are being prepared. Check back soon!
                </p>
              ) : (
                <div className="space-y-3">
                  {activeCourses.map((course: any, idx: number) => (
                    <div
                      key={course.id}
                      className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="w-8 h-8 bg-[#FF914D] text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 dark:text-white">{course.title}</p>
                        {course.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {course.description}
                          </p>
                        )}
                      </div>
                      {course.duration_hours && (
                        <span className="flex-shrink-0 flex items-center gap-1 text-xs text-gray-400 font-medium">
                          <Clock className="w-3.5 h-3.5" />{course.duration_hours}h
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* What You'll Learn (from description) */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center">
                <Star className="w-6 h-6 text-[#FF914D] mr-3" />
                About This Program
              </h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                {program.description}
              </p>
              {activeCourses.length > 0 && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeCourses.slice(0, 6).map((c: any) => (
                    <div key={c.id} className="flex items-center space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 text-sm">{c.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Program Details */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Program Details</h3>
              <div className="space-y-4">
                {program.duration_weeks && (
                  <div className="flex items-center space-x-3">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Duration</div>
                      <div className="font-semibold text-gray-800 dark:text-white">{program.duration_weeks} Weeks</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center space-x-3">
                  <BookOpen className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Courses</div>
                    <div className="font-semibold text-gray-800 dark:text-white">{activeCourses.length} courses</div>
                  </div>
                </div>
                {program.max_students && (
                  <div className="flex items-center space-x-3">
                    <Users className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Class Size</div>
                      <div className="font-semibold text-gray-800 dark:text-white">Max {program.max_students} students</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center space-x-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Level</div>
                    <div className="font-semibold text-gray-800 dark:text-white">{levelLabel}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Course Quick List */}
            {activeCourses.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Quick Course Overview</h3>
                <div className="space-y-2">
                  {activeCourses.map((c: any, idx: number) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <ChevronRight className="w-4 h-4 text-[#FF914D] flex-shrink-0" />
                      <span>Course {idx + 1}: {c.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="bg-gradient-to-r from-[#FF914D] to-orange-500 rounded-2xl p-6 text-white text-center">
              <h3 className="text-xl font-bold mb-3">Ready to Start?</h3>
              <p className="text-sm mb-4 opacity-90">
                Join this program and unlock your full potential in tech!
              </p>
              <Link
                href="/student-registration"
                className="bg-white text-[#FF914D] px-6 py-3 rounded-full font-bold hover:bg-gray-100 transition-colors inline-block"
              >
                Enroll Now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

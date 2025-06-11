'use client';

import { useState } from 'react';
import { 
  ChartBarIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  StarIcon,
  ArrowUpIcon,
  BookOpenIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';

// Mock progress data
const mockProgressData = {
  overview: {
    totalStudents: 1247,
    activeStudents: 1189,
    avgProgress: 78.5,
    completionRate: 85.2,
    avgRating: 4.6,
    totalCourses: 12,
    totalLessons: 156
  },
  trends: {
    weekly: [
      { week: 'Week 1', progress: 65, students: 1200 },
      { week: 'Week 2', progress: 68, students: 1210 },
      { week: 'Week 3', progress: 72, students: 1220 },
      { week: 'Week 4', progress: 75, students: 1230 },
      { week: 'Week 5', progress: 78, students: 1240 },
      { week: 'Week 6', progress: 80, students: 1247 }
    ],
    monthly: [
      { month: 'Jan', progress: 60, students: 850 },
      { month: 'Feb', progress: 65, students: 920 },
      { month: 'Mar', progress: 78, students: 1247 }
    ]
  },
  topPerformers: [
    {
      name: 'Lagos State Model College',
      students: 450,
      progress: 82,
      improvement: 12,
      rating: 4.8
    },
    {
      name: 'Abuja International School',
      students: 320,
      progress: 79,
      improvement: 8,
      rating: 4.6
    },
    {
      name: 'Port Harcourt Academy',
      students: 280,
      progress: 76,
      improvement: 15,
      rating: 4.5
    }
  ],
  courseProgress: [
    {
      course: 'Python Programming',
      students: 280,
      progress: 85,
      completion: 78,
      rating: 4.7
    },
    {
      course: 'Web Development',
      students: 245,
      progress: 72,
      completion: 65,
      rating: 4.5
    },
    {
      course: 'Scratch Programming',
      students: 320,
      progress: 90,
      completion: 88,
      rating: 4.8
    },
    {
      course: 'UI/UX Design',
      students: 180,
      progress: 68,
      completion: 62,
      rating: 4.4
    }
  ]
};

export default function ProgressPage() {
  const [timeRange, setTimeRange] = useState('month');
  const [data, _setData] = useState(mockProgressData);

  const getTrendIcon = (value: number) => {
    return value > 0 ? (
      <ArrowTrendingUpIcon className="h-5 w-5 text-green-500" />
    ) : (
      <ArrowTrendingDownIcon className="h-5 w-5 text-red-500" />
    );
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'text-green-600 dark:text-green-400';
    if (progress >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getProgressBarColor = (progress: number) => {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Progress Tracking</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor student and course progress</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Students</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.overview.totalStudents.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center text-green-500">
              {getTrendIcon(12)}
              <span className="text-sm font-medium ml-1">+12%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <ChartBarIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Progress</p>
                <p className={`text-2xl font-bold ${getProgressColor(data.overview.avgProgress)}`}>
                  {data.overview.avgProgress}%
                </p>
              </div>
            </div>
            <div className="flex items-center text-green-500">
              {getTrendIcon(5)}
              <span className="text-sm font-medium ml-1">+5%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                <CheckCircleIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Completion Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.overview.completionRate}%</p>
              </div>
            </div>
            <div className="flex items-center text-green-500">
              {getTrendIcon(8)}
              <span className="text-sm font-medium ml-1">+8%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                <StarIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Rating</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.overview.avgRating}</p>
              </div>
            </div>
            <div className="flex items-center text-green-500">
              {getTrendIcon(2)}
              <span className="text-sm font-medium ml-1">+2%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Progress Trend */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Weekly Progress Trend</h3>
          <div className="space-y-4">
            {data.trends.weekly.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 w-16">{item.week}</span>
                <div className="flex-1 mx-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(item.progress)}`}
                      style={{ width: `${item.progress}%` }}
                    ></div>
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                  {item.progress}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Progress Trend */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Monthly Progress Trend</h3>
          <div className="space-y-4">
            {data.trends.monthly.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 w-16">{item.month}</span>
                <div className="flex-1 mx-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(item.progress)}`}
                      style={{ width: `${item.progress}%` }}
                    ></div>
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                  {item.progress}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Performers */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Performing Schools</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.topPerformers.map((school, index) => (
            <div key={index} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{index + 1}</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">{school.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{school.students} students</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className={`text-lg font-bold ${getProgressColor(school.progress)}`}>{school.progress}%</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Progress</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{school.rating}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Rating</p>
                    </div>
                    <div className="flex items-center text-green-500">
                      <ArrowUpIcon className="h-4 w-4 mr-1" />
                      <span className="text-sm font-medium">+{school.improvement}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Course Progress */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Course Progress Overview</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {data.courseProgress.map((course, index) => (
            <div key={index} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                    <BookOpenIcon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">{course.course}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{course.students} students enrolled</p>
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <p className={`text-lg font-bold ${getProgressColor(course.progress)}`}>{course.progress}%</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Progress</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{course.completion}%</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Completion</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{course.rating}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Rating</p>
                  </div>
                  <div className="w-32">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Progress</span>
                      <span className={`font-medium ${getProgressColor(course.progress)}`}>{course.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(course.progress)}`}
                        style={{ width: `${course.progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Key Insights</h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Strong Performance</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">85% of students are on track</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <ArrowTrendingUpIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Growth Trend</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">12% increase in enrollment</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Areas for Improvement</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Focus on advanced courses</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                <UserGroupIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">New Students</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">47 students joined this week</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <AcademicCapIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Course Completions</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">23 students completed courses</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <StarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">High Ratings</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Average rating increased to 4.6</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
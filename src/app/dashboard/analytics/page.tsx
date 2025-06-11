'use client';

import { useState } from 'react';
import { 
  ChartBarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  StarIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline';

// Mock data for analytics
const mockData = {
  overview: {
    totalStudents: 1247,
    totalTeachers: 23,
    totalSchools: 18,
    totalCourses: 12,
    activeStudents: 1189,
    pendingStudents: 58,
    avgProgress: 78.5,
    avgRating: 4.6
  },
  trends: {
    studentGrowth: [
      { month: 'Jan', students: 850 },
      { month: 'Feb', students: 920 },
      { month: 'Mar', students: 980 },
      { month: 'Apr', students: 1050 },
      { month: 'May', students: 1120 },
      { month: 'Jun', students: 1180 },
      { month: 'Jul', students: 1247 }
    ],
    courseEnrollment: [
      { course: 'Scratch Programming', students: 320 },
      { course: 'Python Programming', students: 280 },
      { course: 'Web Development', students: 245 },
      { course: 'UI/UX Design', students: 180 },
      { course: 'Flutter Development', students: 150 },
      { course: 'Advanced Python', students: 72 }
    ]
  },
  performance: {
    topSchools: [
      { name: 'Lagos State Model College', students: 450, progress: 82 },
      { name: 'Abuja International School', students: 320, progress: 79 },
      { name: 'Port Harcourt Academy', students: 280, progress: 76 },
      { name: 'Kano Science College', students: 380, progress: 74 },
      { name: 'Calabar High School', students: 310, progress: 71 }
    ],
    topTeachers: [
      { name: 'Dr. Sarah Johnson', students: 45, rating: 4.8 },
      { name: 'Ms. Chioma Okonkwo', students: 38, rating: 4.9 },
      { name: 'Mr. David Wilson', students: 52, rating: 4.8 },
      { name: 'Mr. Ahmed Hassan', students: 32, rating: 4.6 },
      { name: 'Mr. Emeka Nwosu', students: 25, rating: 4.7 }
    ]
  }
};

export default function AnalyticsPage() {
  const [data] = useState(mockData);
  const [timeRange, setTimeRange] = useState('6months');

  const getGrowthIcon = (value: number) => {
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

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return 'text-green-600 dark:text-green-400';
    if (rating >= 4.0) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Comprehensive insights and performance metrics</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="1month">Last Month</option>
            <option value="3months">Last 3 Months</option>
            <option value="6months">Last 6 Months</option>
            <option value="1year">Last Year</option>
          </select>
        </div>
      </div>

      {/* Overview Cards */}
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
              {getGrowthIcon(12)}
              <span className="text-sm font-medium ml-1">+12%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <AcademicCapIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Students</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.overview.activeStudents.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center text-green-500">
              {getGrowthIcon(8)}
              <span className="text-sm font-medium ml-1">+8%</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                <ChartBarIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Progress</p>
                <p className={`text-2xl font-bold ${getProgressColor(data.overview.avgProgress)}`}>
                  {data.overview.avgProgress}%
                </p>
              </div>
            </div>
            <div className="flex items-center text-green-500">
              {getGrowthIcon(5)}
              <span className="text-sm font-medium ml-1">+5%</span>
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
                <p className={`text-2xl font-bold ${getRatingColor(data.overview.avgRating)}`}>
                  {data.overview.avgRating}
                </p>
              </div>
            </div>
            <div className="flex items-center text-green-500">
              {getGrowthIcon(2)}
              <span className="text-sm font-medium ml-1">+2%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Student Growth Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Student Growth</h3>
          <div className="space-y-3">
            {data.trends.studentGrowth.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.month}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(item.students / 1300) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                    {item.students.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Course Enrollment Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Course Enrollment</h3>
          <div className="space-y-3">
            {data.trends.courseEnrollment.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{item.course}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(item.students / 320) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                    {item.students}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Schools */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Performing Schools</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.performance.topSchools.map((school, index) => (
              <div key={index} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{index + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{school.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{school.students} students</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${getProgressColor(school.progress)}`}>{school.progress}%</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">progress</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Teachers */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Rated Teachers</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.performance.topTeachers.map((teacher, index) => (
              <div key={index} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">{index + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{teacher.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{teacher.students} students</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${getRatingColor(teacher.rating)}`}>{teacher.rating}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">rating</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
              <BuildingOfficeIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Partner Schools</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.overview.totalSchools}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-pink-100 dark:bg-pink-900/30 rounded-xl">
              <ClockIcon className="h-6 w-6 text-pink-600 dark:text-pink-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Course Duration</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">10.5 weeks</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
              <CheckCircleIcon className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Completion Rate</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">87%</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-teal-100 dark:bg-teal-900/30 rounded-xl">
              <CalendarIcon className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Courses</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.overview.totalCourses}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChartBarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BookOpenIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarIcon,
  BellIcon,
  CogIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import Chart from '@/components/ui/Chart';

// Mock data for different roles
const mockData = {
  admin: {
    stats: [
      { label: 'Total Schools', value: 47, change: 12, icon: UserGroupIcon },
      { label: 'Active Students', value: 1247, change: 8, icon: AcademicCapIcon },
      { label: 'Total Teachers', value: 89, change: 5, icon: BookOpenIcon },
      { label: 'Courses Offered', value: 12, change: 2, icon: ChartBarIcon }
    ],
    recentActivity: [
      { type: 'school', action: 'New school registered', time: '2 hours ago', status: 'success' },
      { type: 'teacher', action: 'Teacher profile updated', time: '4 hours ago', status: 'info' },
      { type: 'course', action: 'New course added', time: '6 hours ago', status: 'success' },
      { type: 'student', action: 'Student enrollment', time: '8 hours ago', status: 'info' }
    ],
    chartData: [
      { label: 'Jan', value: 850, change: 5 },
      { label: 'Feb', value: 920, change: 8 },
      { label: 'Mar', value: 1247, change: 12 }
    ]
  },
  teacher: {
    stats: [
      { label: 'My Classes', value: 5, change: 1, icon: BookOpenIcon },
      { label: 'Total Students', value: 125, change: 8, icon: UserGroupIcon },
      { label: 'Lessons Taught', value: 156, change: 12, icon: AcademicCapIcon },
      { label: 'Avg Rating', value: 4.6, change: 0.2, icon: ChartBarIcon }
    ],
    recentActivity: [
      { type: 'lesson', action: 'Lesson completed', time: '1 hour ago', status: 'success' },
      { type: 'assignment', action: 'Assignment graded', time: '3 hours ago', status: 'info' },
      { type: 'student', action: 'Student progress', time: '5 hours ago', status: 'warning' },
      { type: 'class', action: 'New class scheduled', time: '1 day ago', status: 'success' }
    ],
    chartData: [
      { label: 'Week 1', value: 65, change: 5 },
      { label: 'Week 2', value: 68, change: 3 },
      { label: 'Week 3', value: 72, change: 4 },
      { label: 'Week 4', value: 75, change: 3 },
      { label: 'Week 5', value: 78, change: 3 },
      { label: 'Week 6', value: 80, change: 2 }
    ]
  },
  student: {
    stats: [
      { label: 'Enrolled Courses', value: 4, change: 1, icon: BookOpenIcon },
      { label: 'Completed Lessons', value: 23, change: 3, icon: CheckCircleIcon },
      { label: 'Assignments Done', value: 18, change: 2, icon: AcademicCapIcon },
      { label: 'Current Grade', value: 85, change: 0.1, icon: ChartBarIcon }
    ],
    recentActivity: [
      { type: 'lesson', action: 'Lesson completed', time: '30 min ago', status: 'success' },
      { type: 'assignment', action: 'Assignment submitted', time: '2 hours ago', status: 'info' },
      { type: 'quiz', action: 'Quiz taken', time: '1 day ago', status: 'success' },
      { type: 'course', action: 'New course available', time: '2 days ago', status: 'info' }
    ],
    chartData: [
      { label: 'Python', value: 85, change: 5 },
      { label: 'Web Dev', value: 72, change: 8 },
      { label: 'Scratch', value: 90, change: 3 },
      { label: 'UI/UX', value: 68, change: 12 }
    ]
  },
  schoolPartner: {
    stats: [
      { label: 'Total Students', value: 450, change: 25, icon: UserGroupIcon },
      { label: 'Active Courses', value: 8, change: 2, icon: BookOpenIcon },
      { label: 'Completion Rate', value: 85, change: 5, icon: ChartBarIcon },
      { label: 'Avg Performance', value: 78, change: 3, icon: AcademicCapIcon }
    ],
    recentActivity: [
      { type: 'enrollment', action: 'New student enrolled', time: '1 hour ago', status: 'success' },
      { type: 'course', action: 'Course progress update', time: '3 hours ago', status: 'info' },
      { type: 'teacher', action: 'Teacher assigned', time: '1 day ago', status: 'success' },
      { type: 'report', action: 'Monthly report ready', time: '2 days ago', status: 'info' }
    ],
    chartData: [
      { label: 'Grade 8', value: 85, change: 5 },
      { label: 'Grade 9', value: 78, change: 8 },
      { label: 'Grade 10', value: 82, change: 3 },
      { label: 'Grade 11', value: 75, change: 7 },
      { label: 'Grade 12', value: 88, change: 4 }
    ]
  }
};

export default function OverviewPage() {
  const [currentRole, setCurrentRole] = useState('admin');
  const [data, setData] = useState(mockData.admin);

  useEffect(() => {
    // In a real app, this would be based on user authentication
    setData(mockData[currentRole as keyof typeof mockData]);
  }, [currentRole]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
      default:
        return <InformationCircleIcon className="h-4 w-4 text-blue-500" />;
    }
  };

  const getChangeIcon = (change: number) => {
    return change > 0 ? (
      <ArrowTrendingUpIcon className="h-4 w-4 text-green-500" />
    ) : (
      <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
    );
  };

  const getChangeColor = (change: number) => {
    return change > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Welcome back! Here&apos;s what&apos;s happening today.</p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center space-x-3">
          <select
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
            <option value="schoolPartner">School Partner</option>
          </select>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <BellIcon className="h-5 w-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <CogIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.stats.map((stat, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                  <stat.icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                </div>
              </div>
              <div className="flex items-center text-green-500">
                {getChangeIcon(stat.change)}
                <span className={`text-sm font-medium ml-1 ${getChangeColor(stat.change)}`}>
                  {stat.change > 0 ? '+' : ''}{stat.change}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Chart */}
        <div className="lg:col-span-2">
          <Chart
            title="Progress Overview"
            data={data.chartData}
            type="bar"
            height={300}
            showValues={true}
            showChange={true}
          />
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.recentActivity.map((activity, index) => (
              <div key={index} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(activity.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {activity.action}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {activity.time}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentRole === 'admin' && (
            <>
              <Link href="/dashboard/schools" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <UserGroupIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Manage Schools</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">View and edit schools</p>
                  </div>
                </div>
              </Link>
              <Link href="/dashboard/teachers" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <AcademicCapIcon className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Manage Teachers</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Teacher administration</p>
                  </div>
                </div>
              </Link>
            </>
          )}
          
          {currentRole === 'teacher' && (
            <>
              <Link href="/dashboard/classes" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <BookOpenIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">My Classes</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Manage your classes</p>
                  </div>
                </div>
              </Link>
              <Link href="/dashboard/assignments" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <AcademicCapIcon className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Assignments</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Create and grade</p>
                  </div>
                </div>
              </Link>
            </>
          )}

          {currentRole === 'student' && (
            <>
              <Link href="/dashboard/courses" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <BookOpenIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">My Courses</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Continue learning</p>
                  </div>
                </div>
              </Link>
              <Link href="/dashboard/progress" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <ChartBarIcon className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">My Progress</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Track performance</p>
                  </div>
                </div>
              </Link>
            </>
          )}

          {currentRole === 'schoolPartner' && (
            <>
              <Link href="/dashboard/students" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <UserGroupIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Students</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Manage enrollment</p>
                  </div>
                </div>
              </Link>
              <Link href="/dashboard/reports" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                <div className="flex items-center">
                  <ChartBarIcon className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Reports</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">View analytics</p>
                  </div>
                </div>
              </Link>
            </>
          )}

          <Link href="/dashboard/settings" className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <CogIcon className="h-8 w-8 text-gray-600 dark:text-gray-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Settings</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Configure account</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upcoming Events</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <CalendarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Python Programming Workshop</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Tomorrow at 10:00 AM</p>
              </div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                Workshop
              </span>
            </div>
          </div>
          <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <CalendarIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Web Development Assignment Due</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">March 25, 2024</p>
              </div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                Due Soon
              </span>
            </div>
          </div>
          <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <CalendarIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Monthly Progress Review</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">March 30, 2024</p>
              </div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                Review
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
'use client'

import { useAuth } from '@/contexts/auth-context'
import { 
  UserGroupIcon, 
  AcademicCapIcon, 
  BookOpenIcon, 
  ChartBarIcon, 
  CogIcon,
  BuildingOfficeIcon,
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
  EyeIcon,
  PencilIcon
} from '@heroicons/react/24/outline'
import Link from 'next/link'

// Mock data for different roles
const mockAdminStats = [
  { name: 'Total Schools', value: '24', change: '+12%', changeType: 'positive' },
  { name: 'Active Teachers', value: '156', change: '+8%', changeType: 'positive' },
  { name: 'Total Students', value: '1,234', change: '+15%', changeType: 'positive' },
  { name: 'Revenue', value: '₦2.4M', change: '+23%', changeType: 'positive' }
]

const mockTeacherStats = [
  { name: 'My Classes', value: '4', change: '+1', changeType: 'positive' },
  { name: 'Total Students', value: '89', change: '+5', changeType: 'positive' },
  { name: 'Assignments', value: '12', change: '+3', changeType: 'positive' },
  { name: 'Avg. Performance', value: '87%', change: '+2%', changeType: 'positive' }
]

const mockStudentStats = [
  { name: 'Enrolled Courses', value: '6', change: '+1', changeType: 'positive' },
  { name: 'Completed Lessons', value: '45', change: '+8', changeType: 'positive' },
  { name: 'Pending Assignments', value: '3', change: '-2', changeType: 'positive' },
  { name: 'Overall Grade', value: 'A-', change: '+5%', changeType: 'positive' }
]

export default function DashboardPage() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please sign in to access the dashboard.</p>
          <Link 
            href="/auth/login" 
            className="mt-4 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  const getRoleSpecificContent = () => {
    const stats = profile.role === 'admin' ? mockAdminStats : 
                  profile.role === 'teacher' ? mockTeacherStats : mockStudentStats

    const quickActions = profile.role === 'admin' ? [
      { name: 'Add School', href: '/dashboard/schools/add', icon: BuildingOfficeIcon, color: 'bg-blue-600' },
      { name: 'Manage Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon, color: 'bg-green-600' },
      { name: 'View Analytics', href: '/dashboard/analytics', icon: ChartBarIcon, color: 'bg-purple-600' },
      { name: 'System Settings', href: '/dashboard/settings', icon: CogIcon, color: 'bg-gray-600' }
    ] : profile.role === 'teacher' ? [
      { name: 'Add Student', href: '/dashboard/students/add', icon: UserGroupIcon, color: 'bg-blue-600' },
      { name: 'Create Assignment', href: '/dashboard/assignments/create', icon: ClipboardDocumentListIcon, color: 'bg-green-600' },
      { name: 'View Progress', href: '/dashboard/progress', icon: ChartBarIcon, color: 'bg-purple-600' },
      { name: 'My Classes', href: '/dashboard/classes', icon: BookOpenIcon, color: 'bg-orange-600' }
    ] : [
      { name: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon, color: 'bg-blue-600' },
      { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, color: 'bg-green-600' },
      { name: 'My Progress', href: '/dashboard/progress', icon: ChartBarIcon, color: 'bg-purple-600' },
      { name: 'Schedule', href: '/dashboard/schedule', icon: PresentationChartLineIcon, color: 'bg-orange-600' }
    ]

    return (
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                Welcome back, {profile.full_name}!
              </h1>
              <p className="text-blue-100 text-sm sm:text-base capitalize">
                {profile.role} Dashboard
              </p>
            </div>
            <div className="mt-4 sm:mt-0 flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-blue-100 capitalize">Active {profile.role}</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  stat.changeType === 'positive' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {stat.change}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
            <div className="w-12 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon
              return (
                <Link
                  key={index}
                  href={action.href}
                  className="group flex items-center p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all duration-300 border border-gray-200 hover:border-gray-300"
                >
                  <div className={`p-3 ${action.color} rounded-xl mr-4 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                      {action.name}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Role-specific content */}
        {profile.role === 'admin' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent School Registrations</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      School Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Students
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      St. Mary&apos;s Academy
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      john@stmarys.edu.ng
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      250
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button className="text-blue-600 hover:text-blue-900">
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button className="text-green-600 hover:text-green-900">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {profile.role === 'teacher' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">My Students</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((student) => (
                <div key={student} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold">S{student}</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">Student {student}</h4>
                      <p className="text-sm text-gray-500">Grade A</p>
                    </div>
                  </div>
                  <div className="mt-3 flex space-x-2">
                    <button className="text-blue-600 hover:text-blue-900 text-sm">
                      View Progress
                    </button>
                    <button className="text-green-600 hover:text-green-900 text-sm">
                      Assign Work
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {profile.role === 'student' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Courses</h3>
            <div className="space-y-4">
              {[
                { name: 'Python Programming', progress: 75, status: 'In Progress' },
                { name: 'Web Development', progress: 90, status: 'Completed' },
                { name: 'Data Structures', progress: 45, status: 'In Progress' }
              ].map((course, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{course.name}</h4>
                    <div className="mt-2 flex items-center space-x-4">
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 rounded-full transition-all duration-300" 
                          style={{ width: `${course.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-600">{course.progress}%</span>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    course.status === 'Completed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {course.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {getRoleSpecificContent()}
    </div>
  )
} 
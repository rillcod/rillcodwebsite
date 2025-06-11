'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  BookOpenIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  CalendarIcon,
  ClockIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  AcademicCapIcon,
  ChartBarIcon,
  VideoCameraIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

// Mock data for classes
const mockClasses = [
  {
    id: '1',
    name: 'Python Programming - Grade 10A',
    course: 'Python Programming',
    teacher: 'Dr. Sarah Johnson',
    students: 25,
    schedule: 'Monday, Wednesday, Friday',
    time: '09:00 AM - 10:30 AM',
    room: 'Computer Lab 1',
    status: 'active',
    progress: 75,
    nextLesson: 'Introduction to Functions',
    lastUpdated: new Date('2024-03-15')
  },
  {
    id: '2',
    name: 'Web Development - Grade 11B',
    course: 'Web Development',
    teacher: 'Mr. David Wilson',
    students: 18,
    schedule: 'Tuesday, Thursday',
    time: '02:00 PM - 03:30 PM',
    room: 'Computer Lab 2',
    status: 'active',
    progress: 60,
    nextLesson: 'CSS Grid Layout',
    lastUpdated: new Date('2024-03-14')
  },
  {
    id: '3',
    name: 'Scratch Programming - Grade 8A',
    course: 'Scratch Programming',
    teacher: 'Mr. Ahmed Hassan',
    students: 32,
    schedule: 'Monday, Wednesday',
    time: '11:00 AM - 12:30 PM',
    room: 'Computer Lab 3',
    status: 'active',
    progress: 45,
    nextLesson: 'Creating Animations',
    lastUpdated: new Date('2024-03-13')
  },
  {
    id: '4',
    name: 'UI/UX Design - Grade 12A',
    course: 'UI/UX Design',
    teacher: 'Ms. Chioma Okonkwo',
    students: 15,
    schedule: 'Friday',
    time: '01:00 PM - 04:00 PM',
    room: 'Design Studio',
    status: 'active',
    progress: 85,
    nextLesson: 'User Research Methods',
    lastUpdated: new Date('2024-03-12')
  },
  {
    id: '5',
    name: 'Flutter Development - Grade 12B',
    course: 'Flutter Development',
    teacher: 'Mr. Emeka Nwosu',
    students: 12,
    schedule: 'Tuesday, Thursday',
    time: '04:00 PM - 05:30 PM',
    room: 'Mobile Lab',
    status: 'pending',
    progress: 20,
    nextLesson: 'State Management',
    lastUpdated: new Date('2024-03-10')
  }
];

export default function ClassesPage() {
  const [classes, _setClasses] = useState(mockClasses);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCourse, setFilterCourse] = useState('all');

  // Get unique courses for filter
  const courses = [...new Set(classes.map(cls => cls.course))];

  // Filter classes
  const filteredClasses = classes.filter(cls => {
    const matchesSearch = cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cls.teacher.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cls.course.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || cls.status === filterStatus;
    const matchesCourse = filterCourse === 'all' || cls.course === filterCourse;
    
    return matchesSearch && matchesStatus && matchesCourse;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'pending':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      case 'completed':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'text-green-600 dark:text-green-400';
    if (progress >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Classes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your teaching classes and track progress</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/dashboard/classes/add"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Class
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <AcademicCapIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Classes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{classes.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <UserGroupIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Students</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {classes.reduce((sum, cls) => sum + cls.students, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <ChartBarIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Progress</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {Math.round(classes.reduce((sum, cls) => sum + cls.progress, 0) / classes.length)}%
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
              <ClockIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Classes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {classes.filter(cls => cls.status === 'active').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search classes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>

          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
          >
            <option value="all">All Courses</option>
            {courses.map(course => (
              <option key={course} value={course}>{course}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Classes Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredClasses.map((cls) => (
          <div key={cls.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{cls.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{cls.course}</p>
                </div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(cls.status)}`}>
                  {cls.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Students</p>
                  <p className="font-medium text-gray-900 dark:text-white">{cls.students}</p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Progress</p>
                  <p className={`font-medium ${getProgressColor(cls.progress)}`}>{cls.progress}%</p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Schedule</p>
                  <p className="font-medium text-gray-900 dark:text-white">{cls.schedule}</p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Time</p>
                  <p className="font-medium text-gray-900 dark:text-white">{cls.time}</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Progress</span>
                  <span className={`font-medium ${getProgressColor(cls.progress)}`}>{cls.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      cls.progress >= 80 ? 'bg-green-500' :
                      cls.progress >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${cls.progress}%` }}
                  ></div>
                </div>
              </div>

              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Next Lesson</p>
                <p className="font-medium text-gray-900 dark:text-white">{cls.nextLesson}</p>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    Updated {cls.lastUpdated.toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/dashboard/classes/${cls.id}`}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <EyeIcon className="h-4 w-4 mr-1" />
                    View
                  </Link>
                  <Link
                    href={`/dashboard/classes/${cls.id}/edit`}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <PencilIcon className="h-4 w-4 mr-1" />
                    Edit
                  </Link>
                  <button
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <TrashIcon className="h-4 w-4 mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredClasses.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <AcademicCapIcon className="h-16 w-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium">No classes found</p>
          <p className="text-sm">Try adjusting your search criteria or create a new class</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <VideoCameraIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Start Live Class</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Begin virtual session</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <DocumentTextIcon className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Create Assignment</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">New homework task</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <ChartBarIcon className="h-8 w-8 text-purple-600 dark:text-purple-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">View Progress</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Student analytics</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <BookOpenIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Lesson Plans</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Manage curriculum</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
} 
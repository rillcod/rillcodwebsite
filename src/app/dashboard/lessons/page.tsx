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
  ClockIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  VideoCameraIcon,
  PlayIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

// Mock data for lessons
const mockLessons = [
  {
    id: '1',
    title: 'Introduction to Python Variables',
    course: 'Python Programming',
    class: 'Python Programming - Grade 10A',
    duration: 45,
    type: 'video',
    status: 'completed',
    date: new Date('2024-03-15'),
    students: 25,
    completed: 23,
    materials: ['video', 'slides', 'exercise'],
    description: 'Learn about variables, data types, and basic operations in Python'
  },
  {
    id: '2',
    title: 'HTML Structure and Elements',
    course: 'Web Development',
    class: 'Web Development - Grade 11B',
    duration: 60,
    type: 'interactive',
    status: 'active',
    date: new Date('2024-03-16'),
    students: 18,
    completed: 12,
    materials: ['video', 'code', 'quiz'],
    description: 'Understanding HTML document structure and semantic elements'
  },
  {
    id: '3',
    title: 'Creating Animations in Scratch',
    course: 'Scratch Programming',
    class: 'Scratch Programming - Grade 8A',
    duration: 30,
    type: 'hands-on',
    status: 'scheduled',
    date: new Date('2024-03-17'),
    students: 32,
    completed: 0,
    materials: ['tutorial', 'project'],
    description: 'Learn to create simple animations using Scratch blocks'
  },
  {
    id: '4',
    title: 'User Research Methods',
    course: 'UI/UX Design',
    class: 'UI/UX Design - Grade 12A',
    duration: 90,
    type: 'workshop',
    status: 'active',
    date: new Date('2024-03-14'),
    students: 15,
    completed: 8,
    materials: ['slides', 'template', 'case-study'],
    description: 'Conducting effective user research and gathering insights'
  },
  {
    id: '5',
    title: 'State Management in Flutter',
    course: 'Flutter Development',
    class: 'Flutter Development - Grade 12B',
    duration: 75,
    type: 'coding',
    status: 'scheduled',
    date: new Date('2024-03-18'),
    students: 12,
    completed: 0,
    materials: ['video', 'code', 'documentation'],
    description: 'Understanding state management patterns in Flutter apps'
  }
];

export default function LessonsPage() {
  const [lessons, _setLessons] = useState(mockLessons);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Filter lessons
  const filteredLessons = lessons.filter(lesson => {
    const matchesSearch = lesson.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lesson.course.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lesson.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || lesson.status === filterStatus;
    const matchesType = filterType === 'all' || lesson.type === filterType;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'active':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
      case 'scheduled':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      case 'draft':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <VideoCameraIcon className="h-5 w-5" />;
      case 'interactive':
        return <PlayIcon className="h-5 w-5" />;
      case 'hands-on':
        return <BookOpenIcon className="h-5 w-5" />;
      case 'workshop':
        return <UserGroupIcon className="h-5 w-5" />;
      case 'coding':
        return <DocumentTextIcon className="h-5 w-5" />;
      default:
        return <BookOpenIcon className="h-5 w-5" />;
    }
  };

  const getCompletionRate = (completed: number, total: number) => {
    return Math.round((completed / total) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Lessons</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage and track lesson progress</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/dashboard/lessons/add"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Lesson
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <BookOpenIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Lessons</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{lessons.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Completed</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {lessons.filter(l => l.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <ClockIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {lessons.filter(l => l.status === 'active').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <UserGroupIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Completion</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {Math.round(lessons.reduce((sum, l) => sum + getCompletionRate(l.completed, l.students), 0) / lessons.length)}%
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
              placeholder="Search lessons..."
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
            <option value="completed">Completed</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
          >
            <option value="all">All Types</option>
            <option value="video">Video</option>
            <option value="interactive">Interactive</option>
            <option value="hands-on">Hands-on</option>
            <option value="workshop">Workshop</option>
            <option value="coding">Coding</option>
          </select>
        </div>
      </div>

      {/* Lessons List */}
      <div className="space-y-4">
        {filteredLessons.map((lesson) => (
          <div key={lesson.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="text-gray-400 dark:text-gray-500">
                          {getTypeIcon(lesson.type)}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{lesson.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{lesson.course} • {lesson.class}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{lesson.description}</p>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(lesson.status)}`}>
                      {lesson.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Duration</p>
                      <p className="font-medium text-gray-900 dark:text-white">{lesson.duration} min</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Students</p>
                      <p className="font-medium text-gray-900 dark:text-white">{lesson.students}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Completed</p>
                      <p className="font-medium text-gray-900 dark:text-white">{lesson.completed}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Date</p>
                      <p className="font-medium text-gray-900 dark:text-white">{lesson.date.toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Completion Rate</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {getCompletionRate(lesson.completed, lesson.students)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-300 bg-blue-500"
                        style={{ width: `${getCompletionRate(lesson.completed, lesson.students)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {lesson.materials.map((material, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {material}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-6 lg:mt-0 lg:ml-6 flex items-center space-x-2">
                  <Link
                    href={`/dashboard/lessons/${lesson.id}`}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <EyeIcon className="h-4 w-4 mr-1" />
                    View
                  </Link>
                  <Link
                    href={`/dashboard/lessons/${lesson.id}/edit`}
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

      {filteredLessons.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <BookOpenIcon className="h-16 w-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium">No lessons found</p>
          <p className="text-sm">Try adjusting your search criteria or create a new lesson</p>
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
                <p className="font-medium text-gray-900 dark:text-white">Record Lesson</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Create video content</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <DocumentTextIcon className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Create Quiz</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Assessment tools</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <PlayIcon className="h-8 w-8 text-purple-600 dark:text-purple-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Interactive Demo</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Live coding session</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <UserGroupIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Group Activity</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Collaborative learning</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
} 
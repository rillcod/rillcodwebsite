'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ClipboardDocumentListIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// Mock data for assignments
const mockAssignments = [
  {
    id: '1',
    title: 'Python Variables and Data Types',
    course: 'Python Programming',
    class: 'Python Programming - Grade 10A',
    type: 'coding',
    status: 'submitted',
    dueDate: new Date('2024-03-20'),
    assignedDate: new Date('2024-03-15'),
    students: 25,
    submitted: 23,
    graded: 20,
    avgScore: 85,
    description: 'Create a Python program that demonstrates different variable types and data structures',
    attachments: ['assignment.pdf', 'sample_code.py']
  },
  {
    id: '2',
    title: 'HTML Portfolio Website',
    course: 'Web Development',
    class: 'Web Development - Grade 11B',
    type: 'project',
    status: 'active',
    dueDate: new Date('2024-03-25'),
    assignedDate: new Date('2024-03-16'),
    students: 18,
    submitted: 8,
    graded: 5,
    avgScore: 78,
    description: 'Design and develop a personal portfolio website using HTML and CSS',
    attachments: ['requirements.pdf', 'design_guide.pdf']
  },
  {
    id: '3',
    title: 'Scratch Animation Project',
    course: 'Scratch Programming',
    class: 'Scratch Programming - Grade 8A',
    type: 'creative',
    status: 'draft',
    dueDate: new Date('2024-03-30'),
    assignedDate: new Date('2024-03-17'),
    students: 32,
    submitted: 0,
    graded: 0,
    avgScore: 0,
    description: 'Create an animated story or game using Scratch programming blocks',
    attachments: ['project_guidelines.pdf']
  },
  {
    id: '4',
    title: 'User Research Report',
    course: 'UI/UX Design',
    class: 'UI/UX Design - Grade 12A',
    type: 'research',
    status: 'submitted',
    dueDate: new Date('2024-03-18'),
    assignedDate: new Date('2024-03-10'),
    students: 15,
    submitted: 15,
    graded: 12,
    avgScore: 92,
    description: 'Conduct user research and write a comprehensive report with findings',
    attachments: ['research_template.docx', 'interview_questions.pdf']
  },
  {
    id: '5',
    title: 'Flutter State Management',
    course: 'Flutter Development',
    class: 'Flutter Development - Grade 12B',
    type: 'coding',
    status: 'active',
    dueDate: new Date('2024-03-28'),
    assignedDate: new Date('2024-03-18'),
    students: 12,
    submitted: 3,
    graded: 1,
    avgScore: 88,
    description: 'Implement state management in a Flutter app using Provider or Bloc',
    attachments: ['flutter_guide.pdf', 'starter_code.zip']
  }
];

export default function AssignmentsPage() {
  const [assignments, _setAssignments] = useState(mockAssignments);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // Filter assignments
  const filteredAssignments = assignments.filter(assignment => {
    const matchesSearch = assignment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.course.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         assignment.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || assignment.status === filterStatus;
    const matchesType = filterType === 'all' || assignment.type === filterType;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'active':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
      case 'draft':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
      case 'overdue':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'coding':
        return <ClipboardDocumentListIcon className="h-5 w-5" />;
      case 'project':
        return <ClipboardDocumentListIcon className="h-5 w-5" />;
      case 'creative':
        return <ClipboardDocumentListIcon className="h-5 w-5" />;
      case 'research':
        return <ClipboardDocumentListIcon className="h-5 w-5" />;
      default:
        return <ClipboardDocumentListIcon className="h-5 w-5" />;
    }
  };

  const getSubmissionRate = (submitted: number, total: number) => {
    return Math.round((submitted / total) * 100);
  };

  const isOverdue = (dueDate: Date) => {
    return new Date() > dueDate;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assignments</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage and track assignment progress</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/dashboard/assignments/add"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Create Assignment
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <ClipboardDocumentListIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Assignments</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{assignments.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Submitted</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {assignments.filter(a => a.status === 'submitted').length}
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
                {assignments.filter(a => a.status === 'active').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <ClipboardDocumentListIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Score</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {Math.round(assignments.reduce((sum, a) => sum + a.avgScore, 0) / assignments.length)}%
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
              placeholder="Search assignments..."
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
            <option value="submitted">Submitted</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="overdue">Overdue</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all duration-200"
          >
            <option value="all">All Types</option>
            <option value="coding">Coding</option>
            <option value="project">Project</option>
            <option value="creative">Creative</option>
            <option value="research">Research</option>
          </select>
        </div>
      </div>

      {/* Assignments List */}
      <div className="space-y-4">
        {filteredAssignments.map((assignment) => (
          <div key={assignment.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="text-gray-400 dark:text-gray-500">
                          {getTypeIcon(assignment.type)}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{assignment.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{assignment.course} • {assignment.class}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{assignment.description}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status)}`}>
                        {assignment.status}
                      </span>
                      {isOverdue(assignment.dueDate) && (
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Students</p>
                      <p className="font-medium text-gray-900 dark:text-white">{assignment.students}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Submitted</p>
                      <p className="font-medium text-gray-900 dark:text-white">{assignment.submitted}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Graded</p>
                      <p className="font-medium text-gray-900 dark:text-white">{assignment.graded}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Avg Score</p>
                      <p className="font-medium text-gray-900 dark:text-white">{assignment.avgScore}%</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Submission Rate</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {getSubmissionRate(assignment.submitted, assignment.students)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-300 bg-blue-500"
                        style={{ width: `${getSubmissionRate(assignment.submitted, assignment.students)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        Due {assignment.dueDate.toLocaleDateString()}
                      </div>
                      <div className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1" />
                        Assigned {assignment.assignedDate.toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {assignment.attachments.map((attachment, index) => (
                        <span key={index} className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {attachment}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 lg:mt-0 lg:ml-6 flex items-center space-x-2">
                  <Link
                    href={`/dashboard/assignments/${assignment.id}`}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <EyeIcon className="h-4 w-4 mr-1" />
                    View
                  </Link>
                  <Link
                    href={`/dashboard/assignments/${assignment.id}/edit`}
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

      {filteredAssignments.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <ClipboardDocumentListIcon className="h-16 w-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium">No assignments found</p>
          <p className="text-sm">Try adjusting your search criteria or create a new assignment</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <ClipboardDocumentListIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Create Assignment</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">New homework task</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Grade Submissions</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Review student work</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600 dark:text-yellow-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Send Reminders</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Notify students</p>
              </div>
            </div>
          </button>

          <button className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
            <div className="flex items-center">
              <ClipboardDocumentListIcon className="h-8 w-8 text-purple-600 dark:text-purple-400 mr-3" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">View Analytics</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Performance insights</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
} 
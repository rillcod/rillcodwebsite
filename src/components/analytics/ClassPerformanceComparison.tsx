'use client'

import { useState } from 'react'
import { 
  ArrowTrendingUpIcon, 
  ArrowTrendingDownIcon, 
  UserGroupIcon,
  AcademicCapIcon,
  ChartBarIcon,
  StarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import dynamic from 'next/dynamic'

const Bar = dynamic(() => import('react-chartjs-2').then(mod => mod.Bar), { ssr: false })
const Line = dynamic(() => import('react-chartjs-2').then(mod => mod.Line), { ssr: false })
const Radar = dynamic(() => import('react-chartjs-2').then(mod => mod.Radar), { ssr: false })

interface ClassPerformanceComparisonProps {
  schoolId: string
}

// Mock data for class performance comparison
const classData = [
  {
    id: '7A',
    name: 'Grade 7A',
    students: 25,
    subjects: {
      scratch: 88,
      python: 75,
      webDev: 82,
      uiux: 78,
      flutter: 80
    },
    attendance: 94,
    engagement: 87,
    improvement: '+12%'
  },
  {
    id: '7B',
    name: 'Grade 7B',
    students: 23,
    subjects: {
      scratch: 85,
      python: 72,
      webDev: 79,
      uiux: 75,
      flutter: 78
    },
    attendance: 91,
    engagement: 82,
    improvement: '+8%'
  },
  {
    id: '8A',
    name: 'Grade 8A',
    students: 28,
    subjects: {
      scratch: 90,
      python: 80,
      webDev: 85,
      uiux: 82,
      flutter: 85
    },
    attendance: 96,
    engagement: 89,
    improvement: '+15%'
  },
  {
    id: '8B',
    name: 'Grade 8B',
    students: 26,
    subjects: {
      scratch: 87,
      python: 78,
      webDev: 83,
      uiux: 80,
      flutter: 83
    },
    attendance: 93,
    engagement: 85,
    improvement: '+10%'
  },
  {
    id: '9A',
    name: 'Grade 9A',
    students: 30,
    subjects: {
      scratch: 92,
      python: 85,
      webDev: 88,
      uiux: 85,
      flutter: 88
    },
    attendance: 97,
    engagement: 91,
    improvement: '+18%'
  },
  {
    id: '9B',
    name: 'Grade 9B',
    students: 27,
    subjects: {
      scratch: 89,
      python: 82,
      webDev: 86,
      uiux: 83,
      flutter: 86
    },
    attendance: 95,
    engagement: 88,
    improvement: '+13%'
  }
]

const subjectNames = ['Scratch', 'Python', 'Web Dev', 'UI/UX', 'Flutter']

export default function ClassPerformanceComparison({ schoolId }: ClassPerformanceComparisonProps) {
  const [selectedClass, setSelectedClass] = useState('all')
  const [selectedSubject, setSelectedSubject] = useState('all')
  const [viewMode, setViewMode] = useState<'bar' | 'line' | 'radar'>('bar')

  const getAverageScore = (classData: any) => {
    const scores = Object.values(classData.subjects) as number[]
    return Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
  }

  const getTopPerformingClass = () => {
    return classData.reduce((best, current) => {
      const bestAvg = getAverageScore(best)
      const currentAvg = getAverageScore(current)
      return currentAvg > bestAvg ? current : best
    })
  }

  const getNeedsImprovementClass = () => {
    return classData.reduce((worst, current) => {
      const worstAvg = getAverageScore(worst)
      const currentAvg = getAverageScore(current)
      return currentAvg < worstAvg ? current : worst
    })
  }

  const chartData = {
    labels: classData.map(c => c.name),
    datasets: [
      {
        label: 'Scratch Programming',
        data: classData.map(c => c.subjects.scratch),
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
        borderWidth: 2,
      },
      {
        label: 'Python Programming',
        data: classData.map(c => c.subjects.python),
        backgroundColor: '#10b981',
        borderColor: '#10b981',
        borderWidth: 2,
      },
      {
        label: 'Web Development',
        data: classData.map(c => c.subjects.webDev),
        backgroundColor: '#f59e0b',
        borderColor: '#f59e0b',
        borderWidth: 2,
      },
      {
        label: 'UI/UX Design',
        data: classData.map(c => c.subjects.uiux),
        backgroundColor: '#8b5cf6',
        borderColor: '#8b5cf6',
        borderWidth: 2,
      },
      {
        label: 'Flutter Development',
        data: classData.map(c => c.subjects.flutter),
        backgroundColor: '#ec4899',
        borderColor: '#ec4899',
        borderWidth: 2,
      },
    ],
  }

  const radarData = {
    labels: subjectNames,
    datasets: classData.slice(0, 3).map((classItem, index) => ({
      label: classItem.name,
      data: [
        classItem.subjects.scratch,
        classItem.subjects.python,
        classItem.subjects.webDev,
        classItem.subjects.uiux,
        classItem.subjects.flutter,
      ],
      backgroundColor: `rgba(${59 + index * 50}, ${130 + index * 30}, ${246 - index * 20}, 0.2)`,
      borderColor: `rgb(${59 + index * 50}, ${130 + index * 30}, ${246 - index * 20})`,
      borderWidth: 2,
    })),
  }

  const lineData = {
    labels: classData.map(c => c.name),
    datasets: [
      {
        label: 'Average Score',
        data: classData.map(c => getAverageScore(c)),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        tension: 0.4,
        fill: true,
      },
      {
        label: 'Attendance Rate',
        data: classData.map(c => c.attendance),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Engagement Score',
        data: classData.map(c => c.engagement),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.4,
        fill: false,
      },
    ],
  }

  const topClass = getTopPerformingClass()
  const needsImprovementClass = getNeedsImprovementClass()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <ChartBarIcon className="h-6 w-6 mr-2 text-blue-600" />
            Class Performance Comparison
          </h2>
          <div className="flex gap-4">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Classes</option>
              {classData.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex border border-gray-300 rounded-md">
              <button
                onClick={() => setViewMode('bar')}
                className={`px-3 py-2 text-sm font-medium ${
                  viewMode === 'bar' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Bar
              </button>
              <button
                onClick={() => setViewMode('line')}
                className={`px-3 py-2 text-sm font-medium ${
                  viewMode === 'line' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Line
              </button>
              <button
                onClick={() => setViewMode('radar')}
                className={`px-3 py-2 text-sm font-medium ${
                  viewMode === 'radar' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Radar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top Performers Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
          <div className="flex items-center mb-4">
            <StarIcon className="h-6 w-6 text-green-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Top Performing Class</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-2">{topClass.name}</p>
          <p className="text-sm text-gray-600 mb-4">Average Score: {getAverageScore(topClass)}%</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Students</p>
              <p className="font-semibold">{topClass.students}</p>
            </div>
            <div>
              <p className="text-gray-600">Attendance</p>
              <p className="font-semibold">{topClass.attendance}%</p>
            </div>
            <div>
              <p className="text-gray-600">Engagement</p>
              <p className="font-semibold">{topClass.engagement}%</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6 border border-yellow-200">
          <div className="flex items-center mb-4">
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Needs Improvement</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 mb-2">{needsImprovementClass.name}</p>
          <p className="text-sm text-gray-600 mb-4">Average Score: {getAverageScore(needsImprovementClass)}%</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Students</p>
              <p className="font-semibold">{needsImprovementClass.students}</p>
            </div>
            <div>
              <p className="text-gray-600">Attendance</p>
              <p className="font-semibold">{needsImprovementClass.attendance}%</p>
            </div>
            <div>
              <p className="text-gray-600">Engagement</p>
              <p className="font-semibold">{needsImprovementClass.engagement}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Visualization */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Performance Visualization</h3>
        <div className="h-96">
          {viewMode === 'bar' && (
            <Bar 
              data={chartData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                  y: { beginAtZero: true, max: 100 },
                  x: { grid: { display: false } }
                },
                animation: { duration: 1500 },
                plugins: {
                  legend: { position: 'top' }
                }
              }} 
            />
          )}
          {viewMode === 'line' && (
            <Line 
              data={lineData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                  y: { beginAtZero: true, max: 100 },
                  x: { grid: { display: false } }
                },
                animation: { duration: 2000 },
                plugins: {
                  legend: { position: 'top' }
                }
              }} 
            />
          )}
          {viewMode === 'radar' && (
            <Radar 
              data={radarData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                  r: { beginAtZero: true, max: 100 }
                },
                animation: { duration: 1500 },
                plugins: {
                  legend: { position: 'top' }
                }
              }} 
            />
          )}
        </div>
      </div>

      {/* Detailed Class Comparison Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Detailed Class Comparison</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Students</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scratch</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Python</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Web Dev</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UI/UX</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Flutter</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attendance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Engagement</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {classData.map((classItem) => (
                <tr key={classItem.id} className="hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{classItem.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">{classItem.students}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {getAverageScore(classItem)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      classItem.subjects.scratch >= 85 ? 'bg-green-100 text-green-800' :
                      classItem.subjects.scratch >= 75 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {classItem.subjects.scratch}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      classItem.subjects.python >= 85 ? 'bg-green-100 text-green-800' :
                      classItem.subjects.python >= 75 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {classItem.subjects.python}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      classItem.subjects.webDev >= 85 ? 'bg-green-100 text-green-800' :
                      classItem.subjects.webDev >= 75 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {classItem.subjects.webDev}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      classItem.subjects.uiux >= 85 ? 'bg-green-100 text-green-800' :
                      classItem.subjects.uiux >= 75 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {classItem.subjects.uiux}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      classItem.subjects.flutter >= 85 ? 'bg-green-100 text-green-800' :
                      classItem.subjects.flutter >= 75 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {classItem.subjects.flutter}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      classItem.attendance >= 95 ? 'bg-green-100 text-green-800' :
                      classItem.attendance >= 90 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {classItem.attendance}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      classItem.engagement >= 85 ? 'bg-green-100 text-green-800' :
                      classItem.engagement >= 75 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {classItem.engagement}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <ArrowTrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
                      <span className="text-sm font-medium text-green-600">{classItem.improvement}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">Class Performance Recommendations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start">
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Grade 9A Excellence</p>
              <p className="text-sm text-gray-600">Highest performing class - consider sharing their strategies with other classes</p>
            </div>
          </div>
          <div className="flex items-start">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Grade 7B Support Needed</p>
              <p className="text-sm text-gray-600">Lowest performing class - implement additional support and mentoring</p>
            </div>
          </div>
          <div className="flex items-start">
            <ArrowTrendingUpIcon className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Consistent Improvement</p>
              <p className="text-sm text-gray-600">All classes showing positive trends - maintain current teaching methods</p>
            </div>
          </div>
          <div className="flex items-start">
            <UserGroupIcon className="h-5 w-5 text-purple-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Peer Learning</p>
              <p className="text-sm text-gray-600">Implement cross-class collaboration to boost overall performance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 
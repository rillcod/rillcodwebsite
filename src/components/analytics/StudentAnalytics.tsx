// @refresh reset
'use client'

import { useState } from 'react'
import { 
  ArrowTrendingUpIcon, 
  ArrowTrendingDownIcon, 
  UserGroupIcon,
  ClockIcon,
  AcademicCapIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  MinusIcon
} from '@/lib/icons'
import dynamic from 'next/dynamic'

const Line = dynamic(() => import('react-chartjs-2').then(mod => mod.Line), { ssr: false })
const Bar = dynamic(() => import('react-chartjs-2').then(mod => mod.Bar), { ssr: false })
const Doughnut = dynamic(() => import('react-chartjs-2').then(mod => mod.Doughnut), { ssr: false })

interface StudentAnalyticsProps {
  school_id: string
}

// Mock data for detailed analytics
const weeklyTrends = {
  labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
  datasets: [
    {
      label: 'Scratch Programming',
      data: [75, 78, 82, 85, 88, 90],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
    },
    {
      label: 'Python Programming',
      data: [65, 68, 72, 75, 78, 80],
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      tension: 0.4,
    },
    {
      label: 'Web Development',
      data: [70, 73, 77, 80, 83, 85],
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      tension: 0.4,
    },
  ],
}

const attendanceData = {
  labels: ['Present', 'Absent', 'Late', 'Excused'],
  datasets: [
    {
      data: [85, 8, 5, 2],
      backgroundColor: ['#22c55e', '#ef4444', '#f59e0b', '#6b7280'],
    },
  ],
}

const engagementMetrics = {
  labels: ['Very High', 'High', 'Medium', 'Low', 'Very Low'],
  datasets: [
    {
      label: 'Student Engagement',
      data: [25, 35, 25, 10, 5],
      backgroundColor: ['#22c55e', '#10b981', '#f59e0b', '#f97316', '#ef4444'],
    },
  ],
}

const timeSpentData = {
  labels: ['0-30 min', '30-60 min', '1-2 hours', '2-4 hours', '4+ hours'],
  datasets: [
    {
      label: 'Daily Study Time',
      data: [10, 25, 35, 20, 10],
      backgroundColor: '#6366f1',
    },
  ],
}

export default function StudentAnalytics({ school_id }: StudentAnalyticsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [selectedMetric, setSelectedMetric] = useState('performance')

  const performanceInsights = [
    {
      title: 'Top Performing Subject',
      value: 'Scratch Programming',
      change: '+12%',
      trend: 'up',
      description: 'Students show exceptional engagement with visual programming'
    },
    {
      title: 'Needs Improvement',
      value: 'Python Programming',
      change: '-5%',
      trend: 'down',
      description: 'Complex syntax concepts require additional support'
    },
    {
      title: 'Most Improved',
      value: 'Web Development',
      change: '+18%',
      trend: 'up',
      description: 'Hands-on projects increased student motivation'
    }
  ]

  const studentBehaviorMetrics = [
    { metric: 'Average Session Duration', value: '45 minutes', change: '+8%', trend: 'up' },
    { metric: 'Completion Rate', value: '78.5%', change: '+5%', trend: 'up' },
    { metric: 'Assignment Submission', value: '92%', change: '+3%', trend: 'up' },
    { metric: 'Peer Collaboration', value: '65%', change: '-2%', trend: 'down' },
  ]

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') {
      return <ArrowTrendingUpIcon className="h-4 w-4 text-green-500" />
    } else if (trend === 'down') {
      return <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
    }
    return <MinusIcon className="h-4 w-4 text-gray-500" />
  }

  const getStatusColor = (value: string) => {
    const num = parseFloat(value.replace('%', ''))
    if (num >= 80) return 'text-green-600 bg-green-100'
    if (num >= 60) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  return (
    <div className="space-y-8">
      {/* Analytics Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <ChartBarIcon className="h-6 w-6 mr-2 text-blue-600" />
            Detailed Student Analytics
          </h2>
          <div className="flex gap-4">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="performance">Performance</option>
              <option value="engagement">Engagement</option>
              <option value="attendance">Attendance</option>
              <option value="behavior">Behavior</option>
            </select>
          </div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {performanceInsights.map((insight, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{insight.title}</h3>
              {getTrendIcon(insight.trend)}
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-2">{insight.value}</p>
            <p className={`text-sm font-medium ${insight.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {insight.change} from last period
            </p>
            <p className="text-sm text-gray-600 mt-2">{insight.description}</p>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Weekly Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Weekly Performance Trends</h3>
          <Line 
            data={weeklyTrends} 
            options={{
              responsive: true,
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
        </div>

        {/* Attendance Overview */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Attendance Overview</h3>
          <Doughnut 
            data={attendanceData} 
            options={{
              responsive: true,
              animation: { duration: 1500 },
              plugins: {
                legend: { position: 'bottom' }
              }
            }}
          />
        </div>
      </div>

      {/* Student Behavior Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Student Behavior Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {studentBehaviorMetrics.map((metric, index) => (
            <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-600 mb-2">{metric.metric}</p>
              <p className="text-2xl font-bold text-gray-900 mb-1">{metric.value}</p>
              <div className="flex items-center justify-center">
                {getTrendIcon(metric.trend)}
                <span className={`text-sm font-medium ml-1 ${metric.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {metric.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Engagement and Time Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Student Engagement Levels */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Student Engagement Levels</h3>
          <Bar 
            data={engagementMetrics} 
            options={{
              responsive: true,
              scales: { 
                y: { beginAtZero: true },
                x: { grid: { display: false } }
              },
              animation: { duration: 1500 },
            }} 
          />
        </div>

        {/* Daily Study Time Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Daily Study Time Distribution</h3>
          <Bar 
            data={timeSpentData} 
            options={{
              responsive: true,
              scales: { 
                y: { beginAtZero: true },
                x: { grid: { display: false } }
              },
              animation: { duration: 1500 },
            }} 
          />
        </div>
      </div>

      {/* Detailed Performance Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Subject Performance Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Average Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completion Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Count</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[
                { subject: 'Scratch Programming', score: 88, completion: 95, students: 120, trend: '+12%', status: 'Excellent' },
                { subject: 'Python Programming', score: 75, completion: 82, students: 95, trend: '-5%', status: 'Good' },
                { subject: 'Web Development', score: 82, completion: 88, students: 110, trend: '+18%', status: 'Excellent' },
                { subject: 'UI/UX Design', score: 78, completion: 85, students: 85, trend: '+8%', status: 'Good' },
                { subject: 'Flutter Development', score: 80, completion: 87, students: 90, trend: '+15%', status: 'Excellent' },
              ].map((row, index) => (
                <tr key={index} className="hover:bg-gray-50 transition-all">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{row.subject}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(row.score + '%')}`}>
                      {row.score}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(row.completion + '%')}`}>
                      {row.completion}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">{row.students}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {row.trend.startsWith('+') ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
                      ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4 text-red-500 mr-1" />
                      )}
                      <span className={`text-sm font-medium ${row.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                        {row.trend}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      row.status === 'Excellent' ? 'text-green-800 bg-green-100' :
                      row.status === 'Good' ? 'text-blue-800 bg-blue-100' :
                      'text-yellow-800 bg-yellow-100'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">Recommendations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start">
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Continue Scratch Programming Success</p>
              <p className="text-sm text-gray-600">High engagement suggests this approach works well for younger students</p>
            </div>
          </div>
          <div className="flex items-start">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Address Python Programming Challenges</p>
              <p className="text-sm text-gray-600">Consider additional support materials and simplified explanations</p>
            </div>
          </div>
          <div className="flex items-start">
            <ArrowTrendingUpIcon className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Leverage Web Development Success</p>
              <p className="text-sm text-gray-600">Apply similar hands-on project approaches to other subjects</p>
            </div>
          </div>
          <div className="flex items-start">
            <UserGroupIcon className="h-5 w-5 text-purple-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Enhance Peer Collaboration</p>
              <p className="text-sm text-gray-600">Implement more group projects to improve collaboration metrics</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 
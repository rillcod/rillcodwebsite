// @refresh reset
'use client'

import { useState, useEffect } from 'react'
import { UserRole } from '@/types/auth'
import { 
  ArrowTrendingUpIcon, 
  ArrowTrendingDownIcon, 
  UserGroupIcon,
  AcademicCapIcon,
  ChartBarIcon,
  StarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  CalendarIcon,
  TrophyIcon,
  LightBulbIcon,
  CogIcon,
  DocumentTextIcon,
  PlayIcon,
  PauseIcon,
  StopIcon
} from '@/lib/icons'
import dynamic from 'next/dynamic'

const Line = dynamic(() => import('react-chartjs-2').then(mod => mod.Line), { ssr: false })
const Bar = dynamic(() => import('react-chartjs-2').then(mod => mod.Bar), { ssr: false })
const Doughnut = dynamic(() => import('react-chartjs-2').then(mod => mod.Doughnut), { ssr: false })
const Radar = dynamic(() => import('react-chartjs-2').then(mod => mod.Radar), { ssr: false })

interface AdvancedAnalyticsProps {
  school_id: string
  role: UserRole
}

// Mock data for advanced analytics
const learningPathData = {
  labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8'],
  datasets: [
    {
      label: 'Scratch Programming',
      data: [65, 72, 78, 82, 85, 88, 90, 92],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true,
    },
    {
      label: 'Python Programming',
      data: [55, 62, 68, 72, 75, 78, 80, 82],
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      tension: 0.4,
      fill: true,
    },
    {
      label: 'Web Development',
      data: [60, 68, 74, 78, 82, 85, 87, 89],
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      tension: 0.4,
      fill: true,
    },
  ],
}

const skillRadarData = {
  labels: ['Problem Solving', 'Creativity', 'Logic', 'Collaboration', 'Communication', 'Technical Skills'],
  datasets: [
    {
      label: 'Current Skills',
      data: [85, 78, 82, 75, 80, 88],
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      borderColor: '#3b82f6',
      borderWidth: 2,
    },
    {
      label: 'Target Skills',
      data: [95, 90, 92, 88, 85, 95],
      backgroundColor: 'rgba(16, 185, 129, 0.2)',
      borderColor: '#10b981',
      borderWidth: 2,
    },
  ],
}

const projectCompletionData = {
  labels: ['Completed', 'In Progress', 'Review', 'Not Started'],
  datasets: [
    {
      data: [45, 30, 15, 10],
      backgroundColor: ['#22c55e', '#f59e0b', '#3b82f6', '#6b7280'],
    },
  ],
}

const timeSpentData = {
  labels: ['Scratch', 'Python', 'Web Dev', 'UI/UX', 'Flutter', 'Other'],
  datasets: [
    {
      label: 'Hours Spent',
      data: [120, 95, 110, 85, 90, 45],
      backgroundColor: [
        '#3b82f6',
        '#10b981',
        '#f59e0b',
        '#8b5cf6',
        '#ec4899',
        '#6b7280'
      ],
    },
  ],
}

export default function AdvancedAnalytics({ school_id, role }: AdvancedAnalyticsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [selectedView, setSelectedView] = useState('overview')
  const [isLoading, setIsLoading] = useState(false)

  const [analyticsData, setAnalyticsData] = useState({
    totalStudents: 450,
    activeStudents: 420,
    completionRate: 78.5,
    averageScore: 82.5,
    topPerformingSubject: 'Scratch Programming',
    needsImprovement: 'Python Programming',
    recentActivity: 25,
    upcomingDeadlines: 8
  })

  useEffect(() => {
    // Simulate data loading
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
    }, 1000)
  }, [selectedPeriod])

  const getPerformanceInsights = () => {
    return [
      {
        title: 'Learning Acceleration',
        description: 'Students are progressing 15% faster than expected in Scratch Programming',
        type: 'positive',
        icon: ArrowTrendingUpIcon,
        metric: '+15%',
        color: 'green'
      },
      {
        title: 'Collaboration Boost',
        description: 'Group projects increased engagement by 22%',
        type: 'positive',
        icon: UserGroupIcon,
        metric: '+22%',
        color: 'blue'
      },
      {
        title: 'Attention Needed',
        description: 'Python Programming requires additional support materials',
        type: 'warning',
        icon: ExclamationTriangleIcon,
        metric: '-8%',
        color: 'yellow'
      },
      {
        title: 'Innovation Award',
        description: '3 students qualified for regional coding competition',
        type: 'positive',
        icon: TrophyIcon,
        metric: '3',
        color: 'purple'
      }
    ]
  }

  const getStudentProgress = () => {
    return [
      { name: 'Sarah Johnson', grade: 8, progress: 92, subject: 'Scratch', status: 'excellent' },
      { name: 'Michael Chen', grade: 9, progress: 88, subject: 'Python', status: 'good' },
      { name: 'Emma Davis', grade: 7, progress: 85, subject: 'Web Dev', status: 'good' },
      { name: 'Alex Rodriguez', grade: 8, progress: 78, subject: 'UI/UX', status: 'improving' },
      { name: 'Priya Patel', grade: 9, progress: 95, subject: 'Flutter', status: 'excellent' }
    ]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600 bg-green-100'
      case 'good': return 'text-primary bg-blue-100'
      case 'improving': return 'text-yellow-600 bg-yellow-100'
      case 'needs-help': return 'text-red-600 bg-red-100'
      default: return 'text-muted-foreground bg-muted'
    }
  }

  const getMetricColor = (type: string) => {
    switch (type) {
      case 'positive': return 'text-green-600'
      case 'warning': return 'text-yellow-600'
      case 'negative': return 'text-red-600'
      default: return 'text-muted-foreground'
    }
  }

  return (
    <div className="space-y-8">
      {/* Header with Controls */}
      <div className="bg-card rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center">
              <ChartBarIcon className="h-8 w-8 mr-3 text-primary" />
              Advanced Analytics Dashboard
            </h2>
            <p className="text-muted-foreground mt-1">Comprehensive insights for {role} role</p>
          </div>
          <div className="flex gap-4">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-4 py-2 border border-border rounded-md focus:ring-primary focus:border-primary"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
            <select
              value={selectedView}
              onChange={(e) => setSelectedView(e.target.value)}
              className="px-4 py-2 border border-border rounded-md focus:ring-primary focus:border-primary"
            >
              <option value="overview">Overview</option>
              <option value="performance">Performance</option>
              <option value="engagement">Engagement</option>
              <option value="predictions">Predictions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-primary to-primary rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100">Total Students</p>
              <p className="text-3xl font-bold">{analyticsData.totalStudents}</p>
              <p className="text-blue-100 text-sm">+12 this month</p>
            </div>
            <UserGroupIcon className="h-12 w-12 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100">Completion Rate</p>
              <p className="text-3xl font-bold">{analyticsData.completionRate}%</p>
              <p className="text-green-100 text-sm">+5% improvement</p>
            </div>
            <CheckCircleIcon className="h-12 w-12 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100">Average Score</p>
              <p className="text-3xl font-bold">{analyticsData.averageScore}%</p>
              <p className="text-purple-100 text-sm">+8% increase</p>
            </div>
            <TrophyIcon className="h-12 w-12 text-purple-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-primary to-primary rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100">Active Projects</p>
              <p className="text-3xl font-bold">{analyticsData.recentActivity}</p>
              <p className="text-orange-100 text-sm">3 due this week</p>
            </div>
            <DocumentTextIcon className="h-12 w-12 text-orange-200" />
          </div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <LightBulbIcon className="h-5 w-5 mr-2 text-yellow-500" />
            Performance Insights
          </h3>
          <div className="space-y-4">
            {getPerformanceInsights().map((insight, index) => (
              <div key={index} className="flex items-start p-4 bg-background rounded-lg">
                <div className={`p-2 rounded-lg mr-4 ${
                  insight.color === 'green' ? 'bg-green-100' :
                  insight.color === 'blue' ? 'bg-blue-100' :
                  insight.color === 'yellow' ? 'bg-yellow-100' :
                  'bg-purple-100'
                }`}>
                  <insight.icon className={`h-5 w-5 ${
                    insight.color === 'green' ? 'text-green-600' :
                    insight.color === 'blue' ? 'text-primary' :
                    insight.color === 'yellow' ? 'text-yellow-600' :
                    'text-purple-600'
                  }`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground">{insight.title}</h4>
                    <span className={`font-bold ${getMetricColor(insight.type)}`}>
                      {insight.metric}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Learning Path Progress</h3>
          <Line 
            data={learningPathData} 
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
      </div>

      {/* Skill Assessment and Project Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Skill Assessment</h3>
          <Radar 
            data={skillRadarData} 
            options={{
              responsive: true,
              scales: { 
                r: { beginAtZero: true, max: 100 }
              },
              animation: { duration: 1500 },
              plugins: {
                legend: { position: 'top' }
              }
            }} 
          />
        </div>

        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Project Completion Status</h3>
          <Doughnut 
            data={projectCompletionData} 
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

      {/* Time Spent Analysis */}
      <div className="bg-card rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Time Spent by Subject</h3>
        <div className="h-80">
          <Bar 
            data={timeSpentData} 
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: { 
                y: { beginAtZero: true },
                x: { grid: { display: false } }
              },
              animation: { duration: 1500 },
            }} 
          />
        </div>
      </div>

      {/* Top Performing Students */}
      <div className="bg-card rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6">Top Performing Students</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-background">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Student</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Progress</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {getStudentProgress().map((student, index) => (
                <tr key={index} className="hover:bg-background transition-all">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                        <span className="text-primary font-semibold text-sm">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{student.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-foreground">{student.grade}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-foreground">{student.subject}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-16 h-2 bg-muted rounded-full mr-2">
                        <div 
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${student.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{student.progress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(student.status)}`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button className="text-primary hover:text-blue-900 mr-3">
                      <PlayIcon className="h-4 w-4" />
                    </button>
                    <button className="text-green-600 hover:text-green-900">
                      <DocumentTextIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations and Next Steps */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">AI-Powered Recommendations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start">
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Optimize Python Learning</p>
              <p className="text-sm text-muted-foreground">Implement more visual learning aids and hands-on exercises</p>
            </div>
          </div>
          <div className="flex items-start">
            <StarIcon className="h-5 w-5 text-yellow-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Advanced Scratch Projects</p>
              <p className="text-sm text-muted-foreground">Introduce complex game development and animation projects</p>
            </div>
          </div>
          <div className="flex items-start">
            <UserGroupIcon className="h-5 w-5 text-primary mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Peer Mentoring Program</p>
              <p className="text-sm text-muted-foreground">Pair advanced students with beginners for collaborative learning</p>
            </div>
          </div>
          <div className="flex items-start">
            <TrophyIcon className="h-5 w-5 text-purple-500 mr-3 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Competition Preparation</p>
              <p className="text-sm text-muted-foreground">Prepare top students for regional and national coding competitions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 
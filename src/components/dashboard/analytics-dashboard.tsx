'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts'

const weeklyData = [
  { name: 'Mon', students: 24, assignments: 12, attendance: 95 },
  { name: 'Tue', students: 26, assignments: 15, attendance: 92 },
  { name: 'Wed', students: 28, assignments: 18, attendance: 88 },
  { name: 'Thu', students: 25, assignments: 14, attendance: 96 },
  { name: 'Fri', students: 30, assignments: 20, attendance: 90 },
  { name: 'Sat', students: 22, assignments: 8, attendance: 85 },
  { name: 'Sun', students: 20, assignments: 6, attendance: 82 },
]

const subjectPerformance = [
  { subject: 'Mathematics', performance: 85, students: 25 },
  { subject: 'Physics', performance: 78, students: 18 },
  { subject: 'English', performance: 92, students: 30 },
  { subject: 'History', performance: 88, students: 22 },
  { subject: 'Biology', performance: 81, students: 20 },
]

const projectStatus = [
  { name: 'Completed', value: 45, color: '#10b981' },
  { name: 'In Progress', value: 30, color: '#f59e0b' },
  { name: 'Draft', value: 25, color: '#6b7280' },
]

const COLORS = ['#10b981', '#f59e0b', '#6b7280']

export function AnalyticsDashboard() {
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Students</p>
                <p className="text-2xl font-bold">156</p>
                <p className="text-xs text-green-600">+12% from last month</p>
              </div>
              <div className="text-3xl">👥</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Average Grade</p>
                <p className="text-2xl font-bold">87.5%</p>
                <p className="text-xs text-green-600">+2.3% improvement</p>
              </div>
              <div className="text-3xl">📊</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Attendance Rate</p>
                <p className="text-2xl font-bold">94.2%</p>
                <p className="text-xs text-green-600">+1.8% this week</p>
              </div>
              <div className="text-3xl">✅</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Projects</p>
                <p className="text-2xl font-bold">23</p>
                <p className="text-xs text-blue-600">8 due this week</p>
              </div>
              <div className="text-3xl">📚</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Activity Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="students"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Active Students"
                />
                <Line
                  type="monotone"
                  dataKey="assignments"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Assignments"
                />
                <Line
                  type="monotone"
                  dataKey="attendance"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Attendance %"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Subject Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Subject Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={subjectPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="performance" fill="#3b82f6" name="Performance %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Project Status and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Project Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={projectStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {projectStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-background rounded-none">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">Aisha completed Science Project</p>
                    <p className="text-sm text-muted-foreground">2 hours ago</p>
                  </div>
                </div>
                <Badge variant="outline">Science</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-background rounded-none">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">New lesson plan created</p>
                    <p className="text-sm text-muted-foreground">4 hours ago</p>
                  </div>
                </div>
                <Badge variant="outline">Physics</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-background rounded-none">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">IoT device maintenance alert</p>
                    <p className="text-sm text-muted-foreground">6 hours ago</p>
                  </div>
                </div>
                <Badge variant="outline">IoT</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-background rounded-none">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">AI lesson generated</p>
                    <p className="text-sm text-muted-foreground">1 day ago</p>
                  </div>
                </div>
                <Badge variant="outline">AI</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 
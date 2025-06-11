'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const mockData = [
  { name: 'Mon', students: 24, assignments: 12 },
  { name: 'Tue', students: 26, assignments: 15 },
  { name: 'Wed', students: 28, assignments: 18 },
  { name: 'Thu', students: 25, assignments: 14 },
  { name: 'Fri', students: 30, assignments: 20 },
  { name: 'Sat', students: 22, assignments: 8 },
  { name: 'Sun', students: 20, assignments: 6 },
]

export function TeacherAnalytics() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mockData}>
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
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="text-2xl mb-2">📝</div>
              <div className="text-sm font-medium">Create Lesson</div>
            </button>
            <button className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-sm font-medium">View Reports</div>
            </button>
            <button className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="text-2xl mb-2">🔧</div>
              <div className="text-sm font-medium">IoT Monitor</div>
            </button>
            <button className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="text-2xl mb-2">👥</div>
              <div className="text-sm font-medium">Manage Students</div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 
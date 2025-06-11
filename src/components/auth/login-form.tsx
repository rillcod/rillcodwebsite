'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  AcademicCapIcon, 
  UserGroupIcon, 
  BuildingOfficeIcon, 
  ComputerDesktopIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/auth-context'
import { UserRole } from '@/types'

const roles = [
  {
    role: 'admin' as UserRole,
    title: 'Administrator',
    description: 'Manage academy operations and partnerships',
    icon: AcademicCapIcon,
    color: 'bg-blue-600 hover:bg-blue-700',
    demoEmail: 'admin@rillcodacademy.com'
  },
  {
    role: 'teacher' as UserRole,
    title: 'Teacher',
    description: 'Access lesson plans and student progress',
    icon: UserGroupIcon,
    color: 'bg-green-600 hover:bg-green-700',
    demoEmail: 'teacher@rillcodacademy.com'
  },
  {
    role: 'student' as UserRole,
    title: 'Student',
    description: 'Access courses and track learning progress',
    icon: ComputerDesktopIcon,
    color: 'bg-purple-600 hover:bg-purple-700',
    demoEmail: 'student@rillcodacademy.com'
  },
  {
    role: 'school_partner' as UserRole,
    title: 'School Partner',
    description: 'Monitor school performance and achievements',
    icon: BuildingOfficeIcon,
    color: 'bg-orange-600 hover:bg-orange-700',
    demoEmail: 'partner@school.edu.ng'
  }
]

export default function LoginForm() {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const { login } = useAuth()
  const router = useRouter()

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role)
    setError('')
    const roleData = roles.find(r => r.role === role)
    if (roleData) {
      setEmail(roleData.demoEmail)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedRole) {
      setError('Please select your role')
      return
    }

    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const success = await login(email, password, selectedRole)
      
      if (success) {
        router.push('/dashboard')
      } else {
        setError('Invalid credentials. Please try again.')
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDemoLogin = (role: UserRole) => {
    setSelectedRole(role)
    const roleData = roles.find(r => r.role === role)
    if (roleData) {
      setEmail(roleData.demoEmail)
      setPassword('demo123')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-2xl">RA</span>
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Welcome to Rillcod Academy
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to access your portal
          </p>
        </div>

        {/* Role Selection */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Select Your Role</h3>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((roleData) => (
              <button
                key={roleData.role}
                onClick={() => handleRoleSelect(roleData.role)}
                className={`relative p-4 border-2 rounded-lg text-center transition-all duration-200 ${
                  selectedRole === roleData.role
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`inline-flex p-2 rounded-lg ${roleData.color.replace('hover:', '')} mb-2`}>
                  <roleData.icon className="h-6 w-6 text-white" />
                </div>
                <h4 className="text-sm font-medium text-gray-900">{roleData.title}</h4>
                <p className="text-xs text-gray-600 mt-1">{roleData.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Login Form */}
        {selectedRole && (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 pr-10"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-2" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            {/* Demo Login Button */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => handleDemoLogin(selectedRole)}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Use Demo Credentials
              </button>
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>

            {/* Demo Credentials Info */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Demo Credentials</h4>
              <div className="text-xs text-gray-600 space-y-1">
                <p><strong>Email:</strong> {roles.find(r => r.role === selectedRole)?.demoEmail}</p>
                <p><strong>Password:</strong> demo123</p>
              </div>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Need help? Contact{' '}
            <a href="mailto:support@rillcodacademy.com" className="font-medium text-blue-600 hover:text-blue-500">
              support@rillcodacademy.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
} 
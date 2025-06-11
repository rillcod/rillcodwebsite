'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  UserGroupIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
  BookOpenIcon,
  AcademicCapIcon,
  PresentationChartLineIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/auth-context'
import { UserRole } from '@/types'

export default function TeacherLoginForm() {
  const [email, setEmail] = useState('teacher@rillcodacademy.com')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const success = await login(email, password, 'teacher')
      
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

  const handleDemoLogin = () => {
    setEmail('teacher@rillcodacademy.com')
    setPassword('demo123')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-72 h-72 bg-green-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-teal-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-emerald-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-20 h-20 bg-gradient-to-r from-green-600 to-teal-600 rounded-2xl flex items-center justify-center shadow-2xl transform hover:scale-105 transition-transform duration-300">
                  <UserGroupIcon className="h-10 w-10 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                  <BookOpenIcon className="h-3 w-3 text-white" />
                </div>
              </div>
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-2">
              Teacher Portal
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              Sign in to access your teaching dashboard
            </p>
            
            {/* Feature Highlights */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="text-center p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20">
                <BookOpenIcon className="h-6 w-6 text-green-600 mx-auto mb-1" />
                <p className="text-xs text-gray-600">Lessons</p>
              </div>
              <div className="text-center p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20">
                <PresentationChartLineIcon className="h-6 w-6 text-teal-600 mx-auto mb-1" />
                <p className="text-xs text-gray-600">Progress</p>
              </div>
              <div className="text-center p-3 bg-white/50 backdrop-blur-sm rounded-lg border border-white/20">
                <AcademicCapIcon className="h-6 w-6 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-gray-600">Students</p>
              </div>
            </div>
          </div>

          {/* Login Form */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white/50 backdrop-blur-sm"
                      placeholder="teacher@rillcodacademy.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white/50 backdrop-blur-sm pr-12"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-xl">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-3 flex-shrink-0" />
                  <span className="text-sm text-red-600">{error}</span>
                </div>
              )}

              {/* Demo Login Button */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="text-sm text-green-600 hover:text-green-500 underline font-medium transition-colors duration-200"
                >
                  Use Demo Credentials
                </button>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-base font-semibold rounded-xl text-white bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200 shadow-lg"
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Signing in...
                    </div>
                  ) : (
                    <>
                      <UserGroupIcon className="h-5 w-5 mr-2" />
                      Sign In as Teacher
                    </>
                  )}
                </button>
              </div>

              {/* Back to Home */}
              <div className="text-center pt-4">
                <a
                  href="/"
                  className="text-sm text-gray-600 hover:text-gray-500 font-medium transition-colors duration-200 flex items-center justify-center"
                >
                  <span className="mr-1">←</span>
                  Back to Home
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
} 
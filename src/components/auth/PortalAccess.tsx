// @refresh reset
'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client';
import {
  UserIcon,
  AcademicCapIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@/lib/icons'
import Link from 'next/link'

interface PortalAccessProps {
  onSuccess?: () => void
}

const supabase = createClient();

export default function PortalAccess({
  onSuccess }: PortalAccessProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'teacher' | 'student'>('student')
  const [isSignUp, setIsSignUp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { login } = useAuth()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      // Sign up the user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role
          }
        }
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (data.user) {
        setSuccess('Account created successfully! Please check your email to verify your account.')
        // Clear form
        setEmail('')
        setPassword('')
        setFullName('')
        setRole('student')
        setIsSignUp(false)
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error('Sign up error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const success = await login(email, password)
      if (success) {
        setSuccess('Login successful!')
        onSuccess?.()
      } else {
        setError('Invalid credentials or role mismatch. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error('Sign in error:', err)
    } finally {
      setLoading(false)
    }
  }

  const roleOptions = [
    {
      value: 'student' as const,
      label: 'Student',
      icon: UserGroupIcon,
      description: 'Access courses, assignments, and track your progress'
    },
    {
      value: 'teacher' as const,
      label: 'Teacher',
      icon: AcademicCapIcon,
      description: 'Manage classes, create assignments, and grade students'
    },
    {
      value: 'admin' as const,
      label: 'Administrator',
      icon: UserIcon,
      description: 'Full system access and management capabilities'
    }
  ]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 bg-gradient-to-r from-primary to-purple-600 rounded-xl flex items-center justify-center">
            <BuildingOfficeIcon className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground dark:text-white">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground dark:text-muted-foreground/70">
            {isSignUp ? 'Join Rillcod Technologies Portal' : 'Access your portal dashboard'}
          </p>
        </div>

        {/* Role Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground/80 dark:text-muted-foreground/50">
            Select your role
          </label>
          <div className="grid grid-cols-1 gap-3">
            {roleOptions.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  className={`relative p-4 border rounded-lg transition-all duration-200 ${role === option.value
                      ? 'border-primary bg-blue-50 dark:bg-blue-900/20 ring-2 ring-primary ring-opacity-50'
                      : 'border-border border-border hover:border-border/80 hover:border-primary/50'
                    }`}
                >
                  <div className="flex items-start">
                    <div className={`p-2 rounded-lg mr-3 ${role === option.value
                        ? 'bg-primary text-white'
                        : 'bg-muted text-muted-foreground'
                      }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="text-sm font-medium text-foreground dark:text-white">
                        {option.label}
                      </h3>
                      <p className="text-xs text-muted-foreground dark:text-muted-foreground/70 mt-1">
                        {option.description}
                      </p>
                    </div>
                    {role === option.value && (
                      <CheckCircleIcon className="h-5 w-5 text-primary dark:text-primary" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={isSignUp ? handleSignUp : handleSignIn}>
          <div className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-foreground/80 dark:text-muted-foreground/50">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required={isSignUp}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-border border-border rounded-md shadow-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-primary focus:border-primary "
                  placeholder="Enter your full name"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground/80 dark:text-muted-foreground/50">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-border border-border rounded-md shadow-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-primary focus:border-primary "
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground/80 dark:text-muted-foreground/50">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 pr-10 border border-border border-border rounded-md shadow-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-primary focus:border-primary "
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-muted-foreground/70" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-muted-foreground/70" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Error and Success Messages */}
          {error && (
            <div className="flex items-center p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
              <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-border"></div>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
                setSuccess('')
              }}
              className="text-sm text-primary dark:text-primary hover:text-primary dark:hover:text-blue-300"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"
              }
            </button>
          </div>
        </form>

        {/* Additional Links */}
        <div className="text-center space-y-2">
          <Link
            href="/"
            className="text-sm text-muted-foreground dark:text-muted-foreground/70 hover:text-foreground dark:hover:text-muted-foreground/30"
          >
            ← Back to Home
          </Link>
          <div className="text-xs text-muted-foreground dark:text-muted-foreground">
            Need help? Contact support at support@rillcodacademy.com
          </div>
        </div>
      </div>
    </div>
  )
} 
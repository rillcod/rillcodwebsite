'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
  AcademicCapIcon, 
  UserGroupIcon, 
  BuildingOfficeIcon, 
  ComputerDesktopIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';

const roles = [
  {
    role: 'admin',
    title: 'Administrator',
    description: 'Manage academy operations and partnerships',
    icon: AcademicCapIcon,
    color: 'bg-blue-600 hover:bg-blue-700',
    demoEmail: 'admin@rillcodacademy.com'
  },
  {
    role: 'teacher',
    title: 'Teacher',
    description: 'Access lesson plans and student progress',
    icon: UserGroupIcon,
    color: 'bg-green-600 hover:bg-green-700',
    demoEmail: 'teacher@rillcodacademy.com'
  },
  {
    role: 'student',
    title: 'Student',
    description: 'Access courses and track learning progress',
    icon: ComputerDesktopIcon,
    color: 'bg-purple-600 hover:bg-purple-700',
    demoEmail: 'student@rillcodacademy.com'
  }
];

export default function LoginForm() {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { refreshProfile } = useAuth();
  const router = useRouter();

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    setError('');
    const roleData = roles.find(r => r.role === role);
    if (roleData) {
      setEmail(roleData.demoEmail);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedRole) {
      setError('Please select your role');
      return;
    }

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        // Update user metadata with role
        const { error: updateError } = await supabase.auth.updateUser({
          data: { role: selectedRole }
        });

        if (updateError) {
          console.error('Error updating user metadata:', updateError);
        }

        // Refresh profile to get updated role
        await refreshProfile();
        
        toast.success('Login successful!');
        router.push('/dashboard');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (role: string) => {
    setSelectedRole(role);
    const roleData = roles.find(r => r.role === role);
    if (roleData) {
      setEmail(roleData.demoEmail);
      setPassword('demo123');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mb-4">
            <AcademicCapIcon className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        {/* Role Selection */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Your Role</h3>
          <div className="grid grid-cols-1 gap-3">
            {roles.map((roleData) => {
              const Icon = roleData.icon;
              const isSelected = selectedRole === roleData.role;
              
              return (
                <button
                  key={roleData.role}
                  onClick={() => handleRoleSelect(roleData.role)}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-lg scale-105'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${roleData.color} text-white`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <h4 className="font-semibold text-gray-900">{roleData.title}</h4>
                      <p className="text-sm text-gray-600">{roleData.description}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 pr-12"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                ) : (
                  <EyeIcon className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !selectedRole}
            className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300 ${
              isLoading || !selectedRole
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 hover:shadow-lg transform hover:scale-105'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Signing in...
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Demo Login Buttons */}
        <div className="space-y-3">
          <p className="text-sm text-gray-600 text-center">Or try demo accounts:</p>
          <div className="grid grid-cols-3 gap-2">
            {roles.map((roleData) => (
              <button
                key={roleData.role}
                onClick={() => handleDemoLogin(roleData.role)}
                className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200"
              >
                {roleData.title}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <a href="/auth/register" className="font-medium text-blue-600 hover:text-blue-500">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
} 
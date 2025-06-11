"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Eye, EyeOff, User, School, Users, Shield, Mail, Lock, ArrowRight, Sparkles, Zap, Heart, AlertCircle, CheckCircle, Clock, ChevronDown, Target, Award, Shield as SecurityShield } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export default function Login() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [userType, setUserType] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showSecurityTips, setShowSecurityTips] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);

  // Handle URL parameters for user type
  useEffect(() => {
    const type = searchParams.get('type');
    if (type && ['student', 'teacher', 'admin'].includes(type)) {
      setUserType(type);
    }
  }, [searchParams]);

  const userTypes = [
    { 
      id: 'student', 
      label: 'Student', 
      icon: User, 
      color: 'from-blue-500 to-cyan-500', 
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      description: 'Access your learning dashboard',
      emoji: '🎓',
      features: ['AI-powered learning', 'Progress tracking', 'Virtual labs', 'Portfolio building'],
      benefits: ['Personalized curriculum', 'Real-time feedback', 'Project showcase', 'Skill certification'],
      stats: { users: '2,500+', courses: '15+', completion: '94%' }
    },
    { 
      id: 'teacher', 
      label: 'Teacher', 
      icon: School, 
      color: 'from-green-500 to-emerald-500', 
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      description: 'Manage classes and lessons',
      emoji: '👨‍🏫',
      features: ['Lesson planning', 'Student progress', 'AI assistance', 'Resource library'],
      benefits: ['Automated grading', 'Performance analytics', 'Collaborative tools', 'Professional development'],
      stats: { users: '150+', classes: '200+', satisfaction: '98%' }
    },
    { 
      id: 'admin', 
      label: 'Admin', 
      icon: Shield, 
      color: 'from-red-500 to-pink-500', 
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      description: 'School administration portal',
      emoji: '⚙️',
      features: ['User management', 'Analytics dashboard', 'System settings', 'Reports generation'],
      benefits: ['Comprehensive oversight', 'Data insights', 'System control', 'Performance monitoring'],
      stats: { users: '50+', schools: '25+', efficiency: '96%' }
    }
  ];

  // Security validation
  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle lockout
  useEffect(() => {
    if (isLocked && lockoutTime > 0) {
      const timer = setInterval(() => {
        setLockoutTime(prev => {
          if (prev <= 1) {
            setIsLocked(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isLocked, lockoutTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLocked) {
      return;
    }
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    setErrors({});
    
    try {
      // Sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrors({ general: error.message });
        setLoginAttempts(prev => prev + 1);
        
        // Handle lockout after multiple failed attempts
        if (loginAttempts >= 2) {
          setIsLocked(true);
          setLockoutTime(30);
        }
        return;
      }

      if (data.user) {
        // Update user metadata with role
        const { error: updateError } = await supabase.auth.updateUser({
          data: { role: userType }
        });

        if (updateError) {
          console.error('Error updating user metadata:', updateError);
        }

        // Refresh profile to get updated role
        await refreshProfile();
        
        toast.success('Login successful!');
        
        // Redirect to dashboard
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrors({ general: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedType = userTypes.find(type => type.id === userType);

  const securityTips = [
    'Use a strong, unique password',
    'Enable two-factor authentication',
    'Never share your login credentials',
    'Log out from shared devices',
    'Keep your browser updated'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 relative overflow-hidden">
      {/* Enhanced Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-900/20 dark:to-pink-900/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 dark:from-cyan-900/10 dark:to-blue-900/10 rounded-full blur-3xl animate-pulse delay-500"></div>
        <div className="absolute top-1/4 right-1/4 w-32 h-32 bg-gradient-to-br from-yellow-400/10 to-orange-400/10 dark:from-yellow-900/10 dark:to-orange-900/10 rounded-full blur-2xl animate-pulse delay-1500"></div>
        <div className="absolute bottom-1/4 left-1/4 w-24 h-24 bg-gradient-to-br from-green-400/10 to-teal-400/10 dark:from-green-900/10 dark:to-teal-900/10 rounded-full blur-xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          
          {/* Left Side - User Type Selection */}
          <div className="space-y-8">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center space-x-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Welcome to RILLCOD Academy</span>
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
                Choose Your <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Portal</span>
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                Access your personalized learning environment
              </p>
            </div>

            {/* User Type Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {userTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = userType === type.id;
                const darkBg = type.bgColor.replace('-50', '-900/30');
                const darkBorder = type.borderColor.replace('-200', '-700');
                return (
                  <button
                    key={type.id}
                    onClick={() => setUserType(type.id)}
                    className={`relative p-6 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900
                      ${isSelected
                        ? `border-transparent bg-gradient-to-br ${type.color} text-white shadow-xl scale-105`
                        : `${type.bgColor} dark:${darkBg} ${type.borderColor} dark:${darkBorder} hover:shadow-lg hover:scale-102`}
                    `}
                  >
                    <div className="text-center space-y-3">
                      <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-white/20 dark:bg-gray-900/30' : 'bg-white dark:bg-gray-900 shadow-md'
                      }`}>
                        <Icon className={`w-8 h-8 ${isSelected ? 'text-white' : 'text-gray-700 dark:text-gray-200'}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg dark:text-white">{type.label}</h3>
                        <p className={`text-sm ${isSelected ? 'text-white/90' : 'text-gray-600 dark:text-gray-300'}`}>
                          {type.description}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-white dark:bg-green-600 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Features for Selected Type */}
            {selectedType && (
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                <div className="flex items-center space-x-3 mb-4">
                  <span className="text-2xl">{selectedType.emoji}</span>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedType.label} Features</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedType.features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-200">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Side - Login Form */}
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 lg:p-12">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome Back</h2>
              <p className="text-gray-600 dark:text-gray-300">Sign in to your {selectedType?.label.toLowerCase()} account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-4 transition-all duration-200 bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                      ${errors.email 
                        ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500/10' 
                        : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-blue-500/10'}
                    `}
                    placeholder="Enter your email"
                    disabled={isLocked}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full pl-10 pr-12 py-3 border-2 rounded-xl focus:outline-none focus:ring-4 transition-all duration-200 bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                      ${errors.password 
                        ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500/10' 
                        : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-blue-500/10'}
                    `}
                    placeholder="Enter your password"
                    disabled={isLocked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.password}
                  </p>
                )}
              </div>

              {/* General Error */}
              {errors.general && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-4">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 mr-2" />
                    <p className="text-sm text-red-700 dark:text-red-300">{errors.general}</p>
                  </div>
                </div>
              )}

              {/* Lockout Message */}
              {isLocked && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Clock className="w-5 h-5 text-yellow-500 dark:text-yellow-400 mr-2" />
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Account temporarily locked. Please try again in {lockoutTime} seconds.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading || isLocked}
                className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center
                  ${isLoading || isLocked
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 hover:shadow-lg transform hover:scale-105'}
                `}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </button>

              {/* Security Tips Toggle */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowSecurityTips(!showSecurityTips)}
                  className="text-sm text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white flex items-center mx-auto"
                >
                  <SecurityShield className="w-4 h-4 mr-1" />
                  Security Tips
                  <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showSecurityTips ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Security Tips */}
              {showSecurityTips && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Security Tips</h4>
                  <ul className="space-y-1">
                    {securityTips.map((tip, index) => (
                      <li key={index} className="text-sm text-blue-700 dark:text-blue-200 flex items-center">
                        <CheckCircle className="w-3 h-3 mr-2 text-blue-500 dark:text-blue-400" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sign Up Link */}
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Don't have an account?{' '}
                  <Link href="/auth/register" className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300">
                    Sign up here
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
} 
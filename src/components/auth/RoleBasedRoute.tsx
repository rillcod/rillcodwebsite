'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Shield, AlertTriangle } from 'lucide-react';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'teacher' | 'student')[];
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export default function RoleBasedRoute({ 
  children, 
  allowedRoles, 
  fallback,
  redirectTo 
}: RoleBasedRouteProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // If not authenticated, redirect to login
      if (!user || !profile) {
        router.push('/auth/login');
        return;
      }

      // If user doesn't have required role, redirect
      if (!allowedRoles.includes(profile.role)) {
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          // Redirect to role-appropriate dashboard
          switch (profile.role) {
            case 'admin':
              router.push('/admin');
              break;
            case 'teacher':
              router.push('/teacher/dashboard');
              break;
            case 'student':
              router.push('/student/dashboard');
              break;
            default:
              router.push('/auth/login');
          }
        }
        return;
      }

      // Check if user is active
      if (!profile.is_active) {
        router.push('/auth/login?message=Account is deactivated. Please contact administrator.');
        return;
      }
    }
  }, [user, profile, loading, allowedRoles, redirectTo, router]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600 dark:text-blue-400" />
          <p className="text-gray-600 dark:text-gray-400">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  // Show unauthorized state
  if (!user || !profile) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please log in to access this page.
          </p>
        </div>
      </div>
    );
  }

  // Show insufficient permissions state
  if (!allowedRoles.includes(profile.role)) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Insufficient Permissions
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Your role: <span className="font-medium capitalize">{profile.role}</span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Required roles: {allowedRoles.map(role => role.charAt(0).toUpperCase() + role.slice(1)).join(', ')}
          </p>
        </div>
      </div>
    );
  }

  // Show deactivated account state
  if (!profile.is_active) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Account Deactivated
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Your account has been deactivated. Please contact the administrator.
          </p>
        </div>
      </div>
    );
  }

  // Render the protected content
  return <>{children}</>;
}

// Convenience components for specific roles
export function AdminOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleBasedRoute allowedRoles={['admin']} fallback={fallback}>
      {children}
    </RoleBasedRoute>
  );
}

export function TeacherOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleBasedRoute allowedRoles={['teacher']} fallback={fallback}>
      {children}
    </RoleBasedRoute>
  );
}

export function StudentOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleBasedRoute allowedRoles={['student']} fallback={fallback}>
      {children}
    </RoleBasedRoute>
  );
}

export function AdminOrTeacher({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleBasedRoute allowedRoles={['admin', 'teacher']} fallback={fallback}>
      {children}
    </RoleBasedRoute>
  );
}

export function AdminOrStudent({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleBasedRoute allowedRoles={['admin', 'student']} fallback={fallback}>
      {children}
    </RoleBasedRoute>
  );
}

export function TeacherOrStudent({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <RoleBasedRoute allowedRoles={['teacher', 'student']} fallback={fallback}>
      {children}
    </RoleBasedRoute>
  );
} 
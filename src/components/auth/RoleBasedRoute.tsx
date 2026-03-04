'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Shield, AlertTriangle } from 'lucide-react';

import { UserRole } from '@/types';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
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
      // No auth session — redirect to login
      if (!user) {
        router.push('/login');
        return;
      }
      // Profile still loading after auth resolved — wait, don't redirect prematurely
      if (!profile) return;

      // Wrong role — redirect to shared dashboard (not login)
      if (!allowedRoles.includes(profile.role)) {
        router.push(redirectTo ?? '/dashboard');
        return;
      }

      // Deactivated account
      if (!profile.is_active) {
        router.push('/login');
        return;
      }
    }
  }, [user, profile, loading, allowedRoles, redirectTo, router]);

  // Show loading state — while auth is loading OR user exists but profile is still fetching
  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-violet-400" />
          <p className="text-white/50">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  // Show unauthorized state
  if (!user || !profile) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-white/50">
            Please log in to access this page.
          </p>
        </div>
      </div>
    );
  }

  // Show insufficient permissions state
  if (!allowedRoles.includes(profile.role)) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Insufficient Permissions
          </h2>
          <p className="text-white/50 mb-4">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-white/40">
            Your role: <span className="font-medium capitalize">{profile.role}</span>
          </p>
          <p className="text-sm text-white/40">
            Required roles: {allowedRoles.map(role => role.charAt(0).toUpperCase() + role.slice(1)).join(', ')}
          </p>
        </div>
      </div>
    );
  }

  // Show deactivated account state
  if (!profile.is_active) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Account Deactivated
          </h2>
          <p className="text-white/50">
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
import SchoolRegistrationsViewer from '@/components/SchoolRegistrationsViewer';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Building2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function SchoolRegistrationsPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-4">
              <Link 
                href="/dashboard" 
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Dashboard
              </Link>
            </div>
            
            <div className="mt-4 flex items-center space-x-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">School Registrations</h1>
                <p className="text-gray-600">Manage and view all school registration submissions</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <SchoolRegistrationsViewer />
        </div>
      </div>
    </ProtectedRoute>
  );
} 
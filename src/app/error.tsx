// @refresh reset
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  HomeIcon
} from '@/lib/icons';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen pt-16 bg-gradient-to-br from-red-50 via-white to-orange-50">
      <div className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="text-center">
          {/* Error Icon */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-32 h-32 bg-red-100 rounded-full mb-6">
              <ExclamationTriangleIcon className="w-16 h-16 text-red-500" />
            </div>
          </div>

          {/* Error Message */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            Something went wrong!
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            We&apos;re sorry, but something unexpected happened. Our team has been notified and is working to fix the issue.
          </p>

          {/* Error Details (Development Only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-gray-100 rounded-lg p-4 mb-8 max-w-2xl mx-auto text-left">
              <h3 className="font-semibold text-gray-800 mb-2">Error Details:</h3>
              <p className="text-sm text-gray-600 font-mono break-all">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-sm text-gray-500 mt-2">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center px-6 py-3 bg-[#FF914D] text-white rounded-full hover:bg-[#e67e3d] transform transition-all duration-300 hover:scale-105 font-semibold"
            >
              <ArrowPathIcon className="w-5 h-5 mr-2" />
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-3 border-2 border-[#FF914D] text-[#FF914D] rounded-full hover:bg-[#FF914D] hover:text-white transform transition-all duration-300 hover:scale-105 font-semibold"
            >
              <HomeIcon className="w-5 h-5 mr-2" />
              Go Home
            </Link>
          </div>

          {/* Help Section */}
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              Still having issues?
            </h3>
            <p className="text-gray-600 mb-6">
              If the problem persists, please contact our support team:
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-4">
                <Link
                  href="/contact"
                  className="text-[#FF914D] hover:text-[#e67e3d] font-medium"
                >
                  Contact Support
                </Link>
                <span className="text-gray-400">|</span>
                <a
                  href="https://wa.me/2348116600091"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-700 font-medium"
                >
                  WhatsApp Support
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
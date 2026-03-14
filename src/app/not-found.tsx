// @refresh reset
import Link from 'next/link';
import {
  HomeIcon,
  AcademicCapIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon
} from '@/lib/icons';

export default function NotFound() {
  const quickLinks = [
    { href: '/', label: 'Home', icon: HomeIcon },
    { href: '/programs', label: 'Programs', icon: AcademicCapIcon },
    { href: '/schools', label: 'Partner Schools', icon: BuildingOfficeIcon },
    { href: '/contact', label: 'Contact Us', icon: UserGroupIcon },
  ];

  return (
    <div className="min-h-screen pt-16 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="text-center">
          {/* 404 Icon */}
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-32 h-32 bg-red-100 rounded-full mb-6">
              <ExclamationTriangleIcon className="w-16 h-16 text-red-500" />
            </div>
          </div>

          {/* Error Message */}
          <h1 className="text-6xl md:text-8xl font-bold text-gray-800 mb-4">404</h1>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-700 mb-4">
            Page Not Found
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Oops! The page you&apos;re looking for doesn&apos;t exist. It might have been moved, deleted, or you entered the wrong URL.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-3 bg-[#FF914D] text-white rounded-full hover:bg-[#e67e3d] transform transition-all duration-300 hover:scale-105 font-semibold"
            >
              <ArrowLeftIcon className="w-5 h-5 mr-2" />
              Go Back Home
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-6 py-3 border-2 border-[#FF914D] text-[#FF914D] rounded-full hover:bg-[#FF914D] hover:text-white transform transition-all duration-300 hover:scale-105 font-semibold"
            >
              Contact Support
            </Link>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-4xl mx-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-6">
              Quick Navigation
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg hover:bg-[#FF914D] hover:text-white transition-all duration-300 group"
                >
                  <link.icon className="w-6 h-6 text-[#FF914D] group-hover:text-white" />
                  <span className="font-medium">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Help Section */}
          <div className="mt-12 bg-blue-50 rounded-2xl p-8 max-w-4xl mx-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              Need Help?
            </h3>
            <p className="text-gray-600 mb-6">
              If you&apos;re looking for something specific, try these options:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-2">Looking for Programs?</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Explore our technology education programs for students of all ages.
                </p>
                <Link
                  href="/programs"
                  className="text-[#FF914D] hover:text-[#e67e3d] text-sm font-medium"
                >
                  View Programs →
                </Link>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-2">School Partnership?</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Learn how your school can partner with RILLCOD Academy.
                </p>
                <Link
                  href="/schools"
                  className="text-[#FF914D] hover:text-[#e67e3d] text-sm font-medium"
                >
                  Partner With Us →
                </Link>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-2">Contact Support?</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Get in touch with our team for assistance.
                </p>
                <Link
                  href="/contact"
                  className="text-[#FF914D] hover:text-[#e67e3d] text-sm font-medium"
                >
                  Contact Us →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
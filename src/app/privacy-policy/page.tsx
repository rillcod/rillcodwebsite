'use client'

import { Shield, Eye, Lock, Database, Users, Mail, Phone, MapPin, Calendar, FileText, CheckCircle } from 'lucide-react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Privacy Policy
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            At Rillcod Academy, we are committed to protecting your privacy and ensuring the security of your personal information.
          </p>
          <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            <p>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 space-y-8">
          
          {/* Information We Collect */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Database className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Information We Collect
            </h2>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Personal Information</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Student names, ages, and educational background</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Parent/guardian contact information (email, phone, address)</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>School information and partnership details</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Payment and billing information</span>
                  </li>
                </ul>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Educational Data</h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Academic progress and performance records</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Course completion and assessment results</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Project submissions and creative work</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Attendance and participation records</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use Information */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Eye className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              How We Use Your Information
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Educational Purposes</h3>
                <ul className="space-y-2 text-blue-800 dark:text-blue-200">
                  <li>• Providing personalized learning experiences</li>
                  <li>• Tracking academic progress and achievements</li>
                  <li>• Communicating with parents about student performance</li>
                  <li>• Organizing educational events and competitions</li>
                </ul>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-3">Administrative Purposes</h3>
                <ul className="space-y-2 text-green-800 dark:text-green-200">
                  <li>• Processing payments and managing accounts</li>
                  <li>• Sending important updates and notifications</li>
                  <li>• Providing customer support and assistance</li>
                  <li>• Ensuring platform security and safety</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Information Sharing */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Information Sharing and Disclosure
            </h2>
            <div className="space-y-4">
              <div className="border-l-4 border-blue-500 pl-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">We Do NOT Sell Your Data</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Rillcod Academy does not sell, trade, or rent your personal information to third parties for marketing purposes.
                </p>
              </div>
              
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-3">Limited Sharing</h3>
                <p className="text-yellow-800 dark:text-yellow-200 mb-4">
                  We may share information only in the following circumstances:
                </p>
                <ul className="space-y-2 text-yellow-800 dark:text-yellow-200">
                  <li>• With your explicit consent</li>
                  <li>• With partner schools for educational coordination</li>
                  <li>• With service providers who assist in our operations</li>
                  <li>• When required by law or to protect safety</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Lock className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Data Security and Protection
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Encryption</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  All data is encrypted using industry-standard protocols
                </p>
              </div>
              
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Access Control</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Strict access controls and authentication measures
                </p>
              </div>
              
              <div className="text-center p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Database className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Regular Backups</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Secure backups and disaster recovery procedures
                </p>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Your Rights and Choices
            </h2>
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-3">Access and Control</h3>
                  <ul className="space-y-2 text-green-800 dark:text-green-200">
                    <li>• Access your personal information</li>
                    <li>• Request corrections to your data</li>
                    <li>• Delete your account and data</li>
                    <li>• Opt-out of marketing communications</li>
                  </ul>
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Data Portability</h3>
                  <ul className="space-y-2 text-blue-800 dark:text-blue-200">
                    <li>• Export your educational records</li>
                    <li>• Transfer data to other platforms</li>
                    <li>• Download your project files</li>
                    <li>• Request data in machine-readable format</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Contact Us
            </h2>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                If you have any questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="space-y-2">
                <div className="flex items-center text-gray-700 dark:text-gray-300">
                  <Mail className="h-5 w-5 mr-3 text-blue-600 dark:text-blue-400" />
                  <span>Email: privacy@rillcodacademy.com</span>
                </div>
                <div className="flex items-center text-gray-700 dark:text-gray-300">
                  <Phone className="h-5 w-5 mr-3 text-blue-600 dark:text-blue-400" />
                  <span>Phone: +234 811 660 0091</span>
                </div>
                <div className="flex items-center text-gray-700 dark:text-gray-300">
                  <MapPin className="h-5 w-5 mr-3 text-blue-600 dark:text-blue-400" />
                  <span>Address: No 26 Ogiesoba Avenue, Benin City, Nigeria</span>
                </div>
              </div>
            </div>
          </section>

          {/* Updates */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Policy Updates
            </h2>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
              <p className="text-blue-800 dark:text-blue-200">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy Policy periodically for any changes.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
} 
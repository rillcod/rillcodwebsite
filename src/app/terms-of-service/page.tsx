'use client'

import { FileText, Scale, Handshake, DollarSign, Users, Shield, AlertTriangle, CheckCircle, Building, GraduationCap, Calculator } from 'lucide-react'

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Terms of Service
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Please read these terms carefully before using Rillcod Academy services. By using our services, you agree to these terms.
          </p>
          <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            <p>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 space-y-8">
          
          {/* Acceptance of Terms */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 mr-3" />
              Acceptance of Terms
            </h2>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
              <p className="text-green-800 dark:text-green-200">
                By accessing and using Rillcod Academy's services, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </div>
          </section>

          {/* Service Description */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Service Description
            </h2>
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Educational Services</h3>
                <ul className="space-y-2 text-blue-800 dark:text-blue-200">
                  <li>• STEM education programs for children</li>
                  <li>• Coding and programming courses</li>
                  <li>• Robotics and technology workshops</li>
                  <li>• School partnership programs</li>
                  <li>• Online and offline learning platforms</li>
                </ul>
              </div>
            </div>
          </section>

          {/* School Partnership Terms */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Handshake className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              School Partnership Terms
            </h2>
            <div className="space-y-6">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-3 flex items-center">
                  <DollarSign className="h-5 w-5 mr-2" />
                  Revenue Sharing Agreement
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Rillcod Academy (70%)</h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                      <li>• Curriculum development and maintenance</li>
                      <li>• Technology platform and infrastructure</li>
                      <li>• Teacher training and support</li>
                      <li>• Marketing and business development</li>
                      <li>• Administrative overhead</li>
                    </ul>
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Partner School (30%)</h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                      <li>• Student recruitment and enrollment</li>
                      <li>• Facility and classroom provision</li>
                      <li>• Local administrative support</li>
                      <li>• Student supervision and safety</li>
                      <li>• Community engagement</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Partnership Responsibilities</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Rillcod Academy Obligations:</h4>
                    <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-sm">
                      <li>• Provide comprehensive curriculum</li>
                      <li>• Supply necessary technology and materials</li>
                      <li>• Train teachers and staff</li>
                      <li>• Handle billing and payment processing</li>
                      <li>• Provide ongoing support and updates</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">School Obligations:</h4>
                    <ul className="text-blue-800 dark:text-blue-200 space-y-1 text-sm">
                      <li>• Provide suitable facilities</li>
                      <li>• Ensure student safety and supervision</li>
                      <li>• Promote programs to students and parents</li>
                      <li>• Maintain academic standards</li>
                      <li>• Provide feedback and reports</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Payment Terms */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Calculator className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Payment Terms and Conditions
            </h2>
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-3">Payment Schedule</h3>
                <ul className="space-y-2 text-green-800 dark:text-green-200">
                  <li>• Payments are processed monthly</li>
                  <li>• School's 30% share is transferred within 7 business days</li>
                  <li>• All payments are made in Nigerian Naira (NGN)</li>
                  <li>• Bank transfer fees are covered by Rillcod Academy</li>
                </ul>
              </div>
              
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-3">Pricing Structure</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white">Basic Plan</h4>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">₦60,000</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">per student/year</p>
                  </div>
                  <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white">Premium Plan</h4>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">₦80,000</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">per student/year</p>
                  </div>
                  <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white">Enterprise Plan</h4>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">₦100,000</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">per student/year</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* User Responsibilities */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              User Responsibilities
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-3">Students and Parents</h3>
                <ul className="space-y-2 text-red-800 dark:text-red-200">
                  <li>• Attend classes regularly and on time</li>
                  <li>• Complete assignments and projects</li>
                  <li>• Respect teachers and fellow students</li>
                  <li>• Follow safety guidelines</li>
                  <li>• Pay fees on time</li>
                </ul>
              </div>
              
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-3">Schools</h3>
                <ul className="space-y-2 text-orange-800 dark:text-orange-200">
                  <li>• Maintain program quality standards</li>
                  <li>• Provide adequate facilities</li>
                  <li>• Ensure student safety</li>
                  <li>• Submit accurate enrollment data</li>
                  <li>• Communicate program updates</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Intellectual Property Rights
            </h2>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Ownership</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li>• All curriculum materials belong to Rillcod Academy</li>
                <li>• Schools may use materials only for authorized programs</li>
                <li>• Student projects remain their intellectual property</li>
                <li>• Rillcod Academy may showcase student work with permission</li>
              </ul>
            </div>
          </section>

          {/* Termination */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400 mr-3" />
              Termination and Cancellation
            </h2>
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-3">Grounds for Termination</h3>
                <ul className="space-y-2 text-red-800 dark:text-red-200">
                  <li>• Breach of terms and conditions</li>
                  <li>• Non-payment of fees</li>
                  <li>• Misconduct or safety violations</li>
                  <li>• Failure to maintain quality standards</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Notice Period</h3>
                <ul className="space-y-2 text-blue-800 dark:text-blue-200">
                  <li>• 30 days written notice for program termination</li>
                  <li>• Immediate termination for safety violations</li>
                  <li>• Prorated refunds for prepaid services</li>
                  <li>• Return of all materials and equipment</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Scale className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Limitation of Liability
            </h2>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Rillcod Academy shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or use, arising out of or relating to the use of our services.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Our total liability shall not exceed the amount paid by you for the services in the 12 months preceding the claim.
              </p>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
              <Building className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-3" />
              Contact Information
            </h2>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
              <p className="text-blue-800 dark:text-blue-200 mb-4">
                For questions about these Terms of Service, please contact us:
              </p>
              <div className="space-y-2 text-blue-800 dark:text-blue-200">
                <p><strong>Email:</strong> legal@rillcodacademy.com</p>
                <p><strong>Phone:</strong> +234 811 660 0091</p>
                <p><strong>Address:</strong> No 26 Ogiesoba Avenue, Benin City, Nigeria</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
} 
import React from 'react';

export default function PartnershipPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-8">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-blue-700 mb-4 text-center">Partner With Rillcod Academy</h1>
        <p className="text-lg text-gray-700 mb-6 text-center">
          We welcome schools, organizations, and individuals to join us in delivering world-class digital education to the next generation.
        </p>
        <ul className="list-disc pl-6 mb-6 text-gray-700">
          <li>Collaborate on innovative educational programs</li>
          <li>Access exclusive teaching resources and training</li>
          <li>Participate in joint events and competitions</li>
          <li>Empower your students with 21st-century skills</li>
        </ul>
        <div className="text-center">
          <a
            href="mailto:partnership@rillcodacademy.com"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors font-semibold"
          >
            Contact Us to Partner
          </a>
        </div>
      </div>
    </div>
  );
}

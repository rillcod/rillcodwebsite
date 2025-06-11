'use client'

import { Briefcase, Users, GraduationCap, Code, Rocket, Heart, MapPin, Clock, DollarSign, CheckCircle } from 'lucide-react'

export default function CareersPage() {
  const jobOpenings = [
    {
      id: 1,
      title: "STEM Teacher",
      department: "Education",
      location: "Benin City, Nigeria",
      type: "Full-time",
      salary: "₦150,000 - ₦250,000",
      description: "Join our team of passionate educators to inspire the next generation of tech innovators.",
      requirements: [
        "Bachelor's degree in Computer Science, Education, or related field",
        "2+ years teaching experience",
        "Strong knowledge of programming languages (Python, JavaScript, Scratch)",
        "Experience with robotics and STEM education",
        "Excellent communication and interpersonal skills"
      ],
      benefits: [
        "Competitive salary and benefits",
        "Professional development opportunities",
        "Flexible working hours",
        "Health insurance",
        "Performance bonuses"
      ]
    },
    {
      id: 2,
      title: "Curriculum Developer",
      department: "Education",
      location: "Remote / Benin City",
      type: "Full-time",
      salary: "₦200,000 - ₦350,000",
      description: "Design and develop engaging STEM curriculum for children aged 8-18.",
      requirements: [
        "Master's degree in Education, Computer Science, or related field",
        "3+ years curriculum development experience",
        "Experience with educational technology",
        "Strong understanding of child development",
        "Creative and innovative mindset"
      ],
      benefits: [
        "Remote work options",
        "Creative freedom",
        "Professional development",
        "Health insurance",
        "Annual bonuses"
      ]
    },
    {
      id: 3,
      title: "Marketing Specialist",
      department: "Marketing",
      location: "Benin City, Nigeria",
      type: "Full-time",
      salary: "₦120,000 - ₦200,000",
      description: "Help us reach more schools and parents with our innovative STEM programs.",
      requirements: [
        "Bachelor's degree in Marketing, Business, or related field",
        "2+ years digital marketing experience",
        "Experience with social media marketing",
        "Strong analytical skills",
        "Excellent written and verbal communication"
      ],
      benefits: [
        "Performance-based bonuses",
        "Professional development",
        "Health insurance",
        "Flexible working hours",
        "Team building activities"
      ]
    },
    {
      id: 4,
      title: "Software Developer",
      department: "Technology",
      location: "Remote / Benin City",
      type: "Full-time",
      salary: "₦250,000 - ₦400,000",
      description: "Build and maintain our educational technology platform.",
      requirements: [
        "Bachelor's degree in Computer Science or related field",
        "3+ years software development experience",
        "Proficiency in React, Node.js, and Python",
        "Experience with educational technology",
        "Strong problem-solving skills"
      ],
      benefits: [
        "Remote work options",
        "Latest technology tools",
        "Professional development",
        "Health insurance",
        "Stock options"
      ]
    }
  ]

  const values = [
    {
      icon: Heart,
      title: "Passion for Education",
      description: "We believe every child deserves access to quality STEM education."
    },
    {
      icon: Users,
      title: "Collaborative Culture",
      description: "Work with like-minded professionals who share your vision."
    },
    {
      icon: Rocket,
      title: "Innovation",
      description: "Constantly pushing boundaries in educational technology."
    },
    {
      icon: GraduationCap,
      title: "Growth",
      description: "Continuous learning and professional development opportunities."
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Briefcase className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Join Our Team
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Help us transform Nigeria's educational landscape through innovative STEM education. 
            Join a team of passionate educators and technologists making a difference.
          </p>
        </div>

        {/* Values Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Our Values
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => {
              const Icon = value.icon
              return (
                <div key={index} className="text-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {value.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    {value.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Job Openings */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Current Openings
          </h2>
          <div className="space-y-8">
            {jobOpenings.map((job) => (
              <div key={job.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {job.title}
                    </h3>
                    <p className="text-blue-600 dark:text-blue-400 font-medium mb-2">
                      {job.department}
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      {job.description}
                    </p>
                  </div>
                  <div className="mt-4 lg:mt-0 lg:text-right">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                        <MapPin className="h-4 w-4 mr-1" />
                        {job.location}
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                        <Clock className="h-4 w-4 mr-1" />
                        {job.type}
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                        <DollarSign className="h-4 w-4 mr-1" />
                        {job.salary}
                      </span>
                    </div>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
                      Apply Now
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Requirements
                    </h4>
                    <ul className="space-y-2">
                      {job.requirements.map((req, index) => (
                        <li key={index} className="flex items-start">
                          <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600 dark:text-gray-300 text-sm">{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Benefits
                    </h4>
                    <ul className="space-y-2">
                      {job.benefits.map((benefit, index) => (
                        <li key={index} className="flex items-start">
                          <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600 dark:text-gray-300 text-sm">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Section */}
        <div className="mt-16 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Don't See the Right Fit?
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            We're always looking for talented individuals to join our team. Send us your resume and let's discuss how you can contribute to our mission.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors">
              Send Resume
            </button>
            <button className="border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-6 py-3 rounded-lg transition-colors">
              Contact HR
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 
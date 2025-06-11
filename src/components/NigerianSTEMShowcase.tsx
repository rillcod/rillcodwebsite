'use client'

import React from 'react'
import { 
  CodeBracketIcon,
  CpuChipIcon,
  RocketLaunchIcon,
  BeakerIcon,
  AcademicCapIcon,
  TrophyIcon,
  StarIcon,
  LightBulbIcon,
  GlobeAltIcon,
  UserGroupIcon,
  BookOpenIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline'

const achievements = [
  {
    id: 1,
    title: "National Coding Competition Winners",
    description: "Students from Lagos State Model College won first place in the 2024 National Youth Coding Challenge",
    category: "coding",
    icon: CodeBracketIcon,
    location: "Lagos, Nigeria",
    date: "March 2024",
    participants: 15,
    achievement: "1st Place"
  },
  {
    id: 2,
    title: "Robotics Innovation Award",
    description: "Young inventors from Abuja International School created a solar-powered irrigation system",
    category: "robotics",
    icon: CpuChipIcon,
    location: "Abuja, Nigeria",
    date: "February 2024",
    participants: 8,
    achievement: "Innovation Award"
  },
  {
    id: 3,
    title: "Science Fair Excellence",
    description: "Students from Port Harcourt Academy presented groundbreaking environmental research",
    category: "science",
    icon: BeakerIcon,
    location: "Port Harcourt, Nigeria",
    date: "January 2024",
    participants: 12,
    achievement: "Excellence Award"
  },
  {
    id: 4,
    title: "Mobile App Development",
    description: "Kids created apps to solve local community problems like waste management",
    category: "technology",
    icon: ComputerDesktopIcon,
    location: "Kano, Nigeria",
    date: "December 2023",
    participants: 20,
    achievement: "Community Impact"
  },
  {
    id: 5,
    title: "3D Printing Workshop",
    description: "Students learned 3D design and created prototypes for local businesses",
    category: "technology",
    icon: RocketLaunchIcon,
    location: "Ibadan, Nigeria",
    date: "November 2023",
    participants: 18,
    achievement: "Skills Development"
  },
  {
    id: 6,
    title: "AI & Machine Learning",
    description: "Introduction to artificial intelligence with practical applications",
    category: "technology",
    icon: LightBulbIcon,
    location: "Enugu, Nigeria",
    date: "October 2023",
    participants: 25,
    achievement: "Future Ready"
  }
]

const testimonials = [
  {
    id: 1,
    name: "Amina Hassan",
    age: 14,
    school: "Lagos State Model College",
    quote: "Coding has opened up a whole new world for me. I can now create apps that help my community!",
    achievement: "Won National Coding Competition",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg"
  },
  {
    id: 2,
    name: "Chukwu Okoro",
    age: 13,
    school: "Abuja International School",
    quote: "Building robots taught me that anything is possible with determination and creativity.",
    achievement: "Robotics Innovation Award",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg"
  },
  {
    id: 3,
    name: "Fatima Adebayo",
    age: 15,
    school: "Port Harcourt Academy",
    quote: "STEM education has given me the confidence to pursue my dreams in technology.",
    achievement: "Science Fair Excellence",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg"
  }
]

export default function NigerianSTEMShowcase() {
  return (
    <section className="py-16 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Nigerian Kids Making Waves in STEM
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Discover the incredible achievements of young Nigerian minds in science, technology, engineering, and mathematics. 
            Our students are not just learning - they&apos;re innovating and creating solutions for tomorrow!
          </p>
          <div className="w-20 h-2 bg-gradient-to-r from-blue-600 to-purple-600 mx-auto rounded-full"></div>
        </div>

        {/* Achievements Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {achievements.map((achievement) => {
            const Icon = achievement.icon
            return (
              <div key={achievement.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <div className="flex items-center mb-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                      {achievement.achievement}
                    </span>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {achievement.title}
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {achievement.description}
                </p>
                
                <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center">
                    <GlobeAltIcon className="h-4 w-4 mr-2" />
                    {achievement.location}
                  </div>
                  <div className="flex items-center">
                    <BookOpenIcon className="h-4 w-4 mr-2" />
                    {achievement.date}
                  </div>
                  <div className="flex items-center">
                    <UserGroupIcon className="h-4 w-4 mr-2" />
                    {achievement.participants} participants
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Student Testimonials */}
        <div className="mb-16">
          <h3 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Student Success Stories
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial) => (
              <div key={testimonial.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 text-center">
                <div className="relative mb-6">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-blue-200 dark:border-blue-800"
                  />
                  <div className="absolute -top-2 -right-2 bg-yellow-500 text-white p-2 rounded-full">
                    <StarIcon className="h-4 w-4" />
                  </div>
                </div>
                
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {testimonial.name}
                </h4>
                
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                  Age {testimonial.age} • {testimonial.school}
                </p>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4">
                  <p className="text-gray-700 dark:text-gray-300 italic">
                    &quot;{testimonial.quote}&quot;
                  </p>
                </div>
                
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                  <TrophyIcon className="h-4 w-4 mr-1" />
                  {testimonial.achievement}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Impact Statistics */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
          <h3 className="text-3xl font-bold text-center mb-8">
            Our Impact Across Nigeria
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">500+</div>
              <div className="text-blue-100">Students Trained</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">25+</div>
              <div className="text-blue-100">Partner Schools</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">15+</div>
              <div className="text-blue-100">STEM Programs</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">95%</div>
              <div className="text-blue-100">Success Rate</div>
            </div>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-blue-100 mb-6">
              Join us in empowering the next generation of Nigerian tech leaders!
            </p>
            <button className="bg-white text-blue-600 px-8 py-3 rounded-full font-bold hover:bg-blue-50 transition-colors">
              Get Started Today
            </button>
          </div>
        </div>
      </div>
    </section>
  )
} 
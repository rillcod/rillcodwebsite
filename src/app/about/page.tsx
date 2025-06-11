"use client";
import { useState } from "react";
import { Users, Target, Award, Heart, Lightbulb, Shield, Globe, BookOpen, ChevronDown, ChevronUp, CheckCircle, Building, Mail, Brain } from "lucide-react";
import Link from "next/link";

const values = [
  {
    icon: <Lightbulb className="w-12 h-12 text-yellow-500" />,
    title: "Innovation",
    description: "We foster creativity and innovative thinking in all our programs, encouraging students to think outside the box.",
    color: "from-yellow-400 to-orange-500"
  },
  {
    icon: <Shield className="w-12 h-12 text-green-500" />,
    title: "Quality",
    description: "We maintain the highest standards in technology education, ensuring every student receives world-class training.",
    color: "from-green-400 to-emerald-500"
  },
  {
    icon: <Heart className="w-12 h-12 text-red-500" />,
    title: "Passion",
    description: "Our passion for technology education drives us to inspire and empower the next generation of innovators.",
    color: "from-red-400 to-pink-500"
  },
  {
    icon: <Globe className="w-12 h-12 text-blue-500" />,
    title: "Global Perspective",
    description: "We prepare students for global opportunities with internationally recognized skills and knowledge.",
    color: "from-blue-400 to-cyan-500"
  }
];

const team = [
  {
    name: "Dr. Sarah Johnson",
    role: "Founder & CEO",
    bio: "A technology education pioneer with 15+ years of experience in curriculum development and AI integration.",
    expertise: ["AI Education", "Curriculum Design", "Educational Technology"],
    email: "sarah@rillcod.tech"
  },
  {
    name: "Michael Chen",
    role: "Head of Technology",
    bio: "Expert in software development and educational technology platforms with a focus on scalable solutions.",
    expertise: ["Software Development", "Platform Architecture", "IoT Integration"],
    email: "michael@rillcod.tech"
  },
  {
    name: "Prof. David Wilson",
    role: "Academic Director",
    bio: "Former university professor specializing in computer science education and student development.",
    expertise: ["Computer Science", "Student Development", "Research"],
    email: "david@rillcod.tech"
  },
  {
    name: "Lisa Rodriguez",
    role: "Head of Operations",
    bio: "Experienced in educational administration and ensuring smooth operations across all programs.",
    expertise: ["Operations Management", "Student Services", "Quality Assurance"],
    email: "lisa@rillcod.tech"
  }
];

const stats = [
  { number: "500+", label: "Students Enrolled", icon: <Users className="w-8 h-8" />, color: "text-blue-600" },
  { number: "12", label: "Years Curriculum", icon: <BookOpen className="w-8 h-8" />, color: "text-green-600" },
  { number: "95%", label: "Success Rate", icon: <Award className="w-8 h-8" />, color: "text-purple-600" },
  { number: "50+", label: "Partner Schools", icon: <Target className="w-8 h-8" />, color: "text-orange-600" }
];

const achievements = [
  {
    year: "2024",
    title: "Best Technology Academy Award",
    description: "Recognized as the leading technology education provider in Nigeria",
    icon: <Award className="w-6 h-6" />
  },
  {
    year: "2023",
    title: "500+ Students Milestone",
    description: "Successfully enrolled over 500 students across various programs",
    icon: <Users className="w-6 h-6" />
  },
  {
    year: "2023",
    title: "AI Integration Excellence",
    description: "Pioneered AI-integrated curriculum in Nigerian schools",
    icon: <Brain className="w-6 h-6" />
  },
  {
    year: "2022",
    title: "50+ Partner Schools",
    description: "Established partnerships with over 50 schools nationwide",
    icon: <Building className="w-6 h-6" />
  }
];

export default function About() {
  const [selectedTeamMember, setSelectedTeamMember] = useState<string | null>(null);

  const toggleTeamMember = (memberName: string) => {
    setSelectedTeamMember(selectedTeamMember === memberName ? null : memberName);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">About RILLCOD Academy</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Empowering the next generation of world-class professionals through innovative, AI-integrated STEM education.
          </p>
          <div className="w-20 h-2 bg-gradient-to-r from-blue-600 to-purple-600 mx-auto rounded-full"></div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className={`flex justify-center mb-4 ${stat.color}`}>
                {stat.icon}
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.number}</div>
              <div className="text-gray-600 dark:text-gray-300">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Mission, Vision, Objective */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <div className="space-y-12">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Our Mission</h2>
              <p className="text-lg text-gray-700 dark:text-gray-300 max-w-4xl mx-auto">
                To transform Nigeria&apos;s educational landscape by shifting from memory-based learning to a system that fosters critical thinking, creativity, and global competitiveness in AI, robotics, and digital skills.
              </p>
            </div>
            
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Our Vision</h2>
              <p className="text-lg text-gray-700 dark:text-gray-300 max-w-4xl mx-auto">
                To equip every student with the skills to thrive in the AI-driven future, positioning Nigeria as a leader in Africa&apos;s digital transformation.
              </p>
            </div>
            
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Our Objective</h2>
              <p className="text-lg text-gray-700 dark:text-gray-300 max-w-4xl mx-auto">
                To deliver a 12-year, session-based curriculum that integrates AI, robotics, and traditional programming, ensuring students from Basic 1 to SS3 graduate with advanced mobile development skills, AI literacy, robotics expertise, and professional portfolios.
              </p>
            </div>
          </div>
      </div>

        {/* Core Values */}
      <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Our Core Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className={`w-20 h-20 bg-gradient-to-r ${value.color} rounded-full flex items-center justify-center mx-auto mb-6`}>
                  {value.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{value.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{value.description}</p>
              </div>
            ))}
          </div>
      </div>

        {/* Executive Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">Executive Summary</h2>
          <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
            Transform your school into a premier AI and technology powerhouse with RILLCOD ACADEMY&apos;s 12-year, session-based program. This revolutionary curriculum blends traditional programming with cutting-edge artificial intelligence and robotics, preparing students for the Fourth Industrial Revolution while generating substantial revenue for your institution.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Complete AI-Integrated Journey</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">Structured progression from Basic 1 to SS3, with AI and robotics embedded in every term.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">36+ Capstone Projects</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">Real-world solutions like smart agriculture systems, AI-powered analytics, and mobile apps.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Guaranteed Revenue</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">30% profit share with termly fees starting at ₦20,000, no upfront costs.</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Modern Infrastructure</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">Interactive boards, robotics kits, AI development platforms, and laptops provided by RILLCOD.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">African Market Leadership</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">Position your school as a pioneer in Nigeria&apos;s booming digital economy.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 mt-1" />
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Industry 4.0 Readiness</h4>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">Graduates equipped for high-paying careers in AI, IoT, and tech entrepreneurship.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Achievements Timeline */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Our Achievements</h2>
          <div className="space-y-6">
            {achievements.map((achievement, index) => (
              <div key={index} className="flex items-center gap-6 p-6 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                <div className="w-12 h-12 bg-blue-600 dark:bg-blue-400 rounded-full flex items-center justify-center text-white font-bold">
                  {achievement.year.slice(-2)}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{achievement.title}</h3>
                  <p className="text-gray-600 dark:text-gray-300">{achievement.description}</p>
                </div>
                <div className="text-blue-600 dark:text-blue-400">
                  {achievement.icon}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Our Leadership Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="h-48 bg-gradient-to-br from-blue-100 dark:from-blue-700 to-purple-100 dark:to-purple-700 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-blue-600 dark:bg-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-white dark:text-gray-900 font-bold text-xl">{member.name.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold">{member.role}</p>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{member.name}</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{member.bio}</p>
                  
                  <button
                    onClick={() => toggleTeamMember(member.name)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-400 text-white dark:text-gray-900 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors"
                  >
                    {selectedTeamMember === member.name ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        View Details
                      </>
                    )}
                  </button>
                  
                  {selectedTeamMember === member.name && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Expertise:</h4>
                      <div className="flex flex-wrap gap-2">
                        {member.expertise.map((skill, idx) => (
                          <span key={idx} className="bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-xs">
                            {skill}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 space-y-2">
                        <a href={`mailto:${member.email}`} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500">
                          <Mail className="w-4 h-4" />
                          {member.email}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Education?</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Join us in revolutionizing technology education and preparing students for the future of work.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/school-registration"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Building className="w-5 h-5 mr-2" />
              Partner Your School
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-blue-600 transition-colors"
            >
              <Mail className="w-5 h-5 mr-2" />
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 
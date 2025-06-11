"use client";
import { useRef, useState } from 'react';
import Link from 'next/link';
import { School, Users, Clock, Award, Target, Monitor, Cat, Globe, Palette, Bot, Lightbulb, Code, Brain, Star, BookOpen, Calendar, Mail, Phone, MapPin, ChevronRight, Play, CheckCircle, Sun } from 'lucide-react';
import PerformanceMonitor from '@/components/PerformanceMonitor';
import SummerSchoolPopup from '@/components/SummerSchoolPopup';

export default function Home() {
  const [showSummerSchoolPopup, setShowSummerSchoolPopup] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const programs = [
    {
      id: 'ict-fundamentals',
      icon: <Monitor className="w-8 h-8 text-blue-600" />,
      title: "ICT Fundamentals",
      description: "Master the basics of computers and digital technology! Learn essential computer skills that will help you in school and beyond.",
      color: "from-blue-400 to-blue-600",
      features: ["Computer basics & operations", "Microsoft Office skills", "Internet safety & research", "Digital file management"],
      ageGroup: "Primary 4 - JSS2",
      duration: "8 weeks",
      price: "₦25,000",
      level: "Beginner",
      outcomes: ["Confident computer usage", "Basic office skills", "Safe internet practices", "Digital literacy foundation"]
    },
    {
      id: 'scratch-programming',
      icon: <Cat className="w-8 h-8 text-orange-600" />,
      title: "Scratch Programming",
      description: "Create amazing games and animations with colorful blocks! Learn programming concepts through fun, visual coding.",
      color: "from-orange-400 to-orange-600",
      features: ["Visual programming blocks", "Game development", "Animation creation", "Interactive storytelling"],
      ageGroup: "Primary 5 - JSS3",
      duration: "10 weeks",
      price: "₦35,000",
      level: "Beginner",
      outcomes: ["Programming logic", "Creative problem-solving", "Game design skills", "Digital storytelling"]
    },
    {
      id: 'web-development',
      icon: <Globe className="w-8 h-8 text-purple-600" />,
      title: "HTML/CSS Programming",
      description: "Build your own websites from scratch! Create beautiful web pages that you can share with the world.",
      color: "from-purple-400 to-purple-600",
      features: ["HTML structure", "CSS styling", "Responsive design", "Web publishing"],
      ageGroup: "JSS1 - SS2",
      duration: "12 weeks",
      price: "₦45,000",
      level: "Intermediate",
      outcomes: ["Web development skills", "Design principles", "Portfolio website", "Digital publishing"]
    },
    {
      id: 'python-programming',
      icon: <span className="text-2xl">🐍</span>,
      title: "Python Programming",
      description: "Learn the world's most popular programming language! Create apps, games, and solve real-world problems.",
      color: "from-green-400 to-green-600",
      features: ["Python syntax", "Data structures", "Problem solving", "Project development"],
      ageGroup: "JSS2 - SS3",
      duration: "14 weeks",
      price: "₦55,000",
      level: "Advanced",
      outcomes: ["Programming fundamentals", "Algorithmic thinking", "Real-world applications", "Career preparation"]
    },
    {
      id: 'web-design',
      icon: <Palette className="w-8 h-8 text-pink-600" />,
      title: "Web Design",
      description: "Design stunning websites that look amazing on all devices! Learn modern web design principles and tools.",
      color: "from-pink-400 to-pink-600",
      features: ["UI/UX design", "Responsive layouts", "Color theory", "Design tools"],
      ageGroup: "JSS2 - SS3",
      duration: "12 weeks",
      price: "₦50,000",
      level: "Intermediate",
      outcomes: ["Design thinking", "Visual communication", "Portfolio projects", "Creative skills"]
    },
    {
      id: 'robotics',
      icon: <Bot className="w-8 h-8 text-cyan-600" />,
      title: "Robotics Programming",
      description: "Build and program real robots! Learn about electronics, sensors, and automation through hands-on projects.",
      color: "from-cyan-400 to-cyan-600",
      features: ["Hardware programming", "Sensor integration", "Automation logic", "Physical computing"],
      ageGroup: "JSS2 - SS3",
      duration: "16 weeks",
      price: "₦75,000",
      level: "Advanced",
      outcomes: ["Electronics understanding", "Automation skills", "Engineering concepts", "Innovation mindset"]
    }
  ];

  const benefits = [
    {
      icon: <Lightbulb className="w-8 h-8 text-orange-500" />,
      title: "Practical Learning",
      description: "Students learn by doing, working on real projects and building their portfolio from day one."
    },
    {
      icon: <Code className="w-8 h-8 text-blue-500" />,
      title: "Industry-Relevant Skills",
      description: "Our curriculum is constantly updated to match current industry standards and practices."
    },
    {
      icon: <Users className="w-8 h-8 text-green-500" />,
      title: "Small Class Sizes",
      description: "Maximum attention and support with our small group learning environment."
    },
    {
      icon: <Brain className="w-8 h-8 text-purple-500" />,
      title: "Critical Thinking",
      description: "Develop problem-solving skills and computational thinking abilities."
    }
  ];

  const stats = [
    { number: "500+", label: "Nigerian Students", icon: <Users className="w-6 h-6" /> },
    { number: "25+", label: "Partner Schools", icon: <School className="w-6 h-6" /> },
    { number: "15+", label: "STEM Programs", icon: <Award className="w-6 h-6" /> },
    { number: "95%", label: "Success Rate", icon: <Star className="w-6 h-6" /> }
  ];

  return (
    <div className="w-full dark:bg-gray-900" ref={containerRef}>
      <PerformanceMonitor />
      
      {/* Hero Section */}
      <section id="home" className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FF914D] via-blue-400 to-indigo-600 overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
            <div className="w-full lg:w-1/2 text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
                Nigerian Kids Building the Future with Code
              </h1>
              
              <p className="text-xl sm:text-2xl text-white/90 mb-8">
                Empowering young Nigerian minds with STEM skills, robotics, and computer programming. From Benin City to across Nigeria, we're creating the next generation of tech innovators!
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-8 justify-center lg:justify-start">
                <button
                  onClick={() => setShowSummerSchoolPopup(true)}
                  className="group inline-flex items-center justify-center px-6 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-lg font-bold rounded-full shadow-lg hover:from-yellow-500 hover:to-orange-600 transition-all duration-300 hover:scale-105 focus-ring animate-pulse"
                >
                  <Sun className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                  Register for Summer School
                  <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </button>
                
                <Link
                  href="/school-registration"
                  className="group inline-flex items-center justify-center px-6 py-4 bg-blue-500 text-white text-lg font-bold rounded-full shadow-lg hover:bg-blue-600 transition-all duration-300 hover:scale-105 focus-ring"
                >
                  <School className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                  Register My School
                  <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                
                <Link
                  href="/student-registration"
                  className="group inline-flex items-center justify-center px-6 py-4 bg-green-500 text-white text-lg font-bold rounded-full shadow-lg hover:bg-green-600 transition-all duration-300 hover:scale-105 focus-ring"
                >
                  <Users className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                  Enroll Now
                  <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-lg lg:max-w-none mx-auto lg:mx-0">
                {stats.map((stat, index) => (
                  <div key={index} className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center hover-lift">
                    <div className="flex justify-center mb-2 text-white/80">
                      {stat.icon}
                    </div>
                    <div className="text-2xl font-bold text-white">{stat.number}</div>
                    <div className="text-sm text-white/80">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="w-full lg:w-1/2 flex justify-center lg:justify-end relative">
              <div className="relative w-full max-w-md">
                <div className="absolute -top-8 -right-8 bg-white dark:bg-gray-800 rounded-2xl px-4 py-2 shadow-lg transform rotate-[-5deg] z-10 animate-float">
                  <p className="text-xl font-bold text-[#FF914D] dark:text-orange-400">I Love Coding! 🚀</p>
                </div>
                <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                  {/* Nigerian Kids STEM Image */}
                  <img 
                    src="https://res.cloudinary.com/dpigtwit0/image/upload/v1749628191/1749627870325_ygwn4g.jpg"
                    alt="Nigerian Children Learning STEM and Coding at Rillcod Academy"
                    className="w-full h-80 object-cover rounded-lg shadow-2xl transform hover:scale-105 transition-transform duration-300 animate-fade-in"
                    onError={(e) => {
                      // Fallback to gradient with Nigerian kid emoji if image fails
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `
                          <div class="w-full h-80 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
                            <div class="text-center text-white">
                              <div class="text-6xl mb-4">👨‍💻🇳🇬</div>
                              <h3 class="text-2xl font-bold mb-2">Nigerian Kids Learning Technology</h3>
                              <p class="text-lg opacity-90">Empowering young minds with coding skills</p>
                            </div>
                          </div>
                        `;
                      }
                    }}
                  />
                </div>
                <div className="absolute bottom-[-20px] left-[20px] bg-white dark:bg-gray-800 rounded-2xl px-4 py-2 shadow-lg transform rotate-[5deg] z-10 animate-float-delayed">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">Benin City Tech Stars! 💻</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Summer School Banner */}
      <section className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 py-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-24 -translate-x-24"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between">
            <div className="flex-1 text-white mb-6 lg:mb-0">
              <div className="flex items-center space-x-2 mb-4">
                <Sun className="w-8 h-8" />
                <span className="text-2xl font-bold">Summer School 2025</span>
                <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-semibold animate-pulse">
                  Limited Time
                </div>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Accelerate Your Tech Journey This Summer!
              </h2>
              <p className="text-lg mb-6 opacity-90">
                Intensive programs for JSS3 students starting <strong>June 15th</strong> and other classes from <strong>July 25th</strong>. 
                Both online and onsite options available.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5" />
                  <span>JSS3: June 15th - 6 weeks intensive</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5" />
                  <span>Others: July 25th - 4 weeks</span>
                </div>
                <div className="flex items-center space-x-2">
                  <MapPin className="w-5 h-5" />
                  <span>Online & Onsite available</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5" />
                  <span>Small class sizes (8-15 students)</span>
                </div>
              </div>
              <button
                onClick={() => setShowSummerSchoolPopup(true)}
                className="bg-white text-orange-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 hover:scale-105 transition-all duration-300 shadow-lg"
              >
                Register for Summer School
              </button>
            </div>
            <div className="flex-shrink-0">
              <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Sun className="w-16 h-16 text-white" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-16 md:py-24 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-white mb-4">About Rillcod Academy</h2>
            <div className="w-20 h-2 bg-purple-500 mx-auto rounded-full"></div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 p-8 rounded-2xl shadow-md">
              <h3 className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-4">Company Overview</h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
                Rillcod Academy is a subsidiary of Rillcod Technologies, made of young professionals inspired to help children see possibilities, learn the process and make progress in technology skills.
              </p>
              
              <h3 className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-4">Our Mission</h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                Transform Nigeria&apos;s educational system from memory-based learning to education that stimulates thinking and creativity. We empower children with 21st-century skills through engaging, fun-filled learning experiences.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { icon: <Clock className="w-7 h-7 text-blue-600" />, title: "Experience", desc: "Over 4 years of experience in deploying innovative STEM Learning programs for children across Nigeria.", color: "blue" },
                { icon: <Award className="w-7 h-7 text-green-600" />, title: "Quality", desc: "Our curriculum is designed by education experts to ensure age-appropriate, engaging learning experiences.", color: "green" },
                { icon: <Target className="w-7 h-7 text-yellow-600" />, title: "Approach", desc: "Hands-on, project-based learning that makes complex concepts accessible and enjoyable for children.", color: "yellow" },
                { icon: <Users className="w-7 h-7 text-purple-600" />, title: "Team", desc: "Highly qualified and trained facilitators who are passionate about children&apos;s education and technology.", color: "purple" }
              ].map((item, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md border-2 border-gray-100 dark:border-gray-700 hover-lift">
                  <div className={`w-14 h-14 bg-${item.color}-100 dark:bg-${item.color}-900/30 rounded-full flex items-center justify-center mb-4`}>
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{item.title}</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section id="programs" className="py-16 md:py-24 bg-gray-50 dark:bg-gray-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 dark:text-white mb-4">Our Fun Programs</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-6">
              Exciting tech adventures waiting for your child!
            </p>
            <div className="w-20 h-2 bg-[#FF914D] mx-auto rounded-full mb-8"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {programs.map((program) => (
              <div 
                key={program.id}
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden hover-lift group border border-gray-100 dark:border-gray-700"
              >
                {/* Program Header */}
                <div className={`bg-gradient-to-r ${program.color} p-6 flex items-center justify-center h-32 relative`}>
                  <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    {program.icon}
                  </div>
                  {/* Level Badge */}
                  <div className="absolute top-4 right-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${
                      program.level === 'Beginner' ? 'bg-green-500' :
                      program.level === 'Intermediate' ? 'bg-blue-500' : 'bg-purple-500'
                    }`}>
                      {program.level}
                    </span>
                  </div>
                </div>
                
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">{program.title}</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">{program.description}</p>
                  
                  {/* Quick Info */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Age</div>
                      <div className="font-semibold text-gray-800 dark:text-white">{program.ageGroup}</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Duration</div>
                      <div className="font-semibold text-gray-800 dark:text-white">{program.duration}</div>
                    </div>
                  </div>
                  
                  {/* Key Features */}
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      Key Features
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {program.features.slice(0, 3).map((feature, index) => (
                        <div key={index} className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                          <div className="w-1.5 h-1.5 bg-[#FF914D] rounded-full mr-2 flex-shrink-0"></div>
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link 
                      href={`/programs/${program.id}`}
                      className="inline-flex items-center justify-center px-6 py-3 bg-[#FF914D] text-white rounded-full hover:bg-[#e67e3d] transition-all duration-300 hover:scale-105 font-bold focus-ring text-center"
                    >
                      Learn More
                    </Link>
                    <Link 
                      href="/student-registration"
                      className="inline-flex items-center justify-center px-6 py-3 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-all duration-300 hover:scale-105 font-bold focus-ring text-center"
                    >
                      Enroll Now
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Programs CTA */}
          <div className="text-center mt-12">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700 max-w-4xl mx-auto">
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Ready to Choose Your Program?</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-2xl mx-auto">
                Each program is designed to match your child&apos;s age and skill level. Click &quot;Learn More&quot; to explore detailed information about each program.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/programs"
                  className="inline-flex items-center justify-center px-8 py-4 bg-[#FF914D] text-white rounded-full hover:bg-[#e67e3d] transition-all duration-300 hover:scale-105 font-bold focus-ring"
                >
                  <BookOpen className="w-5 h-5 mr-2" />
                  View All Programs
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center px-8 py-4 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-all duration-300 hover:scale-105 font-bold focus-ring"
                >
                  <Mail className="w-5 h-5 mr-2" />
                  Get Advice
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-16 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Why Choose Our Program?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              We provide a comprehensive learning experience that prepares students for the digital future.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <div 
                key={index}
                className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 hover-lift"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 bg-white dark:bg-gray-700 p-4 rounded-full shadow-md">
                    {benefit.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Start Your Child&apos;s Tech Journey?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join hundreds of students who are already learning and creating amazing things with technology.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/student-registration"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 text-lg font-bold rounded-full shadow-lg hover:bg-gray-100 transition-all duration-300 hover:scale-105 focus-ring"
            >
              <Play className="w-5 h-5 mr-2" />
              Start Learning Today
            </Link>
            <Link
              href="/school-registration"
              className="inline-flex items-center justify-center px-8 py-4 bg-transparent text-white border-2 border-white text-lg font-bold rounded-full hover:bg-white hover:text-blue-600 transition-all duration-300 hover:scale-105 focus-ring"
            >
              <School className="w-5 h-5 mr-2" />
              Partner with Us
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="bg-white dark:bg-gray-900 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">Contact Us</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Have questions about our programs? We&apos;re here to help! Reach out to us through any of the following channels.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { icon: <Phone className="w-8 h-8 text-[#FF914D]" />, title: "Phone", details: ["+234 811 660 0091", "+234 703 640 2679"] },
              { icon: <Mail className="w-8 h-8 text-[#FF914D]" />, title: "Email", details: ["info@rillcod.tech", "rillcod@gmail.com"] },
              { icon: <MapPin className="w-8 h-8 text-[#FF914D]" />, title: "Address", details: ["No 26 Ogiesoba Avenue", "Off Airport Road, Benin City"] }
            ].map((contact, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-800 p-8 rounded-xl text-center hover-lift">
                <div className="flex justify-center mb-4">
                  {contact.icon}
                </div>
                <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">{contact.title}</h3>
                {contact.details.map((detail, idx) => (
                  <p key={idx} className="text-gray-600 dark:text-gray-300">{detail}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Summer School Popup */}
      <SummerSchoolPopup 
        isOpen={showSummerSchoolPopup} 
        onClose={() => setShowSummerSchoolPopup(false)} 
      />
    </div>
  );
}

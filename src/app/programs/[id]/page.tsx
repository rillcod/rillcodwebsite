"use client";
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Users, Clock, Star, CheckCircle, BookOpen, Target, Award, Mail, Phone, MapPin, ChevronRight, Play, Code, Brain, Rocket, GraduationCap, Monitor, Cat, Globe, Palette, Bot } from 'lucide-react';

const programs = [
  {
    id: 'ict-fundamentals',
    icon: <Monitor className="w-16 h-16 text-blue-600" />,
    title: "ICT Fundamentals",
    description: "Master the basics of computers and digital technology! Learn essential computer skills that will help you in school and beyond.",
    color: "from-blue-400 to-blue-600",
    features: ["Computer basics & operations", "Microsoft Office skills", "Internet safety & research", "Digital file management"],
    ageGroup: "Primary 4 - JSS2",
    duration: "8 weeks",
    price: "₦25,000",
    level: "Beginner",
    outcomes: ["Confident computer usage", "Basic office skills", "Safe internet practices", "Digital literacy foundation"],
    curriculum: [
      "Week 1-2: Computer Basics & Hardware",
      "Week 3-4: Operating System & File Management",
      "Week 5-6: Microsoft Office Suite",
      "Week 7-8: Internet Safety & Research Skills"
    ],
    requirements: ["No prior experience needed", "Basic reading skills", "Access to computer (provided in class)"],
    schedule: "Monday & Wednesday, 3:00 PM - 5:00 PM",
    location: "Rillcod Academy Center, Lagos",
    instructor: "Mr. Adebayo Johnson",
    maxStudents: 15
  },
  {
    id: 'scratch-programming',
    icon: <Cat className="w-16 h-16 text-orange-600" />,
    title: "Scratch Programming",
    description: "Create amazing games and animations with colorful blocks! Learn programming concepts through fun, visual coding.",
    color: "from-orange-400 to-orange-600",
    features: ["Visual programming blocks", "Game development", "Animation creation", "Interactive storytelling"],
    ageGroup: "Primary 5 - JSS3",
    duration: "10 weeks",
    price: "₦35,000",
    level: "Beginner",
    outcomes: ["Programming logic", "Creative problem-solving", "Game design skills", "Digital storytelling"],
    curriculum: [
      "Week 1-2: Introduction to Scratch & Basic Blocks",
      "Week 3-4: Character Movement & Animation",
      "Week 5-6: Game Mechanics & Scoring",
      "Week 7-8: Sound & Visual Effects",
      "Week 9-10: Project Development & Showcase"
    ],
    requirements: ["Basic computer skills", "Creative mindset", "Access to computer (provided in class)"],
    schedule: "Tuesday & Thursday, 3:00 PM - 5:00 PM",
    location: "Rillcod Academy Center, Lagos",
    instructor: "Ms. Chioma Okonkwo",
    maxStudents: 12
  },
  {
    id: 'web-development',
    icon: <Globe className="w-16 h-16 text-purple-600" />,
    title: "HTML/CSS Programming",
    description: "Build your own websites from scratch! Create beautiful web pages that you can share with the world.",
    color: "from-purple-400 to-purple-600",
    features: ["HTML structure", "CSS styling", "Responsive design", "Web publishing"],
    ageGroup: "JSS1 - SS2",
    duration: "12 weeks",
    price: "₦45,000",
    level: "Intermediate",
    outcomes: ["Web development skills", "Design principles", "Portfolio website", "Digital publishing"],
    curriculum: [
      "Week 1-3: HTML Fundamentals & Structure",
      "Week 4-6: CSS Styling & Layout",
      "Week 7-9: Responsive Design & Media Queries",
      "Week 10-12: Advanced CSS & Project Development"
    ],
    requirements: ["Basic computer skills", "Understanding of file management", "Access to computer (provided in class)"],
    schedule: "Monday & Wednesday, 4:00 PM - 6:00 PM",
    location: "Rillcod Academy Center, Lagos",
    instructor: "Mr. David Okafor",
    maxStudents: 10
  },
  {
    id: 'python-programming',
    icon: <span className="text-4xl">🐍</span>,
    title: "Python Programming",
    description: "Learn the world's most popular programming language! Create apps, games, and solve real-world problems.",
    color: "from-green-400 to-green-600",
    features: ["Python syntax", "Data structures", "Problem solving", "Project development"],
    ageGroup: "JSS2 - SS3",
    duration: "14 weeks",
    price: "₦55,000",
    level: "Advanced",
    outcomes: ["Programming fundamentals", "Algorithmic thinking", "Real-world applications", "Career preparation"],
    curriculum: [
      "Week 1-3: Python Basics & Variables",
      "Week 4-6: Control Structures & Functions",
      "Week 7-9: Data Structures & Algorithms",
      "Week 10-12: Object-Oriented Programming",
      "Week 13-14: Project Development & Portfolio"
    ],
    requirements: ["Strong math skills", "Logical thinking", "Access to computer (provided in class)"],
    schedule: "Tuesday & Thursday, 4:00 PM - 6:00 PM",
    location: "RILLCOD Academy Center, Lagos",
    instructor: "Dr. Sarah Ahmed",
    maxStudents: 8
  },
  {
    id: 'web-design',
    icon: <Palette className="w-16 h-16 text-pink-600" />,
    title: "Web Design",
    description: "Design stunning websites that look amazing on all devices! Learn modern web design principles and tools.",
    color: "from-pink-400 to-pink-600",
    features: ["UI/UX design", "Responsive layouts", "Color theory", "Design tools"],
    ageGroup: "JSS2 - SS3",
    duration: "12 weeks",
    price: "₦50,000",
    level: "Intermediate",
    outcomes: ["Design thinking", "Visual communication", "Portfolio projects", "Creative skills"],
    curriculum: [
      "Week 1-3: Design Principles & Color Theory",
      "Week 4-6: UI/UX Fundamentals & Wireframing",
      "Week 7-9: Responsive Design & Prototyping",
      "Week 10-12: Advanced Design Tools & Portfolio"
    ],
    requirements: ["Basic computer skills", "Creative mindset", "Access to computer (provided in class)"],
    schedule: "Friday & Saturday, 2:00 PM - 4:00 PM",
    location: "RILLCOD Academy Center, Lagos",
    instructor: "Ms. Funke Adebayo",
    maxStudents: 10
  },
  {
    id: 'robotics',
    icon: <Bot className="w-16 h-16 text-cyan-600" />,
    title: "Robotics Programming",
    description: "Build and program real robots! Learn about electronics, sensors, and automation through hands-on projects.",
    color: "from-cyan-400 to-cyan-600",
    features: ["Hardware programming", "Sensor integration", "Automation logic", "Physical computing"],
    ageGroup: "JSS2 - SS3",
    duration: "16 weeks",
    price: "₦75,000",
    level: "Advanced",
    outcomes: ["Electronics understanding", "Automation skills", "Engineering concepts", "Innovation mindset"],
    curriculum: [
      "Week 1-4: Electronics Basics & Arduino",
      "Week 5-8: Sensors & Actuators",
      "Week 9-12: Programming Logic & Control",
      "Week 13-16: Advanced Projects & Innovation"
    ],
    requirements: ["Strong math and science background", "Patience for hands-on work", "All materials provided"],
    schedule: "Saturday, 10:00 AM - 2:00 PM",
    location: "RILLCOD Academy Center, Lagos",
    instructor: "Engr. Michael Uche",
    maxStudents: 6
  }
];

export default function ProgramPage() {
  const params = useParams();
  const programId = params?.id as string;
  const program = programs.find(p => p.id === programId);

  if (!program) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Program Not Found</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">The program you're looking for doesn't exist.</p>
          <Link href="/programs" className="bg-[#FF914D] text-white px-6 py-3 rounded-full hover:bg-[#e67e3d] transition-colors">
            View All Programs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className={`bg-gradient-to-r ${program.color} text-white py-16`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center mb-6">
            <Link href="/programs" className="flex items-center text-white/80 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Programs
            </Link>
          </div>

          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${program.level === 'Beginner' ? 'bg-green-500' :
                    program.level === 'Intermediate' ? 'bg-blue-500' : 'bg-purple-500'
                  }`}>
                  {program.level}
                </span>
                <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                  {program.ageGroup}
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-4">{program.title}</h1>
              <p className="text-xl mb-6 opacity-90">{program.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="text-center">
                  <div className="text-2xl font-bold">{program.duration}</div>
                  <div className="text-sm opacity-80">Duration</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{program.price}</div>
                  <div className="text-sm opacity-80">Price</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{program.schedule}</div>
                  <div className="text-sm opacity-80">Schedule</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{program.maxStudents}</div>
                  <div className="text-sm opacity-80">Max Students</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/student-registration"
                  className="bg-white text-gray-800 px-8 py-4 rounded-full font-bold hover:bg-gray-100 transition-colors text-center"
                >
                  Enroll Now
                </Link>
                <Link
                  href="/contact"
                  className="border-2 border-white text-white px-8 py-4 rounded-full font-bold hover:bg-white hover:text-gray-800 transition-colors text-center"
                >
                  Get More Info
                </Link>
              </div>
            </div>

            <div className="flex-shrink-0">
              <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                {program.icon}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* What You'll Learn */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center">
                <BookOpen className="w-6 h-6 text-[#FF914D] mr-3" />
                What You'll Learn
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {program.features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Curriculum */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center">
                <Target className="w-6 h-6 text-[#FF914D] mr-3" />
                Curriculum Overview
              </h2>
              <div className="space-y-4">
                {program.curriculum.map((week, index) => (
                  <div key={index} className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="w-8 h-8 bg-[#FF914D] text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {index + 1}
                    </div>
                    <span className="text-gray-700 dark:text-gray-300">{week}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Learning Outcomes */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center">
                <Star className="w-6 h-6 text-[#FF914D] mr-3" />
                Learning Outcomes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {program.outcomes.map((outcome, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-[#FF914D] rounded-full flex-shrink-0"></div>
                    <span className="text-gray-700 dark:text-gray-300">{outcome}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Program Details */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Program Details</h3>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Duration</div>
                    <div className="font-semibold text-gray-800 dark:text-white">{program.duration}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Age Group</div>
                    <div className="font-semibold text-gray-800 dark:text-white">{program.ageGroup}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Schedule</div>
                    <div className="font-semibold text-gray-800 dark:text-white">{program.schedule}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Location</div>
                    <div className="font-semibold text-gray-800 dark:text-white">{program.location}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Requirements</h3>
              <div className="space-y-3">
                {program.requirements.map((req, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300 text-sm">{req}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Instructor */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Instructor</h3>
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <GraduationCap className="w-8 h-8 text-white" />
                </div>
                <div className="font-semibold text-gray-800 dark:text-white">{program.instructor}</div>
                <div className="text-sm text-gray-600 dark:text-gray-300">Expert Instructor</div>
              </div>
            </div>

            {/* CTA */}
            <div className="bg-gradient-to-r from-[#FF914D] to-orange-500 rounded-2xl p-6 text-white text-center">
              <h3 className="text-xl font-bold mb-3">Ready to Start?</h3>
              <p className="text-sm mb-4 opacity-90">Join this exciting program and unlock your potential!</p>
              <Link
                href="/student-registration"
                className="bg-white text-[#FF914D] px-6 py-3 rounded-full font-bold hover:bg-gray-100 transition-colors inline-block"
              >
                Enroll Now
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
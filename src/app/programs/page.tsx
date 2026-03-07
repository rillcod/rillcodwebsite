"use client";
import { useState } from "react";
import Link from "next/link";
import { Monitor, Cat, Globe, Palette, Bot, ArrowRight, Clock, Users, Star, Search, Filter, BookOpen, Code, Zap, Target, CheckCircle, TrendingUp, Award, MapPin, Heart, Sparkles, GraduationCap, Lightbulb, Building2, Rocket, Crown, Shield, Brain, Eye, HandHeart, Globe2, Smartphone, Laptop, Gamepad2, Camera, Music, Video, FileText, BarChart3, Cpu, Database, Cloud, Wifi, Tablet, Watch, Headphones, Speaker, Printer, Keyboard, Mouse, HardDrive, Usb, Battery, Power, Settings, Lock, Unlock, Key, User, Users2, UserCheck, UserX, UserPlus, UserMinus, UserCog, UserSearch, UserCheck2, Calendar, Sun } from "lucide-react";
import SummerSchoolPopup from "@/components/SummerSchoolPopup";

const programs = [
  {
    id: 'ict-fundamentals',
    icon: <Monitor className="w-12 h-12 text-blue-600" />,
    title: "ICT Fundamentals",
    description: "Master the digital world! Learn computer basics, internet safety, and digital citizenship for the modern age.",
    color: "from-blue-400 to-blue-600",
    duration: "8 weeks",
    level: "Beginner",
    students: "10-15 students",
    features: ["Computer basics", "File management", "Internet safety", "Digital citizenship"],
    price: "₦35,000",
    category: "Foundation",
    ageRange: "Basic 1 – Basic 3",
    skills: ["Digital Literacy", "Computer Basics", "Internet Safety", "File Management"],
    projects: ["Digital Story", "Safe Internet Poster", "File Organization", "Basic Presentations"],
    nigerianContext: "Essential for Nigeria's digital transformation",
    successStory: "Amina from Lagos now helps her family with online banking",
    careerPath: "Digital Assistant, IT Support, Data Entry Specialist"
  },
  {
    id: 'scratch-programming',
    icon: <Cat className="w-12 h-12 text-orange-600" />,
    title: "Scratch Programming",
    description: "Create amazing animations and games! Build interactive stories and games that showcase Nigerian culture.",
    color: "from-orange-400 to-orange-600",
    duration: "10 weeks",
    level: "Beginner",
    students: "8-12 students",
    features: ["Block-based coding", "Game development", "Animation creation", "Storytelling"],
    price: "₦45,000",
    category: "Programming",
    ageRange: "Basic 2 – Basic 5",
    skills: ["Visual Programming", "Game Design", "Animation", "Creative Thinking"],
    projects: ["Animated Story", "Simple Game", "Interactive Art", "Music Player"],
    nigerianContext: "Perfect for telling Nigerian stories through code",
    successStory: "Chinedu created a game about Nigerian festivals",
    careerPath: "Game Developer, Animator, Creative Technologist"
  },
  {
    id: 'web-development',
    icon: <Globe className="w-12 h-12 text-purple-600" />,
    title: "HTML/CSS Programming",
    description: "Build beautiful websites! Create responsive web pages that work on all devices and showcase Nigerian businesses.",
    color: "from-purple-400 to-purple-600",
    duration: "12 weeks",
    level: "Intermediate",
    students: "8-12 students",
    features: ["HTML structure", "CSS styling", "Responsive design", "Web publishing"],
    price: "₦55,000",
    category: "Web Development",
    ageRange: "Basic 5 – JSS2",
    skills: ["HTML", "CSS", "Web Design", "Responsive Layout"],
    projects: ["Personal Website", "School Blog", "Portfolio Page", "Interactive Form"],
    nigerianContext: "Help Nigerian businesses go digital",
    successStory: "Fatima built websites for local market vendors",
    careerPath: "Web Developer, Frontend Developer, UI Designer"
  },
  {
    id: 'python-programming',
    icon: <span className="text-3xl">🐍</span>,
    title: "Python Programming",
    description: "Code like a pro! Learn Python programming to solve real-world problems and create innovative solutions.",
    color: "from-green-400 to-green-600",
    duration: "16 weeks",
    level: "Intermediate",
    students: "6-10 students",
    features: ["Python syntax", "Data types", "Functions", "Simple projects"],
    price: "₦65,000",
    category: "Programming",
    ageRange: "JSS1 – SS1",
    skills: ["Python", "Problem Solving", "Data Types", "Functions"],
    projects: ["Calculator App", "Number Guessing Game", "Simple Chatbot", "Data Analysis"],
    nigerianContext: "Solve local problems with global technology",
    successStory: "Oluwaseun developed a farm management app",
    careerPath: "Software Developer, Data Analyst, AI Engineer"
  },
  {
    id: 'web-design',
    icon: <Palette className="w-12 h-12 text-pink-600" />,
    title: "Web Design",
    description: "Design stunning websites! Create beautiful, user-friendly interfaces that represent Nigerian excellence.",
    color: "from-pink-400 to-pink-600",
    duration: "14 weeks",
    level: "Intermediate",
    students: "8-12 students",
    features: ["UI/UX principles", "Color theory", "Typography", "Design tools"],
    price: "₦55,000",
    category: "Design",
    ageRange: "JSS2 – SS2",
    skills: ["UI/UX Design", "Color Theory", "Typography", "Design Tools"],
    projects: ["Website Mockup", "Mobile App Design", "Brand Identity", "User Interface"],
    nigerianContext: "Showcase Nigerian creativity and innovation",
    successStory: "Chioma designed apps for Nigerian startups",
    careerPath: "UI/UX Designer, Graphic Designer, Product Designer"
  },
  {
    id: 'robotics',
    icon: <Bot className="w-12 h-12 text-cyan-600" />,
    title: "Robotics Programming",
    description: "Build the future! Create robots that solve real problems and contribute to Nigeria's technological advancement.",
    color: "from-cyan-400 to-cyan-600",
    duration: "20 weeks",
    level: "Advanced",
    students: "6-8 students",
    features: ["Hardware basics", "Circuit design", "Programming robots", "Problem solving"],
    price: "₦80,000",
    category: "Robotics",
    ageRange: "JSS2 – SS3",
    skills: ["Robotics", "Circuit Design", "Hardware Programming", "Problem Solving"],
    projects: ["Line Following Robot", "Smart Home Device", "Automated System", "Sensor Integration"],
    nigerianContext: "Drive innovation in Nigerian industries",
    successStory: "Emeka built a smart irrigation system for his village",
    careerPath: "Robotics Engineer, IoT Developer, Systems Engineer"
  },
  {
    id: 'digital-entrepreneurship',
    icon: <TrendingUp className="w-12 h-12 text-emerald-600" />,
    title: "Digital Entrepreneurship",
    description: "Think like a founder! Learn to identify business opportunities, build digital products, and pitch your ideas to the world.",
    color: "from-emerald-400 to-emerald-600",
    duration: "12 weeks",
    level: "Intermediate",
    students: "6-10 students",
    features: ["Business planning", "Digital marketing", "Product development", "Pitching skills"],
    price: "₦60,000",
    category: "Entrepreneurship",
    ageRange: "JSS1 – SS3",
    skills: ["Business Thinking", "Digital Marketing", "Product Design", "Financial Literacy"],
    projects: ["Business Plan", "Digital Product Prototype", "Marketing Campaign", "Investor Pitch Deck"],
    nigerianContext: "Empowering the next generation of Nigerian tech founders and innovators",
    successStory: "Students have launched digital businesses serving their local communities",
    careerPath: "Tech Entrepreneur, Product Manager, Digital Marketer, Business Founder"
  },
  {
    id: 'learn-from-home',
    icon: <span className="text-3xl">🏠</span>,
    title: "Learn from Home",
    description: "Virtual learning excellence! Join interactive online sessions from anywhere in Nigeria with personalized attention.",
    color: "from-indigo-400 to-indigo-600",
    duration: "Flexible",
    level: "All Levels",
    students: "4-8 students",
    features: ["Live online sessions", "Interactive learning", "Real-time feedback", "Flexible scheduling"],
    price: "₦40,000",
    category: "Virtual Learning",
    ageRange: "Basic 1 – SS3",
    skills: ["Online Learning", "Virtual Collaboration", "Digital Communication", "Self-Discipline"],
    projects: ["Virtual Portfolio", "Online Presentation", "Digital Collaboration", "Remote Project"],
    nigerianContext: "Access quality education from anywhere in Nigeria",
    successStory: "Students from rural areas now access world-class tech education",
    careerPath: "Remote Developer, Digital Nomad, Online Educator"
  },
  {
    id: 'birthday-parties',
    icon: <span className="text-3xl">🎉</span>,
    title: "Birthday Parties",
    description: "Celebrate with code! Make birthdays memorable with fun coding activities and creative tech projects.",
    color: "from-yellow-400 to-yellow-600",
    duration: "2-3 hours",
    level: "Beginner",
    students: "8-15 students",
    features: ["Fun coding activities", "Birthday-themed projects", "Take-home creations", "Party decorations"],
    price: "₦45,000",
    category: "Special Events",
    ageRange: "Basic 1 – JSS3",
    skills: ["Creative Coding", "Party Planning", "Collaboration", "Celebration"],
    projects: ["Birthday Game", "Animated Card", "Party Invitation", "Digital Gift"],
    nigerianContext: "Combine Nigerian celebration culture with technology",
    successStory: "Families create lasting memories while learning tech",
    careerPath: "Event Planner, Creative Director, Entertainment Tech"
  },
  {
    id: 'after-school',
    icon: <span className="text-3xl">🌅</span>,
    title: "After School Programs",
    description: "Extended learning excellence! Deep dive into advanced projects and prepare for future tech careers.",
    color: "from-red-400 to-red-600",
    duration: "12 weeks",
    level: "All Levels",
    students: "6-12 students",
    features: ["Extended learning time", "Advanced projects", "Homework support", "Skill development"],
    price: "₦55,000",
    category: "Extended Learning",
    ageRange: "Basic 4 – SS3",
    skills: ["Advanced Programming", "Project Management", "Time Management", "Independent Learning"],
    projects: ["Complex Applications", "Portfolio Development", "Team Projects", "Innovation Challenge"],
    nigerianContext: "Prepare Nigerian youth for global tech opportunities",
    successStory: "Students have won international coding competitions",
    careerPath: "Tech Entrepreneur, Software Architect, Innovation Leader"
  },
  {
    id: 'summer-school',
    icon: <Sun className="w-12 h-12 text-yellow-600" />,
    title: "Summer School 2026",
    description: "Intensive summer program for students to accelerate their tech skills",
    color: "from-yellow-400 to-orange-500",
    duration: "4-6 weeks",
    level: "All Levels",
    students: "8-15 students",
    features: [
      "Intensive coding bootcamp",
      "Project-based learning",
      "Portfolio development",
      "Career guidance",
      "Certificate of completion"
    ],
    price: "₦65,000 - ₦85,000",
    category: "Summer Programs",
    ageRange: "JSS1 – SS3",
    skills: ["Advanced Programming", "Project Development", "Career Preparation", "Intensive Learning"],
    projects: ["Portfolio Development", "Real-world Applications", "Team Projects", "Innovation Challenge"],
    nigerianContext: "Prepare Nigerian students for academic excellence and future tech careers",
    successStory: "Students gain competitive advantage for JSS3 and beyond",
    careerPath: "Tech Leader, Academic Excellence, Future Innovator",
    schedule: "June - August 2026",
    mode: "Online & Onsite",
    badge: "New",
    badgeColor: "bg-gradient-to-r from-yellow-400 to-orange-500",
    image: "https://res.cloudinary.com/dpigtwit0/image/upload/v1747032682/PhotoRoom-20250512_074926_zgudyt.png"
  }
];

const categories = [
  { name: "All", icon: <BookOpen className="w-4 h-4" /> },
  { name: "Foundation", icon: <Target className="w-4 h-4" /> },
  { name: "Programming", icon: <Code className="w-4 h-4" /> },
  { name: "Web Development", icon: <Globe className="w-4 h-4" /> },
  { name: "Design", icon: <Palette className="w-4 h-4" /> },
  { name: "Robotics", icon: <Bot className="w-4 h-4" /> },
  { name: "Entrepreneurship", icon: <TrendingUp className="w-4 h-4" /> },
  { name: "Virtual Learning", icon: <span className="text-lg">🏠</span> },
  { name: "Special Events", icon: <span className="text-lg">🎉</span> },
  { name: "Extended Learning", icon: <span className="text-lg">🌅</span> },
  { name: "Summer Programs", icon: <Sun className="w-4 h-4" /> }
];

const levels = [
  { name: "All Levels", value: "all" },
  { name: "Beginner", value: "Beginner" },
  { name: "Intermediate", value: "Intermediate" },
  { name: "Advanced", value: "Advanced" }
];

const nigerianStats = [
  { number: "500+", label: "Students Trained", icon: <GraduationCap className="w-6 h-6" /> },
  { number: "50+", label: "Schools Partnered", icon: <Building2 className="w-6 h-6" /> },
  { number: "15+", label: "States Covered", icon: <MapPin className="w-6 h-6" /> },
  { number: "95%", label: "Success Rate", icon: <TrendingUp className="w-6 h-6" /> }
];

const successStories = [
  {
    name: "Amina Hassan",
    location: "Lagos",
    story: "From computer basics to building websites for local businesses",
    achievement: "Now runs her own web design business",
    image: "👩‍💻"
  },
  {
    name: "Chinedu Okonkwo",
    location: "Enugu",
    story: "Created educational games about Nigerian culture",
    achievement: "Won national coding competition",
    image: "👨‍💻"
  },
  {
    name: "Fatima Yusuf",
    location: "Kano",
    story: "Developed apps to help market vendors go digital",
    achievement: "Featured in local tech magazines",
    image: "👩‍🎨"
  }
];

export default function Programs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [showSummerSchoolPopup, setShowSummerSchoolPopup] = useState(false);

  const filteredPrograms = programs.filter(program => {
    const matchesSearch = program.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      program.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      program.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === "All" || program.category === selectedCategory;
    const matchesLevel = selectedLevel === "all" || program.level === selectedLevel;
    return matchesSearch && matchesCategory && matchesLevel;
  });

  const toggleProgramDetails = (programId: string) => {
    setSelectedProgram(selectedProgram === programId ? null : programId);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg mb-16">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">Our Learning Programs</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Discover our comprehensive range of technology education programs for students from <strong>Basic 1 to SS3</strong> — covering coding, robotics, digital entrepreneurship, and more, designed to inspire and empower every young Nigerian mind.
          </p>
          <div className="w-20 h-2 bg-gradient-to-r from-blue-600 to-purple-600 mx-auto rounded-full"></div>
        </div>

        {/* Summer School Banner */}
        <div className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 rounded-2xl shadow-2xl border border-yellow-300 p-8 mb-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-24 -translate-x-24"></div>
          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row items-center justify-between">
              <div className="flex-1 text-white mb-6 lg:mb-0">
                <div className="flex items-center space-x-2 mb-4">
                  <Sun className="w-8 h-8" />
                  <span className="text-2xl font-bold">Summer School 2026</span>
                  <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-semibold">
                    Limited Time
                  </div>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Accelerate Your Tech Journey This Summer!
                </h2>
                <p className="text-lg mb-6 opacity-90">
                  Intensive programs for JSS3 students starting <strong>June 15th, 2026</strong> and other classes from <strong>July 25th, 2026</strong>.
                  Both online and onsite options available.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5" />
                    <span>JSS3: June 15th 2026 - 6 weeks intensive</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5" />
                    <span>Others: July 25th 2026 - 4 weeks</span>
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
                  <GraduationCap className="w-16 h-16 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Nigerian Impact Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">Our Impact Across Nigeria</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {nigerianStats.map((stat, index) => (
              <div key={index} className="text-center group">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                  <div className="text-white">
                    {stat.icon}
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.number}</div>
                <div className="text-gray-600 dark:text-gray-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Success Stories */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">Success Stories from Across Nigeria</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {successStories.map((story, index) => (
              <div key={index} className="bg-gradient-to-br from-blue-50 dark:from-blue-900/20 to-purple-50 dark:to-purple-900/20 rounded-xl p-6 border border-blue-100 dark:border-blue-800 hover:shadow-lg transition-all duration-300">
                <div className="text-4xl mb-4">{story.image}</div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{story.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{story.location}</p>
                <p className="text-gray-700 dark:text-gray-300 mb-3">{story.story}</p>
                <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium">
                  {story.achievement}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search programs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${selectedCategory === category.name
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                >
                  {category.icon}
                  <span className="hidden sm:inline">{category.name}</span>
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                {levels.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Programs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {filteredPrograms.map((program) => (
            <div key={program.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all duration-300 group">
              {/* Program Header */}
              <div className={`bg-gradient-to-r ${program.color} p-6 text-white relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-white/20 rounded-xl p-3">
                      {program.icon}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{program.price}</div>
                      <div className="text-sm opacity-90">per program</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-2xl font-bold">{program.title}</h3>
                    {program.id === 'summer-school' && (
                      <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold animate-pulse">
                        🎯 Limited Time
                      </div>
                    )}
                  </div>
                  <p className="text-sm opacity-90 mb-4">{program.description}</p>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4" />
                      <span>{program.duration}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4" />
                      <span>{program.students}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Program Content */}
              <div className="p-6">
                {/* Nigerian Context */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <MapPin className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-semibold text-green-800 dark:text-green-300">Nigerian Context</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">{program.nigerianContext}</p>
                </div>

                {/* Skills */}
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Skills You'll Learn</h4>
                  <div className="flex flex-wrap gap-2">
                    {program.skills.slice(0, 3).map((skill, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                        {skill}
                      </span>
                    ))}
                    {program.skills.length > 3 && (
                      <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium">
                        +{program.skills.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Success Story */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Star className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">Success Story</span>
                  </div>
                  <p className="text-sm text-blue-700">{program.successStory}</p>
                </div>

                {/* Career Path */}
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-2">Career Path</h4>
                  <p className="text-sm text-gray-600">{program.careerPath}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => toggleProgramDetails(program.id)}
                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl font-medium hover:bg-gray-200 transition-colors duration-200"
                  >
                    {selectedProgram === program.id ? 'Hide Details' : 'View Details'}
                  </button>
                  {program.id === 'summer-school' ? (
                    <button
                      onClick={() => setShowSummerSchoolPopup(true)}
                      className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-2 rounded-xl font-medium hover:from-yellow-600 hover:to-orange-600 transition-all duration-200 text-center"
                    >
                      Register Now
                    </button>
                  ) : (
                    <Link
                      href="/student-registration"
                      className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-4 py-2 rounded-xl font-medium hover:from-blue-600 hover:to-purple-600 transition-all duration-200 text-center"
                    >
                      Enroll Now
                    </Link>
                  )}
                </div>

                {/* Expanded Details */}
                {selectedProgram === program.id && (
                  <div className="mt-6 space-y-4 border-t pt-4">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Projects You'll Build</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {program.projects.map((project, index) => (
                          <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-purple-600" />
                              <span className="text-sm text-purple-800">{project}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Program Features</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {program.features.map((feature, index) => (
                          <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <Zap className="w-4 h-4 text-green-600" />
                              <span className="text-sm text-green-800">{feature}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Your Tech Journey?</h2>
          <p className="text-xl mb-6 opacity-90">
            Join thousands of Nigerian students already building their future with technology
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="bg-white text-blue-600 px-8 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors duration-200"
            >
              Contact Us
            </Link>
            <Link
              href="/curriculum"
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-xl font-semibold hover:bg-white hover:text-blue-600 transition-all duration-200"
            >
              View Curriculum
            </Link>
          </div>
        </div>
      </div>

      {/* Summer School Popup */}
      <SummerSchoolPopup
        isOpen={showSummerSchoolPopup}
        onClose={() => setShowSummerSchoolPopup(false)}
      />
    </div>
  );
} 
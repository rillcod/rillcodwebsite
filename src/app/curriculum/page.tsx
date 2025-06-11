"use client";
import { useState } from "react";
import { GraduationCap, Code, Target, BookOpen, ChevronDown, ChevronUp, Search, Star, Award, MapPin, FileText, Calendar, Rocket, Sparkles, Heart, Zap } from "lucide-react";
import Link from "next/link";

const curriculumSessions = [
  {
    session: 1,
    grade: "Basic 1",
    age: "6-7",
    title: "Digital Discovery + AI Awareness",
    description: "Introduction to computer basics, Scratch 3.0, and smart program concepts with AI voice commands.",
    terms: [
      { term: 1, focus: "Computer basics, Scratch 3.0, smart program concepts" },
      { term: 2, focus: "Animations with AI voice commands and basic robotics toys" },
      { term: 3, focus: "Creative games with intelligent responses and pattern recognition" }
    ],
    capstone: "Voice-controlled storytelling robot using child-friendly AI tools",
    portfolio: "3 Scratch projects + 1 AI-enhanced interactive story",
    skills: ["Scratch Programming", "AI Awareness", "Creative Thinking", "Basic Robotics"],
    level: "primary",
    color: "from-blue-500 to-cyan-500",
    nigerianContext: "Introducing Nigerian children to the digital world",
    successStory: "Students create stories about Nigerian culture using AI",
    careerPath: "Digital Storyteller, AI Educator, Creative Technologist"
  },
  {
    session: 2,
    grade: "Basic 2",
    age: "7-8",
    title: "Creative Programming + Smart Toys",
    description: "Advanced Scratch animations with sensor integration and educational games with adaptive difficulty.",
    terms: [
      { term: 1, focus: "Advanced Scratch animations with sensor integration" },
      { term: 2, focus: "Educational games with adaptive difficulty (basic AI concepts)" },
      { term: 3, focus: "Interactive presentations with smart response systems" }
    ],
    capstone: "Smart classroom helper robot responding to student questions",
    portfolio: "3 interactive games + 1 sensor-based smart toy prototype",
    skills: ["Advanced Scratch", "Sensor Integration", "AI Concepts", "Problem Solving"],
    level: "primary",
    color: "from-blue-500 to-cyan-500",
    nigerianContext: "Building educational tools for Nigerian classrooms",
    successStory: "Students develop games about Nigerian geography",
    careerPath: "Educational Game Developer, EdTech Specialist, Interactive Designer"
  },
  {
    session: 3,
    grade: "Basic 3",
    age: "8-9",
    title: "Logical Thinking + Robotics Basics",
    description: "Complex Scratch projects with micro:bit integration and mathematical programming with robotic movement control.",
    terms: [
      { term: 1, focus: "Complex Scratch projects with micro:bit integration" },
      { term: 2, focus: "Mathematical programming with robotic movement control" },
      { term: 3, focus: "Multi-level games with intelligent NPCs and decision trees" }
    ],
    capstone: "Automated plant watering system with sensors and alerts",
    portfolio: "3 advanced Scratch applications + 1 agricultural automation prototype",
    skills: ["Micro:bit", "Robotics Control", "Mathematical Programming", "Decision Trees"],
    level: "primary",
    color: "from-blue-500 to-cyan-500",
    nigerianContext: "Solving agricultural challenges with technology",
    successStory: "Students create smart farming solutions for their communities",
    careerPath: "Agricultural Technologist, IoT Developer, Smart Farming Specialist"
  },
  {
    session: 4,
    grade: "Basic 4",
    age: "9-10",
    title: "Scratch Expertise + AI Introduction",
    description: "Advanced game mechanics with chatbot integration and collaborative projects using cloud AI services.",
    terms: [
      { term: 1, focus: "Advanced game mechanics with chatbot integration" },
      { term: 2, focus: "Collaborative projects using cloud AI services" },
      { term: 3, focus: "Interactive storytelling with complex AI-driven narratives" }
    ],
    capstone: "Smart security system for classrooms with facial recognition",
    portfolio: "3 sophisticated Scratch projects + 1 AI-powered security solution",
    skills: ["Chatbot Development", "Cloud AI", "Collaborative Programming", "AI Narratives"],
    level: "primary",
    color: "from-blue-500 to-cyan-500",
    nigerianContext: "Enhancing school security with AI technology",
    successStory: "Students develop security systems for their schools",
    careerPath: "Security Systems Developer, AI Engineer, School Technology Specialist"
  },
  {
    session: 5,
    grade: "Basic 5",
    age: "10-11",
    title: "Python + AI Fundamentals",
    description: "Python programming with Thonny IDE, introduction to AI libraries, and data collection with simple machine learning.",
    terms: [
      { term: 1, focus: "Python with Thonny IDE + introduction to AI libraries" },
      { term: 2, focus: "Data collection, analysis, and simple machine learning" },
      { term: 3, focus: "Intelligent programs with pattern recognition" }
    ],
    capstone: "Smart traffic light system for school compounds",
    portfolio: "3 Python programs + 1 IoT traffic management solution",
    skills: ["Python Programming", "AI Libraries", "Data Analysis", "Machine Learning"],
    level: "primary",
    color: "from-blue-500 to-cyan-500",
    nigerianContext: "Addressing traffic challenges in Nigerian cities",
    successStory: "Students create traffic management solutions",
    careerPath: "Traffic Systems Engineer, Data Analyst, Smart City Developer"
  },
  {
    session: 6,
    grade: "Basic 6",
    age: "11-12",
    title: "Python + Robotics Integration",
    description: "Advanced Python with robot control programming, sensor integration, and utility programs with AI decision-making.",
    terms: [
      { term: 1, focus: "Advanced Python with robot control programming" },
      { term: 2, focus: "Sensor integration, data processing, and automated responses" },
      { term: 3, focus: "Utility programs with AI decision-making" }
    ],
    capstone: "Automated school library system with book tracking and recommendations",
    portfolio: "3 Python applications + 1 complete library automation system",
    skills: ["Robot Control", "Sensor Integration", "Data Processing", "AI Decision Making"],
    level: "primary",
    color: "from-blue-500 to-cyan-500",
    nigerianContext: "Modernizing Nigerian school libraries",
    successStory: "Students automate library systems in their schools",
    careerPath: "Library Systems Developer, Automation Engineer, Educational Technologist"
  },
  {
    session: 7,
    grade: "JSS1",
    age: "12-13",
    title: "HTML/CSS + Smart Interfaces",
    description: "Web structure with embedded AI chat widgets, responsive design for IoT device dashboards, and interactive websites.",
    terms: [
      { term: 1, focus: "Web structure with embedded AI chat widgets" },
      { term: 2, focus: "Responsive design for IoT device dashboards" },
      { term: 3, focus: "Interactive websites with voice and gesture controls" }
    ],
    capstone: "Smart home dashboard controlling lights, fans, and security",
    portfolio: "3 professional websites + 1 IoT home control interface",
    skills: ["HTML/CSS", "AI Chat Widgets", "IoT Dashboards", "Voice Controls"],
    level: "junior",
    color: "from-green-500 to-emerald-500",
    nigerianContext: "Building smart homes for Nigerian families",
    successStory: "Students create smart home solutions for their families",
    careerPath: "Smart Home Developer, IoT Specialist, Web Developer"
  },
  {
    session: 8,
    grade: "JSS2",
    age: "13-14",
    title: "Advanced Web + Data Visualization",
    description: "CSS frameworks with real-time data displays, mobile-first design for IoT monitoring apps, and modern interfaces.",
    terms: [
      { term: 1, focus: "CSS frameworks with real-time data displays" },
      { term: 2, focus: "Mobile-first design for IoT monitoring apps" },
      { term: 3, focus: "Modern interfaces for AI-powered applications" }
    ],
    capstone: "Smart agriculture monitoring system with crop prediction",
    portfolio: "3 responsive websites + 1 agricultural intelligence platform",
    skills: ["CSS Frameworks", "Data Visualization", "Mobile Design", "AI Interfaces"],
    level: "junior",
    color: "from-green-500 to-emerald-500",
    nigerianContext: "Revolutionizing Nigerian agriculture with technology",
    successStory: "Students develop farming monitoring systems",
    careerPath: "Agricultural Data Analyst, Mobile App Developer, Precision Farming Specialist"
  },
  {
    session: 9,
    grade: "JSS3",
    age: "14-15",
    title: "JavaScript + AI APIs",
    description: "JavaScript with machine learning libraries, API integration with cloud AI services, and dynamic content with intelligent personalization.",
    terms: [
      { term: 1, focus: "JavaScript with machine learning libraries (e.g., ML5.js)" },
      { term: 2, focus: "API integration with cloud AI services" },
      { term: 3, focus: "Dynamic content with intelligent personalization" }
    ],
    capstone: "AI-powered student performance prediction system",
    portfolio: "3 interactive web applications + 1 educational AI analytics platform",
    skills: ["JavaScript", "ML5.js", "AI APIs", "Intelligent Personalization"],
    level: "junior",
    color: "from-green-500 to-emerald-500",
    nigerianContext: "Improving educational outcomes with AI",
    successStory: "Students create performance tracking systems",
    careerPath: "Educational Data Scientist, AI Developer, Learning Analytics Specialist"
  },
  {
    session: 10,
    grade: "SS1",
    age: "15-16",
    title: "UI/UX for AI + Robotics Design",
    description: "User experience for voice, gesture, and autonomous systems, wireframing with Figma for AI applications, and prototyping.",
    terms: [
      { term: 1, focus: "User experience for voice, gesture, and autonomous systems" },
      { term: 2, focus: "Wireframing and prototyping with Figma for AI applications" },
      { term: 3, focus: "Prototyping AI-powered mobile and web applications" }
    ],
    capstone: "UI/UX design for a smart city traffic management system",
    portfolio: "3 AI interface designs + 1 smart city management prototype",
    skills: ["UI/UX Design", "Voice Interfaces", "Figma", "AI Prototyping"],
    level: "senior",
    color: "from-purple-500 to-violet-500",
    nigerianContext: "Designing smart city solutions for Nigerian urban centers",
    successStory: "Students design smart city interfaces",
    careerPath: "Smart City Designer, UI/UX Designer, Product Designer"
  },
  {
    session: 11,
    grade: "SS2",
    age: "16-17",
    title: "Integrated Development + IoT",
    description: "Full-stack development with AI backend integration, IoT device programming with cloud connectivity, and Flutter introduction.",
    terms: [
      { term: 1, focus: "Full-stack development with AI backend integration" },
      { term: 2, focus: "IoT device programming with cloud connectivity" },
      { term: 3, focus: "Flutter introduction with hardware integration" }
    ],
    capstone: "Smart school management system with attendance tracking, grade prediction, and parent notifications",
    portfolio: "3 advanced applications + 1 complete school automation system",
    skills: ["Full-Stack Development", "AI Backend", "IoT Programming", "Flutter"],
    level: "senior",
    color: "from-purple-500 to-violet-500",
    nigerianContext: "Transforming Nigerian education with smart systems",
    successStory: "Students develop school management solutions",
    careerPath: "Full-Stack Developer, IoT Engineer, Educational Systems Architect"
  },
  {
    session: 12,
    grade: "SS3",
    age: "17-18",
    title: "Mobile AI + Entrepreneurship",
    description: "Flutter mobile apps with AI/ML capabilities, advanced features like computer vision and NLP, and business development for startup preparation.",
    terms: [
      { term: 1, focus: "Flutter mobile apps with AI/ML capabilities" },
      { term: 2, focus: "Advanced features like computer vision and NLP" },
      { term: 3, focus: "Business development for startup preparation" }
    ],
    capstone: "AI-powered mobile app startup with business plan and MVP",
    portfolio: "3 mobile applications + 1 complete startup package",
    skills: ["Flutter", "Computer Vision", "NLP", "Business Development"],
    level: "senior",
    color: "from-purple-500 to-violet-500",
    nigerianContext: "Creating tech startups that solve Nigerian problems",
    successStory: "Students launch successful tech startups",
    careerPath: "Tech Entrepreneur, Mobile App Developer, AI Product Manager"
  }
];

const nigerianStats = [
  { number: "12", label: "Years of Learning", icon: <BookOpen className="w-6 h-6" /> },
  { number: "36", label: "Terms of Study", icon: <Calendar className="w-6 h-6" /> },
  { number: "50+", label: "Skills Acquired", icon: <Target className="w-6 h-6" /> },
  { number: "100+", label: "Projects Built", icon: <Code className="w-6 h-6" /> }
];

const successStories = [
  {
    name: "Oluwaseun Adebayo",
    location: "Lagos",
    grade: "SS3 Graduate",
    story: "Started with Basic 1 and now runs a successful tech startup",
    achievement: "Won ₦5M in startup funding",
    image: "👨‍💼"
  },
  {
    name: "Amina Hassan",
    location: "Kano",
    grade: "JSS3 Student",
    story: "Created smart farming solutions for her community",
    achievement: "Featured in national newspapers",
    image: "👩‍🌾"
  },
  {
    name: "Chinedu Okonkwo",
    location: "Enugu",
    grade: "SS2 Student",
    story: "Developed AI-powered educational games",
    achievement: "International coding competition winner",
    image: "👨‍🎓"
  }
];

const learningLevels = [
  {
    name: "Primary Level",
    description: "Foundation years (Basic 1-6)",
    color: "from-blue-500 to-cyan-500",
    icon: <BookOpen className="w-8 h-8" />,
    focus: "Digital literacy, creative programming, AI awareness"
  },
  {
    name: "Junior Secondary",
    description: "Intermediate years (JSS1-3)",
    color: "from-green-500 to-emerald-500",
    icon: <Code className="w-8 h-8" />,
    focus: "Web development, data visualization, AI integration"
  },
  {
    name: "Senior Secondary",
    description: "Advanced years (SS1-3)",
    color: "from-purple-500 to-violet-500",
    icon: <Rocket className="w-8 h-8" />,
    focus: "Full-stack development, entrepreneurship, AI mastery"
  }
];

export default function Curriculum() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [expandedSessions, setExpandedSessions] = useState<number[]>([]);

  const filteredSessions = curriculumSessions.filter(session => {
    const matchesSearch = session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLevel = selectedLevel === "all" || session.level === selectedLevel;
    return matchesSearch && matchesLevel;
  });

  const toggleSession = (sessionId: number) => {
    setExpandedSessions(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case "primary": return "Primary";
      case "junior": return "Junior Secondary";
      case "senior": return "Senior Secondary";
      default: return "Unknown";
    }
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
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">12-Year AI-Integrated Curriculum</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            A comprehensive journey from Basic 1 to SS3, integrating AI, robotics, and traditional programming to prepare Nigerian students for the future.
          </p>
          <div className="w-20 h-2 bg-gradient-to-r from-blue-600 to-purple-600 mx-auto rounded-full"></div>
        </div>

        {/* Curriculum Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">Curriculum Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Target className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">12 Years</h3>
              <p className="text-gray-600 dark:text-gray-300">Complete educational journey from Basic 1 to SS3</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Code className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">36+ Projects</h3>
              <p className="text-gray-600 dark:text-gray-300">Hands-on projects with real-world applications</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">AI Integration</h3>
              <p className="text-gray-600 dark:text-gray-300">Artificial intelligence embedded throughout the curriculum</p>
            </div>
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
                  placeholder="Search curriculum..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {/* Level Filter */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedLevel("all")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  selectedLevel === "all"
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">All Levels</span>
              </button>
              {learningLevels.map((level, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedLevel(level.name.toLowerCase().replace(' ', ''))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                    selectedLevel === level.name.toLowerCase().replace(' ', '')
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {level.icon}
                  <span className="hidden sm:inline">{level.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Nigerian Impact Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">Curriculum Impact Across Nigeria</h2>
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

        {/* Learning Levels Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-8">Learning Journey Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {learningLevels.map((level, index) => (
              <div key={index} className="text-center group">
                <div className={`w-20 h-20 bg-gradient-to-r ${level.color} rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <div className="text-white">
                    {level.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{level.name}</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-3">{level.description}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{level.focus}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Success Stories */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">Success Stories from Our Curriculum</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {successStories.map((story, index) => (
              <div key={index} className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100 hover:shadow-lg transition-all duration-300">
                <div className="text-4xl mb-4">{story.image}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{story.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{story.location} • {story.grade}</p>
                <p className="text-gray-700 mb-3">{story.story}</p>
                <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                  {story.achievement}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Curriculum Sessions */}
        <div className="space-y-6 mb-16">
          {filteredSessions.map((session) => (
            <div key={session.session} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden hover:shadow-2xl transition-all duration-300">
              {/* Session Header */}
              <div className={`bg-gradient-to-r ${session.color} p-6 text-white relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-white/20 rounded-xl p-3">
                        <BookOpen className="w-8 h-8" />
                      </div>
                      <div>
                        <div className="text-sm opacity-90">Session {session.session}</div>
                        <div className="text-2xl font-bold">{session.grade} • Age {session.age}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleSession(session.session)}
                      className="bg-white/20 rounded-xl p-3 hover:bg-white/30 transition-colors duration-200"
                    >
                      {expandedSessions.includes(session.session) ? (
                        <ChevronUp className="w-6 h-6" />
                      ) : (
                        <ChevronDown className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{session.title}</h3>
                  <p className="text-sm opacity-90 mb-4">{session.description}</p>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Target className="w-4 h-4" />
                      <span>{getLevelLabel(session.level)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Code className="w-4 h-4" />
                      <span>{session.skills.length} Skills</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Session Content */}
              <div className="p-6">
                {/* Nigerian Context */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <MapPin className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-800">Nigerian Context</span>
                  </div>
                  <p className="text-sm text-green-700">{session.nigerianContext}</p>
                </div>

                {/* Skills */}
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Skills You&apos;ll Learn</h4>
                  <div className="flex flex-wrap gap-2">
                    {session.skills.map((skill, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Success Story */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Star className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">Success Story</span>
                  </div>
                  <p className="text-sm text-blue-700">{session.successStory}</p>
                </div>

                {/* Career Path */}
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-2">Career Path</h4>
                  <p className="text-sm text-gray-600">{session.careerPath}</p>
                </div>

                {/* Expanded Details */}
                {expandedSessions.includes(session.session) && (
                  <div className="space-y-6 border-t pt-6">
                    {/* Terms */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-4">Term-by-Term Breakdown</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {session.terms.map((term, index) => (
                          <div key={index} className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                {term.term}
                              </div>
                              <span className="text-sm font-semibold text-purple-800">Term {term.term}</span>
                            </div>
                            <p className="text-sm text-purple-700">{term.focus}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Capstone Project */}
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Award className="w-4 h-4 text-orange-600" />
                        <span className="text-sm font-semibold text-orange-800">Capstone Project</span>
                      </div>
                      <p className="text-sm text-orange-700">{session.capstone}</p>
                    </div>

                    {/* Portfolio */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-800">Portfolio</span>
                      </div>
                      <p className="text-sm text-indigo-700">{session.portfolio}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Your Learning Journey?</h2>
          <p className="text-xl mb-6 opacity-90">
            Join thousands of Nigerian students already building their future with our comprehensive curriculum
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/programs"
              className="bg-white text-blue-600 px-8 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors duration-200"
            >
              View Programs
            </Link>
            <Link
              href="/contact"
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-xl font-semibold hover:bg-white hover:text-blue-600 transition-all duration-200"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 
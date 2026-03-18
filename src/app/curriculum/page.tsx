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
        <div className="text-center py-16 bg-[#1a1a1a] border border-border rounded-none shadow-lg mb-16 relative overflow-hidden border-t-8 border-t-orange-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none"></div>
          <div className="flex justify-center mb-10">
            <div className="w-20 h-20 bg-white/5 border border-border rounded-none flex items-center justify-center ring-1 ring-orange-500/50 ring-offset-4 ring-offset-[#1a1a1a]">
              <GraduationCap className="w-10 h-10 text-orange-500" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-6 uppercase tracking-tight">12-Year AI-Integrated <span className="text-orange-500 italic">Curriculum.</span></h1>
          <p className="text-sm sm:text-lg text-slate-400 max-w-3xl mx-auto mb-12 font-medium italic leading-relaxed border-l-2 border-orange-500 pl-8 mx-auto inline-block text-left">
            A comprehensive journey from Basic 1 to SS3, integrating AI, robotics, and traditional programming to prepare Nigerian students for the future of Rillcod Technologies.
          </p>
          <div className="w-24 h-1 bg-orange-500 mx-auto mt-8"></div>
        </div>

        {/* Curriculum Overview */}
        <div className="bg-[#1a1a1a] border border-border rounded-none p-12 mb-16 shadow-2xl">
          <h2 className="text-xl font-black text-white mb-12 text-center uppercase tracking-widest italic">Protocol Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center group">
              <div className="w-20 h-20 bg-white/5 border border-border group-hover:border-orange-500 transition-all rounded-none flex items-center justify-center mx-auto mb-6">
                <Target className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-sm font-black text-white mb-2 uppercase tracking-widest">12 Years</h3>
              <p className="text-xs text-slate-500 font-bold italic">Complete educational journey from Basic 1 to SS3</p>
            </div>
            <div className="text-center group">
              <div className="w-20 h-20 bg-white/5 border border-border group-hover:border-blue-500 transition-all rounded-none flex items-center justify-center mx-auto mb-6">
                <Code className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-sm font-black text-white mb-2 uppercase tracking-widest">36+ Projects</h3>
              <p className="text-xs text-slate-500 font-bold italic">Hands-on projects with real-world applications</p>
            </div>
            <div className="text-center group">
              <div className="w-20 h-20 bg-white/5 border border-border group-hover:border-emerald-500 transition-all rounded-none flex items-center justify-center mx-auto mb-6">
                <Star className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-sm font-black text-white mb-2 uppercase tracking-widest">AI Integration</h3>
              <p className="text-xs text-slate-500 font-bold italic">Artificial intelligence embedded throughout the curriculum</p>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-[#1a1a1a] border border-border rounded-none p-10 mb-16 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] pointer-events-none"></div>
          <div className="flex flex-col lg:flex-row gap-8 items-center justify-between relative z-10">
            {/* Search */}
            <div className="flex-1 w-full lg:max-w-md">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 italic">Filter Data Streams:</p>
              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-800 group-focus-within:text-orange-500 transition-colors w-4 h-4 z-10" />
                <input
                  type="text"
                  placeholder="SEARCH CURRICULUM..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-14 pr-6 py-5 bg-[#121212] border border-border rounded-none text-[10px] font-black uppercase tracking-widest text-white placeholder:text-slate-900 focus:outline-none focus:border-orange-500 transition-all"
                />
              </div>
            </div>

            {/* Level Filter */}
            <div className="w-full lg:w-auto">
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 italic">Categorical Sort:</p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setSelectedLevel("all")}
                  className={`flex items-center gap-3 px-8 py-4 text-[10px] font-black uppercase tracking-widest rounded-none border transition-all ${
                    selectedLevel === "all"
                      ? 'bg-orange-500 border-orange-500 text-white shadow-xl shadow-orange-500/20'
                      : 'bg-[#121212] border-border text-slate-500 hover:border-border hover:text-white'
                  }`}
                >
                  All Sectors
                </button>
                {learningLevels.map((level, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedLevel(level.name.toLowerCase().replace(' ', ''))}
                    className={`flex items-center gap-3 px-8 py-4 text-[10px] font-black uppercase tracking-widest rounded-none border transition-all ${
                      selectedLevel === level.name.toLowerCase().replace(' ', '')
                        ? 'bg-orange-500 border-orange-500 text-white shadow-xl shadow-orange-500/20'
                        : 'bg-[#121212] border-border text-slate-500 hover:border-border hover:text-white'
                    }`}
                  >
                    {level.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Nigerian Impact Stats */}
        <div className="bg-[#1a1a1a] border border-border rounded-none p-12 mb-16 shadow-22xl relative">
          <div className="absolute top-0 right-0 w-2 h-full bg-orange-500 font-black"></div>
          <h2 className="text-xl font-black text-white text-left mb-12 uppercase tracking-widest italic flex items-center gap-4">
            <span className="w-12 h-[1px] bg-orange-500"></span> 
            Continental Impact
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            {nigerianStats.map((stat, index) => (
              <div key={index} className="text-left group">
                <div className="text-orange-500 mb-6 group-hover:scale-110 transition-transform origin-left">
                    {stat.icon}
                </div>
                <div className="text-3xl font-black text-white mb-1 tracking-tighter italic">{stat.number}</div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Learning Journey Overview */}
        <div className="bg-[#1a1a1a] border border-border rounded-none p-12 mb-16 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] pointer-events-none"></div>
          <h2 className="text-xl font-black text-white text-center mb-12 uppercase tracking-widest italic flex items-center justify-center gap-4">
            <span className="w-12 h-[1px] bg-orange-500"></span>
            Learning Phase Roadmap
            <span className="w-12 h-[1px] bg-orange-500"></span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {learningLevels.map((level, index) => (
              <div key={index} className="text-center group">
                <div className={`w-24 h-24 bg-white/5 border border-border group-hover:border-orange-500 transition-all rounded-none flex items-center justify-center mx-auto mb-8 relative`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="text-orange-500 group-hover:scale-110 transition-transform relative z-10">
                    {level.icon}
                  </div>
                </div>
                <h3 className="text-lg font-black text-white mb-4 uppercase tracking-tighter italic">{level.name}</h3>
                <p className="text-xs text-slate-400 font-bold italic mb-4 leading-relaxed">{level.description}</p>
                <div className="h-[1px] bg-white/5 w-12 mx-auto mb-4"></div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{level.focus}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Success Stories */}
        <div className="bg-[#1a1a1a] border border-border rounded-none p-12 mb-16 shadow-2xl border-l-8 border-l-blue-500">
          <h2 className="text-xl font-black text-white mb-12 text-left uppercase tracking-widest italic flex items-center gap-4">
             <span className="w-12 h-[1px] bg-blue-500"></span>
             Success Protocols
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {successStories.map((story, index) => (
              <div key={index} className="bg-[#121212] border border-border p-8 rounded-none hover:border-blue-500/50 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 text-4xl opacity-20 group-hover:opacity-40 transition-opacity">{story.image}</div>
                <h3 className="text-lg font-black text-white mb-2 uppercase italic tracking-tight">{story.name}</h3>
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-6">{story.location} • {story.grade}</p>
                <p className="text-xs text-slate-400 font-bold italic mb-6 leading-relaxed relative z-10">{story.story}</p>
                <div className="inline-block bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-[10px] font-black text-blue-400 uppercase tracking-widest">
                  {story.achievement}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Curriculum Sessions */}
        <div className="space-y-6 mb-16">
          {filteredSessions.map((session) => (
            <div key={session.session} className="bg-[#1a1a1a] border border-border rounded-none shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300">
              {/* Session Header */}
              <div className={`p-8 bg-[#121212] border-b border-border text-white relative overflow-hidden`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-none -translate-y-16 translate-x-16 rotate-45"></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="bg-white/5 border border-border rounded-none p-3 shadow-lg shadow-black/20">
                        <BookOpen className="w-8 h-8 text-orange-500" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#FF914D]">Session {session.session}</div>
                        <div className="text-xl sm:text-2xl font-black uppercase tracking-tighter italic">{session.grade} • <span className="text-white/40">Age {session.age}</span></div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleSession(session.session)}
                      className="bg-white/5 border border-border rounded-none p-3 hover:bg-orange-500 hover:text-white transition-all duration-200"
                    >
                      {expandedSessions.includes(session.session) ? (
                        <ChevronUp className="w-6 h-6" />
                      ) : (
                        <ChevronDown className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                  <h3 className="text-lg font-black mb-2 uppercase tracking-tight text-white">{session.title}</h3>
                  <p className="text-xs text-slate-500 font-medium italic mb-6 leading-relaxed max-w-2xl">{session.description}</p>
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{getLevelLabel(session.level)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Code className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{session.skills.length} Technical Skills</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Session Content */}
              <div className="p-8 space-y-8 bg-[#1a1a1a]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Nigerian Context */}
                    <div className="bg-[#121212] border border-border border-l-4 border-l-emerald-500 p-6 rounded-none shadow-xl">
                      <div className="flex items-center space-x-3 mb-4">
                        <MapPin className="w-4 h-4 text-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Regional Implementation</span>
                      </div>
                      <p className="text-xs text-slate-400 font-bold italic leading-relaxed">{session.nigerianContext}</p>
                    </div>

                    {/* Success Story */}
                    <div className="bg-[#121212] border border-border border-l-4 border-l-blue-500 p-6 rounded-none shadow-xl">
                      <div className="flex items-center space-x-3 mb-4">
                        <Star className="w-4 h-4 text-blue-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Success Protocol</span>
                      </div>
                      <p className="text-xs text-slate-400 font-bold italic leading-relaxed">{session.successStory}</p>
                    </div>
                </div>

                {/* Skills */}
                <div className="bg-[#121212] p-8 border border-border rounded-none shadow-xl">
                  <h4 className="text-[10px] font-black text-[#FF914D] uppercase tracking-[0.4em] mb-6 italic">Technical Stack</h4>
                  <div className="flex flex-wrap gap-3">
                    {session.skills.map((skill, index) => (
                      <span key={index} className="bg-white/5 border border-border text-slate-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:border-orange-500/50 transition-all">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedSessions.includes(session.session) && (
                  <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="h-[1px] bg-white/5 w-full"></div>
                    {/* Terms */}
                    <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-8 italic text-center">Operational Roadmap // 3-Term Phase</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {session.terms.map((term, index) => (
                          <div key={index} className="bg-[#121212] border border-border rounded-none p-8 hover:border-orange-500/30 transition-all group">
                            <div className="flex items-center gap-4 mb-6">
                              <div className="w-10 h-10 bg-white/5 border border-border text-orange-500 rounded-none flex items-center justify-center text-xs font-black group-hover:bg-orange-500 group-hover:text-white transition-all">
                                0{term.term}
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-white">TERM {term.term}</span>
                            </div>
                            <p className="text-xs text-slate-500 font-bold italic leading-relaxed">{term.focus}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Capstone Project */}
                        <div className="bg-[#121212] border-t-4 border-t-orange-500 p-8 rounded-none shadow-2xl">
                          <div className="flex items-center space-x-3 mb-6">
                            <Award className="w-5 h-5 text-orange-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Capstone Objective</span>
                          </div>
                          <p className="text-xl font-black text-white italic tracking-tight mb-2 uppercase leading-none">{session.capstone}</p>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-4">Final Validation Project</p>
                        </div>

                        {/* Portfolio */}
                        <div className="bg-[#121212] border-t-4 border-t-blue-500 p-8 rounded-none shadow-2xl">
                          <div className="flex items-center space-x-3 mb-6">
                            <FileText className="w-5 h-5 text-blue-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Artifact Portfolio</span>
                          </div>
                          <p className="text-sm font-black text-slate-300 italic leading-relaxed uppercase">{session.portfolio}</p>
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-4">Digital Career Assets</p>
                        </div>
                    </div>

                    <div className="bg-white/5 p-6 border border-border rounded-none flex flex-col sm:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <Rocket className="w-6 h-6 text-orange-500" />
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-[#FF914D]">Career Trajectory</p>
                                <p className="text-xs font-bold text-white uppercase italic">{session.careerPath}</p>
                            </div>
                        </div>
                        <Link href="/contact" className="px-8 py-4 bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest rounded-none hover:bg-orange-600 transition-all">
                            Request Syllabus
                        </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="bg-[#1a1a1a] border border-border border-t-8 border-t-orange-500 rounded-none p-16 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none"></div>
          <h2 className="text-2xl sm:text-4xl font-black mb-6 uppercase tracking-tight text-white">Initialize Your <span className="text-orange-500 italic">Journey.</span></h2>
          <p className="text-sm sm:text-lg mb-12 opacity-60 max-w-2xl mx-auto font-medium italic text-slate-400 leading-relaxed">
            Join thousands of Nigerian students already building their future with our comprehensive 12-year AI curriculum at Rillcod Technologies.
          </p>
          <div className="flex flex-col sm:flex-row gap-8 justify-center items-center">
            <Link
              href="/programs"
              className="w-full sm:w-auto px-16 py-6 bg-white text-black font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-slate-200 transition-all shadow-2xl"
            >
              Uplink Programs
            </Link>
            <Link
              href="/contact"
              className="w-full sm:w-auto px-16 py-6 bg-transparent border border-border text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:border-orange-500 transition-all"
            >
              Request Access
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 
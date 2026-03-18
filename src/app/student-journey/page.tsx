"use client";
import { useState } from "react";
import { 
  GraduationCap, 
  Code, 
  Brain, 
  Bot, 
  Globe, 
  Award, 
  TrendingUp, 
  Sparkles, 
  Rocket, 
  Lightbulb, 
  Users, 
  Target, 
  Star, 
  Zap, 
  Heart, 
  ArrowRight,
  CheckCircle,
  Play,
  BookOpen,
  Palette,
  Smartphone,
  Cpu,
  Database,
  Cloud,
  Shield,
  DollarSign,
  Briefcase,
  Home,
  Clock,
  Calendar
} from "lucide-react";
import Link from "next/link";

const journeyStages = [
  {
    stage: "Foundation",
    age: "6–10 years",
    grade: "Basic 1–4",
    icon: Sparkles,
    color: "from-pink-500 to-rose-500",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    skills: ["Scratch Programming", "Creative Thinking", "Basic Logic", "AI-Enhanced Robotics"],
    projects: ["Animated Stories", "Simple Games", "Robot Programming", "Creative Art"],
    outcomes: ["Digital Creativity", "Problem-Solving", "Logical Thinking", "AI Awareness"],
    description: "Where imagination meets technology. Students discover the joy of creating with code through visual programming and AI-enhanced robotics."
  },
  {
    stage: "Exploration",
    age: "10–12 years", 
    grade: "Basic 5–6",
    icon: Lightbulb,
    color: "from-yellow-500 to-orange-500",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    skills: ["Python Basics", "AI Fundamentals", "Web Concepts", "Data Visualization"],
    projects: ["Python Games", "AI Chatbots", "Simple Websites", "Data Stories"],
    outcomes: ["Programming Logic", "AI Understanding", "Web Awareness", "Data Literacy"],
    description: "The transition to text-based programming begins. Students explore AI fundamentals and start building more complex digital solutions."
  },
  {
    stage: "Development",
    age: "12–15 years",
    grade: "JSS 1–3",
    icon: Code,
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    skills: ["HTML/CSS/JavaScript", "AI Integration", "Web Development", "UI/UX Design"],
    projects: ["Interactive Websites", "AI-Powered Apps", "E-commerce Sites", "Portfolio Projects"],
    outcomes: ["Full-Stack Skills", "AI Implementation", "Design Thinking", "Project Management"],
    description: "Mastering web technologies with AI integration. Students create intelligent applications and develop professional portfolios."
  },
  {
    stage: "Innovation",
    age: "15–17 years",
    grade: "SS 1–2",
    icon: Brain,
    color: "from-purple-500 to-violet-500",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    skills: ["Advanced AI/ML", "IoT Development", "Mobile Apps", "Cloud Computing"],
    projects: ["AI Applications", "Smart Home Systems", "Mobile Apps", "Cloud Solutions"],
    outcomes: ["AI Expertise", "IoT Mastery", "Mobile Development", "Cloud Architecture"],
    description: "Pushing the boundaries of technology. Students integrate AI, IoT, and cloud computing to create cutting-edge solutions."
  },
  {
    stage: "Leadership",
    age: "17–18 years",
    grade: "SS 3",
    icon: Rocket,
    color: "from-green-500 to-emerald-500",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    skills: ["Entrepreneurship", "Team Leadership", "Product Development", "Business Strategy"],
    projects: ["Startup Ventures", "Commercial Apps", "AI Products", "Innovation Labs"],
    outcomes: ["Entrepreneurial Mindset", "Leadership Skills", "Business Acumen", "Career Readiness"],
    description: "Becoming technology leaders and entrepreneurs. Students launch real-world projects and prepare for successful careers."
  }
];

const careerPaths = [
  {
    title: "Software Engineering",
    icon: Code,
    color: "from-blue-600 to-cyan-600",
    salary: "$80,000 - $150,000",
    companies: ["Google", "Microsoft", "Apple", "Netflix"],
    skills: ["Full-Stack Development", "AI/ML", "Cloud Architecture", "DevOps"]
  },
  {
    title: "AI/ML Engineering",
    icon: Brain,
    color: "from-purple-600 to-violet-600",
    salary: "$100,000 - $200,000",
    companies: ["OpenAI", "DeepMind", "Tesla", "NVIDIA"],
    skills: ["Machine Learning", "Deep Learning", "Data Science", "AI Ethics"]
  },
  {
    title: "Product Management",
    icon: Target,
    color: "from-green-600 to-emerald-600",
    salary: "$90,000 - $180,000",
    companies: ["Meta", "Amazon", "Uber", "Airbnb"],
    skills: ["Product Strategy", "User Research", "Data Analysis", "Leadership"]
  },
  {
    title: "Entrepreneurship",
    icon: Rocket,
    color: "from-orange-600 to-red-600",
    salary: "Unlimited Potential",
    companies: ["Start Your Own", "Tech Incubators", "Venture Capital", "Innovation Labs"],
    skills: ["Business Strategy", "Fundraising", "Team Building", "Innovation"]
  }
];

const testimonials = [
  {
    name: "Sarah Johnson",
    age: "17",
    stage: "Leadership",
    quote: "RILLCOD Academy transformed me from a curious beginner to a confident tech entrepreneur. I'm now building my own AI startup!",
    achievement: "Launched AI-powered educational app with 10,000+ users"
  },
  {
    name: "David Chen",
    age: "16", 
    stage: "Innovation",
    quote: "The AI and IoT projects here are incredible. I never thought I could build smart home systems at my age!",
    achievement: "Created smart home automation system for local businesses"
  },
  {
    name: "Aisha Patel",
    age: "15",
    stage: "Development", 
    quote: "Learning web development with AI integration opened so many doors. I'm already getting freelance projects!",
    achievement: "Built e-commerce platform generating $5,000+ monthly revenue"
  }
];

export default function StudentJourney() {
  const [activeStage, setActiveStage] = useState(0);
  const [activeCareer, setActiveCareer] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-4 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 mb-6">
            <Sparkles className="w-4 h-4 mr-2 text-blue-600" />
            Transformative Learning Journey
          </div>
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-6">
            Student Journey
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-4xl mx-auto mb-8 leading-relaxed">
            See how students progress from <span className="font-semibold text-blue-600">creative beginners</span> to{" "}
            <span className="font-semibold text-purple-600">AI-powered innovators</span> and{" "}
            <span className="font-semibold text-green-600">career-ready graduates</span>
          </p>
          <div className="flex items-center justify-center space-x-8 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-2">
              <Heart className="w-5 h-5 text-red-500" />
              <span>Passion-Driven Learning</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              <span>AI-Powered Curriculum</span>
            </div>
            <div className="flex items-center space-x-2">
              <Star className="w-5 h-5 text-blue-500" />
              <span>Career-Focused Outcomes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Journey Timeline */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Your Learning Journey</h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            A comprehensive 12-year journey that transforms curious minds into technology leaders
          </p>
        </div>

        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-1/2 transform -translate-x-1/2 w-1 h-full bg-gradient-to-b from-pink-500 via-yellow-500 via-blue-500 via-purple-500 to-green-500 rounded-full"></div>
          
          <div className="space-y-16">
            {journeyStages.map((stage, index) => {
              const StageIcon = stage.icon;
              const isActive = activeStage === index;
              const isEven = index % 2 === 0;
              
              return (
                <div key={index} className={`relative flex items-center ${isEven ? 'flex-row' : 'flex-row-reverse'}`}>
                  {/* Stage Card */}
                  <div className={`w-1/2 ${isEven ? 'pr-8' : 'pl-8'}`}>
                    <div 
                      className={`${stage.bgColor} dark:bg-gray-800 ${stage.borderColor} dark:border-gray-700 border-2 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer ${
                        isActive ? 'scale-105 ring-4 ring-blue-500/20' : ''
                      }`}
                      onClick={() => setActiveStage(index)}
                    >
                      <div className="flex items-center mb-6">
                        <div className={`w-16 h-16 bg-gradient-to-r ${stage.color} rounded-xl flex items-center justify-center mr-4`}>
                          <StageIcon className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{stage.stage}</h3>
                          <p className="text-gray-600 dark:text-gray-300">{stage.age} • {stage.grade}</p>
                        </div>
                      </div>
                      
                      <p className="text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">{stage.description}</p>
                      
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                            <BookOpen className="w-4 h-4 mr-2 text-blue-600" />
                            Key Skills
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {stage.skills.map((skill, skillIndex) => (
                              <span key={skillIndex} className="px-3 py-1 bg-white/60 dark:bg-gray-700/60 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                            <Palette className="w-4 h-4 mr-2 text-green-600" />
                            Sample Projects
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {stage.projects.map((project, projectIndex) => (
                              <span key={projectIndex} className="px-3 py-1 bg-white/60 dark:bg-gray-700/60 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300">
                                {project}
                              </span>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                            <Target className="w-4 h-4 mr-2 text-purple-600" />
                            Learning Outcomes
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {stage.outcomes.map((outcome, outcomeIndex) => (
                              <span key={outcomeIndex} className="px-3 py-1 bg-white/60 dark:bg-gray-700/60 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300">
                                {outcome}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Timeline Node */}
                  <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className={`w-8 h-8 bg-gradient-to-r ${stage.color} rounded-full border-4 border-border dark:border-gray-800 shadow-lg flex items-center justify-center ${
                      isActive ? 'scale-125 ring-4 ring-blue-500/30' : ''
                    }`}>
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Career Paths */}
      <div className="bg-white dark:bg-gray-900 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Career Opportunities</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Your journey leads to exciting career paths in the world's leading tech companies
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {careerPaths.map((career, index) => {
              const CareerIcon = career.icon;
              const isActive = activeCareer === index;
              
              return (
                <div 
                  key={index}
                  className={`bg-gradient-to-br ${career.color} rounded-2xl p-8 text-white hover:scale-105 transition-all duration-300 cursor-pointer ${
                    isActive ? 'ring-4 ring-white/30' : ''
                  }`}
                  onClick={() => setActiveCareer(index)}
                >
                  <div className="flex items-center mb-6">
                    <CareerIcon className="w-12 h-12 mr-4" />
                    <h3 className="text-2xl font-bold">{career.title}</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center">
                      <DollarSign className="w-5 h-5 mr-2" />
                      <span className="font-semibold">{career.salary}</span>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Top Companies</h4>
                      <div className="flex flex-wrap gap-1">
                        {career.companies.map((company, companyIndex) => (
                          <span key={companyIndex} className="px-2 py-1 bg-white/20 rounded text-sm">
                            {company}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Key Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {career.skills.map((skill, skillIndex) => (
                          <span key={skillIndex} className="px-2 py-1 bg-white/20 rounded text-sm">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Student Testimonials */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Student Success Stories</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Real students, real achievements, real transformations
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center mr-4">
                    <Users className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{testimonial.name}</h3>
                    <p className="text-gray-600 dark:text-gray-300">{testimonial.age} years • {testimonial.stage}</p>
                  </div>
                </div>
                
                <blockquote className="text-gray-700 dark:text-gray-300 mb-6 italic leading-relaxed">
                  "{testimonial.quote}"
                </blockquote>
                
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center">
                    <Award className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
                    <span className="text-green-800 dark:text-green-200 font-medium">{testimonial.achievement}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 py-20">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of students who have transformed their lives through technology education. 
            Your future as an AI-powered innovator starts here.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/student-registration" 
              className="inline-flex items-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-xl hover:bg-gray-100 transition-all duration-300 hover:scale-105 shadow-lg"
            >
              <Rocket className="w-5 h-5 mr-2" />
              Start Your Journey
            </Link>
            
            <Link 
              href="/programs" 
              className="inline-flex items-center px-8 py-4 border-2 border-border text-white font-semibold rounded-xl hover:bg-white hover:text-blue-600 transition-all duration-300 hover:scale-105"
            >
              <Play className="w-5 h-5 mr-2" />
              Explore Programs
            </Link>
          </div>
          
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-white/90">
            <div className="flex items-center justify-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>Flexible Learning Schedule</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <Home className="w-5 h-5" />
              <span>Online & In-Person Options</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <Calendar className="w-5 h-5" />
              <span>Year-Round Enrollment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
// @refresh reset
import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  CodeBracketIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  PaintBrushIcon,
  StarIcon,
  UserGroupIcon,
  CalendarIcon,
  TrophyIcon,
  HeartIcon,
  EyeIcon
} from '@/lib/icons';

export const metadata: Metadata = {
  title: 'Student Projects - RILLCOD Academy | Showcase of Student Work',
  description: 'Explore amazing projects created by RILLCOD Academy students. From games and websites to mobile apps and digital art, see the incredible work of young innovators.',
  keywords: 'student projects, coding projects, games, websites, mobile apps, digital art, student showcase',
  openGraph: {
    title: 'Student Projects - RILLCOD Academy',
    description: 'Amazing projects created by young innovators',
    type: 'website',
  },
};

const projects = [
  {
    id: 1,
    title: "EcoQuest Adventure",
    type: "Game",
    category: "Scratch Programming",
    student: "Aisha Mohammed",
    age: 12,
    school: "Lagos State Model College",
    description: "An educational game about environmental conservation where players solve puzzles to save endangered animals.",
    image: "https://images.pexels.com/photos/3777943/pexels-photo-3777943.jpeg",
    demoUrl: "#",
    codeUrl: "#",
    features: ["Environmental Education", "Puzzle Solving", "Animal Conservation", "Interactive Storytelling"],
    technologies: ["Scratch", "Block Programming"],
    likes: 156,
    views: 2340,
    awards: ["Best Educational Game", "Environmental Impact Award"]
  },
  {
    id: 2,
    title: "Smart Weather App",
    type: "Mobile App",
    category: "Flutter Development",
    student: "David Okonkwo",
    age: 15,
    school: "Abuja International School",
    description: "A weather application that provides real-time weather updates with beautiful UI and location-based forecasts.",
    image: "https://images.pexels.com/photos/3777946/pexels-photo-3777946.jpeg",
    demoUrl: "#",
    codeUrl: "#",
    features: ["Real-time Weather", "Location Services", "Beautiful UI", "Weather Alerts"],
    technologies: ["Flutter", "Dart", "Weather API"],
    likes: 203,
    views: 3456,
    awards: ["Best Mobile App", "UI/UX Excellence"]
  },
  {
    id: 3,
    title: "Nigerian Cuisine Blog",
    type: "Website",
    category: "Web Development",
    student: "Fatima Ibrahim",
    age: 14,
    school: "Kano Science College",
    description: "A beautiful blog showcasing traditional Nigerian recipes with modern web design and interactive features.",
    image: "https://images.pexels.com/photos/3777949/pexels-photo-3777949.jpeg",
    demoUrl: "#",
    codeUrl: "#",
    features: ["Recipe Database", "Interactive Comments", "Responsive Design", "Search Functionality"],
    technologies: ["HTML", "CSS", "JavaScript", "React"],
    likes: 189,
    views: 2890,
    awards: ["Best Cultural Project", "Web Design Award"]
  },
  {
    id: 4,
    title: "Math Helper Bot",
    type: "Application",
    category: "Python Programming",
    student: "Emmanuel Adebayo",
    age: 13,
    school: "Port Harcourt Academy",
    description: "A Python application that helps students solve math problems step by step with explanations.",
    image: "https://images.pexels.com/photos/3777952/pexels-photo-3777952.jpeg",
    demoUrl: "#",
    codeUrl: "#",
    features: ["Step-by-step Solutions", "Multiple Math Topics", "Interactive Interface", "Progress Tracking"],
    technologies: ["Python", "Tkinter", "Mathematical Libraries"],
    likes: 234,
    views: 4120,
    awards: ["Best Educational Tool", "Innovation Award"]
  },
  {
    id: 5,
    title: "Digital Art Portfolio",
    type: "Design",
    category: "UI/UX Design",
    student: "Chioma Nwosu",
    age: 16,
    school: "Ibadan Grammar School",
    description: "A stunning digital art portfolio showcasing various design projects and creative concepts.",
    image: "https://images.pexels.com/photos/3777955/pexels-photo-3777955.jpeg",
    demoUrl: "#",
    codeUrl: "#",
    features: ["Portfolio Gallery", "Interactive Elements", "Responsive Design", "Contact Forms"],
    technologies: ["Figma", "Adobe Creative Suite", "HTML/CSS"],
    likes: 167,
    views: 2980,
    awards: ["Best Design Project", "Creative Excellence"]
  },
  {
    id: 6,
    title: "School Library Management",
    type: "System",
    category: "Python Programming",
    student: "Oluwaseun Adeyemi",
    age: 15,
    school: "Calabar Secondary School",
    description: "A comprehensive library management system for schools with book tracking and student management.",
    image: "https://images.pexels.com/photos/3777958/pexels-photo-3777958.jpeg",
    demoUrl: "#",
    codeUrl: "#",
    features: ["Book Management", "Student Records", "Borrowing System", "Reports Generation"],
    technologies: ["Python", "SQLite", "Tkinter"],
    likes: 145,
    views: 2670,
    awards: ["Best System Project", "Practical Application"]
  }
];

const categories = [
  { name: "All Projects", count: projects.length, icon: CodeBracketIcon },
  { name: "Games", count: projects.filter(p => p.type === "Game").length, icon: DevicePhoneMobileIcon },
  { name: "Websites", count: projects.filter(p => p.type === "Website").length, icon: GlobeAltIcon },
  { name: "Mobile Apps", count: projects.filter(p => p.type === "Mobile App").length, icon: DevicePhoneMobileIcon },
  { name: "Design", count: projects.filter(p => p.type === "Design").length, icon: PaintBrushIcon },
  { name: "Applications", count: projects.filter(p => p.type === "Application" || p.type === "System").length, icon: CodeBracketIcon }
];

export default function StudentProjectsPage() {
  return (
    <div className="min-h-screen pt-16">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
              Student Projects
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 max-w-4xl mx-auto leading-relaxed">
              Showcasing the incredible creativity and technical skills of our young innovators
            </p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
            <div className="bg-blue-50 p-6 rounded-xl">
              <div className="text-3xl font-bold text-blue-600 mb-2">{projects.length}+</div>
              <div className="text-gray-600">Projects Created</div>
            </div>
            <div className="bg-green-50 p-6 rounded-xl">
              <div className="text-3xl font-bold text-green-600 mb-2">500+</div>
              <div className="text-gray-600">Students</div>
            </div>
            <div className="bg-purple-50 p-6 rounded-xl">
              <div className="text-3xl font-bold text-purple-600 mb-2">50+</div>
              <div className="text-gray-600">Partner Schools</div>
            </div>
            <div className="bg-orange-50 p-6 rounded-xl">
              <div className="text-3xl font-bold text-primary mb-2">25+</div>
              <div className="text-gray-600">Awards Won</div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Categories */}
      <section className="py-8 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((category, index) => (
              <button
                key={index}
                className="flex items-center space-x-2 bg-white px-6 py-3 rounded-full shadow-md hover:shadow-lg transition-shadow"
              >
                <category.icon className="w-5 h-5 text-primary" />
                <span className="font-medium text-gray-700">{category.name}</span>
                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-sm">
                  {category.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Projects Grid */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {projects.map((project) => (
              <div key={project.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                <div className="relative h-48 w-full">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-primary text-white px-3 py-1 rounded-full text-sm font-medium">
                    {project.type}
                  </div>
                  <div className="absolute top-4 right-4 bg-white text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
                    {project.category}
                  </div>
                </div>
                
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{project.title}</h3>
                  <p className="text-gray-600 mb-4">{project.description}</p>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <UserGroupIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{project.student}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CalendarIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{project.age} years</span>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-800 mb-2">Features:</h4>
                    <div className="flex flex-wrap gap-2">
                      {project.features.slice(0, 3).map((feature, index) => (
                        <span 
                          key={index}
                          className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-800 mb-2">Technologies:</h4>
                    <div className="flex flex-wrap gap-2">
                      {project.technologies.map((tech, index) => (
                        <span 
                          key={index}
                          className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <HeartIcon className="w-4 h-4 text-red-500" />
                        <span className="text-sm text-gray-600">{project.likes}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <EyeIcon className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-600">{project.views}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <TrophyIcon className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm text-gray-600">{project.awards.length} awards</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <a
                      href={project.demoUrl}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-colors text-sm font-medium"
                    >
                      View Demo
                    </a>
                    <a
                      href={project.codeUrl}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white transition-colors text-sm font-medium"
                    >
                      View Code
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Awards Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Student Achievements</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Celebrating the outstanding achievements and awards won by our students
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white p-6 rounded-xl text-center shadow-lg">
              <TrophyIcon className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">National Coding Competition</h3>
              <p className="text-gray-600">1st Place Winners</p>
            </div>
            <div className="bg-white p-6 rounded-xl text-center shadow-lg">
              <StarIcon className="w-12 h-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">Innovation Awards</h3>
              <p className="text-gray-600">15+ Awards Won</p>
            </div>
            <div className="bg-white p-6 rounded-xl text-center shadow-lg">
              <GlobeAltIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">International Recognition</h3>
              <p className="text-gray-600">Featured in Tech Blogs</p>
            </div>
            <div className="bg-white p-6 rounded-xl text-center shadow-lg">
              <HeartIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">Community Impact</h3>
              <p className="text-gray-600">Projects Helping Others</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Create Your Own Project?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join our programs and start building amazing projects that could change the world.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/programs"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 text-xl font-bold rounded-full shadow-lg hover:bg-gray-100 transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
            >
              Explore Programs
            </Link>
            <a
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 border-2 border-border text-white text-xl font-bold rounded-full hover:bg-white hover:text-blue-600 transform transition-all duration-300 hover:scale-105"
            >
              Get Started
            </a>
          </div>
        </div>
      </section>
    </div>
  );
} 
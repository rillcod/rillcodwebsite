"use client";
import { useState } from "react";
import { Mail, Linkedin, Twitter, Github, Globe, Award, BookOpen, Users, Code, Sparkles, Heart, Zap, Target, Star, Building2, GraduationCap, Lightbulb, Shield, ArrowRight, ChevronDown } from "lucide-react";

const teamMembers = [
  {
    name: "Dr. Osaro Igbinedion",
    role: "Founder & Chief Executive Officer",
    bio: "A visionary leader in technology education with 15+ years of experience in curriculum development, AI integration, and educational innovation. Dr. Igbinedion holds a PhD in Computer Science Education from University of Benin and has pioneered several breakthrough learning methodologies for Nigerian students.",
    image: "/api/placeholder/300/300",
    email: "osaro.igbinedion@rillcodacademy.com",
    linkedin: "#",
    twitter: "#",
    expertise: ["AI Education", "Curriculum Design", "Educational Technology", "Leadership"],
    achievements: ["PhD Computer Science", "15+ Years Experience", "Edo State Education Innovation Award 2023"],
    department: "Leadership",
    yearsAtCompany: 8,
    funFact: "Loves solving Rubik's cubes and has a collection of 50+ puzzles"
  },
  {
    name: "Mrs. Chioma Okonkwo",
    role: "Chief Technology Officer",
    bio: "Expert software architect and technology strategist with deep expertise in educational platforms, AI systems, and scalable software solutions. Chioma leads our technical innovation and platform development efforts, having previously worked at major tech companies in Lagos.",
    image: "/api/placeholder/300/300",
    email: "chioma.okonkwo@rillcodacademy.com",
    linkedin: "#",
    twitter: "#",
    expertise: ["Software Architecture", "AI Systems", "Platform Development", "IoT Integration"],
    achievements: ["MSc Software Engineering", "10+ Years Tech Leadership", "Platform Innovation Award"],
    department: "Technology",
    yearsAtCompany: 6,
    funFact: "Built her first computer at age 12 and still has it working"
  },
  {
    name: "Prof. Daniel Eze",
    role: "Academic Director",
    bio: "Former university professor and curriculum expert specializing in computer science education. Prof. Eze ensures academic excellence and maintains the highest educational standards across all programs, with extensive experience in Nigerian educational institutions.",
    image: "/api/placeholder/300/300",
    email: "daniel.eze@rillcodacademy.com",
    linkedin: "#",
    twitter: "#",
    expertise: ["Computer Science", "Curriculum Development", "Academic Standards", "Research"],
    achievements: ["PhD Computer Science", "Former University Professor", "Academic Excellence Award"],
    department: "Academic",
    yearsAtCompany: 7,
    funFact: "Has published over 50 research papers on computer science education"
  },
  {
    name: "Mrs. Grace Ogbebor",
    role: "Head of Operations",
    bio: "Experienced operations leader specializing in educational administration and quality assurance. Grace ensures smooth operations and exceptional student experiences across all programs, with background in managing multiple school partnerships.",
    image: "/api/placeholder/300/300",
    email: "grace.ogbebor@rillcodacademy.com",
    linkedin: "#",
    twitter: "#",
    expertise: ["Operations Management", "Student Services", "Quality Assurance", "Process Optimization"],
    achievements: ["MBA Business Administration", "8+ Years Operations", "Excellence in Service Award"],
    department: "Operations",
    yearsAtCompany: 5,
    funFact: "Speaks 4 languages fluently and loves traveling"
  },
  {
    name: "Miss Blessing Aigbe",
    role: "Head of Student Success",
    bio: "Dedicated to student development and success, Blessing leads our student support programs and ensures every student achieves their full potential through personalized guidance and mentorship. Graduate of University of Benin with expertise in educational psychology.",
    image: "/api/placeholder/300/300",
    email: "blessing.aigbe@rillcodacademy.com",
    linkedin: "#",
    twitter: "#",
    expertise: ["Student Development", "Mentorship", "Career Guidance", "Success Coaching"],
    achievements: ["MSc Education Psychology", "Student Success Specialist", "Mentorship Excellence Award"],
    department: "Student Services",
    yearsAtCompany: 4,
    funFact: "Has mentored over 500 students to successful careers in tech"
  },
  {
    name: "Mr. Emmanuel Omoregie",
    role: "Head of Research & Innovation",
    bio: "Leading our research initiatives and innovation programs, Emmanuel focuses on emerging technologies and their integration into our curriculum to keep Rillcod Academy at the forefront of technology education in Nigeria.",
    image: "/api/placeholder/300/300",
    email: "emmanuel.omoregie@rillcodacademy.com",
    linkedin: "#",
    twitter: "#",
    expertise: ["Research & Development", "Emerging Technologies", "Innovation Strategy", "Technology Trends"],
    achievements: ["PhD Technology Education", "Research Innovation Award", "Technology Pioneer Award"],
    department: "Research",
    yearsAtCompany: 6,
    funFact: "Invented a coding game that's used in 100+ schools worldwide"
  },
  {
    name: "Mrs. Patience Ehiagwina",
    role: "Head of Partnerships",
    bio: "Building strategic partnerships with schools, universities, and technology companies to expand our reach and enhance our educational offerings across Edo State and beyond.",
    image: "/api/placeholder/300/300",
    email: "patience.ehiagwina@rillcodacademy.com",
    linkedin: "https://linkedin.com/in/patienceehiagwina",
    twitter: "#",
    expertise: ["Partnership Development", "Business Development", "Strategic Planning", "Networking"],
    achievements: ["Established 50+ partnerships", "Generated ₦100M+ in revenue", "Expanded to 10+ states"],
    department: "Partnerships",
    yearsAtCompany: 5,
    funFact: "Has visited 25+ states for partnership meetings"
  },
  {
    name: "Miss Joy Osagie",
    role: "Head of Content Development",
    bio: "Creating engaging and effective educational content that makes complex technology concepts accessible to students of all ages and skill levels. Specializes in developing culturally relevant content for Nigerian students.",
    image: "/api/placeholder/300/300",
    email: "joy.osagie@rillcodacademy.com",
    linkedin: "https://linkedin.com/in/joyosagie",
    twitter: "#",
    expertise: ["Content Development", "Instructional Design", "Multimedia Production", "Curriculum Writing"],
    achievements: ["Developed 500+ lessons", "Created 100+ video tutorials", "Improved engagement by 40%"],
    department: "Content",
    yearsAtCompany: 4,
    funFact: "Former YouTuber with 50K+ subscribers on educational content"
  }
];

const departments = [
  {
    name: "Academic Team",
    icon: <BookOpen className="w-8 h-8" />,
    description: "Our academic team consists of experienced educators and curriculum specialists who design and deliver world-class technology education programs tailored for Nigerian students.",
    memberCount: 25,
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-blue-50",
    achievements: ["50+ Curriculum Modules", "95% Student Satisfaction", "15+ Academic Awards", "Partnership with 20+ Schools"]
  },
  {
    name: "Technology Team",
    icon: <Code className="w-8 h-8" />,
    description: "Our technology team develops and maintains our AI-powered learning platform and ensures seamless digital experiences for all users across Nigeria.",
    memberCount: 15,
    color: "from-green-500 to-emerald-500",
    bgColor: "bg-green-50",
    achievements: ["AI-Powered Platform", "99.9% Uptime", "10+ Technology Patents", "Localized for Nigerian Context"]
  },
  {
    name: "Student Services",
    icon: <Users className="w-8 h-8" />,
    description: "Our student services team provides comprehensive support, guidance, and mentorship to ensure every Nigerian student's success in technology education.",
    memberCount: 20,
    color: "from-purple-500 to-violet-500",
    bgColor: "bg-purple-50",
    achievements: ["500+ Students Mentored", "98% Success Rate", "24/7 Support", "Multilingual Support"]
  }
];

const values = [
  {
    title: "Innovation",
    description: "We constantly push boundaries in technology education",
    icon: <Lightbulb className="w-8 h-8" />,
    color: "from-yellow-500 to-orange-500"
  },
  {
    title: "Excellence",
    description: "We maintain the highest standards in everything we do",
    icon: <Star className="w-8 h-8" />,
    color: "from-blue-500 to-cyan-500"
  },
  {
    title: "Integrity",
    description: "We operate with honesty, transparency, and trust",
    icon: <Shield className="w-8 h-8" />,
    color: "from-green-500 to-emerald-500"
  },
  {
    title: "Impact",
    description: "We focus on creating meaningful change in education",
    icon: <Target className="w-8 h-8" />,
    color: "from-purple-500 to-violet-500"
  }
];

export default function Team() {
  const [selectedDepartment, setSelectedDepartment] = useState("All");
  const [expandedMember, setExpandedMember] = useState<number | null>(null);

  const filteredMembers = selectedDepartment === "All" 
    ? teamMembers 
    : teamMembers.filter(member => member.department === selectedDepartment);

  const departmentsList = ["All", ...Array.from(new Set(teamMembers.map(m => m.department)))];

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
          <div className="relative mx-auto w-24 h-24 mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-full animate-pulse"></div>
            <div className="absolute inset-3 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
              <Users className="w-12 h-12 text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center animate-bounce">
              <Sparkles className="w-4 h-4 text-yellow-800" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            Meet Our Team
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-6">
            Our passionate team of educators, technologists, and innovators are dedicated to transforming technology education in Africa
          </p>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-1">
              <Heart className="w-4 h-4 text-red-500" />
              <span>Passionate Educators</span>
            </div>
            <div className="flex items-center space-x-1">
              <Zap className="w-4 h-4 text-blue-500" />
              <span>Innovation Leaders</span>
            </div>
            <div className="flex items-center space-x-1">
              <Target className="w-4 h-4 text-green-500" />
              <span>Student Success</span>
            </div>
          </div>
        </div>

        {/* Team Stats */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 p-8 mb-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                  <Users className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{teamMembers.length}</div>
              <div className="text-gray-600 dark:text-gray-300 font-medium">Team Members</div>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                  <Award className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">100+</div>
              <div className="text-gray-600 dark:text-gray-300 font-medium">Years Experience</div>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-violet-500 rounded-full flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">50+</div>
              <div className="text-gray-600 dark:text-gray-300 font-medium">Publications</div>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                  <Globe className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">10+</div>
              <div className="text-gray-600 dark:text-gray-300 font-medium">Countries</div>
            </div>
          </div>
        </div>

        {/* Our Values */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Our Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <div key={index} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 dark:border-gray-700/20 p-6 text-center hover:shadow-xl transition-shadow">
                <div className={`w-16 h-16 bg-gradient-to-r ${value.color} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <div className="text-white">
                    {value.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{value.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{value.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Departments */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Our Departments</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {departments.map((dept, index) => (
              <div key={index} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 dark:border-gray-700/20 p-6 hover:shadow-xl transition-shadow">
                <div className={`w-16 h-16 bg-gradient-to-r ${dept.color} rounded-full flex items-center justify-center mb-4`}>
                  <div className="text-white">
                    {dept.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{dept.name}</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">{dept.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{dept.memberCount} members</span>
                  <div className="flex space-x-1">
                    {dept.achievements.slice(0, 2).map((achievement, idx) => (
                      <div key={idx} className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Department Filter */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {departmentsList.map((department) => (
            <button
              key={department}
              onClick={() => setSelectedDepartment(department)}
              className={`px-6 py-3 rounded-full border-2 transition-all duration-300 font-medium ${
                selectedDepartment === department
                  ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white border-transparent shadow-lg scale-105"
                  : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-105"
              }`}
            >
              {department}
            </button>
          ))}
        </div>

        {/* Team Members */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Leadership Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredMembers.map((member, index) => (
              <div key={index} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 overflow-hidden hover:shadow-2xl transition-all duration-300 hover:scale-105">
                {/* Header */}
                <div className="relative h-48 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20"></div>
                  <div className="relative text-center">
                    <div className="w-24 h-24 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                      <span className="text-white font-bold text-2xl">
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full px-4 py-1 inline-block">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">{member.department}</span>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full px-2 py-1">
                    <span className="text-xs text-gray-600 dark:text-gray-300">{member.yearsAtCompany} years</span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{member.name}</h3>
                  <p className="text-blue-600 dark:text-blue-400 font-semibold mb-3">{member.role}</p>
                  
                  <div className="mb-4">
                    <p className={`text-gray-600 dark:text-gray-300 text-sm ${expandedMember === index ? '' : 'line-clamp-3'}`}>
                      {member.bio}
                    </p>
                    {member.bio.length > 100 && (
                      <button
                        onClick={() => setExpandedMember(expandedMember === index ? null : index)}
                        className="text-blue-600 dark:text-blue-400 text-sm font-medium mt-2 hover:text-blue-700 dark:hover:text-blue-300 flex items-center"
                      >
                        {expandedMember === index ? 'Show less' : 'Read more'}
                        <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${expandedMember === index ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Expertise */}
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">Expertise:</h4>
                    <div className="flex flex-wrap gap-1">
                      {member.expertise.slice(0, 3).map((skill, skillIndex) => (
                        <span key={skillIndex} className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full text-xs font-medium">
                          {skill}
                        </span>
                      ))}
                      {member.expertise.length > 3 && (
                        <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full text-xs">
                          +{member.expertise.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Fun Fact */}
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <span className="font-semibold">Fun Fact:</span> {member.funFact}
                    </p>
                  </div>

                  {/* Contact */}
                  <div className="flex items-center justify-between">
                    <div className="flex space-x-2">
                      <a href={`mailto:${member.email}`} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors">
                        <Mail className="w-4 h-4" />
                      </a>
                      <a href={member.linkedin} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors">
                        <Linkedin className="w-4 h-4" />
                      </a>
                      <a href={member.twitter} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors">
                        <Twitter className="w-4 h-4" />
                      </a>
                    </div>
                    <button className="flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm">
                      View Profile
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Join Our Team CTA */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Join Our Team</h2>
          <p className="text-xl mb-6 opacity-90">
            We're always looking for passionate educators and technologists to join our mission
          </p>
          <button className="bg-white text-blue-600 px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors">
            View Open Positions
          </button>
        </div>
      </div>
    </div>
  );
} 
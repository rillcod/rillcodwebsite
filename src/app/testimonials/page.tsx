"use client";
import { useState } from "react";
import { Star, Quote, ArrowLeft, ArrowRight, Users, Award, BookOpen, Code, Sparkles, Heart, Zap, Target, CheckCircle, Play, Pause, Volume2, VolumeX } from "lucide-react";

const testimonials = [
  {
    id: 1,
    name: "Master Daniel Eze",
    role: "Student, SS3",
    school: "St. Maria Goretti College, Benin City",
    content: "Rillcod Technologies transformed my understanding of technology. I started with no programming knowledge and now I'm building mobile apps with Flutter. The AI-powered learning platform made everything so personalized and engaging. The teachers are incredibly supportive and the hands-on projects helped me build a strong portfolio.",
    rating: 5,
    category: "Student",
    image: "/api/placeholder/100/100",
    achievements: ["Built 5 mobile apps", "Won Edo State coding competition", "Got internship offer"],
    featured: true,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Python Programming",
    duration: "2 years"
  },
  {
    id: 2,
    name: "Mr. Osaro Igbinedion",
    role: "Parent",
    school: "Parent of JSS2 Student",
    content: "As a parent, I was initially skeptical about technology education, but Rillcod Technologies has exceeded all expectations. My daughter's confidence has grown tremendously, and she's now teaching me about AI and robotics! The progress tracking system keeps me informed, and the teachers are always available to answer questions.",
    rating: 5,
    category: "Parent",
    image: "/api/placeholder/100/100",
    achievements: ["Daughter's improved confidence", "Better academic performance", "Future-ready skills"],
    featured: true,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Robotics Programming",
    duration: "1.5 years"
  },
  {
    id: 3,
    name: "Mrs. Grace Ogbebor",
    role: "Principal",
    school: "St. Maria Goretti College, Benin City",
    content: "Partnering with Rillcod Technologies has been a game-changer for our school. Our students are now competing in national technology competitions and showing remarkable improvement in problem-solving skills. The AI-powered dashboard gives us incredible insights into student progress and helps us make data-driven decisions.",
    rating: 5,
    category: "School",
    image: "/api/placeholder/100/100",
    achievements: ["Improved student performance", "National competition wins", "Enhanced school reputation"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "School Partnership",
    duration: "3 years"
  },
  {
    id: 4,
    name: "Miss Blessing Aigbe",
    role: "Student, JSS3",
    school: "Federal Government College, Benin City",
    content: "The robotics program at Rillcod Technologies is amazing! I built a smart traffic light system using Python and Arduino. The teachers are so supportive and the hands-on projects make learning fun. I've learned so much about problem-solving and critical thinking.",
    rating: 5,
    category: "Student",
    image: "/api/placeholder/100/100",
    achievements: ["Built IoT projects", "Python programming", "Robotics skills"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Robotics Programming",
    duration: "1 year"
  },
  {
    id: 5,
    name: "Mrs. Chioma Okonkwo",
    role: "Parent",
    school: "Parent of Primary 5 Student",
    content: "My son started with Scratch programming and now he's creating games and animations. The progression is incredible, and he's developing critical thinking skills that will serve him well in any career. The micro-lessons and self-paced learning are perfect for his learning style.",
    rating: 5,
    category: "Parent",
    image: "/api/placeholder/100/100",
    achievements: ["Critical thinking development", "Creative problem solving", "Early technology exposure"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Scratch Programming",
    duration: "2 years"
  },
  {
    id: 6,
    name: "Mrs. Patience Ehiagwina",
    role: "Vice Principal",
    school: "Edo College, Benin City",
    content: "The AI-powered dashboard gives us incredible insights into student progress. We can identify areas where students need support and track their development across the entire curriculum. This has revolutionized how we approach technology education.",
    rating: 5,
    category: "School",
    image: "/api/placeholder/100/100",
    achievements: ["Better student tracking", "Improved teaching methods", "Data-driven decisions"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "School Partnership",
    duration: "2.5 years"
  },
  {
    id: 7,
    name: "Miss Joy Osagie",
    role: "Student, SS2",
    school: "University of Benin Demonstration Secondary School",
    content: "I never thought I could code, but Rillcod Technologies made it so accessible. The micro-lessons and self-paced learning allowed me to learn at my own speed. Now I'm building websites and helping other students! The portfolio feature is fantastic for showcasing my work.",
    rating: 5,
    category: "Student",
    image: "/api/placeholder/100/100",
    achievements: ["Web development skills", "Peer mentoring", "Leadership development"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Web Development",
    duration: "1.5 years"
  },
  {
    id: 8,
    name: "Mr. Emmanuel Omoregie",
    role: "Parent",
    school: "Parent of SS1 Student",
    content: "The portfolio feature is fantastic! My daughter has built an impressive collection of projects that she can showcase to universities and employers. It's like having a digital resume of her skills. The career guidance has been invaluable.",
    rating: 5,
    category: "Parent",
    image: "/api/placeholder/100/100",
    achievements: ["Portfolio development", "University applications", "Career preparation"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Python Programming",
    duration: "2 years"
  },
  {
    id: 9,
    name: "Master Victor Igbinedion",
    role: "Student, SS1",
    school: "Federal Government College, Benin City",
    content: "The web development course has been incredible! I've learned HTML, CSS, JavaScript, and React. Now I'm building professional websites and even got my first freelance project. The teachers are amazing and always encourage us to think creatively.",
    rating: 5,
    category: "Student",
    image: "/api/placeholder/100/100",
    achievements: ["Web development skills", "Freelance projects", "Creative thinking"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Web Development",
    duration: "1 year"
  },
  {
    id: 10,
    name: "Mrs. Faith Omoregie",
    role: "Parent",
    school: "Parent of JSS1 Student",
    content: "My son's logical thinking has improved dramatically since joining Rillcod Technologies. He's now solving complex problems and thinking systematically. The investment in his future is worth every kobo. The teachers are patient and understanding.",
    rating: 5,
    category: "Parent",
    image: "/api/placeholder/100/100",
    achievements: ["Improved logical thinking", "Problem-solving skills", "Academic improvement"],
    featured: false,
    videoUrl: "#",
    location: "Benin City, Edo State",
    program: "Scratch Programming",
    duration: "1 year"
  }
];

const categories = ["All", "Student", "Parent", "School"];

const stats = [
  { number: "500+", label: "Happy Students", icon: <Users className="w-8 h-8" />, color: "from-blue-500 to-cyan-500" },
  { number: "95%", label: "Satisfaction Rate", icon: <Star className="w-8 h-8" />, color: "from-green-500 to-emerald-500" },
  { number: "20+", label: "Partner Schools", icon: <Award className="w-8 h-8" />, color: "from-purple-500 to-violet-500" },
  { number: "1000+", label: "Projects Completed", icon: <Code className="w-8 h-8" />, color: "from-orange-500 to-red-500" }
];

const achievements = [
  {
    title: "Edo State Recognition",
    description: "Awarded Best Technology Education Provider 2023",
    icon: <Award className="w-6 h-6" />,
    color: "from-yellow-500 to-orange-500"
  },
  {
    title: "Student Success",
    description: "95% of students show significant improvement",
    icon: <CheckCircle className="w-6 h-6" />,
    color: "from-green-500 to-emerald-500"
  },
  {
    title: "Innovation Award",
    description: "Recognized for AI-powered learning platform",
    icon: <Sparkles className="w-6 h-6" />,
    color: "from-blue-500 to-cyan-500"
  }
];

export default function Testimonials() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const filteredTestimonials = testimonials.filter(testimonial => 
    selectedCategory === "All" || testimonial.category === selectedCategory
  );

  const featuredTestimonials = filteredTestimonials.filter(t => t.featured);
  const regularTestimonials = filteredTestimonials.filter(t => !t.featured);

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % featuredTestimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + featuredTestimonials.length) % featuredTestimonials.length);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

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
              <Quote className="w-12 h-12 text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center animate-bounce">
              <Sparkles className="w-4 h-4 text-yellow-800" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            What People Say About Us
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-6">
            Hear from our students, parents, and partner schools about their experiences with RILLCOD Academy's technology education programs
          </p>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-1">
              <Heart className="w-4 h-4 text-red-500" />
              <span>Real Stories</span>
            </div>
            <div className="flex items-center space-x-1">
              <Zap className="w-4 h-4 text-blue-500" />
              <span>Verified Results</span>
            </div>
            <div className="flex items-center space-x-1">
              <Target className="w-4 h-4 text-green-500" />
              <span>Student Success</span>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 p-8 mb-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="flex justify-center mb-4">
                  <div className={`w-16 h-16 bg-gradient-to-r ${stat.color} rounded-full flex items-center justify-center`}>
                    <div className="text-white">
                      {stat.icon}
                    </div>
                  </div>
                </div>
                <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{stat.number}</div>
                <div className="text-gray-600 dark:text-gray-300 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Our Achievements</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {achievements.map((achievement, index) => (
              <div key={index} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 dark:border-gray-700/20 p-6 text-center hover:shadow-xl transition-shadow">
                <div className={`w-16 h-16 bg-gradient-to-r ${achievement.color} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <div className="text-white">
                    {achievement.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{achievement.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{achievement.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-6 py-3 rounded-full border-2 transition-all duration-300 font-medium ${
                selectedCategory === category
                  ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white border-transparent shadow-lg scale-105"
                  : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-105"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Featured Testimonials Carousel */}
        {featuredTestimonials.length > 0 && (
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Featured Testimonials</h2>
            <div className="relative">
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 p-8">
                <div className="text-center">
                  <Quote className="w-12 h-12 text-blue-600 mx-auto mb-6" />
                  <p className="text-xl text-gray-700 dark:text-gray-300 mb-8 italic leading-relaxed">
                    "{featuredTestimonials[currentIndex]?.content}"
                  </p>
                  
                  <div className="flex items-center justify-center mb-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center mr-6">
                      <span className="text-blue-600 dark:text-blue-400 font-bold text-xl">
                        {featuredTestimonials[currentIndex]?.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="text-left">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">{featuredTestimonials[currentIndex]?.name}</h3>
                      <p className="text-blue-600 dark:text-blue-400 font-semibold">{featuredTestimonials[currentIndex]?.role}</p>
                      <p className="text-gray-600 dark:text-gray-300">{featuredTestimonials[currentIndex]?.school}</p>
                      <div className="flex items-center mt-2">
                        <div className="flex space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`w-4 h-4 ${i < (featuredTestimonials[currentIndex]?.rating || 0) ? 'text-yellow-400 fill-current' : 'text-gray-300 dark:text-gray-600'}`} />
                          ))}
                        </div>
                        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{featuredTestimonials[currentIndex]?.rating}/5</span>
                      </div>
                    </div>
                  </div>

                  {/* Video Player Placeholder */}
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-center space-x-4">
                      <button
                        onClick={togglePlay}
                        className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </button>
                      <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full w-1/3"></div>
                      </div>
                      <button className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Achievements */}
                  <div className="flex flex-wrap justify-center gap-2 mb-6">
                    {featuredTestimonials[currentIndex]?.achievements.map((achievement, idx) => (
                      <span key={idx} className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium">
                        {achievement}
                      </span>
                    ))}
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-center space-x-4">
                    <button
                      onClick={prevTestimonial}
                      className="w-10 h-10 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-full flex items-center justify-center hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex space-x-2">
                      {featuredTestimonials.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentIndex(idx)}
                          className={`w-3 h-3 rounded-full transition-colors ${
                            idx === currentIndex ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={nextTestimonial}
                      className="w-10 h-10 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded-full flex items-center justify-center hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Testimonials Grid */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">All Testimonials</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {regularTestimonials.map((testimonial, index) => (
              <div key={index} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 dark:border-gray-700/20 p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-start mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mr-4">
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                      {testimonial.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white">{testimonial.name}</h3>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold text-sm">{testimonial.role}</p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm">{testimonial.school}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed line-clamp-4">
                    "{testimonial.content}"
                  </p>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i < testimonial.rating ? 'text-yellow-400 fill-current' : 'text-gray-300 dark:text-gray-600'}`} />
                    ))}
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{testimonial.rating}/5</span>
                </div>

                <div className="flex flex-wrap gap-1 mb-4">
                  {testimonial.achievements.slice(0, 2).map((achievement, idx) => (
                    <span key={idx} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-xs">
                      {achievement}
                    </span>
                  ))}
                  {testimonial.achievements.length > 2 && (
                    <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-xs">
                      +{testimonial.achievements.length - 2} more
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{testimonial.location}</span>
                  <span>{testimonial.duration}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Join Our Success Story</h2>
          <p className="text-xl mb-6 opacity-90">
            Be part of the next generation of technology leaders in Africa
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-blue-600 px-8 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors">
              Enroll Now
            </button>
            <button className="border-2 border-white text-white px-8 py-3 rounded-full font-semibold hover:bg-white hover:text-blue-600 transition-colors">
              Partner With Us
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 
"use client";
import { useState, useMemo } from "react";
import { ChevronDown, Search, BookOpen, Users, Building2, GraduationCap, Shield, Star, Heart, Zap, Target, Award, Clock, Mail, Phone, MapPin, Globe, CheckCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
  popular?: boolean;
}

const faqs: FAQItem[] = [
  // General Questions
  {
    id: "general-1",
    category: "General",
    question: "What is RILLCOD Academy?",
    answer: "RILLCOD Academy is a leading technology education institution that provides AI-integrated curriculum for students from primary to secondary school levels. We focus on preparing students for the future through comprehensive programming, robotics, and AI education.",
    tags: ["about", "academy", "education"],
    popular: true
  },
  {
    id: "general-2",
    category: "General",
    question: "Where are you located?",
    answer: "RILLCOD Academy is based in Nigeria with multiple partner schools across the country. We also offer online learning programs and can establish partnerships with schools in various locations.",
    tags: ["location", "nigeria", "online"],
    popular: true
  },
  {
    id: "general-3",
    category: "General",
    question: "What makes RILLCOD Academy different from other tech schools?",
    answer: "Our unique approach combines AI-integrated curriculum, project-based learning, industry partnerships, and personalized learning paths. We focus on practical skills, portfolio development, and real-world applications rather than just theory.",
    tags: ["unique", "approach", "ai", "practical"],
    popular: true
  },

  // Programs & Curriculum
  {
    id: "curriculum-1",
    category: "Programs & Curriculum",
    question: "What programming languages do you teach?",
    answer: "Our curriculum covers Scratch (visual programming), Python, HTML/CSS, JavaScript, and specialized courses in web development, robotics programming, and AI applications. We start with visual programming and progress to text-based languages.",
    tags: ["programming", "languages", "python", "scratch", "javascript"],
    popular: true
  },
  {
    id: "curriculum-2",
    category: "Programs & Curriculum",
    question: "How do you ensure smooth transitions between programming languages?",
    answer: "Our curriculum builds on prior concepts with transition periods (e.g., Scratch to Python, Python to JavaScript) using beginner-friendly tools like Thonny IDE. Project-based learning reinforces skills across stages.",
    tags: ["transition", "learning", "curriculum"],
    popular: true
  },
  {
    id: "curriculum-3",
    category: "Programs & Curriculum",
    question: "What age groups do you serve?",
    answer: "We serve students from Primary 1 to Senior Secondary 3 (ages 6-18). Each level is tailored to cognitive and developmental stages, from visual programming for younger students to complex AI projects for seniors.",
    tags: ["age", "levels", "primary", "secondary"],
    popular: true
  },
  {
    id: "curriculum-4",
    category: "Programs & Curriculum",
    question: "Can students specialize within the program?",
    answer: "From SS1, students can focus on UI/UX, web development, or mobile AI while completing core requirements, with significant specialization in SS3.",
    tags: ["specialization", "ui/ux", "web development", "ai"],
    popular: true
  },
  {
    id: "curriculum-5",
    category: "Programs & Curriculum",
    question: "How do you keep the curriculum current?",
    answer: "Partnerships with tech companies ensure regular updates, while core concepts like problem-solving and logic remain timeless. We continuously adapt to industry trends and technological advancements.",
    tags: ["updates", "industry", "trends", "partnerships"],
    popular: true
  },

  // Student Experience
  {
    id: "student-1",
    category: "Student Experience",
    question: "What if students join at different levels?",
    answer: "We conduct skill assessments and offer intensive holiday catch-up programs to ensure students meet portfolio requirements for their level. Our adaptive learning approach accommodates different starting points.",
    tags: ["assessment", "catch-up", "levels", "portfolio"],
    popular: true
  },
  {
    id: "student-2",
    category: "Student Experience",
    question: "Do students receive certificates upon completion?",
    answer: "Yes, students receive certificates for each completed level and specialized courses. SS3 graduates receive a comprehensive portfolio and certification that can be used for university applications and career opportunities.",
    tags: ["certificates", "portfolio", "graduation", "career"],
    popular: true
  },
  {
    id: "student-3",
    category: "Student Experience",
    question: "What support is provided for university and career preparation?",
    answer: "SS3 includes modules on portfolio development, university applications, scholarships, and career planning, with an alumni network for mentorship and internships.",
    tags: ["university", "career", "portfolio", "mentorship"],
    popular: true
  },
  {
    id: "student-4",
    category: "Student Experience",
    question: "How do you handle students with different learning paces?",
    answer: "We use adaptive learning technology and provide personalized support through one-on-one sessions, peer mentoring, and flexible scheduling to accommodate different learning styles and paces.",
    tags: ["learning pace", "personalized", "mentoring", "adaptive"],
    popular: true
  },

  // Partnership & Schools
  {
    id: "partnership-1",
    category: "Partnership & Schools",
    question: "How can my school become a partner?",
    answer: "Schools can become partners by contacting us through our partnership page. We provide comprehensive support including curriculum integration, teacher training, infrastructure setup, and ongoing technical support.",
    tags: ["partnership", "schools", "integration", "training"],
    popular: true
  },
  {
    id: "partnership-2",
    category: "Partnership & Schools",
    question: "What infrastructure is required for partnership?",
    answer: "We work with schools to assess their current infrastructure and provide recommendations. Basic requirements include computer labs, internet access, and dedicated space for robotics activities. We can help with setup and optimization.",
    tags: ["infrastructure", "computer labs", "internet", "setup"],
    popular: true
  },
  {
    id: "partnership-3",
    category: "Partnership & Schools",
    question: "Do you provide teacher training?",
    answer: "Yes, we provide comprehensive teacher training programs including initial training, ongoing professional development, and access to our teaching resources and support network.",
    tags: ["teacher training", "professional development", "resources"],
    popular: true
  },
  {
    id: "partnership-4",
    category: "Partnership & Schools",
    question: "What are the costs involved in partnership?",
    answer: "Partnership costs vary based on school size, infrastructure needs, and program scope. We offer flexible pricing models and can work with schools to find solutions that fit their budget. Contact us for a detailed proposal.",
    tags: ["costs", "pricing", "budget", "proposal"],
    popular: true
  },

  // Technology & AI
  {
    id: "tech-1",
    category: "Technology & AI",
    question: "How do you integrate AI into the curriculum?",
    answer: "AI is integrated throughout our curriculum, from basic AI concepts in early levels to advanced AI projects in senior years. Students learn about machine learning, neural networks, and practical AI applications.",
    tags: ["ai", "machine learning", "neural networks", "integration"],
    popular: true
  },
  {
    id: "tech-2",
    category: "Technology & AI",
    question: "What hardware and software do you use?",
    answer: "We use a mix of industry-standard and educational tools including Python, Scratch, Arduino for robotics, and various AI platforms. We provide recommendations for optimal hardware configurations.",
    tags: ["hardware", "software", "tools", "arduino"],
    popular: true
  },
  {
    id: "tech-3",
    category: "Technology & AI",
    question: "Do students work on real-world projects?",
    answer: "Yes, students work on real-world projects throughout their learning journey. These include web applications, mobile apps, robotics projects, and AI solutions that solve actual problems.",
    tags: ["projects", "real-world", "applications", "problem-solving"],
    popular: true
  },

  // Support & Contact
  {
    id: "support-1",
    category: "Support & Contact",
    question: "How can I contact RILLCOD Academy?",
    answer: "You can contact us through our website contact form, email, phone, or by visiting our office. We also offer virtual consultations for interested schools and parents.",
    tags: ["contact", "email", "phone", "consultation"],
    popular: true
  },
  {
    id: "support-2",
    category: "Support & Contact",
    question: "Do you offer technical support?",
    answer: "Yes, we provide comprehensive technical support including troubleshooting, software installation, hardware setup, and ongoing maintenance for partner schools.",
    tags: ["technical support", "troubleshooting", "maintenance"],
    popular: true
  },
  {
    id: "support-3",
    category: "Support & Contact",
    question: "What are your operating hours?",
    answer: "Our office hours are Monday to Friday, 8:00 AM to 6:00 PM. We also offer emergency support for critical technical issues outside regular hours.",
    tags: ["hours", "schedule", "emergency", "support"],
    popular: true
  }
];

const categories = [
  { id: "all", name: "All Questions", icon: Star, count: faqs.length },
  { id: "General", name: "General", icon: Heart, count: faqs.filter(f => f.category === "General").length },
  { id: "Programs & Curriculum", name: "Programs & Curriculum", icon: BookOpen, count: faqs.filter(f => f.category === "Programs & Curriculum").length },
  { id: "Student Experience", name: "Student Experience", icon: Users, count: faqs.filter(f => f.category === "Student Experience").length },
  { id: "Partnership & Schools", name: "Partnership & Schools", icon: Building2, count: faqs.filter(f => f.category === "Partnership & Schools").length },
  { id: "Technology & AI", name: "Technology & AI", icon: Zap, count: faqs.filter(f => f.category === "Technology & AI").length },
  { id: "Support & Contact", name: "Support & Contact", icon: Shield, count: faqs.filter(f => f.category === "Support & Contact").length }
];

export default function FAQ() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredFAQs = useMemo(() => {
    let filtered = faqs;
    
    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(faq => faq.category === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(faq => 
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query) ||
        faq.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [searchQuery, selectedCategory]);

  const toggleItem = (id: string) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id);
    } else {
      newOpenItems.add(id);
    }
    setOpenItems(newOpenItems);
  };

  const popularFAQs = faqs.filter(faq => faq.popular);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="relative mx-auto w-24 h-24 mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-full animate-pulse"></div>
            <div className="absolute inset-3 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
              <Star className="w-12 h-12 text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-6">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Find answers to common questions about our AI-integrated curriculum, partnership opportunities, and student programs.
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-12">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search questions, topics, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    selectedCategory === category.id
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:shadow-md'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{category.name}</span>
                  <span className="bg-white/20 dark:bg-gray-700/50 px-2 py-1 rounded-full text-xs">
                    {category.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Popular Questions */}
        {selectedCategory === "all" && searchQuery === "" && (
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">Popular Questions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {popularFAQs.slice(0, 6).map((faq) => (
                <div key={faq.id} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-border dark:border-gray-700/20 p-6 hover:shadow-xl transition-all duration-300">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Star className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">{faq.question}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">{faq.answer}</p>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {faq.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-xs rounded-full">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAQ List */}
        <div className="space-y-6">
          {filteredFAQs.length > 0 ? (
            filteredFAQs.map((faq) => (
              <div key={faq.id} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg border border-border dark:border-gray-700/20 overflow-hidden">
                <button
                  className="flex items-center justify-between w-full p-6 text-left hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleItem(faq.id)}
                >
                  <div className="flex items-start space-x-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      faq.popular 
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500' 
                        : 'bg-gradient-to-r from-blue-500 to-purple-500'
                    }`}>
                      {faq.popular ? (
                        <Star className="w-4 h-4 text-white" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{faq.question}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">{faq.category}</span>
                        {faq.popular && (
                          <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">Popular</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronDown className={`w-6 h-6 text-gray-400 dark:text-gray-500 transition-transform ${openItems.has(faq.id) ? 'rotate-180' : ''}`} />
                </button>
                
                {openItems.has(faq.id) && (
                  <div className="px-6 pb-6 border-t border-gray-100 dark:border-gray-700">
                    <div className="pt-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                      {faq.answer}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {faq.tags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-sm rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No questions found</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">Try adjusting your search or category filter</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>

        {/* Contact Section */}
        <div className="mt-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Still Have Questions?</h2>
            <p className="text-xl opacity-90">We're here to help! Contact us for personalized assistance.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Email Us</h3>
              <p className="opacity-90">support@rillcod.com</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Call Us</h3>
              <p className="opacity-90">+234 811 660 0091</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Visit Us</h3>
              <p className="opacity-90">Lagos, Nigeria</p>
            </div>
          </div>
          
          <div className="text-center mt-8">
            <Link href="/contact" className="inline-flex items-center px-8 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              Contact Us Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 
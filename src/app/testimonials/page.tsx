"use client";
import { useState } from "react";
import { Star, Quote, ArrowLeft, ArrowRight, Users, Award, BookOpen, Code, Sparkles, Heart, Zap, Target, CheckCircle, Play, Pause, Volume2, VolumeX, Clock } from "lucide-react";
import Link from "next/link";

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

  return (
    <div className="min-h-screen bg-[#121212] text-white relative overflow-hidden selection:bg-orange-500 selection:text-white">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-orange-600/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        {/* Header */}
        <div className="text-center mb-24 bg-[#1a1a1a] border border-white/10 p-16 rounded-none shadow-2xl border-t-8 border-t-orange-500 relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none"></div>
          <div className="flex justify-center mb-10">
            <Quote className="w-16 h-16 text-orange-500 opacity-20" />
          </div>
          <h1 className="text-4xl md:text-6xl font-black mb-8 uppercase tracking-tight italic">
            Institutional <span className="text-orange-500">Validation.</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto font-medium italic border-l-2 border-orange-500 pl-8 inline-block text-left">
            Real-world impact assessments from our network of students, parents, and premier educational infrastructure partners.
          </p>
          <div className="w-24 h-1 bg-orange-500 mx-auto mt-12"></div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/5 border border-white/10 mb-24">
          {stats.map((stat, i) => (
            <div key={i} className="bg-[#1a1a1a] p-12 text-center group hover:bg-white/[0.02] transition-colors">
              <div className="text-orange-500 mb-6 flex justify-center group-hover:scale-110 transition-transform">
                {stat.icon}
              </div>
              <div className="text-4xl font-black mb-2 tracking-tighter">{stat.number}</div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Featured Section */}
        {featuredTestimonials.length > 0 && (
          <div className="mb-32 relative">
             <div className="flex items-center justify-between mb-12">
                <h2 className="text-2xl font-black uppercase italic tracking-tight flex items-center gap-4">
                  <Sparkles className="w-6 h-6 text-orange-500" />
                  Primary Validators
                </h2>
                <div className="flex gap-2">
                   <button onClick={prevTestimonial} className="p-4 bg-white/5 border border-white/10 hover:border-orange-500 text-white transition-all rounded-none">
                      <ArrowLeft className="w-5 h-5" />
                   </button>
                   <button onClick={nextTestimonial} className="p-4 bg-white/5 border border-white/10 hover:border-orange-500 text-white transition-all rounded-none">
                      <ArrowRight className="w-5 h-5" />
                   </button>
                </div>
             </div>

             <div className="bg-[#1a1a1a] border border-white/10 p-12 lg:p-20 rounded-none shadow-2xl relative border-l-8 border-l-purple-500 overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 blur-[120px] pointer-events-none" />
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
                   <div className="lg:col-span-7 space-y-10">
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="w-5 h-5 text-orange-500 fill-current" />
                        ))}
                      </div>
                      
                      <p className="text-2xl md:text-4xl font-black text-white italic leading-tight uppercase tracking-tight">
                        "{featuredTestimonials[currentIndex]?.content}"
                      </p>

                      <div className="flex flex-wrap gap-3">
                         {featuredTestimonials[currentIndex]?.achievements.map((a, i) => (
                            <span key={i} className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-[10px] font-black uppercase tracking-widest text-purple-400">
                               {a}
                            </span>
                         ))}
                      </div>
                   </div>

                   <div className="lg:col-span-5 bg-[#121212] border border-white/5 p-10 rounded-none relative">
                      <div className="flex items-center gap-6 mb-8">
                         <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-none flex items-center justify-center text-orange-500 font-black text-2xl rotate-3">
                            {featuredTestimonials[currentIndex]?.name.split(' ').map(n => n[0]).join('')}
                         </div>
                         <div>
                            <h3 className="text-xl font-black uppercase italic text-white tracking-tighter">{featuredTestimonials[currentIndex]?.name}</h3>
                            <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em]">{featuredTestimonials[currentIndex]?.role}</p>
                         </div>
                      </div>
                      
                      <div className="space-y-4">
                         <div className="flex items-center gap-3 text-slate-500">
                            <BookOpen className="w-4 h-4 text-purple-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest">{featuredTestimonials[currentIndex]?.program}</span>
                         </div>
                         <div className="flex items-center gap-3 text-slate-500">
                            <Clock className="w-4 h-4 text-purple-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Protocol Duration: {featuredTestimonials[currentIndex]?.duration}</span>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex flex-wrap justify-center gap-px mb-20 bg-white/5 border border-white/10 p-1 p-px">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-10 py-5 text-[10px] font-black uppercase tracking-[0.4em] transition-all rounded-none ${
                selectedCategory === cat
                  ? "bg-orange-500 text-white shadow-xl shadow-orange-500/20"
                  : "bg-[#1a1a1a] text-slate-500 hover:text-white hover:bg-black/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-32">
          {regularTestimonials.map((t, i) => (
            <div key={i} className="bg-[#1a1a1a] border border-white/10 p-10 rounded-none hover:border-orange-500 transition-all group flex flex-col relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-[50px] pointer-events-none" />
               <div className="flex items-center justify-between mb-8">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < t.rating ? 'text-orange-500 fill-current' : 'text-slate-800'}`} />
                    ))}
                  </div>
                  <Quote className="w-6 h-6 text-orange-500 opacity-10" />
               </div>

               <p className="text-sm font-bold text-slate-300 italic mb-10 leading-relaxed flex-1">
                  "{t.content}"
               </p>

               <div className="pt-8 border-t border-white/5 mt-auto">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-[#121212] border border-white/5 text-orange-500 flex items-center justify-center font-black text-xs rounded-none group-hover:border-orange-500/50 transition-colors">
                       {t.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                       <h4 className="text-xs font-black uppercase tracking-tight text-white mb-1 italic">{t.name}</h4>
                       <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{t.role}</p>
                    </div>
                  </div>
               </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="bg-[#1a1a1a] border border-white/10 p-16 rounded-none text-center relative overflow-hidden border-t-8 border-t-orange-500 shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-orange-500/[0.02] pointer-events-none" />
          <h2 className="text-3xl font-black mb-8 uppercase italic tracking-tight leading-none">
            Ready to Initialize <br />
            <span className="text-orange-500">Your Technological Ascension?</span>
          </h2>
          <div className="flex flex-col sm:flex-row gap-6 justify-center mt-12">
            <Link href="/student-registration" className="px-12 py-6 bg-orange-500 text-white text-[10px] font-black uppercase tracking-[0.5em] rounded-none shadow-xl shadow-orange-500/20 hover:bg-orange-600 transition-all">
              Initiate Enrollment
            </Link>
            <Link href="/contact" className="px-12 py-6 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.5em] rounded-none hover:bg-white/10 transition-all">
              Request Deployment Demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

 
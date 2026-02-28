import {
  AcademicCapIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ComputerDesktopIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  SparklesIcon,
  ChartBarIcon,
  CpuChipIcon,
  PaintBrushIcon,
  StarIcon,
  UsersIcon,
  TrophyIcon
} from '@heroicons/react/24/outline'
import { UserRole } from '@/types'

// Stats data for homepage and analytics
export const stats = [
  {
    number: 5000,
    suffix: '+',
    label: 'Students Trained',
    icon: UsersIcon,
    color: 'text-blue-600'
  },
  {
    number: 50,
    suffix: '+',
    label: 'Partner Schools',
    icon: BuildingOfficeIcon,
    color: 'text-green-600'
  },
  {
    number: 95,
    suffix: '%',
    label: 'Success Rate',
    icon: TrophyIcon,
    color: 'text-yellow-600'
  },
  {
    number: 100,
    suffix: '+',
    label: 'Projects Completed',
    icon: CodeBracketIcon,
    color: 'text-purple-600'
  }
]

// User roles for portal access
export const roles: { role: UserRole; title: string; description: string; icon: any; href: string; color: string }[] = [
  {
    role: 'admin',
    title: 'Administrator Portal',
    description: 'Manage academy operations, schools, teachers, and curriculum',
    icon: AcademicCapIcon,
    href: '/admin/login',
    color: 'bg-blue-600 hover:bg-blue-700'
  },
  {
    role: 'teacher',
    title: 'Teacher Portal',
    description: 'Access lesson plans, student progress, and teaching resources',
    icon: UserGroupIcon,
    href: '/teacher/login',
    color: 'bg-green-600 hover:bg-green-700'
  },
  {
    role: 'student',
    title: 'Student Portal',
    description: 'Access courses, lessons, and track your learning progress',
    icon: ComputerDesktopIcon,
    href: '/student/login',
    color: 'bg-purple-600 hover:bg-purple-700'
  }
  // {
  //   role: 'school_partner',
  //   title: 'School Partner Portal',
  //   description: 'Monitor school performance and student achievements',
  //   icon: BuildingOfficeIcon,
  //   href: '/partner/login',
  //   color: 'bg-orange-600 hover:bg-orange-700'
  // }
]

// Partner schools data
export const partnerSchools = [
  {
    name: 'Lagos State Model College',
    location: 'Lagos, Nigeria',
    students: 450,
    partnership: 'Premium',
    image: '/images/schools/lagos-model.jpg',
    description: 'Leading public school with focus on STEM education'
  },
  {
    name: 'Abuja International School',
    location: 'Abuja, Nigeria',
    students: 320,
    partnership: 'Enterprise',
    image: '/images/schools/abuja-international.jpg',
    description: 'International curriculum with technology integration'
  },
  {
    name: 'Port Harcourt Academy',
    location: 'Port Harcourt, Nigeria',
    students: 280,
    partnership: 'Basic',
    image: '/images/schools/port-harcourt.jpg',
    description: 'Community-focused education with modern facilities'
  },
  {
    name: 'Kano Science College',
    location: 'Kano, Nigeria',
    students: 380,
    partnership: 'Premium',
    image: '/images/schools/kano-science.jpg',
    description: 'Science and technology excellence center'
  },
  {
    name: 'Ibadan Grammar School',
    location: 'Ibadan, Nigeria',
    students: 420,
    partnership: 'Basic',
    image: '/images/schools/ibadan-grammar.jpg',
    description: 'Traditional excellence meets modern technology'
  },
  {
    name: 'Enugu State College',
    location: 'Enugu, Nigeria',
    students: 350,
    partnership: 'Enterprise',
    image: '/images/schools/enugu-state.jpg',
    description: 'Innovative learning environment with digital focus'
  }
]

// Programs data
export const programs = [
  {
    id: 'ict-fundamentals',
    iconName: 'ComputerDesktopIcon',
    title: "ICT Fundamentals",
    description: "Master the basics of Information and Communication Technology! Learn essential computer skills, digital literacy, and internet safety in a fun, interactive environment.",
    detailedDescription: "This foundational course introduces students to the world of computers and digital technology. Students will learn about computer hardware, software, operating systems, and basic troubleshooting. The course emphasizes digital citizenship, online safety, and responsible use of technology.",
    color: "from-blue-400 to-blue-600",
    features: [
      "Computer Hardware & Software Basics",
      "Operating System Navigation",
      "File Management & Organization",
      "Internet Safety & Digital Citizenship",
      "Basic Troubleshooting",
      "Email & Communication Tools",
      "Word Processing & Spreadsheets",
      "Online Research Skills"
    ],
    learningOutcomes: [
      "Understand computer components and their functions",
      "Navigate operating systems confidently",
      "Organize and manage digital files effectively",
      "Practice safe and responsible internet use",
      "Use productivity tools for basic tasks",
      "Develop digital literacy skills"
    ],
    prerequisites: "No prior experience required",
    projects: [
      "Create a digital portfolio",
      "Design a computer parts presentation",
      "Develop internet safety guidelines",
      "Build a file organization system"
    ],
    duration: "8 weeks",
    level: "Beginner",
    ageGroup: "8-12 years",
    classSize: "Maximum 12 students",
    schedule: "2 sessions per week, 1.5 hours each",
    price: "₦25,000",
    certification: "ICT Fundamentals Certificate",
    tools: ["Windows/Mac OS", "Microsoft Office", "Internet Browser", "File Explorer"]
  },
  {
    id: 'scratch-programming',
    iconName: 'CodeBracketIcon',
    title: "Scratch Programming",
    description: "Unleash your creativity with visual programming! Create amazing games, animations, and interactive stories using MIT's Scratch platform.",
    detailedDescription: "Scratch is the perfect introduction to programming for young minds. Using colorful blocks and intuitive drag-and-drop interface, students learn programming concepts while creating their own games, animations, and interactive stories. This course builds logical thinking, problem-solving skills, and computational creativity.",
    color: "from-orange-400 to-orange-600",
    features: [
      "Visual Programming Concepts",
      "Game Design & Development",
      "Animation & Storytelling",
      "Interactive Projects",
      "Problem-Solving Logic",
      "Creative Expression",
      "Collaborative Learning",
      "Project-Based Learning"
    ],
    learningOutcomes: [
      "Understand basic programming concepts",
      "Create interactive games and animations",
      "Develop logical thinking skills",
      "Express creativity through code",
      "Collaborate on programming projects",
      "Present and share digital creations"
    ],
    prerequisites: "Basic computer skills (ICT Fundamentals recommended)",
    projects: [
      "Create a platformer game",
      "Design an animated story",
      "Build an interactive quiz",
      "Develop a music visualizer"
    ],
    duration: "10 weeks",
    level: "Beginner",
    ageGroup: "9-14 years",
    classSize: "Maximum 12 students",
    schedule: "2 sessions per week, 1.5 hours each",
    price: "₦30,000",
    certification: "Scratch Programming Certificate",
    tools: ["MIT Scratch", "Online Collaboration Tools", "Project Sharing Platform"]
  },
  {
    id: 'python-programming',
    iconName: 'Python',
    title: "Python Programming",
    description: "Dive into the world of text-based programming with Python! Learn the language that powers YouTube, Instagram, and countless other applications.",
    detailedDescription: "Python is one of the most popular and beginner-friendly programming languages. Students will learn real programming concepts, syntax, and problem-solving techniques. From simple scripts to complex applications, this course provides a solid foundation for future programming endeavors.",
    color: "from-green-400 to-green-600",
    features: [
      "Python Syntax & Fundamentals",
      "Variables & Data Types",
      "Control Structures & Loops",
      "Functions & Modules",
      "File Handling",
      "Error Handling",
      "Object-Oriented Programming",
      "Real-World Applications"
    ],
    learningOutcomes: [
      "Write clean, readable Python code",
      "Understand programming fundamentals",
      "Solve problems using algorithms",
      "Work with different data types",
      "Create reusable functions",
      "Build complete applications"
    ],
    prerequisites: "Scratch Programming or basic programming concepts",
    projects: [
      "Calculator application",
      "Number guessing game",
      "File management system",
      "Web scraper for data collection",
      "Simple chatbot",
      "Weather app using APIs"
    ],
    duration: "12 weeks",
    level: "Intermediate",
    ageGroup: "12-16 years",
    classSize: "Maximum 10 students",
    schedule: "2 sessions per week, 2 hours each",
    price: "₦40,000",
    certification: "Python Programming Certificate",
    tools: ["Python 3.x", "PyCharm/VS Code", "Jupyter Notebooks", "Git for version control"]
  },
  {
    id: 'web-development',
    iconName: 'GlobeAltIcon',
    title: "Web Development",
    description: "Build the future of the internet! Create beautiful, responsive websites using HTML, CSS, and JavaScript.",
    detailedDescription: "Web development is the art of creating websites that are both beautiful and functional. Students will learn front-end technologies to build responsive, interactive websites. From basic HTML structure to advanced CSS styling and JavaScript functionality, this course covers everything needed to create modern web applications.",
    color: "from-purple-400 to-purple-600",
    features: [
      "HTML5 Structure & Semantics",
      "CSS3 Styling & Layouts",
      "Responsive Design",
      "JavaScript Fundamentals",
      "DOM Manipulation",
      "Web APIs & Fetch",
      "Modern CSS Frameworks",
      "Web Performance & SEO"
    ],
    learningOutcomes: [
      "Create semantic HTML structure",
      "Style websites with CSS",
      "Build responsive layouts",
      "Add interactivity with JavaScript",
      "Optimize for performance",
      "Deploy websites online"
    ],
    prerequisites: "Python Programming or strong programming fundamentals",
    projects: [
      "Personal portfolio website",
      "E-commerce product page",
      "Interactive dashboard",
      "Weather application",
      "Todo list application",
      "Blog website with CMS"
    ],
    duration: "14 weeks",
    level: "Intermediate",
    ageGroup: "13-17 years",
    classSize: "Maximum 10 students",
    schedule: "2 sessions per week, 2 hours each",
    price: "₦45,000",
    certification: "Web Development Certificate",
    tools: ["VS Code", "GitHub", "Netlify/Vercel", "Chrome DevTools", "Figma for design"]
  },
  {
    id: 'ui-ux-design',
    iconName: 'PaintBrushIcon',
    title: "UI/UX Design",
    description: "Design experiences that users love! Learn the principles of user interface and user experience design.",
    detailedDescription: "UI/UX design is about creating digital experiences that are both beautiful and functional. Students will learn design principles, user research, wireframing, prototyping, and user testing. This course combines creativity with analytical thinking to solve real design problems.",
    color: "from-pink-400 to-pink-600",
    features: [
      "Design Principles & Theory",
      "User Research & Personas",
      "Wireframing & Prototyping",
      "Visual Design & Typography",
      "Color Theory & Psychology",
      "User Testing & Feedback",
      "Design Systems",
      "Industry Tools & Workflows"
    ],
    learningOutcomes: [
      "Apply design principles effectively",
      "Conduct user research",
      "Create wireframes and prototypes",
      "Design user-friendly interfaces",
      "Test and iterate designs",
      "Present design solutions"
    ],
    prerequisites: "Basic computer skills and creativity",
    projects: [
      "Mobile app redesign",
      "Website user experience audit",
      "Design system creation",
      "User research report",
      "Interactive prototype",
      "Design portfolio"
    ],
    duration: "10 weeks",
    level: "Intermediate",
    ageGroup: "12-16 years",
    classSize: "Maximum 8 students",
    schedule: "2 sessions per week, 2 hours each",
    price: "₦35,000",
    certification: "UI/UX Design Certificate",
    tools: ["Figma", "Adobe XD", "Sketch", "InVision", "Miro for collaboration"]
  },
  {
    id: 'flutter-development',
    iconName: 'CpuChipIcon',
    title: "Flutter Development",
    description: "Build apps for everyone! Create beautiful, fast mobile applications that work on both iOS and Android.",
    detailedDescription: "Flutter is Google's framework for building natively compiled applications for mobile, web, and desktop from a single codebase. Students will learn to create professional mobile apps with beautiful UIs, smooth animations, and powerful functionality. This advanced course prepares students for real-world app development.",
    color: "from-cyan-400 to-cyan-600",
    features: [
      "Flutter Framework Fundamentals",
      "Dart Programming Language",
      "Widget-Based UI Development",
      "State Management",
      "Navigation & Routing",
      "API Integration",
      "Database Integration",
      "App Deployment & Publishing"
    ],
    learningOutcomes: [
      "Build cross-platform mobile apps",
      "Master Dart programming language",
      "Create responsive user interfaces",
      "Implement state management",
      "Integrate external APIs",
      "Deploy apps to app stores"
    ],
    prerequisites: "Web Development or strong programming background",
    projects: [
      "Todo list app with local storage",
      "Weather app with API integration",
      "Social media clone",
      "E-commerce mobile app",
      "Fitness tracking app",
      "News aggregator app"
    ],
    duration: "16 weeks",
    level: "Advanced",
    ageGroup: "14-18 years",
    classSize: "Maximum 8 students",
    schedule: "2 sessions per week, 2.5 hours each",
    price: "₦60,000",
    certification: "Flutter Development Certificate",
    tools: ["Flutter SDK", "Android Studio", "VS Code", "Firebase", "Git for version control"]
  }
]

// Benefits data
export const benefits = [
  {
    iconName: 'AcademicCapIcon',
    title: "Expert Instructors",
    description: "Learn from certified professionals with years of teaching experience"
  },
  {
    iconName: 'UserGroupIcon',
    title: "Small Class Sizes",
    description: "Personalized attention with maximum 15 students per class"
  },
  {
    iconName: 'TrophyIcon',
    title: "Certification",
    description: "Earn recognized certificates upon completion of each program"
  },
  {
    iconName: 'ChartBarIcon',
    title: "Progress Tracking",
    description: "Monitor your child's learning progress with detailed analytics"
  }
]

// Testimonials data
export const testimonials = [
  {
    name: "Mrs. Chioma Okonkwo",
    role: "Parent",
    content: "My daughter loves the Scratch programming class! She's created amazing games and animations. The teachers at Rillcod Academy are so patient and encouraging.",
    rating: 5,
    image: "/images/testimonials/chioma.jpg"
  },
  {
    name: "Master Daniel Eze",
    role: "Student",
    content: "The Python course is awesome! I've built my first web scraper and it's working perfectly. I never thought coding could be this fun!",
    rating: 5,
    image: "/images/testimonials/daniel.jpg"
  },
  {
    name: "Mrs. Grace Ogbebor",
    role: "Principal, St. Maria Goretti College, Benin City",
    content: "Rillcod Academy has transformed our students' approach to technology. The partnership has significantly improved our students' digital literacy and problem-solving skills.",
    rating: 5,
    image: "/images/testimonials/grace.jpg"
  },
  {
    name: "Mr. Osaro Igbinedion",
    role: "Parent",
    content: "The progress tracking feature is fantastic. I can see exactly how my son is improving in his coding skills. The investment in his future is worth every kobo.",
    rating: 5,
    image: "/images/testimonials/osaro.jpg"
  },
  {
    name: "Miss Blessing Aigbe",
    role: "Student",
    content: "I never thought I could code, but the teachers here make it so easy and fun! Now I'm building my own websites and apps.",
    rating: 5,
    image: "/images/testimonials/blessing.jpg"
  },
  {
    name: "Mrs. Patience Ehiagwina",
    role: "Vice Principal, Edo College, Benin City",
    content: "The partnership with Rillcod Academy has significantly improved our students' tech skills. Our students are now more confident with technology.",
    rating: 5,
    image: "/images/testimonials/patience.jpg"
  },
  {
    name: "Mr. Emmanuel Omoregie",
    role: "Parent",
    content: "My children have been attending Rillcod Academy for 6 months now. Their logical thinking and creativity have improved tremendously. Highly recommended!",
    rating: 5,
    image: "/images/testimonials/emmanuel.jpg"
  },
  {
    name: "Miss Joy Osagie",
    role: "Student",
    content: "The robotics class is my favorite! I've learned to build and program robots. The teachers are amazing and always encourage us to think outside the box.",
    rating: 5,
    image: "/images/testimonials/joy.jpg"
  }
]

// Team members data
export const teamMembers = [
  {
    name: "Dr. Osaro Igbinedion",
    role: "Founder & CEO",
    bio: "Former Google engineer with 15+ years in tech education. Passionate about bringing world-class technology education to Nigerian children.",
    image: "/images/team/osaro.jpg",
    social: {
      linkedin: "https://linkedin.com/in/osaroigbinedion",
      twitter: "https://twitter.com/osaroigbinedion",
      email: "osaro@rillcod.com"
    }
  },
  {
    name: "Mrs. Chioma Okonkwo",
    role: "Head of Curriculum",
    bio: "Education specialist with expertise in STEM curriculum development. Former teacher at Federal Government College, Benin City.",
    image: "/images/team/chioma.jpg",
    social: {
      linkedin: "https://linkedin.com/in/chiomaokonkwo",
      twitter: "https://twitter.com/chiomaokonkwo",
      email: "chioma@rillcod.com"
    }
  },
  {
    name: "Mr. Daniel Eze",
    role: "Lead Instructor",
    bio: "Certified teacher with passion for making coding accessible to kids. Specializes in Python and web development for young learners.",
    image: "/images/team/daniel.jpg",
    social: {
      linkedin: "https://linkedin.com/in/danieleze",
      twitter: "https://twitter.com/danieleze",
      email: "daniel@rillcod.com"
    }
  },
  {
    name: "Miss Blessing Aigbe",
    role: "Technology Director",
    bio: "Full-stack developer focused on educational technology solutions. Graduate of University of Benin with expertise in EdTech platforms.",
    image: "/images/team/blessing.jpg",
    social: {
      linkedin: "https://linkedin.com/in/blessingaigbe",
      twitter: "https://twitter.com/blessingaigbe",
      email: "blessing@rillcod.com"
    }
  },
  {
    name: "Mr. Emmanuel Omoregie",
    role: "Robotics Instructor",
    bio: "Mechanical engineer with 8+ years experience in robotics education. Passionate about inspiring the next generation of Nigerian innovators.",
    image: "/images/team/emmanuel.jpg",
    social: {
      linkedin: "https://linkedin.com/in/emmanuelomoregie",
      twitter: "https://twitter.com/emmanuelomoregie",
      email: "emmanuel@rillcod.com"
    }
  },
  {
    name: "Mrs. Grace Ogbebor",
    role: "Partnership Manager",
    bio: "Former school principal with extensive experience in educational partnerships. Dedicated to expanding Rillcod Academy's reach across Nigeria.",
    image: "/images/team/grace.jpg",
    social: {
      linkedin: "https://linkedin.com/in/graceogbebor",
      twitter: "https://twitter.com/graceogbebor",
      email: "grace@rillcod.com"
    }
  }
]

// Events data
export const events = [
  {
    id: 1,
    title: "Coding Bootcamp for Kids",
    date: "2024-03-15",
    time: "10:00 AM",
    location: "Rillcod Academy Center, GRA, Benin City",
    description: "A fun-filled weekend where kids learn to code through games and projects. Perfect for beginners aged 8-16.",
    image: "/images/events/bootcamp.jpg",
    category: "Workshop",
    price: "₦25,000",
    spots: 20,
    registered: 15
  },
  {
    id: 2,
    title: "Parent-Teacher Tech Conference",
    date: "2024-03-22",
    time: "2:00 PM",
    location: "Edo College Hall, Benin City",
    description: "Learn about the latest trends in educational technology and how to support your child's learning journey",
    image: "/images/events/conference.jpg",
    category: "Conference",
    price: "Free",
    spots: 100,
    registered: 45
  },
  {
    id: 3,
    title: "Student Project Showcase",
    date: "2024-04-05",
    time: "11:00 AM",
    location: "St. Maria Goretti College, Benin City",
    description: "Students present their amazing projects to parents and the community. See what our young innovators have created!",
    image: "/images/events/showcase.jpg",
    category: "Showcase",
    price: "Free",
    spots: 50,
    registered: 30
  },
  {
    id: 4,
    title: "Robotics Workshop",
    date: "2024-04-12",
    time: "9:00 AM",
    location: "Federal Government College, Benin City",
    description: "Hands-on robotics workshop where students build and program their own robots using Arduino and sensors",
    image: "/images/events/robotics.jpg",
    category: "Workshop",
    price: "₦35,000",
    spots: 15,
    registered: 12
  },
  {
    id: 5,
    title: "Web Development Camp",
    date: "2024-04-19",
    time: "10:00 AM",
    location: "Rillcod Academy Center, Ring Road, Benin City",
    description: "Advanced web development camp for students who want to create professional websites and web applications",
    image: "/images/events/webdev.jpg",
    category: "Camp",
    price: "₦40,000",
    spots: 12,
    registered: 8
  }
]

// Blog posts data
export const blogPosts = [
  {
    id: 1,
    title: "Why Every Nigerian Child Should Learn to Code",
    excerpt: "Discover the benefits of early programming education and how it shapes future success in Nigeria's growing tech industry",
    content: "Coding is not just about creating software...",
    author: "Dr. Osaro Igbinedion",
    date: "2024-02-15",
    category: "Education",
    tags: ["coding", "education", "children", "Nigeria"],
    image: "/images/blog/coding-benefits.jpg",
    readTime: "5 min read"
  },
  {
    id: 2,
    title: "The Future of STEM Education in Benin City",
    excerpt: "Exploring how technology is transforming education across schools in Edo State and beyond",
    content: "As we move towards a digital future...",
    author: "Mrs. Chioma Okonkwo",
    date: "2024-02-10",
    category: "Technology",
    tags: ["STEM", "Benin City", "Edo State", "education"],
    image: "/images/blog/stem-future.jpg",
    readTime: "7 min read"
  },
  {
    id: 3,
    title: "Building Confidence Through Project-Based Learning",
    excerpt: "How hands-on projects help Nigerian students develop problem-solving skills and confidence",
    content: "Project-based learning is more than just...",
    author: "Mr. Daniel Eze",
    date: "2024-02-05",
    category: "Teaching",
    tags: ["projects", "learning", "confidence", "Nigeria"],
    image: "/images/blog/project-learning.jpg",
    readTime: "6 min read"
  },
  {
    id: 4,
    title: "Success Stories: From Benin City to Silicon Valley",
    excerpt: "Meet Nigerian students who started their tech journey at Rillcod Academy and are now making waves globally",
    content: "Our students are proving that talent knows no boundaries...",
    author: "Miss Blessing Aigbe",
    date: "2024-01-28",
    category: "Success Stories",
    tags: ["success", "students", "global", "inspiration"],
    image: "/images/blog/success-stories.jpg",
    readTime: "8 min read"
  },
  {
    id: 5,
    title: "Robotics Education: Preparing Nigeria's Future Innovators",
    excerpt: "How robotics education is preparing Nigerian children for the Fourth Industrial Revolution",
    content: "The world is rapidly changing, and robotics is at the forefront...",
    author: "Mr. Emmanuel Omoregie",
    date: "2024-01-20",
    category: "Robotics",
    tags: ["robotics", "innovation", "future", "technology"],
    image: "/images/blog/robotics-education.jpg",
    readTime: "6 min read"
  }
]

// FAQ data
export const faqs = [
  {
    question: "What age groups do you teach?",
    answer: "We offer programs for children aged 8-18 years, with age-appropriate curriculum for each group."
  },
  {
    question: "Do you provide certificates upon completion?",
    answer: "Yes, all students receive a certificate upon successful completion of each program."
  },
  {
    question: "What equipment do students need?",
    answer: "Students need a laptop or computer with internet access. We provide all necessary software and learning materials."
  },
  {
    question: "How long are the programs?",
    answer: "Programs range from 8-16 weeks depending on the course level and complexity."
  },
  {
    question: "Do you offer online classes?",
    answer: "Yes, we offer both in-person and online classes to accommodate different learning preferences."
  },
  {
    question: "What if my child has no prior coding experience?",
    answer: "No problem! Our programs are designed for beginners and we start from the very basics."
  }
] 
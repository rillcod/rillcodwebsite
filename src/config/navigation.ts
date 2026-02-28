import { 
  Home,
  Users,
  BookOpen,
  BarChart3,
  BuildingIcon,
  GraduationCap,
  Users as UsersIcon,
  ClipboardList,
  Plus,
  X,
  Shield,
  UserCheck,
  School,
  Handshake,
  Phone,
  Info,
  Star,
  MessageSquare,
} from 'lucide-react';

// Navigation items for main nav
export const mainNavItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/about', label: 'About', icon: Info },
];

// Education related nav items
export const educationItems = [
  { href: '/programs', label: 'Programs', icon: BookOpen },
  { href: '/curriculum', label: 'Curriculum', icon: GraduationCap },
  { href: '/testimonials', label: 'Testimonials', icon: Star },
];

// Programs dropdown items
export const programsDropdown = [
  { href: '/programs/ict-fundamentals', label: 'ICT Fundamentals', icon: '💻', description: 'Computer basics and digital literacy' },
  { href: '/programs/scratch', label: 'Scratch Programming', icon: '🎮', description: 'Visual programming for beginners' },
  { href: '/programs/html-css', label: 'HTML/CSS Programming', icon: '🌐', description: 'Web development fundamentals' },
  { href: '/programs/python', label: 'Python Programming', icon: '🐍', description: 'Advanced programming concepts' },
  { href: '/programs/web-design', label: 'Web Design', icon: '🎨', description: 'Creative web design skills' },
  { href: '/programs/robotics', label: 'Robotics Programming', icon: '🤖', description: 'Robotics and automation' }
];

// Business related nav items
export const businessItems = [
  { href: '/partnership', label: 'Partnership', icon: Handshake },
  { href: '/school-registration', label: 'Register School', icon: BuildingIcon },
];

// Support related nav items
export const supportItems = [
  { href: '/contact', label: 'Contact', icon: Phone },
  { href: '/faq', label: 'FAQ', icon: MessageSquare },
];

// Role-based dashboard navigation items for MobileNavigation
export const dashboardNavItemsByRole = {
  admin: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Schools', href: '/dashboard/schools', icon: BuildingIcon },
    { name: 'Students', href: '/dashboard/students', icon: UsersIcon },
    { name: 'Courses', href: '/dashboard/courses', icon: BookOpen },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  ],
  teacher: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Classes', href: '/dashboard/classes', icon: BookOpen },
    { name: 'Students', href: '/dashboard/students', icon: UsersIcon },
    { name: 'Lessons', href: '/dashboard/lessons', icon: ClipboardList },
    { name: 'Progress', href: '/dashboard/progress', icon: BarChart3 },
  ],
  student: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Courses', href: '/dashboard/courses', icon: BookOpen },
    { name: 'Lessons', href: '/dashboard/lessons', icon: ClipboardList },
    { name: 'Progress', href: '/dashboard/progress', icon: BarChart3 },
    { name: 'Assignments', href: '/dashboard/assignments', icon: Plus },
  ],
  default: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
  ],
};

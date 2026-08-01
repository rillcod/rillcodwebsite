import {
  Home,
  BookOpen,
  BuildingIcon,
  GraduationCap,
  Handshake,
  Phone,
  Info,
  Star,
  MessageSquare,
} from "lucide-react";

// Navigation items for main nav
export const mainNavItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/about", label: "About", icon: Info },
];

// Education related nav items
export const educationItems = [
  { href: "/programs", label: "Programs", icon: BookOpen },
  { href: "/curriculum", label: "Curriculum", icon: GraduationCap },
  { href: "/testimonials", label: "Testimonials", icon: Star },
];

// Programs dropdown items
export const programsDropdown = [
  {
    href: "/programs/ict-fundamentals",
    label: "ICT Fundamentals",
    icon: "💻",
    description: "Computer basics and digital literacy",
  },
  {
    href: "/programs/scratch",
    label: "Scratch Programming",
    icon: "🎮",
    description: "Visual programming for beginners",
  },
  {
    href: "/programs/html-css",
    label: "HTML/CSS Programming",
    icon: "🌐",
    description: "Web development fundamentals",
  },
  {
    href: "/programs/python",
    label: "Python Programming",
    icon: "🐍",
    description: "Advanced programming concepts",
  },
  {
    href: "/programs/web-design",
    label: "Web Design",
    icon: "🎨",
    description: "Creative web design skills",
  },
  {
    href: "/programs/robotics",
    label: "Robotics Programming",
    icon: "🤖",
    description: "Robotics and automation",
  },
];

// Business related nav items
export const businessItems = [
  { href: "/partnership", label: "Partnership", icon: Handshake },
  {
    href: "/school-registration",
    label: "Register School",
    icon: BuildingIcon,
  },
];

// Support related nav items
export const supportItems = [
  { href: "/contact", label: "Contact", icon: Phone },
  { href: "/faq", label: "FAQ", icon: MessageSquare },
];

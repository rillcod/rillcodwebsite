import Link from "next/link";
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Mail, Phone, MapPin, School, Heart } from "lucide-react";
import Logo from './Logo';
import { brandColors, contactInfo, socialLinks } from '../config/brand';

const year = new Date().getFullYear();

const footerSocialLinks = [
  {
    name: "Facebook",
    href: socialLinks.facebook,
    icon: Facebook,
    color: "hover:text-blue-600"
  },
  {
    name: "Twitter",
    href: socialLinks.twitter,
    icon: Twitter,
    color: "hover:text-blue-400"
  },
  {
    name: "Instagram",
    href: socialLinks.instagram,
    icon: Instagram,
    color: "hover:text-pink-600"
  },
  {
    name: "LinkedIn",
    href: socialLinks.linkedin,
    icon: Linkedin,
    color: "hover:text-blue-700"
  },
  {
    name: "YouTube",
    href: socialLinks.youtube,
    icon: Youtube,
    color: "hover:text-red-600"
  }
];

const quickLinks = [
  { name: "About", href: "/about" },
  { name: "Programs", href: "/programs" },
  { name: "Contact", href: "/contact" },
  { name: "FAQ", href: "/faq" },
  { name: "Terms", href: "/terms-of-service" }
];

export default function Footer() {
  return (
    <footer className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div className="lg:col-span-2">
            <Logo size="md" className="mb-4" textColor="text-white" />
            <p className="text-gray-300 dark:text-gray-400 text-sm leading-relaxed mb-4">
              Empowering Nigeria's future through technology education. We partner with schools 
              to deliver world-class programming and technology courses to young minds.
            </p>
            
            {/* Contact Info */}
            <div className="space-y-2 text-sm text-gray-300 dark:text-gray-400">
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-blue-400" />
                <span>{contactInfo.phone}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-blue-400" />
                <span>{contactInfo.email}</span>
              </div>
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-blue-400" />
                <span>{contactInfo.address}</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-blue-400">Quick Links</h3>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-gray-300 dark:text-gray-400 hover:text-blue-400 transition-colors duration-300 text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social Media */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-blue-400">Follow Us</h3>
            <div className="flex space-x-4">
              {footerSocialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-gray-400 ${social.color} transition-colors duration-300 p-2 rounded-full hover:bg-gray-800 dark:hover:bg-gray-700`}
                    aria-label={social.name}
                  >
                    <Icon className="w-5 h-5" />
                  </a>
                );
              })}
            </div>
            
            {/* Newsletter Signup */}
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-3 text-blue-400">Stay Updated</h4>
              <div className="flex">
                <input
                  type="email"
                  placeholder="Your email"
                  className="flex-1 px-3 py-2 bg-gray-800 dark:bg-gray-700 border border-gray-700 dark:border-gray-600 rounded-l-md text-sm text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-r-md text-sm hover:from-blue-700 hover:to-purple-700 transition-all duration-300">
                  Subscribe
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-700 dark:border-gray-600 pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2 text-sm text-gray-400 dark:text-gray-500">
              <span>&copy; {year} Rillcod Academy. All rights reserved.</span>
              <span className="hidden md:inline">•</span>
              <span className="hidden md:inline">Made with</span>
              <Heart className="w-4 h-4 text-red-500 hidden md:inline" />
              <span className="hidden md:inline">in Nigeria</span>
            </div>
            
            <div className="flex items-center space-x-6 text-sm">
              <Link href="/privacy-policy" className="text-gray-400 dark:text-gray-500 hover:text-blue-400 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms-of-service" className="text-gray-400 dark:text-gray-500 hover:text-blue-400 transition-colors">
                Terms of Service
              </Link>
              <Link href="/faq" className="text-gray-400 dark:text-gray-500 hover:text-blue-400 transition-colors">
                FAQ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
} 
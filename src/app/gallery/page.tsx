// @refresh reset
"use client";
import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Image as ImageIcon, Users, Award, Code, Filter, Search, Calendar, MapPin, Star, Heart, Share2, Download, Eye } from "lucide-react";
import Link from "next/link";
import {
  ComputerDesktopIcon,
  CodeBracketIcon,
  BeakerIcon,
  CpuChipIcon,
  RocketLaunchIcon,
  AcademicCapIcon,
  UserGroupIcon,
  CameraIcon,
  PlayIcon,
  HeartIcon,
  ShareIcon,
  BookOpenIcon,
  LightBulbIcon,
  GlobeAltIcon,
  CogIcon
} from '@/lib/icons'

const galleryData = [
  {
    id: 1,
    title: "Young Nigerian Coders in Action",
    description: "Students from Rillcod Technologies in Benin City working on Python programming projects",
    category: "coding",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 156,
    views: 2340,
    featured: true
  },
  {
    id: 2,
    title: "STEM Robotics Workshop",
    description: "Kids building and programming robots at Rillcod Technologies, Benin City",
    category: "robotics",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 203,
    views: 1890,
    featured: true
  },
  {
    id: 3,
    title: "Computer Science Lab",
    description: "Students learning computer fundamentals at Rillcod Technologies, Benin City",
    category: "computers",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 98,
    views: 1456,
    featured: false
  },
  {
    id: 4,
    title: "Science Experiment Day",
    description: "Young scientists conducting experiments at Rillcod Technologies, Benin City",
    category: "science",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 167,
    views: 2100,
    featured: false
  },
  {
    id: 5,
    title: "Coding Club Meeting",
    description: "After-school coding club at Rillcod Technologies, Benin City",
    category: "coding",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 134,
    views: 1789,
    featured: false
  },
  {
    id: 6,
    title: "3D Printing Workshop",
    description: "Students learning 3D design and printing technology at Rillcod Technologies",
    category: "technology",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 189,
    views: 2234,
    featured: true
  },
  {
    id: 7,
    title: "Mathematics & Programming",
    description: "Integrating math concepts with computer programming at Rillcod Technologies",
    category: "coding",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 145,
    views: 1654,
    featured: false
  },
  {
    id: 8,
    title: "Digital Art & Design",
    description: "Creative technology projects using digital tools at Rillcod Technologies",
    category: "creative",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 178,
    views: 1987,
    featured: false
  },
  {
    id: 9,
    title: "STEM Career Day",
    description: "Students meeting with Nigerian tech professionals at Rillcod Technologies",
    category: "careers",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 223,
    views: 2567,
    featured: true
  },
  {
    id: 10,
    title: "Mobile App Development",
    description: "Students creating apps to solve local community problems at Rillcod Technologies",
    category: "coding",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 198,
    views: 2341,
    featured: false
  },
  {
    id: 11,
    title: "Environmental Science",
    description: "Using technology to study and protect our environment at Rillcod Technologies",
    category: "science",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 167,
    views: 1890,
    featured: false
  },
  {
    id: 12,
    title: "AI & Machine Learning",
    description: "Introduction to artificial intelligence concepts at Rillcod Technologies",
    category: "technology",
    image: "https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg",
    likes: 245,
    views: 2890,
    featured: true
  }
];

const stats = [
  { number: "1000+", label: "Photos", icon: <ImageIcon className="w-8 h-8" />, color: "text-blue-600" },
  { number: "50+", label: "Events Captured", icon: <Camera className="w-8 h-8" />, color: "text-green-600" },
  { number: "500+", label: "Students Featured", icon: <Users className="w-8 h-8" />, color: "text-purple-600" },
  { number: "20+", label: "Awards & Achievements", icon: <Award className="w-8 h-8" />, color: "text-orange-600" }
];

const categories = [
  { id: 'all', name: 'All Activities', icon: CameraIcon },
  { id: 'coding', name: 'Coding & Programming', icon: CodeBracketIcon },
  { id: 'robotics', name: 'Robotics', icon: CpuChipIcon },
  { id: 'computers', name: 'Computer Science', icon: ComputerDesktopIcon },
  { id: 'science', name: 'Science Experiments', icon: BeakerIcon },
  { id: 'technology', name: 'Technology', icon: RocketLaunchIcon },
  { id: 'creative', name: 'Creative Tech', icon: LightBulbIcon },
  { id: 'careers', name: 'Career Exploration', icon: AcademicCapIcon }
];

export default function Gallery() {
  const touchStartY = useRef<number | null>(null);
  const touchDeltaY = useRef<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("date");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredImages = galleryData.filter(img => {
    const matchesSearch = img.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         img.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         img.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || img.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedImages = filteredImages.sort((a, b) => {
    switch (sortBy) {
      case "views":
        return b.views - a.views;
      case "likes":
        return b.likes - a.likes;
      case "featured":
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      default:
        return 0;
    }
  });

  const featuredImages = sortedImages.filter(img => img.featured);
  const regularImages = sortedImages.filter(img => !img.featured);

  const openImageModal = (imageId: number) => {
    setSelectedImage(imageId);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedImage(null);
    setIsModalOpen(false);
  };

  const getCategoryIcon = (categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.icon : CameraIcon;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg mb-16">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
              <Camera className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">Our Learning Gallery</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Explore the exciting world of STEM education through the eyes of our students. See how young minds are being shaped by technology and innovation.
          </p>
          <div className="w-20 h-2 bg-gradient-to-r from-blue-600 to-purple-600 mx-auto rounded-full"></div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className={`flex justify-center mb-4 ${stat.color}`}>
                {stat.icon}
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.number}</div>
              <div className="text-gray-600 dark:text-gray-300">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Search and Filter Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-16">
          <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search photos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const IconComponent = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                      selectedCategory === category.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span className="hidden sm:inline">{category.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="date">Sort by Date</option>
                <option value="views">Sort by Views</option>
                <option value="likes">Sort by Likes</option>
                <option value="featured">Featured First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Featured Images */}
        {featuredImages.length > 0 && (
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 flex items-center">
              <Star className="w-6 h-6 text-yellow-500 mr-2" />
              Featured Photos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredImages.map((img) => (
                <div key={img.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all duration-300 hover:scale-105 group">
                  <div className="relative h-64 bg-gradient-to-br from-blue-100 dark:from-blue-900/30 to-purple-100 dark:to-purple-900/30 flex items-center justify-center cursor-pointer" onClick={() => openImageModal(img.id)}>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-600 dark:bg-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-white dark:text-gray-900 font-bold text-xl">📸</span>
                      </div>
                      <p className="text-blue-600 dark:text-blue-400 font-semibold">Featured Photo</p>
                    </div>
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Eye className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600 dark:text-blue-400 font-medium capitalize">{img.category}</span>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{img.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{img.description}</p>
                    
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                        <span className="text-sm">Rillcod Technologies, Benin City</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                          <Eye className="w-4 h-4" />
                          <span className="text-sm">{img.views}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                          <Heart className="w-4 h-4" />
                          <span className="text-sm">{img.likes}</span>
                        </div>
                      </div>
                      <button className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500">
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gallery Grid */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Photo Gallery</h2>
          {regularImages.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
              <Search className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No photos found</h3>
              <p className="text-gray-600 dark:text-gray-300">Try adjusting your search terms or filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {regularImages.map((img) => (
                <div key={img.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all duration-300 hover:scale-105 group">
                  <div className="relative h-48 bg-gradient-to-br from-blue-100 dark:from-blue-900/30 to-purple-100 dark:to-purple-900/30 flex items-center justify-center cursor-pointer" onClick={() => openImageModal(img.id)}>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-blue-600 dark:bg-blue-400 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-white dark:text-gray-900 font-bold text-sm">📸</span>
                      </div>
                      <p className="text-blue-600 dark:text-blue-400 font-semibold text-sm">Photo</p>
                    </div>
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Eye className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600 dark:text-blue-400 font-medium capitalize">{img.category}</span>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{img.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{img.description}</p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                          <Eye className="w-3 h-3" />
                          <span className="text-xs">{img.views}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                          <Heart className="w-3 h-3" />
                          <span className="text-xs">{img.likes}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Empty State */}
        {filteredImages.length === 0 && (
          <div className="text-center py-16">
            <Camera className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No images found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Try selecting a different category or check back later for new content.
            </p>
          </div>
        )}

        {/* Image Modal */}
        {isModalOpen && selectedImage && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div
              className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onTouchStart={(e) => {
                touchStartY.current = e.touches[0].clientY;
                touchDeltaY.current = 0;
              }}
              onTouchMove={(e) => {
                if (touchStartY.current === null) return;
                touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
              }}
              onTouchEnd={() => {
                if (touchDeltaY.current > 120) {
                  closeModal();
                }
                touchStartY.current = null;
                touchDeltaY.current = 0;
              }}
            >
              <div className="relative h-64 md:h-96">
                <Image
                  src={galleryData.find(img => img.id === selectedImage)?.image || ""}
                  alt={galleryData.find(img => img.id === selectedImage)?.title || "Gallery image"}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 70vw"
                  className="object-cover rounded-t-xl"
                />
                <button
                  onClick={closeModal}
                  className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6">
                <div className="flex items-center mb-4">
                  {(() => {
                    const Icon = getCategoryIcon(galleryData.find(img => img.id === selectedImage)?.category || 'all')
                    return <Icon className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-2" />
                  })()}
                  <span className="text-blue-600 dark:text-blue-400 font-medium capitalize">{galleryData.find(img => img.id === selectedImage)?.category}</span>
                </div>
                
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {galleryData.find(img => img.id === selectedImage)?.title}
                </h2>
                
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  {galleryData.find(img => img.id === selectedImage)?.description}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center">
                      <HeartIcon className="h-5 w-5 text-red-500 mr-2" />
                      <span className="font-medium">{galleryData.find(img => img.id === selectedImage)?.likes} likes</span>
                    </div>
                    <div className="flex items-center">
                      <CameraIcon className="h-5 w-5 text-blue-500 mr-2" />
                      <span className="font-medium">{galleryData.find(img => img.id === selectedImage)?.views} views</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      <HeartIcon className="h-4 w-4 mr-2" />
                      Like
                    </button>
                    <button className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
                      <ShareIcon className="h-4 w-4 mr-2" />
                      Share
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white">
          <h2 className="text-3xl font-bold mb-4">Be Part of Our Story</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            Join RILLCOD Academy and create your own memorable moments in technology education.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/student-registration"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Users className="w-5 h-5 mr-2" />
              Enroll Now
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 border-2 border-border text-white font-semibold rounded-lg hover:bg-white hover:text-blue-600 transition-colors"
            >
              <Camera className="w-5 h-5 mr-2" />
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 
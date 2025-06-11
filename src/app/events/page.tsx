"use client";
import { useState } from "react";
import { Calendar, Clock, MapPin, Users, ArrowRight, Tag, ExternalLink } from "lucide-react";

const events = [
  {
    id: 1,
    title: "AI & Robotics Competition 2024",
    description: "Annual competition where students showcase their AI and robotics projects. Categories include autonomous robots, machine learning applications, and IoT solutions.",
    date: "2024-03-15",
    time: "9:00 AM - 5:00 PM",
    location: "RILLCOD Academy Main Campus",
    type: "Competition",
    category: "AI & Robotics",
    capacity: 200,
    registered: 150,
    price: "Free",
    featured: true,
    image: "/api/placeholder/600/400",
    highlights: [
      "Cash prizes worth ₦500,000",
      "Industry expert judges",
      "Networking opportunities",
      "Project showcase"
    ]
  },
  {
    id: 2,
    title: "Web Development Bootcamp",
    description: "Intensive 2-week bootcamp covering modern web development technologies including React, Node.js, and cloud deployment.",
    date: "2024-02-20",
    time: "10:00 AM - 4:00 PM",
    location: "Online & In-Person",
    type: "Workshop",
    category: "Web Development",
    capacity: 50,
    registered: 35,
    price: "₦50,000",
    featured: false,
    image: "/api/placeholder/600/400",
    highlights: [
      "Hands-on projects",
      "Industry mentorship",
      "Certificate of completion",
      "Job placement assistance"
    ]
  },
  {
    id: 3,
    title: "Parent-Teacher Technology Day",
    description: "Special event for parents to understand our technology curriculum and see their children's progress in action.",
    date: "2024-02-10",
    time: "2:00 PM - 6:00 PM",
    location: "RILLCOD Academy",
    type: "Open House",
    category: "Education",
    capacity: 100,
    registered: 80,
    price: "Free",
    featured: false,
    image: "/api/placeholder/600/400",
    highlights: [
      "Student project demonstrations",
      "Curriculum overview",
      "Q&A session",
      "Refreshments provided"
    ]
  },
  {
    id: 4,
    title: "Python Programming Masterclass",
    description: "Advanced Python programming workshop focusing on data science, automation, and AI applications.",
    date: "2024-01-25",
    time: "9:00 AM - 3:00 PM",
    location: "RILLCOD Academy Lab",
    type: "Masterclass",
    category: "Programming",
    capacity: 30,
    registered: 25,
    price: "₦30,000",
    featured: false,
    image: "/api/placeholder/600/400",
    highlights: [
      "Advanced Python concepts",
      "Real-world projects",
      "Expert instructor",
      "Take-home materials"
    ]
  },
  {
    id: 5,
    title: "Mobile App Development Showcase",
    description: "Students present their mobile applications developed using Flutter and React Native technologies.",
    date: "2024-01-20",
    time: "1:00 PM - 5:00 PM",
    location: "RILLCOD Academy Auditorium",
    type: "Showcase",
    category: "Mobile Development",
    capacity: 150,
    registered: 120,
    price: "Free",
    featured: false,
    image: "/api/placeholder/600/400",
    highlights: [
      "Student app presentations",
      "Industry feedback",
      "Award ceremony",
      "Networking session"
    ]
  },
  {
    id: 6,
    title: "IoT & Smart Home Workshop",
    description: "Hands-on workshop teaching students to build smart home devices using Arduino and IoT technologies.",
    date: "2024-01-15",
    time: "10:00 AM - 4:00 PM",
    location: "RILLCOD Academy IoT Lab",
    type: "Workshop",
    category: "IoT",
    capacity: 25,
    registered: 20,
    price: "₦40,000",
    featured: false,
    image: "/api/placeholder/600/400",
    highlights: [
      "Arduino programming",
      "Sensor integration",
      "Take-home project",
      "Expert guidance"
    ]
  }
];

const eventTypes = ["All", "Competition", "Workshop", "Masterclass", "Showcase", "Open House"];
const categories = ["All", "AI & Robotics", "Web Development", "Mobile Development", "Programming", "IoT", "Education"];

export default function Events() {
  const [selectedType, setSelectedType] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredEvents = events.filter(event => {
    const typeMatch = selectedType === "All" || event.type === selectedType;
    const categoryMatch = selectedCategory === "All" || event.category === selectedCategory;
    return typeMatch && categoryMatch;
  });

  const upcomingEvents = filteredEvents.filter(event => new Date(event.date) >= new Date());
  const pastEvents = filteredEvents.filter(event => new Date(event.date) < new Date());

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Events & Activities
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
          Join our exciting events, workshops, competitions, and showcases to enhance your technology skills and network with industry professionals.
        </p>
        <div className="w-20 h-2 bg-blue-600 mx-auto rounded-full"></div>
      </div>

      {/* Featured Event */}
      {events.filter(e => e.featured).map((event) => (
        <div key={event.id} className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Featured Event</h2>
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="h-64 lg:h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-blue-600 font-semibold">Featured Event</p>
                </div>
              </div>
              <div className="p-8">
                <div className="flex items-center gap-4 mb-4">
                  <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                    {event.type}
                  </span>
                  <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-sm font-medium">
                    {event.category}
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{event.title}</h3>
                <p className="text-gray-600 mb-6">{event.description}</p>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600 text-sm">{new Date(event.date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600 text-sm">{event.time}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600 text-sm">{event.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600 text-sm">{event.registered}/{event.capacity} registered</span>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Highlights:</h4>
                  <ul className="space-y-1">
                    {event.highlights.map((highlight, index) => (
                      <li key={index} className="text-gray-600 text-sm">• {highlight}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-blue-600">{event.price}</div>
                  <button className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                    Register Now
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Filters */}
      <div className="mb-12">
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Event Type:</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {eventTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="mb-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Upcoming Events</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {upcomingEvents.map((event) => (
            <div key={event.id} className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="h-48 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-blue-600 font-semibold text-sm">{event.type}</p>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-gray-500" />
                  <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                    {event.category}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2">{event.title}</h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-3">{event.description}</p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    {new Date(event.date).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    {event.time}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    {event.location}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4" />
                    {event.registered}/{event.capacity} registered
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold text-blue-600">{event.price}</div>
                  <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                    Register
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Past Events</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pastEvents.map((event) => (
              <div key={event.id} className="bg-gray-50 rounded-xl shadow-lg overflow-hidden border border-gray-200">
                <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-gray-600 font-semibold text-sm">Past Event</p>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-gray-500" />
                    <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs">
                      {event.category}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{event.title}</h3>
                  <p className="text-gray-600 text-sm mb-4">{event.description}</p>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      {new Date(event.date).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      {event.registered} participants
                    </div>
                  </div>
                  
                  <button className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    View Photos
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Call to Action */}
      <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white">
        <h2 className="text-3xl font-bold mb-4">Stay Updated with Our Events</h2>
        <p className="text-xl mb-8 opacity-90">
          Subscribe to our newsletter to get notified about upcoming events, workshops, and competitions.
        </p>
        <div className="max-w-md mx-auto">
          <div className="flex gap-4">
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button className="px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
              Subscribe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 
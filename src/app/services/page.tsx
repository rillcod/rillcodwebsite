import Link from "next/link";
import { Code, Smartphone, Users, BookOpen, ArrowRight, CheckCircle, Clock, Award, Zap } from "lucide-react";

const services = [
  {
    icon: <Code className="w-12 h-12 text-blue-600" />,
    title: "Web Development",
    description: "Custom web applications, e-commerce solutions, and responsive websites that drive business growth.",
    features: [
      "Custom Web Applications",
      "E-commerce Solutions", 
      "Responsive Design",
      "CMS Development",
      "API Integration",
      "Performance Optimization"
    ],
    color: "from-blue-500 to-blue-700",
    price: "Starting from ₦500,000"
  },
  {
    icon: <Smartphone className="w-12 h-12 text-green-600" />,
    title: "Mobile App Development",
    description: "Native and cross-platform mobile applications for iOS and Android platforms.",
    features: [
      "iOS Development",
      "Android Development",
      "Cross-platform Apps",
      "UI/UX Design",
      "App Store Optimization",
      "Maintenance & Support"
    ],
    color: "from-green-500 to-green-700",
    price: "Starting from ₦800,000"
  },
  {
    icon: <Users className="w-12 h-12 text-purple-600" />,
    title: "IT Consulting",
    description: "Strategic technology consulting to help businesses optimize their digital infrastructure.",
    features: [
      "Technology Strategy",
      "Digital Transformation",
      "System Architecture",
      "Security Audits",
      "Performance Analysis",
      "Technology Training"
    ],
    color: "from-purple-500 to-purple-700",
    price: "Starting from ₦200,000"
  },
  {
    icon: <BookOpen className="w-12 h-12 text-orange-600" />,
    title: "Training Programs",
    description: "Comprehensive technology training for individuals and corporate teams.",
    features: [
      "Programming Bootcamps",
      "Corporate Training",
      "Skill Development",
      "Certification Programs",
      "Workshop Sessions",
      "Online Learning"
    ],
    color: "from-orange-500 to-orange-700",
    price: "Starting from ₦50,000"
  }
];

const stats = [
  { number: "100+", label: "Projects Completed", icon: <CheckCircle className="w-8 h-8" /> },
  { number: "50+", label: "Happy Clients", icon: <Users className="w-8 h-8" /> },
  { number: "5+", label: "Years Experience", icon: <Clock className="w-8 h-8" /> },
  { number: "95%", label: "Client Satisfaction", icon: <Award className="w-8 h-8" /> }
];

export default function Services() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Professional IT Services
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
          We deliver cutting-edge technology solutions that drive business growth and digital transformation.
        </p>
        <div className="w-20 h-2 bg-blue-600 mx-auto rounded-full"></div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
        {stats.map((stat, index) => (
          <div key={index} className="text-center">
            <div className="flex justify-center mb-4 text-blue-600">
              {stat.icon}
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-2">{stat.number}</div>
            <div className="text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {services.map((service, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100 hover:shadow-xl transition-shadow">
            <div className={`bg-gradient-to-r ${service.color} p-8`}>
              <div className="flex items-center justify-between">
                <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  {service.icon}
                </div>
                <div className="text-right">
                  <div className="text-white font-semibold">{service.price}</div>
                </div>
              </div>
            </div>
            
            <div className="p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{service.title}</h3>
              <p className="text-gray-600 mb-6">{service.description}</p>
              
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-3">What's Included:</h4>
                <ul className="space-y-2">
                  {service.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center text-gray-600">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              
              <Link
                href="/contact"
                className="inline-flex items-center justify-center w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Why Choose Us */}
      <div className="bg-gray-50 rounded-2xl p-8 mb-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose RILLCOD TECH?</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            We combine technical expertise with business acumen to deliver solutions that drive real results.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast Delivery</h3>
            <p className="text-gray-600">We deliver projects on time with rapid development cycles and efficient processes.</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Quality Assurance</h3>
            <p className="text-gray-600">Rigorous testing and quality control ensure your solutions are robust and reliable.</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Expert Team</h3>
            <p className="text-gray-600">Our experienced developers and consultants bring years of industry expertise.</p>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="text-center bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-white">
        <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Business?</h2>
        <p className="text-xl mb-8 opacity-90">
          Let's discuss how our services can help you achieve your technology goals.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Get Free Consultation
          </Link>
          <Link
            href="/portfolio"
            className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-blue-600 transition-colors"
          >
            View Our Work
          </Link>
        </div>
      </div>
    </div>
  );
} 
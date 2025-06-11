"use client";
import { useState } from "react";
import { Mail, Phone, MapPin, Clock, Send, MessageSquare, Building, User, Calendar, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    school: "",
    subject: "",
    message: "",
    preferredContact: "email"
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const contactInfo = [
    {
      icon: <Phone className="w-6 h-6" />,
      title: "Phone Numbers",
      details: ["08116600091", "07036402679"],
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      action: "tel:08116600091",
      actionText: "Call Now"
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: "Email Addresses",
      details: ["info@rillcod.tech", "rillcod@gmail.com"],
      color: "text-green-600",
      bgColor: "bg-green-50",
      action: "mailto:info@rillcod.tech",
      actionText: "Send Email"
    },
    {
      icon: <MapPin className="w-6 h-6" />,
      title: "Office Address",
      details: ["No. 26 Ogiesoba Avenue", "Off Airport Road, Benin City", "Edo State, Nigeria"],
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      action: "https://maps.google.com",
      actionText: "View on Map"
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Business Hours",
      details: ["Monday–Friday: 8:00 AM–6:00 PM", "Saturday: 9:00 AM–3:00 PM"],
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      action: "/school-registration",
      actionText: "Schedule Visit"
    }
  ];

  const contactMethods = [
    {
      icon: <MessageSquare className="w-8 h-8" />,
      title: "WhatsApp",
      description: "Quick questions and instant support",
      contact: "08116600091",
      color: "from-green-500 to-green-600",
      action: "https://wa.me/2348116600091"
    },
    {
      icon: <Mail className="w-8 h-8" />,
      title: "Email",
      description: "Detailed inquiries and documentation",
      contact: "info@rillcod.tech",
      color: "from-blue-500 to-blue-600",
      action: "mailto:info@rillcod.tech"
    },
    {
      icon: <Building className="w-8 h-8" />,
      title: "Office Visit",
      description: "In-person consultation and demo",
      contact: "Benin City",
      color: "from-purple-500 to-purple-600",
      action: "/school-registration"
    }
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }
    if (!formData.subject.trim()) newErrors.subject = "Subject is required";
    if (!formData.message.trim()) newErrors.message = "Message is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsSubmitted(true);
    setIsLoading(false);
    
    // Reset form after 5 seconds
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        school: "",
        subject: "",
        message: "",
        preferredContact: "email"
      });
    }, 5000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Get in Touch with RILLCOD Academy
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Ready to transform your school with cutting-edge technology education? 
            We&apos;re here to help you get started on this exciting journey.
          </p>
          <div className="w-20 h-2 bg-gradient-to-r from-blue-600 to-purple-600 mx-auto rounded-full"></div>
        </div>

        {/* Contact Methods */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {contactMethods.map((method, index) => (
            <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 hover:scale-105">
              <div className={`w-16 h-16 bg-gradient-to-r ${method.color} rounded-full flex items-center justify-center text-white mb-6`}>
                {method.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{method.title}</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">{method.description}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{method.contact}</p>
              <Link
                href={method.action}
                className={`inline-flex items-center justify-center w-full px-6 py-3 bg-gradient-to-r ${method.color} text-white font-semibold rounded-lg hover:opacity-90 transition-all duration-300`}
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Send us a Message</h2>
            
            {isSubmitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Message Sent Successfully!</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">We&apos;ll get back to you within 24 hours.</p>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <User className="w-4 h-4 inline mr-2" />
                      Full Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        errors.name 
                          ? 'border-red-500 dark:border-red-400' 
                          : 'border-gray-300 dark:border-gray-600'
                      } dark:bg-gray-700 dark:text-white`}
                      placeholder="Enter your full name"
                    />
                    {errors.name && (
                      <p className="text-red-500 dark:text-red-400 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.name}
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <Mail className="w-4 h-4 inline mr-2" />
                      Email Address *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                        errors.email ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="Enter your email"
                    />
                    {errors.email && (
                      <p className="text-red-500 text-sm mt-1 flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <Phone className="w-4 h-4 inline mr-2" />
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="Enter your phone number"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      <Building className="w-4 h-4 inline mr-2" />
                      School Name
                    </label>
                    <input
                      type="text"
                      name="school"
                      value={formData.school}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      placeholder="Enter school name (if applicable)"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Subject *
                  </label>
                  <select
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                      errors.subject ? 'border-red-300' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select a subject</option>
                    <option value="School Partnership">School Partnership Inquiry</option>
                    <option value="Student Enrollment">Student Enrollment</option>
                    <option value="Curriculum Information">Curriculum Information</option>
                    <option value="Demo Request">Request a Demo</option>
                    <option value="General Inquiry">General Inquiry</option>
                    <option value="Technical Support">Technical Support</option>
                  </select>
                  {errors.subject && (
                    <p className="text-red-500 text-sm mt-1 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {errors.subject}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    <MessageSquare className="w-4 h-4 inline mr-2" />
                    Message *
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    rows={5}
                    className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none ${
                      errors.message ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Tell us more about your inquiry..."
                  ></textarea>
                  {errors.message && (
                    <p className="text-red-500 text-sm mt-1 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {errors.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Preferred Contact Method
                  </label>
                  <div className="flex gap-4">
                    {[
                      { value: "email", label: "Email", icon: <Mail className="w-4 h-4" /> },
                      { value: "phone", label: "Phone", icon: <Phone className="w-4 h-4" /> },
                      { value: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="w-4 h-4" /> }
                    ].map((method) => (
                      <label key={method.value} className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="preferredContact"
                          value={method.value}
                          checked={formData.preferredContact === method.value}
                          onChange={handleChange}
                          className="sr-only"
                        />
                        <div className={`w-6 h-6 border-2 rounded-full flex items-center justify-center mr-2 ${
                          formData.preferredContact === method.value
                            ? 'border-blue-600 bg-blue-600'
                            : 'border-gray-300'
                        }`}>
                          {formData.preferredContact === method.value && (
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          )}
                        </div>
                        <span className="flex items-center text-sm">
                          {method.icon}
                          <span className="ml-1">{method.label}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-300 ${
                    isLoading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 hover:scale-105'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Sending Message...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <Send className="w-5 h-5 mr-2" />
                      Send Message
                    </div>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Contact Information */}
          <div className="space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Contact Information</h2>
              <div className="space-y-6">
                {contactInfo.map((info, index) => (
                  <div
                    key={index}
                    className={`group ${info.bgColor} dark:${info.bgColor.replace('-50', '-900/30')} rounded-xl p-6 transition-all duration-300 transform hover:scale-[1.03] hover:shadow-2xl focus-within:scale-[1.03] focus-within:shadow-2xl`}
                    tabIndex={0}
                    role="region"
                    aria-labelledby={`contact-info-title-${index}`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`${info.color} p-3 rounded-lg bg-white dark:bg-gray-900/60 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-focus-within:scale-110 group-focus-within:shadow-lg animate-none`}
                        aria-hidden="true"
                      >
                        {info.icon}
                      </div>
                      <div className="flex-1">
                        <h3 id={`contact-info-title-${index}`} className="font-semibold text-gray-900 dark:text-white mb-2">
                          {info.title}
                        </h3>
                        <div className="space-y-1">
                          {info.details.map((detail, idx) => (
                            <p key={idx} className="text-gray-600 dark:text-gray-300">{detail}</p>
                          ))}
                        </div>
                        <Link
                          href={info.action}
                          aria-label={info.actionText + (info.title ? ` for ${info.title}` : '')}
                          className="inline-flex items-center mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 relative"
                        >
                          {info.actionText}
                          <span className="ml-1" aria-hidden="true">→</span>
                          <span className="absolute left-0 -bottom-0.5 w-full h-0.5 bg-blue-600 dark:bg-blue-400 scale-x-0 group-hover:scale-x-100 group-focus-within:scale-x-100 transition-transform origin-left" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
              <h3 className="text-xl font-bold mb-4">Quick Actions</h3>
              <div className="space-y-4">
                <Link
                  href="/school-registration"
                  className="flex items-center justify-between p-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                >
                  <div className="flex items-center">
                    <Building className="w-5 h-5 mr-3" />
                    <span>Register Your School</span>
                  </div>
                  <span>→</span>
                </Link>
                <Link
                  href="/student-registration"
                  className="flex items-center justify-between p-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                >
                  <div className="flex items-center">
                    <User className="w-5 h-5 mr-3" />
                    <span>Enroll Your Child</span>
                  </div>
                  <span>→</span>
                </Link>
                <Link
                  href="/curriculum"
                  className="flex items-center justify-between p-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                >
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 mr-3" />
                    <span>View Curriculum</span>
                  </div>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center bg-white rounded-2xl shadow-lg p-12 mt-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Transform Your School?</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Join hundreds of schools already benefiting from our innovative technology education programs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/school-registration"
              className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-105"
            >
              <Building className="w-5 h-5 mr-2" />
              Partner with Us
            </Link>
            <Link
              href="https://wa.me/2348116600091"
              className="inline-flex items-center justify-center px-8 py-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-all duration-300 hover:scale-105"
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Chat on WhatsApp
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 
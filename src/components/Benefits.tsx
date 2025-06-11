import React from 'react';
import { Lightbulb, Code, Users, Brain, Rocket, Star, Target, BookOpen } from 'lucide-react';

const Benefits: React.FC = () => {
  const benefits = [
    {
      icon: <Lightbulb className="w-12 h-12 text-orange-500" />,
      title: "Practical Learning",
      description: "Students learn by doing, working on real projects and building their portfolio from day one. Our hands-on approach ensures better understanding and retention."
    },
    {
      icon: <Code className="w-12 h-12 text-orange-500" />,
      title: "Industry-Relevant Skills",
      description: "Our curriculum is constantly updated to match current industry standards and practices, preparing students for real-world technology careers."
    },
    {
      icon: <Users className="w-12 h-12 text-orange-500" />,
      title: "Small Class Sizes",
      description: "Maximum attention and support with our small group learning environment. Each student gets personalized guidance and feedback."
    },
    {
      icon: <Brain className="w-12 h-12 text-orange-500" />,
      title: "Critical Thinking",
      description: "Develop problem-solving skills and computational thinking abilities through challenging projects and exercises."
    },
    {
      icon: <Rocket className="w-12 h-12 text-orange-500" />,
      title: "Innovation Focus",
      description: "Encourage creativity and innovative thinking through project-based learning and open-ended challenges."
    },
    {
      icon: <Star className="w-12 h-12 text-orange-500" />,
      title: "Expert Instructors",
      description: "Learn from experienced professionals who are passionate about teaching and technology education."
    },
    {
      icon: <Target className="w-12 h-12 text-orange-500" />,
      title: "Goal-Oriented Learning",
      description: "Clear learning objectives and milestones help students track their progress and achieve their goals."
    },
    {
      icon: <BookOpen className="w-12 h-12 text-orange-500" />,
      title: "Comprehensive Resources",
      description: "Access to quality learning materials, online resources, and practice exercises for continued learning."
    }
  ];

  return (
    <section id="benefits" className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why Choose Our Program?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            We provide a comprehensive learning experience that prepares students for the digital future.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <div 
              key={index}
              className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 bg-orange-100 p-4 rounded-full">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-gray-600">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
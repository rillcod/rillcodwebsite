import React from 'react';
import { Clock, Award, Target, Users, Code, Brain, Globe, Heart } from 'lucide-react';

const About: React.FC = () => {
  return (
    <section id="about" className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Empowering Nigerian Kids Through STEM</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
            We&apos;re on a mission to transform Nigeria&apos;s future by empowering young minds with cutting-edge technology skills
          </p>
          <div className="w-20 h-2 bg-purple-500 mx-auto rounded-full"></div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-6 md:p-8 rounded-2xl shadow-md">
            <h3 className="text-2xl font-bold text-purple-600 mb-4">Our Story</h3>
            <p className="text-gray-700 mb-6 leading-relaxed">
              Rillcod Academy is a subsidiary of Rillcod Technologies, founded by young Nigerian professionals passionate about bridging the digital divide. We believe every Nigerian child deserves access to world-class STEM education that prepares them for the future.
            </p>
            
            <h3 className="text-2xl font-bold text-purple-600 mb-4">Our Mission</h3>
            <p className="text-gray-700 leading-relaxed">
              To transform Nigeria&apos;s educational landscape by moving from traditional memory-based learning to innovative, creativity-stimulating education. We empower children with 21st-century skills through engaging, hands-on STEM experiences that make learning fun and relevant.
            </p>
            
            <h3 className="text-2xl font-bold text-purple-600 mb-4 mt-6">Our Vision</h3>
            <p className="text-gray-700 leading-relaxed">
              To create a generation of Nigerian tech leaders, innovators, and problem-solvers who will drive Africa&apos;s digital transformation and compete globally in the technology sector.
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-md border-2 border-blue-100 transform transition-all duration-300 hover:scale-105 hover:shadow-lg">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Code className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Coding Excellence</h3>
              <p className="text-gray-600">
                Teaching Nigerian kids to code in Python, JavaScript, and Scratch, preparing them for the digital economy.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-md border-2 border-green-100 transform transition-all duration-300 hover:scale-105 hover:shadow-lg">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Brain className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Critical Thinking</h3>
              <p className="text-gray-600">
                Developing problem-solving skills through robotics, AI, and hands-on STEM projects.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-md border-2 border-yellow-100 transform transition-all duration-300 hover:scale-105 hover:shadow-lg">
              <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <Globe className="w-7 h-7 text-yellow-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Global Impact</h3>
              <p className="text-gray-600">
                Our students have won international competitions and created solutions for local community problems.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-md border-2 border-purple-100 transform transition-all duration-300 hover:scale-105 hover:shadow-lg">
              <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Heart className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Passionate Team</h3>
              <p className="text-gray-600">
                Nigerian educators and tech professionals dedicated to nurturing the next generation of innovators.
              </p>
            </div>
          </div>
        </div>
        
        {/* Impact Statistics */}
        <div className="mt-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
          <h3 className="text-3xl font-bold text-center mb-8">Our Impact Across Nigeria</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">500+</div>
              <div className="text-blue-100">Students Trained</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">25+</div>
              <div className="text-blue-100">Partner Schools</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">15+</div>
              <div className="text-blue-100">STEM Programs</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">95%</div>
              <div className="text-blue-100">Success Rate</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, School, Users, Code, Brain, Rocket } from 'lucide-react';

const Hero: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const createFloatingElement = () => {
      if (!containerRef.current) return;
      
      const element = document.createElement('div');
      element.className = 'absolute w-4 h-4 bg-white rounded-full opacity-50';
      
      // Random starting position
      element.style.left = `${Math.random() * 100}%`;
      element.style.top = `${Math.random() * 100}%`;
      
      // Random animation duration between 10-20s
      const duration = 10 + Math.random() * 10;
      element.style.animation = `float ${duration}s linear infinite`;
      
      containerRef.current.appendChild(element);
      
      // Remove element after animation
      setTimeout(() => element.remove(), duration * 1000);
    };

    // Create new elements periodically
    const interval = setInterval(createFloatingElement, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="home" className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF914D] via-blue-400 to-indigo-600 z-0"></div>
      
      <div ref={containerRef} className="absolute inset-0 z-1 overflow-hidden">
        {/* Animation elements will be added dynamically */}
      </div>
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="w-full md:w-1/2 mb-12 md:mb-0">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4 leading-tight animate-fade-in">
              Rillcod Academy - Nigerian Kids Building the Future with Code
            </h1>
            
            <p className="text-xl md:text-2xl text-white opacity-90 mb-8 animate-slide-up">
              Empowering young Nigerian minds with STEM skills, robotics, and computer programming. From Benin City to across Nigeria, we&apos;re creating the next generation of tech innovators at Rillcod Academy!
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Link
                to="/school-registration"
                className="inline-flex items-center justify-center px-6 py-4 bg-blue-500 text-white text-xl font-bold rounded-full shadow-lg hover:bg-blue-600 transform transition-all duration-300 hover:scale-105 hover:shadow-xl animate-bounce-in"
              >
                <School className="w-6 h-6 mr-2" />
                Register My School
              </Link>
              
              <Link
                to="/student-registration"
                className="inline-flex items-center justify-center px-6 py-4 bg-green-500 text-white text-xl font-bold rounded-full shadow-lg hover:bg-green-600 transform transition-all duration-300 hover:scale-105 hover:shadow-xl animate-bounce-in"
              >
                <Users className="w-6 h-6 mr-2" />
                Start Coding Journey
              </Link>
            </div>
            
            {/* STEM Progress Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white bg-opacity-20 backdrop-filter backdrop-blur-sm rounded-2xl p-4 border border-white border-opacity-40">
                <div className="flex items-center mb-2">
                  <Code className="w-6 h-6 text-yellow-300 mr-2" />
                  <p className="text-white font-bold">Coding Skills:</p>
                </div>
                <div className="w-full bg-white bg-opacity-30 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-yellow-300 to-orange-500 h-full rounded-full animate-progress"
                    style={{ width: '85%' }}
                  ></div>
                </div>
                <p className="text-right text-white font-bold mt-1">85%</p>
              </div>
              
              <div className="bg-white bg-opacity-20 backdrop-filter backdrop-blur-sm rounded-2xl p-4 border border-white border-opacity-40">
                <div className="flex items-center mb-2">
                  <Brain className="w-6 h-6 text-green-300 mr-2" />
                  <p className="text-white font-bold">STEM Projects:</p>
                </div>
                <div className="w-full bg-white bg-opacity-30 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-green-300 to-blue-500 h-full rounded-full animate-progress"
                    style={{ width: '92%' }}
                  ></div>
                </div>
                <p className="text-right text-white font-bold mt-1">92%</p>
              </div>
              
              <div className="bg-white bg-opacity-20 backdrop-filter backdrop-blur-sm rounded-2xl p-4 border border-white border-opacity-40">
                <div className="flex items-center mb-2">
                  <Rocket className="w-6 h-6 text-purple-300 mr-2" />
                  <p className="text-white font-bold">Innovation:</p>
                </div>
                <div className="w-full bg-white bg-opacity-30 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-300 to-pink-500 h-full rounded-full animate-progress"
                    style={{ width: '78%' }}
                  ></div>
                </div>
                <p className="text-right text-white font-bold mt-1">78%</p>
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-sm rounded-2xl p-6 border border-white border-opacity-20">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">500+</p>
                  <p className="text-white opacity-80 text-sm">Nigerian Students</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">25+</p>
                  <p className="text-white opacity-80 text-sm">Partner Schools</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">15+</p>
                  <p className="text-white opacity-80 text-sm">STEM Programs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">95%</p>
                  <p className="text-white opacity-80 text-sm">Success Rate</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="w-full md:w-1/2 flex justify-center md:justify-end relative">
            <div className="relative w-full max-w-md">
              <div className="absolute top-[-60px] right-[20px] bg-white dark:bg-gray-800 rounded-2xl px-4 py-2 shadow-lg transform rotate-[-5deg] z-10 animate-float">
                <p className="text-xl font-bold text-[#FF914D] dark:text-orange-400">Rillcod Academy! 🚀</p>
              </div>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                {/* Use a proper image with fallback */}
                <img 
                  src="https://images.pexels.com/photos/8535230/pexels-photo-8535230.jpeg"
                  alt="Nigerian Children Learning STEM and Coding at Rillcod Academy"
                  className="w-full h-auto rounded-lg shadow-2xl transform hover:scale-105 transition-transform duration-300 animate-fade-in"
                  onError={(e) => {
                    // Fallback to gradient if image fails
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.innerHTML = `
                        <div class="w-full h-80 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
                          <div class="text-center text-white">
                            <div class="text-6xl mb-4">👨‍💻</div>
                            <h3 class="text-2xl font-bold mb-2">Learning Technology</h3>
                            <p class="text-lg opacity-90">Empowering young minds with coding skills</p>
                          </div>
                        </div>
                      `;
                    }
                  }}
                />
              </div>
              <div className="absolute bottom-[-20px] left-[20px] bg-white dark:bg-gray-800 rounded-2xl px-4 py-2 shadow-lg transform rotate-[5deg] z-10 animate-float-delayed">
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">Benin City Tech Stars! 💻</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        
        @keyframes float-delayed {
          0%, 100% {
            transform: translateY(0) rotate(5deg);
          }
          50% {
            transform: translateY(-15px) rotate(5deg);
          }
        }
        
        @keyframes progress {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
        
        .animate-progress {
          animation: progress 2s ease-out forwards;
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        .animate-float-delayed {
          animation: float-delayed 3s ease-in-out infinite 1.5s;
        }
        
        .animate-fade-in {
          animation: fadeIn 1s ease-out forwards;
        }
        
        .animate-slide-up {
          animation: slideUp 1s ease-out forwards;
        }
        
        .animate-bounce-in {
          animation: bounceIn 1s cubic-bezier(0.36, 0, 0.66, -0.56) forwards;
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes bounceIn {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.8;
          }
          70% {
            transform: scale(0.9);
            opacity: 0.9;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </section>
  );
};

export default Hero;
import React from 'react';
import { Map, Rocket, Crown } from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const Process: React.FC = () => {
  const steps: Step[] = [
    {
      icon: <Map className="w-10 h-10" />,
      title: "Beginner Explorer",
      description: "Start your amazing journey! Learn the basics and make your first programs.",
      color: "bg-green-500"
    },
    {
      icon: <Rocket className="w-10 h-10" />,
      title: "Space Cadet",
      description: "Fly higher with new skills! Build more complex projects and learn advanced concepts.",
      color: "bg-blue-500"
    },
    {
      icon: <Crown className="w-10 h-10" />,
      title: "Coding Champion",
      description: "You're now a coding superhero! Create amazing apps, games, and websites on your own.",
      color: "bg-purple-500"
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-white overflow-hidden">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Your Learning Adventure</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Follow the map to coding greatness!
          </p>
          <div className="w-20 h-2 bg-purple-500 mx-auto rounded-full mt-4"></div>
        </div>
        
        <div className="relative">
          {/* Path connecting the steps */}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-4 bg-gray-200 rounded-full transform -translate-y-1/2 z-0">
            <div className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 rounded-full w-0 transition-all duration-1000" style={{ width: '100%' }}></div>
          </div>
          
          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            {steps.map((step, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className={`w-20 h-20 ${step.color} rounded-full flex items-center justify-center text-white mb-6 shadow-lg transform transition-all duration-300 hover:scale-110`}>
                  {step.icon}
                </div>
                
                <div className="bg-white rounded-xl shadow-md p-6 w-full">
                  <h3 className="text-xl font-bold text-gray-800 mb-3 text-center">{step.title}</h3>
                  <p className="text-gray-600 text-center">{step.description}</p>
                </div>
                
                {/* Footprint path for mobile */}
                {index < steps.length - 1 && (
                  <div className="flex justify-center my-4 md:hidden">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-500">👣</span>
                    </div>
                  </div>
                )}
                
                {/* You are HERE pointer */}
                {index === 0 && (
                  <div className="absolute top-[-40px] left-[calc(16.6%-40px)] hidden md:block">
                    <div className="bg-yellow-400 text-yellow-800 font-bold px-4 py-2 rounded-lg shadow-md transform rotate-[-5deg] animate-bounce">
                      You start HERE!
                    </div>
                  </div>
                )}
                
                {/* Celebration confetti */}
                {index === steps.length - 1 && (
                  <div className="absolute top-[-40px] right-[calc(16.6%-40px)] hidden md:block">
                    <div className="text-4xl animate-bounce">
                      🎉✨
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Process;
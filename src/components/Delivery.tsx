import React from 'react';
import { Calendar, Clock, Users, Monitor, Laptop, Lightbulb } from 'lucide-react';

const Delivery: React.FC = () => {
  return (
    <section className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">How We Deliver</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Flexible, engaging learning experiences tailored to your needs
          </p>
          <div className="w-20 h-2 bg-purple-500 mx-auto rounded-full mt-4"></div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* For Schools */}
          <div className="bg-blue-50 rounded-2xl shadow-md p-8 border-t-4 border-blue-500">
            <div className="flex items-center mb-6">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mr-4">
                <School className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">For Schools</h3>
            </div>
            
            <ul className="space-y-4">
              <li className="flex">
                <Clock className="w-6 h-6 text-blue-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Each session minimum 40 minutes, twice a week, integrated with school schedule</p>
              </li>
              <li className="flex">
                <Users className="w-6 h-6 text-blue-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Project tasks done in groups to encourage collaboration and teamwork</p>
              </li>
              <li className="flex">
                <Monitor className="w-6 h-6 text-blue-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Minimum 10 functional computer systems required for school programs</p>
              </li>
              <li className="flex">
                <Lightbulb className="w-6 h-6 text-blue-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Partnership fee discussion (70% Academy, 30% School split)</p>
              </li>
            </ul>
            
            <div className="mt-8">
              <a
                href="#school-registration"
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white text-lg font-bold rounded-full shadow-md hover:bg-blue-700 transform transition-all duration-300 hover:scale-105"
              >
                Register Your School
              </a>
            </div>
          </div>
          
          {/* For Individual Students */}
          <div className="bg-green-50 rounded-2xl shadow-md p-8 border-t-4 border-green-500">
            <div className="flex items-center mb-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-green-600 mr-4">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">For Individual Students</h3>
            </div>
            
            <ul className="space-y-4">
              <li className="flex">
                <Calendar className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Flexible scheduling options, weekend and after-school classes available</p>
              </li>
              <li className="flex">
                <Users className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Project tasks done in groups to build social and collaborative skills</p>
              </li>
              <li className="flex">
                <Laptop className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Students can attend at Rillcod Technologies facility or bring own devices</p>
              </li>
              <li className="flex">
                <Monitor className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Recommendation: Mini laptop or notebook for personal practice</p>
              </li>
              <li className="flex">
                <Lightbulb className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />
                <p className="text-foreground/80">Individual fee: ₦15,000 per learner (subject to review)</p>
              </li>
            </ul>
            
            <div className="mt-8">
              <a
                href="#student-registration"
                className="inline-flex items-center justify-center px-6 py-3 bg-green-600 text-white text-lg font-bold rounded-full shadow-md hover:bg-green-700 transform transition-all duration-300 hover:scale-105"
              >
                Register Your Child
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Delivery;

import { School } from 'lucide-react';
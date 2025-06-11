import React from 'react';
import { Star, School } from 'lucide-react';

interface School {
  name: string;
  logo: string;
}

const Testimonials: React.FC = () => {
  const schools: School[] = [
    { name: "Deeper Life High School", logo: "DLHS" },
    { name: "Quincy Academy", logo: "QA" },
    { name: "Abundant Grace Preparatory", logo: "AGP" },
    { name: "Montessori School", logo: "MS" }
  ];

  return (
    <section className="py-16 md:py-24 bg-purple-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">Our Partner Schools</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Join these amazing schools that trust Rillcod Academy
          </p>
          <div className="w-20 h-2 bg-purple-500 mx-auto rounded-full mt-4"></div>
        </div>
        
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-8 mb-12">
          <div className="flex justify-center mb-6">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-6 h-6 text-yellow-400 fill-current" />
            ))}
          </div>
          
          <p className="text-xl text-gray-700 text-center italic mb-6">
            "Rillcod Academy projects are fun, creative and support each child in understanding how to solve problems by breaking them down into smaller chunks. A really great life skill."
          </p>
          
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 mr-4">
              <School className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-gray-800">School Principal</h4>
              <p className="text-gray-600 text-sm">Partner School</p>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {schools.map((school, index) => (
            <div 
              key={index}
              className="bg-white rounded-xl shadow-md p-6 flex flex-col items-center transform transition-all duration-300 hover:scale-105 hover:shadow-lg"
            >
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-xl mb-4">
                {school.logo}
              </div>
              <h3 className="text-center font-bold text-gray-800">{school.name}</h3>
              <div className="mt-3 flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-12 text-center">
          <p className="text-xl text-gray-700 mb-6">
            Want to see your school listed here?
          </p>
          <a
            href="#school-registration"
            className="inline-flex items-center justify-center px-6 py-3 bg-purple-600 text-white text-lg font-bold rounded-full shadow-md hover:bg-purple-700 transform transition-all duration-300 hover:scale-105"
          >
            <School className="w-5 h-5 mr-2" />
            Partner with Us
          </a>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
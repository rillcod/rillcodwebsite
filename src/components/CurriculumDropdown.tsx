'use client';

import { useState } from 'react';
import { 
  BookOpenIcon,
  LightBulbIcon,
  CheckCircleIcon,
  StarIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';

interface CurriculumModule {
  title: string;
  duration: string;
  description: string;
  topics?: string[];
  learningObjectives?: string[];
}

interface CurriculumDropdownProps {
  curriculum: CurriculumModule[];
}

export default function CurriculumDropdown({ curriculum }: CurriculumDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition-all duration-300"
      >
        <div className="flex items-center">
          <BookOpenIcon className="w-6 h-6 text-blue-600 mr-3" />
          <h3 className="text-xl font-bold text-gray-800">Detailed Curriculum</h3>
        </div>
        {isOpen ? (
          <ChevronUpIcon className="w-6 h-6 text-gray-600" />
        ) : (
          <ChevronDownIcon className="w-6 h-6 text-gray-600" />
        )}
      </button>
      
      {isOpen && (
        <div className="border-t border-gray-200">
          <div className="p-6">
            <div className="space-y-6">
              {curriculum.map((module, index) => (
                <div key={index} className="border-l-4 border-blue-500 pl-6">
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-4">
                      <span className="text-white font-bold text-sm">{index + 1}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-gray-800">{module.title}</h4>
                    <span className="ml-auto text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      {module.duration}
                    </span>
                  </div>
                  
                  <p className="text-gray-600 mb-4">{module.description}</p>
                  
                  {module.topics && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h5 className="font-semibold text-gray-800 mb-3 flex items-center">
                        <LightBulbIcon className="w-5 h-5 text-yellow-500 mr-2" />
                        Key Topics Covered:
                      </h5>
                      <ul className="space-y-2">
                        {module.topics.map((topic: string, topicIndex: number) => (
                          <li key={topicIndex} className="flex items-start">
                            <CheckCircleIcon className="w-4 h-4 text-green-500 mr-3 mt-1 flex-shrink-0" />
                            <span className="text-gray-700">{topic}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {module.learningObjectives && (
                    <div className="mt-4">
                      <h5 className="font-semibold text-gray-800 mb-2 flex items-center">
                        <StarIcon className="w-5 h-5 text-blue-500 mr-2" />
                        Learning Objectives:
                      </h5>
                      <ul className="space-y-1">
                        {module.learningObjectives.map((objective: string, objIndex: number) => (
                          <li key={objIndex} className="flex items-start">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 mt-2 flex-shrink-0"></div>
                            <span className="text-gray-700 text-sm">{objective}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
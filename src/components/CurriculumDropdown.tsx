// @refresh reset
'use client';

import { useState } from 'react';
import { 
  BookOpenIcon,
  LightBulbIcon,
  CheckCircleIcon,
  StarIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@/lib/icons';

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
    <div className="bg-card rounded-lg shadow-md overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 bg-muted hover:bg-muted/80 transition-all duration-300"
      >
        <div className="flex items-center">
          <BookOpenIcon className="w-6 h-6 text-primary mr-3" />
          <h3 className="text-xl font-bold text-foreground">Detailed Curriculum</h3>
        </div>
        {isOpen ? (
          <ChevronUpIcon className="w-6 h-6 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="w-6 h-6 text-muted-foreground" />
        )}
      </button>
      
      {isOpen && (
        <div className="border-t border-border">
          <div className="p-6">
            <div className="space-y-6">
              {curriculum.map((module, index) => (
                <div key={index} className="border-l-4 border-primary pl-6">
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mr-4">
                      <span className="text-white font-bold text-sm">{index + 1}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-foreground">{module.title}</h4>
                    <span className="ml-auto text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {module.duration}
                    </span>
                  </div>
                  
                  <p className="text-muted-foreground mb-4">{module.description}</p>
                  
                  {module.topics && (
                    <div className="bg-background rounded-lg p-4">
                      <h5 className="font-semibold text-foreground mb-3 flex items-center">
                        <LightBulbIcon className="w-5 h-5 text-yellow-500 mr-2" />
                        Key Topics Covered:
                      </h5>
                      <ul className="space-y-2">
                        {module.topics.map((topic: string, topicIndex: number) => (
                          <li key={topicIndex} className="flex items-start">
                            <CheckCircleIcon className="w-4 h-4 text-green-500 mr-3 mt-1 flex-shrink-0" />
                            <span className="text-foreground/80">{topic}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {module.learningObjectives && (
                    <div className="mt-4">
                      <h5 className="font-semibold text-foreground mb-2 flex items-center">
                        <StarIcon className="w-5 h-5 text-primary mr-2" />
                        Learning Objectives:
                      </h5>
                      <ul className="space-y-1">
                        {module.learningObjectives.map((objective: string, objIndex: number) => (
                          <li key={objIndex} className="flex items-start">
                            <div className="w-2 h-2 bg-primary rounded-full mr-3 mt-2 flex-shrink-0"></div>
                            <span className="text-foreground/80 text-sm">{objective}</span>
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
'use client';

import { StudentPortfolio, PortfolioProject } from '@/services/portfolio.service';
import ProjectCard from './ProjectCard';

interface PortfolioShowcaseProps {
  portfolio: StudentPortfolio;
  isOwner?: boolean;
}

export default function PortfolioShowcase({ portfolio, isOwner = false }: PortfolioShowcaseProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-8 text-white">
        <div className="flex items-start gap-4">
          {portfolio.avatar_url && (
            <img
              src={portfolio.avatar_url}
              alt={portfolio.student_name}
              className="w-20 h-20 rounded-full object-cover"
            />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{portfolio.student_name}</h1>
            <p className="mt-2 text-blue-100">{portfolio.bio}</p>

            {isOwner && (
              <button className="mt-3 px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors">
                Edit Portfolio
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Skills */}
      {portfolio.skills.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {portfolio.skills.map(skill => (
              <span
                key={skill}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Projects</h2>

        {portfolio.projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {portfolio.projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                isOwner={isOwner}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No projects published yet</p>
            {isOwner && (
              <p className="text-sm text-gray-400 mt-2">
                Complete projects and publish them to showcase your work
              </p>
            )}
          </div>
        )}
      </div>

      {/* Shareable URL */}
      {isOwner && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Share Your Portfolio</h3>
          <p className="text-sm text-gray-600 mb-3">
            Share your portfolio with others using this link:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={portfolio.shareableUrl}
              readOnly
              className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-mono"
            />
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

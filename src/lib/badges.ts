export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  condition: string;
  color: string;
}

export const BADGES: Record<string, Badge> = {
  course_mastery: {
    id: 'course_mastery',
    name: 'Course Master',
    description: 'Complete 5 full courses with 80%+ average',
    icon: '🎓',
    rarity: 'epic',
    condition: '5+ courses completed with 80%+ average',
    color: 'from-purple-500 to-blue-500'
  },
  assignment_excellence: {
    id: 'assignment_excellence',
    name: 'Assignment Excellence',
    description: 'Complete 20+ assignments with perfect or near-perfect scores',
    icon: '⭐',
    rarity: 'rare',
    condition: '20+ assignments with 90%+ score',
    color: 'from-yellow-500 to-orange-500'
  },
  project_creator: {
    id: 'project_creator',
    name: 'Project Creator',
    description: 'Build and showcase 5+ projects in portfolio',
    icon: '🚀',
    rarity: 'rare',
    condition: '5+ projects in portfolio',
    color: 'from-green-500 to-emerald-500'
  },
  speed_learner: {
    id: 'speed_learner',
    name: 'Speed Learner',
    description: 'Complete 10+ lessons in a single week',
    icon: '⚡',
    rarity: 'uncommon',
    condition: '10+ lessons completed in one week',
    color: 'from-red-500 to-pink-500'
  },
  consistency_champion: {
    id: 'consistency_champion',
    name: 'Consistency Champion',
    description: 'Complete at least 1 lesson every day for 30 consecutive days',
    icon: '🔥',
    rarity: 'epic',
    condition: '30 day learning streak',
    color: 'from-orange-500 to-red-500'
  },
  code_ninja: {
    id: 'code_ninja',
    name: 'Code Ninja',
    description: 'Complete 15+ coding assignments with 95%+ accuracy',
    icon: '🥷',
    rarity: 'epic',
    condition: '15+ coding assignments with 95%+ accuracy',
    color: 'from-gray-700 to-black'
  },
  all_rounder: {
    id: 'all_rounder',
    name: 'All-Rounder',
    description: 'Complete lessons in 5+ different skill categories',
    icon: '🎯',
    rarity: 'rare',
    condition: 'Master 5+ different skill categories',
    color: 'from-indigo-500 to-purple-500'
  },
  first_step: {
    id: 'first_step',
    name: 'First Step',
    description: 'Complete your first lesson',
    icon: '👣',
    rarity: 'common',
    condition: 'Complete 1 lesson',
    color: 'from-blue-400 to-cyan-400'
  },
  lesson_streak_7: {
    id: 'lesson_streak_7',
    name: 'Week Warrior',
    description: 'Complete 7 consecutive days of lessons',
    icon: '📅',
    rarity: 'uncommon',
    condition: '7 day learning streak',
    color: 'from-green-400 to-teal-400'
  },
  portfolio_star: {
    id: 'portfolio_star',
    name: 'Portfolio Star',
    description: 'Publish your first project to portfolio',
    icon: '✨',
    rarity: 'uncommon',
    condition: 'First project published',
    color: 'from-amber-400 to-yellow-400'
  }
};

export interface Milestone {
  id: string;
  name: string;
  description: string;
  target: number;
  current: number;
  icon: string;
  progress: number;
}

export function calculateMilestones(
  lessonsCompleted: number,
  assignmentsCompleted: number,
  projectsCreated: number,
  currentStreak: number
): Milestone[] {
  return [
    {
      id: 'lessons_milestone',
      name: 'Lessons Completed',
      description: 'Keep learning new concepts',
      target: 50,
      current: lessonsCompleted,
      icon: '📚',
      progress: Math.min((lessonsCompleted / 50) * 100, 100)
    },
    {
      id: 'assignments_milestone',
      name: 'Assignments Completed',
      description: 'Practice makes perfect',
      target: 100,
      current: assignmentsCompleted,
      icon: '✍️',
      progress: Math.min((assignmentsCompleted / 100) * 100, 100)
    },
    {
      id: 'projects_milestone',
      name: 'Projects Created',
      description: 'Build amazing things',
      target: 10,
      current: projectsCreated,
      icon: '🔧',
      progress: Math.min((projectsCreated / 10) * 100, 100)
    },
    {
      id: 'streak_milestone',
      name: 'Current Learning Streak',
      description: 'Stay consistent',
      target: 30,
      current: currentStreak,
      icon: '🔥',
      progress: Math.min((currentStreak / 30) * 100, 100)
    }
  ];
}

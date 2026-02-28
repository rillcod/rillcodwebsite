import { useAuth } from '@/contexts/auth-context';
import { BookOpenIcon, TrophyIcon, StarIcon, RocketLaunchIcon, PuzzlePieceIcon, SparklesIcon, LightBulbIcon, HeartIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useState } from 'react';
import Image from 'next/image';

interface Achievement {
  id: number;
  title: string;
  description: string;
  icon: any;
  progress: number;
  total: number;
  reward: string;
}

interface Lesson {
  id: number;
  title: string;
  description: string;
  progress: number;
  image: string;
  difficulty: 'easy' | 'medium' | 'hard';
  stars: number;
}

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [currentStreak] = useState(3);
  const [totalPoints] = useState(1250);

  const achievements: Achievement[] = [
    {
      id: 1,
      title: 'Coding Explorer',
      description: 'Complete 5 coding challenges',
      icon: RocketLaunchIcon,
      progress: 3,
      total: 5,
      reward: '🌟 Explorer Badge',
    },
    {
      id: 2,
      title: 'Math Wizard',
      description: 'Solve 10 math puzzles',
      icon: PuzzlePieceIcon,
      progress: 7,
      total: 10,
      reward: '🧮 Math Badge',
    },
    {
      id: 3,
      title: 'Creative Artist',
      description: 'Create 3 digital art projects',
      icon: SparklesIcon,
      progress: 2,
      total: 3,
      reward: '🎨 Artist Badge',
    },
  ];

  const lessons: Lesson[] = [
    {
      id: 1,
      title: 'Fun with Python',
      description: 'Learn to code with fun games!',
      progress: 75,
      image: '/images/lessons/python-kids.svg',
      difficulty: 'easy',
      stars: 3,
    },
    {
      id: 2,
      title: 'Math Adventures',
      description: 'Solve puzzles and win prizes!',
      progress: 45,
      image: '/images/lessons/math-kids.svg',
      difficulty: 'medium',
      stars: 2,
    },
    {
      id: 3,
      title: 'Creative Coding',
      description: 'Make your own games and stories!',
      progress: 30,
      image: '/images/lessons/creative-kids.svg',
      difficulty: 'easy',
      stars: 1,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl p-8 text-white shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="relative w-20 h-20">
            <Image src="/images/avatar-placeholder.svg" alt="Student Avatar" fill className="rounded-full border-4 border-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2">Hi, {profile?.full_name}! 👋</h1>
            <p className="text-purple-100">Ready for today's adventure?</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold">{currentStreak}</div>
            <div className="text-sm">Day Streak 🔥</div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold">{totalPoints}</div>
            <div className="text-sm">Points ⭐</div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold">3</div>
            <div className="text-sm">Badges 🏆</div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-3xl p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
          <BookOpenIcon className="h-6 w-6 mr-2 text-purple-500" />
          Your Learning Journey
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lessons.map((lesson) => (
            <div key={lesson.id} className="bg-gray-50 rounded-2xl p-4 hover:shadow-md transition-shadow">
              <div className="relative h-40 mb-4 rounded-xl overflow-hidden">
                <Image src={lesson.image} alt={lesson.title} fill className="object-cover" />
                <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded-full text-sm font-medium">
                  {lesson.difficulty === 'easy' ? '🌟 Easy' : lesson.difficulty === 'medium' ? '🌟🌟 Medium' : '🌟🌟🌟 Hard'}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{lesson.title}</h3>
              <p className="text-gray-600 mb-4">{lesson.description}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Progress</span>
                  <span className="font-medium text-purple-600">{lesson.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${lesson.progress}%` }} />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex">
                    {[...Array(lesson.stars)].map((_, i) => (
                      <StarIcon key={i} className="h-5 w-5 text-yellow-400" />
                    ))}
                  </div>
                  <Link href={`/dashboard/lessons/${lesson.id}`} className="text-purple-600 hover:text-purple-700 font-medium">
                    Continue →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-3xl p-6 shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
          <TrophyIcon className="h-6 w-6 mr-2 text-yellow-500" />
          Your Achievements
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {achievements.map((achievement) => {
            const Icon = achievement.icon;
            return (
              <div key={achievement.id} className="bg-gray-50 rounded-2xl p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="p-3 bg-purple-100 rounded-xl">
                    <Icon className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{achievement.title}</h3>
                    <p className="text-sm text-gray-600">{achievement.description}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium text-purple-600">{achievement.progress}/{achievement.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: `${(achievement.progress / achievement.total) * 100}%` }} />
                  </div>
                  <p className="text-sm text-purple-600 font-medium mt-2">Reward: {achievement.reward}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/dashboard/playground" className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white text-center hover:shadow-lg transition-all transform hover:-translate-y-1">
          <PuzzlePieceIcon className="h-8 w-8 mx-auto mb-2" />
          <span className="font-medium">Playground</span>
        </Link>
        <Link href="/dashboard/challenges" className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white text-center hover:shadow-lg transition-all transform hover:-translate-y-1">
          <RocketLaunchIcon className="h-8 w-8 mx-auto mb-2" />
          <span className="font-medium">Challenges</span>
        </Link>
        <Link href="/dashboard/friends" className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl p-6 text-white text-center hover:shadow-lg transition-all transform hover:-translate-y-1">
          <HeartIcon className="h-8 w-8 mx-auto mb-2" />
          <span className="font-medium">Friends</span>
        </Link>
        <Link href="/dashboard/help" className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white text-center hover:shadow-lg transition-all transform hover:-translate-y-1">
          <LightBulbIcon className="h-8 w-8 mx-auto mb-2" />
          <span className="font-medium">Help</span>
        </Link>
      </div>
    </div>
  );
} 
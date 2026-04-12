'use client';

import { Badge } from '@/lib/badges';
import { motion } from 'framer-motion';

interface BadgeCardProps {
  badge: Badge;
  earned: boolean;
  showDetails?: boolean;
}

const rarityColors = {
  common: 'from-gray-400 to-gray-500',
  uncommon: 'from-green-400 to-green-600',
  rare: 'from-blue-400 to-blue-600',
  epic: 'from-purple-400 to-purple-600',
  legendary: 'from-yellow-400 to-red-600'
};

const rarityBorder = {
  common: 'border-gray-400',
  uncommon: 'border-green-400',
  rare: 'border-blue-400',
  epic: 'border-purple-400',
  legendary: 'border-yellow-400'
};

export default function BadgeCard({ badge, earned, showDetails = false }: BadgeCardProps) {
  return (
    <motion.div
      whileHover={{ scale: earned ? 1.05 : 1 }}
      className={`relative rounded-lg p-4 text-center transition-all ${
        earned
          ? `bg-gradient-to-br ${badge.color} shadow-lg`
          : 'bg-gray-200 opacity-50'
      } border-2 ${rarityBorder[badge.rarity]}`}
    >
      {earned && (
        <div className="absolute top-1 right-1 text-xs font-bold px-2 py-1 bg-white rounded-full text-gray-800">
          {badge.rarity.toUpperCase()}
        </div>
      )}

      <div className="text-4xl mb-2">{badge.icon}</div>
      <h3 className={`font-bold text-sm ${earned ? 'text-white' : 'text-gray-700'}`}>
        {badge.name}
      </h3>

      {showDetails && (
        <p className={`text-xs mt-2 ${earned ? 'text-white' : 'text-gray-600'}`}>
          {badge.description}
        </p>
      )}

      {!earned && (
        <p className="text-xs text-gray-500 mt-2">Locked</p>
      )}
    </motion.div>
  );
}

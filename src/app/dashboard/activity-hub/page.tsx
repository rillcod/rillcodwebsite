'use client';

import { useState } from 'react';
import type React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SparklesIcon,
  UserGroupIcon,
  ArchiveBoxIcon,
  RocketLaunchIcon,
  CommandLineIcon,
} from '@/lib/icons';
import dynamic from 'next/dynamic';

// Dynamically import the core contents of each page to keep the Hub bundle manageable
const SocialHub = dynamic(() => import('../engage/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Loading Social Hub...</div>
});
const ResourceVault = dynamic(() => import('../vault/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Loading Code Vault...</div>
});
const SkillQuests = dynamic(() => import('../missions/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Loading Skill Quests...</div>
});
const MasteryProtocol = dynamic(() => import('../protocol/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Loading Mastery Protocol...</div>
});

type TabId = 'social' | 'vault' | 'quests' | 'protocol';

interface TabConfig {
  id: TabId;
  name: string;
  description: string;
  bannerDescription: string;
  icon: React.FC<{ className?: string }>;
  color: string;
}

const TABS: TabConfig[] = [
  {
    id: 'social',
    name: 'Social Hub',
    description: 'Connect with peers and share innovations',
    bannerDescription: 'Post updates, react to peer builds, and give feedback in the community feed. Collaborate on projects, celebrate wins, and grow together as a coding community.',
    icon: UserGroupIcon,
    color: 'text-primary',
  },
  {
    id: 'vault',
    name: 'Code Vault',
    description: 'Secure personal library for code snippets',
    bannerDescription: 'Save, tag, and search your go-to code snippets, templates, and references. Your private library stays organised and instantly accessible — no more hunting through old projects.',
    icon: ArchiveBoxIcon,
    color: 'text-primary',
  },
  {
    id: 'quests',
    name: 'Skill Quests',
    description: 'Gamified challenges to level up skills',
    bannerDescription: 'Take on coding missions that earn XP, unlock badges, and build streaks. Each quest targets a real skill — from loops to APIs — so every challenge moves you forward.',
    icon: RocketLaunchIcon,
    color: 'text-emerald-500',
  },
  {
    id: 'protocol',
    name: 'Mastery Protocol',
    description: 'Guided step-by-step path to programming mastery',
    bannerDescription: 'Follow a structured track from fundamentals to advanced concepts. Complete milestones, earn certifications, and build the disciplined habits that separate great developers from the rest.',
    icon: CommandLineIcon,
    color: 'text-primary',
  },
];

// Aesthetic map to bypass dynamic Tailwind utility restrictions
const TAB_AESTHETICS = {
  social: {
    bg20: 'bg-orange-600/20',
    bg10: 'bg-orange-600/10',
    bg5: 'bg-orange-600/5',
    border30: 'border-orange-600/30',
    border500: 'border-orange-500',
    bgFull: 'bg-orange-600',
    textGradient: 'from-primary to-amber-500',
  },
  vault: {
    bg20: 'bg-violet-600/20',
    bg10: 'bg-violet-600/10',
    bg5: 'bg-violet-600/5',
    border30: 'border-violet-600/30',
    border500: 'border-violet-500',
    bgFull: 'bg-violet-600',
    textGradient: 'from-primary to-purple-500',
  },
  quests: {
    bg20: 'bg-emerald-600/20',
    bg10: 'bg-emerald-600/10',
    bg5: 'bg-emerald-600/5',
    border30: 'border-emerald-600/30',
    border500: 'border-emerald-500',
    bgFull: 'bg-emerald-600',
    textGradient: 'from-emerald-600 to-teal-500',
  },
  protocol: {
    bg20: 'bg-blue-600/20',
    bg10: 'bg-blue-600/10',
    bg5: 'bg-blue-600/5',
    border30: 'border-blue-600/30',
    border500: 'border-blue-500',
    bgFull: 'bg-blue-600',
    textGradient: 'from-primary to-indigo-500',
  },
};

export default function ActivityHubPage() {
  const [activeTab, setActiveTab] = useState<TabId>('social');

  const currentTab = TABS.find(t => t.id === activeTab)!;
  const currentAesthetic = TAB_AESTHETICS[activeTab];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* ── Background Aesthetics ── */}
      <div className="fixed inset-0 pointer-events-none opacity-30 dark:opacity-20">
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] ${currentAesthetic.bg20} blur-[120px] transition-all duration-1000`} />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-primary/10 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* ── Unit Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="px-4 py-1.5 bg-muted/50 border border-border text-muted-foreground text-[9px] font-black uppercase tracking-[0.4em] flex items-center gap-3">
                <SparklesIcon className="w-3 h-3" />
                Dashboard / Activity Hub
              </div>
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase italic leading-none">
              Activity<br />
              <span className={`text-transparent bg-clip-text bg-gradient-to-r ${currentAesthetic.textGradient} transition-all duration-700`}>
                Hub.
              </span>
            </h1>
          </div>

          {/* Quick Stats or Status */}
          <div className="hidden lg:flex items-center gap-4">
            {TABS.map(tab => {
              const aes = TAB_AESTHETICS[tab.id];
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col gap-2 p-5 border transition-all duration-500 min-w-[160px] text-left group overflow-hidden relative ${
                    isSelected 
                      ? `${aes.bg10} ${aes.border30}` 
                      : 'bg-muted/20 border-border hover:border-muted-foreground/30'
                  }`}
                >
                  {isSelected && (
                    <motion.div layoutId="activeBG" className={`absolute inset-0 ${aes.bg5}`} />
                  )}
                  <tab.icon className={`w-5 h-5 relative z-10 ${isSelected ? tab.color : 'text-muted-foreground/40'}`} />
                  <div className="relative z-10">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${isSelected ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                      {tab.name}
                    </p>
                    <div className={`h-0.5 mt-2 transition-all duration-500 ${isSelected ? `w-full ${aes.bgFull}` : 'w-4 bg-border'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Mobile Tab Bar ── */}
        <div className="lg:hidden flex overflow-x-auto pb-4 gap-3 scrollbar-hide">
          {TABS.map(tab => {
            const aes = TAB_AESTHETICS[tab.id];
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-6 py-3 border whitespace-nowrap transition-all ${
                  isSelected 
                    ? `${aes.bgFull} ${aes.border500} text-white font-black` 
                    : 'bg-muted/30 border-border text-muted-foreground font-bold hover:bg-muted/50'
                } text-[10px] uppercase tracking-widest`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.name}
              </button>
            );
          })}
        </div>

        {/* ── Hero/Banner per Tab ── */}
        <div className="bg-card border border-border overflow-hidden relative group">
          <div className={`absolute top-0 right-0 w-[400px] h-[400px] ${currentAesthetic.bg10} blur-[100px] -mr-32 -mt-32 pointer-events-none`} />
          <div className="p-8 sm:p-12 relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl">
              <h2 className={`text-2xl sm:text-3xl font-black uppercase tracking-tight ${currentTab.color}`}>
                {currentTab.name}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground font-medium leading-relaxed">
                {currentTab.bannerDescription}
              </p>
            </div>
            <div className={`w-20 h-20 ${currentAesthetic.bg20} border ${currentAesthetic.border30} flex items-center justify-center`}>
               <currentTab.icon className={`w-10 h-10 ${currentTab.color}`} />
            </div>
          </div>
        </div>

        {/* ── Dynamic Content Render ── */}
        <div className="min-h-[600px] bg-card/30 border border-border relative overflow-hidden">
          <AnimatePresence mode="wait">
             <motion.div
               key={activeTab}
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -20 }}
               transition={{ duration: 0.3 }}
               className="h-full"
             >
                {activeTab === 'social' && <SocialHub isEmbedded={true} />}
                {activeTab === 'vault' && <ResourceVault isEmbedded={true} />}
                {activeTab === 'quests' && <SkillQuests isEmbedded={true} />}
                {activeTab === 'protocol' && <MasteryProtocol isEmbedded={true} />}
             </motion.div>
          </AnimatePresence>
        </div>

      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

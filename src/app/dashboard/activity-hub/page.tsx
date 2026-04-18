'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SparklesIcon,
  UserGroupIcon,
  ArchiveBoxIcon,
  RocketLaunchIcon,
  CommandLineIcon,
  ChevronRightIcon,
} from '@/lib/icons';
import dynamic from 'next/dynamic';

// Dynamically import the core contents of each page to keep the Hub bundle manageable
const SocialHub = dynamic(() => import('../engage/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Initialising Social Stream...</div>
});
const ResourceVault = dynamic(() => import('../vault/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Accessing Encrypted Vault...</div>
});
const SkillQuests = dynamic(() => import('../missions/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Loading Academic Quests...</div>
});
const MasteryProtocol = dynamic(() => import('../protocol/page'), {
  loading: () => <div className="p-12 text-center animate-pulse text-muted-foreground uppercase font-black tracking-widest">Syncing Mastery Protocol...</div>
});

type TabId = 'social' | 'vault' | 'quests' | 'protocol';

interface TabConfig {
  id: TabId;
  name: string;
  description: string;
  icon: any;
  color: string;
  bgColor: string;
  accentColor: string;
}

const TABS: TabConfig[] = [
  {
    id: 'social',
    name: 'Social Hub',
    description: 'Connect with peers and share innovations',
    icon: UserGroupIcon,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    accentColor: 'orange',
  },
  {
    id: 'vault',
    name: 'Code Vault',
    description: 'Secure personal library for code snippets',
    icon: ArchiveBoxIcon,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
    accentColor: 'violet',
  },
  {
    id: 'quests',
    name: 'Skill Quests',
    description: 'Gamified challenges to level up skills',
    icon: RocketLaunchIcon,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    accentColor: 'emerald',
  },
  {
    id: 'protocol',
    name: 'Mastery Protocol',
    description: 'Industrial path to technical mastery',
    icon: CommandLineIcon,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    accentColor: 'blue',
  },
];

export default function ActivityHubPage() {
  const [activeTab, setActiveTab] = useState<TabId>('social');

  const currentTab = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* ── Background Aesthetics ── */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] bg-${currentTab.accentColor}-600/20 blur-[120px] transition-all duration-1000`} />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/10 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* ── Unit Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="px-4 py-1.5 bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase tracking-[0.4em] flex items-center gap-3">
                <SparklesIcon className="w-3 h-3" />
                Sector: Activity Hub
              </div>
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase italic leading-none">
              Activity<br />
              <span className={`text-transparent bg-clip-text bg-gradient-to-r ${currentTab.id === 'social' ? 'from-orange-600 to-amber-500' : currentTab.id === 'vault' ? 'from-violet-600 to-purple-500' : currentTab.id === 'quests' ? 'from-emerald-600 to-teal-500' : 'from-blue-600 to-indigo-500'} transition-all duration-700`}>
                Hub.
              </span>
            </h1>
          </div>

          {/* Quick Stats or Status */}
          <div className="hidden lg:flex items-center gap-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col gap-2 p-5 border transition-all duration-500 min-w-[160px] text-left group overflow-hidden relative ${
                  activeTab === tab.id 
                    ? `bg-${tab.accentColor}-600/10 border-${tab.accentColor}-600/30` 
                    : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div layoutId="activeBG" className={`absolute inset-0 bg-${tab.accentColor}-600/5`} />
                )}
                <tab.icon className={`w-5 h-5 relative z-10 ${activeTab === tab.id ? tab.color : 'text-white/20'}`} />
                <div className="relative z-10">
                  <p className={`text-[9px] font-black uppercase tracking-widest ${activeTab === tab.id ? 'text-white' : 'text-white/30'}`}>
                    {tab.name}
                  </p>
                  <div className={`h-0.5 mt-2 transition-all duration-500 ${activeTab === tab.id ? `w-full bg-${tab.accentColor}-600` : 'w-4 bg-white/10'}`} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Mobile Tab Bar ── */}
        <div className="lg:hidden flex overflow-x-auto pb-4 gap-3 scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-6 py-3 border whitespace-nowrap transition-all ${
                activeTab === tab.id 
                  ? `bg-${tab.accentColor}-600 border-${tab.accentColor}-500 text-white font-black` 
                  : 'bg-white/5 border-white/10 text-white/40 font-bold'
              } text-[10px] uppercase tracking-widest`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.name}
            </button>
          ))}
        </div>

        {/* ── Hero/Banner per Tab ── */}
        <div className="bg-white/[0.03] border border-white/10 overflow-hidden relative group">
          <div className={`absolute top-0 right-0 w-[400px] h-[400px] bg-${currentTab.accentColor}-600/10 blur-[100px] -mr-32 -mt-32 pointer-events-none`} />
          <div className="p-8 sm:p-12 relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl">
              <h2 className={`text-2xl sm:text-3xl font-black uppercase tracking-tight ${currentTab.color}`}>
                {currentTab.name}
              </h2>
              <p className="text-sm sm:text-base text-white/50 font-medium leading-relaxed">
                {currentTab.description}. Engage with interactive tools, secure your intellectual property, and track your industrial progress.
              </p>
            </div>
            <div className={`w-20 h-20 bg-${currentTab.accentColor}-600/20 border border-${currentTab.accentColor}-600/30 flex items-center justify-center`}>
               <currentTab.icon className={`w-10 h-10 ${currentTab.color}`} />
            </div>
          </div>
        </div>

        {/* ── Dynamic Content Render ── */}
        <div className="min-h-[600px] bg-card/5 border border-white/10 relative overflow-hidden">
          <AnimatePresence mode="wait">
             <motion.div
               key={activeTab}
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -20 }}
               transition={{ duration: 0.3 }}
               className="h-full"
             >
                {activeTab === 'social' && <SocialHub />}
                {activeTab === 'vault' && <ResourceVault />}
                {activeTab === 'quests' && <SkillQuests />}
                {activeTab === 'protocol' && <MasteryProtocol />}
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

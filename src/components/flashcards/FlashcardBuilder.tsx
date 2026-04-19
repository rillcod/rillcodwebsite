'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SparklesIcon,
  DocumentTextIcon,
  PhotoIcon,
  BeakerIcon,
  CubeIcon,
  PaintBrushIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  XMarkIcon,
  CheckIcon,
  ArrowPathIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon
} from '@/lib/icons';

// Card Templates with different styles and animations
const CARD_TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic',
    icon: DocumentTextIcon,
    description: 'Simple and clean design',
    frontStyle: 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200',
    backStyle: 'bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200',
    textStyle: 'text-gray-800',
    animation: 'flip'
  },
  {
    id: 'modern',
    name: 'Modern',
    icon: CubeIcon,
    description: 'Sleek gradient design',
    frontStyle: 'bg-gradient-to-br from-purple-600 to-blue-600 text-white',
    backStyle: 'bg-gradient-to-br from-orange-500 to-red-500 text-white',
    textStyle: 'text-white',
    animation: 'slide'
  },
  {
    id: 'neon',
    name: 'Neon',
    icon: BeakerIcon,
    description: 'Vibrant neon effects',
    frontStyle: 'bg-black border-2 border-cyan-400 shadow-lg shadow-cyan-400/50',
    backStyle: 'bg-black border-2 border-pink-400 shadow-lg shadow-pink-400/50',
    textStyle: 'text-cyan-400',
    animation: 'glow'
  },
  {
    id: 'minimal',
    name: 'Minimal',
    icon: DocumentTextIcon,
    description: 'Clean minimalist style',
    frontStyle: 'bg-white border border-gray-200 shadow-sm',
    backStyle: 'bg-gray-50 border border-gray-200 shadow-sm',
    textStyle: 'text-gray-900',
    animation: 'fade'
  },
  {
    id: 'playful',
    name: 'Playful',
    icon: PhotoIcon,
    description: 'Fun and colorful for kids',
    frontStyle: 'bg-gradient-to-br from-yellow-300 via-pink-300 to-purple-400',
    backStyle: 'bg-gradient-to-br from-green-300 via-blue-300 to-indigo-400',
    textStyle: 'text-gray-800 font-bold',
    animation: 'bounce'
  },
  {
    id: 'professional',
    name: 'Professional',
    icon: PaintBrushIcon,
    description: 'Corporate and elegant',
    frontStyle: 'bg-gradient-to-br from-slate-800 to-slate-900 text-white',
    backStyle: 'bg-gradient-to-br from-slate-700 to-slate-800 text-white',
    textStyle: 'text-white',
    animation: 'slide'
  }
];

interface FlashcardBuilderProps {
  deckId: string;
  onClose: () => void;
  onCardCreated: () => void;
}

export default function FlashcardBuilder({ deckId, onClose, onCardCreated }: FlashcardBuilderProps) {
  const [selectedTemplate, setSelectedTemplate] = useState(CARD_TEMPLATES[0]);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [cards, setCards] = useState([{ front: '', back: '', id: Date.now() }]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // AI Generation State
  const [aiTopic, setAiTopic] = useState('');
  const [aiContent, setAiContent] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [showAiPanel, setShowAiPanel] = useState(false);

  const addCard = () => {
    setCards([...cards, { front: '', back: '', id: Date.now() }]);
  };

  const removeCard = (id: number) => {
    if (cards.length > 1) {
      setCards(cards.filter(card => card.id !== id));
    }
  };

  const updateCard = (id: number, field: 'front' | 'back', value: string) => {
    setCards(cards.map(card => 
      card.id === id ? { ...card, [field]: value } : card
    ));
  };

  const generateAICards = async () => {
    if (!aiTopic.trim() && !aiContent.trim()) return;
    
    setAiGenerating(true);
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          content: aiContent,
          count: aiCount,
          difficulty: aiDifficulty,
          template: selectedTemplate.id
        })
      });
      
      const json = await res.json();
      if (res.ok && json.cards) {
        // Add generated cards to current cards
        const newCards = json.cards.map((card: any, index: number) => ({
          front: card.front,
          back: card.back,
          id: Date.now() + index
        }));
        setCards([...cards, ...newCards]);
        setShowAiPanel(false);
        setAiTopic('');
        setAiContent('');
      } else {
        alert(json.error || 'Failed to generate flashcards');
      }
    } catch (error) {
      alert('Failed to generate flashcards');
    } finally {
      setAiGenerating(false);
    }
  };

  const saveCards = async () => {
    const validCards = cards.filter(card => card.front.trim() && card.back.trim());
    if (validCards.length === 0) {
      alert('Please add at least one complete card');
      return;
    }

    setSaving(true);
    try {
      const promises = validCards.map(card =>
        fetch(`/api/flashcards/decks/${deckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            front: card.front,
            back: card.back,
            template: selectedTemplate.id
          })
        })
      );

      await Promise.all(promises);
      onCardCreated();
      onClose();
    } catch (error) {
      alert('Failed to save cards');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-background border border-border w-full max-w-7xl h-[90vh] flex overflow-hidden">
        
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black">Flashcard Builder</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-muted px-2 py-1 rounded-full">
                {cards.filter(c => c.front.trim() && c.back.trim()).length} cards ready
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiPanel(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors"
            >
              <SparklesIcon className="w-4 h-4" />
              AI Generate
            </button>
            
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
            >
              <EyeIcon className="w-4 h-4" />
              Preview
            </button>
            
            <button
              onClick={saveCards}
              disabled={saving || cards.filter(c => c.front.trim() && c.back.trim()).length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
            >
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              Save Cards
            </button>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex w-full pt-20">
          {/* Left Panel - Templates & Controls */}
          <div className="w-80 border-r border-border p-6 overflow-y-auto">
            <div className="space-y-6">
              
              {/* Template Selection */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <DocumentTextIcon className="w-4 h-4" />
                  Card Templates
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {CARD_TEMPLATES.map(template => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className={`p-3 border rounded-lg text-left transition-all ${
                        selectedTemplate.id === template.id
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <template.icon className="w-5 h-5 mb-2" />
                      <p className="text-xs font-bold">{template.name}</p>
                      <p className="text-[10px] text-muted-foreground">{template.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Device Selection */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3">Preview Device</h3>
                <div className="flex gap-2">
                  {[
                    { id: 'mobile', icon: DevicePhoneMobileIcon, label: 'Mobile' },
                    { id: 'tablet', icon: ComputerDesktopIcon, label: 'Tablet' },
                    { id: 'desktop', icon: ComputerDesktopIcon, label: 'Desktop' }
                  ].map(device => (
                    <button
                      key={device.id}
                      onClick={() => setPreviewDevice(device.id as any)}
                      className={`flex-1 flex flex-col items-center gap-1 p-2 border rounded-lg transition-all ${
                        previewDevice === device.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <device.icon className="w-4 h-4" />
                      <span className="text-[10px]">{device.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={addCard}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Card
                  </button>
                  
                  <button
                    onClick={() => setCards([{ front: '', back: '', id: Date.now() }])}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Center Panel - Card Editor */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Card Editor</h3>
                <span className="text-sm text-muted-foreground">
                  Using {selectedTemplate.name} template
                </span>
              </div>

              {cards.map((card, index) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border p-4 rounded-lg space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm">Card {index + 1}</h4>
                    {cards.length > 1 && (
                      <button
                        onClick={() => removeCard(card.id)}
                        className="p-1 hover:bg-muted rounded text-red-400 hover:text-red-300"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground mb-2">
                        Front (Question)
                      </label>
                      <textarea
                        value={card.front}
                        onChange={(e) => updateCard(card.id, 'front', e.target.value)}
                        placeholder="Enter the question or prompt..."
                        className="w-full h-24 bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground mb-2">
                        Back (Answer)
                      </label>
                      <textarea
                        value={card.back}
                        onChange={(e) => updateCard(card.id, 'back', e.target.value)}
                        placeholder="Enter the answer or explanation..."
                        className="w-full h-24 bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
              
              <button
                onClick={addCard}
                className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-muted-foreground/30 hover:border-orange-500/50 text-muted-foreground hover:text-orange-500 transition-colors"
              >
                <PlusIcon className="w-5 h-5" />
                Add Another Card
              </button>
            </div>
          </div>

          {/* Right Panel - Live Preview */}
          {showPreview && (
            <div className="w-96 border-l border-border p-6 overflow-y-auto">
              <FlashcardPreview
                cards={cards.filter(c => c.front.trim() && c.back.trim())}
                template={selectedTemplate}
                device={previewDevice}
              />
            </div>
          )}
        </div>
      </div>

      {/* AI Generation Modal */}
      <AnimatePresence>
        {showAiPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background border border-border rounded-lg w-full max-w-2xl p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-purple-400" />
                  <h3 className="text-xl font-bold">AI Flashcard Generator</h3>
                </div>
                <button
                  onClick={() => setShowAiPanel(false)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-foreground mb-2">
                    Topic or Subject
                  </label>
                  <input
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="e.g., Python functions, World War II, Cell biology"
                    className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-foreground mb-2">
                    Content (Optional)
                  </label>
                  <textarea
                    value={aiContent}
                    onChange={(e) => setAiContent(e.target.value)}
                    placeholder="Paste your study material, notes, or textbook content here..."
                    rows={4}
                    className="w-full bg-background border border-border px-4 py-3 text-sm resize-none focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">
                      Number of Cards
                    </label>
                    <select
                      value={aiCount}
                      onChange={(e) => setAiCount(Number(e.target.value))}
                      className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
                    >
                      <option value={5}>5 cards</option>
                      <option value={10}>10 cards</option>
                      <option value={15}>15 cards</option>
                      <option value={20}>20 cards</option>
                      <option value={25}>25 cards</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">
                      Difficulty Level
                    </label>
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value)}
                      className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAiPanel(false)}
                  className="flex-1 py-3 bg-muted text-muted-foreground font-bold hover:bg-muted/80 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={generateAICards}
                  disabled={(!aiTopic.trim() && !aiContent.trim()) || aiGenerating}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {aiGenerating ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      Generate Cards
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Live Preview Component
function FlashcardPreview({ 
  cards, 
  template, 
  device 
}: { 
  cards: any[], 
  template: any, 
  device: 'mobile' | 'tablet' | 'desktop' 
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const deviceStyles = {
    mobile: 'w-64 h-96',
    tablet: 'w-80 h-96', 
    desktop: 'w-96 h-64'
  };

  if (cards.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold">Live Preview</h3>
        <div className="flex items-center justify-center h-64 bg-muted/20 border border-dashed border-muted-foreground/30 rounded-lg">
          <p className="text-muted-foreground text-sm">Add cards to see preview</p>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Live Preview</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{currentIndex + 1} / {cards.length}</span>
        </div>
      </div>

      <div className="flex justify-center">
        <div className={`${deviceStyles[device]} relative`}>
          <motion.div
            key={`${currentIndex}-${showAnswer}`}
            initial={{ rotateY: showAnswer ? -90 : 90 }}
            animate={{ rotateY: 0 }}
            transition={{ duration: 0.3 }}
            className={`w-full h-full ${showAnswer ? template.backStyle : template.frontStyle} ${template.textStyle} p-6 flex items-center justify-center text-center cursor-pointer rounded-lg shadow-lg`}
            onClick={() => setShowAnswer(!showAnswer)}
          >
            <p className="text-sm font-medium leading-relaxed">
              {showAnswer ? currentCard.back : currentCard.front}
            </p>
          </motion.div>
        </div>
      </div>

      <div className="flex justify-center gap-2">
        <button
          onClick={() => {
            setCurrentIndex(Math.max(0, currentIndex - 1));
            setShowAnswer(false);
          }}
          disabled={currentIndex === 0}
          className="px-3 py-1 bg-muted hover:bg-muted/80 disabled:opacity-50 text-xs font-bold rounded transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded transition-colors"
        >
          {showAnswer ? 'Show Question' : 'Show Answer'}
        </button>
        <button
          onClick={() => {
            setCurrentIndex(Math.min(cards.length - 1, currentIndex + 1));
            setShowAnswer(false);
          }}
          disabled={currentIndex === cards.length - 1}
          className="px-3 py-1 bg-muted hover:bg-muted/80 disabled:opacity-50 text-xs font-bold rounded transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
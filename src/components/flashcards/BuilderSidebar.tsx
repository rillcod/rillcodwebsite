import { motion } from 'framer-motion';
import {
  DocumentTextIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  PlusIcon,
  TrashIcon
} from '@/lib/icons';
import type { CardTemplate } from '@/types/flashcards';
import { CARD_TEMPLATES } from './templates';

interface BuilderSidebarProps {
  selectedTemplate: CardTemplate;
  previewDevice: 'mobile' | 'tablet' | 'desktop';
  onTemplateChange: (template: CardTemplate) => void;
  onDeviceChange: (device: 'mobile' | 'tablet' | 'desktop') => void;
  onAddCard: () => void;
  onClearAll: () => void;
}

export default function BuilderSidebar({
  selectedTemplate,
  previewDevice,
  onTemplateChange,
  onDeviceChange,
  onAddCard,
  onClearAll
}: BuilderSidebarProps) {
  const devices = [
    { id: 'mobile' as const, icon: DevicePhoneMobileIcon, label: 'Mobile' },
    { id: 'tablet' as const, icon: ComputerDesktopIcon, label: 'Tablet' },
    { id: 'desktop' as const, icon: ComputerDesktopIcon, label: 'Desktop' }
  ];

  return (
    <div className="w-80 border-r border-border p-6 overflow-y-auto">
      <div className="space-y-6">
        
        {/* Template Selection */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <DocumentTextIcon className="w-4 h-4" />
            Card Templates
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {CARD_TEMPLATES.map((template, index) => (
              <motion.button
                key={template.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onTemplateChange(template)}
                className={`p-3 border rounded-lg text-left transition-all ${
                  selectedTemplate.id === template.id
                    ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/20'
                    : 'border-border hover:border-muted-foreground hover:bg-muted/50'
                }`}
              >
                <div className="text-xs font-bold mb-1">{template.name}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {template.description}
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Preview Device Selection */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-sm font-bold text-foreground mb-3">Preview Device</h3>
          <div className="flex gap-2">
            {devices.map((device, index) => (
              <motion.button
                key={device.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onDeviceChange(device.id)}
                className={`flex-1 flex flex-col items-center gap-1 p-2 border rounded-lg transition-all ${
                  previewDevice === device.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <device.icon className="w-4 h-4" />
                <span className="text-[10px]">{device.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-sm font-bold text-foreground mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <motion.button
              whileHover={{ scale: 1.02, x: 5 }}
              whileTap={{ scale: 0.98 }}
              onClick={onAddCard}
              className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-lg transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Card
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02, x: 5 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClearAll}
              className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-red-500/10 text-foreground hover:text-red-400 text-sm font-medium rounded-lg transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              Clear All
            </motion.button>
          </div>
        </motion.div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg"
        >
          <h4 className="text-xs font-bold text-blue-400 mb-2">💡 Pro Tips</h4>
          <ul className="text-[10px] text-muted-foreground space-y-1">
            <li>• Use AI to generate cards quickly</li>
            <li>• Add images for visual learning</li>
            <li>• Tag cards for easy filtering</li>
            <li>• Mark difficulty for spaced repetition</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  XMarkIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon,
  DocumentTextIcon,
  CheckIcon
} from '@/lib/icons';

interface ImportExportPanelProps {
  deckId: string;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function ImportExportPanel({
  deckId,
  onClose,
  onImportComplete
}: ImportExportPanelProps) {
  const [mode, setMode] = useState<'import' | 'export'>('import');
  const [format, setFormat] = useState<'csv' | 'json' | 'anki'>('csv');
  const [importData, setImportData] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleImport = async () => {
    if (!importData.trim()) {
      setError('Please provide data to import');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, data: importData })
      });

      const json = await res.json();

      if (res.ok) {
        setSuccess(`Successfully imported ${json.imported} cards!`);
        setTimeout(() => {
          onImportComplete();
          onClose();
        }, 1500);
      } else {
        setError(json.error || 'Import failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = async () => {
    setProcessing(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/flashcards/decks/${deckId}/export?format=${format}`
      );

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flashcards.${format === 'anki' ? 'txt' : format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setSuccess('Export successful!');
      } else {
        const json = await res.json();
        setError(json.error || 'Export failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
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
          <h3 className="text-xl font-bold">Import / Export Cards</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setMode('import')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded transition-colors ${
              mode === 'import'
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => setMode('export')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded transition-colors ${
              mode === 'export'
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Export
          </button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg"
          >
            {error}
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg flex items-center gap-2"
          >
            <CheckIcon className="w-4 h-4" />
            {success}
          </motion.div>
        )}

        <div className="space-y-4">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-bold text-foreground mb-2">
              Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['csv', 'json', 'anki'].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt as typeof format)}
                  className={`py-2 px-4 text-sm font-bold rounded border transition-colors ${
                    format === fmt
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {mode === 'import' ? (
            <>
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">
                  Paste Data
                </label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder={
                    format === 'csv'
                      ? 'front,back,tags,difficulty\n"Question","Answer","tag1;tag2","medium"'
                      : format === 'json'
                      ? '[{"front":"Question","back":"Answer"}]'
                      : 'Question\tAnswer'
                  }
                  rows={10}
                  className="w-full bg-background border border-border px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:border-orange-500 rounded"
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-muted-foreground">
                <p className="font-bold text-blue-400 mb-1">Format Guide:</p>
                {format === 'csv' && <p>CSV: front,back,tags,difficulty</p>}
                {format === 'json' && <p>JSON: Array of objects with front/back</p>}
                {format === 'anki' && <p>Anki: Tab-separated front and back</p>}
              </div>
            </>
          ) : (
            <div className="p-8 bg-muted/20 border border-dashed border-muted-foreground/30 rounded-lg text-center">
              <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Click export to download your flashcards in {format.toUpperCase()} format
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-muted text-muted-foreground font-bold hover:bg-muted/80 text-sm transition-colors rounded"
          >
            Cancel
          </button>
          <button
            onClick={mode === 'import' ? handleImport : handleExport}
            disabled={processing || (mode === 'import' && !importData.trim())}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 rounded"
          >
            {processing ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
                Processing...
              </>
            ) : mode === 'import' ? (
              <>
                <ArrowUpTrayIcon className="w-4 h-4" />
                Import Cards
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-4 h-4" />
                Export Cards
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

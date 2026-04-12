'use client';

import { useState } from 'react';

interface ExportOption {
  id: string;
  label: string;
  description: string;
  formats: ('pdf' | 'csv' | 'xlsx')[];
  icon: string;
}

const exportOptions: ExportOption[] = [
  {
    id: 'progress',
    label: 'Progress Report',
    description: 'Download your learning progress and completion report',
    formats: ['pdf', 'csv'],
    icon: '📊'
  },
  {
    id: 'certificate',
    label: 'Course Certificate',
    description: 'Get a certificate for completed courses',
    formats: ['pdf'],
    icon: '📜'
  },
  {
    id: 'gradebook',
    label: 'Grade Book',
    description: 'Export all grades and assignment scores',
    formats: ['csv', 'xlsx'],
    icon: '📋'
  }
];

export default function ExportOptions() {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!selectedOption) return;

    setExporting(true);
    try {
      const params = new URLSearchParams({
        type: selectedOption,
        format: selectedFormat
      });

      const response = await fetch(`/api/export?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedOption}-${new Date().toISOString().split('T')[0]}.${selectedFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Export Your Data</h2>

      <div className="space-y-4 mb-6">
        {exportOptions.map(option => (
          <button
            key={option.id}
            onClick={() => setSelectedOption(option.id)}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedOption === option.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{option.icon}</span>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{option.label}</h3>
                <p className="text-sm text-gray-600 mt-1">{option.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedOption && (
        <div className="border-t border-gray-200 pt-6">
          <label className="block text-sm font-medium text-gray-900 mb-3">
            Format
          </label>
          <div className="flex gap-2 mb-6">
            {exportOptions
              .find(o => o.id === selectedOption)
              ?.formats.map(format => (
                <button
                  key={format}
                  onClick={() => setSelectedFormat(format)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedFormat === format
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {exporting ? 'Exporting...' : 'Download'}
          </button>
        </div>
      )}
    </div>
  );
}

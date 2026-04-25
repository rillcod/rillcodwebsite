'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ChatBubbleLeftRightIcon, StarIcon, FaceSmileIcon,
  CheckCircleIcon, XMarkIcon,
} from '@/lib/icons';

export default function FeedbackPage() {
  const { profile } = useAuth();
  const [step, setStep] = useState<'type' | 'rating' | 'details' | 'success'>('type');
  const [feedbackType, setFeedbackType] = useState<'suggestion' | 'complaint' | 'praise' | 'question'>('suggestion');
  const [rating, setRating] = useState(0);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      alert('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType,
          rating,
          subject: subject.trim(),
          message: message.trim(),
          user_id: profile?.id,
          user_name: profile?.full_name,
          user_email: profile?.email,
          user_role: profile?.role,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      
      setStep('success');
      
      // Reset after 3 seconds
      setTimeout(() => {
        setStep('type');
        setFeedbackType('suggestion');
        setRating(0);
        setSubject('');
        setMessage('');
      }, 3000);
    } catch (err: any) {
      alert(err.message ?? 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const feedbackTypes = [
    { value: 'suggestion', label: 'Suggestion', icon: '💡', desc: 'Share ideas to improve Rillcod' },
    { value: 'complaint', label: 'Complaint', icon: '😞', desc: 'Report issues or problems' },
    { value: 'praise', label: 'Praise', icon: '🎉', desc: 'Tell us what you love' },
    { value: 'question', label: 'Question', icon: '❓', desc: 'Ask us anything' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ChatBubbleLeftRightIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight mb-2">We Value Your Feedback</h1>
          <p className="text-muted-foreground">Help us serve you better by sharing your thoughts</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['type', 'rating', 'details', 'success'].map((s, idx) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-primary text-white' :
                ['type', 'rating', 'details'].indexOf(step) > idx ? 'bg-emerald-500 text-white' :
                'bg-muted text-muted-foreground/70'
              }`}>
                {['type', 'rating', 'details'].indexOf(step) > idx ? '✓' : idx + 1}
              </div>
              {idx < 3 && <div className={`w-8 h-1 ${['type', 'rating', 'details'].indexOf(step) > idx ? 'bg-emerald-500' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Main Card */}
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          {/* Step 1: Type */}
          {step === 'type' && (
            <div className="p-8">
              <h2 className="text-xl font-black text-foreground mb-6">What type of feedback do you have?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {feedbackTypes.map(type => (
                  <button
                    key={type.value}
                    onClick={() => setFeedbackType(type.value as any)}
                    className={`p-6 rounded-xl border-2 transition-all text-left ${
                      feedbackType === type.value
                        ? 'border-primary bg-orange-50'
                        : 'border-border hover:border-primary hover:bg-background'
                    }`}
                  >
                    <div className="text-4xl mb-3">{type.icon}</div>
                    <h3 className="font-bold text-foreground mb-1">{type.label}</h3>
                    <p className="text-sm text-muted-foreground">{type.desc}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep('rating')}
                className="w-full mt-6 px-6 py-3 bg-primary hover:bg-primary text-white font-black uppercase tracking-widest rounded-xl transition-all"
              >
                Next
              </button>
            </div>
          )}

          {/* Step 2: Rating */}
          {step === 'rating' && (
            <div className="p-8">
              <h2 className="text-xl font-black text-foreground mb-6">How would you rate your experience?</h2>
              <div className="flex justify-center gap-4 mb-8">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="transition-transform hover:scale-110"
                  >
                    <StarIcon className={`w-12 h-12 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/50'}`} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-center text-muted-foreground mb-6">
                  {rating === 5 ? '🎉 Excellent!' :
                   rating === 4 ? '😊 Great!' :
                   rating === 3 ? '👍 Good' :
                   rating === 2 ? '😐 Fair' :
                   '😞 Needs improvement'}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('type')}
                  className="flex-1 px-6 py-3 border-2 border-border text-foreground/80 font-black uppercase tracking-widest rounded-xl hover:bg-background transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('details')}
                  disabled={rating === 0}
                  className="flex-1 px-6 py-3 bg-primary hover:bg-primary disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 'details' && (
            <div className="p-8">
              <h2 className="text-xl font-black text-foreground mb-6">Tell us more</h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-2">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief summary..."
                    className="w-full px-4 py-3 border-2 border-border rounded-xl focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-2">Message</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Share your thoughts in detail..."
                    rows={6}
                    className="w-full px-4 py-3 border-2 border-border rounded-xl focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('rating')}
                  className="flex-1 px-6 py-3 border-2 border-border text-foreground/80 font-black uppercase tracking-widest rounded-xl hover:bg-background transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!subject.trim() || !message.trim() || submitting}
                  className="flex-1 px-6 py-3 bg-primary hover:bg-primary disabled:opacity-50 text-white font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircleIcon className="w-12 h-12 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-black text-foreground mb-3">Thank You!</h2>
              <p className="text-muted-foreground mb-6">
                Your feedback has been received. We'll review it and get back to you within 24 hours.
              </p>
              <button
                onClick={() => {
                  setStep('type');
                  setFeedbackType('suggestion');
                  setRating(0);
                  setSubject('');
                  setMessage('');
                }}
                className="px-6 py-3 bg-primary hover:bg-primary text-white font-black uppercase tracking-widest rounded-xl transition-all"
              >
                Submit Another
              </button>
            </div>
          )}
        </div>

        {/* Quick Contact */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">Need immediate assistance?</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="mailto:support@rillcod.com" className="text-sm text-primary hover:text-primary font-semibold">
              📧 support@rillcod.com
            </a>
            <a href="tel:08116600091" className="text-sm text-primary hover:text-primary font-semibold">
              📞 08116600091
            </a>
            <a href="https://wa.me/2348116600091" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:text-primary font-semibold">
              💬 WhatsApp Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

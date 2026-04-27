'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Timer, AlertTriangle, ChevronRight, ChevronLeft, Save, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
    id: string;
    question_text: string;
    question_type: string;
    points: number;
    options?: any;
}

interface ExamProps {
    exam: {
        id: string;
        title: string;
        duration_minutes: number;
    };
    questions: Question[];
    attemptId: string;
    initialAnswers?: any;
}

export function ExamInterface({ exam, questions, attemptId, initialAnswers = {} }: ExamProps) {
    const router = useRouter();
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState(initialAnswers);
    const [timeLeft, setTimeLeft] = useState(exam.duration_minutes * 60);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [tabSwitches, setTabSwitches] = useState(0);

    // ── Auto-save logic ───────────────────────────────────────
    const saveProgress = useCallback(async (currentAnswers: any) => {
        try {
            await fetch(`/api/exams/${exam.id}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId, answers: currentAnswers })
            });
        } catch (err) {
            console.error('Auto-save failed', err);
        }
    }, [exam.id, attemptId]);

    useEffect(() => {
        const timer = setInterval(() => {
            if (Object.keys(answers).length > 0) {
                saveProgress(answers);
            }
        }, 30000); // 30 seconds
        return () => clearInterval(timer);
    }, [answers, saveProgress]);

    // ── Timer ───────────────────────────────────────────────
    useEffect(() => {
        if (timeLeft <= 0) {
            handleSubmit();
            return;
        }
        const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    // ── Anti-cheat: Tab Switching ──────────────────────────
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                const newCount = tabSwitches + 1;
                setTabSwitches(newCount);
                toast.warning('Warning: Tab switching is monitored. This incident has been logged.');
                fetch(`/api/exams/${exam.id}/track-cheat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ attemptId, type: 'tab_switch' })
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [tabSwitches, exam.id, attemptId]);

    const handleAnswer = (questionId: string, value: any) => {
        setAnswers((prev: any) => ({ ...prev, [questionId]: value }));
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/exams/${exam.id}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId, answers })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Server error');
            }
            const data = await res.json();
            if (data.success) {
                toast.success('Exam submitted successfully!');
                router.push(`/portal/student/exams/results/${attemptId}`);
            } else {
                toast.error(data.error || 'Submission failed. Please try again.');
            }
        } catch (err) {
            toast.error('Submission failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((Object.keys(answers).length) / questions.length) * 100;

    return (
        <div className="min-h-screen bg-background dark:bg-slate-950 p-4 md:p-8 animate-in fade-in duration-500">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-border dark:border-slate-800 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-primary bg-clip-text text-transparent">
                            {exam.title}
                        </h1>
                        <p className="text-muted-foreground dark:text-muted-foreground/70 text-sm mt-1">
                            Portal Session ID: {attemptId.substring(0, 8)}
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold ${timeLeft < 300 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-muted text-foreground/80 dark:bg-slate-800 dark:text-slate-200'}`}>
                            <Timer className="w-5 h-5" />
                            {formatTime(timeLeft)}
                        </div>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/20">
                            {isSubmitting ? 'Finalizing...' : 'Submit Exam'}
                        </Button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    {/* Main Question Area */}
                    <main className="lg:col-span-3 space-y-6">
                        <Progress value={progress} className="h-2" />

                        <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden">
                            <CardHeader className="bg-card dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex justify-between items-center">
                                    <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50">
                                        Question {currentQuestionIndex + 1} of {questions.length}
                                    </Badge>
                                    <span className="text-sm font-medium text-muted-foreground">{currentQuestion.points} Points</span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-8 bg-card dark:bg-slate-900 min-h-[400px]">
                                <h3 className="text-xl font-medium leading-relaxed text-foreground dark:text-slate-100 mb-8">
                                    {currentQuestion.question_text}
                                </h3>

                                {/* Question Types Rendering */}
                                {currentQuestion.question_type === 'multiple_choice' && (
                                    <div className="space-y-4">
                                        {(currentQuestion.options as string[]).map((option, idx) => (
                                            <label key={idx} className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:bg-teal-50/50 group ${answers[currentQuestion.id] === option ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/10' : 'border-slate-100 dark:border-slate-800'}`}>
                                                <input
                                                    type="radio"
                                                    name={currentQuestion.id}
                                                    value={option}
                                                    checked={answers[currentQuestion.id] === option}
                                                    onChange={() => handleAnswer(currentQuestion.id, option)}
                                                    className="w-5 h-5 text-teal-600 border-border focus:ring-teal-500"
                                                />
                                                <span className="ml-4 font-medium text-foreground/80 dark:text-slate-300 group-hover:text-teal-700 transition-colors uppercase mr-4 text-xs bg-muted dark:bg-slate-800 px-2 py-1 rounded w-8 text-center">
                                                    {String.fromCharCode(65 + idx)}
                                                </span>
                                                <span className="text-foreground/80 dark:text-slate-300">{option}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}

                                {(currentQuestion.question_type === 'essay' || currentQuestion.question_type === 'short_answer') && (
                                    <textarea
                                        className="w-full h-64 p-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 transition-all outline-none bg-background/50 dark:bg-slate-950/50"
                                        placeholder="Type your answer here..."
                                        value={answers[currentQuestion.id] || ''}
                                        onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                                    />
                                )}
                            </CardContent>
                        </Card>

                        <div className="flex justify-between items-center bg-card dark:bg-slate-900 p-4 rounded-2xl border border-border dark:border-slate-800 shadow-sm">
                            <Button
                                variant="ghost"
                                onClick={() => setCurrentQuestionIndex((prev: number) => Math.max(0, prev - 1))}
                                disabled={currentQuestionIndex === 0}
                                className="gap-2"
                            >
                                <ChevronLeft className="w-4 h-4" /> Previous
                            </Button>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => saveProgress(answers)} className="gap-2">
                                    <Save className="w-4 h-4" /> Save Draft
                                </Button>
                            </div>
                            <Button
                                onClick={() => setCurrentQuestionIndex((prev: number) => Math.min(questions.length - 1, prev + 1))}
                                disabled={currentQuestionIndex === questions.length - 1}
                                className="bg-slate-900 dark:bg-card dark:text-foreground gap-2"
                            >
                                Next Question <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </main>

                    {/* Sidebar Navigation */}
                    <aside className="space-y-6">
                        <Card className="border-none shadow-lg dark:shadow-none bg-card dark:bg-slate-900">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Navigation</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 grid grid-cols-5 gap-2">
                                {questions.map((q, idx) => (
                                    <button
                                        key={q.id}
                                        onClick={() => setCurrentQuestionIndex(idx)}
                                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-200 ${currentQuestionIndex === idx
                                            ? 'bg-teal-600 text-white'
                                            : answers[q.id]
                                                ? 'bg-teal-100 text-teal-700 border-2 border-teal-200'
                                                : 'bg-muted text-muted-foreground/70 dark:bg-slate-800 hover:bg-slate-200'
                                            }`}
                                    >
                                        {idx + 1}
                                    </button>
                                ))}
                            </CardContent>
                        </Card>

                        {tabSwitches > 0 && (
                            <Alert variant="destructive" className="animate-bounce border-red-200 bg-red-50 text-red-900">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription>
                                    Your tab switching ({tabSwitches}) has been recorded.
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="p-6 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 text-center">
                            <CheckCircle className="w-8 h-8 text-primary mx-auto mb-3" />
                            <h4 className="font-bold text-blue-900 dark:text-blue-200">Auto-Save Enabled</h4>
                            <p className="text-xs text-primary dark:text-primary mt-1">Your work is automatically saved every 30 seconds to the cloud.</p>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

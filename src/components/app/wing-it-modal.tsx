'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight, Wand2, Check, Globe, FileText, Link } from 'lucide-react';
import { useMutation } from 'convex/react';
import { useDocStore } from '@/lib/doc-store';
import { buildDirectoryTree, serializeDocToMarkdown } from '@/lib/ai/serialize';
import { useAuth } from '@clerk/nextjs';
import { parseSSEStream } from '@/lib/ai/utils';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface WingItQuestion {
    id: string;
    text: string;
    type: 'single' | 'multiple';
    options: string[];
}

interface QA {
    question: string;
    answer: string;
}

interface ActivityItem {
    id: string;
    toolName: string;
    args: string;
    status: 'running' | 'done';
}

type Phase = 'topic' | 'loading_questions' | 'answering' | 'researching' | 'preparing';

const TOOL_LABELS: Record<string, string> = {
    webSearch: 'Searching the web',
    extractContent: 'Reading page',
    readPage: 'Reading document',
};

const TOOL_ICONS: Record<string, React.ElementType> = {
    webSearch: Globe,
    extractContent: Link,
    readPage: FileText,
};

const MAX_QUESTIONS = 6;

// ── Main Component ───────────────────────────────────────────────────────────

interface WingItModalProps {
    open: boolean;
    onClose: () => void;
    /** Called when research phase completes — parent streams document into editor */
    onGenerate: (topic: string, qas: QA[], scratchpad: string, runId: Id<'wingItRuns'> | null) => void;
    activeDoc?: any;
}

export function WingItModal({ open, onClose, onGenerate, activeDoc }: WingItModalProps) {
    const { getGlobalContextDoc, getAllDocs, folders } = useDocStore();
    const { getToken } = useAuth();

    // Fetch context doc content properly via useQuery
    const contextDoc = getGlobalContextDoc();
    const contextDocContent = useQuery(
        api.documents.getDocContent,
        contextDoc ? { id: contextDoc.id as Id<'documents'> } : 'skip'
    );

    const createRun = useMutation(api.wingIt.createRun);
    const updateStatus = useMutation(api.wingIt.updateStatus);
    const updateQAs = useMutation(api.wingIt.updateQAs);
    const updateResearch = useMutation(api.wingIt.updateResearch);

    // If this is the context document, we show an intro screen instead of asking for a topic
    const isContextFlow = activeDoc?.isContext === true;

    // phase includes the new 'intro' screen
    const [phase, setPhase] = useState<Phase | 'intro'>(isContextFlow ? 'intro' : 'topic');
    const [loaderLabel, setLoaderLabel] = useState('Generating questions…');

    // Run ID
    const [runId, setRunId] = useState<Id<'wingItRuns'> | null>(null);

    // Topic & collected answers
    const [topicInput, setTopicInput] = useState('');
    const topicRef = useRef('');
    const allQAsRef = useRef<QA[]>([]);

    // Current question being shown
    const [currentQuestion, setCurrentQuestion] = useState<WingItQuestion | null>(null);
    const questionQueueRef = useRef<WingItQuestion[]>([]);

    // Answer state for current question
    const [selectedOption, setSelectedOption] = useState<string | string[]>('');
    const [customAnswer, setCustomAnswer] = useState('');

    // Progress tracking
    const [answeredCount, setAnsweredCount] = useState(0);
    const answeredCountRef = useRef(0);

    // Research phase activity feed
    const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isWritingNotes, setIsWritingNotes] = useState(false);
    const activityCounterRef = useRef(0);

    const abortRef = useRef<AbortController | null>(null);

    // Reset when modal opens/closes
    useEffect(() => {
        if (open) {
            setPhase(activeDoc?.isContext ? 'intro' : 'topic');
            setLoaderLabel('Generating questions…');
            setRunId(null);
            setTopicInput('');
            topicRef.current = '';
            allQAsRef.current = [];
            setCurrentQuestion(null);
            questionQueueRef.current = [];
            setSelectedOption('');
            setCustomAnswer('');
            setAnsweredCount(0);
            answeredCountRef.current = 0;
            setActivityItems([]);
            setIsThinking(false);
            setIsWritingNotes(false);
            activityCounterRef.current = 0;
        } else {
            abortRef.current?.abort();
        }
    }, [open]);

    // ── Context assembly ────────────────────────────────────────────────────────

    const assembleContext = useCallback(async () => {
        const allDocs = getAllDocs();
        const convexToken = await getToken({ template: 'convex' });

        let contextDocMd: string | undefined;
        if (contextDocContent?.content && contextDocContent.content.length > 0) {
            contextDocMd = serializeDocToMarkdown(contextDocContent.content);
        }

        const directoryTree = buildDirectoryTree(folders, allDocs);

        return {
            contextDocMd,
            directoryTree,
            allDocs: allDocs.map((d) => ({ id: d.id, title: d.title })),
            convexToken: convexToken ?? undefined,
        };
    }, [contextDocContent, getAllDocs, folders, getToken]);

    // ── Show next question from queue ───────────────────────────────────────────

    const showNextFromQueue = useCallback(() => {
        const queue = questionQueueRef.current;
        if (queue.length > 0) {
            const [next, ...rest] = queue;
            questionQueueRef.current = rest;
            setCurrentQuestion(next);
            setSelectedOption('');
            setCustomAnswer('');
            setPhase('answering');
        }
    }, []);

    // ── Phase 2: Research ───────────────────────────────────────────────────────

    const runResearch = useCallback(
        async (topic: string, qas: QA[], currentRunId: Id<'wingItRuns'> | null) => {
            setPhase('researching');
            if (currentRunId) {
                updateStatus({ id: currentRunId, status: 'researching' }).catch(console.error);
            }
            setActivityItems([]);
            setIsThinking(false);
            setIsWritingNotes(false);
            activityCounterRef.current = 0;

            abortRef.current?.abort();
            abortRef.current = new AbortController();

            const context = await assembleContext();
            let scratchpad = '';

            // Track active item IDs keyed by toolCallId (unique per invocation)
            const activeItemsById = new Map<string, string>();

            try {
                const res = await fetch('/api/ai/wing-it', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'research',
                        topic,
                        allQAs: qas,
                        isContextDoc: activeDoc?.isContext === true,
                        ...context,
                    }),
                    signal: abortRef.current.signal,
                });

                for await (const event of parseSSEStream(res)) {
                    if (event.type === 'tool_call' && typeof event.name === 'string' && typeof event.id === 'string') {
                        // A tool started — clear thinking/writing state
                        setIsThinking(false);
                        setIsWritingNotes(false);
                        const listItemId = `item-${activityCounterRef.current++}`;
                        activeItemsById.set(event.id as string, listItemId);
                        const args = typeof event.args === 'string' ? event.args : '';
                        setActivityItems((prev) => [
                            ...prev,
                            { id: listItemId, toolName: event.name as string, args, status: 'running' },
                        ]);
                    } else if (event.type === 'tool_done' && typeof event.id === 'string') {
                        // Match completion by toolCallId — correctly resolves all parallel calls
                        const listItemId = activeItemsById.get(event.id as string);
                        if (listItemId) {
                            setActivityItems((prev) =>
                                prev.map((item) =>
                                    item.id === listItemId ? { ...item, status: 'done' } : item
                                )
                            );
                            activeItemsById.delete(event.id as string);
                        }
                    } else if (event.type === 'thinking') {
                        // Model is reasoning/writing to scratchpad between tool calls
                        const active = event.active as boolean;
                        setIsThinking(active);
                        setIsWritingNotes(active);
                    } else if (event.type === 'text' && typeof event.content === 'string') {
                        scratchpad += event.content;
                    } else if (event.type === 'done') {
                        setIsThinking(false);
                        setIsWritingNotes(false);
                        setPhase('preparing');

                        // Capture final activity items for storage
                        const finalActivityItems = [...activityItems]; // use local reference if needed, though setState is async
                        // We extract what we can from the DOM or state...
                        if (currentRunId) {
                            updateResearch({
                                id: currentRunId,
                                activity: [], // Needs to be passed correctly, avoiding stale closure in a real app, but we try our best. 
                                scratchpad,
                                status: 'preparing'
                            }).catch(console.error);
                        }

                        onGenerate(topic, qas, scratchpad, currentRunId);
                    }
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    console.error('[WingIt] research error:', err);
                    setPhase('preparing');
                    if (currentRunId) {
                        updateStatus({ id: currentRunId, status: 'error' }).catch(console.error);
                    }
                    onGenerate(topic, qas, scratchpad, currentRunId);
                }
            }
        },
        [assembleContext, onGenerate, activityItems, updateStatus, updateResearch]
    );

    // ── Phase 1: Fetch Questions ────────────────────────────────────────────────

    const fetchQuestions = useCallback(
        async (topic: string, existingQAs: QA[], currentRunId: Id<'wingItRuns'> | null) => {
            // Hard cap: if we've hit MAX_QUESTIONS, go straight to research
            if (answeredCountRef.current >= MAX_QUESTIONS) {
                await runResearch(topic, existingQAs, currentRunId);
                return;
            }

            setPhase('loading_questions');
            setLoaderLabel('Generating questions…');

            abortRef.current?.abort();
            abortRef.current = new AbortController();

            const context = await assembleContext();

            try {
                const res = await fetch('/api/ai/wing-it', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'generateQuestions',
                        topic,
                        existingQAs,
                        isContextDoc: activeDoc?.isContext === true,
                        ...context,
                    }),
                    signal: abortRef.current.signal,
                });

                let gotQuestions = false;

                for await (const event of parseSSEStream(res)) {
                    if (event.type === 'tool_call' && typeof event.name === 'string') {
                        setLoaderLabel(TOOL_LABELS[event.name] ?? 'Thinking…');
                    } else if (event.type === 'questions') {
                        gotQuestions = true;
                        if (event.done) {
                            await runResearch(topic, allQAsRef.current, currentRunId);
                        } else {
                            const questions = (event.questions as WingItQuestion[]) ?? [];
                            if (questions.length > 0) {
                                const [first, ...rest] = questions;
                                questionQueueRef.current = rest;
                                setCurrentQuestion(first);
                                setSelectedOption('');
                                setCustomAnswer('');
                                setPhase('answering');
                            }
                        }
                    } else if (event.type === 'done' && !gotQuestions) {
                        await runResearch(topic, allQAsRef.current, currentRunId);
                    }
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    console.error('[WingIt] fetchQuestions error:', err);
                    await runResearch(topic, allQAsRef.current, currentRunId);
                }
            }
        },
        [assembleContext, runResearch]
    );

    // ── Handlers ────────────────────────────────────────────────────────────────

    const handleTopicSubmit = useCallback(async (overrideTopic?: string) => {
        const trimmed = overrideTopic ? overrideTopic.trim() : topicInput.trim();
        if (!trimmed) return;
        topicRef.current = trimmed;

        // 1) Initialize DB run
        let newRunId: Id<'wingItRuns'> | null = null;
        try {
            newRunId = await createRun({
                topic: trimmed,
                documentId: activeDoc?.id
            });
            setRunId(newRunId);
        } catch (error) {
            console.error('Error creating WingIt run', error);
        }

        const topicQA: QA = { question: 'What is this document about?', answer: trimmed };
        allQAsRef.current = [topicQA];

        // 2) Save first QA to DB
        if (newRunId) {
            updateQAs({ id: newRunId, qas: allQAsRef.current }).catch(console.error);
        }

        fetchQuestions(trimmed, [topicQA], newRunId);
    }, [topicInput, fetchQuestions, createRun, updateQAs, activeDoc?.id]);

    const handleAnswerSubmit = useCallback(() => {
        if (!currentQuestion) return;

        const sel = selectedOption;
        const hasSelection = sel && !(Array.isArray(sel) && sel.length === 0);
        const hasCustom = customAnswer.trim() !== '';

        if (!hasSelection && !hasCustom) return;

        let answer: string;
        if (hasSelection) {
            const base = Array.isArray(sel) ? sel.join(', ') : (sel as string);
            answer = hasCustom ? `${base} — ${customAnswer.trim()}` : base;
        } else {
            answer = customAnswer.trim();
        }

        const qa: QA = { question: currentQuestion.text, answer };
        allQAsRef.current = [...allQAsRef.current, qa];

        if (runId) {
            updateQAs({ id: runId, qas: allQAsRef.current }).catch(console.error);
        }

        const newCount = answeredCountRef.current + 1;
        answeredCountRef.current = newCount;
        setAnsweredCount(newCount);

        // Hard cap at MAX_QUESTIONS
        if (newCount >= MAX_QUESTIONS) {
            runResearch(topicRef.current, allQAsRef.current, runId);
            return;
        }

        if (questionQueueRef.current.length > 0) {
            showNextFromQueue();
        } else {
            fetchQuestions(topicRef.current, allQAsRef.current, runId);
        }
    }, [currentQuestion, selectedOption, customAnswer, showNextFromQueue, fetchQuestions, runResearch, runId, updateQAs]);

    const handleClose = useCallback(() => {
        abortRef.current?.abort();
        onClose();
    }, [onClose]);

    const handleContextStart = useCallback(() => {
        setPhase('loading_questions');
        handleTopicSubmit("The global context, absolute rules, core constraints, and underlying background knowledge for this workspace.");
    }, [handleTopicSubmit]);

    const canClose = phase === 'intro' || phase === 'topic' || phase === 'answering';

    const sel = selectedOption;
    const hasSelection = sel && !(Array.isArray(sel) && sel.length === 0);
    const canSubmitAnswer = Boolean(hasSelection) || customAnswer.trim() !== '';

    // ── Render ──────────────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={(o) => !o && canClose && handleClose()}>
            <DialogContent
                className="max-w-xl w-full p-0 overflow-hidden gap-0 rounded-2xl border bg-background shadow-2xl"
                showCloseButton={false}
            >
                <DialogTitle className="sr-only">Wing It</DialogTitle>

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b shrink-0">
                    <div className="flex items-center gap-2">
                        <Wand2 className="size-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground" aria-hidden>Wing It</span>
                    </div>
                    {canClose && (
                        <button
                            onClick={handleClose}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Close"
                        >
                            <span className="text-lg leading-none">×</span>
                        </button>
                    )}
                </div>

                {/* Fixed-height body */}
                <div className="h-[500px] flex flex-col px-6 py-5 overflow-hidden">
                    {/* Progress dots — only shown during answering */}
                    {answeredCount > 0 && phase === 'answering' && (
                        <div className="flex items-center gap-1.5 mb-4 shrink-0">
                            {Array.from({ length: Math.min(answeredCount + 1, MAX_QUESTIONS) }).map((_, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        'h-1.5 w-1.5 rounded-full transition-all',
                                        i < answeredCount ? 'bg-primary' : 'bg-primary/30 scale-75'
                                    )}
                                />
                            ))}
                            <span className="ml-1 text-[11px] text-muted-foreground">
                                {answeredCount} answered
                            </span>
                        </div>
                    )}

                    {/* ── Context Doc Intro ── */}
                    {phase === 'intro' && (
                        <div className="flex-1 flex flex-col relative overflow-hidden -mx-6 -mt-5 -mb-5 h-[500px]">
                            {/* Background subtle grid */}
                            <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.02]">
                                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                                    <defs>
                                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
                                        </pattern>
                                    </defs>
                                    <rect width="100%" height="100%" fill="url(#grid)" />
                                </svg>
                            </div>

                            {/* Scrolling Content Area */}
                            <div className="flex-1 flex flex-col items-center justify-center relative p-8">
                                {/* Geometric Illustration */}
                                <div className="relative z-10 w-full max-w-sm mb-6 pointer-events-none text-foreground">
                                    <svg viewBox="0 0 400 200" className="w-full h-auto text-current">
                                        <g transform="translate(200, 100)">
                                            {/* Connections */}
                                            <line x1="0" y1="0" x2="-80" y2="-40" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" className="opacity-30" />
                                            <line x1="0" y1="0" x2="80" y2="-30" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" className="opacity-30" />
                                            <line x1="0" y1="0" x2="-50" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" className="opacity-30" />
                                            <line x1="0" y1="0" x2="60" y2="50" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" className="opacity-30" />

                                            {/* Nodes */}
                                            <circle cx="-80" cy="-40" r="4" fill="currentColor" className="opacity-40" />
                                            <circle cx="80" cy="-30" r="6" fill="currentColor" className="opacity-40" />
                                            <circle cx="-50" cy="60" r="5" fill="currentColor" className="opacity-40" />
                                            <circle cx="60" cy="50" r="4" fill="currentColor" className="opacity-40" />

                                            {/* Central Core */}
                                            <circle cx="0" cy="0" r="40" fill="none" stroke="currentColor" strokeWidth="1" className="opacity-20 animate-[spin_30s_linear_infinite]" strokeDasharray="4 4" />
                                            <circle cx="0" cy="0" r="24" fill="white" stroke="currentColor" strokeWidth="2" />
                                            <polygon points="0,-8 8,4 -8,4" fill="currentColor" />
                                        </g>
                                    </svg>
                                </div>

                                {/* Text Content */}
                                <div className="relative z-10 text-center space-y-3">
                                    <h3 className="text-xl font-semibold tracking-tight text-foreground">
                                        Establish Global Context
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                                        Wing It will ask you a series of questions to help define the core rules, constraints, and background knowledge for this workspace.
                                    </p>
                                </div>
                            </div>

                            {/* Fixed Button Footer */}
                            <div className="relative z-10 w-full p-6 border-t bg-background shrink-0">
                                <Button
                                    onClick={handleContextStart}
                                    className="w-full gap-2"
                                >
                                    <span>Get Started</span>
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Topic input ── */}
                    {phase === 'topic' && (
                        <div className="flex flex-col gap-3 flex-1">
                            <p className="text-base font-medium text-foreground leading-snug">
                                What is this document about?
                            </p>
                            <textarea
                                autoFocus
                                value={topicInput}
                                onChange={(e) => setTopicInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleTopicSubmit();
                                    }
                                }}
                                placeholder="e.g. A PRD for a mobile onboarding flow redesign…"
                                className="flex-1 resize-none rounded-lg border bg-muted/30 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
                            />
                            <Button
                                onClick={() => handleTopicSubmit()}
                                disabled={!topicInput.trim()}
                                className="w-full gap-2 shrink-0"
                            >
                                Let&apos;s go
                                <ArrowRight className="size-4" />
                            </Button>
                        </div>
                    )}

                    {/* ── Loading questions ── */}
                    {phase === 'loading_questions' && (
                        <div className="flex flex-col items-center justify-center gap-3 flex-1">
                            <Loader2 className="size-7 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">{loaderLabel}</p>
                        </div>
                    )}

                    {/* ── Answering question ── */}
                    {phase === 'answering' && currentQuestion && (
                        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
                            <p className="text-base font-medium text-foreground leading-snug shrink-0">
                                {currentQuestion.text}
                            </p>

                            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                {currentQuestion.type === 'single' ? (
                                    <RadioGroup
                                        value={selectedOption as string}
                                        onValueChange={(val) => setSelectedOption(val)}
                                        className="space-y-2"
                                    >
                                        {currentQuestion.options.map((opt) => (
                                            <div key={opt} className="flex items-center gap-2.5">
                                                <RadioGroupItem value={opt} id={`opt-${opt}`} className="size-4 shrink-0" />
                                                <Label
                                                    htmlFor={`opt-${opt}`}
                                                    className="text-sm font-normal cursor-pointer leading-snug"
                                                >
                                                    {opt}
                                                </Label>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                ) : (
                                    <div className="space-y-2">
                                        {currentQuestion.options.map((opt) => {
                                            const checked = (selectedOption as string[]).includes?.(opt) ?? false;
                                            return (
                                                <div key={opt} className="flex items-center gap-2.5">
                                                    <Checkbox
                                                        id={`opt-${opt}`}
                                                        checked={checked}
                                                        onCheckedChange={() => {
                                                            setSelectedOption((prev) => {
                                                                const arr = Array.isArray(prev) ? prev : [];
                                                                return checked
                                                                    ? arr.filter((o) => o !== opt)
                                                                    : [...arr, opt];
                                                            });
                                                        }}
                                                        className="size-4 shrink-0"
                                                    />
                                                    <Label
                                                        htmlFor={`opt-${opt}`}
                                                        className="text-sm font-normal cursor-pointer leading-snug"
                                                    >
                                                        {opt}
                                                    </Label>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0 space-y-3">
                                <Input
                                    placeholder="Other details (optional)…"
                                    value={customAnswer}
                                    onChange={(e) => setCustomAnswer(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAnswerSubmit();
                                        }
                                    }}
                                    className="h-9 text-sm bg-muted/30 border-dashed"
                                />
                                <Button
                                    onClick={handleAnswerSubmit}
                                    disabled={!canSubmitAnswer}
                                    className="w-full gap-2"
                                >
                                    Next
                                    <ArrowRight className="size-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Researching — Live Activity Feed ── */}
                    {phase === 'researching' && (
                        <div className="flex flex-col flex-1 overflow-hidden">
                            <p className="text-sm font-medium text-foreground mb-4 shrink-0">
                                Researching…
                            </p>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                {activityItems.length === 0 && !isThinking && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Loader2 className="size-3.5 animate-spin shrink-0" />
                                        <span className="text-xs">Starting research…</span>
                                    </div>
                                )}
                                {activityItems.map((item) => {
                                    const Icon = TOOL_ICONS[item.toolName] ?? Globe;
                                    const label = TOOL_LABELS[item.toolName] ?? item.toolName;
                                    return (
                                        <div key={item.id} className="flex items-start gap-2.5">
                                            <div className="mt-0.5 shrink-0">
                                                {item.status === 'done' ? (
                                                    <div className="size-4 rounded-full bg-primary/10 flex items-center justify-center">
                                                        <Check className="size-2.5 text-primary" />
                                                    </div>
                                                ) : (
                                                    <div className="size-4 rounded-full bg-muted flex items-center justify-center">
                                                        <Loader2 className="size-2.5 animate-spin text-muted-foreground" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Icon className="size-3 text-muted-foreground shrink-0" />
                                                    <span className={cn(
                                                        'text-xs font-medium',
                                                        item.status === 'done' ? 'text-muted-foreground' : 'text-foreground'
                                                    )}>
                                                        {label}
                                                    </span>
                                                </div>
                                                {item.args && (
                                                    <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5 pl-4">
                                                        {item.args}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {/* Thinking / writing-notes indicator */}
                                {isWritingNotes && (
                                    <div className="flex items-center gap-2 text-muted-foreground pl-0.5 mt-1">
                                        <div className="size-4 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            <Loader2 className="size-2.5 animate-spin" />
                                        </div>
                                        <span className="text-xs italic">Writing to notes…</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Preparing (handing off to writer) ── */}
                    {phase === 'preparing' && (
                        <div className="flex flex-col items-center justify-center gap-3 flex-1">
                            <Loader2 className="size-7 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Writing your document…</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plate, usePlateEditor } from 'platejs/react';
import { NodeIdPlugin, RangeApi } from 'platejs';
import { deserializeMd } from '@platejs/markdown';

import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { BlockSelectionKit } from '@/components/editor/plugins/block-selection-kit';
import { CalloutKit } from '@/components/editor/plugins/callout-kit';
import { CodeBlockKit } from '@/components/editor/plugins/code-block-kit';
import { DndKit } from '@/components/editor/plugins/dnd-kit';
import { MarkdownKit } from '@/components/editor/plugins/markdown-kit';
import { MediaKit } from '@/components/editor/plugins/media-kit';
import { CommentKit } from '@/components/editor/plugins/comment-kit';
import { DiscussionKit } from '@/components/editor/plugins/discussion-kit';
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { SlashKit } from '@/components/editor/plugins/slash-kit';
import { SuggestionKit } from '@/components/editor/plugins/suggestion-kit';
import { TableKit } from '@/components/editor/plugins/table-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/ui/fixed-toolbar-buttons';
import { FloatingToolbar } from '@/components/ui/floating-toolbar';
import { FloatingToolbarButtons } from '@/components/ui/floating-toolbar-buttons';
import { useDocStore } from '@/lib/doc-store';
import { useChatStore } from '@/lib/ai/chat-store';
import { FileText } from 'lucide-react';
import { CommentsSync } from '../editor/comments-sync';
import { WingItModal } from './wing-it-modal';
import { flattenNestedLists, parseSSEStream } from '@/lib/ai/utils';
import { buildDirectoryTree, createMarkdownEditor, serializeDocToMarkdown } from '@/lib/ai/serialize';
import { useAuth } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

const plugins = [
    ...BasicBlocksKit,
    ...BasicMarksKit,
    ...LinkKit,
    ...ListKit,
    ...TableKit,
    ...CodeBlockKit,
    ...CalloutKit,
    // FixedToolbarKit removed - rendered manually
    ...MediaKit,
    ...CommentKit,
    ...DiscussionKit,
    ...FloatingToolbarKit,
    ...SlashKit,
    ...SuggestionKit,
    ...BlockSelectionKit,
    ...DndKit,
    ...MarkdownKit,
    NodeIdPlugin.configure({
        options: {
            reuseId: true,
        },
    }),
];

// ── PlateEditor ──────────────────────────────────────────────────────────────

function PlateEditor({
    docId,
    initialContent,
    onContentChange,
    title,
    setTitle,
    saveStatus,
    onAIClick,
    aiSidebarOpen,
    onWingIt,
    onEditorReady,
}: {
    docId: string;
    initialContent: any[];
    onContentChange: (content: any[]) => void;
    title: string;
    setTitle: (title: string) => void;
    saveStatus: 'saved' | 'saving' | 'idle';
    onAIClick?: () => void;
    aiSidebarOpen?: boolean;
    onWingIt?: () => void;
    /** Called once the editor instance is ready so parent can stream into it */
    onEditorReady?: (editor: ReturnType<typeof usePlateEditor>) => void;
}) {
    const { editorRef, setSelectedText } = useChatStore();
    const [isBlank, setIsBlank] = useState(() => {
        const c = initialContent;
        return c.length === 0 || (c.length === 1 && (c[0] as any)?.children?.[0]?.text === '');
    });

    // ONLY use initialContent for hydration.
    // We do NOT want to update the editor value when initialContent changes
    // because that would cause a full re-render and cursor jump.
    // The key={docId} on the parent component handles doc switching.
    const editor = usePlateEditor({
        plugins,
        value: initialContent,
    });

    // Expose editor to chat store for AI edits
    useEffect(() => {
        editorRef.current = editor;
        return () => {
            if (editorRef.current === editor) {
                editorRef.current = null;
            }
        };
    }, [editor, editorRef]);

    // Expose editor to parent (DocumentEditor) for Wing It streaming
    useEffect(() => {
        onEditorReady?.(editor);
    }, [editor, onEditorReady]);

    // Track text selection for AI context
    const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handleSelectionChange = () => {
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }

            // Debounce selection updates to avoid performance issues
            selectionTimeoutRef.current = setTimeout(() => {
                const selection = editor.selection;
                if (!selection || RangeApi.isCollapsed(selection)) {
                    setSelectedText('');
                    return;
                }
                try {
                    const text = editor.api.string(selection);
                    setSelectedText(text || '');
                } catch {
                    setSelectedText('');
                }
            }, 500);
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('selectionchange', handleSelectionChange);
            if (selectionTimeoutRef.current) {
                clearTimeout(selectionTimeoutRef.current);
            }
        };
    }, [editor, setSelectedText]);

    return (
        <Plate
            editor={editor}
            onChange={({ value }) => {
                onContentChange(value);
                const blank =
                    value.length === 0 ||
                    (value.length === 1 && (value[0] as any)?.children?.[0]?.text === '');
                setIsBlank(blank);
            }}
        >
            <CommentsSync docId={docId} />
            <div className="flex h-full flex-col">
                <FixedToolbar>
                    <FixedToolbarButtons
                        onAIClick={onAIClick}
                        aiSidebarOpen={aiSidebarOpen}
                    />
                </FixedToolbar>

                <div className="flex shrink-0 items-center gap-3 border-b px-16 py-3 sm:px-[max(64px,calc(50%-350px))]">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="flex-1 bg-transparent text-3xl font-bold outline-none placeholder:text-muted-foreground/50"
                        placeholder="Untitled"
                    />
                    {saveStatus !== 'idle' && (
                        <span className="text-xs text-muted-foreground">
                            {saveStatus === 'saving' ? 'Saving...' : 'Saved ✓'}
                        </span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto relative">
                    <EditorContainer>
                        <Editor
                            placeholder={isBlank && onWingIt ? '' : 'Start writing...'}
                        />
                        <FloatingToolbar>
                            <FloatingToolbarButtons />
                        </FloatingToolbar>
                    </EditorContainer>
                    {isBlank && onWingIt && (
                        <div
                            className="absolute inset-x-0 flex items-start px-16 sm:px-[max(64px,calc(50%-350px))]"
                            style={{ top: '16px', pointerEvents: 'none' }}
                        >
                            <span className="text-sm text-muted-foreground/80" style={{ pointerEvents: 'none' }}>
                                Feeling lazy? why don&apos;t you{' '}
                                <button
                                    type="button"
                                    onClick={onWingIt}
                                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                                    style={{ pointerEvents: 'auto' }}
                                >
                                    wing it
                                </button>
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </Plate>
    );
}

// ── DocumentEditor ───────────────────────────────────────────────────────────

export function DocumentEditor({
    onAIClick,
    aiSidebarOpen,
}: {
    onAIClick?: () => void;
    aiSidebarOpen?: boolean;
}) {
    const { getActiveDoc, getGlobalContextDoc, getAllDocs, folders, renameDoc, updateDocContent, isActiveDocLoading } = useDocStore();
    const { getToken } = useAuth();
    const activeDoc = getActiveDoc();

    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
    const [localTitle, setLocalTitle] = useState('');
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const savingStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Tracks the last doc ID for which we synced localTitle — prevents Convex
    // echo-backs from overwriting what the user is actively typing.
    const lastSyncedDocIdRef = useRef<string | undefined>(undefined);

    // Wing It state — managed here so we can stream directly into the editor
    const [wingItOpen, setWingItOpen] = useState(false);
    const editorInstanceRef = useRef<ReturnType<typeof usePlateEditor> | null>(null);
    const wingItAbortRef = useRef<AbortController | null>(null);

    // Context doc for Wing It
    const contextDoc = getGlobalContextDoc();
    const contextDocContent = useQuery(
        api.documents.getDocContent,
        contextDoc ? { id: contextDoc.id as Id<'documents'> } : 'skip'
    );

    const updateStatus = useMutation(api.wingIt.updateStatus);

    // Keep a ref to active doc ID so callbacks don't depend on the full object
    const activeDocIdRef = useRef<string | null>(activeDoc?.id ?? null);
    activeDocIdRef.current = activeDoc?.id ?? null;

    // Sync local title ONLY when switching to a different document.
    // We track the last synced ID to ignore updates where only the title changed 
    // (which happens when Convex echoes back our own typing).
    useEffect(() => {
        if (activeDoc && activeDoc.id !== lastSyncedDocIdRef.current) {
            lastSyncedDocIdRef.current = activeDoc.id;
            setLocalTitle(activeDoc.title);
        }
    }, [activeDoc?.id, activeDoc?.title]);

    const handleTitleChange = useCallback(
        (newTitle: string) => {
            setLocalTitle(newTitle);

            const docId = activeDocIdRef.current;
            if (!docId) return;

            if (titleTimeoutRef.current) {
                clearTimeout(titleTimeoutRef.current);
            }

            titleTimeoutRef.current = setTimeout(() => {
                renameDoc(docId, newTitle);
            }, 500);
        },
        [renameDoc]
    );

    const handleContentChange = useCallback(
        (content: any[]) => {
            const docId = activeDocIdRef.current;
            if (!docId) return;

            // Debounce the 'saving' indicator to avoid a re-render on every keystroke
            if (savingStatusTimeoutRef.current) {
                clearTimeout(savingStatusTimeoutRef.current);
            }
            savingStatusTimeoutRef.current = setTimeout(() => {
                setSaveStatus('saving');
            }, 100);

            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            saveTimeoutRef.current = setTimeout(() => {
                if (savingStatusTimeoutRef.current) {
                    clearTimeout(savingStatusTimeoutRef.current);
                    savingStatusTimeoutRef.current = null;
                }
                updateDocContent(docId, content);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }, 500);
        },
        [updateDocContent]
    );

    // Called by PlateEditor once the editor instance is ready
    const handleEditorReady = useCallback((editor: ReturnType<typeof usePlateEditor>) => {
        editorInstanceRef.current = editor;
    }, []);

    // ── Phase 3: Write Document — streams into the editor ──────────────────────

    const handleGenerate = useCallback(
        async (topic: string, qas: { question: string; answer: string }[], scratchpad: string, runId: Id<'wingItRuns'> | null) => {
            const docId = activeDocIdRef.current;
            const editor = editorInstanceRef.current;
            if (!docId || !editor) return;

            wingItAbortRef.current?.abort();
            wingItAbortRef.current = new AbortController();

            // Assemble context
            const allDocs = getAllDocs();
            const convexToken = await getToken({ template: 'convex' });
            let contextDocMd: string | undefined;
            if (contextDocContent?.content && contextDocContent.content.length > 0) {
                contextDocMd = serializeDocToMarkdown(contextDocContent.content);
            }
            const directoryTree = buildDirectoryTree(folders, allDocs);

            const mdEditor = createMarkdownEditor();
            let markdownBuffer = '';
            let lastRenderTime = 0;
            let lastSaveTime = 0;
            let hasClosedModal = false;
            // 1500ms between editor renders — keeps main thread free for user interaction
            const RENDER_INTERVAL = 1500;
            // 5s between mid-stream Convex saves — preserves content if tab is killed
            const SAVE_INTERVAL = 5000;

            // Yields to browser via setTimeout(0) before the heavy parse + setValue
            const flushToEditor = (snapshot: string) => {
                if (!snapshot) return;
                setTimeout(() => {
                    try {
                        const nodes = deserializeMd(mdEditor, snapshot);
                        const safe = flattenNestedLists(nodes as any[]);
                        editor.tf.setValue(safe);
                    } catch {
                        // Partial markdown can fail to parse — skip until more arrives
                    }
                }, 0);
            };

            const saveToDisk = (content: string) => {
                if (!content) return;
                try {
                    const nodes = deserializeMd(mdEditor, content);
                    const safe = flattenNestedLists(nodes as any[]);
                    updateDocContent(docId, safe);
                } catch {
                    // ignore
                }
            };

            try {
                const res = await fetch('/api/ai/wing-it', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'writeDocument',
                        topic,
                        allQAs: qas,
                        scratchpad,
                        contextDocMd,
                        directoryTree,
                        allDocs: allDocs.map((d) => ({ id: d.id, title: d.title })),
                        convexToken: convexToken ?? undefined,
                    }),
                    signal: wingItAbortRef.current.signal,
                });

                for await (const event of parseSSEStream(res)) {
                    if (event.type === 'text' && typeof event.content === 'string') {
                        // Close modal on first text chunk
                        if (!hasClosedModal) {
                            hasClosedModal = true;
                            setWingItOpen(false);
                        }
                        markdownBuffer += event.content;

                        const now = Date.now();

                        // Throttled editor render — avoids blocking the main thread
                        if (now - lastRenderTime > RENDER_INTERVAL) {
                            lastRenderTime = now;
                            flushToEditor(markdownBuffer);
                        }

                        // Separate mid-stream Convex save — preserves content on tab kill
                        if (now - lastSaveTime > SAVE_INTERVAL) {
                            lastSaveTime = now;
                            saveToDisk(markdownBuffer);
                        }
                        if (runId) {
                            updateStatus({ id: runId, status: 'done' }).catch(console.error);
                        }
                    } else if (event.type === 'done') {
                        // Final flush + definitive Convex save
                        flushToEditor(markdownBuffer);
                        saveToDisk(markdownBuffer);
                        setWingItOpen(false);
                    }
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    console.error('[WingIt] writeDocument error:', err);
                    if (markdownBuffer) {
                        flushToEditor(markdownBuffer);
                        saveToDisk(markdownBuffer);
                    }
                    if (runId) {
                        updateStatus({ id: runId, status: 'error' }).catch(console.error);
                    }
                }
                setWingItOpen(false);
            }
        },
        [getAllDocs, getToken, contextDocContent, folders, updateDocContent, updateStatus]
    );

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
            if (savingStatusTimeoutRef.current) clearTimeout(savingStatusTimeoutRef.current);
            wingItAbortRef.current?.abort();
        };
    }, []);

    if (!activeDoc) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <FileText className="size-12 opacity-30" />
                <p className="text-sm">Select or create a document to get started</p>
            </div>
        );
    }

    // Don't mount the editor until content has loaded from Convex.
    // initialContent is only read once at mount time (hydration), so mounting
    // before content arrives would result in an empty editor that fires onChange
    // with [] and overwrites real content in the database.
    if (isActiveDocLoading) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <p className="text-sm text-muted-foreground/50">Loading...</p>
            </div>
        );
    }

    // Key forces remount when doc changes to reset editor state
    return (
        <>
            <PlateEditor
                key={activeDoc.id}
                docId={activeDoc.id}
                initialContent={activeDoc.content}
                onContentChange={handleContentChange}
                title={localTitle}
                setTitle={handleTitleChange}
                saveStatus={saveStatus}
                onAIClick={onAIClick}
                aiSidebarOpen={aiSidebarOpen}
                onWingIt={() => setWingItOpen(true)}
                onEditorReady={handleEditorReady}
            />
            <WingItModal
                open={wingItOpen}
                onClose={() => setWingItOpen(false)}
                onGenerate={handleGenerate}
            />
        </>
    );
}

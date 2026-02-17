'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plate, usePlateEditor } from 'platejs/react';
import { NodeIdPlugin, RangeApi } from 'platejs';

import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { BlockSelectionKit } from '@/components/editor/plugins/block-selection-kit';
import { CalloutKit } from '@/components/editor/plugins/callout-kit';
import { CodeBlockKit } from '@/components/editor/plugins/code-block-kit';
import { DndKit } from '@/components/editor/plugins/dnd-kit';
import { MarkdownKit } from '@/components/editor/plugins/markdown-kit';
import { MediaKit } from '@/components/editor/plugins/media-kit';
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { SlashKit } from '@/components/editor/plugins/slash-kit';
import { TableKit } from '@/components/editor/plugins/table-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { FixedToolbar } from '@/components/ui/fixed-toolbar';
import { FixedToolbarButtons } from '@/components/ui/fixed-toolbar-buttons';
import { useDocStore } from '@/lib/doc-store';
import { useChatStore } from '@/lib/ai/chat-store';
import { FileText } from 'lucide-react';

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
    ...FloatingToolbarKit,
    ...SlashKit,
    ...BlockSelectionKit,
    ...DndKit,
    ...MarkdownKit,
    NodeIdPlugin.configure({
        options: {
            normalizeInitialValue: true,
            reuseId: true,
        },
    }),
];

function PlateEditor({
    docId,
    initialContent,
    onContentChange,
    title,
    setTitle,
    saveStatus,
    onAIClick,
    aiSidebarOpen,
}: {
    docId: string;
    initialContent: any[];
    onContentChange: (content: any[]) => void;
    title: string;
    setTitle: (title: string) => void;
    saveStatus: 'saved' | 'saving' | 'idle';
    onAIClick?: () => void;
    aiSidebarOpen?: boolean;
}) {
    const chatStore = useChatStore();

    const editor = usePlateEditor({
        plugins,
        value: initialContent,
    });

    // Expose editor to chat store for AI edits
    useEffect(() => {
        chatStore.editorRef.current = editor;
        return () => {
            if (chatStore.editorRef.current === editor) {
                chatStore.editorRef.current = null;
            }
        };
    }, [editor, chatStore.editorRef]);

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
                    chatStore.setSelectedText('');
                    return;
                }
                try {
                    const text = editor.api.string(selection);
                    chatStore.setSelectedText(text || '');
                } catch {
                    chatStore.setSelectedText('');
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
    }, [editor, chatStore]);

    return (
        <Plate
            editor={editor}
            onChange={({ value }) => {
                onContentChange(value);
            }}
        >
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

                <div className="flex-1 overflow-y-auto">
                    <EditorContainer>
                        <Editor placeholder="Start writing..." />
                    </EditorContainer>
                </div>
            </div>
        </Plate>
    );
}

export function DocumentEditor({
    onAIClick,
    aiSidebarOpen,
}: {
    onAIClick?: () => void;
    aiSidebarOpen?: boolean;
}) {
    const { getActiveDoc, renameDoc, updateDocContent } = useDocStore();
    const activeDoc = getActiveDoc();

    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>(
        'idle'
    );
    const [localTitle, setLocalTitle] = useState('');
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Sync local title when activeDoc changes
    useEffect(() => {
        if (activeDoc) {
            setLocalTitle(activeDoc.title);
        }
    }, [activeDoc?.id, activeDoc?.title]);

    const handleTitleChange = useCallback(
        (newTitle: string) => {
            setLocalTitle(newTitle);

            if (!activeDoc) return;

            if (titleTimeoutRef.current) {
                clearTimeout(titleTimeoutRef.current);
            }

            titleTimeoutRef.current = setTimeout(() => {
                renameDoc(activeDoc.id, newTitle);
            }, 500);
        },
        [activeDoc, renameDoc]
    );

    const handleContentChange = useCallback(
        (content: any[]) => {
            if (!activeDoc) return;

            setSaveStatus('saving');

            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            saveTimeoutRef.current = setTimeout(() => {
                updateDocContent(activeDoc.id, content);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }, 500);
        },
        [activeDoc, updateDocContent]
    );

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            if (titleTimeoutRef.current) {
                clearTimeout(titleTimeoutRef.current);
            }
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

    // Key forces remount when doc changes to reset editor state
    return (
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
        />
    );
}

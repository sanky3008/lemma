'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import type { SlateEditor } from 'platejs';
import { deserializeMd } from '@platejs/markdown';
import { useDocStore } from '@/lib/doc-store';
import {
  buildDirectoryTree,
  createMarkdownEditor,
  serializeDocToMarkdown,
  serializeToAnnotatedMarkdown,
} from './serialize';
import { applyEditsToEditor, applyEditsToDocContent } from './edit-engine';
import type { EditInstruction } from './types';

const THREADS_KEY = 'thinkos-ai-threads';

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

type ThreadMeta = {
  id: string;
  title: string;
  createdAt: number;
};

function loadThreadMetas(): ThreadMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(THREADS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveThreadMetas(metas: ThreadMeta[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THREADS_KEY, JSON.stringify(metas));
}

type ChatStoreContextValue = {
  threadMetas: ThreadMeta[];
  activeThreadId: string | null;
  messages: UIMessage[];
  status: string;
  selectedText: string;
  setSelectedText: (text: string) => void;
  createThread: () => string;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
  sendMessage: (content: string) => void;
  editorRef: React.MutableRefObject<SlateEditor | null>;
};

const ChatStoreContext = createContext<ChatStoreContextValue | null>(null);

const chatTransport = new DefaultChatTransport({
  api: '/api/ai/chat',
});

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [threadMetas, setThreadMetas] = useState<ThreadMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const editorRef = useRef<SlateEditor | null>(null);
  const appliedEditsRef = useRef<Set<string>>(new Set());

  const docStore = useDocStore();

  // Load thread metas on mount
  useEffect(() => {
    setThreadMetas(loadThreadMetas());
  }, []);

  // Persist thread metas
  useEffect(() => {
    if (threadMetas.length > 0) {
      saveThreadMetas(threadMetas);
    }
  }, [threadMetas]);

  const assembleContext = useCallback(() => {
    const activeDoc = docStore.getActiveDoc();
    const contextDoc = docStore.getGlobalContextDoc();
    const allDocs = docStore.docs;
    const folders = docStore.folders;

    let activeDocAnnotatedMd: string | null = null;
    if (activeDoc && editorRef.current) {
      const mdEditor = createMarkdownEditor();
      activeDocAnnotatedMd = serializeToAnnotatedMarkdown(
        mdEditor,
        editorRef.current.children
      );
    }

    let contextDocMd: string | null = null;
    if (contextDoc) {
      contextDocMd = serializeDocToMarkdown(contextDoc.content);
    }

    return {
      activeDocId: activeDoc?.id ?? null,
      activeDocAnnotatedMd,
      activeDocTitle: activeDoc?.title ?? null,
      contextDocMd,
      directoryTree: buildDirectoryTree(folders, allDocs),
      allDocs: allDocs.map((d) => ({
        id: d.id,
        title: d.title,
        folderId: d.folderId,
        content: d.content,
      })),
      selectedText: selectedText || undefined,
    };
  }, [docStore, selectedText]);

  const applyEditsFromMessage = useCallback((message: UIMessage) => {
    // Avoid applying edits twice
    if (appliedEditsRef.current.has(message.id)) return;
    appliedEditsRef.current.add(message.id);

    const edits: EditInstruction[] = [];

    for (const part of message.parts) {
      const p = part as any;
      const isToolPart = p.type === 'dynamic-tool' || p.type?.startsWith('tool-');
      if (isToolPart && p.state === 'output-available') {
        const output = p.output;
        if (output?.type === 'edit' && output?.instruction) {
          edits.push(output.instruction as EditInstruction);
        }
      }
    }

    if (edits.length === 0) return;

    const activeDocId = docStore.getActiveDoc()?.id;

    // Default missing docId to the active document
    const normalizedEdits = edits.map((e) => {
      if ((e.mode === 'single' || e.mode === 'range') && !e.docId && activeDocId) {
        return { ...e, docId: activeDocId };
      }
      return e;
    });

    const activeEdits = normalizedEdits.filter(
      (e) =>
        (e.mode === 'single' || e.mode === 'range') &&
        e.docId === activeDocId
    );
    const otherEdits = normalizedEdits.filter(
      (e) =>
        (e.mode === 'single' || e.mode === 'range') &&
        e.docId !== activeDocId
    );
    const newFileEdits = edits.filter((e) => e.mode === 'newFile');

    // Apply active doc edits
    if (activeEdits.length > 0 && editorRef.current) {
      const newBlockIds = applyEditsToEditor(editorRef.current, activeEdits);

      // Highlight new blocks and scroll to the first one
      if (newBlockIds.length > 0) {
        requestAnimationFrame(() => {
          const editor = editorRef.current;
          if (!editor) return;

          let firstDom: HTMLElement | null = null;

          for (const child of editor.children) {
            if (newBlockIds.includes((child as any).id)) {
              try {
                const dom = (editor as any).api.toDOMNode(child) as HTMLElement | null;
                if (dom) {
                  dom.classList.add('ai-edited-block');
                  if (!firstDom) firstDom = dom;
                }
              } catch {
                // toDOMNode can throw if element isn't mounted yet
              }
            }
          }

          // Scroll first edited block into view
          firstDom?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }

    // Apply other doc edits
    const docEditGroups = new Map<string, EditInstruction[]>();
    for (const edit of otherEdits) {
      if (edit.mode === 'single' || edit.mode === 'range') {
        const group = docEditGroups.get(edit.docId) ?? [];
        group.push(edit);
        docEditGroups.set(edit.docId, group);
      }
    }
    for (const [docId, docEdits] of docEditGroups) {
      const doc = docStore.docs.find((d) => d.id === docId);
      if (doc) {
        const newContent = applyEditsToDocContent(doc.content, docEdits);
        docStore.updateDocContent(docId, newContent);
      }
    }

    // Create new files
    for (const edit of newFileEdits) {
      if (edit.mode === 'newFile') {
        // Deserialize markdown to Plate content
        const mdEditor = createMarkdownEditor();
        const content = edit.markdown
          ? deserializeMd(mdEditor, edit.markdown)
          : undefined;
        docStore.createDoc(edit.folderId, edit.title, content);
      }
    }
  }, [docStore]);

  const chat = useChat({
    transport: chatTransport,
    onFinish: (event) => {
      applyEditsFromMessage(event.message);
    },
  });

  const createThread = useCallback((): string => {
    const id = generateId();
    const meta: ThreadMeta = {
      id,
      title: 'New Chat',
      createdAt: Date.now(),
    };
    setThreadMetas((prev) => [meta, ...prev]);
    setActiveThreadId(id);
    chat.setMessages([]);
    return id;
  }, [chat]);

  const switchThread = useCallback((id: string) => {
    setActiveThreadId(id);
    chat.setMessages([]);
  }, [chat]);

  const deleteThread = useCallback(
    (id: string) => {
      setThreadMetas((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) {
        setActiveThreadId(null);
        chat.setMessages([]);
      }
    },
    [activeThreadId, chat]
  );

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!activeThreadId) {
        const id = generateId();
        const meta: ThreadMeta = {
          id,
          title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
          createdAt: Date.now(),
        };
        setThreadMetas((prev) => [meta, ...prev]);
        setActiveThreadId(id);
      } else {
        setThreadMetas((prev) =>
          prev.map((t) =>
            t.id === activeThreadId && t.title === 'New Chat'
              ? { ...t, title: content.substring(0, 50) + (content.length > 50 ? '...' : '') }
              : t
          )
        );
      }

      const context = assembleContext();

      chat.sendMessage(
        { text: content },
        { body: { context } }
      );
    },
    [activeThreadId, assembleContext, chat]
  );

  const value: ChatStoreContextValue = {
    threadMetas,
    activeThreadId,
    messages: chat.messages,
    status: chat.status,
    selectedText,
    setSelectedText,
    createThread,
    switchThread,
    deleteThread,
    sendMessage: handleSendMessage,
    editorRef,
  };

  return (
    <ChatStoreContext.Provider value={value}>{children}</ChatStoreContext.Provider>
  );
}

export function useChatStore() {
  const context = useContext(ChatStoreContext);
  if (!context) {
    throw new Error('useChatStore must be used within a ChatStoreProvider');
  }
  return context;
}

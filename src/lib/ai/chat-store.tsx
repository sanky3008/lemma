'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { applyEditsToEditor } from './edit-engine';
import type { EditInstruction } from './types';

const THREADS_KEY = 'thinkos-ai-threads';
const THREAD_MESSAGES_PREFIX = 'thinkos-ai-msgs-';

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

function loadThreadMessages(threadId: string): UIMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(THREAD_MESSAGES_PREFIX + threadId);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveThreadMessages(threadId: string, messages: UIMessage[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THREAD_MESSAGES_PREFIX + threadId, JSON.stringify(messages));
}

function deleteThreadMessages(threadId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(THREAD_MESSAGES_PREFIX + threadId);
}

// ─── Stable context: things the editor needs (rarely changes) ───

type ChatStoreContextValue = {
  threadMetas: ThreadMeta[];
  activeThreadId: string | null;
  selectedText: string;
  setSelectedText: (text: string) => void;
  createThread: () => string;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
  sendMessage: (content: string) => void;
  editorRef: React.MutableRefObject<SlateEditor | null>;
};

// ─── Volatile context: streaming state (changes on every token) ───

type ChatStreamContextValue = {
  messages: UIMessage[];
  status: string;
};

const ChatStoreContext = createContext<ChatStoreContextValue | null>(null);
const ChatStreamContext = createContext<ChatStreamContextValue | null>(null);

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
    const newFileEdits = edits.filter((e) => e.mode === 'newFile');

    // Silently skip any edits targeting non-active documents
    // (the server-side tool already returns an error to the AI in this case)

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

  // Persist messages whenever they change
  useEffect(() => {
    if (activeThreadId && chat.messages.length > 0) {
      saveThreadMessages(activeThreadId, chat.messages);
    }
  }, [activeThreadId, chat.messages]);

  const createThread = useCallback((): string => {
    // Save current thread's messages before switching
    if (activeThreadId && chat.messages.length > 0) {
      saveThreadMessages(activeThreadId, chat.messages);
    }
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
  }, [chat, activeThreadId]);

  const switchThread = useCallback((id: string) => {
    // Save current thread's messages before switching
    if (activeThreadId && chat.messages.length > 0) {
      saveThreadMessages(activeThreadId, chat.messages);
    }
    setActiveThreadId(id);
    // Restore the target thread's messages
    const savedMessages = loadThreadMessages(id);
    chat.setMessages(savedMessages);
  }, [chat, activeThreadId]);

  const deleteThread = useCallback(
    (id: string) => {
      setThreadMetas((prev) => prev.filter((t) => t.id !== id));
      deleteThreadMessages(id);
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

  // ─── Memoize stable context value ───
  const stableValue = useMemo<ChatStoreContextValue>(() => ({
    threadMetas,
    activeThreadId,
    selectedText,
    setSelectedText,
    createThread,
    switchThread,
    deleteThread,
    sendMessage: handleSendMessage,
    editorRef,
  }), [
    threadMetas,
    activeThreadId,
    selectedText,
    setSelectedText,
    createThread,
    switchThread,
    deleteThread,
    handleSendMessage,
  ]);

  // ─── Memoize volatile context value ───
  const streamValue = useMemo<ChatStreamContextValue>(() => ({
    messages: chat.messages,
    status: chat.status,
  }), [chat.messages, chat.status]);

  return (
    <ChatStoreContext.Provider value={stableValue}>
      <ChatStreamContext.Provider value={streamValue}>
        {children}
      </ChatStreamContext.Provider>
    </ChatStoreContext.Provider>
  );
}

/**
 * Access stable chat state (threads, actions, editorRef).
 * Does NOT re-render on streaming token changes.
 */
export function useChatStore() {
  const context = useContext(ChatStoreContext);
  if (!context) {
    throw new Error('useChatStore must be used within a ChatStoreProvider');
  }
  return context;
}

/**
 * Access volatile streaming state (messages, status).
 * Only use in components that need to display streaming content (e.g., AIChatSidebar).
 */
export function useChatStream() {
  const context = useContext(ChatStreamContext);
  if (!context) {
    throw new Error('useChatStream must be used within a ChatStoreProvider');
  }
  return context;
}

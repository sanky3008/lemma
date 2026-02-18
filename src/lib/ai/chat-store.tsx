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
  serializeToXML,
} from './serialize';
import { applyEditsToEditor } from './edit-engine';
import type { EditInstruction } from './types';
import { useQuery, useMutation } from 'convex/react';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

type ThreadMeta = {
  id: string; // local client ID
  convexId: Id<'threads'> | null; // Convex DB ID (null until created)
  title: string;
  createdAt: number;
};

// ─── Stable context: things the editor needs (rarely changes) ───

type ChatStoreContextValue = {
  threadMetas: ThreadMeta[];
  activeThreadId: string | null;
  selectedText: string;
  setSelectedText: (text: string) => void;
  createThread: () => string;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  editorRef: React.MutableRefObject<SlateEditor | null>;
  /** Ref written by CommentsSync with raw Convex comments — zero re-renders */
  commentsRef: React.MutableRefObject<any[] | undefined>;
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

/** Convert UIMessages to the simplified format Convex stores */
function uiMessagesToConvex(messages: UIMessage[]) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const content = m.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text as string)
        .join('');

      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content,
        createdAt: Date.now(),
      };
    });
}

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [threadMetas, setThreadMetas] = useState<ThreadMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const editorRef = useRef<SlateEditor | null>(null);
  const commentsRef = useRef<any[] | undefined>(undefined);
  const appliedEditsRef = useRef<Set<string>>(new Set());

  // Map from local clientId → Convex _id (persisted in a ref to avoid re-renders)
  const convexIdMapRef = useRef<Map<string, Id<'threads'>>>(new Map());

  const { getToken } = useAuth();
  const docStore = useDocStore();

  // Fetch thread list from Convex
  const convexThreads = useQuery(api.threads.list);

  // Convex mutations
  const convexCreate = useMutation(api.threads.create);
  const convexUpdateTitle = useMutation(api.threads.updateTitle);
  const convexSaveMessages = useMutation(api.threads.saveMessages);
  const convexRemove = useMutation(api.threads.remove);

  // Sync Convex threads into local state on first load
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (convexThreads === undefined) return; // still loading

    initializedRef.current = true;

    if (convexThreads.length === 0) return;

    const metas: ThreadMeta[] = convexThreads.map((t) => ({
      id: t._id, // use convex ID as local ID for simplicity on load
      convexId: t._id as Id<'threads'>,
      title: t.title ?? 'Chat',
      createdAt: t.createdAt,
    }));

    setThreadMetas(metas);

    // Populate the map
    for (const t of convexThreads) {
      convexIdMapRef.current.set(t._id, t._id as Id<'threads'>);
    }
  }, [convexThreads]);

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

    let activeDocXml: string | null = null;
    if (activeDoc && editorRef.current) {
      activeDocXml = serializeToXML(editorRef.current.children, commentsRef.current);
    }

    let contextDocMd: string | null = null;
    if (contextDoc) {
      contextDocMd = serializeDocToMarkdown(contextDoc.content);
    }

    return {
      activeDocId: activeDoc?.id ?? null,
      activeDocAnnotatedMd,
      activeDocXml,
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

    if (activeEdits.length > 0 && editorRef.current) {
      const newBlockIds = applyEditsToEditor(editorRef.current, activeEdits);

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

          firstDom?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }

    for (const edit of newFileEdits) {
      if (edit.mode === 'newFile') {
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

  // Persist messages to Convex whenever they finish streaming
  const saveToConvex = useCallback(
    async (threadLocalId: string, messages: UIMessage[]) => {
      const convexId = convexIdMapRef.current.get(threadLocalId);
      if (!convexId) return;

      const convexMessages = uiMessagesToConvex(messages);
      try {
        await convexSaveMessages({ threadId: convexId, messages: convexMessages });
      } catch (err) {
        console.error('[chat-store] Failed to save messages to Convex:', err);
      }
    },
    [convexSaveMessages]
  );

  // Save on each completed response
  useEffect(() => {
    if (activeThreadId && chat.status === 'ready' && chat.messages.length > 0) {
      saveToConvex(activeThreadId, chat.messages);
    }
  }, [activeThreadId, chat.status, chat.messages, saveToConvex]);

  const createThread = useCallback((): string => {
    const id = generateId();
    const meta: ThreadMeta = {
      id,
      convexId: null,
      title: 'New Chat',
      createdAt: Date.now(),
    };
    setThreadMetas((prev) => [meta, ...prev]);
    setActiveThreadId(id);
    chat.setMessages([]);

    // Create in Convex asynchronously
    convexCreate({ clientId: id, title: 'New Chat' })
      .then((convexId) => {
        convexIdMapRef.current.set(id, convexId as Id<'threads'>);
        setThreadMetas((prev) =>
          prev.map((t) => (t.id === id ? { ...t, convexId: convexId as Id<'threads'> } : t))
        );
      })
      .catch((err) => console.error('[chat-store] Failed to create thread in Convex:', err));

    return id;
  }, [chat, convexCreate]);

  const switchThread = useCallback(
    async (id: string) => {
      // Save current thread before switching
      if (activeThreadId && chat.messages.length > 0) {
        await saveToConvex(activeThreadId, chat.messages);
      }

      setActiveThreadId(id);

      // Load messages from Convex if we have a convex ID
      const convexId = convexIdMapRef.current.get(id);
      if (convexId) {
        // Messages will be loaded via the get query below; for now clear optimistically
        chat.setMessages([]);
      } else {
        chat.setMessages([]);
      }
    },
    [chat, activeThreadId, saveToConvex]
  );

  // Load messages when switching to a thread that has a Convex ID
  const activeConvexId = activeThreadId
    ? (convexIdMapRef.current.get(activeThreadId) ?? null)
    : null;

  const activeThreadData = useQuery(
    api.threads.get,
    activeConvexId ? { threadId: activeConvexId } : 'skip'
  );

  // When we switch threads and data loads, populate messages
  const lastLoadedThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeThreadId || !activeThreadData) return;
    if (lastLoadedThreadRef.current === activeThreadId) return;
    if (chat.messages.length > 0) return; // already has messages (user just sent one)

    lastLoadedThreadRef.current = activeThreadId;

    // Convert Convex messages back to UIMessage format
    const uiMessages: UIMessage[] = activeThreadData.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: [{ type: 'text' as const, text: m.content }],
      createdAt: new Date(m.createdAt),
    }));

    if (uiMessages.length > 0) {
      chat.setMessages(uiMessages);
    }
  }, [activeThreadId, activeThreadData, chat]);

  const deleteThread = useCallback(
    (id: string) => {
      setThreadMetas((prev) => prev.filter((t) => t.id !== id));

      if (activeThreadId === id) {
        setActiveThreadId(null);
        chat.setMessages([]);
      }

      const convexId = convexIdMapRef.current.get(id);
      if (convexId) {
        convexRemove({ threadId: convexId }).catch((err) =>
          console.error('[chat-store] Failed to delete thread from Convex:', err)
        );
        convexIdMapRef.current.delete(id);
      }
    },
    [activeThreadId, chat, convexRemove]
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      let threadLocalId = activeThreadId;

      if (!threadLocalId) {
        // Create a new thread locally + in Convex
        const id = generateId();
        const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
        const meta: ThreadMeta = {
          id,
          convexId: null,
          title,
          createdAt: Date.now(),
        };
        setThreadMetas((prev) => [meta, ...prev]);
        setActiveThreadId(id);
        threadLocalId = id;

        convexCreate({ clientId: id, title })
          .then((convexId) => {
            convexIdMapRef.current.set(id, convexId as Id<'threads'>);
            setThreadMetas((prev) =>
              prev.map((t) => (t.id === id ? { ...t, convexId: convexId as Id<'threads'> } : t))
            );
          })
          .catch((err) => console.error('[chat-store] Failed to create thread in Convex:', err));
      } else {
        // Update title from "New Chat" to first message
        setThreadMetas((prev) =>
          prev.map((t) =>
            t.id === threadLocalId && t.title === 'New Chat'
              ? {
                  ...t,
                  title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
                }
              : t
          )
        );

        // Sync title update to Convex
        const convexId = convexIdMapRef.current.get(threadLocalId);
        const currentMeta = threadMetas.find((t) => t.id === threadLocalId);
        if (convexId && currentMeta?.title === 'New Chat') {
          const newTitle = content.substring(0, 50) + (content.length > 50 ? '...' : '');
          convexUpdateTitle({ threadId: convexId, title: newTitle }).catch((err) =>
            console.error('[chat-store] Failed to update thread title in Convex:', err)
          );
        }
      }

      const context = assembleContext();
      const convexToken = await getToken({ template: 'convex' });

      chat.sendMessage(
        { text: content },
        { body: { context: { ...context, convexToken } } }
      );
    },
    [activeThreadId, assembleContext, chat, convexCreate, convexUpdateTitle, threadMetas]
  );

  // ─── Memoize stable context value ───
  const stableValue = useMemo<ChatStoreContextValue>(
    () => ({
      threadMetas,
      activeThreadId,
      selectedText,
      setSelectedText,
      createThread,
      switchThread,
      deleteThread,
      sendMessage: handleSendMessage,
      editorRef,
      commentsRef,
    }),
    [
      threadMetas,
      activeThreadId,
      selectedText,
      createThread,
      switchThread,
      deleteThread,
      handleSendMessage,
    ]
  );

  // ─── Memoize volatile context value ───
  const streamValue = useMemo<ChatStreamContextValue>(
    () => ({
      messages: chat.messages,
      status: chat.status,
    }),
    [chat.messages, chat.status]
  );

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

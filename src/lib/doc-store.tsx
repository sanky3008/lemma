'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';

import type { AppState, Doc, Folder } from './types';

const STORAGE_KEY = 'thinkos-store-v2';

function generateId() {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

const GLOBAL_CONTEXT_ID = 'global-context';
const DEFAULT_FOLDER_ID = 'default-folder';
const DEFAULT_DOC_ID = 'default-doc';

function createDefaultState(): AppState {
    const now = Date.now();

    return {
        folders: [
            {
                id: DEFAULT_FOLDER_ID,
                name: 'My PRDs',
                createdAt: now,
            },
        ],
        docs: [
            {
                id: GLOBAL_CONTEXT_ID,
                title: 'Context',
                content: [
                    {
                        type: 'p',
                        children: [
                            {
                                text: 'Add your background context here — problem areas, constraints, links, reusable snippets.',
                            },
                        ],
                    },
                ],
                isContext: true,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: DEFAULT_DOC_ID,
                folderId: DEFAULT_FOLDER_ID,
                title: 'Untitled PRD',
                content: [
                    {
                        type: 'p',
                        children: [{ text: '' }],
                    },
                ],
                isContext: false,
                createdAt: now,
                updatedAt: now,
            },
        ],
        activeDocId: DEFAULT_DOC_ID,
    };
}

function loadState(): AppState {
    if (typeof window === 'undefined') return createDefaultState();

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved) as AppState;
            // Basic validation
            if (parsed.docs?.length > 0) {
                return parsed;
            }
        }
    } catch {
        // Ignore parse errors
    }

    return createDefaultState();
}

function saveState(state: AppState) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Context ---

type DocStoreActions = {
    createFolder: (name?: string) => Folder;
    renameFolder: (id: string, name: string) => void;
    deleteFolder: (id: string) => void;
    createDoc: (folderId?: string, title?: string) => Doc;
    renameDoc: (id: string, title: string) => void;
    deleteDoc: (id: string) => void;
    setActiveDoc: (id: string | null) => void;
    updateDocContent: (id: string, content: any[]) => void;
    getDocsForFolder: (folderId: string) => Doc[];
    getGlobalContextDoc: () => Doc | undefined;
    getRootDocs: () => Doc[];
    getActiveDoc: () => Doc | undefined;
};

type DocStoreContextValue = AppState & DocStoreActions;

const DocStoreContext = createContext<DocStoreContextValue | null>(null);

export function DocStoreProvider({ children }: { children: ReactNode }) {
    // Initialize with a lazy initializer that is consistent across renders if possible
    // For hydration/SSR match, we ideally start with a deterministic state or null.
    // However, Next.js hydration expects matching HTML.
    // We use createDefaultState which uses hardcoded IDs for the initial state.
    // This ensures server and client match on first render.
    // Then we load true state in useEffect if needed?
    // Actually, loadState accessing localStorage is DANGEROUS during render for hydration.
    // It causes mismatch if server sends default and client sends localStorage data.
    // CORRECT PATTERN: Initialize with default, then useEffect to load storage.

    const [state, setState] = useState<AppState>(createDefaultState);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Load from storage after mount
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.docs?.length > 0) {
                    setState(parsed);
                }
            } catch (e) {
                console.error('Failed to load state', e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Persist on state change (only after loaded)
    useEffect(() => {
        if (isLoaded) {
            saveState(state);
        }
    }, [state, isLoaded]);

    const createFolder = useCallback((name?: string): Folder => {
        const folder: Folder = {
            id: generateId(),
            name: name || 'New Folder',
            createdAt: Date.now(),
        };
        // No context doc created per folder anymore
        setState((prev) => ({
            ...prev,
            folders: [...prev.folders, folder],
        }));
        return folder;
    }, []);

    const renameFolder = useCallback((id: string, name: string) => {
        setState((prev) => ({
            ...prev,
            folders: prev.folders.map((f) => (f.id === id ? { ...f, name } : f)),
        }));
    }, []);

    const deleteFolder = useCallback((id: string) => {
        setState((prev) => {
            // Allow deleting any folder now
            const docsInFolder = prev.docs.filter((d) => d.folderId === id);
            const docIds = new Set(docsInFolder.map((d) => d.id));
            const newActiveDocId =
                prev.activeDocId && docIds.has(prev.activeDocId)
                    ? prev.docs.find((d) => !docIds.has(d.id))?.id ?? null
                    : prev.activeDocId;

            return {
                ...prev,
                folders: prev.folders.filter((f) => f.id !== id),
                docs: prev.docs.filter((d) => d.folderId !== id),
                activeDocId: newActiveDocId,
            };
        });
    }, []);

    const createDoc = useCallback(
        (folderId?: string, title?: string): Doc => {
            const doc: Doc = {
                id: generateId(),
                folderId, // undefined = root
                title: title || 'Untitled Doc',
                content: [
                    {
                        type: 'p',
                        children: [{ text: '' }],
                    },
                ],
                isContext: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            setState((prev) => ({
                ...prev,
                docs: [...prev.docs, doc],
                activeDocId: doc.id,
            }));
            return doc;
        },
        []
    );

    const renameDoc = useCallback((id: string, title: string) => {
        setState((prev) => ({
            ...prev,
            docs: prev.docs.map((d) =>
                d.id === id ? { ...d, title, updatedAt: Date.now() } : d
            ),
        }));
    }, []);

    const deleteDoc = useCallback((id: string) => {
        setState((prev) => {
            const doc = prev.docs.find((d) => d.id === id);
            if (!doc) return prev;

            // Cannot delete the global context doc
            if (doc.isContext) return prev;

            const newActiveDocId =
                prev.activeDocId === id
                    ? prev.docs.find((d) => d.id !== id)?.id ?? null
                    : prev.activeDocId;

            return {
                ...prev,
                docs: prev.docs.filter((d) => d.id !== id),
                activeDocId: newActiveDocId,
            };
        });
    }, []);

    const setActiveDoc = useCallback((id: string | null) => {
        setState((prev) => ({ ...prev, activeDocId: id }));
    }, []);

    const updateDocContent = useCallback((id: string, content: any[]) => {
        setState((prev) => ({
            ...prev,
            docs: prev.docs.map((d) =>
                d.id === id ? { ...d, content, updatedAt: Date.now() } : d
            ),
        }));
    }, []);

    const getDocsForFolder = useCallback(
        (folderId: string) => {
            return state.docs
                .filter((d) => d.folderId === folderId)
                .sort((a, b) => a.createdAt - b.createdAt);
        },
        [state.docs]
    );

    const getRootDocs = useCallback(() => {
        return state.docs
            .filter((d) => !d.folderId && !d.isContext)
            .sort((a, b) => a.createdAt - b.createdAt);
    }, [state.docs]);

    const getGlobalContextDoc = useCallback(() => {
        return state.docs.find((d) => d.isContext);
    }, [state.docs]);

    const getActiveDoc = useCallback(() => {
        return state.docs.find((d) => d.id === state.activeDocId);
    }, [state.docs, state.activeDocId]);

    const value: DocStoreContextValue = {
        ...state,
        createFolder,
        renameFolder,
        deleteFolder,
        createDoc,
        renameDoc,
        deleteDoc,
        setActiveDoc,
        updateDocContent,
        getDocsForFolder,
        getRootDocs,
        getGlobalContextDoc,
        getActiveDoc,
    };

    return (
        <DocStoreContext.Provider value={value}>{children}</DocStoreContext.Provider>
    );
}

export function useDocStore() {
    const context = useContext(DocStoreContext);
    if (!context) {
        throw new Error('useDocStore must be used within a DocStoreProvider');
    }
    return context;
}

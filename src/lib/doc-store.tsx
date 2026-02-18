'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

import type { AppState, Doc, Folder } from './types';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// --- Context ---

type DocStoreActions = {
    createFolder: (name?: string) => Promise<string | null>;
    renameFolder: (id: string, name: string) => void;
    deleteFolder: (id: string) => void;
    createDoc: (folderId?: string, title?: string, content?: any[]) => Promise<string | null>;
    renameDoc: (id: string, title: string) => void;
    deleteDoc: (id: string) => void;
    setActiveDoc: (id: string | null) => void;
    updateDocContent: (id: string, content: any[]) => void;
    getDocsForFolder: (folderId: string) => Doc[];
    getGlobalContextDoc: () => Doc | undefined;
    getRootDocs: () => Doc[];
    getActiveDoc: () => Doc | undefined;
    getDocById: (id: string) => Doc | undefined;
    getAllDocs: () => Doc[];
    isLoading: boolean;
};

type DocStoreContextValue = AppState & DocStoreActions;

const DocStoreContext = createContext<DocStoreContextValue | null>(null);

export function DocStoreProvider({ children }: { children: ReactNode }) {
    // 1. Fetch Data from Convex
    const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
    const foldersRaw = useQuery(api.documents.getFolders);
    const docsRaw = useQuery(api.documents.getDocs);

    // 2. Local State for UI
    const [activeDocId, setActiveDocId] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('thinos-active-doc-id');
            if (saved) setActiveDocId(saved);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (activeDocId) {
                localStorage.setItem('thinos-active-doc-id', activeDocId);
            } else {
                localStorage.removeItem('thinos-active-doc-id');
            }
        }
    }, [activeDocId]);

    // 3. Mutations
    const createFolderMutation = useMutation(api.documents.createFolder);
    const renameFolderMutation = useMutation(api.documents.updateFolder);
    const deleteFolderMutation = useMutation(api.documents.deleteFolder);

    const createDocMutation = useMutation(api.documents.createDoc);
    const updateDocMutation = useMutation(api.documents.updateDoc);
    const deleteDocMutation = useMutation(api.documents.deleteDoc);

    // 4. Adapters
    const folders = useMemo(() => (foldersRaw || []).map(f => ({
        id: f._id,
        name: f.name,
        createdAt: f._creationTime
    })) as Folder[], [foldersRaw]);

    const docs = useMemo(() => (docsRaw || []).map(d => ({
        id: d._id,
        folderId: d.folderId,
        title: d.title,
        content: d.content,
        isContext: d.isContext || false,
        createdAt: d._creationTime,
        // using creation time as update time for now since we don't track updates yet
        updatedAt: d._creationTime
    })) as Doc[], [docsRaw]);

    // Combine loading states
    const isLoading = isAuthLoading || foldersRaw === undefined || docsRaw === undefined;

    // --- Actions ---

    const createFolder = useCallback(async (name?: string) => {
        if (!isAuthenticated) return null;
        const id = await createFolderMutation({ name: name || 'New Folder' });
        return id;
    }, [createFolderMutation, isAuthenticated]);

    const renameFolder = useCallback((id: string, name: string) => {
        if (!isAuthenticated) return;
        renameFolderMutation({ id: id as Id<"folders">, name });
    }, [renameFolderMutation, isAuthenticated]);

    const deleteFolder = useCallback((id: string) => {
        if (!isAuthenticated) return;
        if (activeDocId) {
            // If active doc is in this folder, deselect it
            const doc = docs.find(d => d.id === activeDocId);
            if (doc && doc.folderId === id) {
                setActiveDocId(null);
            }
        }
        deleteFolderMutation({ id: id as Id<"folders"> });
    }, [deleteFolderMutation, activeDocId, docs, isAuthenticated]);

    const createDoc = useCallback(async (folderId?: string, title?: string, content?: any[]) => {
        if (!isAuthenticated) return null;
        const id = await createDocMutation({
            title: title || 'Untitled Doc',
            folderId,
            content
        });
        setActiveDocId(id);
        return id;
    }, [createDocMutation, isAuthenticated]);

    const renameDoc = useCallback((id: string, title: string) => {
        if (!isAuthenticated) return;
        updateDocMutation({ id: id as Id<"documents">, title });
    }, [updateDocMutation, isAuthenticated]);

    const updateDocContent = useCallback((id: string, content: any[]) => {
        if (!isAuthenticated) return;
        updateDocMutation({ id: id as Id<"documents">, content });
    }, [updateDocMutation, isAuthenticated]);

    const deleteDoc = useCallback((id: string) => {
        if (!isAuthenticated) return;
        if (activeDocId === id) setActiveDocId(null);
        deleteDocMutation({ id: id as Id<"documents"> });
    }, [deleteDocMutation, activeDocId, isAuthenticated]);


    // --- Getters ---

    const getDocsForFolder = useCallback(
        (folderId: string) => {
            return docs
                .filter((d) => d.folderId === folderId)
                .sort((a, b) => a.createdAt - b.createdAt);
        },
        [docs]
    );

    const getRootDocs = useCallback(() => {
        return docs
            .filter((d) => !d.folderId && !d.isContext)
            .sort((a, b) => a.createdAt - b.createdAt);
    }, [docs]);

    const getGlobalContextDoc = useCallback(() => {
        return docs.find((d) => d.isContext);
    }, [docs]);

    const getActiveDoc = useCallback(() => {
        return docs.find((d) => d.id === activeDocId);
    }, [docs, activeDocId]);

    const getDocById = useCallback(
        (id: string) => {
            return docs.find((d) => d.id === id);
        },
        [docs]
    );

    const getAllDocs = useCallback(() => {
        return docs;
    }, [docs]);

    const value: DocStoreContextValue = useMemo(() => ({
        folders,
        docs,
        activeDocId,
        createFolder,
        renameFolder,
        deleteFolder,
        createDoc,
        renameDoc,
        deleteDoc,
        setActiveDoc: setActiveDocId,
        updateDocContent,
        getDocsForFolder,
        getRootDocs,
        getGlobalContextDoc,
        getActiveDoc,
        getDocById,
        getAllDocs,
        isLoading,
    }), [
        folders,
        docs,
        activeDocId,
        createFolder,
        renameFolder,
        deleteFolder,
        createDoc,
        renameDoc,
        deleteDoc,
        updateDocContent,
        getDocsForFolder,
        getRootDocs,
        getGlobalContextDoc,
        getActiveDoc,
        getDocById,
        getAllDocs,
        isLoading
    ]);

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


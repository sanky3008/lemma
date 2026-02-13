export type Doc = {
    id: string;
    folderId?: string;
    title: string;
    content: any[]; // Plate.js node array
    isContext: boolean; // true = folder's context doc
    createdAt: number;
    updatedAt: number;
};

export type Folder = {
    id: string;
    name: string;
    createdAt: number;
};

export type AppState = {
    folders: Folder[];
    docs: Doc[];
    activeDocId: string | null;
};

'use client';

import { useState } from 'react';
import {
    BookOpen,
    ChevronRight,
    FileText,
    FolderIcon,
    Plus,
    Trash2,
    Pencil,
    FilePlus,
    FolderPlus,
} from 'lucide-react';

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarTrigger,
    SidebarResizeHandle,
    SidebarFooter,
} from '@/components/ui/sidebar';
import { useDocStore } from '@/lib/doc-store';
import { Input } from '@/components/ui/input';
import { UserButton, useUser } from '@clerk/nextjs';
import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../../convex/_generated/api';

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
    const { isAuthenticated } = useConvexAuth();
    const { user } = useUser();
    const storeUser = useMutation(api.users.store);

    useEffect(() => {
        if (isAuthenticated && user) {
            storeUser({});
        }
    }, [isAuthenticated, user, storeUser]);

    const {
        folders,
        activeDocId,
        createFolder,
        renameFolder,
        deleteFolder,
        createDoc,
        renameDoc,
        deleteDoc,
        setActiveDoc,
        getDocsForFolder,
        getGlobalContextDoc,
        getRootDocs,
    } = useDocStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [editingType, setEditingType] = useState<'doc' | 'folder'>('doc');

    const globalContextDoc = getGlobalContextDoc();
    const rootDocs = getRootDocs();

    const startEditing = (
        id: string,
        currentName: string,
        type: 'doc' | 'folder'
    ) => {
        setEditingId(id);
        setEditingValue(currentName);
        setEditingType(type);
    };

    const commitEdit = () => {
        if (!editingId || !editingValue.trim()) {
            setEditingId(null);
            return;
        }
        if (editingType === 'doc') {
            renameDoc(editingId, editingValue.trim());
        } else {
            renameFolder(editingId, editingValue.trim());
        }
        setEditingId(null);
    };

    return (
        <Sidebar {...props}>
            <SidebarHeader className="flex-row items-center justify-between pr-2">
                <SidebarMenu className="flex-1">
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg">
                            <img src="/lemma-logo.png" alt="Lemma" className="h-12" />
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
                <SidebarTrigger />
            </SidebarHeader>


            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Documents</SidebarGroupLabel>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarGroupAction title="Add New">
                                <Plus />
                            </SidebarGroupAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => createDoc()}>
                                <FilePlus className="mr-2 size-4" />
                                New Document
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => createFolder()}>
                                <FolderPlus className="mr-2 size-4" />
                                New Folder
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <SidebarGroupContent>
                        <SidebarMenu>
                            {/* Global Context Doc */}
                            {globalContextDoc && (
                                <SidebarMenuItem>
                                    <SidebarMenuButton
                                        isActive={globalContextDoc.id === activeDocId}
                                        onClick={() => setActiveDoc(globalContextDoc.id)}
                                    >
                                        <BookOpen className="size-4 shrink-0" />
                                        <span>{globalContextDoc.title}</span>
                                        <span className="ml-auto text-[10px] text-muted-foreground">
                                            CTX
                                        </span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            )}

                            {/* Folders */}
                            {folders.map((folder) => {
                                const docsInFolder = getDocsForFolder(folder.id);
                                return (
                                    <Collapsible key={folder.id} defaultOpen>
                                        <SidebarMenuItem>
                                            <ContextMenu>
                                                <ContextMenuTrigger asChild>
                                                    <CollapsibleTrigger asChild>
                                                        <SidebarMenuButton>
                                                            <ChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                                                            <FolderIcon className="size-4" />
                                                            {editingId === folder.id ? (
                                                                <Input
                                                                    className="h-5 text-sm"
                                                                    value={editingValue}
                                                                    onChange={(e) =>
                                                                        setEditingValue(e.target.value)
                                                                    }
                                                                    onBlur={commitEdit}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') commitEdit();
                                                                        if (e.key === 'Escape')
                                                                            setEditingId(null);
                                                                    }}
                                                                    autoFocus
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                <span>{folder.name}</span>
                                                            )}
                                                        </SidebarMenuButton>
                                                    </CollapsibleTrigger>
                                                </ContextMenuTrigger>
                                                <ContextMenuContent>
                                                    <ContextMenuItem
                                                        onClick={() =>
                                                            startEditing(
                                                                folder.id,
                                                                folder.name,
                                                                'folder'
                                                            )
                                                        }
                                                    >
                                                        <Pencil className="mr-2 size-4" />
                                                        Rename
                                                    </ContextMenuItem>
                                                    <ContextMenuSeparator />
                                                    <ContextMenuItem
                                                        onClick={() => deleteFolder(folder.id)}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="mr-2 size-4" />
                                                        Delete
                                                    </ContextMenuItem>
                                                </ContextMenuContent>
                                            </ContextMenu>

                                            <SidebarMenuAction
                                                showOnHover
                                                onClick={() => createDoc(folder.id)}
                                                title="New Doc"
                                            >
                                                <Plus />
                                            </SidebarMenuAction>

                                            <CollapsibleContent>
                                                <SidebarMenuSub>
                                                    {docsInFolder.map((doc) => (
                                                        <SidebarMenuSubItem key={doc.id}>
                                                            <ContextMenu>
                                                                <ContextMenuTrigger asChild>
                                                                    <SidebarMenuSubButton
                                                                        isActive={doc.id === activeDocId}
                                                                        onClick={() => setActiveDoc(doc.id)}
                                                                        onDoubleClick={() =>
                                                                            startEditing(
                                                                                doc.id,
                                                                                doc.title,
                                                                                'doc'
                                                                            )
                                                                        }
                                                                    >
                                                                        {editingId === doc.id ? (
                                                                            <Input
                                                                                className="h-5 text-sm"
                                                                                value={editingValue}
                                                                                onChange={(e) =>
                                                                                    setEditingValue(e.target.value)
                                                                                }
                                                                                onBlur={commitEdit}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter')
                                                                                        commitEdit();
                                                                                    if (e.key === 'Escape')
                                                                                        setEditingId(null);
                                                                                }}
                                                                                autoFocus
                                                                                onClick={(e) =>
                                                                                    e.stopPropagation()
                                                                                }
                                                                            />
                                                                        ) : (
                                                                            <>
                                                                                <FileText className="size-4 shrink-0" />
                                                                                <span>{doc.title}</span>
                                                                            </>
                                                                        )}
                                                                    </SidebarMenuSubButton>
                                                                </ContextMenuTrigger>
                                                                <ContextMenuContent>
                                                                    <ContextMenuItem
                                                                        onClick={() =>
                                                                            startEditing(
                                                                                doc.id,
                                                                                doc.title,
                                                                                'doc'
                                                                            )
                                                                        }
                                                                    >
                                                                        <Pencil className="mr-2 size-4" />
                                                                        Rename
                                                                    </ContextMenuItem>
                                                                    <ContextMenuSeparator />
                                                                    <ContextMenuItem
                                                                        onClick={() => deleteDoc(doc.id)}
                                                                        className="text-destructive"
                                                                    >
                                                                        <Trash2 className="mr-2 size-4" />
                                                                        Delete
                                                                    </ContextMenuItem>
                                                                </ContextMenuContent>
                                                            </ContextMenu>
                                                        </SidebarMenuSubItem>
                                                    ))}
                                                </SidebarMenuSub>
                                            </CollapsibleContent>
                                        </SidebarMenuItem>
                                    </Collapsible>
                                );
                            })}

                            {/* Root Docs (orphaned) */}
                            {rootDocs.map((doc) => (
                                <SidebarMenuItem key={doc.id}>
                                    <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                            <SidebarMenuButton
                                                isActive={doc.id === activeDocId}
                                                onClick={() => setActiveDoc(doc.id)}
                                                onDoubleClick={() =>
                                                    startEditing(doc.id, doc.title, 'doc')
                                                }
                                            >
                                                {editingId === doc.id ? (
                                                    <Input
                                                        className="h-5 text-sm"
                                                        value={editingValue}
                                                        onChange={(e) =>
                                                            setEditingValue(e.target.value)
                                                        }
                                                        onBlur={commitEdit}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') commitEdit();
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                        autoFocus
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                ) : (
                                                    <>
                                                        <FileText className="size-4 shrink-0" />
                                                        <span>{doc.title}</span>
                                                    </>
                                                )}
                                            </SidebarMenuButton>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent>
                                            <ContextMenuItem
                                                onClick={() =>
                                                    startEditing(doc.id, doc.title, 'doc')
                                                }
                                            >
                                                <Pencil className="mr-2 size-4" />
                                                Rename
                                            </ContextMenuItem>
                                            <ContextMenuSeparator />
                                            <ContextMenuItem
                                                onClick={() => deleteDoc(doc.id)}
                                                className="text-destructive"
                                            >
                                                <Trash2 className="mr-2 size-4" />
                                                Delete
                                            </ContextMenuItem>
                                        </ContextMenuContent>
                                    </ContextMenu>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <UserButton
                        showName
                        appearance={{
                            elements: {
                                userButtonBox: "flex-row-reverse",
                                userButtonOuterIdentifier: "text-sidebar-foreground font-medium",
                            },
                        }}
                    />
                </div>
            </SidebarFooter>
            <SidebarResizeHandle />
        </Sidebar>
    );
}

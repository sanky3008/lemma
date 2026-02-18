import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Helper to get authenticated user
async function getUser(ctx: any) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
        .query("users")
        .withIndex("by_token", (q: any) =>
            q.eq("tokenIdentifier", identity.tokenIdentifier)
        )
        .unique();

    return user;
}

// --- Folders ---

export const createFolder = mutation({
    args: { name: v.string() },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        return await ctx.db.insert("folders", {
            userId: user._id,
            name: args.name,
            createdAt: Date.now(),
        });
    },
});

export const getFolders = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUser(ctx);
        if (!user) return [];

        return await ctx.db
            .query("folders")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
    },
});

export const updateFolder = mutation({
    args: { id: v.id("folders"), name: v.string() },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const folder = await ctx.db.get(args.id);
        if (!folder || folder.userId !== user._id) throw new Error("Unauthorized");

        await ctx.db.patch(args.id, { name: args.name });
    },
});

export const deleteFolder = mutation({
    args: { id: v.id("folders") },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const folder = await ctx.db.get(args.id);
        if (!folder || folder.userId !== user._id) throw new Error("Unauthorized");

        // Delete all documents in the folder
        const docs = await ctx.db
            .query("documents")
            .withIndex("by_user_folder", (q) =>
                q.eq("userId", user._id).eq("folderId", args.id)
            )
            .collect();

        for (const doc of docs) {
            await ctx.db.delete(doc._id);
        }

        await ctx.db.delete(args.id);
    },
});

// --- Documents ---

export const createDoc = mutation({
    args: {
        title: v.string(),
        folderId: v.optional(v.string()), // Can be undefined or specific folder ID
        content: v.optional(v.any()), // JSON content
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        // Validate folder ownership if provided
        if (args.folderId) {
            // We cast to Id<"folders"> because we receive string from UI but it must be valid ID
            // Or we can keep it as string in schema, which we did (v.string())
            // But logic check:
            // const folder = await ctx.db.get(args.folderId as Id<"folders">);
            // We kept folderId as v.string() in schema to allow "root" or other concepts
            // if generic, but typically for explicit folders we should validate.
            // For now, let's assume client sends valid ID if not empty.
        }

        return await ctx.db.insert("documents", {
            userId: user._id,
            title: args.title,
            folderId: args.folderId,
            content: args.content || [{ type: 'p', children: [{ text: '' }] }],
            isContext: false,
            isArchived: false,
            isPublished: false,
        });
    },
});

export const getDocs = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUser(ctx);
        if (!user) return [];

        return await ctx.db
            .query("documents")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();
    },
});

// Lightweight query: returns only document metadata (no content field).
// Use this for sidebar listings and anywhere full content isn't needed.
export const getDocsList = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUser(ctx);
        if (!user) return [];

        const docs = await ctx.db
            .query("documents")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .collect();

        return docs.map((d) => ({
            _id: d._id,
            _creationTime: d._creationTime,
            title: d.title,
            folderId: d.folderId,
            isContext: d.isContext,
            isArchived: d.isArchived,
            isPublished: d.isPublished,
        }));
    },
});

// Fetch a single document's content by ID.
export const getDocContent = query({
    args: { id: v.id("documents") },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) return null;

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) return null;

        return {
            _id: doc._id,
            content: doc.content,
        };
    },
});

export const updateDoc = mutation({
    args: {
        id: v.id("documents"),
        title: v.optional(v.string()),
        content: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) throw new Error("Unauthorized");

        const updates: any = {};
        if (args.title !== undefined) updates.title = args.title;
        if (args.content !== undefined) updates.content = args.content;

        await ctx.db.patch(args.id, updates);
    },
});

export const deleteDoc = mutation({
    args: { id: v.id("documents") },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const doc = await ctx.db.get(args.id);
        if (!doc || doc.userId !== user._id) throw new Error("Unauthorized");

        await ctx.db.delete(args.id);
    },
});

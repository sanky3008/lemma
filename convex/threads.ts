import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

const messageSchema = v.object({
    id: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    documentId: v.optional(v.id("documents")),
    createdAt: v.number(),
    toolCalls: v.optional(v.array(v.object({
        id: v.string(),
        name: v.string(),
        args: v.any(),
        status: v.string(),
        result: v.optional(v.string()),
    }))),
    edits: v.optional(v.any()),
    question: v.optional(v.any()),
});

// List all threads for the current user (metadata only, no messages)
export const list = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUser(ctx);
        if (!user) return [];

        const threads = await ctx.db
            .query("threads")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .order("desc")
            .collect();

        return threads.map((t) => ({
            _id: t._id,
            title: t.title,
            createdAt: t.createdAt,
        }));
    },
});

// Get a single thread with all messages
export const get = query({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) return null;

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== user._id) return null;

        return thread;
    },
});

// Create a new thread
export const create = mutation({
    args: {
        clientId: v.string(), // Client-generated ID for optimistic correlation
        title: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const id = await ctx.db.insert("threads", {
            userId: user._id,
            title: args.title,
            messages: [],
            createdAt: Date.now(),
        });

        return id;
    },
});

// Update thread title
export const updateTitle = mutation({
    args: {
        threadId: v.id("threads"),
        title: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== user._id) throw new Error("Unauthorized");

        await ctx.db.patch(args.threadId, { title: args.title });
    },
});

// Save (replace) all messages for a thread
export const saveMessages = mutation({
    args: {
        threadId: v.id("threads"),
        messages: v.array(messageSchema),
    },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== user._id) throw new Error("Unauthorized");

        await ctx.db.patch(args.threadId, { messages: args.messages });
    },
});

// Delete a thread
export const remove = mutation({
    args: { threadId: v.id("threads") },
    handler: async (ctx, args) => {
        const user = await getUser(ctx);
        if (!user) throw new Error("Not authenticated");

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== user._id) throw new Error("Unauthorized");

        await ctx.db.delete(args.threadId);
    },
});

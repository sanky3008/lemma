import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getRun = query({
    args: { id: v.id("wingItRuns") },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated call to getRun");
        }
        return await ctx.db.get(args.id);
    },
});

export const createRun = mutation({
    args: {
        topic: v.string(),
        documentId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated call to createRun");
        }

        const now = Date.now();
        const runId = await ctx.db.insert("wingItRuns", {
            userId: identity.subject,
            documentId: args.documentId,
            topic: args.topic,
            status: 'questioning',
            createdAt: now,
            updatedAt: now,
        });

        return runId;
    },
});

export const updateStatus = mutation({
    args: {
        id: v.id("wingItRuns"),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated call to updateStatus");
        }

        await ctx.db.patch(args.id, {
            status: args.status,
            updatedAt: Date.now(),
        });
    },
});

export const updateQAs = mutation({
    args: {
        id: v.id("wingItRuns"),
        qas: v.array(v.object({
            question: v.string(),
            answer: v.string(),
        })),
        status: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated call to updateQAs");
        }

        const updates: any = {
            qas: args.qas,
            updatedAt: Date.now(),
        };

        if (args.status) {
            updates.status = args.status;
        }

        await ctx.db.patch(args.id, updates);
    },
});

export const updateResearch = mutation({
    args: {
        id: v.id("wingItRuns"),
        activity: v.array(v.object({
            id: v.string(),
            toolName: v.string(),
            args: v.string(),
            status: v.string(),
        })),
        scratchpad: v.string(),
        status: v.optional(v.string()), // usually 'preparing' or 'done'
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated call to updateResearch");
        }

        const updates: any = {
            activity: args.activity,
            scratchpad: args.scratchpad,
            updatedAt: Date.now(),
        };

        if (args.status) {
            updates.status = args.status;
        }

        await ctx.db.patch(args.id, updates);
    },
});

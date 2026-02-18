import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
    args: {
        id: v.string(),
        documentId: v.string(),
        discussionId: v.string(),
        content: v.any(),
        context: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unaunticated");
        }

        // Check if this is a reply to an existing discussion
        const existingComments = await ctx.db
            .query("comments")
            .withIndex("by_discussion", (q) => q.eq("discussionId", args.discussionId))
            .collect();

        // If it's a new discussion (no comments with this discussionId), create it
        // If it's a reply, just add it.
        // In both cases, we just insert the comment.
        // However, if the discussion was resolved, a new reply might un-resolve it?
        // For now, let's assume we just add the comment.
        // But if we want to inherit 'isResolved' state or reset it? 
        // Usually a new reply re-opens the thread.

        let isResolved = false;

        if (existingComments.length > 0) {
            // If adding to an existing thread, un-resolve the whole thread
            const resolvedComments = existingComments.filter(c => c.isResolved);
            if (resolvedComments.length > 0) {
                await Promise.all(resolvedComments.map(c => ctx.db.patch(c._id, { isResolved: false })));
            }
        }

        await ctx.db.insert("comments", {
            id: args.id,
            userId: identity.tokenIdentifier, // Using token identifier from Clerk
            documentId: args.documentId,
            discussionId: args.discussionId,
            content: args.content,
            isResolved: isResolved,
            createdAt: Date.now(),
            context: args.context,
        });
    },
});

export const resolve = mutation({
    args: {
        discussionId: v.string(),
    },
    handler: async (ctx, args) => {
        const comments = await ctx.db
            .query("comments")
            .withIndex("by_discussion", (q) => q.eq("discussionId", args.discussionId))
            .collect();

        await Promise.all(
            comments.map((comment) => ctx.db.patch(comment._id, { isResolved: true }))
        );
    },
});

export const resolveByCommentId = mutation({
    args: {
        commentId: v.string(), // Plate ID
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated");
        }

        // Find the comment to get the discussionId
        const comment = await ctx.db
            .query("comments")
            .withIndex("by_plate_id", (q) => q.eq("id", args.commentId))
            .unique();

        if (!comment) {
            throw new Error("Comment not found");
        }

        // Resolve all comments in this discussion
        const comments = await ctx.db
            .query("comments")
            .withIndex("by_discussion", (q) => q.eq("discussionId", comment.discussionId))
            .collect();

        await Promise.all(
            comments.map((c) => ctx.db.patch(c._id, { isResolved: true }))
        );
    }
});

export const remove = mutation({
    args: {
        id: v.string(), // The Plate comment ID
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthenticated");
        }

        const comment = await ctx.db
            .query("comments")
            .withIndex("by_plate_id", (q) => q.eq("id", args.id))
            .unique();

        if (comment) {
            if (comment.userId !== identity.tokenIdentifier) {
                // throw new Error("Unauthorized");
            }
            await ctx.db.delete(comment._id);
        }
    }
});

export const list = query({
    args: {
        documentId: v.string(),
    },
    handler: async (ctx, args) => {
        const comments = await ctx.db
            .query("comments")
            .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
            .collect();

        // We need to group these into discussions for the frontend?
        // Or return flat list and let frontend group?
        // TDiscussion structure:
        // { id: string, comments: TComment[], ... }

        // Let's return the raw comments and let the frontend hydrate the TDiscussion objects.
        // However, we need to map the user info (name, avatar) to the comments.

        // Fetch users (or use a helper)
        const userIds = [...new Set(comments.map((c) => c.userId))];
        const users = await Promise.all(
            userIds.map(async (uid) => {
                const user = await ctx.db
                    .query("users")
                    .withIndex("by_token", (q) => q.eq("tokenIdentifier", uid))
                    .unique();
                return { uid, user };
            })
        );

        const userMap = new Map(users.map((u) => [u.uid, u.user]));

        return comments.map((c) => ({
            ...c,
            userInfo: userMap.get(c.userId) || { name: "Unknown", image: "" }
        }));
    },
});

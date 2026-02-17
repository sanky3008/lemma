import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    // Users: Synced from Clerk
    users: defineTable({
        tokenIdentifier: v.string(), // Clerk ID
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        image: v.optional(v.string()),
    }).index("by_token", ["tokenIdentifier"]),

    // Documents: Matches generic Doc type
    documents: defineTable({
        userId: v.string(), // Creator
        title: v.string(),
        content: v.any(), // JSON content from Plate (Stored as JSON object/array)
        folderId: v.optional(v.string()), // Organize in folders
        isContext: v.optional(v.boolean()), // Agent Context Flag
        isArchived: v.optional(v.boolean()),
        isPublished: v.optional(v.boolean()),
    })
        .index("by_user", ["userId"])
        .index("by_user_folder", ["userId", "folderId"]),

    folders: defineTable({
        userId: v.string(),
        name: v.string(),
        createdAt: v.number(),
    }).index("by_user", ["userId"]),

    // AI Threads: Stores conversation + messages together
    threads: defineTable({
        userId: v.string(),
        title: v.optional(v.string()),
        messages: v.array(v.object({
            id: v.string(), // Client-side ID for UI
            role: v.union(v.literal("user"), v.literal("assistant")),
            content: v.string(),
            documentId: v.optional(v.id("documents")), // Context PER MESSAGE
            createdAt: v.number(),
            // Tool Calls (Optional)
            toolCalls: v.optional(v.array(v.object({
                id: v.string(),
                name: v.string(),
                args: v.any(), // JSON arguments
                status: v.string(), // 'pending' | 'done' | 'error'
                result: v.optional(v.string())
            }))),
            // Custom App Fields (Edits, Questions)
            edits: v.optional(v.any()),
            question: v.optional(v.any())

        })),
        createdAt: v.number(), // Timestamp
    }).index("by_user", ["userId"]),
});

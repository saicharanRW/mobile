import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    sessions: defineTable({
        sessionId: v.string(),
        createdAt: v.number(),
    }).index("by_sessionId", ["sessionId"]),

    images: defineTable({
        sessionId: v.string(),
        filename: v.string(),
        storageId: v.id("_storage"),
        contentType: v.string(),
        createdAt: v.number(),
    }).index("by_sessionId", ["sessionId"]),
});

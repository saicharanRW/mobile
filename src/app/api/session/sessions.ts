import { randomBytes } from 'crypto';

// In-memory session storage (in production, use Redis or database)
export const sessions = new Map<string, {
    id: string;
    createdAt: number;
    images: Array<{
        filename: string;
        data: Buffer;
        contentType: string;
    }>;
}>();

// Clean up sessions older than 1 hour
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    for (const [id, session] of sessions.entries()) {
        if (now - session.createdAt > oneHour) {
            sessions.delete(id);
        }
    }
}, 5 * 60 * 1000); // Run every 5 minutes

// Helper function to create session ID
export function createSessionId(): string {
    return randomBytes(16).toString('hex');
}

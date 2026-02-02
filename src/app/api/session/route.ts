import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { randomBytes } from 'crypto';

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST() {
    // Create new session
    const sessionId = randomBytes(16).toString('hex');

    await client.mutation(api.sessions.createSession, {
        sessionId,
    });

    return NextResponse.json({
        sessionId,
        deepLink: `expiryapp://camera?session=${sessionId}`
    });
}

export async function GET(request: NextRequest) {
    const sessionId = request.nextUrl.searchParams.get('id');

    if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const session = await client.query(api.sessions.getSession, {
        sessionId,
    });

    if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const images = await client.query(api.sessions.getSessionImages, {
        sessionId,
    });

    return NextResponse.json({
        sessionId: session.sessionId,
        imageCount: images.length,
        createdAt: session.createdAt,
    });
}

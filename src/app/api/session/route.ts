import { NextRequest, NextResponse } from 'next/server';
import { sessions, createSessionId } from './sessions';

export async function POST() {
    // Create new session
    const sessionId = createSessionId();

    sessions.set(sessionId, {
        id: sessionId,
        createdAt: Date.now(),
        images: [],
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

    const session = sessions.get(sessionId);

    if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
        sessionId: session.id,
        imageCount: session.images.length,
        createdAt: session.createdAt,
    });
}

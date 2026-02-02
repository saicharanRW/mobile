import { NextRequest, NextResponse } from 'next/server';
import { sessions } from '../sessions';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    const session = sessions.get(sessionId);

    if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Convert images to base64 for JSON response
    const images = session.images.map(img => ({
        filename: img.filename,
        contentType: img.contentType,
        data: img.data.toString('base64'),
    }));

    return NextResponse.json({
        sessionId: session.id,
        imageCount: session.images.length,
        images,
    });
}


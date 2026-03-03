// GET /api/games/[gameId]/sessions/[sessionId]/events — SSE stream for real-time game updates
// Clients poll this endpoint; it streams events as they happen

import { NextRequest } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

// In-memory event bus for game sessions
type GameEvent = {
  type: string;
  data: unknown;
  timestamp: number;
};

const sessionEvents = new Map<string, GameEvent[]>();
const sessionListeners = new Map<string, Set<(event: GameEvent) => void>>();

export function emitGameEvent(sessionId: string, type: string, data: unknown) {
  const event: GameEvent = { type, data, timestamp: Date.now() };

  // Store event
  const events = sessionEvents.get(sessionId) || [];
  events.push(event);
  // Keep only last 100 events
  if (events.length > 100) events.shift();
  sessionEvents.set(sessionId, events);

  // Notify listeners
  const listeners = sessionListeners.get(sessionId);
  if (listeners) {
    for (const listener of listeners) {
      listener(event);
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { sessionId } = await params;

  // Verify session exists
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`));

      const listener = (event: GameEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      // Register listener
      if (!sessionListeners.has(sessionId)) {
        sessionListeners.set(sessionId, new Set());
      }
      sessionListeners.get(sessionId)!.add(listener);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        sessionListeners.get(sessionId)?.delete(listener);
        if (sessionListeners.get(sessionId)?.size === 0) {
          sessionListeners.delete(sessionId);
        }
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

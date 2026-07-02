// GET /api/games/[gameId]/sessions/[sessionId]/events — SSE stream for real-time game updates
//
// - Sends `id:` lines (per-session seq) so EventSource reconnects replay
//   missed events via Last-Event-ID.
// - Emits a `: ping` comment every 15s so reverse proxies don't reap the stream.

import { NextRequest } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import {
  subscribeToSession,
  eventsSince,
  recoverSession,
  type GameEvent,
} from "../../../../../../lib/game-engine";

export const dynamic = "force-dynamic";

const PING_INTERVAL_MS = 15_000;

function frame(event: GameEvent): string {
  return `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  // Re-arm timers if a timed phase is pending with no in-process timer
  await recoverSession(sessionId);

  const lastEventId = Number(request.headers.get("last-event-id") || 0) || 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      send(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);

      // Replay events missed during a reconnect
      for (const event of eventsSince(sessionId, lastEventId)) {
        send(frame(event));
      }

      const unsubscribe = subscribeToSession(sessionId, (event) => send(frame(event)));
      const ping = setInterval(() => send(`: ping\n\n`), PING_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

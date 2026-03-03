// GET /api/games — list games (optional ?createdBy=pubkey)
// POST /api/games — create a game with questions

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getPubkeyFromRequest } from "../../lib/auth";
import { verifyAccess } from "../../lib/membership";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const createdBy = searchParams.get("createdBy");

  const games = await prisma.game.findMany({
    where: createdBy ? { createdBy } : undefined,
    include: {
      questions: { orderBy: { order: "asc" }, select: { id: true, text: true, order: true } },
      sessions: { select: { id: true, status: true } },
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(games);
}

export async function POST(request: NextRequest) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify team membership
  const hasAccess = await verifyAccess(pubkey);
  if (!hasAccess) {
    return NextResponse.json({ error: "You must be a team member to create games" }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, timePerQuestion, questions } = body;

  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json(
      { error: "Title and at least one question required" },
      { status: 400 }
    );
  }

  // Validate questions
  for (const q of questions) {
    if (!q.text || !q.options || !Array.isArray(q.options) || q.options.length < 2) {
      return NextResponse.json(
        { error: "Each question needs text and at least 2 options" },
        { status: 400 }
      );
    }
    if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      return NextResponse.json(
        { error: "Each question needs a valid correctIndex" },
        { status: 400 }
      );
    }
  }

  const game = await prisma.game.create({
    data: {
      title,
      description: description || "",
      createdBy: pubkey,
      timePerQuestion: timePerQuestion || 20,
      questions: {
        create: questions.map((q: { text: string; options: string[]; correctIndex: number }, i: number) => ({
          text: q.text,
          options: JSON.stringify(q.options),
          correctIndex: q.correctIndex,
          order: i,
        })),
      },
    },
    include: {
      questions: { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json(game, { status: 201 });
}

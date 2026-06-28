import { NextResponse } from "next/server";
import { getVapidPublicKey } from "../../../lib/web-push";

// GET /api/push/vapid-public-key
// Returns the server's VAPID public key so the client can create a push
// subscription. The public key is, by definition, public — no auth required.
// `publicKey` is null when push isn't configured on this deployment.
export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

import { NextRequest, NextResponse } from "next/server";
import { handleTelegramCoderCommand } from "@/lib/agents/telegramCoderHandler";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const msg = body?.message || body?.edited_message;
    if (msg?.text && msg?.chat?.id) {
      const handled = await handleTelegramCoderCommand(msg.chat.id, msg.text);
      if (handled) return NextResponse.json({ ok: true, handledBy: "cloud-coder" });
    }
    return NextResponse.json({ ok: true, ignored: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
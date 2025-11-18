// api/webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Batasi hanya POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Body dari webhook (JSON, form, dll tergantung service-nya)
  const payload = req.body;

  console.log("Webhook received:", payload);

  // Di sini kamu bisa:
  // - verifikasi signature
  // - simpan ke DB (Supabase, dll)
  // - trigger proses lain

  res.status(200).json({ success: true });
}

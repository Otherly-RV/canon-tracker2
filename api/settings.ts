import { neon } from "@neondatabase/serverless";

let ensured = false;

async function ensureTable(sql) {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS otherly_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  ensured = true;
}

export default async function handler(req, res) {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    res.status(500).json({ error: "Missing env var: DATABASE_URL" });
    return;
  }

  const sql = neon(DATABASE_URL);
  await ensureTable(sql);

  // GET /api/settings?key=OTHERLY_RULES
  if (req.method === "GET") {
    const key = (req.query?.key || "OTHERLY_RULES").toString();
    const rows = await sql`SELECT value, updated_at FROM otherly_settings WHERE key = ${key};`;
    const row = rows?.[0];

    res.status(200).json({
      key,
      value: row?.value ?? null,
      updatedAt: row?.updated_at ?? null,
    });
    return;
  }

  // POST /api/settings  { key, value }
  if (req.method === "POST") {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body ?? {});

    const key = (body.key || "OTHERLY_RULES").toString();
    const value = body.value ?? body; // allow posting raw settings too

    await sql`
      INSERT INTO otherly_settings (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `;

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "GET or POST only" });
}

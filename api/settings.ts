import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

type SettingsRow = {
  project_id: string;
  canon_text: string;
  exec_contract_text: string;
  field_rules: any;
  pdf_extraction_rules: string;
  image_prompt_rules: string;
  updated_at: string;
};

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL (Neon connection string).");
  return neon(url);
}

async function ensureTable(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS otherly_settings (
      project_id TEXT PRIMARY KEY,
      canon_text TEXT NOT NULL DEFAULT '',
      exec_contract_text TEXT NOT NULL DEFAULT '',
      field_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
      pdf_extraction_rules TEXT NOT NULL DEFAULT '',
      image_prompt_rules TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const projectId = String((req.query.projectId as string) || "default");
  const sql = db();

  try {
    await ensureTable(sql);

    if (req.method === "GET") {
      const rows = await sql<SettingsRow[]>`
        SELECT project_id, canon_text, exec_contract_text, field_rules, pdf_extraction_rules, image_prompt_rules, updated_at
        FROM otherly_settings
        WHERE project_id = ${projectId}
        LIMIT 1;
      `;

      if (!rows[0]) {
        const inserted = await sql<SettingsRow[]>`
          INSERT INTO otherly_settings (project_id)
          VALUES (${projectId})
          RETURNING project_id, canon_text, exec_contract_text, field_rules, pdf_extraction_rules, image_prompt_rules, updated_at;
        `;
        return res.status(200).json(inserted[0]);
      }

      return res.status(200).json(rows[0]);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      const canonText = String(body?.canonText ?? "");
      const execContractText = String(body?.execContractText ?? "");
      const fieldRules = body?.fieldRules ?? {};
      const pdfExtractionRules = String(body?.pdfExtractionRules ?? "");
      const imagePromptRules = String(body?.imagePromptRules ?? "");

      const rows = await sql<SettingsRow[]>`
        INSERT INTO otherly_settings (
          project_id, canon_text, exec_contract_text, field_rules, pdf_extraction_rules, image_prompt_rules, updated_at
        )
        VALUES (
          ${projectId},
          ${canonText},
          ${execContractText},
          ${JSON.stringify(fieldRules)},
          ${pdfExtractionRules},
          ${imagePromptRules},
          NOW()
        )
        ON CONFLICT (project_id) DO UPDATE SET
          canon_text = EXCLUDED.canon_text,
          exec_contract_text = EXCLUDED.exec_contract_text,
          field_rules = EXCLUDED.field_rules,
          pdf_extraction_rules = EXCLUDED.pdf_extraction_rules,
          image_prompt_rules = EXCLUDED.image_prompt_rules,
          updated_at = NOW()
        RETURNING project_id, canon_text, exec_contract_text, field_rules, pdf_extraction_rules, image_prompt_rules, updated_at;
      `;

      return res.status(200).json(rows[0]);
    }

    return res.status(405).json({ error: "Use GET or POST" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "DB error" });
  }
}

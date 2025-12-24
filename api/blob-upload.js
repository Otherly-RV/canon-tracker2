import { handleUpload } from "@vercel/blob/client";

/**
 * Vercel Node Function (NOT Edge).
 * This implements the "client upload route" for @vercel/blob/client upload().
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body ?? {});

  // Build a real Fetch Request object for handleUpload()
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) headers.set(k, v.join(","));
    else if (typeof v === "string") headers.set(k, v);
  }

  const request = new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  try {
    const jsonResponse = await handleUpload({
      request,
      body,

      onBeforeGenerateToken: async () => {
        return {
          // allow pdf + images (you can tighten later)
          allowedContentTypes: [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
          ],
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024, // 5GB
          addRandomSuffix: true,
        };
      },

      // Optional: called by Vercel when upload completes
      onUploadCompleted: async () => {
        // You can write to Neon here later if needed
      },
    });

    res.status(200).json(jsonResponse);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}

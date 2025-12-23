export async function loadSettings(projectId = "default") {
  const r = await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`);
  if (!r.ok) throw new Error(`Failed to load settings (${r.status})`);
  return r.json();
}

export async function saveSettings(projectId: string, payload: any) {
  const r = await fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Failed to save settings (${r.status})`);
  return r.json();
}

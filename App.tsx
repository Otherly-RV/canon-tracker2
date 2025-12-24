import React from "react"
import { CanonEditor } from "./CanonEditor"
import { IngestionPanel } from "./IngestionPanel"

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>IP-Brain – Canon & Rules Lab</h1>

      <IngestionPanel />
      <CanonEditor />
    </div>
  )
}

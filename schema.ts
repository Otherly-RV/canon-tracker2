export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "list"
  | "object"
  | "image"
  | "reference"

export interface CanonField {
  key: string
  label: string
  type: FieldType
  required: boolean
  description?: string
}

export interface CanonSection {
  id: string
  label: string
  fields: CanonField[]
}

export const IP_CANON_SCHEMA: CanonSection[] = [
  {
    id: "overview",
    label: "Overview",
    fields: [
      { key: "title", label: "Title", type: "string", required: true },
      { key: "logline", label: "Logline", type: "string", required: true },
      { key: "tone", label: "Tone", type: "string", required: false }
    ]
  },
  {
    id: "characters",
    label: "Characters",
    fields: [
      { key: "name", label: "Name", type: "string", required: true },
      { key: "role", label: "Narrative Role", type: "enum", required: true },
      { key: "drive", label: "Drive", type: "string", required: true },
      { key: "visual", label: "Visual Description", type: "string", required: false },
      { key: "image", label: "Reference Image", type: "image", required: false }
    ]
  }
]

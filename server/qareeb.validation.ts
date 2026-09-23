export const MAX_MESSAGE_LENGTH = 1600;
export const MAX_FILE_BYTES = 1_150_000;

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export function normalizeRoomId(value: unknown): string {
  const id = cleanText(value, 16).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return id.length >= 4 ? id : "";
}

export function safeColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : "#1B76F2";
}

export function safeFileName(value: unknown): string {
  const cleaned = cleanText(value, 120).replace(/[^A-Za-z0-9._-]/g, "-");
  return cleaned || "file";
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: Buffer } | null {
  const match = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1];
  const data = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  return data.length > 0 && data.length <= MAX_FILE_BYTES ? { mimeType, data } : null;
}

import { describe, expect, it } from "vitest";
import { normalizeRoomId, parseDataUrl, safeColor, safeFileName } from "./qareeb.validation";

describe("Qareeb validation", () => {
  it("normalizes a valid room code and rejects short or unsafe codes", () => {
    expect(normalizeRoomId(" ab-12 ")).toBe("AB-12");
    expect(normalizeRoomId("<ab12>" )).toBe("AB12");
    expect(normalizeRoomId("a!")).toBe("");
  });

  it("only accepts six-digit hexadecimal participant colors", () => {
    expect(safeColor("#0CA887")).toBe("#0CA887");
    expect(safeColor("blue")).toBe("#1B76F2");
  });

  it("keeps a safe file name and decodes a supported base64 attachment", () => {
    expect(safeFileName(" report final!.png ")).toBe("report-final-.png");
    const attachment = parseDataUrl("data:text/plain;base64,SGVsbG8=");
    expect(attachment?.mimeType).toBe("text/plain");
    expect(attachment?.data.toString()).toBe("Hello");
    expect(parseDataUrl("https://example.com/file.txt")).toBeNull();
  });
});

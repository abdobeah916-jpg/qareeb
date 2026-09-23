import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const inserted: unknown[] = [];
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((value: unknown) => {
        inserted.push(value);
        return { onDuplicateKeyUpdate: vi.fn(async () => undefined) };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => [{ count: 4 }]) })),
      })),
    })),
  };
  return { db, inserted };
});

vi.mock("./mysqlDb", () => ({ getDb: vi.fn(async () => mocks.db) }));
vi.mock("./localDb", () => ({}));

import { consumeRateLimit, rejectRecentDuplicateMessage } from "./advancedDb";

describe("abuse event logging", () => {
  beforeEach(() => { mocks.inserted.length = 0; });

  it("records a durable event before rejecting an over-limit action", async () => {
    await expect(consumeRateLimit({ subjectKey: "actor-1:room:AB-12", action: "message", limit: 3, windowMs: 60_000 })).rejects.toThrow("حد الاستخدام");
    expect(mocks.inserted).toHaveLength(2);
    expect(mocks.inserted[1]).toEqual(expect.objectContaining({ actorId: "actor-1", action: "rate_limit_message", subjectKey: "actor-1:room:AB-12" }));
  });

  it("records a spam-specific event for a repeated message in a room", async () => {
    let selectCount = 0;
    mocks.db.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectCount++ === 0 ? [{ id: "participant-1" }] : [{ id: "existing-message", text: "same message repeated" }]),
        })),
      })),
    }));
    await expect(rejectRecentDuplicateMessage({ scopeType: "room", scopeId: "AB-12", actorId: "actor-1", text: "same message repeated" })).rejects.toThrow("الرسالة المكررة");
    expect(mocks.inserted[0]).toEqual(expect.objectContaining({ actorId: "actor-1", action: "spam_duplicate_message", subjectKey: "room:AB-12" }));
  });
});

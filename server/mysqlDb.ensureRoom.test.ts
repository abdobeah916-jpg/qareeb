import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const duplicateUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onDuplicateKeyUpdate: duplicateUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  return { duplicateUpdate, values, insert, drizzle: vi.fn(() => ({ insert })) };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));

import { ensureRoom } from "./mysqlDb";

describe("mysql ensureRoom", () => {
  beforeEach(() => {
    mocks.drizzle.mockClear();
    mocks.insert.mockClear();
    mocks.values.mockClear();
    mocks.duplicateUpdate.mockClear();
    process.env.DATABASE_URL = "mysql://qareeb.test";
  });

  it("upserts a room with explicit defaults for schema compatibility", async () => {
    await ensureRoom("AB-12");

    expect(mocks.values).toHaveBeenCalledWith({
      id: "AB-12",
      name: "غرفة قريب",
      ownerId: null,
      pinnedMessageId: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(mocks.duplicateUpdate).toHaveBeenCalledWith({ set: { updatedAt: expect.any(Date) } });
  });
});

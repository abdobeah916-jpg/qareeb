import mysql from "mysql2/promise";

const expected = {
  users: { columns: { id: "required", openId: "required", name: "nullable", username: "nullable", avatarUrl: "nullable", bio: "nullable", availability: "available", language: "ar", privacyMode: "everyone", email: "nullable", loginMethod: "nullable", role: "user", createdAt: "now", updatedAt: "now", lastSignedIn: "now" }, primary: ["id"], unique: ["openId", "username"] },
  chatRooms: { columns: { id: "required", name: "غرفة قريب", ownerId: "nullable", pinnedMessageId: "nullable", createdAt: "now", updatedAt: "now" }, primary: ["id"] },
  deviceProfiles: { columns: { deviceId: "required", avatarUrl: "nullable", updatedAt: "now" }, primary: ["deviceId"] },
  chatParticipants: { columns: { id: "required", roomId: "required", deviceId: "required", name: "required", color: "required", lastSeen: "now" }, primary: ["id"] },
  roomMemberBans: { columns: { id: "required", roomId: "required", deviceId: "required", bannedBy: "required", createdAt: "now" }, primary: ["id"] },
  roomModerators: { columns: { id: "required", roomId: "required", deviceId: "required", canPin: "0", canRename: "0", canManageMembers: "0", canClearMessages: "0", canViewActivity: "1", assignedBy: "required", createdAt: "now", updatedAt: "now" }, primary: ["id"] },
  roomAdminActivity: { columns: { id: "required", roomId: "required", actorDeviceId: "required", actorName: "required", action: "required", targetDeviceId: "nullable", targetName: "nullable", details: "nullable", createdAt: "now" }, primary: ["id"] },
  roomModeratorInvitations: { columns: { id: "required", roomId: "required", targetDeviceId: "required", targetName: "required", targetColor: "required", invitedBy: "required", invitedByName: "required", canPin: "0", canRename: "0", canManageMembers: "0", canClearMessages: "0", canViewActivity: "1", status: "pending", createdAt: "now", decidedAt: "nullable", decidedBy: "nullable" }, primary: ["id"] },
  roomNotifications: { columns: { id: "required", roomId: "required", targetDeviceId: "required", activityId: "required", kind: "required", title: "required", body: "required", createdAt: "now", readAt: "nullable" }, primary: ["id"] },
  chatMessages: { columns: { id: "required", roomId: "required", senderId: "required", senderName: "required", senderColor: "required", text: "required", replyToId: "nullable", reactions: "nullable", editedAt: "nullable", deletedAt: "nullable", attachmentName: "nullable", attachmentType: "nullable", attachmentUrl: "nullable", pinnedAt: "nullable", pinnedBy: "nullable", createdAt: "now" }, primary: ["id"] },
  directConversations: { columns: { id: "required", participantOne: "required", participantOneName: "required", participantOneColor: "required", participantTwo: "required", participantTwoName: "required", participantTwoColor: "required", createdAt: "now", updatedAt: "now" }, primary: ["id"] },
  directMessages: { columns: { id: "required", conversationId: "required", senderId: "required", senderName: "required", senderColor: "required", text: "required", replyToId: "nullable", reactions: "nullable", attachmentName: "nullable", attachmentType: "nullable", attachmentUrl: "nullable", createdAt: "now" }, primary: ["id"] },
  directConversationPreferences: { columns: { id: "required", conversationId: "required", deviceId: "required", peerId: "required", isMuted: "0", isBlocked: "0", updatedAt: "now" }, primary: ["id"] },
  directReadStates: { columns: { id: "required", conversationId: "required", deviceId: "required", lastReadAt: "now", updatedAt: "now" }, primary: ["id"] },
  directCallLogs: { columns: { id: "required", conversationId: "required", callerId: "required", recipientId: "required", callType: "required", status: "ringing", startedAt: "now", answeredAt: "nullable", endedAt: "nullable" }, primary: ["id"] },
};

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await connection.query("SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?) ORDER BY TABLE_NAME, ORDINAL_POSITION", [Object.keys(expected)]);
const grouped = Object.groupBy(rows, row => row.TABLE_NAME);
const problems = [];
for (const [table, spec] of Object.entries(expected)) {
  const actualRows = grouped[table] ?? [];
  const actual = Object.fromEntries(actualRows.map(row => [row.COLUMN_NAME, row]));
  for (const [column, expectedValue] of Object.entries(spec.columns)) {
    const row = actual[column];
    if (!row) { problems.push(`${table}.${column}: missing`); continue; }
    const nullable = row.IS_NULLABLE === "YES";
    const shouldNullable = expectedValue === "nullable";
    if (nullable !== shouldNullable) problems.push(`${table}.${column}: nullability mismatch`);
    if (expectedValue === "now" && !String(row.COLUMN_DEFAULT ?? "").toUpperCase().includes("CURRENT_TIMESTAMP")) problems.push(`${table}.${column}: current timestamp default mismatch`);
    if (expectedValue !== "nullable" && expectedValue !== "required" && expectedValue !== "now") {
      const actualDefault = String(row.COLUMN_DEFAULT);
      if (actualDefault !== expectedValue && !(expectedValue === "0" && actualDefault === "0") && !(expectedValue === "1" && actualDefault === "1")) problems.push(`${table}.${column}: default ${actualDefault} != ${expectedValue}`);
    }
  }
  for (const column of Object.keys(actual)) if (!spec.columns[column]) problems.push(`${table}.${column}: unexpected`);
  const primary = actualRows.filter(row => row.COLUMN_KEY === "PRI").map(row => row.COLUMN_NAME);
  if (JSON.stringify(primary) !== JSON.stringify(spec.primary)) problems.push(`${table}: primary key mismatch`);
}
const [indexes] = await connection.query("SELECT INDEX_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'");
for (const name of ["users_openId_unique", "users_username_unique"]) if (!indexes.some(row => row.INDEX_NAME === name)) problems.push(`users.${name}: unique index missing`);
await connection.end();
console.log(JSON.stringify({ ok: problems.length === 0, checkedTables: Object.keys(expected).length, checkedColumns: Object.values(expected).reduce((sum, table) => sum + Object.keys(table.columns).length, 0), problems }, null, 2));
if (problems.length) process.exitCode = 1;

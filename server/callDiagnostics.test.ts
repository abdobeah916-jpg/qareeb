import { describe, expect, it, vi } from "vitest";
import { collectCallDiagnostics } from "../client/src/lib/callDiagnostics";

describe("call diagnostics", () => {
  it("reports ready audio/video devices and network metrics", async () => {
    const stop = vi.fn();
    const navigatorLike = {
      onLine: true,
      permissions: { query: vi.fn(async () => ({ state: "granted" as const })) },
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getAudioTracks: () => [{}], getVideoTracks: () => [{}], getTracks: () => [{ stop }, { stop }] })) },
      connection: { effectiveType: "4g", rtt: 48, downlink: 12.5 },
    };
    const result = await collectCallDiagnostics(navigatorLike);
    expect(result).toMatchObject({ online: true, mediaSupported: true, audio: "granted", video: "granted", audioReady: true, videoReady: true, effectiveType: "4g", rtt: 48, downlink: 12.5 });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(navigatorLike.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
  });

  it("does not request media while offline", async () => {
    const getUserMedia = vi.fn();
    const result = await collectCallDiagnostics({ onLine: false, mediaDevices: { getUserMedia }, connection: {} });
    expect(result).toMatchObject({ online: false, mediaSupported: true, audioReady: false, videoReady: false });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

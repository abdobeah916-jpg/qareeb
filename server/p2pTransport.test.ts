import { describe, expect, it } from "vitest";
import { inspectSignalCandidates, isLocalOnlyP2PSignal } from "../client/src/lib/p2pTransport";

function signal(sdp: string) {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ type: "offer", sdp }))));
}

describe("local P2P signal contracts", () => {
  it("counts host and server-reflexive candidates without requiring a relay", () => {
    const encoded = signal("v=0\na=candidate:1 1 udp 1 192.168.1.2 5000 typ host\na=candidate:2 1 udp 1 203.0.113.4 5001 typ srflx");
    expect(inspectSignalCandidates(encoded)).toEqual({ host: 1, srflx: 1, relay: 0 });
    expect(isLocalOnlyP2PSignal(encoded)).toBe(true);
  });

  it("rejects relay candidates from the local-only mode", () => {
    const encoded = signal("v=0\na=candidate:3 1 udp 1 198.51.100.4 5002 typ relay");
    expect(inspectSignalCandidates(encoded)).toEqual({ host: 0, srflx: 0, relay: 1 });
    expect(isLocalOnlyP2PSignal(encoded)).toBe(false);
  });

  it("rejects malformed or empty signal text", () => {
    expect(isLocalOnlyP2PSignal("not-a-signal")).toBe(false);
    expect(inspectSignalCandidates("not-a-signal")).toEqual({ host: 0, srflx: 0, relay: 0 });
  });
});

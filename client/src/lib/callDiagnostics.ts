export type PermissionStatusValue = "granted" | "denied" | "prompt" | "unknown";

export type CallDiagnostics = {
  online: boolean;
  mediaSupported: boolean;
  audio: PermissionStatusValue;
  video: PermissionStatusValue;
  audioReady: boolean;
  videoReady: boolean;
  effectiveType: string;
  rtt: number | null;
  downlink: number | null;
  checkedAt: number;
};

type MediaStreamLike = { getAudioTracks: () => unknown[]; getVideoTracks: () => unknown[]; getTracks: () => Array<{ stop: () => void }> };
type BrowserNavigatorLike = {
  onLine?: boolean;
  mediaDevices?: { getUserMedia?: (constraints: { audio: boolean; video: boolean }) => Promise<MediaStreamLike> };
  permissions?: { query?: (descriptor: PermissionDescriptor) => Promise<{ state: PermissionStatusValue }> };
  connection?: { effectiveType?: string; rtt?: number; downlink?: number };
};

export async function collectCallDiagnostics(browserNavigator: BrowserNavigatorLike): Promise<CallDiagnostics> {
  const readPermission = async (name: "microphone" | "camera"): Promise<PermissionStatusValue> => {
    if (!browserNavigator.permissions?.query) return "unknown";
    try {
      return (await browserNavigator.permissions.query({ name } as PermissionDescriptor)).state;
    } catch {
      return "unknown";
    }
  };

  const online = browserNavigator.onLine !== false;
  const mediaSupported = Boolean(browserNavigator.mediaDevices?.getUserMedia);
  const [audio, video] = await Promise.all([readPermission("microphone"), readPermission("camera")]);
  let audioReady = false;
  let videoReady = false;
  if (online && mediaSupported) {
    try {
      const stream = await browserNavigator.mediaDevices!.getUserMedia!({ audio: true, video: true });
      audioReady = stream.getAudioTracks().length > 0;
      videoReady = stream.getVideoTracks().length > 0;
      stream.getTracks().forEach(track => track.stop());
    } catch {
      // Permission values and false readiness explain the failed probe to the caller.
    }
  }

  return {
    online,
    mediaSupported,
    audio,
    video,
    audioReady,
    videoReady,
    effectiveType: browserNavigator.connection?.effectiveType || "unknown",
    rtt: typeof browserNavigator.connection?.rtt === "number" ? browserNavigator.connection.rtt : null,
    downlink: typeof browserNavigator.connection?.downlink === "number" ? browserNavigator.connection.downlink : null,
    checkedAt: Date.now(),
  };
}

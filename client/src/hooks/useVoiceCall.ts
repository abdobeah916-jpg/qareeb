import { useCallback, useEffect, useRef, useState } from "react";
import type { DirectSignal, DirectSignalKind } from "./useRealtime";

export type CallType = "audio" | "video";
export type CallStatus = "idle" | "requesting" | "calling" | "incoming" | "connecting" | "connected" | "failed";
type SignalCallData = { description: RTCSessionDescriptionInit; callId: string; callType: CallType };
type VoiceCallOptions = { conversationId: string | null; incomingSignal: DirectSignal | null; sendSignal: (conversationId: string, kind: DirectSignalKind, data?: unknown) => void; iceServers?: RTCIceServer[] };
// Local-network mode relies on host candidates and does not call external STUN services.
const fallbackIceServers: RTCIceServer[] = [];
const isDescription = (value: unknown): value is RTCSessionDescriptionInit => value !== null && typeof value === "object" && "type" in value && "sdp" in value;
const isCallData = (value: unknown): value is SignalCallData => value !== null && typeof value === "object" && "description" in value && "callId" in value && "callType" in value && isDescription((value as SignalCallData).description) && ["audio", "video"].includes(String((value as SignalCallData).callType));

export function useVoiceCall({ conversationId, incomingSignal, sendSignal, iceServers }: VoiceCallOptions) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [incoming, setIncoming] = useState<SignalCallData | null>(null);
  const [activeCallType, setActiveCallType] = useState<CallType>("audio");
  const [callId, setCallId] = useState<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const cleanup = useCallback((notify = false, finalStatus: "ended" | "rejected" | "missed" | "failed" = "ended") => {
    const activeCallId = callIdRef.current;
    if (notify && conversationId && activeCallId) sendSignal(conversationId, "call-ended", { callId: activeCallId, status: finalStatus });
    peerRef.current?.close(); peerRef.current = null;
    screenStreamRef.current?.getTracks().forEach(track => track.stop()); screenStreamRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    callIdRef.current = null; pendingCandidatesRef.current = []; setIncoming(null); setCallId(null); setStatus("idle"); setIsMicrophoneMuted(false); setIsCameraOff(false); setIsScreenSharing(false);
  }, [conversationId, sendSignal]);

  const preparePeer = useCallback(async (callType: CallType) => {
    if (!conversationId) throw new Error("اختر محادثة خاصة أولًا.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" });
    streamRef.current = stream;
    setIsMicrophoneMuted(false); setIsCameraOff(false); setIsScreenSharing(false);
    if (callType === "video" && localVideoRef.current) localVideoRef.current.srcObject = stream;
    const peer = new RTCPeerConnection({ iceServers: iceServers?.length ? iceServers : fallbackIceServers });
    peerRef.current = peer;
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    peer.onicecandidate = event => { if (event.candidate) sendSignal(conversationId, "ice-candidate", event.candidate.toJSON()); };
    peer.ontrack = event => {
      const remote = event.streams[0] ?? null;
      if (callType === "video" && remoteVideoRef.current) { remoteVideoRef.current.srcObject = remote; void remoteVideoRef.current.play().catch(() => undefined); }
      else if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = remote; void remoteAudioRef.current.play().catch(() => undefined); }
    };
    peer.onconnectionstatechange = () => { if (peer.connectionState === "connected") setStatus("connected"); if (["failed", "disconnected", "closed"].includes(peer.connectionState)) cleanup(false, "failed"); };
    return peer;
  }, [cleanup, conversationId, iceServers, sendSignal]);

  const flushPendingCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current.splice(0);
    await Promise.all(candidates.map(candidate => peer.addIceCandidate(candidate).catch(() => undefined)));
  }, []);

  const toggleMicrophone = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (!tracks.length) return false;
    const nextMuted = tracks.some(track => track.enabled);
    tracks.forEach(track => { track.enabled = !nextMuted; });
    setIsMicrophoneMuted(nextMuted);
    return true;
  }, []);

  const toggleCamera = useCallback(() => {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    if (!tracks.length) return false;
    const nextCameraOff = tracks.some(track => track.enabled);
    tracks.forEach(track => { track.enabled = !nextCameraOff; });
    setIsCameraOff(nextCameraOff);
    return true;
  }, []);

  const stopScreenShare = useCallback(async () => {
    const screenStream = screenStreamRef.current;
    const cameraTrack = streamRef.current?.getVideoTracks()[0];
    const sender = peerRef.current?.getSenders().find(item => item.track?.kind === "video");
    if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
    screenStream?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
    setIsScreenSharing(false);
    return true;
  }, []);

  const startScreenShare = useCallback(async () => {
    if (activeCallType !== "video" || !peerRef.current || !streamRef.current || !navigator.mediaDevices.getDisplayMedia) return false;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = displayStream.getVideoTracks()[0];
      const sender = peerRef.current.getSenders().find(item => item.track?.kind === "video");
      if (!screenTrack || !sender) {
        displayStream.getTracks().forEach(track => track.stop());
        return false;
      }
      await sender.replaceTrack(screenTrack);
      screenStreamRef.current = displayStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = displayStream;
      setIsScreenSharing(true);
      screenTrack.onended = () => { void stopScreenShare(); };
      return true;
    } catch {
      return false;
    }
  }, [activeCallType, stopScreenShare]);

  const startCall = useCallback(async (nextCallId: string, callType: CallType) => {
    if (!conversationId) return;
    try { callIdRef.current = nextCallId; setCallId(nextCallId); setActiveCallType(callType); setStatus("requesting"); const peer = await preparePeer(callType); const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: callType === "video" }); await peer.setLocalDescription(offer); sendSignal(conversationId, "call-offer", { description: offer, callId: nextCallId, callType }); setStatus("calling"); }
    catch { cleanup(false, "failed"); setStatus("failed"); }
  }, [cleanup, conversationId, preparePeer, sendSignal]);
  const acceptCall = useCallback(async () => { if (!conversationId || !incoming) return; try { callIdRef.current = incoming.callId; setCallId(incoming.callId); setActiveCallType(incoming.callType); setStatus("requesting"); const peer = await preparePeer(incoming.callType); await peer.setRemoteDescription(incoming.description); await flushPendingCandidates(peer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); sendSignal(conversationId, "call-answer", { description: answer, callId: incoming.callId, callType: incoming.callType }); setIncoming(null); setStatus("connecting"); } catch { cleanup(false, "failed"); setStatus("failed"); } }, [cleanup, conversationId, flushPendingCandidates, incoming, preparePeer, sendSignal]);
  useEffect(() => { if (!incomingSignal || incomingSignal.conversationId !== conversationId) return; const peer = peerRef.current; if (incomingSignal.kind === "call-offer" && isCallData(incomingSignal.data)) { callIdRef.current = incomingSignal.data.callId; pendingCandidatesRef.current = []; setIncoming(incomingSignal.data); setCallId(incomingSignal.data.callId); setActiveCallType(incomingSignal.data.callType); setStatus("incoming"); return; } if (incomingSignal.kind === "call-ended") { cleanup(false); return; } if (incomingSignal.kind === "call-answer" && peer && isCallData(incomingSignal.data)) { void peer.setRemoteDescription(incomingSignal.data.description).then(() => flushPendingCandidates(peer)).then(() => setStatus("connecting")).catch(() => setStatus("failed")); return; } if (incomingSignal.kind === "ice-candidate" && incomingSignal.data) { if (peer?.remoteDescription) void peer.addIceCandidate(incomingSignal.data as RTCIceCandidateInit).catch(() => undefined); else pendingCandidatesRef.current.push(incomingSignal.data as RTCIceCandidateInit); } }, [cleanup, conversationId, flushPendingCandidates, incomingSignal]);
  useEffect(() => () => cleanup(false), [cleanup]);
  return { status, callId, activeCallType, incomingOffer: incoming, remoteAudioRef, remoteVideoRef, localVideoRef, isMicrophoneMuted, isCameraOff, isScreenSharing, toggleMicrophone, toggleCamera, startScreenShare, stopScreenShare, startCall, acceptCall, rejectCall: () => cleanup(true, "rejected"), endCall: (status: "ended" | "rejected" | "missed" = "ended") => { const endingId = callIdRef.current; cleanup(true, status); return endingId; } };
}

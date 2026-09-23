import type { LocalP2PSession, P2PMessage } from "./p2pTransport";

export type TransportMode = "p2p";
const activeSessions = new Set<LocalP2PSession>();
const listeners = new Set<() => void>();
const messageListeners = new Set<(message: P2PMessage) => void>();

export function getTransportMode(): TransportMode { return "p2p"; }
export function setTransportMode(_mode: TransportMode) { listeners.forEach(listener => listener()); }
export function getActiveP2PSession() { return Array.from(activeSessions).find(session => session.isReady()) ?? null; }
export function sendP2PMessageToAll(text: string) { const readySessions = Array.from(activeSessions).filter(session => session.isReady()); if (!readySessions.length) throw new Error("اتصال P2P غير جاهز بعد."); const sentMessage = readySessions[0].send(text); for (const session of readySessions.slice(1)) { try { session.send(text); } catch { /* A peer may disconnect during a mesh broadcast. */ } } publishP2PMessage(sentMessage); return sentMessage; }
export function setActiveP2PSession(session: LocalP2PSession | null) { if (session) activeSessions.add(session); else activeSessions.clear(); listeners.forEach(listener => listener()); }
export function removeP2PSession(session: LocalP2PSession) { activeSessions.delete(session); listeners.forEach(listener => listener()); }
export function publishP2PMessage(message: P2PMessage) { messageListeners.forEach(listener => listener(message)); }
export function subscribeP2PMessage(listener: (message: P2PMessage) => void) { messageListeners.add(listener); return () => messageListeners.delete(listener); }
export function subscribeP2P(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }

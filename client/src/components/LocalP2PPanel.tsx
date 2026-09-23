import { PlugZap, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { LocalP2PSession, type P2PMessage } from "@/lib/p2pTransport";
import { publishP2PMessage, removeP2PSession, setActiveP2PSession } from "@/lib/p2pRegistry";

type Language = "ar" | "en";

export default function LocalP2PPanel({ language, roomId, deviceId }: { language: Language; roomId: string; deviceId: string }) {
  const ar = language === "ar";
  const [state, setState] = useState("waiting");
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const sessions = useRef(new Map<string, LocalP2PSession>());
  const socketRef = useRef<Socket | null>(null);
  const activePeer = useRef<string | null>(null);

  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const attach = (peerId: string, session: LocalP2PSession) => {
      sessions.current.set(peerId, session);
      session.onMessage(message => { setMessages(current => [...current, message]); publishP2PMessage(message); });
      session.onStateChange(next => { if (next === "connected") { activePeer.current = peerId; setActiveP2PSession(session); setState("connected"); } else if (["failed", "disconnected", "closed"].includes(next)) { sessions.current.delete(peerId); removeP2PSession(session); if (activePeer.current === peerId) { activePeer.current = null; setState("waiting"); } } });
    };
    const createOffer = async (peerId: string) => { if (sessions.current.has(peerId) || deviceId > peerId) return; const session = LocalP2PSession.createInitiator(); attach(peerId, session); const data = await session.createOffer(); socket.emit("room:p2p-signal", { toDeviceId: peerId, kind: "offer", data }); };
    socket.on("connect", () => { socket.emit("realtime:register", deviceId, roomId); socket.emit("room:p2p-hello"); });
    socket.on("room:p2p-peer", ({ deviceId: peerId }: { deviceId: string }) => { void createOffer(peerId); });
    socket.on("room:p2p-signal", async ({ fromDeviceId, kind, data }: { fromDeviceId: string; kind: "offer" | "answer"; data: string }) => {
      try {
        if (kind === "offer") { const session = LocalP2PSession.createReceiver(); attach(fromDeviceId, session); const answer = await session.acceptOffer(data); socket.emit("room:p2p-signal", { toDeviceId: fromDeviceId, kind: "answer", data: answer }); }
        else { await sessions.current.get(fromDeviceId)?.acceptAnswer(data); }
      } catch { setState("failed"); }
    });
    return () => { socket.disconnect(); socketRef.current = null; for (const session of Array.from(sessions.current.values())) { removeP2PSession(session); session.close(); } sessions.current.clear(); };
  }, [deviceId, roomId]);

  const send = () => { const session = activePeer.current ? sessions.current.get(activePeer.current) : undefined; const text = messageText.trim(); if (!session || !text) return; try { const sentMessage = session.send(text); setMessages(current => [...current, sentMessage]); setMessageText(""); } catch { setState("waiting"); } };
  const status = state === "connected" ? (ar ? "متصل مباشرة" : "Connected directly") : state === "failed" ? (ar ? "فشل الاتصال — تأكد من نفس Wi‑Fi" : "Connection failed — check the same Wi‑Fi") : (ar ? "جارٍ الاتصال تلقائيًا…" : "Connecting automatically…");
  return <section className="setting-card p2p-card" aria-label={ar ? "اتصال P2P تلقائي" : "Automatic P2P connection"}>
    <div className="setting-heading"><span><PlugZap /></span><div><h3>{ar ? "اتصال P2P تلقائي" : "Automatic P2P connection"}</h3><p>{ar ? "سيتم الاتصال تلقائيًا بأعضاء الغرفة. الرسائل تنتقل مباشرة بين الأجهزة ولا تُحفظ على الخادم." : "You connect automatically to room members. Messages travel directly and are not stored on the server."}</p></div></div>
    <p className="p2p-status" aria-live="polite"><PlugZap /> {status}</p>
    <div className="p2p-messages" aria-live="polite">{messages.length ? messages.map(message => <p key={message.id}><time>{new Date(message.sentAt).toLocaleTimeString()}</time> {message.text}</p>) : <p>{ar ? "لا توجد رسائل P2P بعد." : "No P2P messages yet."}</p>}</div>
    <form className="p2p-send" onSubmit={event => { event.preventDefault(); send(); }}><input value={messageText} onChange={event => setMessageText(event.target.value)} placeholder={ar ? "اكتب رسالة مباشرة…" : "Write a direct message…"} /><button type="submit" disabled={!messageText.trim() || state !== "connected"}><Send /> {ar ? "إرسال" : "Send"}</button></form>
  </section>;
}

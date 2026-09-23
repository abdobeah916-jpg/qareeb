import { ArrowRight, FileUp, LayoutGrid, MessageSquareText, UsersRound, Video } from "lucide-react";

type Props = { language: "ar" | "en"; onNavigate: (tab: "messages" | "people" | "files") => void };

export default function ServicesView({ language, onNavigate }: Props) {
  const isArabic = language === "ar";
  const services = [
    { tone: "blue", icon: MessageSquareText, title: isArabic ? "غرف المحادثة" : "Chat rooms", body: isArabic ? "أنشئ غرفة خاصة برمز بسيط وشاركها مع من تريد." : "Create a private room with a simple code and share it with anyone.", action: isArabic ? "فتح المحادثات" : "Open chats", tab: "messages" as const },
    { tone: "teal", icon: UsersRound, title: isArabic ? "محادثات خاصة" : "Private chats", body: isArabic ? "تواصل مع شخص من المتصلين في الغرفة بصورة مباشرة وآمنة." : "Connect directly and securely with someone online in the room.", action: isArabic ? "اختيار شخص" : "Choose a person", tab: "people" as const },
    { tone: "violet", icon: Video, title: isArabic ? "مكالمات صوت وفيديو" : "Audio and video calls", body: isArabic ? "ابدأ دعوة من محادثة خاصة مع تحكم كامل في الكاميرا والصوت." : "Start an invitation from a private chat with full camera and microphone controls.", action: isArabic ? "فتح الأشخاص" : "Open people", tab: "people" as const },
    { tone: "amber", icon: FileUp, title: isArabic ? "مشاركة الملفات" : "File sharing", body: isArabic ? "راجع المرفقات المتبادلة في الغرفة أو المحادثة الخاصة بسهولة." : "Review attachments shared in a room or private conversation with ease.", action: isArabic ? "عرض الملفات" : "View files", tab: "files" as const },
  ];
  return <section className="browse-view services-view" aria-label={isArabic ? "الخدمات المتاحة" : "Available services"}>
    <div className="view-heading"><div><p className="eyebrow">{isArabic ? "كل ما تحتاجه قريبًا" : "Everything you need nearby"}</p><h1>{isArabic ? "أحدث الخدمات" : "Latest services"}</h1><p>{isArabic ? "ابدأ المسار المناسب من مكان واحد، ثم عد إلى محادثتك دون فقدان السياق." : "Start the right flow from one place, then return to your conversation without losing context."}</p></div><span className="view-count"><LayoutGrid /> {services.length} {isArabic ? "خدمات" : "services"}</span></div>
    <div className="service-grid">{services.map(({ tone, icon: Icon, title, body, action, tab }) => <article className={`service-card ${tone}`} key={title}><span className="service-icon"><Icon /></span><span className="service-status">{isArabic ? "متاحة الآن" : "Available now"}</span><h2>{title}</h2><p>{body}</p><button type="button" onClick={() => onNavigate(tab)}>{action} <ArrowRight /></button></article>)}</div>
  </section>;
}

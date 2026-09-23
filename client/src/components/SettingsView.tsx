import { ArrowRight, BellRing, ImageUp, MoonStar, Palette, Settings2, ShieldCheck, SlidersHorizontal, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

type Appearance = "noir" | "ocean" | "sage";
type ReadingBackdrop = "soft" | "paper" | "night";
type Language = "ar" | "en";
type Props = {
  language: Language;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  readingBackdrop: ReadingBackdrop;
  onReadingBackdropChange: (backdrop: ReadingBackdrop) => void;
  compactReading: boolean;
  onCompactReadingChange: () => void;
  fontScale: number;
  onFontScaleChange: (fontScale: number) => void;
  ringtoneEnabled: boolean;
  onRingtoneChange: () => void;
  onBackToMessages: () => void;
  onShowWelcome: () => void;
  avatarUrl: string | null;
  avatarPending: boolean;
  onAvatarSelected: (file: File | undefined) => void;
  name: string;
  onNameChange: (name: string) => void;
};

export default function SettingsView({ language, appearance, onAppearanceChange, readingBackdrop, onReadingBackdropChange, compactReading, onCompactReadingChange, fontScale, onFontScaleChange, ringtoneEnabled, onRingtoneChange, onBackToMessages, onShowWelcome, avatarUrl, avatarPending, onAvatarSelected, name, onNameChange }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [draftName, setDraftName] = useState(name);
  const isArabic = language === "ar";

  useEffect(() => setDraftName(name), [name]);

  const saveName = (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = draftName.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!nextName) return;
    onNameChange(nextName);
    setDraftName(nextName);
  };

  return <section className="browse-view settings-view" aria-label={isArabic ? "إعدادات المساحة" : "Space settings"}>
    <div className="view-heading"><div><p className="eyebrow">{isArabic ? "تفضيلاتك على هذا الجهاز" : "Your preferences on this device"}</p><h1>{isArabic ? "إعدادات المساحة" : "Space settings"}</h1><p>{isArabic ? "تُحفظ هذه الخيارات محليًا في متصفحك ولا تؤثر على تفضيلات أي مستخدم آخر." : "These choices are saved locally in your browser and do not affect other users."}</p></div><span className="view-count"><Settings2 /> {isArabic ? "مظهر وتجربة" : "Look and feel"}</span></div>
    <div className="settings-grid">
      <section className="setting-card avatar-setting-card"><div className="setting-heading"><span><ImageUp /></span><div><h2>{isArabic ? "الصورة الشخصية" : "Profile photo"}</h2><p>{isArabic ? "اختر صورة تظهر لك في مساحة المحادثة على هذا الجهاز." : "Choose the photo shown for you in chats on this device."}</p></div></div><div className="avatar-upload-row"><span className="settings-avatar-preview">{avatarUrl ? <img src={avatarUrl} alt={isArabic ? "الصورة الشخصية الحالية" : "Current profile photo"} /> : "ز"}</span><div className="avatar-upload-copy"><input id="qareeb-avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => onAvatarSelected(event.target.files?.[0])} /><label htmlFor="qareeb-avatar" className="avatar-upload-button" aria-disabled={avatarPending}><ImageUp size={14} /> {avatarPending ? (isArabic ? "جارٍ الرفع…" : "Uploading…") : avatarUrl ? (isArabic ? "تغيير الصورة" : "Change photo") : (isArabic ? "رفع صورة" : "Upload photo")}</label><small>{isArabic ? "JPG أو PNG أو WebP أو GIF، حتى 500 كيلوبايت." : "JPG, PNG, WebP, or GIF, up to 500 KB."}</small></div></div><form className="profile-name-form" onSubmit={saveName}><label htmlFor="qareeb-display-name">{isArabic ? "الاسم الظاهر" : "Display name"}</label><div><input id="qareeb-display-name" value={draftName} onChange={event => setDraftName(event.target.value.slice(0, 40))} maxLength={40} autoComplete="name" /><button type="submit" disabled={!draftName.trim() || draftName.trim() === name}>{isArabic ? "حفظ" : "Save"}</button></div></form></section>
      <section className="setting-card"><div className="setting-heading"><span>{theme === "dark" ? <MoonStar /> : <Sun />}</span><div><h2>{isArabic ? "الوضع الليلي" : "Dark mode"}</h2><p>{isArabic ? "بدّل الألوان المريحة للعين في جميع مساحات قريب على هذا الجهاز." : "Use a more comfortable palette across Qareeb on this device."}</p></div></div><button type="button" className={`setting-toggle${theme === "dark" ? " selected" : ""}`} aria-pressed={theme === "dark"} onClick={toggleTheme}><i /><span>{theme === "dark" ? (isArabic ? "الوضع الليلي مفعّل" : "Dark mode enabled") : (isArabic ? "تفعيل الوضع الليلي" : "Enable dark mode")}</span></button></section>
      <section className="setting-card"><div className="setting-heading"><span><Palette /></span><div><h2>{isArabic ? "المظهر الاحترافي" : "App appearance"}</h2><p>{isArabic ? "اختر لوحة ألوان مريحة للقراءة اليومية." : "Choose a palette that feels comfortable for daily reading."}</p></div></div><div className="appearance-options" role="radiogroup" aria-label={isArabic ? "اختيار المظهر" : "Choose appearance"}><button type="button" role="radio" aria-checked={appearance === "noir"} className={`appearance-choice noir${appearance === "noir" ? " selected" : ""}`} onClick={() => onAppearanceChange("noir")}><i /><span>{isArabic ? "فحمي هادئ" : "Quiet noir"}</span></button><button type="button" role="radio" aria-checked={appearance === "ocean"} className={`appearance-choice ocean${appearance === "ocean" ? " selected" : ""}`} onClick={() => onAppearanceChange("ocean")}><i /><span>{isArabic ? "أزرق متزن" : "Balanced ocean"}</span></button><button type="button" role="radio" aria-checked={appearance === "sage"} className={`appearance-choice sage${appearance === "sage" ? " selected" : ""}`} onClick={() => onAppearanceChange("sage")}><i /><span>{isArabic ? "أخضر طبيعي" : "Natural sage"}</span></button></div></section>
      <section className="setting-card"><div className="setting-heading"><span><Palette /></span><div><h2>{isArabic ? "خلفية القراءة" : "Reading background"}</h2><p>{isArabic ? "اختر خلفية مريحة لمساحة الرسائل دون تغيير ألوان التطبيق كلها." : "Choose a comfortable message background without changing the whole app."}</p></div></div><div className="reading-background-options" role="radiogroup" aria-label={isArabic ? "اختيار خلفية القراءة" : "Choose reading background"}><button type="button" role="radio" aria-checked={readingBackdrop === "soft"} className={`reading-background-choice soft${readingBackdrop === "soft" ? " selected" : ""}`} onClick={() => onReadingBackdropChange("soft")}><i /><span>{isArabic ? "هادئة" : "Soft"}</span></button><button type="button" role="radio" aria-checked={readingBackdrop === "paper"} className={`reading-background-choice paper${readingBackdrop === "paper" ? " selected" : ""}`} onClick={() => onReadingBackdropChange("paper")}><i /><span>{isArabic ? "ورقية" : "Paper"}</span></button><button type="button" role="radio" aria-checked={readingBackdrop === "night"} className={`reading-background-choice night${readingBackdrop === "night" ? " selected" : ""}`} onClick={() => onReadingBackdropChange("night")}><i /><span>{isArabic ? "داكنة" : "Night"}</span></button></div></section>
      <section className="setting-card"><div className="setting-heading"><span><SlidersHorizontal /></span><div><h2>{isArabic ? "راحة القراءة" : "Reading comfort"}</h2><p>{isArabic ? "قلّل المسافات الرأسية لعرض عدد أكبر من الرسائل." : "Reduce vertical spacing to show more messages at once."}</p></div></div><button type="button" className={`setting-toggle${compactReading ? " selected" : ""}`} aria-pressed={compactReading} onClick={onCompactReadingChange}><i /><span>{compactReading ? (isArabic ? "الوضع المضغوط مفعّل" : "Compact mode enabled") : (isArabic ? "استخدم وضعًا مضغوطًا" : "Use compact mode")}</span></button></section>
      <section className="setting-card"><div className="setting-heading"><span><SlidersHorizontal /></span><div><h2>{isArabic ? "حجم الخط" : "Text size"}</h2><p>{isArabic ? "كبّر أو صغّر النص على كل أجهزتك بعد تسجيل الدخول." : "Adjust message text across your signed-in devices."}</p></div></div><div className="font-size-options" role="radiogroup" aria-label={isArabic ? "اختيار حجم الخط" : "Choose text size"}>{[90, 100, 110].map(size => <button type="button" key={size} role="radio" aria-checked={fontScale === size} className={fontScale === size ? "selected" : ""} onClick={() => onFontScaleChange(size)}>{size === 90 ? (isArabic ? "صغير" : "Small") : size === 110 ? (isArabic ? "كبير" : "Large") : (isArabic ? "قياسي" : "Standard")}</button>)}</div></section>
      <section className="setting-card"><div className="setting-heading"><span><BellRing /></span><div><h2>{isArabic ? "نغمة المكالمات" : "Call ringtone"}</h2><p>{isArabic ? "نغمة محلية عند وصول دعوة مكالمة خاصة." : "Play a local tone when a private call invitation arrives."}</p></div></div><button type="button" className={`setting-toggle${ringtoneEnabled ? " selected" : ""}`} aria-pressed={ringtoneEnabled} onClick={onRingtoneChange}><i /><span>{ringtoneEnabled ? (isArabic ? "الرنين مفعّل" : "Ringtone enabled") : (isArabic ? "تفعيل الرنين" : "Enable ringtone")}</span></button></section>
      <section className="setting-card privacy-card"><div className="setting-heading"><span><ShieldCheck /></span><div><h2>{isArabic ? "خصوصية المساحة" : "Space privacy"}</h2><p>{isArabic ? "تظل الرسائل والملفات والمكالمات داخل الغرفة أو المحادثة التي اخترتها." : "Messages, files, and calls stay inside the room or chat you choose."}</p></div></div><button type="button" onClick={onBackToMessages}>{isArabic ? "العودة إلى المحادثات" : "Back to chats"} <ArrowRight /></button><button type="button" className="show-welcome" onClick={onShowWelcome}>{isArabic ? "عرض صفحة التعريف" : "View welcome page"} <ArrowRight /></button></section>
    </div>
  </section>;
}

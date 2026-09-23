# تشغيل قريب داخل الشبكة المحلية

## الفكرة

يعمل **قريب** الآن بوضع LAN محلي افتراضي. الجهاز الذي يشغّل الخادم يحتفظ ببيانات الغرف والرسائل والملفات داخل مجلد `.qareeb-data`، ولا يحتاج التطبيق إلى تسجيل خارجي أو قاعدة بيانات سحابية أو STUN خارجي.

## التشغيل السريع على جهاز الخادم

```bash
pnpm install
pnpm build
pnpm start:lan
```

بعد التشغيل ستظهر رسالة شبيهة بالتالي:

```text
Qareeb LAN server running on http://0.0.0.0:3000/
```

اعرف عنوان الجهاز داخل الشبكة، مثل `192.168.1.25`، ثم افتح من أي جهاز متصل بنفس الراوتر:

```text
http://192.168.1.25:3000
```

إذا كان جدار الحماية مفعلاً، اسمح بالمنفذ `3000` على الشبكة الخاصة فقط. لا تفتح المنفذ على الإنترنت العام.

## التشغيل أثناء التطوير

```bash
pnpm dev:lan
```

## ملفات البيانات والنسخ الاحتياطي

يخزن التطبيق البيانات في:

```text
.qareeb-data/qareeb.json
.qareeb-data/files/
```

لعمل نسخة احتياطية أوقف الخادم ثم انسخ المجلد كاملًا إلى مكان آمن:

```bash
cp -a .qareeb-data qareeb-backup-$(date +%Y%m%d-%H%M%S)
```

## ما تم إضافته

| الميزة | التفاصيل |
|---|---|
| دخول محلي | اسم مستخدم، اسم ظاهر، وصورة شخصية اختيارية محفوظة على الجهاز والمتصفح. |
| العربية والإنجليزية | زر تبديل اللغة في شاشة البداية وشريط التطبيق، مع تبديل اتجاه الصفحة. |
| دعوات المشرفين | المالك يرسل دعوة، والعضو يوافق أو يرفض قبل حصوله على الصلاحيات. |
| إشعارات إدارية | يظهر للأعضاء إشعار فوري عند إجراءات المشرفين، مع زر قراءة الكل. |
| سجل النشاط | المالك والمشرف صاحب صلاحية السجل يستطيعان تنزيل CSV للاحتفاظ به. |
| اتصال لحظي محلي | Socket.IO يعمل داخل نفس الخادم والشبكة. |
| الملفات | الصور والمرفقات تحفظ في مجلد محلي وتخدم من `/local-files`. |
| المكالمات | تم إيقاف Google STUN الافتراضي؛ يستخدم التطبيق مرشحي الشبكة المحلية، ويمكن إضافة TURN محلي اختياريًا. |

# Running Qareeb on a LAN

Qareeb defaults to local-network mode. The server binds to `0.0.0.0`, stores rooms, messages, activity logs, and attachments on the host machine, and does not require cloud authentication or external storage.

```bash
pnpm install
pnpm build
pnpm start:lan
```

Open `http://HOST-LAN-IP:3000` from another device on the same router. Keep the firewall rule limited to the private LAN and do not expose the port publicly.

Local files are stored in `.qareeb-data`. Back up that folder after stopping the server.

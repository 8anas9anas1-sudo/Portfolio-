# Anas Wadi — Portfolio

موقع بورتفوليو ثابت (HTML/CSS/JS) + لوحة تحكم `/admin` تعدّل المحتوى مباشرة في GitHub.
**بدون قاعدة بيانات وبدون سحابة:** المحتوى ملفات JSON داخل الريبو، واللوحة تعمل commit، وVercel ينشر تلقائياً خلال ≈ دقيقة.

## الهيكل

```
├── public/                  ← الموقع نفسه (هذا فقط ما يراه الزائر)
│   ├── index.html
│   ├── css/                 نظام التصميم (مشترك بين الموقع واللوحة)
│   │   ├── fonts.css        الخط
│   │   ├── tokens.css       الألوان · الأحجام · الظلال (المصدر الوحيد)
│   │   ├── base.css         reset + الأساسيات
│   │   ├── components.css   glass · btn · filter-btn · badge · input …
│   │   └── site.css         أقسام الموقع فقط
│   ├── js/                  main.js (المنطق) · icons.js (الأيقونات)
│   ├── data/                projects.json · journey.json · faq.json   ← المحتوى
│   ├── assets/
│   │   ├── fonts/           خط Graphik Arabic
│   │   ├── images/          الشعار · الغلاف · og-image · favicon
│   │   └── projects/        صور المشاريع (تُرفع من اللوحة)
│   └── admin/               index.html · admin.css (خاص باللوحة فقط) · admin.js
├── api/                     login.js · data.js · save.js   (دوال Vercel)
├── server/lib/              auth · github · validate · http · config
├── tests/                   اختبارات الـ API (npm test)
├── vercel.json              إعدادات النشر والـ headers
├── package.json
└── .env.example
```

ما داخل `public/` فقط يُنشر كموقع. كود `api/` و`server/` يعمل كدوال خلفية ولا يُقدَّم للزوار.

## نظام التصميم (الموقع + اللوحة)

الموقع و`/admin` يحمّلان نفس الملفات بنفس الترتيب: `fonts → tokens → base → components`، ثم ملف خاص (`site.css` أو `admin.css`).

| تريد أن… | افعل |
|---|---|
| تغيّر لوناً أو حجم زوايا أو ظلاً | عدّله في `tokens.css` فقط، فيتغيّر في الموقع واللوحة معاً |
| تضيف زراً | استخدم `.btn` + نوع: `btn-primary` (أبيض) · `btn-accent` (تدرّج) · `btn-glass glass-strong` (زجاجي) · `btn-danger` |
| تضيف بطاقة / لوحة | `panel glass` (أو `glass-strong` للنوافذ) |
| تضيف حقلاً | `.field` + `.field-label` + `.input` / `.select` / `.textarea` |
| تضيف تبويباً أو فلتراً | `.filter-row` + `.filter-btn` |
| تضيف شارة | `.status-badge` · `.tech-pill` · `.eyebrow` |

قواعد ثابتة: الأزرار والشارات دائماً pill (`--r-pill`) · لا ألوان hex جديدة خارج `tokens.css` · أي مكوّن يُستخدم في الموقع **واللوحة** يوضع في `components.css` وليس في الملف الخاص.

## التشغيل لأول مرة (10 دقائق)

### 1) ارفع المشروع إلى GitHub
أنشئ ريبو جديداً (يُفضَّل Private) وارفع **كل** محتويات هذا المجلد.

### 2) اربطه بـ Vercel
Vercel ← Add New ← Project ← اختر الريبو ← **Deploy** (لا تغيّر شيئاً؛ `vercel.json` يضبط كل شيء).

### 3) أنشئ توكن GitHub (صلاحية ضيقة جداً)
GitHub ← Settings ← Developer settings ← Personal access tokens ← **Fine-grained tokens** ← Generate new token:

- **Repository access:** Only select repositories ← اختر ريبو الموقع فقط
- **Permissions ← Repository permissions ← Contents:** `Read and write`
- انسخ التوكن (يظهر مرة واحدة)

### 4) أضف المتغيرات في Vercel
Project ← Settings ← Environment Variables:

| الاسم | القيمة |
|---|---|
| `ADMIN_PASSWORD` | كلمة سر لوحة التحكم — **10 أحرف على الأقل**، الأفضل جملة طويلة |
| `GITHUB_TOKEN` | التوكن من الخطوة 3 |
| `GITHUB_REPO` | `اسم-حسابك/اسم-الريبو` |
| `GITHUB_BRANCH` | `main` (أو `master` إن كان فرعك الرئيسي كذلك) |

⚠️ المتغيرات لا تُطبَّق إلا على النشر **التالي**: بعد إضافتها اذهب Deployments ← ثلاث نقاط على آخر نشر ← **Redeploy**.

### 5) افتح اللوحة
`https://موقعك.vercel.app/admin` ← أدخل كلمة السر.

### 6) آخر لمسة
في `public/index.html` استبدل `YOUR-DOMAIN.vercel.app` (في 3 أماكن: `og:url` و`og:image` و`twitter:image`) برابط موقعك الحقيقي، وإلا لن تظهر صورة المعاينة في واتساب/لينكدإن.

## كيف تعمل اللوحة

- **إضافة / تعديل / حذف / ترتيب** للمشاريع والمحطات والأسئلة. التعديلات محلية حتى تضغط **«حفظ ونشر»**.
- «حفظ ونشر» يرسل كل التغييرات (بيانات + صور + حذف) في **commit واحد** ← نشر واحد في Vercel.
- الصور تُصغَّر داخل المتصفح قبل الرفع (الغلاف JPEG ≤ 1400px، الشعار يحافظ على الشفافية PNG ≤ 512px).
- حذف مشروع يحذف صورته من الريبو أيضاً (إلا إن كان مشروع آخر يستخدمها).
- لو عدّلت الملفات من GitHub مباشرة أثناء فتح اللوحة، ترفض اللوحة الحفظ وتطلب إعادة التحميل بدل أن تكتب فوق عملك.
- اللوحة تقرأ دائماً من GitHub مباشرة، فترى آخر نسخة حتى قبل أن ينتهي النشر.

## التعديل اليدوي (بدون لوحة)

عدّل `public/data/*.json` من GitHub مباشرة ← commit ← ينشر Vercel تلقائياً. ضع الصور في `public/assets/projects/` واكتب مسارها هكذا: `assets/projects/اسم.jpg`.

## الأمان

- كلمة السر والتوكن في Environment Variables فقط — لا يوجد أي سر داخل الكود.
- التوكن مقيَّد بريبو واحد وبصلاحية Contents فقط.
- الخادم يتحقق من كل شيء قبل الكتابة (أنواع الحقول، الروابط، مسارات الصور، محتوى الصورة الحقيقي)، حتى لو تلاعب أحد بالطلب.
- المحتوى يُعرض بعد تهريب HTML (escape) فلا يمكن حقن سكربتات عبر لوحة التحكم.
- جلسة الدخول 12 ساعة، وتغيير `ADMIN_PASSWORD` أو التوكن يُسقط كل الجلسات القديمة.
- `/admin` له CSP صارم، ولا يُفهرَس في محركات البحث.

## الاختبار والتشغيل المحلي

```bash
npm test                 # 20 اختبار للـ API (GitHub وهمي، بدون إنترنت)
cp .env.example .env.local
npx vercel dev           # يشغّل الموقع + الـ API محلياً
```

## ملاحظات

- في خطة Vercel المجانية (Hobby) الاستخدام للمشاريع الشخصية/غير التجارية.
- الحد الأقصى لحجم طلب الحفظ ≈ 4MB؛ لو أضفت صوراً كثيرة دفعة واحدة احفظ على دفعتين (اللوحة تنبّهك).

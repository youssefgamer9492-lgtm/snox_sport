# نشر SNOX Sports وربطه بدومين خاص

## 1) رفع المشروع إلى GitHub
- فك ضغط ملف المشروع.
- أنشئ Repository جديد على GitHub وارفع ملفات المشروع إليه (لا ترفع `.env` أو مفاتيح سرية).

## 2) نشر مجاني/تجريبي على Render
- سجّل دخولك إلى Render وأنشئ Web Service من GitHub repository.
- إعدادات المشروع: Build Command `npm install && npm run build` و Start Command `npm run start`.
- اختَر الخطة المتاحة. الخطة المجانية قد تنام عند عدم الاستخدام وقد يتأخر أول فتح.
- Health Check Path: `/health`.
- أضف المتغيرات السرية المطلوبة من لوحة Render Environment فقط، ولا تضع مفاتيح API في ملفات عامة.

## 3) إعداد الدومين الخاص
- اشترِ دومين من Registrar موثوق (قد يتطلب حساب ولي أمر/بالغ ووسيلة دفع).
- من Render > Settings > Custom Domains، أضف الدومين (مثال: `snoxsports.com` أو `www.snoxsports.com`).
- اتبع قيم DNS التي يعرضها Render حرفيًا في لوحة الدومين: سجلات CNAME أو A حسب تعليمات Render الحالية. لا تستخدم قيمًا تخمينية.
- انتظر DNS propagation، ثم فعّل/تحقق HTTPS من Render.

## 4) قبل الإطلاق
- تأكد من أن Firebase Auth وFirestore Rules ومفاتيح Gemini/أي API مستخدمة مضبوطين.
- جرّب `/health`، تسجيل الدخول، الأخبار، المباريات، والإعدادات من الهاتف والكمبيوتر.
- لا تشارك مفاتيح أو بيانات دخول في المحادثة أو GitHub.

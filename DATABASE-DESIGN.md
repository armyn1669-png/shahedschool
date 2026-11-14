# طرح داده

## اصول

PostgreSQL و Prisma هدف هستند؛ مهاجرت‌ها نسخه‌دار و تغییرات حساس ممیزی می‌شوند. حذف حساب نباید اطلاعات آموزشی و تاریخی را به‌طور آبشاری پاک کند؛ غیرفعال‌سازی یا بایگانی و سیاست نگهداری داده ترجیح دارد.

## موجودیت‌های پایه برنامه‌ریزی‌شده

- `User`, `Role`, `Permission`, `Session`, `LoginEvent`
- `StudentProfile`, `TeacherProfile`, `GuardianProfile`, `StudentGuardian`
- `AcademicYear`, `GradeLevel`, `AcademicField`, `Branch`, `Classroom`, `Subject`, `SchoolClass`, `Enrollment`, `TeachingAssignment`
- `AttendanceRecord`, `GradeCategory`, `GradeRecord`, `Assignment`, `Submission`, `Examination`, `Question`, `Attempt`
- `Notification`, `NotificationPreference`, `SmsTemplate`, `SmsProviderConfig`, `SmsMessage`, `SmsDeliveryAttempt`
- `Conversation`, `ConversationParticipant`, `Message`, `Attachment`, `ReadReceipt`, `SchoolChannel`, `Announcement`, `AuditEvent`

## قیود مهم

- نام کاربری و شناسه دانش‌آموز در محدوده مدرسه یکتا باشند.
- پیوند سرپرست به دانش‌آموز دارای نوع رابطه و وضعیت باشد؛ یک دانش‌آموز چند سرپرست و هر سرپرست چند دانش‌آموز دارد.
- شماره اصلی سرپرست برای اعلان پیامکی باید وضعیت اعتبارسنجی داشته باشد.
- برای جلوگیری از ارسال تکراری، شناسه یکتای رویداد حضور و نوع اعلان قید یکتا دارند.
- سوابق حضور و نمره با نویسنده، زمان و دلیل تغییر ثبت می‌شوند.
- جداول داده حساس با کلیدهای خارجی صریح، نمایه دسترسی و قواعد مجوزدهی سمت سرور طراحی می‌شوند.

این طرح مفهومی است؛ migration یا مدل Prisma هنوز ایجاد نشده است.

## پیاده‌سازی مرحلهٔ ورود محلی

برای اجرای محلی، SQLite داخلی Node.js اکنون جدول‌های `users`, `sessions`, `login_attempts`, `audit_events` و `app_settings` را ایجاد می‌کند. این داده‌ها در پوشهٔ نادیده‌گرفته‌شدهٔ `data/` قرار می‌گیرند. این لایه آداپتور توسعه است و مهاجرت PostgreSQL/Prisma هنوز انجام نشده است.

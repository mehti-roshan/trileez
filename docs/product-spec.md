**# \*\*سند جامع محصول و معماری سوپرپلتفرم تری‌لیز\*\***

**##** *\*Core مشترک ERP/CRM، مانیتورینگ چندرابطی، افزونه، API و Webhook\**

\| نسخه | ۲.۲.۰ |

\| :---- | :---- |

\| **\*\*تاریخ\*\*** | مرداد ۱۴۰۵ / اوت ۲۰۲۶ |

\| **\*\*وضعیت\*\*** | نسخه بازنگری‌شده بر اساس معماری مانیتورینگ و ریموت |

**#** 

تری‌لیز یک سوپرپلتفرم SaaS چندمستاجری برای شرکت‌های ۱۰ تا ۳۰۰ نفره است. ERP، CRM و مدیریت کار در وب، ویندوز و موبایل از یک Core مشترک ارائه می‌شوند. مانیتورینگ نیز زیرسامانه Core است و از تب وب، اپ دسکتاپ و اپ موبایل قابل مشاهده و کنترل خواهد بود؛ دامنه عملی هر Client تابع مجوز و محدودیت رسمی سیستم‌عامل است.

\| تصمیم قطعی: کنسول مستقل ساخته نمی‌شود، اما مانیتورینگ محدود به وب نیست. Super Admin Grantهای رابطه‌ای را ایجاد می‌کند و Operator مجاز می‌تواند از وب، ویندوز یا موبایل Session را مشاهده یا کنترل کند. افزونه، API و Webhook قابلیت‌های پایه پلتفرم هستند. |

\| :---- |

**#** 

یکپارچگی داده و تجربه میان ERP/CRM و مانیتورینگ.

رابط کامل مدیریت کار شبیه Asana/Trello در وب، دسکتاپ و موبایل.

شفافیت نظارت، رضایت و قابلیت قطع Session.

Flutter برای Android/iOS با ماژول‌های بومی؛ اپ ویندوز Native با Agent سطح سیستم.

Self-hosted Relay و کنترل داده با الگوی الهام‌گرفته از RustDesk، بدون وابستگی کور به کد یا License.

**#** 

وب، اپ ویندوز و اپ‌های موبایل سه سطح دسترسی به یک Core مشترک هستند. هر Client باید رابط مدیریتی مدرن شبیه Asana/Trello برای کارهای روزانه ERP/CRM داشته باشد؛ شامل Navigation مشترک، Workspace و سازمان، پروژه/Board/List/Calendar، Task و Subtask، فرم، تایم‌لاگ، تیکت، CRM، چت، اعلان، گزارش و Approval. مانیتورینگ یک ماژول مجزا در همین Shell است و تجربه آن براساس Capability دستگاه تطبیق می‌یابد.

\| سطح | دامنه مشترک | تفاوت مجاز |

\| :---- | :---- | :---- |

\| Web | مدیریت کامل ERP/CRM، تنظیمات Tenant، افزونه، API و مانیتورینگ | بهترین سطح برای تنظیمات حجیم و Super Admin |

\| Windows | Workspace کامل \\+ مشاهده/کنترل مانیتورینگ \\+ Endpoint Agent | قابلیت‌های عمیق Task/Network/Remote روی ویندوز |

\| Android/iOS | Workspace کامل Mobile-first \\+ مشاهده/کنترل مانیتورینگ | کاهش دامنه فقط به‌علت محدودیت رسمی OS/Store، نه حذف ERP/CRM |

Navigation و Design System مشترک با Deep Link یکسان بین Clientها.

Offline cache و Outbox برای Task، Comment، Form Draft و Time Entry؛ حل Conflict در Core.

RBAC/ABAC و Feature Flag از Core دریافت شود و منو/اکشن غیرمجاز نمایش داده نشود.

Push/Desktop Notification، Global Search، Command Palette و Activity Inbox میان Clientها همگام باشند.

**#** 

مانیتورینگ یک قابلیت Core در سوپرپلتفرم است، نه محصولی وابسته به یک رابط خاص. سیاست، مجوز، Session، Presence، Media، Telemetry و Audit در سرویس‌های مرکزی اجرا می‌شوند. تب «مانیتورینگ» وب یکی از راه‌های مشاهده و کنترل است؛ اپ ویندوز، اندروید و iOS نیز متناسب با محدودیت پلتفرم، رابط مشاهده و کنترل دارند. کنسول جداگانه و مستقل از سوپرپلتفرم ساخته نمی‌شود.

**##** 

Super Admin تنها نقش مجاز برای ایجاد یا تغییر Grantهای مانیتورینگ است. هر Grant مشخص می‌کند کدام Operator، کدام Person/Device/Group را، با چه قابلیت‌هایی، در چه بازه زمانی و با چه نوع رضایتی مشاهده یا کنترل کند.

\| بُعد | نمونه مقادیر | قاعده |

\| :---- | :---- | :---- |

\| Operator | مدیر، سرپرست، Helpdesk، Auditor | هویت انسانی؛ Service Account فقط برای جمع‌آوری Telemetry |

\| Subject | فرد، دستگاه، تیم، پروژه | Grant نباید با تغییر تیم به‌صورت ناخواسته گسترش یابد |

\| Capability | Live View، History، Process، Remote Input، Audio، Camera | هر قابلیت Scope مستقل دارد |

\| Consent | Attended، Unattended Managed، Denied | Attended پیش‌فرض؛ Unattended فقط دستگاه سازمانی مدیریت‌شده |

\| Window | دائمی، زمان‌دار، Incident-based | Grant زمان‌دار خودکار منقضی شود |

\| Evidence | Reason، Ticket، Approver، Audit | Remote و دسترسی رسانه‌ای باید Session ID و Reason داشته باشد |

**##** 

نمای افراد و دستگاه‌ها با وضعیت Online/Offline، نسخه Agent، آخرین Ping، سلامت سرویس و سیاست فعال.

Live Desktop View، تاریخچه Screenshot، Timeline فعالیت، Process Explorer و Network Monitor.

شروع Remote Desktop، Chat متنی، تماس صوتی دوطرفه و درخواست دسترسی Camera/Microphone/Speaker طبق Platform.

مدیریت Mapping «چه کسی چه کسی را مانیتور کند» با Preview اثر مجوز و تاریخ انقضا.

جستجو، فیلتر، هشدار، Session History، Audit Trail و Export محدودشده.

Policy Builder برای کیفیت Screenshot، دوره Capture، Blur/Redaction، Retention، پهنای باند و ساعات مجاز.

نمای Responsive و همگام در وب، دسکتاپ و موبایل؛ قابلیت‌های ناسازگار با هر سیستم‌عامل با حالت Unsupported یا Guided نمایش داده شوند.

**#** 

\| قابلیت | Windows | Android | iOS |

\| :---- | :---- | :---- | :---- |

\| مشاهده زنده صفحه | کامل | با MediaProjection و رضایت هر Session | ReplayKit و شروع صریح کاربر |

\| کنترل ورودی | کامل با Agent مجاز | مشروط؛ Accessibility/Enterprise Policy | کنترل کامل دستگاه مقصد قابل‌تعهد نیست |

\| Process/Task Manager | کامل با سطح دسترسی | محدود به داده‌های مجاز سیستم/اپ | محدود به اپ و Telemetry مجاز |

\| Network Monitor | رابط، نرخ، اتصال و per-process | سطح اپ/شبکه و داده مجاز API | سطح اپ و Network Diagnostics مجاز |

\| Camera/Mic/Speaker | با رضایت و Indicator | Foreground \\+ Runtime Permission | Explicit Authorization \\+ Foreground/User action |

\| Unattended Access | فقط دستگاه سازمانی مدیریت‌شده | فقط سناریوی Enterprise/Device Owner | پشتیبانی نمی‌شود |

\| فناوری UI | Agent بومی .NET | Flutter \\+ Kotlin Native Module | Flutter \\+ Swift/Extension |

\| نتیجه معماری: Flutter پوسته و تجربه مشترک موبایل را می‌دهد، اما دسترسی‌های سطح سیستم با Pluginهای بومی و Pigeon/Platform Channels پیاده می‌شوند. وعده Feature Parity کامل میان Android و iOS ممنوع است. |

\| :---- |

**#** 

\| ترتیب | اقدام |

\| :---- | :---- |

\| گام 1 | Client وب/ویندوز/موبایل درخواست Session را به Monitoring API می‌فرستد. |

\| گام 2 | Authorization Engine Grant، Scope، Device Policy و Consent Mode را بررسی می‌کند. |

\| گام 3 | Session Broker توکن کوتاه‌عمر و Signaling را ایجاد می‌کند. |

\| گام 4 | Endpoint با mTLS/Device Key متصل و User Notice را نمایش می‌دهد. |

\| گام 5 | Media/Data ترجیحاً P2P و در صورت شکست از TURN/Relay عبور می‌کند. |

\| گام 6 | Audit Service رویدادهای Session و اقدام‌های حساس را ثبت می‌کند. |

\| Component | مسئولیت | فناوری پیشنهادی |

\| :---- | :---- | :---- |

\| Client Shells | ERP/CRM Workspace و UI مانیتورینگ | Next.js، .NET، Flutter \\+ shared API contracts |

\| Monitoring API | Policy، Session، Audit، Device | NestJS \\+ PostgreSQL \\+ Redis |

\| Session Broker | Signaling، Token، Presence | WebSocket/Socket.IO \\+ Redis |

\| Relay/TURN | عبور رسانه و NAT | coturn یا Relay Self-hosted ارزیابی‌شده |

\| Windows Agent | Capture، Process، Network، Input، Audio | .NET 8/C\\# Windows Service \\+ User App |

\| Mobile Apps | ERP/CRM Workspace، Controller و Endpoint | Flutter \\+ Kotlin/Swift Modules |

\| Storage | Screenshot/Recording Metadata و Object | PostgreSQL \\+ S3-compatible |

**#** 

monitoring\\\_profiles: تنظیمات کیفیت، Retention، ساعات و Consent.

monitor\\\_grants: operator\\\_user\\\_id، subject\\\_type/id، capabilities، consent\\\_mode، starts\\\_at، expires\\\_at.

devices: platform، ownership، enrollment، health، last\\\_seen، agent\\\_version.

remote\\\_sessions: operator، subject، device، mode، status، started/ended، reason، ticket.

session\\\_events: consent، connect، disconnect، input، process action، media permission.

process\\\_snapshots و network\\\_snapshots: نمونه‌های زمان‌دار با Retention کوتاه‌تر.

screenshot\\\_objects: object\\\_key، dimensions، format، quality، pHash، blur\\\_profile.

**#** 

پلتفرم باید نصب، فعال‌سازی، غیرفعال‌سازی، ارتقا و حذف افزونه را در سطح Tenant فراهم کند. افزونه‌ها از طریق Manifest نسخه‌دار، Scopeهای صریح، امضای بسته و Sandbox به Core متصل می‌شوند و می‌توانند صفحه، ویجت، اکشن، Automation، Connector و Event Handler ثبت کنند؛ دسترسی مستقیم به دیتابیس یا Media خام ممنوع است.

\| جزء | الزام کلیدی | کنترل |

\| :---- | :---- | :---- |

\| Plugin Catalog | فهرست Private/Public، نسخه، Vendor، Compatibility | Super Admin approval و Allowlist |

\| Installer | Dependency check، Migration محدود، Rollback اتمیک | Signed package، checksum، staged rollout |

\| Extension SDK | UI slot، action، workflow step، connector | Schema version و Capability Scope |

\| Public API | REST/GraphQL نسخه‌دار، pagination، idempotency | OAuth2/OIDC، service account، rate limit |

\| Webhook | Subscription، filter، retry، replay، delivery log | HMAC signature، timestamp، secret rotation، DLQ |

\| Developer Portal | App registration، key rotation، docs، test tenant | Audit، quota و approval lifecycle |

رویدادهای ERP/CRM و مانیتورینگ از Event Catalog مشترک منتشر شوند؛ داده حساس فقط با Scope و Redaction.

Webhook با شناسه یکتا، ترتیب best-effort، Retry نمایی و امکان Replay کنترل‌شده طراحی شود.

افزونه بتواند در وب، ویندوز و Flutter Extension Point سازگار داشته باشد؛ نبود UI بومی با WebView کنترل‌شده یا Action-only اعلام شود.

Uninstall باید Subscription، Token، Job و داده افزونه را با سیاست Export/Retention مدیریت کند.

**#** 

Capture سمت Endpoint و اعمال Blur/Redaction پیش از خروج داده؛ ناحیه‌های حساس و اپ‌های ممنوع قابل‌تعریف باشند.

Adaptive Resize بر اساس عرض هدف، DPI و پهنای باند؛ کیفیت پیش‌فرض ۷۰ و بازه قابل‌تنظیم ۴۰ تا ۹۰.

فرمت WebP برای تصویر ثابت در صورت سازگاری، JPEG به‌عنوان Fallback و PNG فقط برای نیاز بدون اتلاف.

تشخیص Frame بدون تغییر با Perceptual Hash و حذف Upload تکراری؛ امکان Trigger بر اساس تغییر پنجره فعال.

Batch Upload با Presigned URL، رمزنگاری در انتقال/ذخیره، Retry محدود و سقف Queue محلی.

تنظیمات Policy: دوره ۳۰ ثانیه تا ۳۰ دقیقه، Capture هنگام Active، توقف روی Battery/Cellular، Max Dimension، Max KB، Retention و Watermark.

برای Remote Stream از Video Codec تطبیقی مانند H.264/VP9/AV1 و Dynamic Bitrate استفاده شود؛ Screenshot History از Remote Video جدا بماند.

\| تنظیم | پیش‌فرض پیشنهادی | دامنه/قاعده |

\| :---- | :---- | :---- |

\| Interval | ۵ دقیقه | ۳۰ ثانیه تا ۳۰ دقیقه؛ Tenant Policy |

\| Quality | ۷۰ | ۴۰ تا ۹۰؛ Adaptive |

\| Max Width | ۱۶۰۰ px | ۹۶۰ تا ۲۵۶۰ |

\| Unchanged Skip | فعال | pHash Threshold قابل‌تنظیم |

\| Local Blur | فعال | پیش از Upload؛ قابل خاموشی فقط با مجوز ویژه |

\| Retention | ۳۰ روز | ۱ تا ۳۶۵ روز؛ Purge خودکار و Legal Hold جدا |

**#** 

Attended Session پیش‌فرض باشد و کاربر مقصد نوع دسترسی، نام Operator و Reason را ببیند و بتواند رد یا قطع کند.

Unattended فقط برای Device سازمانی Enrolled، با تأیید دو مرحله‌ای، Policy مجزا و Kill Switch سراسری فعال شود.

Remote Input، Process Kill، File Transfer، Camera، Microphone و Speaker Scopeهای جدا و قابل لغو باشند.

هر Session با Correlation ID، Operator، Subject، Device، IP، Capability، Consent، زمان و نتیجه ثبت شود.

ویدئو/صوت Session به‌طور پیش‌فرض ضبط نشود؛ ضبط نیازمند Policy، Notice، Retention و دسترسی محدود است.

Relay ترجیحاً Self-hosted و داده با رمزنگاری سرتاسری یا معادل طراحی شود؛ TURN Credential کوتاه‌عمر باشد.

پنهان‌سازی Agent، دورزدن Indicator، ضبط مخفیانه و جمع‌آوری محتوای Keystroke ممنوع است.

**#** 

\| فاز | دامنه | معیار خروج |

\| :---- | :---- | :---- |

\| ۰ \\- Foundation | Core API، Client Shell، Grant، Device، Audit، Plugin SDK | Tenant Isolation و قراردادهای Client/API تست‌شده |

\| ۱ \\- Windows Workspace | ERP/CRM UI، Telemetry، Screenshot، Process/Network، Chat | Pilot با ۲ مشتری و Crash کمتر از ۰٫۵٪ |

\| ۲ \\- Windows Remote | Live View، Input، Audio، Relay، Consent | Latency و Recovery در شبکه واقعی تأیید |

\| ۳ \\- Android | Flutter، MediaProjection، Chat/Audio، View؛ Control مشروط | Policy Review و Device Matrix |

\| ۴ \\- iOS | Flutter، ReplayKit View، Chat/Audio/Camera؛ بدون Full Control | App Review Feasibility و UX Consent |

\| ۵ \\- Ecosystem/Scale | Plugin Catalog، Public API، Webhook، Alerts، Regional Relay | SLO، Security Review و Capacity Plan |

**#** 

دامنه ERP/CRM شامل سازمان و کاربران، پروژه و تسک، تایم‌لاگ، فرم‌ساز، دبیرخانه و قرارداد، تیکت، CRM و فروش، خرید و انبار، مالی پروژه، HR و حقوق پایه، تولید و زنجیره تأمین مرحله‌ای، چت، گزارش، BI و AI Assistant در Clientهای اصلی ارائه می‌شود. مانیتورینگ از طریق User/Device/Project به این ماژول‌ها متصل است و مجوز مستقل دارد.

**#** 

هیچ Operator بدون Grant معتبر Session آغاز نکند.

وب، ویندوز و موبایل از یک Permission/Feature Catalog مشترک استفاده کنند.

تغییر Grant کمتر از ۶۰ ثانیه روی Session جدید اثر کند و Session جاری قابل لغو باشد.

Windows Process/Network/Screenshot و Remote در شبکه قطع‌شونده بازیابی شوند.

Android/iOS وعده‌ها با ماتریس Capability و محدودیت Store منطبق باشند.

نصب/ارتقای افزونه Rollback و Audit داشته باشد؛ API/Webhook تست قرارداد و امنیت را پاس کنند.

Purge Screenshot و Session Metadata طبق Retention قابل اثبات باشد.

**#** 

ارجاعات رسمی Android، iOS، Flutter و RustDesk در بریف‌های پلتفرمی و معماری مشترک نگهداری می‌شوند.
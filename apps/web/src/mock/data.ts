import type {
  Activity,
  Customer,
  Device,
  MonitoringSession,
  NotificationItem,
  Organization,
  Project,
  ScreenshotPreview,
  Task,
  Ticket,
  User,
  Lead,
  Product,
  Proposal,
  Invoice,
  Payment,
  Contract,
  Installment,
} from '../types';

export const currentUser: User = {
  id: 'u1',
  name: 'سارا محمدی',
  email: 'sara.mohammadi@trileez.ir',
  role: 'admin',
  status: 'online',
  title: 'مدیر عملیات',
};

export const organizations: Organization[] = [
  { id: 'org1', name: 'شرکت نوآوران پارس', slug: 'noavaran-pars' },
  { id: 'org2', name: 'گروه فناوری آریا', slug: 'arya-tech' },
];

export const users: User[] = [
  currentUser,
  { id: 'u2', name: 'علی رضایی', email: 'ali.rezaei@trileez.ir', role: 'manager', status: 'online', title: 'مدیر پروژه' },
  { id: 'u3', name: 'مریم حسینی', email: 'maryam.hosseini@trileez.ir', role: 'member', status: 'away', title: 'طراح محصول' },
  { id: 'u4', name: 'حسین کریمی', email: 'hossein.karimi@trileez.ir', role: 'member', status: 'online', title: 'توسعه‌دهنده' },
  { id: 'u5', name: 'فاطمه نوری', email: 'fatemeh.nouri@trileez.ir', role: 'member', status: 'offline', title: 'پشتیبانی مشتریان' },
  { id: 'u6', name: 'رضا عباسی', email: 'reza.abbasi@trileez.ir', role: 'manager', status: 'online', title: 'سرپرست مانیتورینگ' },
  { id: 'u7', name: 'نگار صالحی', email: 'negar.salehi@trileez.ir', role: 'member', status: 'away', title: 'کارشناس فروش' },
  { id: 'u8', name: 'امیر جعفری', email: 'amir.jafari@trileez.ir', role: 'member', status: 'online', title: 'مهندس زیرساخت' },
];

export const projects: Project[] = [
  {
    id: 'p1',
    name: 'پروژه توسعه سامانه فروش',
    description: 'بازطراحی قیف فروش، سفارش‌گیری و گزارش‌های تجاری برای تیم فروش سازمانی.',
    status: 'active',
    progress: 68,
    startDate: '2026-03-12',
    endDate: '2026-09-30',
    members: ['u1', 'u2', 'u4', 'u7'],
    tasksCount: 18,
    completedTasksCount: 12,
    color: '#1E3A8A',
  },
  {
    id: 'p2',
    name: 'پیاده‌سازی زیرساخت سازمان',
    description: 'راه‌اندازی Agent ویندوز، ثبت دستگاه‌ها و یکپارچه‌سازی مانیتورینگ با هسته تری‌لیز.',
    status: 'active',
    progress: 42,
    startDate: '2026-04-01',
    endDate: '2026-10-15',
    members: ['u6', 'u8', 'u4'],
    tasksCount: 14,
    completedTasksCount: 6,
    color: '#059669',
  },
  {
    id: 'p3',
    name: 'پروژه پشتیبانی مشتریان',
    description: 'ساماندهی تیکت‌ها، پایگاه دانش و SLA پشتیبانی برای مشتریان کلیدی.',
    status: 'active',
    progress: 81,
    startDate: '2026-02-20',
    endDate: '2026-08-31',
    members: ['u5', 'u7', 'u3'],
    tasksCount: 11,
    completedTasksCount: 9,
    color: '#D97706',
  },
  {
    id: 'p4',
    name: 'توسعه نسخه جدید محصول',
    description: 'نسخه ۲ تری‌لیز با بهبود تجربه بورد کارها و داشبورد مدیریتی فارسی.',
    status: 'on_hold',
    progress: 24,
    startDate: '2026-06-01',
    endDate: '2026-12-01',
    members: ['u1', 'u3', 'u4'],
    tasksCount: 9,
    completedTasksCount: 2,
    color: '#7C3AED',
  },
  {
    id: 'p5',
    name: 'بهبود تجربه کاربری پورتال',
    description: 'بازبینی مسیرهای اصلی پورتال مشتریان و کاهش اصطکاک ثبت درخواست.',
    status: 'completed',
    progress: 100,
    startDate: '2025-11-10',
    endDate: '2026-03-01',
    members: ['u3', 'u2'],
    tasksCount: 8,
    completedTasksCount: 8,
    color: '#0891B2',
  },
];

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(now - d * 86400_000).toISOString();
const daysFromNow = (d: number) => new Date(now + d * 86400_000).toISOString();

export const tasks: Task[] = [
  { id: 't1', title: 'طراحی قیف فروش جدید', description: 'نقشه جریان سرنخ تا قرارداد', status: 'in_progress', priority: 'high', assigneeId: 'u3', projectId: 'p1', dueDate: daysFromNow(1), createdAt: daysAgo(10), updatedAt: hoursAgo(3), tags: ['طراحی', 'فروش'] },
  { id: 't2', title: 'پیاده‌سازی گزارش کمیسیون', status: 'todo', priority: 'medium', assigneeId: 'u4', projectId: 'p1', dueDate: daysFromNow(5), createdAt: daysAgo(8), updatedAt: daysAgo(1), tags: ['گزارش'] },
  { id: 't3', title: 'اتصال درگاه پیامک', status: 'review', priority: 'high', assigneeId: 'u4', projectId: 'p1', dueDate: daysFromNow(0), createdAt: daysAgo(12), updatedAt: hoursAgo(8), tags: ['یکپارچه‌سازی'] },
  { id: 't4', title: 'آموزش تیم فروش', status: 'done', priority: 'low', assigneeId: 'u7', projectId: 'p1', dueDate: daysAgo(2), createdAt: daysAgo(20), updatedAt: daysAgo(2), tags: ['آموزش'] },
  { id: 't5', title: 'ثبت الگوی Agent ویندوز', status: 'in_progress', priority: 'urgent', assigneeId: 'u8', projectId: 'p2', dueDate: daysFromNow(-1), createdAt: daysAgo(6), updatedAt: hoursAgo(1), tags: ['مانیتورینگ'] },
  { id: 't6', title: 'تعریف Grant نمونه', status: 'todo', priority: 'high', assigneeId: 'u6', projectId: 'p2', dueDate: daysFromNow(2), createdAt: daysAgo(4), updatedAt: daysAgo(1), tags: ['مجوز'] },
  { id: 't7', title: 'تست ضربان دستگاه', status: 'review', priority: 'medium', assigneeId: 'u8', projectId: 'p2', dueDate: daysFromNow(3), createdAt: daysAgo(5), updatedAt: hoursAgo(12), tags: ['دستگاه'] },
  { id: 't8', title: 'مستند رضایت جلسه', status: 'todo', priority: 'medium', assigneeId: 'u1', projectId: 'p2', dueDate: daysFromNow(4), createdAt: daysAgo(3), updatedAt: daysAgo(3), tags: ['رضایت'] },
  { id: 't9', title: 'بازبینی SLA تیکت طلایی', status: 'in_progress', priority: 'high', assigneeId: 'u5', projectId: 'p3', dueDate: daysFromNow(0), createdAt: daysAgo(7), updatedAt: hoursAgo(5), tags: ['پشتیبانی'] },
  { id: 't10', title: 'پاسخ تیکت شرکت سپهر', status: 'done', priority: 'urgent', assigneeId: 'u5', projectId: 'p3', dueDate: daysAgo(1), createdAt: daysAgo(2), updatedAt: hoursAgo(20), tags: ['تیکت'] },
  { id: 't11', title: 'بروزرسانی پایگاه دانش', status: 'todo', priority: 'low', assigneeId: 'u3', projectId: 'p3', dueDate: daysFromNow(8), createdAt: daysAgo(9), updatedAt: daysAgo(4), tags: ['مستندات'] },
  { id: 't12', title: 'طراحی بورد نسخه ۲', status: 'todo', priority: 'high', assigneeId: 'u3', projectId: 'p4', dueDate: daysFromNow(10), createdAt: daysAgo(15), updatedAt: daysAgo(6), tags: ['محصول'] },
  { id: 't13', title: 'نمونه اولیه تقویم شمسی', status: 'in_progress', priority: 'medium', assigneeId: 'u4', projectId: 'p4', dueDate: daysFromNow(-2), createdAt: daysAgo(11), updatedAt: hoursAgo(30), tags: ['تقویم'] },
  { id: 't14', title: 'جمع‌بندی بازخورد بتا', status: 'review', priority: 'medium', assigneeId: 'u2', projectId: 'p4', dueDate: daysFromNow(6), createdAt: daysAgo(14), updatedAt: hoursAgo(16), tags: ['بازخورد'] },
  { id: 't15', title: 'آزمون دسترسی‌پذیری RTL', status: 'done', priority: 'low', assigneeId: 'u3', projectId: 'p5', dueDate: daysAgo(40), createdAt: daysAgo(70), updatedAt: daysAgo(40), tags: ['UX'] },
  { id: 't16', title: 'هماهنگی با حسابداری سپهر', status: 'todo', priority: 'medium', assigneeId: 'u7', projectId: 'p1', dueDate: daysFromNow(1), createdAt: daysAgo(1), updatedAt: hoursAgo(6), tags: ['مشتری'] },
  { id: 't17', title: 'بررسی سلامت Agent شعبه اصفهان', status: 'in_progress', priority: 'urgent', assigneeId: 'u6', projectId: 'p2', dueDate: daysFromNow(0), createdAt: hoursAgo(10), updatedAt: hoursAgo(2), tags: ['سلامت'] },
  { id: 't18', title: 'تهیه گزارش هفتگی مدیریت', status: 'todo', priority: 'high', assigneeId: 'u2', projectId: 'p1', dueDate: daysFromNow(2), createdAt: daysAgo(2), updatedAt: hoursAgo(9), tags: ['گزارش'] },
  { id: 't19', title: 'بستن تیکت شبکه شعب', status: 'review', priority: 'high', assigneeId: 'u5', projectId: 'p3', dueDate: daysFromNow(-1), createdAt: daysAgo(3), updatedAt: hoursAgo(4), tags: ['شبکه'] },
  { id: 't20', title: 'آماده‌سازی دمو برای هیئت‌مدیره', status: 'in_progress', priority: 'urgent', assigneeId: 'u1', projectId: 'p1', dueDate: daysFromNow(1), createdAt: daysAgo(4), updatedAt: hoursAgo(1), tags: ['دمو'] },
  { id: 't21', title: 'پیکربندی اعلان نشست مانیتورینگ', status: 'todo', priority: 'medium', assigneeId: 'u6', projectId: 'p2', dueDate: daysFromNow(7), createdAt: daysAgo(1), updatedAt: daysAgo(1), tags: ['اعلان'] },
  { id: 't22', title: 'بازبینی کارت‌های داشبورد', status: 'done', priority: 'low', assigneeId: 'u3', projectId: 'p5', dueDate: daysAgo(50), createdAt: daysAgo(80), updatedAt: daysAgo(48), tags: ['داشبورد'] },
];

export const customers: Customer[] = [
  { id: 'c1', name: 'مهندس کامران شریفی', company: 'صنایع سپهر ایرانیان', email: 'sharifi@sepehr.co', phone: '۰۲۱-۴۴۵۵۶۶۷۷', status: 'active', value: 860_000_000, lastContact: hoursAgo(18), assignedTo: 'u7' },
  { id: 'c2', name: 'خانم لیلا توکلی', company: 'داروسازی نیکان', email: 'tavakoli@nikan.ir', phone: '۰۲۱-۸۸۷۷۶۶۵۵', status: 'active', value: 420_000_000, lastContact: daysAgo(2), assignedTo: 'u7' },
  { id: 'c3', name: 'آقای بهرام یوسفی', company: 'لجستیک آریابرگ', email: 'yousefi@aryabarg.com', phone: '۰۳۱-۳۲۲۲۱۱۰۰', status: 'lead', value: 150_000_000, lastContact: daysAgo(5), assignedTo: 'u2' },
  { id: 'c4', name: 'دکتر ناهید امینی', company: 'کلینیک هوشمند زندگی', email: 'amini@zendegi.clinic', phone: '۰۲۱-۲۲۰۰۱۱۲۲', status: 'active', value: 275_000_000, lastContact: hoursAgo(40), assignedTo: 'u5' },
  { id: 'c5', name: 'مهندس جواد مرادی', company: 'پتروشیمی فارس جنوب', email: 'moradi@fars-south.ir', phone: '۰۷۱-۳۳۴۴۵۵۶۶', status: 'inactive', value: 980_000_000, lastContact: daysAgo(21), assignedTo: 'u2' },
  { id: 'c6', name: 'خانم شیدا کاظمی', company: 'آموزشگاه ابرآسا', email: 'kazemi@abrasa.ir', phone: '۰۲۱-۶۶۵۵۴۴۳۳', status: 'lead', value: 95_000_000, lastContact: daysAgo(1), assignedTo: 'u7' },
  { id: 'c7', name: 'آقای پیمان رستمی', company: 'بانک توسعه تعاون شعبه مرکزی', email: 'rostami@ttbank.ir', phone: '۰۲۱-۸۸۸۸۰۰۰۰', status: 'active', value: 1_240_000_000, lastContact: hoursAgo(6), assignedTo: 'u1' },
];

export const tickets: Ticket[] = [
  { id: 'tk1', title: 'عدم همگام‌سازی کارهای شعبه اصفهان', description: 'کارهای اختصاص‌داده‌شده پس از نیمه‌شب نمایش داده نمی‌شوند.', status: 'open', priority: 'high', category: 'bug', assigneeId: 'u4', reporterId: 'u5', createdAt: hoursAgo(5), updatedAt: hoursAgo(1), tags: ['همگام‌سازی'] },
  { id: 'tk2', title: 'درخواست گزارش حضور دستگاه‌ها', description: 'مدیریت شعب گزارش روزانه آنلاین/آفلاین می‌خواهد.', status: 'in_progress', priority: 'medium', category: 'feature', assigneeId: 'u6', reporterId: 'u2', createdAt: daysAgo(1), updatedAt: hoursAgo(3), tags: ['گزارش'] },
  { id: 'tk3', title: 'قطع اتصال Agent لپ‌تاپ فروش', description: 'دستگاه پس از به‌روزرسانی ویندوز ضربان ارسال نمی‌کند.', status: 'waiting', priority: 'urgent', category: 'support', assigneeId: 'u8', reporterId: 'u7', createdAt: hoursAgo(9), updatedAt: hoursAgo(2), tags: ['Agent'] },
  { id: 'tk4', title: 'افزودن فیلتر مشتری در بورد', description: 'امکان فیلتر کارها بر اساس مشتری مرتبط.', status: 'open', priority: 'low', category: 'feature', assigneeId: 'u3', reporterId: 'u7', createdAt: daysAgo(3), updatedAt: daysAgo(1), tags: ['بورد'] },
  { id: 'tk5', title: 'خطای ذخیره‌سازی تیکت پیوست‌دار', description: 'آپلود فایل بیش از ۵ مگابایت با خطا مواجه می‌شود.', status: 'closed', priority: 'medium', category: 'bug', assigneeId: 'u4', reporterId: 'u5', createdAt: daysAgo(8), updatedAt: daysAgo(2), tags: ['پیوست'] },
  { id: 'tk6', title: 'درخواست آموزش مانیتورینگ برای سرپرستان', description: 'جلسه آموزشی رضایت و قطع نشست برای سرپرستان شیفت.', status: 'in_progress', priority: 'high', category: 'support', assigneeId: 'u6', reporterId: 'u1', createdAt: daysAgo(2), updatedAt: hoursAgo(7), tags: ['آموزش'] },
];

export const devices: Device[] = [
  { id: 'd1', name: 'لپ‌تاپ-سارا-۰۱', userId: 'u1', userName: 'سارا محمدی', os: 'Windows', osVersion: '۱۱ پرو', agentVersion: '۰.۳.۱', status: 'online', lastSeen: hoursAgo(0.05), ipAddress: '۱۰.۱۲.۱.۲۱', location: 'تهران، دفتر مرکزی', health: 96 },
  { id: 'd2', name: 'دسکتاپ-علی-فروش', userId: 'u2', userName: 'علی رضایی', os: 'Windows', osVersion: '۱۱', agentVersion: '۰.۳.۱', status: 'online', lastSeen: hoursAgo(0.1), ipAddress: '۱۰.۱۲.۱.۳۴', location: 'تهران، طبقه فروش', health: 91 },
  { id: 'd3', name: 'لپ‌تاپ-مریم-طراحی', userId: 'u3', userName: 'مریم حسینی', os: 'Windows', osVersion: '۱۰', agentVersion: '۰.۲.۹', status: 'busy', lastSeen: hoursAgo(0.2), ipAddress: '۱۰.۱۲.۲.۸', location: 'تهران، واحد محصول', health: 88 },
  { id: 'd4', name: 'ورک‌استیشن-حسین', userId: 'u4', userName: 'حسین کریمی', os: 'Windows', osVersion: '۱۱ پرو', agentVersion: '۰.۳.۱', status: 'online', lastSeen: hoursAgo(0.08), ipAddress: '۱۰.۱۲.۲.۱۵', location: 'تهران، واحد فنی', health: 94 },
  { id: 'd5', name: 'لپ‌تاپ-فاطمه-پشتیبانی', userId: 'u5', userName: 'فاطمه نوری', os: 'Windows', osVersion: '۱۱', agentVersion: '۰.۳.۰', status: 'offline', lastSeen: hoursAgo(14), ipAddress: '۱۰.۱۸.۴.۹', location: 'اصفهان، شعبه', health: 62 },
  { id: 'd6', name: 'سرور-مانیتورینگ-۰۱', userId: 'u6', userName: 'رضا عباسی', os: 'Windows Server', osVersion: '۲۰۲۲', agentVersion: '۰.۳.۱', status: 'online', lastSeen: hoursAgo(0.02), ipAddress: '۱۰.۱۲.۰.۱۰', location: 'تهران، رک مرکزی', health: 99 },
  { id: 'd7', name: 'لپ‌تاپ-نگار-فروش', userId: 'u7', userName: 'نگار صالحی', os: 'Windows', osVersion: '۱۱', agentVersion: '۰.۳.۱', status: 'offline', lastSeen: hoursAgo(2), ipAddress: '۱۰.۱۲.۱.۵۲', location: 'تهران، طبقه فروش', health: 85 },
  { id: 'd8', name: 'لپ‌تاپ-امیر-زیرساخت', userId: 'u8', userName: 'امیر جعفری', os: 'Windows', osVersion: '۱۱ پرو', agentVersion: '۰.۳.۱', status: 'online', lastSeen: hoursAgo(0.3), ipAddress: '۱۰.۱۲.۰.۲۲', location: 'تهران، واحد زیرساخت', health: 93 },
];


export const sessions: MonitoringSession[] = [
  { id: 's1', deviceId: 'd3', operatorId: 'u6', operatorName: 'رضا عباسی', status: 'active', capabilities: ['صفحه', 'وضعیت دستگاه'], consentMode: 'attended', startedAt: hoursAgo(0.4), duration: 24 },
  { id: 's2', deviceId: 'd5', operatorId: 'u6', operatorName: 'رضا عباسی', status: 'pending', capabilities: ['صفحه', 'ضربان'], consentMode: 'attended' },
  { id: 's3', deviceId: 'd2', operatorId: 'u1', operatorName: 'سارا محمدی', status: 'ended', capabilities: ['صفحه'], consentMode: 'attended', startedAt: hoursAgo(6), endedAt: hoursAgo(5.5), duration: 18 },
  { id: 's4', deviceId: 'd8', operatorId: 'u6', operatorName: 'رضا عباسی', status: 'rejected', capabilities: ['صفحه'], consentMode: 'attended', startedAt: daysAgo(1) },
];

export const screenshots: ScreenshotPreview[] = [
  { id: 'sc1', deviceId: 'd1', deviceName: 'لپ‌تاپ-سارا-۰۱', capturedAt: hoursAgo(0.2), label: 'داشبورد فروش', tone: 'blue' },
  { id: 'sc2', deviceId: 'd3', deviceName: 'لپ‌تاپ-مریم-طراحی', capturedAt: hoursAgo(0.35), label: 'بورد نسخه ۲', tone: 'emerald' },
  { id: 'sc3', deviceId: 'd4', deviceName: 'ورک‌استیشن-حسین', capturedAt: hoursAgo(1), label: 'محیط توسعه', tone: 'slate' },
  { id: 'sc4', deviceId: 'd6', deviceName: 'سرور-مانیتورینگ-۰۱', capturedAt: hoursAgo(0.1), label: 'کنسول سلامت', tone: 'amber' },
];

export const activities: Activity[] = [
  { id: 'a1', type: 'session_started', userId: 'u6', userName: 'رضا عباسی', entityType: 'session', entityId: 's1', entityName: 'نشست مریم حسینی', description: 'نشست مانیتورینگ با رضایت کارمند آغاز شد.', createdAt: hoursAgo(0.4) },
  { id: 'a2', type: 'task_updated', userId: 'u8', userName: 'امیر جعفری', entityType: 'task', entityId: 't5', entityName: 'ثبت الگوی Agent ویندوز', description: 'وضعیت کار به «در حال انجام» تغییر کرد.', createdAt: hoursAgo(1) },
  { id: 'a3', type: 'ticket_created', userId: 'u5', userName: 'فاطمه نوری', entityType: 'ticket', entityId: 'tk1', entityName: 'عدم همگام‌سازی کارهای شعبه اصفهان', description: 'تیکت پشتیبانی جدید ثبت شد.', createdAt: hoursAgo(5) },
  { id: 'a4', type: 'device_offline', userId: 'u5', userName: 'فاطمه نوری', entityType: 'device', entityId: 'd5', entityName: 'لپ‌تاپ-فاطمه-پشتیبانی', description: 'دستگاه شعبه اصفهان از دسترس خارج شد.', createdAt: hoursAgo(14) },
  { id: 'a5', type: 'task_completed', userId: 'u5', userName: 'فاطمه نوری', entityType: 'task', entityId: 't10', entityName: 'پاسخ تیکت شرکت سپهر', description: 'کار پشتیبانی مشتریان تکمیل شد.', createdAt: hoursAgo(20) },
  { id: 'a6', type: 'project_created', userId: 'u1', userName: 'سارا محمدی', entityType: 'project', entityId: 'p4', entityName: 'توسعه نسخه جدید محصول', description: 'پروژه جدید در فضای کاری ایجاد شد.', createdAt: daysAgo(15) },
  { id: 'a7', type: 'session_ended', userId: 'u1', userName: 'سارا محمدی', entityType: 'session', entityId: 's3', entityName: 'نشست علی رضایی', description: 'نشست مانیتورینگ با درخواست کارمند پایان یافت.', createdAt: hoursAgo(5.5) },
  { id: 'a8', type: 'device_online', userId: 'u4', userName: 'حسین کریمی', entityType: 'device', entityId: 'd4', entityName: 'ورک‌استیشن-حسین', description: 'دستگاه به هسته متصل شد.', createdAt: hoursAgo(8) },
];

export const notifications: NotificationItem[] = [
  { id: 'n1', title: 'درخواست رضایت مانیتورینگ', body: 'فاطمه نوری هنوز به نشست شعبه اصفهان پاسخ نداده است.', createdAt: hoursAgo(0.5), read: false },
  { id: 'n2', title: 'کار عقب‌افتاده', body: 'نمونه اولیه تقویم شمسی از موعد گذشته است.', createdAt: hoursAgo(2), read: false },
  { id: 'n3', title: 'تیکت فوری', body: 'قطع اتصال Agent لپ‌تاپ فروش در انتظار اقدام است.', createdAt: hoursAgo(9), read: true },
];

export const weeklyTaskSeries = [
  { name: 'شنبه', completed: 6, created: 4 },
  { name: 'یکشنبه', completed: 8, created: 7 },
  { name: 'دوشنبه', completed: 5, created: 6 },
  { name: 'سه‌شنبه', completed: 9, created: 5 },
  { name: 'چهارشنبه', completed: 7, created: 8 },
  { name: 'پنجشنبه', completed: 4, created: 3 },
  { name: 'جمعه', completed: 2, created: 1 },
];

export const ticketCategorySeries = [
  { name: 'پشتیبانی', value: 38 },
  { name: 'خطا', value: 24 },
  { name: 'قابلیت', value: 21 },
  { name: 'سایر', value: 17 },
];

// Sales and finance records intentionally share customer/contract identifiers so detail views
// can present a believable end-to-end workflow without a backend.
export const leads: Lead[] = [
  { id: 'l1', name: 'فرهاد نادری', company: 'شرکت پارس وود', email: 'naderi@parswood.ir', phone: '۰۲۱-۴۴۱۲۳۳۴۴', estimatedValue: 680_000_000, tags: ['سازمانی', 'گرم'], assignedTo: 'u7', status: 'qualified', source: 'معرفی مشتری', lastContactAt: hoursAgo(8), nextFollowUpAt: daysFromNow(2), notes: 'جلسه دمو برای تیم مالی برگزار شد.', createdAt: daysAgo(16) },
  { id: 'l2', name: 'الهام کمالی', company: 'پخش نوین شرق', email: 'kamali@novinshargh.ir', phone: '۰۵۱-۳۷۲۲۱۰۰۱', estimatedValue: 240_000_000, tags: ['پیگیری'], assignedTo: 'u2', status: 'contacted', source: 'وب‌سایت', lastContactAt: daysAgo(3), nextFollowUpAt: daysFromNow(1), notes: 'در انتظار اطلاعات تعداد کاربران.', createdAt: daysAgo(11) },
  { id: 'l3', name: 'سامان اکبری', company: 'راهکاران سبز', email: 'akbari@rahkaransabz.com', phone: '۰۲۱-۲۲۳۳۹۹۰۰', estimatedValue: 1_100_000_000, tags: ['استراتژیک'], assignedTo: 'u1', status: 'new', source: 'نمایشگاه', lastContactAt: daysAgo(1), nextFollowUpAt: daysFromNow(4), notes: 'درخواست پیشنهاد برای ۱۲۰ کاربر.', createdAt: daysAgo(2) },
  { id: 'l4', name: 'مهدی رستگار', company: 'آتیه سازان', email: 'rastgar@atiehsazan.ir', phone: '۰۲۱-۸۸۲۲۱۱۴۴', estimatedValue: 95_000_000, tags: ['کوچک'], assignedTo: 'u7', status: 'converted', source: 'ارجاع', lastContactAt: daysAgo(9), nextFollowUpAt: daysFromNow(10), notes: 'به مشتری صنایع سپهر تبدیل شد.', createdAt: daysAgo(40) },
];

export const products: Product[] = [
  { id: 'pr1', name: 'اشتراک سازمانی تری‌لیز', sku: 'TRI-ENT-12', category: 'اشتراک نرم‌افزار', unit: 'کاربر/ماه', price: 2_400_000, stock: 980, active: true },
  { id: 'pr2', name: 'راه‌اندازی و استقرار', sku: 'TRI-SETUP', category: 'خدمات حرفه‌ای', unit: 'پروژه', price: 180_000_000, stock: 0, active: true },
  { id: 'pr3', name: 'آموزش تیم و مدیران', sku: 'TRI-TRAIN', category: 'خدمات حرفه‌ای', unit: 'جلسه', price: 28_000_000, stock: 0, active: true },
  { id: 'pr4', name: 'پشتیبانی طلایی', sku: 'TRI-SUP-G', category: 'پشتیبانی', unit: 'ماه', price: 45_000_000, stock: 12, active: true },
  { id: 'pr5', name: 'افزونه پایش دستگاه', sku: 'TRI-MON-01', category: 'افزونه', unit: 'دستگاه/ماه', price: 650_000, stock: 420, active: true },
];

export const proposals: Proposal[] = [
  { id: 'q1', number: 'پیشنهاد-۱۴۰۵-۰۱۸', customerId: 'c1', title: 'استقرار CRM و مانیتورینگ شعب', amount: 860_000_000, status: 'approved', issuedAt: daysAgo(18), validUntil: daysFromNow(12), ownerId: 'u7' },
  { id: 'q2', number: 'پیشنهاد-۱۴۰۵-۰۱۹', customerId: 'c2', title: 'اشتراک سازمانی تیم فروش', amount: 420_000_000, status: 'sent', issuedAt: daysAgo(5), validUntil: daysFromNow(25), ownerId: 'u7' },
  { id: 'q3', number: 'پیشنهاد-۱۴۰۵-۰۲۰', customerId: 'c7', title: 'پایش ۸۰ دستگاه و گزارش مدیریتی', amount: 1_240_000_000, status: 'draft', issuedAt: daysAgo(1), validUntil: daysFromNow(29), ownerId: 'u1' },
];

export const contracts: Contract[] = [
  { id: 'ct1', number: 'قرارداد-۱۴۰۵-۰۲۱', customerId: 'c1', title: 'قرارداد خدمات سازمانی سپهر', amount: 860_000_000, startDate: '2026-02-01', endDate: '2027-01-31', status: 'active', renewal: true },
  { id: 'ct2', number: 'قرارداد-۱۴۰۵-۰۲۲', customerId: 'c2', title: 'قرارداد اشتراک و پشتیبانی نیکان', amount: 420_000_000, startDate: '2026-04-15', endDate: '2027-04-14', status: 'active', renewal: true },
  { id: 'ct3', number: 'قرارداد-۱۴۰۴-۰۹۸', customerId: 'c5', title: 'قرارداد پایش پتروشیمی فارس', amount: 980_000_000, startDate: '2025-01-10', endDate: '2026-01-09', status: 'expired', renewal: false },
];

export const invoices: Invoice[] = [
  { id: 'i1', number: 'فاکتور-۱۴۰۵-۱۰۴۱', customerId: 'c1', contractId: 'ct1', amount: 215_000_000, paidAmount: 215_000_000, status: 'paid', issuedAt: daysAgo(28), dueDate: daysAgo(2) },
  { id: 'i2', number: 'فاکتور-۱۴۰۵-۱۰۴۲', customerId: 'c1', contractId: 'ct1', amount: 215_000_000, paidAmount: 80_000_000, status: 'sent', issuedAt: daysAgo(8), dueDate: daysFromNow(12) },
  { id: 'i3', number: 'فاکتور-۱۴۰۵-۱۰۴۳', customerId: 'c2', contractId: 'ct2', amount: 140_000_000, paidAmount: 0, status: 'overdue', issuedAt: daysAgo(38), dueDate: daysAgo(8) },
  { id: 'i4', number: 'فاکتور-۱۴۰۵-۱۰۴۴', customerId: 'c7', amount: 310_000_000, paidAmount: 0, status: 'draft', issuedAt: daysAgo(1), dueDate: daysFromNow(29) },
];

export const payments: Payment[] = [
  { id: 'pay1', receiptNumber: 'رسید-۸۸۲۱', customerId: 'c1', invoiceId: 'i1', amount: 215_000_000, method: 'واریز بانکی', paidAt: daysAgo(14), reference: '۴۱۰۲۸۸۷۱' },
  { id: 'pay2', receiptNumber: 'رسید-۸۸۲۲', customerId: 'c1', invoiceId: 'i2', amount: 80_000_000, method: 'چک', paidAt: daysAgo(3), reference: 'چک ۷۷۱۰۲' },
];

export const installments: Installment[] = [
  { id: 'ins1', contractId: 'ct1', number: 1, dueDate: daysAgo(30), amount: 215_000_000, paidAmount: 215_000_000, status: 'paid' },
  { id: 'ins2', contractId: 'ct1', number: 2, dueDate: daysFromNow(12), amount: 215_000_000, paidAmount: 80_000_000, status: 'due' },
  { id: 'ins3', contractId: 'ct2', number: 1, dueDate: daysAgo(8), amount: 140_000_000, paidAmount: 0, status: 'overdue' },
];

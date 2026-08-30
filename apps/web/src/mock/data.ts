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
  ResaleOpportunity,
  Goal,
  TimesheetEntry,
  ActivityLog,
  Employee,
  AttendanceRecord,
  LeaveRequest,
  Mission,
  PerformanceReview,
  EmployeeDocument,
  PayrollRecord,
  JobOpening,
  Candidate,
  Supplier,
  BankAccount,
  Expense,
  ProjectMember,
  TaskLabel,
  PerformancePeriod,
  PerformancePointReason,
  PerformancePointEvent,
  DocumentCategory,
  BusinessDocument,
  Conversation,
  Message,
  ProjectEvent,
  ChatGroup,
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
    customerId: 'c1',
    managerId: 'u2',
    budget: 860_000_000,
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
    customerId: 'c7',
    managerId: 'u6',
    budget: 1_240_000_000,
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
    customerId: 'c2',
    managerId: 'u5',
    budget: 420_000_000,
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
    customerId: 'c4',
    managerId: 'u2',
    budget: 275_000_000,
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
    customerId: 'c5',
    managerId: 'u2',
    budget: 980_000_000,
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
tasks.forEach((task, index) => Object.assign(task, {
  assigneeIds: Array.from(new Set([task.assigneeId, projects.find((project) => project.id === task.projectId)?.managerId].filter(Boolean))),
  followerIds: [projects.find((project) => project.id === task.projectId)?.managerId ?? 'u1'],
  startDate: task.createdAt,
  repeatEvery: index % 7 === 0 ? 2 : undefined,
  hourlyRate: 200_000 + (index % 5) * 25_000,
}));

export const customers: Customer[] = [
  { id: 'c1', name: 'مهندس کامران شریفی', company: 'صنایع سپهر ایرانیان', email: 'sharifi@sepehr.co', phone: '۰۲۱-۴۴۵۵۶۶۷۷', status: 'active', value: 860_000_000, lastContact: hoursAgo(18), assignedTo: 'u7' },
  { id: 'c2', name: 'خانم لیلا توکلی', company: 'داروسازی نیکان', email: 'tavakoli@nikan.ir', phone: '۰۲۱-۸۸۷۷۶۶۵۵', status: 'active', value: 420_000_000, lastContact: daysAgo(2), assignedTo: 'u7' },
  { id: 'c3', name: 'آقای بهرام یوسفی', company: 'لجستیک آریابرگ', email: 'yousefi@aryabarg.com', phone: '۰۳۱-۳۲۲۲۱۱۰۰', status: 'lead', value: 150_000_000, lastContact: daysAgo(5), assignedTo: 'u2' },
  { id: 'c4', name: 'دکتر ناهید امینی', company: 'کلینیک هوشمند زندگی', email: 'amini@zendegi.clinic', phone: '۰۲۱-۲۲۰۰۱۱۲۲', status: 'active', value: 275_000_000, lastContact: hoursAgo(40), assignedTo: 'u5' },
  { id: 'c5', name: 'مهندس جواد مرادی', company: 'پتروشیمی فارس جنوب', email: 'moradi@fars-south.ir', phone: '۰۷۱-۳۳۴۴۵۵۶۶', status: 'inactive', value: 980_000_000, lastContact: daysAgo(21), assignedTo: 'u2' },
  { id: 'c6', name: 'خانم شیدا کاظمی', company: 'آموزشگاه ابرآسا', email: 'kazemi@abrasa.ir', phone: '۰۲۱-۶۶۵۵۴۴۳۳', status: 'lead', value: 95_000_000, lastContact: daysAgo(1), assignedTo: 'u7' },
  { id: 'c7', name: 'آقای پیمان رستمی', company: 'بانک توسعه تعاون شعبه مرکزی', email: 'rostami@ttbank.ir', phone: '۰۲۱-۸۸۸۸۰۰۰۰', status: 'active', value: 1_240_000_000, lastContact: hoursAgo(6), assignedTo: 'u1' },
];
customers.forEach((customer, index) => Object.assign(customer, {
  nationalCode: `۱۴۰۰${(1200 + index).toString()}`,
  country: 'ایران',
  province: index % 2 ? 'البرز' : 'تهران',
  city: index % 2 ? 'کرج' : 'تهران',
  postalCode: `۱۴۳${(100000 + index).toString()}`,
  address: index % 2 ? 'کرج، بلوار جمهوری، ساختمان مرکزی' : 'تهران، خیابان ولیعصر، دفتر مرکزی',
  fax: index % 3 === 0 ? '۰۲۱-۴۴۵۵۶۶۷۸' : undefined,
  website: `https://${['sepehr','nikan','aryabarg','zendegi','fars-south','abrasa','ttbank'][index]}.ir`,
  additionalPhones: [`۰۹۱۲۱۲۳۴${(20 + index).toString().padStart(2, '۰')}`],
}));

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
  { id: 'pr1', name: 'اشتراک سازمانی تری‌لیز', sku: 'TRI-ENT-12', category: 'اشتراک نرم‌افزار', type: 'اشتراک', unit: 'کاربر/ماه', price: 2_400_000, taxRate: 10, stock: 980, active: true, updatedAt: daysAgo(2) },
  { id: 'pr2', name: 'راه‌اندازی و استقرار', sku: 'TRI-SETUP', category: 'خدمات حرفه‌ای', type: 'خدمات', unit: 'پروژه', price: 180_000_000, taxRate: 10, stock: 0, active: true, updatedAt: daysAgo(6) },
  { id: 'pr3', name: 'آموزش تیم و مدیران', sku: 'TRI-TRAIN', category: 'خدمات حرفه‌ای', type: 'خدمات', unit: 'جلسه', price: 28_000_000, taxRate: 10, stock: 0, active: true, updatedAt: daysAgo(4) },
  { id: 'pr4', name: 'پشتیبانی طلایی', sku: 'TRI-SUP-G', category: 'پشتیبانی', type: 'پشتیبانی', unit: 'ماه', price: 45_000_000, taxRate: 10, stock: 12, active: true, updatedAt: daysAgo(1) },
  { id: 'pr5', name: 'افزونه پایش دستگاه', sku: 'TRI-MON-01', category: 'افزونه', type: 'نرم‌افزار', unit: 'دستگاه/ماه', price: 650_000, taxRate: 10, stock: 420, active: true, updatedAt: daysAgo(3) },
];

export const proposals: Proposal[] = [
  { id: 'q1', number: 'پیشنهاد-۱۴۰۵-۰۱۸', customerId: 'c1', projectId: 'p1', title: 'استقرار CRM و مانیتورینگ شعب', amount: 860_000_000, status: 'approved', issuedAt: daysAgo(18), validUntil: daysFromNow(12), ownerId: 'u7', updatedAt: hoursAgo(4), items: [{ productId: 'pr2', quantity: 2, unitPrice: 180_000_000, discount: 10_000_000, tax: 35_000_000 }, { productId: 'pr1', quantity: 100, unitPrice: 2_400_000, discount: 40_000_000, tax: 24_000_000 }], relatedLeadId: 'l1' },
  { id: 'q2', number: 'پیشنهاد-۱۴۰۵-۰۱۹', customerId: 'c2', projectId: 'p3', title: 'اشتراک سازمانی تیم فروش', amount: 420_000_000, status: 'viewed', issuedAt: daysAgo(5), validUntil: daysFromNow(25), ownerId: 'u7', updatedAt: daysAgo(1), items: [{ productId: 'pr1', quantity: 120, unitPrice: 2_400_000, discount: 18_000_000, tax: 28_200_000 }], relatedLeadId: 'l2' },
  { id: 'q3', number: 'پیشنهاد-۱۴۰۵-۰۲۰', customerId: 'c7', projectId: 'p2', title: 'پایش ۸۰ دستگاه و گزارش مدیریتی', amount: 1_240_000_000, status: 'draft', issuedAt: daysAgo(1), validUntil: daysFromNow(29), ownerId: 'u1', updatedAt: hoursAgo(3), items: [{ productId: 'pr5', quantity: 80, unitPrice: 650_000, discount: 0, tax: 5_200_000 }, { productId: 'pr2', quantity: 5, unitPrice: 180_000_000, discount: 40_000_000, tax: 86_000_000 }] },
  { id: 'q4', number: 'پیشنهاد-۱۴۰۵-۰۲۱', customerId: 'c1', projectId: 'p1', title: 'تمدید پشتیبانی طلایی', amount: 270_000_000, status: 'sent', issuedAt: daysAgo(2), validUntil: daysFromNow(18), ownerId: 'u7', updatedAt: hoursAgo(10), items: [{ productId: 'pr4', quantity: 6, unitPrice: 45_000_000, discount: 0, tax: 27_000_000 }] },
];

export const contracts: Contract[] = [
  { id: 'ct1', number: 'قرارداد-۱۴۰۵-۰۲۱', customerId: 'c1', projectId: 'p1', title: 'قرارداد خدمات سازمانی سپهر', amount: 860_000_000, startDate: '2026-02-01', endDate: '2027-01-31', status: 'active', renewal: true, ownerId: 'u7', paymentTerms: 'چهار قسط فصلی', syncStatus: 'synced', externalSystem: 'hesabfa', externalId: 'HF-CT-021' },
  { id: 'ct2', number: 'قرارداد-۱۴۰۵-۰۲۲', customerId: 'c2', projectId: 'p3', title: 'قرارداد اشتراک و پشتیبانی نیکان', amount: 420_000_000, startDate: '2026-04-15', endDate: '2027-04-14', status: 'active', renewal: true, ownerId: 'u7', paymentTerms: 'سه قسط مساوی', syncStatus: 'pending' },
  { id: 'ct3', number: 'قرارداد-۱۴۰۴-۰۹۸', customerId: 'c5', title: 'قرارداد پایش پتروشیمی فارس', amount: 980_000_000, startDate: '2025-01-10', endDate: '2026-09-09', status: 'expiring', renewal: false, ownerId: 'u2', paymentTerms: 'ماهانه' },
];

export const invoices: Invoice[] = [
  { id: 'i1', number: 'فاکتور-۱۴۰۵-۱۰۴۱', customerId: 'c1', projectId: 'p1', contractId: 'ct1', proposalId: 'q1', amount: 215_000_000, paidAmount: 215_000_000, status: 'paid', issuedAt: daysAgo(28), dueDate: daysAgo(2), items: [{ productId: 'pr2', quantity: 1, unitPrice: 180_000_000, discount: 0, tax: 35_000_000 }], syncStatus: 'synced', externalSystem: 'hesabfa', externalId: 'HF-INV-1041', lastSyncedAt: daysAgo(1) },
  { id: 'i2', number: 'فاکتور-۱۴۰۵-۱۰۴۲', customerId: 'c1', projectId: 'p1', contractId: 'ct1', proposalId: 'q1', amount: 215_000_000, paidAmount: 80_000_000, status: 'partial', issuedAt: daysAgo(8), dueDate: daysFromNow(12), items: [{ productId: 'pr1', quantity: 80, unitPrice: 2_400_000, discount: 0, tax: 22_000_000 }], syncStatus: 'changed', externalSystem: 'hesabfa', externalId: 'HF-INV-1042' },
  { id: 'i3', number: 'فاکتور-۱۴۰۵-۱۰۴۳', customerId: 'c2', projectId: 'p3', contractId: 'ct2', proposalId: 'q2', amount: 140_000_000, paidAmount: 35_000_000, status: 'overdue', issuedAt: daysAgo(38), dueDate: daysAgo(8), items: [{ productId: 'pr1', quantity: 60, unitPrice: 2_400_000, discount: 4_000_000, tax: 13_600_000 }] },
  { id: 'i4', number: 'فاکتور-۱۴۰۵-۱۰۴۴', customerId: 'c7', projectId: 'p2', amount: 310_000_000, proposalId: 'q3', paidAmount: 0, status: 'issued', issuedAt: daysAgo(1), dueDate: daysFromNow(29), items: [{ productId: 'pr5', quantity: 80, unitPrice: 650_000, discount: 0, tax: 5_200_000 }, { productId: 'pr2', quantity: 1, unitPrice: 180_000_000, discount: 0, tax: 18_000_000 }] },
];

export const payments: Payment[] = [
  { id: 'pay1', receiptNumber: 'رسید-۸۸۲۱', customerId: 'c1', invoiceId: 'i1', projectId: 'p1', bankAccountId: 'bank1', amount: 215_000_000, method: 'انتقال بانکی', paidAt: daysAgo(14), reference: '۴۱۰۲۸۸۷۱', status: 'تایید شده', syncStatus: 'synced', externalSystem: 'hesabfa', externalId: 'HF-PAY-8821' },
  { id: 'pay2', receiptNumber: 'رسید-۸۸۲۲', customerId: 'c1', invoiceId: 'i2', projectId: 'p1', bankAccountId: 'bank1', amount: 80_000_000, method: 'چک', paidAt: daysAgo(3), reference: 'چک ۷۷۱۰۲', status: 'در انتظار تایید', syncStatus: 'pending' },
  { id: 'pay3', receiptNumber: 'رسید-۸۸۲۳', customerId: 'c2', invoiceId: 'i3', projectId: 'p3', bankAccountId: 'bank2', amount: 35_000_000, method: 'درگاه اینترنتی', paidAt: daysAgo(1), reference: 'PG-99182', status: 'تایید شده', syncStatus: 'synced', externalSystem: 'hesabfa', externalId: 'HF-PAY-8823' },
];

export const installments: Installment[] = [
  { id: 'ins1', contractId: 'ct1', invoiceId: 'i1', customerId: 'c1', projectId: 'p1', number: 1, dueDate: daysAgo(30), amount: 215_000_000, paidAmount: 215_000_000, status: 'paid' },
  { id: 'ins2', contractId: 'ct1', invoiceId: 'i2', customerId: 'c1', projectId: 'p1', number: 2, dueDate: daysFromNow(12), amount: 215_000_000, paidAmount: 80_000_000, status: 'partial' },
  { id: 'ins3', contractId: 'ct2', invoiceId: 'i3', customerId: 'c2', projectId: 'p3', number: 1, dueDate: daysAgo(8), amount: 140_000_000, paidAmount: 35_000_000, status: 'overdue' },
  { id: 'ins4', contractId: 'ct2', invoiceId: 'i3', customerId: 'c2', projectId: 'p3', number: 2, dueDate: daysFromNow(18), amount: 140_000_000, paidAmount: 0, status: 'future' },
];

export const suppliers: Supplier[] = [
  { id: 'sup1', name: 'شرکت آریا تجهیزات', contactName: 'محمد رضایی', phone: '۰۲۱-۸۸۳۴۲۱۱۰', email: 'sales@arya-equip.ir', balance: 48_500_000, type: 'supplier' },
  { id: 'sup2', name: 'راهکارهای ابری ابرینو', contactName: 'سحر نادری', phone: '۰۲۱-۴۴۲۱۸۸۱۰', email: 'finance@abrino.ir', balance: 12_800_000, type: 'both' },
  { id: 'sup3', name: 'چاپ و تبلیغات دیدار', contactName: 'کیوان مرادی', phone: '۰۲۱-۶۶۹۹۸۲۱۱', email: 'info@didarprint.ir', balance: 0, type: 'supplier' },
];

export const bankAccounts: BankAccount[] = [
  { id: 'bank1', bankName: 'بانک ملت', label: 'حساب جاری عملیات', maskedNumber: '****۴۲۸۱', accountType: 'جاری', balance: 845_000_000, status: 'active' },
  { id: 'bank2', bankName: 'بانک سامان', label: 'حساب دریافت‌ها', maskedNumber: '****۱۹۳۲', accountType: 'جاری', balance: 321_500_000, status: 'active' },
  { id: 'bank3', bankName: 'بانک تجارت', label: 'حساب ذخیره', maskedNumber: '****۷۷۰۴', accountType: 'پس‌انداز', balance: 96_200_000, status: 'active' },
];

export const expenses: Expense[] = [
  { id: 'ex1', title: 'خرید تجهیزات شبکه', category: 'تجهیزات', projectId: 'p2', supplierId: 'sup1', amount: 86_000_000, date: daysAgo(4), status: 'paid', paymentMethod: 'انتقال بانکی', bankAccountId: 'bank1', description: 'خرید سوئیچ و تجهیزات رک برای پروژه زیرساخت سازمان.' },
  { id: 'ex2', title: 'اشتراک سرویس ابری', category: 'نرم‌افزار', supplierId: 'sup2', amount: 24_500_000, date: daysAgo(7), status: 'paid', paymentMethod: 'کارت', bankAccountId: 'bank2', description: 'هزینه ماهانه زیرساخت ابری تیم.' },
  { id: 'ex3', title: 'خدمات پیمانکاری طراحی', category: 'خدمات پیمانکاری', projectId: 'p1', supplierId: 'sup2', amount: 58_000_000, date: daysAgo(9), status: 'approved', paymentMethod: 'چک', bankAccountId: 'bank1', description: 'همکاری طراحی رابط کاربری و تجربه کاربری.' },
  { id: 'ex4', title: 'تبلیغات دیجیتال', category: 'بازاریابی', amount: 31_800_000, date: daysAgo(12), status: 'paid', paymentMethod: 'درگاه اینترنتی', bankAccountId: 'bank2', description: 'کمپین جذب سرنخ سازمانی.' },
  { id: 'ex5', title: 'اجاره دفتر', category: 'هزینه‌های جاری', amount: 72_000_000, date: daysAgo(15), status: 'paid', paymentMethod: 'انتقال بانکی', bankAccountId: 'bank1', description: 'اجاره دفتر مرکزی شهریور ماه.' },
  { id: 'ex6', title: 'حمل‌ونقل تجهیزات', category: 'حمل‌ونقل', projectId: 'p2', supplierId: 'sup1', amount: 14_200_000, date: daysAgo(18), status: 'pending', paymentMethod: 'نقدی', description: 'ارسال تجهیزات به محل مشتری.' },
  { id: 'ex7', title: 'لایسنس ابزار توسعه', category: 'نرم‌افزار', projectId: 'p3', supplierId: 'sup2', amount: 18_900_000, date: daysAgo(21), status: 'paid', paymentMethod: 'کارت', bankAccountId: 'bank2', description: 'تمدید لایسنس ابزارهای تیم فنی.' },
  { id: 'ex8', title: 'لوازم اداری', category: 'تجهیزات اداری', supplierId: 'sup3', amount: 9_600_000, date: daysAgo(25), status: 'approved', paymentMethod: 'انتقال بانکی', bankAccountId: 'bank3', description: 'تجهیزات مصرفی دفتر.' },
];

export const resaleOpportunities: ResaleOpportunity[] = Array.from({ length: 15 }, (_, index) => {
  const customer = customers[index % customers.length];
  const product = products[(index + 2) % products.length];
  const statuses: ResaleOpportunity['status'][] = ['identified', 'following', 'proposal', 'negotiating', 'won', 'lost'];
  return {
    id: `rs${index + 1}`,
    customerId: customer.id,
    productId: product.id,
    previousPurchase: index % 2 ? 'اشتراک سازمانی سال ۱۴۰۴' : 'پشتیبانی استاندارد',
    opportunityTitle: index % 2 ? `افزودن ${product.name}` : `ارتقای قرارداد ${customer.company}`,
    estimatedValue: 45_000_000 + index * 12_500_000,
    probability: [35, 55, 70, 80, 100, 15][index % 6],
    assignedTo: users[(index + 1) % users.length].id,
    status: statuses[index % statuses.length],
    nextFollowUp: daysFromNow((index % 10) - 2),
    notes: 'فرصت بر اساس خرید قبلی و ظرفیت استفاده شناسایی شده است.',
    createdAt: daysAgo(index + 1),
  };
});

export const goals: Goal[] = [
  { id: 'g1', title: 'افزایش فروش ماهانه', ownerId: 'u2', department: 'فروش', period: 'شهریور ۱۴۰۵', target: 1_000_000_000, current: 720_000_000, progress: 72, status: 'in_progress', dueDate: '2026-09-30', description: 'رشد فروش قراردادهای سازمانی و تمدیدها.', createdAt: daysAgo(20) },
  { id: 'g2', title: 'جذب ۲۰ مشتری جدید', ownerId: 'u7', department: 'فروش', period: 'فصل تابستان', target: 20, current: 14, progress: 70, status: 'in_progress', dueDate: '2026-09-31', description: 'افزایش ورودی قیف و تبدیل سرنخ‌های واجد شرایط.', createdAt: daysAgo(24) },
  { id: 'g3', title: 'کاهش زمان پاسخگویی پشتیبانی', ownerId: 'u5', department: 'پشتیبانی', period: 'شهریور ۱۴۰۵', target: 60, current: 48, progress: 80, status: 'in_progress', dueDate: '2026-09-30', description: 'میانگین پاسخ اول کمتر از ۶۰ دقیقه باشد.', createdAt: daysAgo(16) },
  { id: 'g4', title: 'تکمیل پروژه‌های فعال', ownerId: 'u1', department: 'عملیات', period: 'نیمه دوم ۱۴۰۵', target: 4, current: 2, progress: 50, status: 'in_progress', dueDate: '2026-12-30', description: 'تحویل پروژه‌ها مطابق برنامه مصوب.', createdAt: daysAgo(30) },
  { id: 'g5', title: 'افزایش رضایت مشتریان', ownerId: 'u5', department: 'موفقیت مشتری', period: 'فصل تابستان', target: 90, current: 92, progress: 100, status: 'completed', dueDate: '2026-08-20', description: 'رسیدن امتیاز رضایت به حداقل ۹۰ درصد.', createdAt: daysAgo(60) },
  { id: 'g6', title: 'افزایش درآمد خدمات پشتیبانی', ownerId: 'u7', department: 'فروش', period: 'شهریور ۱۴۰۵', target: 300_000_000, current: 175_000_000, progress: 58, status: 'overdue', dueDate: '2026-08-20', description: 'فروش بسته‌های پشتیبانی و تمدید سالانه.', createdAt: daysAgo(42) },
  { id: 'g7', title: 'بهبود سلامت دستگاه‌ها', ownerId: 'u6', department: 'زیرساخت', period: 'ماهانه', target: 95, current: 93, progress: 98, status: 'in_progress', dueDate: '2026-09-30', description: 'حفظ سلامت Agent و کاهش دستگاه‌های آفلاین.', createdAt: daysAgo(12) },
  { id: 'g8', title: 'تکمیل مقالات پایگاه دانش', ownerId: 'u3', department: 'محصول', period: 'فصل تابستان', target: 30, current: 30, progress: 100, status: 'completed', dueDate: '2026-08-25', description: 'مستندسازی مسیرهای پرتکرار کاربران.', createdAt: daysAgo(50) },
  { id: 'g9', title: 'کاهش مطالبات معوق', ownerId: 'u1', department: 'مالی', period: 'شهریور ۱۴۰۵', target: 100_000_000, current: 62_000_000, progress: 62, status: 'in_progress', dueDate: '2026-09-30', description: 'پیگیری وصول فاکتورهای سررسیدشده.', createdAt: daysAgo(18) },
  { id: 'g10', title: 'افزایش استفاده روزانه از محصول', ownerId: 'u3', department: 'محصول', period: 'نیمه دوم ۱۴۰۵', target: 75, current: 54, progress: 72, status: 'in_progress', dueDate: '2026-12-30', description: 'بهبود فعال‌سازی و استفاده مستمر مشتریان.', createdAt: daysAgo(22) },
];

export const timesheets: TimesheetEntry[] = Array.from({ length: 40 }, (_, index) => {
  const project = projects[index % projects.length];
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const task = projectTasks[index % Math.max(projectTasks.length, 1)] ?? tasks[index % tasks.length];
  const employeeId = task.assigneeId;
  const statuses: TimesheetEntry['status'][] = ['approved', 'submitted', 'draft', 'approved', 'rejected'];
  return {
    id: `ts${index + 1}`,
    employeeId,
    projectId: project.id,
    taskId: task.id,
    date: daysAgo(index % 18),
    hours: 2 + (index % 7),
    startTime: `۰${8 + (index % 2)}:۰۰`,
    endTime: `۱${4 + (index % 3)}:۳۰`,
    hourlyRate: 180_000 + (index % 5) * 35_000,
    calculatedCost: (2 + (index % 7)) * (180_000 + (index % 5) * 35_000),
    billable: index % 4 !== 0,
    description: index % 2 ? 'پیاده‌سازی و هماهنگی با تیم پروژه' : 'جلسه، تحلیل و ثبت خروجی روزانه',
    status: statuses[index % statuses.length],
    createdAt: daysAgo(index % 18),
  };
});

export const activityLogs: ActivityLog[] = Array.from({ length: 56 }, (_, index) => {
  const user = users[index % users.length];
  const actions = [
    ['ورود موفق کاربر', 'کاربر با موفقیت وارد شد', 'auth'],
    ['Task Updated', 'وظیفه محصول‌گذاری و آپدیت محصول به‌روزرسانی شد', 'task'],
    ['Customer Updated', 'اطلاعات شرکت پارس وود ویرایش شد', 'customer'],
    ['Invoice Created', 'فاکتور جدید برای مشتری ایجاد شد', 'invoice'],
    ['Payment Added', 'دریافت جدید به فاکتور ثبت شد', 'payment'],
    ['Project Updated', 'پیشرفت پروژه به‌روزرسانی شد', 'project'],
    ['Ticket Created', 'تیکت پشتیبانی جدید ثبت شد', 'ticket'],
  ] as const;
  const [action, description, entityType] = actions[index % actions.length];
  return {
    id: `al${index + 1}`,
    action,
    description: `${description} [شناسه: ${2000 + index}، IP: 87.236.161.${20 + (index % 90)}]`,
    userId: user.id,
    timestamp: hoursAgo(index * 3 + 1),
    entityType,
    entityId: `${entityType}-${index + 1}`,
    ip: `87.236.161.${20 + (index % 90)}`,
    metadata: `شناسه رویداد: EVT-${1405 + index}`,
  };
});

export const employees: Employee[] = [
  ...users.map((user, index): Employee => ({
    id: user.id, personnelCode: `EMP-${1040 + index}`, fullName: user.name, phone: `۰۹۱۲۱۲۳۴${(10 + index).toString().padStart(2, '۰')}`, email: user.email,
    nationalId: `۰۰۱۲۳۴۵۶${(10 + index).toString().padStart(2, '۰')}`, jobTitle: user.title, department: ['عملیات', 'فنی', 'محصول', 'فنی', 'پشتیبانی', 'زیرساخت', 'فروش', 'فنی'][index],
    managerId: index > 0 && index !== 1 ? 'u1' : undefined, employmentType: index === 2 ? 'part_time' : 'full_time', contractType: 'قرارداد دائم', employmentStatus: index === 4 ? 'leave' : 'active',
    hireDate: `202${index % 4 + 2}-0${(index % 8) + 1}-1${index % 8}`, workLocation: index % 3 === 0 ? 'دفتر مرکزی تهران' : 'شعبه / ترکیبی', workMode: index % 3 === 0 ? 'حضوری' : 'ترکیبی',
    salary: 65_000_000 + index * 7_500_000, leaveBalance: 12 - (index % 6),
  })),
  { id: 'u9', personnelCode: 'EMP-1048', fullName: 'زهرا حاتمی', phone: '۰۹۱۲۴۴۴۵۵۶۶', email: 'zahra.hatami@trileez.ir', nationalId: '۰۰۱۲۳۴۵۶۷۸', jobTitle: 'کارشناس منابع انسانی', department: 'منابع انسانی', managerId: 'u1', employmentType: 'full_time', contractType: 'قرارداد دائم', employmentStatus: 'active', hireDate: '2023-05-12', workLocation: 'دفتر مرکزی تهران', workMode: 'ترکیبی', salary: 72_000_000, leaveBalance: 18 },
  { id: 'u10', personnelCode: 'EMP-1049', fullName: 'محمد احمدی', phone: '۰۹۱۲۶۶۷۷۸۸۹', email: 'mohammad.ahmadi@trileez.ir', nationalId: '۰۰۱۲۳۴۵۶۷۹', jobTitle: 'مدیر فنی', department: 'فنی', managerId: 'u1', employmentType: 'full_time', contractType: 'قرارداد دائم', employmentStatus: 'active', hireDate: '2022-08-20', workLocation: 'دفتر مرکزی تهران', workMode: 'حضوری', salary: 125_000_000, leaveBalance: 9 },
  { id: 'u11', personnelCode: 'EMP-1050', fullName: 'آرزو کریمی', phone: '۰۹۱۲۳۳۴۴۵۵۶', email: 'arezo.karimi@trileez.ir', nationalId: '۰۰۱۲۳۴۵۶۸۰', jobTitle: 'کارشناس بازاریابی', department: 'بازاریابی', managerId: 'u7', employmentType: 'project', contractType: 'قرارداد پروژه‌ای', employmentStatus: 'active', hireDate: '2025-01-15', workLocation: 'دورکاری', workMode: 'دورکاری', salary: 58_000_000, leaveBalance: 7 },
  { id: 'u12', personnelCode: 'EMP-1051', fullName: 'نیما مرادی', phone: '۰۹۱۲۷۷۸۸۹۹۰', email: 'nima.moradi@trileez.ir', nationalId: '۰۰۱۲۳۴۵۶۸۱', jobTitle: 'کارآموز توسعه', department: 'فنی', managerId: 'u10', employmentType: 'intern', contractType: 'کارآموزی', employmentStatus: 'active', hireDate: '2026-02-10', workLocation: 'دفتر مرکزی تهران', workMode: 'حضوری', salary: 32_000_000, leaveBalance: 3 },
];

const employeeIds = employees.map((employee) => employee.id);
employees.forEach((employee, index) => { employee.hourlyRate = 200_000 + (index % 5) * 25_000; });
const attendanceStatuses: AttendanceRecord['status'][] = ['present', 'present', 'late', 'remote', 'mission', 'leave', 'absent'];
export const attendance: AttendanceRecord[] = Array.from({ length: 56 }, (_, index) => {
  const status = attendanceStatuses[index % attendanceStatuses.length];
  return { id: `att-${index + 1}`, employeeId: employeeIds[index % employeeIds.length], date: daysAgo(index % 14).slice(0, 10), checkIn: status === 'absent' || status === 'leave' ? undefined : `۰${8 + (index % 2)}:${index % 3 === 0 ? '۴۲' : '۱۵'}`, checkOut: status === 'absent' || status === 'leave' ? undefined : `۱۷:${index % 2 ? '۰۵' : '۱۸'}`, hours: status === 'absent' || status === 'leave' ? 0 : 7.5 + (index % 3) * .5, status };
});
const leaveTypes: LeaveRequest['leaveType'][] = ['annual', 'sick', 'unpaid', 'hourly', 'other'];
export const leaveRequests: LeaveRequest[] = Array.from({ length: 18 }, (_, index) => ({ id: `leave-${index + 1}`, employeeId: employeeIds[index % employeeIds.length], leaveType: leaveTypes[index % leaveTypes.length], startDate: daysFromNow((index % 12) - 5).slice(0, 10), endDate: daysFromNow((index % 12) - 3).slice(0, 10), days: index % 3 + 1, reason: index % 2 ? 'امور شخصی و خانوادگی' : 'استراحت و بازیابی انرژی', status: (['pending', 'approved', 'approved', 'rejected'] as LeaveRequest['status'][])[index % 4], approverId: 'u1', createdAt: daysAgo(index + 1) }));
export const missions: Mission[] = Array.from({ length: 10 }, (_, index) => ({ id: `mission-${index + 1}`, employeeId: employeeIds[(index + 2) % employeeIds.length], destination: ['اصفهان', 'مشهد', 'تهران', 'شیراز'][index % 4], purpose: index % 2 ? 'جلسه با مشتری' : 'استقرار و آموزش تیم', startDate: daysFromNow((index % 10) - 3).slice(0, 10), endDate: daysFromNow((index % 10) - 1).slice(0, 10), days: 2, estimatedCost: 8_000_000 + index * 1_500_000, actualCost: index % 3 === 0 ? 0 : 7_500_000 + index * 1_200_000, status: (['pending', 'approved', 'in_progress', 'completed', 'rejected'] as Mission['status'][])[index % 5], approverId: 'u1', description: 'ثبت ماموریت مرتبط با پروژه و مشتری سازمانی' }));
export const performanceReviews: PerformanceReview[] = Array.from({ length: 12 }, (_, index) => ({ id: `review-${index + 1}`, employeeId: employeeIds[index % employeeIds.length], reviewerId: index % 3 === 0 ? 'u1' : 'u2', period: index % 2 ? 'فصل دوم ۱۴۰۵' : 'نیمه اول ۱۴۰۵', overallScore: 3 + (index % 3) * .5, goalIds: goals.slice(index % 5, index % 5 + 2).map((goal) => goal.id), strengths: 'تعهد بالا، همکاری بین‌تیمی و پیگیری مناسب خروجی‌ها', improvements: 'مستندسازی منظم‌تر و برنامه‌ریزی ظرفیت', managerComment: 'روند عملکرد مثبت است و برای سطح بعدی آمادگی دارد.', status: (['pending', 'in_progress', 'completed'] as PerformanceReview['status'][])[index % 3], createdAt: daysAgo(index * 4) }));
export const employeeDocuments: EmployeeDocument[] = Array.from({ length: 32 }, (_, index) => ({ id: `doc-${index + 1}`, employeeId: employeeIds[index % employeeIds.length], name: ['قرارداد کاری', 'کارت ملی', 'مدرک تحصیلی', 'رزومه', 'گواهی دوره'][index % 5], type: ['قرارداد', 'مدرک هویتی', 'مدرک تحصیلی', 'رزومه', 'گواهی'][index % 5], uploadedAt: daysAgo(index + 2).slice(0, 10), expiresAt: index % 4 === 0 ? daysFromNow(index - 15).slice(0, 10) : undefined, status: index % 4 === 0 ? (index % 8 === 0 ? 'expired' : 'expiring') : index % 5 === 0 ? 'no_expiry' : 'valid', fileSize: `${400 + index * 35} کیلوبایت` }));
export const payroll: PayrollRecord[] = Array.from({ length: 24 }, (_, index) => { const employee = employees[index % employees.length]; const overtime = (index % 4) * 2_500_000; const benefits = 4_000_000 + (index % 3) * 1_000_000; const deductions = 2_000_000 + (index % 2) * 1_000_000; const tax = Math.round((employee.salary + overtime + benefits) * .08); return { id: `payroll-${index + 1}`, employeeId: employee.id, month: index % 2 ? 'شهریور ۱۴۰۵' : 'مرداد ۱۴۰۵', baseSalary: employee.salary, overtime, benefits, deductions, tax, netSalary: employee.salary + overtime + benefits - deductions - tax, status: (['draft', 'approved', 'paid'] as PayrollRecord['status'][])[index % 3], paidAt: index % 3 === 2 ? daysAgo(index).slice(0, 10) : undefined }; });
export const jobOpenings: JobOpening[] = [
  { id: 'job1', title: 'توسعه‌دهنده ارشد React', department: 'فنی', employmentType: 'full_time', openings: 2, applicants: 18, status: 'open', postedAt: daysAgo(12).slice(0, 10) },
  { id: 'job2', title: 'کارشناس موفقیت مشتری', department: 'پشتیبانی', employmentType: 'full_time', openings: 1, applicants: 11, status: 'open', postedAt: daysAgo(8).slice(0, 10) },
  { id: 'job3', title: 'کارشناس فروش سازمانی', department: 'فروش', employmentType: 'full_time', openings: 2, applicants: 24, status: 'open', postedAt: daysAgo(20).slice(0, 10) },
  { id: 'job4', title: 'طراح محصول', department: 'محصول', employmentType: 'project', openings: 1, applicants: 9, status: 'paused', postedAt: daysAgo(30).slice(0, 10) },
  { id: 'job5', title: 'کارآموز منابع انسانی', department: 'منابع انسانی', employmentType: 'intern', openings: 1, applicants: 7, status: 'filled', postedAt: daysAgo(50).slice(0, 10) },
];
export const candidates: Candidate[] = Array.from({ length: 22 }, (_, index) => ({ id: `candidate-${index + 1}`, fullName: ['سعید احمدی', 'نگین کاظمی', 'پویان مرادی', 'مینا رستمی', 'هومن اکبری'][index % 5], jobId: jobOpenings[index % jobOpenings.length].id, email: `candidate${index + 1}@example.ir`, phone: `۰۹۱۲۳۴۵۶${(10 + index).toString().padStart(2, '۰')}`, stage: (['resume', 'screening', 'interview', 'final', 'offer', 'hired', 'rejected'] as Candidate['stage'][])[index % 7], score: 60 + (index % 5) * 8, ownerId: employeeIds[(index + 1) % employeeIds.length], appliedAt: daysAgo(index + 1).slice(0, 10) }));

export const taskLabels: TaskLabel[] = [
  { id: 'lbl-urgent', name: 'فوری', color: '#DC2626' }, { id: 'lbl-tech', name: 'فنی', color: '#2563EB' },
  { id: 'lbl-seo', name: 'سئو', color: '#7C3AED' }, { id: 'lbl-customer', name: 'نیازمند مشتری', color: '#D97706' },
  { id: 'lbl-internal', name: 'داخلی', color: '#64748B' }, { id: 'lbl-important', name: 'مهم', color: '#059669' },
];
tasks.forEach((task, index) => {
  task.labelIds = [task.priority === 'urgent' ? 'lbl-urgent' : task.priority === 'high' ? 'lbl-important' : 'lbl-internal', index % 3 === 0 ? 'lbl-tech' : index % 3 === 1 ? 'lbl-customer' : 'lbl-seo'];
});

export const projectMembers: ProjectMember[] = projects.flatMap((project) => project.members.map((personId, index) => ({
  id: `pm-${project.id}-${personId}`, projectId: project.id, personId, role: index === 0 ? 'عضو اصلی' : index === 1 ? 'کارشناس' : 'همکار پروژه',
  status: 'active' as const, joinedAt: project.startDate, hourlyCost: 180_000 + index * 35_000, responsibilities: index === 0 ? 'هماهنگی و تحویل خروجی‌های پروژه' : 'اجرای وظایف تخصصی پروژه',
})));

export const performanceReasons: PerformancePointReason[] = [
  { id: 'reason-on-time', title: 'تحویل به‌موقع', defaultPoints: 10, direction: 'positive', category: 'تحویل' },
  { id: 'reason-early', title: 'تحویل زودتر از موعد', defaultPoints: 15, direction: 'positive', category: 'تحویل' },
  { id: 'reason-quality', title: 'کیفیت بالای کار', defaultPoints: 10, direction: 'positive', category: 'کیفیت' },
  { id: 'reason-team', title: 'همکاری با همکار', defaultPoints: 5, direction: 'positive', category: 'تیمی' },
  { id: 'reason-delay', title: 'تأخیر در تحویل', defaultPoints: -5, direction: 'negative', category: 'تحویل' },
  { id: 'reason-error', title: 'خطای تکراری', defaultPoints: -10, direction: 'negative', category: 'کیفیت' },
  { id: 'reason-absence', title: 'غیبت بدون هماهنگی', defaultPoints: -15, direction: 'negative', category: 'انضباط' },
];
export const performanceEvents: PerformancePointEvent[] = Array.from({ length: 24 }, (_, index) => ({
  id: `point-${index + 1}`, employeeId: employeeIds[index % employeeIds.length], reasonId: performanceReasons[index % performanceReasons.length].id,
  points: performanceReasons[index % performanceReasons.length].defaultPoints, date: daysAgo(index + 1).slice(0, 10),
  description: index % 3 === 0 ? 'خروجی با کیفیت و زودتر از برنامه تحویل شد.' : 'رویداد عملکردی ثبت‌شده توسط مدیر مستقیم.',
  projectId: index % 4 === 0 ? projects[index % projects.length].id : undefined, createdBy: 'u1',
}));
export const performancePeriods: PerformancePeriod[] = employeeIds.flatMap((employeeId, index) => [
  { id: `period-${employeeId}-1`, employeeId, title: 'شهریور ۱۴۰۵', score: 52 + (index * 7) % 42, grade: (index % 4 === 0 ? 'A+' : index % 3 === 0 ? 'B' : 'A') as PerformancePeriod['grade'], trend: index % 3 === 0 ? 'up' : 'flat', startedAt: '2026-08-01', endedAt: '2026-08-31' },
  { id: `period-${employeeId}-2`, employeeId, title: 'مرداد ۱۴۰۵', score: 44 + (index * 5) % 38, grade: 'B', trend: index % 2 ? 'up' : 'down', startedAt: '2026-07-01', endedAt: '2026-07-31' },
]);

export const documentCategories: DocumentCategory[] = [
  { id: 'cat-minutes', code: '01', name: 'صورت جلسه', group: 'project' }, { id: 'cat-rfp', code: '02', name: 'نیازمندی اولیه (RFP)', group: 'project' },
  { id: 'cat-report', code: '03', name: 'گزارشات', group: 'project' }, { id: 'cat-contract', code: '11', name: 'قرارداد مشتریان', group: 'customer' },
  { id: 'cat-supplier', code: '21', name: 'قرارداد تامین کننده', group: 'contractor' }, { id: 'cat-personnel', code: '31', name: 'پرونده پرسنلی', group: 'management' },
  { id: 'cat-policy', code: '32', name: 'دستورالعمل‌ها و قوانین شرکت', group: 'management' }, { id: 'cat-general', code: '41', name: 'اطلاع‌نامه', group: 'general' },
  { id: 'cat-legal', code: '51', name: 'ابلاغ نامه', group: 'legal' },
];
export const businessDocuments: BusinessDocument[] = [
  { id: 'bd1', title: 'صورت جلسه تحویل دمو اولیه سایت', projectId: 'p1', customerId: 'c1', categoryId: 'cat-minutes', documentNumber: 'TRI-1405-0018', summary: 'توافق روی نسخه اولیه و فهرست اصلاحات مشتری.', senderId: 'u2', recipientId: 'u1', followUpId: 'u7', dueDate: '2026-08-29', status: 'open', priority: 'high', tags: ['دمو', 'مشتری'], attachments: ['صورتجلسه-دمو.pdf'], createdAt: daysAgo(3), updatedAt: daysAgo(1) },
  { id: 'bd2', title: 'صورت جلسه توافق مالی و کاری پروژه', projectId: 'p3', customerId: 'c2', categoryId: 'cat-minutes', documentNumber: 'TRI-1405-0019', summary: 'جمع‌بندی تعهدات مالی و برنامه پشتیبانی.', senderId: 'u7', recipientId: 'u5', followUpId: 'u1', dueDate: '2026-09-02', status: 'completed', priority: 'normal', tags: ['مالی'], attachments: ['توافق-مالی.pdf'], createdAt: daysAgo(8), updatedAt: daysAgo(4) },
  { id: 'bd3', title: 'قرارداد کاری علی رضایی', employeeId: 'u2', categoryId: 'cat-personnel', documentNumber: 'HR-1403-0042', summary: 'پرونده پرسنلی و قرارداد همکاری.', senderId: 'u9', followUpId: 'u9', status: 'archived', priority: 'normal', tags: ['پرسنلی'], attachments: ['قرارداد-علی.pdf'], createdAt: daysAgo(120), updatedAt: daysAgo(30) },
  { id: 'bd4', title: 'راهنمای اجرایی ثبت ساعات پروژه', categoryId: 'cat-policy', documentNumber: 'POL-1405-0007', summary: 'رویه داخلی ثبت و تایید تایم‌لاگ.', senderId: 'u1', status: 'open', priority: 'normal', tags: ['فرآیند'], attachments: [], createdAt: daysAgo(15), updatedAt: daysAgo(2) },
  { id: 'bd5', title: 'صورت جلسه آقای موسوی با آقای پدرام ظفریان', projectId: 'p2', customerId: 'c7', categoryId: 'cat-minutes', documentNumber: 'TRI-1405-0020', summary: 'پیگیری دسترسی‌ها و زمان‌بندی استقرار.', senderId: 'u6', recipientId: 'u8', followUpId: 'u6', dueDate: '2026-08-27', status: 'open', priority: 'high', tags: ['استقرار'], attachments: ['جلسه-استقرار.pdf'], createdAt: daysAgo(2), updatedAt: daysAgo(1) },
  { id: 'bd6', title: 'پرسش‌نامه تکمیل اطلاعات مشتری پارس وود', section: 'customers', recordType: 'incoming', customerId: 'c1', categoryId: 'cat-contract', documentNumber: 'CUS-1405-0004', summary: 'دریافت اطلاعات تماس و نیازمندی‌های تمدید خدمات.', senderId: 'u7', recipientId: 'u1', followUpId: 'u7', dueDate: '2026-08-30', status: 'open', priority: 'normal', tags: ['مشتری'], attachments: [], createdAt: daysAgo(4), updatedAt: daysAgo(2) },
  { id: 'bd7', title: 'تایید صورت‌حساب مرحله دوم پروژه', section: 'finance', recordType: 'incoming', projectId: 'p1', customerId: 'c1', categoryId: 'cat-policy', documentNumber: 'FIN-1405-0012', summary: 'تایید دریافت مستندات مالی و برنامه پرداخت مرحله دوم.', senderId: 'u2', recipientId: 'u9', followUpId: 'u9', dueDate: '2026-09-03', status: 'open', priority: 'high', tags: ['مالی', 'فاکتور'], attachments: ['تایید-پرداخت.pdf'], createdAt: daysAgo(2), updatedAt: daysAgo(1) },
];
businessDocuments.forEach((document) => {
  if (!document.section) document.section = document.projectId ? 'projects' : document.customerId ? 'customers' : document.employeeId ? 'hr' : 'general';
  if (!document.recordType) document.recordType = document.categoryId === 'cat-contract' || document.categoryId === 'cat-supplier' ? 'incoming' : 'record';
});

export const conversations: Conversation[] = [
  { id: 'conv1', participantIds: ['u1', 'u2'], unreadCount: 2, updatedAt: hoursAgo(1), groupId: 'chat-general' },
  { id: 'conv2', participantIds: ['u1', 'u9'], unreadCount: 1, updatedAt: hoursAgo(5), groupId: 'chat-hr' },
  { id: 'conv3', participantIds: ['u1', 'u7'], unreadCount: 0, updatedAt: daysAgo(1), groupId: 'chat-sales' },
];
export const chatGroups: ChatGroup[] = [
  { id: 'chat-general', name: 'گفتگوهای سازمانی', memberIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9'], createdAt: daysAgo(60) },
  { id: 'chat-hr', name: 'منابع انسانی', memberIds: ['u1', 'u9', 'u2'], createdAt: daysAgo(42) },
  { id: 'chat-sales', name: 'فروش و مشتریان', memberIds: ['u1', 'u2', 'u7'], createdAt: daysAgo(32) },
];
projects.forEach((project) => {
  const groupId = `chat-project-${project.id}`;
  project.defaultChatGroupId = groupId;
  if (!chatGroups.some((group) => group.id === groupId)) chatGroups.push({ id: groupId, name: `پروژه ${project.name}`, projectId: project.id, memberIds: Array.from(new Set([project.managerId, ...project.members])), isDefault: true, createdAt: project.startDate });
  if (!conversations.some((conversation) => conversation.groupId === groupId)) conversations.push({ id: `conv-project-${project.id}`, title: `گفتگوی پروژه ${project.name}`, participantIds: Array.from(new Set(['u1', project.managerId, ...project.members])), unreadCount: 0, updatedAt: project.startDate, groupId, projectId: project.id });
});
export const messages: Message[] = [
  { id: 'msg1', conversationId: 'conv1', senderId: 'u2', body: 'سلام، وضعیت صفحه اصلی پروژه پردیس پارس به کجا رسید؟', sentAt: hoursAgo(2), read: false },
  { id: 'msg2', conversationId: 'conv1', senderId: 'u1', body: 'نسخه اولیه آماده بازبینی است؛ تا پایان امروز لینک دمو را ارسال می‌کنم.', sentAt: hoursAgo(1.5), read: true },
  { id: 'msg3', conversationId: 'conv2', senderId: 'u9', body: 'دو سند پرسنلی برای تایید مدیر در صف قرار گرفته است.', sentAt: hoursAgo(5), read: false },
  { id: 'msg4', conversationId: 'conv3', senderId: 'u7', body: 'پیش‌فاکتور تمدید پشتیبانی برای مشتری ارسال شد.', sentAt: daysAgo(1), read: true },
];

export const projectEvents: ProjectEvent[] = [
  { id: 'pe1', projectId: 'p1', personId: 'u2', eventType: 'شروع پروژه', stage: 'انجام شد', priority: 'بالا', status: 'completed', date: daysAgo(44), registeredBy: 'u1', description: 'شروع رسمی پروژه و ایجاد دسترسی اعضای تیم.', result: 'برنامه اجرایی تایید شد.' },
  { id: 'pe2', projectId: 'p1', personId: 'u4', eventType: 'تحویل نسخه اولیه سایت', stage: 'انجام شد', priority: 'بالا', status: 'completed', date: daysAgo(4), registeredBy: 'u2', description: 'نسخه اولیه برای بازبینی مشتری آماده شد.', result: 'بازخورد مشتری برای مرحله بعد دریافت شد.', attachments: ['دمو-نسخه-اول.pdf'] },
  { id: 'pe3', projectId: 'p2', personId: 'u8', eventType: 'عضویت در پروژه', stage: 'انجام شد', priority: 'عادی', status: 'completed', date: daysAgo(12), registeredBy: 'u6', description: 'ایجاد دسترسی پروژه و شروع فعالیت کارشناس زیرساخت.' },
  { id: 'pe4', projectId: 'p3', personId: 'u5', eventType: 'توافق مالی', stage: 'در حال پیگیری', priority: 'بسیار بالا', status: 'open', date: daysAgo(2), registeredBy: 'u1', description: 'پیگیری مانده قرارداد و زمان‌بندی پرداخت مرحله دوم.', result: 'جلسه مالی با مشتری در انتظار برگزاری است.' },
  { id: 'pe5', projectId: 'p4', personId: 'u3', eventType: 'تغییر وضعیت پروژه', stage: 'ثبت شد', priority: 'بالا', status: 'open', date: daysAgo(7), registeredBy: 'u2', description: 'پروژه به دلیل تغییر اولویت مشتری موقتاً متوقف شد.' },
  { id: 'pe6', personId: 'u9', eventType: 'اخطار', stage: 'انجام شد', priority: 'بسیار بالا', status: 'completed', date: daysAgo(9), registeredBy: 'u1', description: 'ثبت اخطار اداری و جلسه پیگیری عملکرد.', result: 'برنامه اصلاحی با کارمند توافق شد.' },
];

export interface AgentHealthView {
  sampledAt: string | null;
  cpuPercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  osName: string | null;
  osVersion: string | null;
  architecture: string | null;
  agentVersion: string | null;
  collectorPhase: string | null;
  syncPhase: string | null;
  queueDepth: number | null;
  pendingBytes: number | null;
}

export interface AgentUsageProcessView {
  processName: string;
  durationMs: number;
}

export interface AgentScreenView {
  id: string;
  state: string;
  supportName: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  lastAgentAt: string | null;
  endReason: string | null;
  qualityMode: string | null;
  controlState: string | null;
  inputPlane: string | null;
  permittedCapabilities: string[];
  requestNote: string | null;
}

export interface AgentNoticeView {
  code: string;
  source: string;
}

export interface AgentDeviceView {
  id: string;
  deviceName: string;
  employeeName: string | null;
  userName: string | null;
  employeeId: string | null;
  status: string;
  agentVersion: string;
  capabilities: string[];
  platform: string | null;
  osDescription: string | null;
  connectionStatus: 'online' | 'offline';
  connectionVerified: boolean;
  lastSeenAt: string | null;
  enrolledAt: string | null;
  revokedAt: string | null;
  disabledAt: string | null;
  lastSuccessfulSyncAt: string | null;
  healthLastSuccessfulUploadAt: string | null;
  usageLastSuccessfulUploadAt: string | null;
  health: AgentHealthView | null;
  usageProcesses: AgentUsageProcessView[];
  notices: AgentNoticeView[];
  screenAccess: 'own' | 'other' | 'none';
  screenSession: AgentScreenView | null;
  canRevoke: boolean;
  canRequestSupport: boolean;
}

const capabilityLabels: Record<string, string> = {
  'employee-dashboard': 'میز کار',
  'time-entry': 'ثبت زمان',
  'attendance-read': 'مشاهده حضور',
  'application-usage': 'کاربرد برنامه‌ها',
  'device-health': 'سلامت دستگاه',
  'screen-share': 'اشتراک صفحه',
  'remote-control': 'کنترل ورودی',
};

const enrollmentLabels: Record<string, string> = {
  active: 'ثبت‌شده',
  disabled: 'غیرفعال',
  revoked: 'لغو‌شده',
};

const noticeLabels: Record<string, string> = {
  DEVICE_REVOKED: 'ثبت دستگاه لغو شده است.',
  DEVICE_DISABLED: 'دستگاه غیرفعال است.',
  HEARTBEAT_STALE: 'ضربان ذخیره‌شده قدیمی است. اتصال زنده تأیید نشده و دستگاه آفلاین است.',
  CONNECTION_OFFLINE: 'دستگاه اتصال زنده ندارد.',
  HEALTH_SYNC_RETRYING: 'عامل گزارش کرده همگام‌سازی سلامت در حال تلاش دوباره است.',
  HEALTH_SYNC_OFFLINE: 'عامل گزارش کرده همگام‌سازی سلامت آفلاین است.',
  HEALTH_SYNC_REVOKED: 'عامل گزارش کرده همگام‌سازی سلامت به‌خاطر لغو متوقف است.',
  HEALTH_COLLECTOR_OFFLINE: 'عامل گزارش کرده گردآورنده سلامت آفلاین است.',
  HEALTH_COLLECTOR_STOPPED: 'عامل گزارش کرده گردآورنده سلامت متوقف است.',
  HEALTH_COLLECTOR_DISABLED: 'عامل گزارش کرده گردآورنده سلامت غیرفعال است.',
};

const screenStateLabels: Record<string, string> = {
  requested: 'در انتظار پذیرش',
  active: 'فعال',
  ended: 'پایان‌یافته',
};

const controlStateLabels: Record<string, string> = {
  off: 'بدون درخواست کنترل',
  requested: 'درخواست کنترل',
  granted: 'کنترل پذیرفته شده',
  denied: 'کنترل رد شده',
  revoked: 'کنترل لغو شده',
  expired: 'کنترل منقضی شده',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function healthFrom(value: unknown): AgentHealthView | null {
  const row = asRecord(value);
  if (!row) return null;
  return {
    sampledAt: text(row.sampledAt),
    cpuPercent: numberOrNull(row.cpuPercent),
    memoryUsedBytes: numberOrNull(row.memoryUsedBytes),
    memoryTotalBytes: numberOrNull(row.memoryTotalBytes),
    diskFreeBytes: numberOrNull(row.diskFreeBytes),
    diskTotalBytes: numberOrNull(row.diskTotalBytes),
    osName: text(row.osName),
    osVersion: text(row.osVersion),
    architecture: text(row.architecture),
    agentVersion: text(row.agentVersion),
    collectorPhase: text(row.collectorPhase),
    syncPhase: text(row.syncPhase),
    queueDepth: numberOrNull(row.queueDepth),
    pendingBytes: numberOrNull(row.pendingBytes),
  };
}

function processesFrom(value: unknown): AgentUsageProcessView[] {
  if (!Array.isArray(value)) return [];
  const processes: AgentUsageProcessView[] = [];
  for (const item of value) {
    const row = asRecord(item);
    const processName = row ? text(row.processName) : null;
    const durationMs = row ? numberOrNull(row.durationMs) : null;
    if (!processName || durationMs === null) continue;
    processes.push({ processName, durationMs });
  }
  return processes;
}

function screenFrom(value: unknown): AgentScreenView | null {
  const row = asRecord(value);
  const id = row ? text(row.id) : null;
  if (!row || !id) return null;
  return {
    id,
    state: text(row.state) ?? 'requested',
    supportName: text(row.supportName),
    requestedAt: text(row.requestedAt),
    startedAt: text(row.startedAt),
    expiresAt: text(row.expiresAt),
    lastAgentAt: text(row.lastAgentAt),
    endReason: text(row.endReason),
    qualityMode: text(row.qualityMode),
    controlState: text(row.controlState),
    inputPlane: text(row.inputPlane),
    permittedCapabilities: stringList(row.permittedCapabilities),
    requestNote: text(row.requestNote),
  };
}

export function canManageAgentDevices(role: string | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function liveConnectionLabel(connectionVerified: boolean): 'آنلاین' | 'آفلاین' {
  return connectionVerified ? 'آنلاین' : 'آفلاین';
}

export function enrollmentStatusLabel(status: string): string {
  return enrollmentLabels[status] ?? 'نامشخص';
}

export function capabilityLabel(capability: string): string {
  return capabilityLabels[capability] ?? capability;
}

export function noticeLabel(code: string): string {
  return noticeLabels[code] ?? 'وضعیت عامل نیاز به بررسی دارد.';
}

export function screenStateLabel(state: string): string {
  return screenStateLabels[state] ?? 'نامشخص';
}

export function controlStateLabel(state: string): string {
  return controlStateLabels[state] ?? 'نامشخص';
}

export function projectAgentDevice(raw: unknown): AgentDeviceView {
  const row = asRecord(raw) ?? {};
  const telemetry = asRecord(row.telemetry);
  const screen = asRecord(row.screen);
  const access = screen?.access === 'own' || screen?.access === 'other' ? screen.access : 'none';
  const status = text(row.status) ?? 'active';
  const capabilities = stringList(row.capabilities);
  const connectionVerified = row.connectionVerified === true && row.connectionStatus === 'online';
  const screenSession = access === 'own' ? screenFrom(screen?.session) : null;
  const notices = Array.isArray(row.notices)
    ? row.notices.flatMap((item) => {
      const notice = asRecord(item);
      const code = notice ? text(notice.code) : null;
      if (!notice || !code) return [];
      return [{ code, source: text(notice.source) ?? 'enrollment' }];
    })
    : [];
  return {
    id: text(row.id) ?? '',
    deviceName: text(row.deviceName) ?? 'دستگاه بدون نام',
    employeeName: text(row.employeeName),
    userName: text(row.userName),
    employeeId: text(row.employeeId),
    status,
    agentVersion: text(row.agentVersion) ?? '—',
    capabilities,
    platform: text(row.platform),
    osDescription: text(row.osDescription),
    connectionStatus: connectionVerified ? 'online' : 'offline',
    connectionVerified,
    lastSeenAt: text(row.lastSeenAt),
    enrolledAt: text(row.enrolledAt),
    revokedAt: text(row.revokedAt),
    disabledAt: text(row.disabledAt),
    lastSuccessfulSyncAt: telemetry ? text(telemetry.lastSuccessfulSyncAt) : null,
    healthLastSuccessfulUploadAt: telemetry ? text(telemetry.healthLastSuccessfulUploadAt) : null,
    usageLastSuccessfulUploadAt: telemetry ? text(telemetry.usageLastSuccessfulUploadAt) : null,
    health: telemetry ? healthFrom(telemetry.health) : null,
    usageProcesses: telemetry ? processesFrom(telemetry.usageProcesses) : [],
    notices,
    screenAccess: access,
    screenSession,
    canRevoke: status === 'active' || status === 'disabled',
    canRequestSupport: status === 'active' && capabilities.includes('screen-share') && access !== 'other' && screenSession === null,
  };
}

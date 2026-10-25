import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const requestTotals = new Map<string, number>();
const durationCounts = new Map<number, number>();
const securityTotals = new Map<string, number>();
const jobTotals = new Map<string, number>();
let durationSum = 0;
let durationCount = 0;
let activeRequests = 0;
let unhandledErrors = 0;

function increment(map: Map<string, number>, key: string): void { map.set(key, (map.get(key) || 0) + 1); }
function metricLabel(value: string): string { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'); }

export const requestMetricsMiddleware: RequestHandler = (req, res, next) => {
  if (!env.metricsEnabled) return next();
  activeRequests += 1;
  const started = process.hrtime.bigint();
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    activeRequests = Math.max(0, activeRequests - 1);
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    durationSum += seconds; durationCount += 1;
    for (const bucket of durationBuckets) if (seconds <= bucket) durationCounts.set(bucket, (durationCounts.get(bucket) || 0) + 1);
    increment(requestTotals, `${req.method}:${Math.floor(res.statusCode / 100)}xx`);
  };
  res.once('finish', record); res.once('close', record); next();
};

export function recordSecurityEvent(event: string): void { increment(securityTotals, event); }
export function recordJobResult(type: string, status: 'completed' | 'failed'): void { increment(jobTotals, `${type}:${status}`); }
export function recordUnhandledError(): void { unhandledErrors += 1; }

export function renderMetrics(): string {
  const memory = process.memoryUsage();
  const lines = [
    '# HELP trileez_http_active_requests Current in-flight HTTP requests.', '# TYPE trileez_http_active_requests gauge', `trileez_http_active_requests ${activeRequests}`,
    '# HELP trileez_http_requests_total HTTP requests grouped by method and status class.', '# TYPE trileez_http_requests_total counter',
  ];
  for (const [key, value] of [...requestTotals.entries()].sort()) {
    const [method, statusClass] = key.split(':');
    lines.push(`trileez_http_requests_total{method="${metricLabel(method || '')}",status_class="${metricLabel(statusClass || '')}"} ${value}`);
  }
  lines.push('# HELP trileez_http_request_duration_seconds HTTP request duration.', '# TYPE trileez_http_request_duration_seconds histogram');
  for (const bucket of durationBuckets) lines.push(`trileez_http_request_duration_seconds_bucket{le="${bucket}"} ${durationCounts.get(bucket) || 0}`);
  lines.push(`trileez_http_request_duration_seconds_bucket{le="+Inf"} ${durationCount}`, `trileez_http_request_duration_seconds_sum ${durationSum}`, `trileez_http_request_duration_seconds_count ${durationCount}`);
  lines.push('# HELP trileez_security_events_total Security-relevant application events.', '# TYPE trileez_security_events_total counter');
  for (const [event, value] of [...securityTotals.entries()].sort()) lines.push(`trileez_security_events_total{event="${metricLabel(event)}"} ${value}`);
  lines.push('# HELP trileez_background_jobs_total Background job outcomes.', '# TYPE trileez_background_jobs_total counter');
  for (const [key, value] of [...jobTotals.entries()].sort()) {
    const separator = key.lastIndexOf(':');
    lines.push(`trileez_background_jobs_total{type="${metricLabel(key.slice(0, separator))}",status="${metricLabel(key.slice(separator + 1))}"} ${value}`);
  }
  lines.push('# HELP trileez_unhandled_errors_total Unexpected centralized errors.', '# TYPE trileez_unhandled_errors_total counter', `trileez_unhandled_errors_total ${unhandledErrors}`);
  lines.push('# HELP process_uptime_seconds Process uptime.', '# TYPE process_uptime_seconds gauge', `process_uptime_seconds ${process.uptime()}`);
  lines.push('# HELP process_resident_memory_bytes Resident memory size.', '# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes ${memory.rss}`);
  lines.push('# HELP nodejs_heap_size_used_bytes Node.js heap currently used.', '# TYPE nodejs_heap_size_used_bytes gauge', `nodejs_heap_size_used_bytes ${memory.heapUsed}`);
  return `${lines.join('\n')}\n`;
}

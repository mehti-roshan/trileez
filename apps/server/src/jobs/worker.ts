import { env } from '../config/env.js';
import { getJobHandler } from './handlers.js';
import { jobQueue } from './queue.js';
import { recurringTasks } from './recurring.js';
import type { BackgroundJobRecord } from './types.js';
import { logger } from '../observability/logger.js';
import { recordJobResult } from '../observability/metrics.js';

export class BackgroundWorker {
  readonly workerId = jobQueue.workerId();
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private currentTick: Promise<void> | undefined;

  private async process(job: BackgroundJobRecord, now = new Date()): Promise<void> {
    const handler = getJobHandler(job.type);
    const heartbeatMs = Math.max(5_000, Math.floor(env.jobLeaseSeconds * 1000 / 3));
    const heartbeat = setInterval(() => { void jobQueue.heartbeat(job, this.workerId, env.jobLeaseSeconds); }, heartbeatMs);
    heartbeat.unref();
    try {
      if (!handler) throw new Error(`No handler registered for ${job.type}`);
      const result = await handler({ job, now });
      await jobQueue.complete(job, this.workerId, result, new Date());
      recordJobResult(job.type, 'completed');
      logger.info('background_job_completed', { jobId: job.id, jobType: job.type, attempt: job.attempts, organizationId: job.organizationId });
    } catch (error) {
      await jobQueue.fail(job, this.workerId, error, new Date());
      recordJobResult(job.type, 'failed');
      logger.error('background_job_failed', { jobId: job.id, jobType: job.type, attempt: job.attempts, organizationId: job.organizationId, error });
    } finally { clearInterval(heartbeat); }
  }

  async runOnce(now = new Date(), options: { dispatchRecurring?: boolean } = {}): Promise<number> {
    if (options.dispatchRecurring !== false) await recurringTasks.dispatchDue(this.workerId, env.jobLeaseSeconds, now);
    const claimed: BackgroundJobRecord[] = [];
    for (let index = 0; index < env.jobConcurrency; index += 1) {
      const job = await jobQueue.claim(this.workerId, env.jobLeaseSeconds, now);
      if (!job) break;
      claimed.push(job);
    }
    await Promise.all(claimed.map((job) => this.process(job, now)));
    return claimed.length;
  }

  async runUntilIdle(options: { now?: Date; maximumPasses?: number; dispatchRecurring?: boolean } = {}): Promise<number> {
    let processed = 0;
    for (let pass = 0; pass < (options.maximumPasses || 100); pass += 1) {
      const count = await this.runOnce(options.now || new Date(), { dispatchRecurring: options.dispatchRecurring !== false && pass === 0 });
      processed += count;
      if (count === 0) break;
    }
    return processed;
  }

  start(): void {
    if (this.timer || !env.jobsEnabled) return;
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try { await this.runOnce(); } catch (error) { logger.error('background_worker_tick_failed', { workerId: this.workerId, error }); }
      finally { this.running = false; }
    };
    const runTick = () => {
      if (this.running) return;
      let tracked!: Promise<void>;
      tracked = tick().finally(() => { if (this.currentTick === tracked) this.currentTick = undefined; });
      this.currentTick = tracked;
    };
    runTick();
    this.timer = setInterval(runTick, env.jobPollIntervalMs);
    this.timer.unref();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  async stopAndDrain(timeoutMs = env.shutdownTimeoutMs): Promise<void> {
    this.stop();
    if (!this.currentTick) return;
    await Promise.race([
      this.currentTick,
      new Promise<void>((resolve) => setTimeout(() => {
        logger.warn('background_worker_drain_timeout', { workerId: this.workerId, timeoutMs });
        resolve();
      }, timeoutMs)),
    ]);
  }

  isRunning(): boolean { return this.running; }
}

export const backgroundWorker = new BackgroundWorker();

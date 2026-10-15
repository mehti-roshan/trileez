function serializedError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  return { name: 'Error', message: String(error) };
}

export async function runEntrypoint(component: string, load: () => Promise<unknown>): Promise<void> {
  try {
    await load();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: process.env.SERVICE_NAME || 'trivix-panel-api',
      version: process.env.APP_VERSION || 'unknown',
      pid: process.pid,
      message: 'service_bootstrap_failed',
      component,
      error: serializedError(error),
    })}\n`);
    process.exitCode = 1;
  }
}

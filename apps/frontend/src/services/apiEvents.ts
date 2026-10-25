export interface ApiFailureEvent {
  message: string;
  operation?: string;
  resource?: string;
}

const listeners = new Set<(event: ApiFailureEvent) => void>();

export function reportApiFailure(event: ApiFailureEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeApiFailures(listener: (event: ApiFailureEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

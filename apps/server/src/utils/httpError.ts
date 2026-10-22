export class HttpError extends Error {
  readonly code?: string;

  constructor(public readonly statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    if (code) this.code = code;
  }
}

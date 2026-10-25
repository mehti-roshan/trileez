import type { RequestHandler } from 'express';

export interface ValidationIssue {
  location: 'body' | 'params' | 'query' | 'relationship';
  path: string;
  code: string;
  message: string;
}

export class RequestValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
  constructor(public readonly issues: ValidationIssue[]) {
    super('Validation failed');
    this.name = 'RequestValidationError';
  }
}

export interface ValueSchema<T> {
  parse(value: unknown, path: string, location: ValidationIssue['location']): T;
}

export type InferSchema<S> = S extends ValueSchema<infer T> ? T : never;

function issue(location: ValidationIssue['location'], path: string, code: string, message: string): never {
  throw new RequestValidationError([{ location, path, code, message }]);
}

function schema<T>(parser: ValueSchema<T>['parse']): ValueSchema<T> { return { parse: parser }; }

const string = (options: { min?: number; max?: number; pattern?: RegExp; values?: readonly string[]; trim?: boolean } = {}) => schema<string>((value, path, location) => {
  if (typeof value !== 'string') return issue(location, path, 'invalid_type', 'Expected a string');
  const output = options.trim === false ? value : value.trim();
  if (options.min !== undefined && output.length < options.min) return issue(location, path, 'too_small', `Must contain at least ${options.min} characters`);
  if (options.max !== undefined && output.length > options.max) return issue(location, path, 'too_large', `Must contain at most ${options.max} characters`);
  if (options.pattern && !options.pattern.test(output)) return issue(location, path, 'invalid_format', 'Invalid format');
  if (options.values && !options.values.includes(output)) return issue(location, path, 'invalid_enum', `Expected one of: ${options.values.join(', ')}`);
  return output;
});

const number = (options: { min?: number; max?: number; integer?: boolean; coerce?: boolean } = {}) => schema<number>((value, path, location) => {
  const output = options.coerce && typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof output !== 'number' || !Number.isFinite(output)) return issue(location, path, 'invalid_type', 'Expected a finite number');
  if (options.integer && !Number.isInteger(output)) return issue(location, path, 'invalid_number', 'Expected an integer');
  if (options.min !== undefined && output < options.min) return issue(location, path, 'too_small', `Must be at least ${options.min}`);
  if (options.max !== undefined && output > options.max) return issue(location, path, 'too_large', `Must be at most ${options.max}`);
  return output;
});

const boolean = (options: { coerce?: boolean } = {}) => schema<boolean>((value, path, location) => {
  if (options.coerce && (value === 'true' || value === 'false')) return value === 'true';
  if (typeof value !== 'boolean') return issue(location, path, 'invalid_type', 'Expected a boolean');
  return value;
});

const date = schema<string>((value, path, location) => {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) return issue(location, path, 'invalid_date', 'Expected a valid date');
  return value;
});

const identifier = schema<string>((value, path, location) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) return issue(location, path, 'invalid_id', 'Expected a valid identifier');
  return value;
});

const email = schema<string>((value, path, location) => {
  const output = string({ min: 3, max: 254 }).parse(value, path, location).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output)) return issue(location, path, 'invalid_email', 'Expected a valid email address');
  return output;
});

function optional<T>(inner: ValueSchema<T>): ValueSchema<T | undefined> {
  return schema((value, path, location) => value === undefined || value === null || value === '' ? undefined : inner.parse(value, path, location));
}

function array<T>(inner: ValueSchema<T>, options: { max?: number; coerceJson?: boolean } = {}): ValueSchema<T[]> {
  return schema((value, path, location) => {
    let input = value;
    if (options.coerceJson && typeof input === 'string') {
      try { input = JSON.parse(input); } catch { return issue(location, path, 'invalid_json', 'Expected a JSON array'); }
    }
    if (!Array.isArray(input)) return issue(location, path, 'invalid_type', 'Expected an array');
    if (options.max !== undefined && input.length > options.max) return issue(location, path, 'too_large', `Must contain at most ${options.max} items`);
    const output: T[] = [];
    const issues: ValidationIssue[] = [];
    input.forEach((item, index) => {
      try { output.push(inner.parse(item, `${path}.${index}`, location)); } catch (error) { if (error instanceof RequestValidationError) issues.push(...error.issues); else throw error; }
    });
    if (issues.length) throw new RequestValidationError(issues);
    return output;
  });
}

function safeJson(value: unknown, path: string, location: ValidationIssue['location'], depth = 0): unknown {
  if (depth > 6) return issue(location, path, 'too_deep', 'Nested value is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => safeJson(item, `${path}.${index}`, location, depth + 1));
  if (typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) return issue(location, `${path}.${key}`, 'unsafe_key', 'Unsafe object key');
      output[key] = safeJson(item, `${path}.${key}`, location, depth + 1);
    }
    return output;
  }
  return issue(location, path, 'invalid_type', 'Expected a JSON-compatible value');
}

const json = schema<unknown>((value, path, location) => safeJson(value, path, location));
const jsonObject = schema<Record<string, unknown>>((value, path, location) => {
  const output = safeJson(value, path, location);
  if (!output || typeof output !== 'object' || Array.isArray(output)) return issue(location, path, 'invalid_type', 'Expected an object');
  return output as Record<string, unknown>;
});

type Shape = Record<string, ValueSchema<unknown>>;
type ShapeOutput<S extends Shape> = { [K in keyof S]: InferSchema<S[K]> };

function object<S extends Shape>(shape: S, options: { strip?: readonly string[]; atLeastOne?: boolean } = {}): ValueSchema<ShapeOutput<S>> {
  return schema((value, path, location) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return issue(location, path, 'invalid_type', 'Expected an object');
    const input = value as Record<string, unknown>;
    const strip = new Set(options.strip || []);
    const allowed = new Set(Object.keys(shape));
    const issues: ValidationIssue[] = [];
    for (const key of Object.keys(input)) if (!allowed.has(key) && !strip.has(key)) issues.push({ location, path: `${path}.${key}`, code: 'unknown_field', message: 'Unknown or immutable field' });
    const output: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(shape)) {
      try {
        const parsed = field.parse(input[key], `${path}.${key}`, location);
        if (parsed !== undefined) output[key] = parsed;
      } catch (error) { if (error instanceof RequestValidationError) issues.push(...error.issues); else throw error; }
    }
    if (options.atLeastOne && Object.keys(output).length === 0) issues.push({ location, path, code: 'empty_update', message: 'At least one mutable field is required' });
    if (issues.length) throw new RequestValidationError(issues);
    return output as ShapeOutput<S>;
  });
}

export const v = { string, number, boolean, date, id: identifier, email, optional, array, object, json, jsonObject };

export function validateRequest(schemas: { body?: ValueSchema<unknown>; params?: ValueSchema<unknown>; query?: ValueSchema<unknown> }): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body, 'body', 'body');
      if (schemas.params) req.params = schemas.params.parse(req.params, 'params', 'params') as typeof req.params;
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query, 'query', 'query') as Record<string, unknown>;
      next();
    } catch (error) { next(error); }
  };
}

export function relationshipIssue(path: string, message = 'Related record does not exist'): RequestValidationError {
  return new RequestValidationError([{ location: 'relationship', path, code: 'invalid_relationship', message }]);
}

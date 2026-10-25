import { createHash, createHmac } from 'node:crypto';
import http, { type IncomingMessage, type RequestOptions } from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { env } from '../config/env.js';
import { retryWithBackoff } from '../utils/retry.js';

interface StoredObject {
  body: Buffer;
  contentType: string;
  etag: string;
  createdAt: Date;
}

export interface StoredObjectMetadata {
  objectKey: string;
  sizeBytes: number;
  contentType: string;
  etag: string;
  lastModified?: Date;
}

class StorageHttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

const memoryObjects = new Map<string, StoredObject>();
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest();
const awsEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const objectPath = (objectKey?: string) => `/${awsEncode(env.s3Bucket)}${objectKey ? `/${objectKey.split('/').map(awsEncode).join('/')}` : ''}`;
const emptyPayloadHash = sha256(Buffer.alloc(0));

function canonicalQuery(parameters: Record<string, string> = {}): string {
  return Object.entries(parameters).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`).join('&');
}

function signedOptions(method: string, path: string, query: Record<string, string>, payloadHash: string, contentLength?: number, contentType?: string): RequestOptions {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const defaultPort = env.s3UseSsl ? 443 : 80;
  const host = env.s3Port === defaultPort ? env.s3Endpoint : `${env.s3Endpoint}:${env.s3Port}`;
  const headers: Record<string, string> = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  if (contentLength !== undefined) headers['content-length'] = String(contentLength);
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]!.trim()}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const encodedQuery = canonicalQuery(query);
  const canonicalRequest = [method, path, encodedQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/us-east-1/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac(`AWS4${env.s3SecretKey}`, date);
  const regionKey = hmac(dateKey, 'us-east-1');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${env.s3AccessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    protocol: env.s3UseSsl ? 'https:' : 'http:', hostname: env.s3Endpoint, port: env.s3Port, method,
    path: encodedQuery ? `${path}?${encodedQuery}` : path, headers,
  };
}

async function s3Request(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: Buffer | Readable; payloadHash?: string; contentLength?: number; contentType?: string } = {},
): Promise<IncomingMessage> {
  const transport = env.s3UseSsl ? https : http;
  const body = options.body;
  const payloadHash = options.payloadHash || (Buffer.isBuffer(body) ? sha256(body) : emptyPayloadHash);
  const contentLength = options.contentLength ?? (Buffer.isBuffer(body) ? body.byteLength : undefined);
  return new Promise((resolve, reject) => {
    const request = transport.request(signedOptions(method, path, options.query || {}, payloadHash, contentLength, options.contentType), (response) => {
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) return resolve(response);
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => reject(new StorageHttpError(response.statusCode || 500, Buffer.concat(chunks).toString('utf8') || `S3 storage request failed (${response.statusCode})`)));
    });
    request.setTimeout(env.dependencyTimeoutMs, () => request.destroy(new Error(`S3 request timed out after ${env.dependencyTimeoutMs}ms`)));
    request.on('error', reject);
    if (body instanceof Readable) {
      body.on('error', reject);
      body.pipe(request);
    } else {
      if (body?.byteLength) request.write(body);
      request.end();
    }
  });
}

async function drain(response: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function xmlDecode(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

async function ensureS3Bucket(): Promise<void> {
  if (env.storageDriver !== 's3') return;
  try { await drain(await s3Request('HEAD', objectPath())); }
  catch (error) {
    if (!(error instanceof StorageHttpError) || error.statusCode !== 404) throw error;
    await drain(await s3Request('PUT', objectPath()));
  }
}

export function isStorageNotFound(error: unknown): boolean {
  return error instanceof StorageHttpError && error.statusCode === 404;
}

export async function initializeObjectStorage(): Promise<void> {
  if (env.storageDriver !== 's3') return;
  await retryWithBackoff('object-storage.initialize', ensureS3Bucket, { attempts: env.startupMaxAttempts, baseDelayMs: env.startupRetryBaseMs });
}

export const objectStorage = {
  driver: env.storageDriver,
  bucket: env.s3Bucket,

  async put(objectKey: string, body: Buffer, contentType: string): Promise<{ etag: string }> {
    const contentHash = sha256(body);
    return this.putStream(objectKey, Readable.from(body), body.byteLength, contentType, contentHash);
  },

  async putStream(objectKey: string, body: Readable, sizeBytes: number, contentType: string, contentSha256: string): Promise<{ etag: string }> {
    if (env.storageDriver !== 's3') {
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const value = Buffer.concat(chunks);
      if (value.byteLength !== sizeBytes || sha256(value) !== contentSha256) throw new Error('Upload stream integrity check failed');
      const etag = contentSha256;
      memoryObjects.set(objectKey, { body: value, contentType, etag, createdAt: new Date() });
      return { etag };
    }
    const response = await s3Request('PUT', objectPath(objectKey), { body, contentType, contentLength: sizeBytes, payloadHash: contentSha256 });
    const etag = String(response.headers.etag || '').replace(/^"|"$/g, '');
    await drain(response);
    return { etag };
  },

  async get(objectKey: string): Promise<Readable> {
    if (env.storageDriver !== 's3') {
      const object = memoryObjects.get(objectKey);
      if (!object) throw new StorageHttpError(404, 'Stored object not found');
      return Readable.from(object.body);
    }
    return s3Request('GET', objectPath(objectKey));
  },

  async stat(objectKey: string): Promise<StoredObjectMetadata> {
    if (env.storageDriver !== 's3') {
      const object = memoryObjects.get(objectKey);
      if (!object) throw new StorageHttpError(404, 'Stored object not found');
      return { objectKey, sizeBytes: object.body.byteLength, contentType: object.contentType, etag: object.etag, lastModified: object.createdAt };
    }
    const response = await s3Request('HEAD', objectPath(objectKey));
    const result = {
      objectKey,
      sizeBytes: Number(response.headers['content-length'] || 0),
      contentType: String(response.headers['content-type'] || 'application/octet-stream'),
      etag: String(response.headers.etag || '').replace(/^"|"$/g, ''),
      ...(response.headers['last-modified'] ? { lastModified: new Date(String(response.headers['last-modified'])) } : {}),
    };
    await drain(response);
    return result;
  },

  async list(prefix: string): Promise<StoredObjectMetadata[]> {
    if (env.storageDriver !== 's3') return [...memoryObjects.entries()].filter(([key]) => key.startsWith(prefix)).map(([objectKey, object]) => ({
      objectKey, sizeBytes: object.body.byteLength, contentType: object.contentType, etag: object.etag, lastModified: object.createdAt,
    }));
    const results: StoredObjectMetadata[] = [];
    let continuationToken = '';
    do {
      const query = { 'list-type': '2', prefix, ...(continuationToken ? { 'continuation-token': continuationToken } : {}) };
      const xml = (await drain(await s3Request('GET', objectPath(), { query }))).toString('utf8');
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const block = match[1] || '';
        const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1];
        if (!key) continue;
        const lastModified = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1];
        results.push({
          objectKey: xmlDecode(key), sizeBytes: Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] || 0), contentType: 'application/octet-stream',
          etag: String(/<ETag>"?([\s\S]*?)"?<\/ETag>/.exec(block)?.[1] || ''), ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
        });
      }
      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      continuationToken = truncated ? xmlDecode(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || '') : '';
    } while (continuationToken);
    return results;
  },

  async remove(objectKey: string): Promise<void> {
    if (env.storageDriver !== 's3') { memoryObjects.delete(objectKey); return; }
    try { await drain(await s3Request('DELETE', objectPath(objectKey))); }
    catch (error) { if (!isStorageNotFound(error)) throw error; }
  },

  async healthy(): Promise<boolean> {
    if (env.storageDriver !== 's3') return true;
    try { await drain(await s3Request('HEAD', objectPath())); return true; } catch { return false; }
  },
};

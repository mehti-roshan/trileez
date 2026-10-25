import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Request } from 'express';
import type multer from 'multer';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const uploadDirectory = join(tmpdir(), 'trileez-streaming-uploads');
mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });

export const blockedUploadExtensions = new Set([
  '.app', '.bat', '.cmd', '.com', '.cpl', '.exe', '.hta', '.js', '.jse', '.msi', '.msp', '.pif', '.ps1', '.scr', '.vbs', '.vbe', '.wsf', '.sh', '.elf',
]);

const allowedMimeTypes = new Set([
  'application/pdf', 'application/json', 'application/zip', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-office', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'text/plain', 'text/csv', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav',
]);

export const streamingUploadStorage: multer.StorageEngine = {
  _handleFile(_request: Request, file, done) {
    const filename = randomUUID();
    const path = join(uploadDirectory, filename);
    const output = createWriteStream(path, { flags: 'wx', mode: 0o600 });
    let size = 0;
    file.stream.on('data', (chunk: Buffer) => { size += chunk.length; });
    file.stream.on('error', done);
    output.on('error', done);
    output.on('finish', () => done(null, { destination: uploadDirectory, filename, path, size }));
    file.stream.pipe(output);
  },
  _removeFile(_request: Request, file, done) {
    const path = (file as Express.Multer.File).path;
    if (!path) return done(null);
    unlink(path).then(() => done(null)).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? done(null) : done(error));
  },
};

function starts(buffer: Buffer, bytes: number[]): boolean { return bytes.every((byte, index) => buffer[index] === byte); }
function ascii(buffer: Buffer): string { return buffer.toString('utf8').replace(/^\uFEFF/, ''); }

function detectZipType(buffer: Buffer): string {
  const content = buffer.toString('latin1');
  if (content.includes('[Content_Types].xml')) {
    if (content.includes('word/')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (content.includes('xl/')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (content.includes('ppt/')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return 'application/zip';
}

function detectTextType(buffer: Buffer): string | undefined {
  if (buffer.includes(0)) return undefined;
  const value = ascii(buffer).trimStart();
  if (!value) return 'text/plain';
  const lower = value.slice(0, 512).toLowerCase();
  if (lower.startsWith('<!doctype html') || lower.startsWith('<html') || lower.startsWith('<script') || lower.startsWith('<svg')) {
    throw new HttpError(415, 'Active HTML, SVG, and script documents are not accepted as uploads');
  }
  if (value.startsWith('#!')) throw new HttpError(415, 'Executable scripts are not accepted as uploads');
  const replacementCount = (value.match(/\uFFFD/g) || []).length;
  if (replacementCount > Math.max(2, value.length / 100)) return undefined;
  if (value.startsWith('{') || value.startsWith('[')) {
    try { JSON.parse(value); return 'application/json'; } catch { /* ordinary text */ }
  }
  return 'text/plain';
}

export function detectMimeType(buffer: Buffer): string {
  if (starts(buffer, [0x4d, 0x5a]) || starts(buffer, [0x7f, 0x45, 0x4c, 0x46])) throw new HttpError(415, 'Executable binary files are not accepted');
  if (starts(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (starts(buffer, [0x50, 0x4b, 0x03, 0x04]) || starts(buffer, [0x50, 0x4b, 0x05, 0x06]) || starts(buffer, [0x50, 0x4b, 0x07, 0x08])) return detectZipType(buffer);
  if (starts(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'application/vnd.ms-office';
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (starts(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || starts(buffer, [0xff, 0xfb]) || starts(buffer, [0xff, 0xf3]) || starts(buffer, [0xff, 0xf2])) return 'audio/mpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  const textType = detectTextType(buffer);
  if (textType) return textType;
  throw new HttpError(415, 'The uploaded file content type is not supported');
}

export async function inspectUpload(path: string, expectedSize: number): Promise<{ sha256: string; detectedMimeType: string }> {
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) throw new HttpError(400, 'Empty files are not accepted');
  if (expectedSize > env.maxUploadBytes) throw new HttpError(413, `File exceeds the ${env.maxUploadBytes} byte upload limit`);
  const handle = await open(path, 'r');
  let prefix: Buffer;
  try {
    const length = Math.min(expectedSize, 256 * 1024);
    prefix = Buffer.alloc(length);
    const result = await handle.read(prefix, 0, length, 0);
    prefix = prefix.subarray(0, result.bytesRead);
  } finally { await handle.close(); }
  const detectedMimeType = detectMimeType(prefix);
  if (!allowedMimeTypes.has(detectedMimeType)) throw new HttpError(415, `File content type ${detectedMimeType} is not allowed`);
  const hash = createHash('sha256');
  let bytesRead = 0;
  for await (const chunk of createReadStream(path)) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); bytesRead += value.length; hash.update(value); }
  if (bytesRead !== expectedSize) throw new HttpError(400, 'Upload size changed while it was being processed');
  return { sha256: hash.digest('hex'), detectedMimeType };
}

export function validateUploadName(name: string): void {
  if (blockedUploadExtensions.has(extname(name).toLowerCase())) throw new HttpError(415, 'Executable file types are not allowed');
}

export function isInlineSafeMime(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType === 'text/plain' || mimeType.startsWith('image/');
}

export async function removeTemporaryUpload(path?: string): Promise<void> {
  if (!path) return;
  await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}

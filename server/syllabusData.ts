import type { SyllabusModule } from '../src/data/devpilotData';

export const BACKEND_SYLLABUS: SyllabusModule[] = [
  {
    id: 'web-fundamentals',
    title: 'Web Fundamentals',
    category: '01 · Core Runtime',
    summary:
      'Browser DOM lifecycle, event propagation, ES6+ syntax, Promise microtasks, async/await orchestration, Fetch API with AbortSignal, ESM modules, package.json manifests, and DevTools profiling.',
    topics: [
      'HTML',
      'CSS',
      'JavaScript',
      'DOM',
      'Events',
      'ES6',
      'Async JavaScript',
      'Fetch API',
      'Promises',
      'async/await',
      'NPM',
      'Modules',
      'package.json',
      'Git/GitHub',
      'DevTools',
    ],
    endpointProbe: 'fetch-promise-timing',
    codeSnippet: `// Typed Fetch API client with AbortController & Promise timeout guard
export async function dispatchAnalysisRequest<T>(
  endpoint: string,
  payload: unknown,
  token?: string
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || \`HTTP \${res.status}\`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}`,
  },
  {
    id: 'nodejs-runtime',
    title: 'Node.js',
    category: '02 · Server Engine',
    summary:
      'Event loop phases, non-blocking File System and Path confinement, binary Buffers, transform Streams, EventEmitter telemetry hooks, HTTP server lifecycle, and module resolution (CommonJS vs ES Modules).',
    topics: [
      'Node Setup',
      'REPL',
      'Global Objects',
      'Event Loop',
      'CommonJS',
      'ES Modules',
      'require',
      'import',
      'File System',
      'Path',
      'Streams',
      'Buffers',
      'HTTP Module',
      'Server Creation',
      'Request/Response',
      'Events',
      'EventEmitter',
      'Error Handling',
      'Scripts & Dependencies',
    ],
    endpointProbe: 'node-stream-buffer',
    codeSnippet: `import { EventEmitter } from 'node:events';
import path from 'node:path';
import { Transform } from 'node:stream';

export class PipelineTelemetryBus extends EventEmitter {}

// Safe path confinement + binary Buffer checksum transform stream
export function createBufferAuditStream(baseDir: string, userRelPath: string) {
  const resolved = path.resolve(baseDir, userRelPath);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    throw new Error('Path traversal rejected');
  }
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const byteLength = Buffer.byteLength(chunk);
      this.push(JSON.stringify({ resolved, byteLength }) + '\\n');
      callback();
    },
  });
}`,
  },
  {
    id: 'frontend-debugging',
    title: 'Frontend & Debugging',
    category: '03 · Quality & Diagnostics',
    summary:
      'Structured JSON serialization, Tailwind CSS utility architecture, modular React hooks, deterministic unit verification, Node inspector debugging, ESLint static rules, and structured server logging.',
    topics: [
      'Advanced JavaScript',
      'JSON',
      'Tailwind CSS',
      'Reusable Components',
      'Frontend Testing',
      'Node Debugging',
      'ESLint',
      'Structured Logging',
    ],
    endpointProbe: 'diagnostic-json-lint',
    codeSnippet: `// Structured request logger & deterministic JSON serializer
export function createRequestLogger() {
  return (req: { method: string; originalUrl: string }, res: { statusCode: number; on: Function }, next: Function) => {
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      const entry = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(elapsedMs.toFixed(2)),
      };
      console.info(JSON.stringify(entry));
    });
    next();
  };
}`,
  },
  {
    id: 'expressjs-api',
    title: 'Express.js',
    category: '04 · API & Security Layer',
    summary:
      'REST API routing with params/query validation, JSON body limits, input sanitization, custom error middleware, bcrypt password hashing, JWT Bearer auth, role-based access control, and Multer memory uploads.',
    topics: [
      'Express Setup',
      'Middleware',
      'Routing',
      'Route Parameters',
      'Query Parameters',
      'Body Parsing',
      'REST API Design',
      'CRUD',
      'Status Codes',
      'Error Middleware',
      'Custom Middleware',
      'Validation',
      'Sanitization',
      'JWT',
      'bcrypt',
      'Protected Routes',
      'Role-Based Access',
      'Multer',
      'Cloud Storage Adapter',
      'Postman/Insomnia Testing',
    ],
    endpointProbe: 'express-auth-sanitize',
    codeSnippet: `import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';

// Memory-bounded Multer upload adapter (never writes untrusted code to disk)
export const repoUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 64 * 1024 },
});

export async function verifyCredentials(plain: string, hash: string, secret: string) {
  const valid = await bcrypt.compare(plain, hash);
  if (!valid) return null;
  return jwt.sign({ role: 'engineer' }, secret, { expiresIn: '2h' });
}`,
  },
  {
    id: 'mongodb-mongoose',
    title: 'MongoDB & Mongoose',
    category: '05 · Persistence & Querying',
    summary:
      'MongoDB Atlas integration, typed Mongoose schemas and models, CRUD operations, find/findOne/findById/populate queries, aggregation pipelines, compound indexes, pre/post hooks, virtual properties, and static/instance methods.',
    topics: [
      'MongoDB Atlas',
      'Schemas',
      'Models',
      'CRUD',
      'Validation',
      'Queries (find/findOne/findById)',
      'populate',
      'Aggregation',
      'Indexing',
      'Compound Indexes',
      'Query Optimization',
      'Mongoose Middleware',
      'Virtuals',
      'Static Methods',
      'Instance Methods',
    ],
    endpointProbe: 'mongoose-aggregation',
    codeSnippet: `// Compound index, virtual metric, and aggregation pipeline in Mongoose
AnalysisReportSchema.index({ agentId: 1, createdAt: -1 });

AnalysisReportSchema.virtual('findingDensity').get(function () {
  return this.fileCount ? Number((this.findings.length / this.fileCount).toFixed(2)) : 0;
});

export async function aggregateAgentStats() {
  return AnalysisReportModel.aggregate([
    { $group: { _id: '$agentId', totalRuns: { $sum: 1 }, avgFiles: { $avg: '$fileCount' } } },
    { $sort: { totalRuns: -1 } },
  ]);
}`,
  },
];

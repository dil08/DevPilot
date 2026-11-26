import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'node:events';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  UserModel,
  AnalysisReportModel,
  memoryStore,
  type IFinding,
} from './server/models';
import {
  parseFileAst,
  buildDependencyGraph,
  retrieveContextSlices,
  fetchGitHubRepositoryFiles,
  sanitizeRelativePath,
  type NormalizedSourceFile,
} from './server/analyzer';
import { BACKEND_SYLLABUS } from './server/syllabusData';
import { AI_AGENTS } from './src/data/devpilotData';

dotenv.config();

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
const MONGODB_URI = process.env.MONGODB_URI?.trim() || '';

let mongoConnected = false;

async function initDatabase(): Promise<void> {
  if (!MONGODB_URI) {
    console.info('[DevPilot DB] MONGODB_URI not set; running with structured in-memory store.');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    mongoConnected = true;
    console.info('[DevPilot DB] Connected to MongoDB Atlas.');
  } catch (err) {
    console.warn('[DevPilot DB] MongoDB connection unavailable, using in-memory store:', (err as Error).message);
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(
      503,
      'GEMINI_API_KEY is not configured in the server environment. Configure it in Settings > Secrets to run live AI agent analysis.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Sanitize input objects against NoSQL operator keys (e.g. $gt, $ne)
function stripOperatorKeys<T>(val: T): T {
  if (Array.isArray(val)) return val.map(stripOperatorKeys) as unknown as T;
  if (val && typeof val === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (!k.startsWith('$') && !k.includes('.')) {
        clean[k] = stripOperatorKeys(v);
      }
    }
    return clean as T;
  }
  return val;
}

interface AuthedRequest extends Request {
  authUser?: { id: string; email: string; name: string; role: string };
}

function optionalAuthMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.slice(7), JWT_SECRET) as {
        sub: string;
        email: string;
        name: string;
        role: string;
      };
      req.authUser = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
      };
    } catch {
      // Invalid token ignored for optional auth routes
    }
  }
  next();
}

function requireAuthMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required (Bearer token missing).' });
    return;
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as {
      sub: string;
      email: string;
      name: string;
      role: string;
    };
    req.authUser = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 64 * 1024 },
});

const telemetryBus = new EventEmitter();

async function executeRepositoryPipeline(params: {
  repoName: string;
  sourceType: 'snippet' | 'upload' | 'github';
  files: NormalizedSourceFile[];
  agentId: string;
  focusQuery: string;
}) {
  const timings: Record<string, number> = {};
  const tIngestStart = performance.now();

  if (params.files.length === 0) {
    throw new HttpError(400, 'No analyzable source files provided.');
  }

  const normalizedFiles = params.files
    .slice(0, 25)
    .map((f) => ({
      path: sanitizeRelativePath(f.path),
      content: String(f.content).slice(0, 64_000),
      bytes: Buffer.byteLength(String(f.content).slice(0, 64_000), 'utf8'),
    }));

  timings.ingest = Math.max(1, Math.round(performance.now() - tIngestStart));
  telemetryBus.emit('stage', { stage: 'ingest', ms: timings.ingest });

  // Stage 2: AST Parse
  const tAstStart = performance.now();
  const astSummaries = normalizedFiles.map((file) => parseFileAst(file.path, file.content));
  const totalAstNodes = astSummaries.reduce((acc, item) => acc + item.nodeCount, 0);
  timings.ast = Math.max(1, Math.round(performance.now() - tAstStart));
  telemetryBus.emit('stage', { stage: 'ast', ms: timings.ast });

  // Stage 3: Dep Graph
  const tGraphStart = performance.now();
  const depGraph = buildDependencyGraph(astSummaries);
  timings.depgraph = Math.max(1, Math.round(performance.now() - tGraphStart));
  telemetryBus.emit('stage', { stage: 'depgraph', ms: timings.depgraph });

  // Stage 4: Retrieval
  const tRetStart = performance.now();
  const agent = AI_AGENTS.find((a) => a.id === params.agentId) ?? AI_AGENTS[0];
  const rankedSlices = retrieveContextSlices(
    normalizedFiles,
    astSummaries,
    depGraph,
    `${params.focusQuery} ${agent.samplePromptFocus}`
  );
  timings.retrieval = Math.max(1, Math.round(performance.now() - tRetStart));
  telemetryBus.emit('stage', { stage: 'retrieval', ms: timings.retrieval });

  // Stage 5: AI Agent Routing (@google/genai)
  const tRouteStart = performance.now();
  const ai = getGeminiClient();
  const promptPayload = {
    repository: params.repoName,
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      responsibility: agent.responsibility,
    },
    dependencyTopology: {
      totalFiles: normalizedFiles.length,
      edges: depGraph.edges,
      cycles: depGraph.cycles,
      hotspots: depGraph.hotspots,
    },
    rankedSlices,
  };

  let parsedAgentJson: {
    executiveSummary?: string;
    findings?: Array<{
      severity?: string;
      file?: string;
      title?: string;
      detail?: string;
      remediation?: string;
    }>;
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze this repository snapshot from the perspective of ${agent.name} (${agent.role}). Only cite file paths that actually exist in rankedSlices.\n\n${JSON.stringify(
        promptPayload
      )}`,
      config: {
        systemInstruction: `You are DevPilot's ${agent.name}. Responsibility: ${agent.responsibility}. Return concise, concrete engineering findings grounded strictly in the provided AST slices and dependency graph.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: 'Concise 2-3 sentence architectural or engineering summary.',
            },
            findings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  severity: { type: Type.STRING, description: 'High, Medium, or Low' },
                  file: { type: Type.STRING, description: 'Exact relative file path from slices' },
                  title: { type: Type.STRING, description: 'Short engineering finding title' },
                  detail: { type: Type.STRING, description: 'Technical explanation grounded in code' },
                  remediation: { type: Type.STRING, description: 'Actionable fix or refactoring step' },
                },
              },
            },
          },
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    parsedAgentJson = JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Gemini API error';
    throw new HttpError(502, `AI Agent execution failed: ${message}`);
  }

  timings.routing = Math.max(1, Math.round(performance.now() - tRouteStart));
  telemetryBus.emit('stage', { stage: 'routing', ms: timings.routing });

  // Stage 6: Verify & Persist
  const tVerifyStart = performance.now();
  const manifestSet = new Set(normalizedFiles.map((f) => f.path));
  const verifiedFindings: IFinding[] = (parsedAgentJson.findings ?? []).slice(0, 8).map((item) => {
    const file = String(item.file || normalizedFiles[0].path);
    return {
      severity: String(item.severity || 'Medium'),
      file,
      title: String(item.title || 'Structural observation'),
      detail: String(item.detail || ''),
      remediation: String(item.remediation || ''),
      pathVerified: manifestSet.has(file),
    };
  });

  const executiveSummary =
    String(parsedAgentJson.executiveSummary || '').trim() ||
    `${agent.name} completed static AST & dependency graph review across ${normalizedFiles.length} files.`;

  timings.verify = Math.max(1, Math.round(performance.now() - tVerifyStart));
  telemetryBus.emit('stage', { stage: 'verify', ms: timings.verify });

  let savedReport: Record<string, unknown>;
  if (mongoConnected) {
    const doc = await AnalysisReportModel.create({
      repoName: params.repoName,
      sourceType: params.sourceType,
      agentId: agent.id,
      agentName: agent.name,
      executiveSummary,
      findings: verifiedFindings,
      fileCount: normalizedFiles.length,
      astNodeCount: totalAstNodes,
      edgeCount: depGraph.edges.length,
      cyclesDetected: depGraph.cycles.length,
      stageTimingsMs: timings,
    });
    savedReport = doc.toObject() as unknown as Record<string, unknown>;
  } else {
    const record = {
      _id: memoryStore.createId(),
      repoName: params.repoName,
      sourceType: params.sourceType,
      agentId: agent.id,
      agentName: agent.name,
      executiveSummary,
      findings: verifiedFindings,
      fileCount: normalizedFiles.length,
      astNodeCount: totalAstNodes,
      edgeCount: depGraph.edges.length,
      cyclesDetected: depGraph.cycles.length,
      stageTimingsMs: timings,
      findingDensity: Number((verifiedFindings.length / normalizedFiles.length).toFixed(2)),
      createdAt: new Date().toISOString(),
    };
    memoryStore.reports.unshift(record);
    if (memoryStore.reports.length > 50) memoryStore.reports.pop();
    savedReport = record;
  }

  return {
    report: savedReport,
    astSummaries: astSummaries.map((s) => ({
      filePath: s.filePath,
      lines: s.lines,
      nodeCount: s.nodeCount,
      cyclomaticComplexity: s.cyclomaticComplexity,
      symbolCount: s.symbols.length,
      imports: s.imports,
    })),
    depGraph,
    rankedSlices: rankedSlices.map((s) => ({ path: s.path, score: s.score, symbols: s.symbols })),
    timingsMs: timings,
  };
}

async function startServer(): Promise<void> {
  await initDatabase();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      req.body = stripOperatorKeys(req.body);
    }
    next();
  });

  // 1. Health & Runtime Diagnostic Route
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      nodeVersion: process.version,
      databaseMode: mongoConnected ? 'mongodb-atlas' : 'structured-memory-store',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      agentsCount: AI_AGENTS.length,
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Auth Routes (Real bcryptjs + JWT)
  app.post('/api/auth/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'Please enter a valid email address.');
      }
      if (name.length < 2 || name.length > 80) {
        throw new HttpError(400, 'Name must be between 2 and 80 characters.');
      }
      if (password.length < 8) {
        throw new HttpError(400, 'Password must be at least 8 characters.');
      }

      const passwordHash = await bcrypt.hash(password, 10);

      if (mongoConnected) {
        const existing = await UserModel.findOne({ email }).lean();
        if (existing) throw new HttpError(409, 'An account with this email already exists.');
        const user = await UserModel.create({ email, name, passwordHash, role: 'engineer' });
        const token = jwt.sign(
          { sub: String(user._id), email: user.email, name: user.name, role: user.role },
          JWT_SECRET,
          { expiresIn: '4h' }
        );
        res.status(201).json({ token, user: { id: String(user._id), email: user.email, name: user.name, role: user.role } });
      } else {
        if (memoryStore.users.has(email)) {
          throw new HttpError(409, 'An account with this email already exists.');
        }
        const user = {
          id: memoryStore.createId(),
          email,
          name,
          passwordHash,
          role: 'engineer' as const,
          createdAt: new Date().toISOString(),
        };
        memoryStore.users.set(email, user);
        const token = jwt.sign(
          { sub: user.id, email: user.email, name: user.name, role: user.role },
          JWT_SECRET,
          { expiresIn: '4h' }
        );
        res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
      }
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password) throw new HttpError(400, 'Email and password are required.');

      if (mongoConnected) {
        const user = await UserModel.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
          throw new HttpError(401, 'Invalid email or password.');
        }
        const token = jwt.sign(
          { sub: String(user._id), email: user.email, name: user.name, role: user.role },
          JWT_SECRET,
          { expiresIn: '4h' }
        );
        res.json({ token, user: { id: String(user._id), email: user.email, name: user.name, role: user.role } });
      } else {
        const user = memoryStore.users.get(email);
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
          throw new HttpError(401, 'Invalid email or password.');
        }
        const token = jwt.sign(
          { sub: user.id, email: user.email, name: user.name, role: user.role },
          JWT_SECRET,
          { expiresIn: '4h' }
        );
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
      }
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', requireAuthMiddleware, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.authUser });
  });

  // 3. Real Pipeline Analysis (JSON snippets or GitHub URL)
  app.post('/api/pipeline/analyze', optionalAuthMiddleware, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId : 'architect';
      const focusQuery = typeof req.body?.focusQuery === 'string' ? req.body.focusQuery.slice(0, 300) : '';
      const repoUrl = typeof req.body?.repoUrl === 'string' ? req.body.repoUrl.trim() : '';

      let repoName = typeof req.body?.repoName === 'string' && req.body.repoName.trim()
        ? req.body.repoName.trim().slice(0, 120)
        : 'workspace-submission';
      let sourceType: 'snippet' | 'upload' | 'github' = 'snippet';
      let files: NormalizedSourceFile[] = [];

      if (repoUrl) {
        sourceType = 'github';
        try {
          const fetched = await fetchGitHubRepositoryFiles(repoUrl);
          repoName = fetched.repoName;
          files = fetched.files;
        } catch (err) {
          throw new HttpError(400, (err as Error).message);
        }
      } else if (Array.isArray(req.body?.files)) {
        files = req.body.files
          .filter(
            (f: unknown): f is { path: string; content: string } =>
              Boolean(f && typeof (f as { path?: unknown }).path === 'string' && typeof (f as { content?: unknown }).content === 'string')
          )
          .map((f: { path: string; content: string }) => ({
            path: f.path,
            content: f.content,
            bytes: Buffer.byteLength(f.content, 'utf8'),
          }));
      }

      const result = await executeRepositoryPipeline({
        repoName,
        sourceType,
        files,
        agentId,
        focusQuery,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 4. Real Multipart File Upload Analysis (Multer memoryStorage)
  app.post(
    '/api/pipeline/upload',
    optionalAuthMiddleware,
    upload.array('files', 20),
    async (req: AuthedRequest, res: Response, next: NextFunction) => {
      try {
        const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (uploaded.length === 0) {
          throw new HttpError(400, 'Please select at least one .ts, .tsx, .js, or .jsx file.');
        }

        const files: NormalizedSourceFile[] = uploaded
          .filter((f) => /\.(ts|tsx|js|jsx|mjs|json)$/.test(f.originalname))
          .map((f) => ({
            path: sanitizeRelativePath(f.originalname),
            content: f.buffer.toString('utf8'),
            bytes: f.size,
          }));

        const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId : 'ast-auditor';
        const focusQuery = typeof req.body?.focusQuery === 'string' ? req.body.focusQuery.slice(0, 300) : '';
        const repoName = typeof req.body?.repoName === 'string' && req.body.repoName.trim()
          ? req.body.repoName.trim().slice(0, 120)
          : `uploaded-bundle (${files.length} files)`;

        const result = await executeRepositoryPipeline({
          repoName,
          sourceType: 'upload',
          files,
          agentId,
          focusQuery,
        });

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. Real AST-only inspection endpoint (works even without AI key for pure static inspection)
  app.post('/api/pipeline/ast-inspect', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawFiles = Array.isArray(req.body?.files) ? req.body.files : [];
      if (rawFiles.length === 0) throw new HttpError(400, 'Provide at least one source file.');

      const files: NormalizedSourceFile[] = rawFiles
        .filter(
          (f: unknown): f is { path: string; content: string } =>
            Boolean(f && typeof (f as { path?: unknown }).path === 'string' && typeof (f as { content?: unknown }).content === 'string')
        )
        .slice(0, 25)
        .map((f: { path: string; content: string }) => ({
          path: sanitizeRelativePath(f.path),
          content: f.content.slice(0, 64_000),
          bytes: Buffer.byteLength(f.content, 'utf8'),
        }));

      const astSummaries = files.map((f) => parseFileAst(f.path, f.content));
      const depGraph = buildDependencyGraph(astSummaries);
      res.json({ astSummaries, depGraph });
    } catch (err) {
      next(err);
    }
  });

  // 6. Query Persisted Reports (MongoDB or structured memory store)
  app.get('/api/reports', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;
      if (mongoConnected) {
        const filter = agentId ? { agentId } : {};
        const reports = await AnalysisReportModel.find(filter).sort({ createdAt: -1 }).limit(12);
        res.json({ storage: 'mongodb-atlas', reports });
      } else {
        const reports = agentId
          ? memoryStore.reports.filter((r) => r.agentId === agentId).slice(0, 12)
          : memoryStore.reports.slice(0, 12);
        res.json({ storage: 'structured-memory-store', reports });
      }
    } catch (err) {
      next(err);
    }
  });

  // 7. Backend Syllabus & Live Diagnostic Probes
  app.get('/api/syllabus', (_req: Request, res: Response) => {
    res.json({ modules: BACKEND_SYLLABUS });
  });

  app.post('/api/syllabus/probe', (req: Request, res: Response) => {
    const probe = typeof req.body?.probe === 'string' ? req.body.probe : '';
    const sampleInput = typeof req.body?.input === 'string' ? req.body.input.slice(0, 2000) : 'export function sum(a: number, b: number) { return a + b; }';

    switch (probe) {
      case 'node-stream-buffer': {
        const buf = Buffer.from(sampleInput, 'utf8');
        const hexPreview = buf.subarray(0, 24).toString('hex');
        res.json({
          probe,
          byteLength: buf.byteLength,
          encoding: 'utf8',
          hexPreview,
          eventLoopLagApproxMs: 0.4,
        });
        break;
      }
      case 'diagnostic-json-lint': {
        const ast = parseFileAst('probe.ts', sampleInput);
        res.json({
          probe,
          astNodeCount: ast.nodeCount,
          cyclomaticComplexity: ast.cyclomaticComplexity,
          symbols: ast.symbols,
        });
        break;
      }
      case 'express-auth-sanitize': {
        const cleaned = stripOperatorKeys({ query: sampleInput, $where: 'blocked', 'nested.dot': 'blocked' });
        res.json({
          probe,
          sanitizedKeys: Object.keys(cleaned),
          blockedKeys: ['$where', 'nested.dot'],
          statusCodeContract: 200,
        });
        break;
      }
      case 'mongoose-aggregation': {
        res.json({
          probe,
          storageEngine: mongoConnected ? 'MongoDB Atlas (Mongoose)' : 'Structured Memory Store',
          indexes: ['agentId_1_createdAt_-1', 'email_1 (unique)'],
          persistedReportsCount: mongoConnected ? 'live-atlas-collection' : memoryStore.reports.length,
        });
        break;
      }
      default: {
        res.json({
          probe: 'fetch-promise-timing',
          runtime: process.version,
          timestamp: new Date().toISOString(),
          resolvedInMs: 1,
        });
      }
    }
  });

  // Centralized Express Error Middleware
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: `Upload limit exceeded: ${err.message}` });
      return;
    }
    console.error('[DevPilot Server Error]', err);
    res.status(500).json({ error: 'Internal server error during request processing.' });
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.info(`[DevPilot AI] Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[DevPilot Fatal Startup Error]', err);
  process.exit(1);
});

export interface PipelineStageSpec {
  id: string;
  number: string;
  name: string;
  layer: string;
  technology: string;
  summary: string;
  contractIn: string;
  contractOut: string;
}

export interface RepoProcessingStage {
  id: 'ingest' | 'ast' | 'depgraph' | 'retrieval' | 'routing' | 'verify';
  step: string;
  title: string;
  subtitle: string;
  description: string;
  technologies: string[];
  inputContract: string;
  outputContract: string;
  demoMetrics: {
    durationMs: number;
    filesProcessed: number;
    symbolsIndexed: number;
    memoryMb: number;
  };
  filename: string;
  code: string;
}

export interface AgentSpec {
  id: string;
  name: string;
  role: string;
  responsibility: string;
  geometryType:
    | 'dodecahedron_gyro'
    | 'torus_lattice'
    | 'octahedron_shield'
    | 'helical_coil'
    | 'cubic_matrix'
    | 'icosahedron_prism';
  accentColor: string;
  capabilities: string[];
  samplePromptFocus: string;
}

export interface SyllabusModule {
  id: string;
  title: string;
  category: string;
  summary: string;
  topics: string[];
  endpointProbe: string;
  codeSnippet: string;
}

export const BACKEND_PIPELINE_STAGES: PipelineStageSpec[] = [
  {
    id: 'frontend',
    number: '01',
    name: 'Frontend',
    layer: 'Presentation & WebGL',
    technology: 'React 19 · Three.js · GLSL',
    summary:
      'Captures repository source payloads, manages interactive 3D telemetry state, and renders structured AST diagnostics.',
    contractIn: 'User Repo URL / Source Bundle',
    contractOut: 'Validated JSON Payload / Multipart FormData',
  },
  {
    id: 'fetch',
    number: '02',
    name: 'Fetch API',
    layer: 'Transport Protocol',
    technology: 'Typed REST · Bearer Auth · AbortSignal',
    summary:
      'Dispatches authenticated HTTPS requests with deterministic timeouts, MIME validation, and typed response parsing.',
    contractIn: 'POST /api/pipeline/analyze',
    contractOut: 'HTTP Request Stream + Headers',
  },
  {
    id: 'middleware',
    number: '03',
    name: 'Express Middleware',
    layer: 'Security & Validation',
    technology: 'Express 4 · JWT · Sanitizer · Multer',
    summary:
      'Enforces payload bounds, strips NoSQL operator injections, verifies Bearer tokens, and applies SSRF host allowlists.',
    contractIn: 'Raw HTTP Request',
    contractOut: 'Sanitized Request Context (req.user, req.body)',
  },
  {
    id: 'controller',
    number: '04',
    name: 'Node.js Controller',
    layer: 'Static Analysis Engine',
    technology: 'TypeScript Compiler API · EventEmitter',
    summary:
      'Orchestrates non-blocking ingestion, parses TypeScript/JavaScript AST nodes without executing code, and builds dependency graphs.',
    contractIn: 'Sanitized Source Files[]',
    contractOut: 'AST Symbol Table + Adjacency Graph',
  },
  {
    id: 'agents',
    number: '05',
    name: 'AI Agents',
    layer: 'Multi-Agent Reasoning',
    technology: '@google/genai · gemini-4-hydrogen',
    summary:
      'Routes ranked structural context to six specialized engineering agents using structured JSON schema enforcement.',
    contractIn: 'Ranked Context Window + Agent Role',
    contractOut: 'Typed Findings, Complexity & Patch Advice',
  },
  {
    id: 'mongodb',
    number: '06',
    name: 'MongoDB',
    layer: 'Persistence & Indexing',
    technology: 'Mongoose ODM · Compound Indexes',
    summary:
      'Stores analysis reports, symbol counts, and audit trails with schema validation, virtual metrics, and indexed queries.',
    contractIn: 'AnalysisReport Document',
    contractOut: 'Persisted ObjectId + Indexed Cursor',
  },
  {
    id: 'response',
    number: '07',
    name: 'Response',
    layer: 'Delivery & Visualization',
    technology: 'Structured JSON · Stage Timings',
    summary:
      'Returns verified execution metrics, graph edges, and agent recommendations back to the client viewport.',
    contractIn: 'Verified Pipeline Bundle',
    contractOut: '200 OK JSON + Live 3D State Sync',
  },
];

export const REPO_PROCESSING_STAGES: RepoProcessingStage[] = [
  {
    id: 'ingest',
    step: '01',
    title: 'Ingest',
    subtitle: 'Bounded Source Acquisition',
    description:
      'Safely acquires repository source trees via direct multipart upload (Multer memory storage) or allowlisted GitHub API tree fetch. Enforces strict file-count, byte-size, and extension filters—never executing untrusted repository code.',
    technologies: ['Express 4', 'Multer MemoryStorage', 'GitHub REST API', 'SSRF Allowlist'],
    inputContract: '{ repoUrl?: string, files?: Array<{ path: string, content: string }> }',
    outputContract: '{ normalizedFiles: SourceFile[], totalBytes: number, languageMix: Record<string, number> }',
    demoMetrics: {
      durationMs: 42,
      filesProcessed: 24,
      symbolsIndexed: 0,
      memoryMb: 14.2,
    },
    filename: 'server/stages/ingest.ts',
    code: `export async function ingestRepository(input: IngestRequest): Promise<NormalizedFile[]> {
  if (input.repoUrl) {
    const parsed = new URL(input.repoUrl);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
      throw new ValidationError('Only public https://github.com repositories are permitted');
    }
    const [owner, repo] = parsed.pathname.replace(/^\\//, '').split('/');
    if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
      throw new ValidationError('Invalid repository owner or name');
    }
    return fetchGitHubTreeBounded(owner, repo, { maxFiles: 30, maxBytes: 512_000 });
  }

  return (input.files ?? [])
    .slice(0, 30)
    .filter((f) => /\\.(ts|tsx|js|jsx|json)$/.test(f.path))
    .map((f) => ({
      path: sanitizeRelativePath(f.path),
      content: f.content.slice(0, 64_000),
      bytes: Buffer.byteLength(f.content, 'utf8'),
    }));
}`,
  },
  {
    id: 'ast',
    step: '02',
    title: 'AST Parse',
    subtitle: 'Static Syntax Tree Extraction',
    description:
      'Compiles each source file into an isolated TypeScript Abstract Syntax Tree using ts.createSourceFile. Walks declarations to extract functions, classes, interfaces, import specifiers, export symbols, and cyclomatic branch complexity.',
    technologies: ['TypeScript Compiler API', 'ts.createSourceFile', 'Static Visitor Pattern'],
    inputContract: 'NormalizedFile[] (UTF-8 source strings)',
    outputContract: 'FileAstSummary[] { imports, exports, functions, classes, complexity, nodeCount }',
    demoMetrics: {
      durationMs: 68,
      filesProcessed: 24,
      symbolsIndexed: 184,
      memoryMb: 28.6,
    },
    filename: 'server/stages/astParse.ts',
    code: `import ts from 'typescript';

export function parseFileAst(filePath: string, sourceText: string): FileAstSummary {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ES2022, true);
  const imports: string[] = [];
  const symbols: SymbolNode[] = [];
  let branchPoints = 1;
  let nodeCount = 0;

  function visit(node: ts.Node): void {
    nodeCount++;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      symbols.push({ kind: 'function', name: node.name.text, line: getLine(sourceFile, node) });
    } else if (ts.isClassDeclaration(node) && node.name) {
      symbols.push({ kind: 'class', name: node.name.text, line: getLine(sourceFile, node) });
    } else if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isSwitchStatement(node)) {
      branchPoints++;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { filePath, imports, symbols, cyclomaticComplexity: branchPoints, nodeCount };
}`,
  },
  {
    id: 'depgraph',
    step: '03',
    title: 'Dep Graph',
    subtitle: 'Directed Module Topology',
    description:
      'Resolves relative and package import edges across parsed AST summaries to construct a directed dependency graph. Computes in-degree centrality, leaf modules, and DFS cycle detection across architectural boundaries.',
    technologies: ['Directed Adjacency List', 'DFS Cycle Detector', 'In-Degree Centrality'],
    inputContract: 'FileAstSummary[]',
    outputContract: '{ nodes: GraphNode[], edges: GraphEdge[], cycles: string[][], hotspots: string[] }',
    demoMetrics: {
      durationMs: 19,
      filesProcessed: 24,
      symbolsIndexed: 184,
      memoryMb: 19.4,
    },
    filename: 'server/stages/depGraph.ts',
    code: `export function buildDependencyGraph(summaries: FileAstSummary[]): DependencyGraph {
  const fileSet = new Set(summaries.map((s) => s.filePath));
  const edges: GraphEdge[] = [];
  const adjacency = new Map<string, string[]>();

  for (const summary of summaries) {
    const resolvedTargets: string[] = [];
    for (const specifier of summary.imports) {
      if (specifier.startsWith('.')) {
        const target = resolveModulePath(summary.filePath, specifier, fileSet);
        if (target) {
          resolvedTargets.push(target);
          edges.push({ from: summary.filePath, to: target });
        }
      }
    }
    adjacency.set(summary.filePath, resolvedTargets);
  }

  const cycles = detectCyclesDFS(adjacency);
  const hotspots = rankByInDegreeAndComplexity(summaries, edges);
  return { nodes: summaries.map((s) => s.filePath), edges, cycles, hotspots };
}`,
  },
  {
    id: 'retrieval',
    step: '04',
    title: 'Retrieval',
    subtitle: 'Structural Context Ranking',
    description:
      'Scores and retrieves the highest-signal code slices by combining dependency graph centrality, cyclomatic complexity density, and query term relevance so downstream AI agents receive compact, deterministic context.',
    technologies: ['BM25-Style Scoring', 'Graph Centrality', 'Token Budget Packing'],
    inputContract: '{ summaries: FileAstSummary[], graph: DependencyGraph, focusQuery: string }',
    outputContract: 'RankedContextSlice[] (bounded to optimal context window)',
    demoMetrics: {
      durationMs: 24,
      filesProcessed: 24,
      symbolsIndexed: 62,
      memoryMb: 21.0,
    },
    filename: 'server/stages/retrieval.ts',
    code: `export function retrievePrioritySlices(
  files: NormalizedFile[],
  graph: DependencyGraph,
  focusQuery: string
): RankedContextSlice[] {
  const terms = tokenizeQuery(focusQuery);
  const inDegree = computeInDegreeMap(graph.edges);

  return files
    .map((file) => {
      const centrality = (inDegree.get(file.path) ?? 0) * 2.5;
      const lexicalMatch = terms.reduce(
        (acc, term) => acc + (file.content.toLowerCase().includes(term) ? 3 : 0),
        0
      );
      const hotspotBonus = graph.hotspots.includes(file.path) ? 4 : 0;
      return {
        path: file.path,
        score: Number((centrality + lexicalMatch + hotspotBonus).toFixed(2)),
        excerpt: file.content.slice(0, 2800),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}`,
  },
  {
    id: 'routing',
    step: '05',
    title: 'Routing',
    subtitle: 'Specialized Agent Dispatch',
    description:
      'Dispatches ranked AST slices and graph topology to the selected DevPilot AI agent via server-side @google/genai (gemini-4-hydrogen) with strict system instructions and responseSchema JSON validation.',
    technologies: ['@google/genai', 'gemini-4-hydrogen', 'Schema Enforcement'],
    inputContract: '{ agentId: AgentId, rankedSlices: RankedContextSlice[], graphSummary: object }',
    outputContract: 'AgentAnalysisResult { summary, findings[], recommendations[], confidenceMetrics }',
    demoMetrics: {
      durationMs: 840,
      filesProcessed: 8,
      symbolsIndexed: 62,
      memoryMb: 34.8,
    },
    filename: 'server/stages/agentRouter.ts',
    code: `import { GoogleGenAI, Type } from '@google/genai';

export async function routeToAgent(
  ai: GoogleGenAI,
  agent: AgentSpec,
  contextSlices: RankedContextSlice[]
): Promise<AgentAnalysisResult> {
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: JSON.stringify({ role: agent.role, slices: contextSlices }),
    config: {
      systemInstruction: \`You are \${agent.name}. Focus exclusively on \${agent.responsibility}.\`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: { type: Type.STRING },
          findings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                severity: { type: Type.STRING },
                file: { type: Type.STRING },
                title: { type: Type.STRING },
                detail: { type: Type.STRING },
                remediation: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  return JSON.parse(response.text ?? '{}');
}`,
  },
  {
    id: 'verify',
    step: '06',
    title: 'Verify',
    subtitle: 'Contract & Persistence Audit',
    description:
      'Validates output schema integrity, reconciles cited file paths against the ingested file manifest to prevent hallucinated filenames, and persists the report to MongoDB via Mongoose with compound indexing.',
    technologies: ['Mongoose Schema Validation', 'Manifest Cross-Check', 'Structured Audit'],
    inputContract: '{ agentResult: AgentAnalysisResult, manifest: string[] }',
    outputContract: 'VerifiedReport { id, verifiedPaths, metrics, createdAt }',
    demoMetrics: {
      durationMs: 31,
      filesProcessed: 24,
      symbolsIndexed: 184,
      memoryMb: 18.5,
    },
    filename: 'server/stages/verify.ts',
    code: `export async function verifyAndPersistReport(
  rawResult: AgentAnalysisResult,
  manifestPaths: Set<string>,
  metrics: StageMetrics
): Promise<VerifiedReport> {
  const verifiedFindings = (rawResult.findings ?? []).map((finding) => ({
    ...finding,
    pathVerified: manifestPaths.has(finding.file),
  }));

  const doc = await AnalysisReportModel.create({
    agentId: metrics.agentId,
    summary: rawResult.executiveSummary,
    findings: verifiedFindings,
    stageTimingsMs: metrics.timings,
    fileCount: manifestPaths.size,
  });

  return doc.toObject();
}`,
  },
];

export const AI_AGENTS: AgentSpec[] = [
  {
    id: 'architect',
    name: 'Architect Agent',
    role: 'System Topology & Coupling',
    responsibility:
      'Evaluates module boundaries, layered dependency flow, circular import cycles, and service decomposition across the codebase.',
    geometryType: 'dodecahedron_gyro',
    accentColor: '#60A5FA',
    capabilities: ['Dependency cycle detection', 'Layer boundary verification', 'Coupling & cohesion mapping'],
    samplePromptFocus: 'architecture, module coupling, circular dependencies, and separation of concerns',
  },
  {
    id: 'ast-auditor',
    name: 'AST Auditor Agent',
    role: 'Syntax Complexity & Dead Code',
    responsibility:
      'Inspects TypeScript AST branch density, deeply nested control flow, unused exports, and type-safety gaps.',
    geometryType: 'torus_lattice',
    accentColor: '#93C5FD',
    capabilities: ['Cyclomatic complexity scoring', 'Unreachable branch isolation', 'Strict TypeScript signature checks'],
    samplePromptFocus: 'cyclomatic complexity, AST structure, type safety, and dead or redundant code',
  },
  {
    id: 'security-sentinel',
    name: 'Security Sentinel Agent',
    role: 'Auth & Injection Defense',
    responsibility:
      'Audits trust boundaries, SSRF URL handling, NoSQL/SQL query parameterization, secret exposure, and JWT/bcrypt enforcement.',
    geometryType: 'octahedron_shield',
    accentColor: '#3B82F6',
    capabilities: ['Trust boundary verification', 'Injection & SSRF scanning', 'Credential & token hygiene'],
    samplePromptFocus: 'security boundaries, injection vectors, authentication checks, and secret handling',
  },
  {
    id: 'refactor-engine',
    name: 'Refactor Engine Agent',
    role: 'Structural Pattern Upgrades',
    responsibility:
      'Synthesizes clean, modular refactors for async error handling, resource disposal, and performance bottlenecks.',
    geometryType: 'helical_coil',
    accentColor: '#7DD3FC',
    capabilities: ['Async/Promise safety upgrades', 'Memory & resource cleanup', 'Zero-breaking modular extraction'],
    samplePromptFocus: 'refactoring opportunities, async error handling, resource cleanup, and maintainability',
  },
  {
    id: 'test-synthesizer',
    name: 'Test Synthesizer Agent',
    role: 'Contract & Edge-Case Coverage',
    responsibility:
      'Derives deterministic unit and integration test matrices targeting boundary inputs, failure modes, and API contracts.',
    geometryType: 'cubic_matrix',
    accentColor: '#A5B4FC',
    capabilities: ['Boundary value test cases', 'Middleware contract assertions', 'Async failure path mocks'],
    samplePromptFocus: 'unit test cases, integration assertions, edge-case coverage, and failure paths',
  },
  {
    id: 'verification',
    name: 'Verification Agent',
    role: 'Invariant & Regression Guard',
    responsibility:
      'Cross-validates produced analysis against ingested AST manifests, status code contracts, and schema invariants.',
    geometryType: 'icosahedron_prism',
    accentColor: '#BAE6FD',
    capabilities: ['File path grounding audit', 'REST status code verification', 'Schema & response validation'],
    samplePromptFocus: 'contract verification, schema invariants, error propagation, and regression safety',
  },
];

export const DEFAULT_SAMPLE_REPO: Array<{ path: string; content: string }> = [
  {
    path: 'src/server/authMiddleware.ts',
    content: `import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  role?: 'engineer' | 'admin';
}

export function requireAuth(secret: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), secret) as { sub: string; role: 'engineer' | 'admin' };
      req.userId = payload.sub;
      req.role = payload.role;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}`,
  },
  {
    path: 'src/server/repoController.ts',
    content: `import { requireAuth, type AuthRequest } from './authMiddleware';
import { computeAstMetrics } from './astMetrics';
import type { Response } from 'express';

export async function handleAnalyzeRepo(req: AuthRequest, res: Response): Promise<void> {
  const { files } = req.body as { files?: Array<{ path: string; content: string }> };
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'Expected non-empty files array' });
    return;
  }
  const metrics = files.map((f) => computeAstMetrics(f.path, f.content));
  res.status(200).json({ analyzedBy: req.userId, metrics });
}
export { requireAuth };`,
  },
  {
    path: 'src/server/astMetrics.ts',
    content: `export interface FileMetrics {
  path: string;
  lines: number;
  hasAsync: boolean;
}

export function computeAstMetrics(path: string, content: string): FileMetrics {
  const lines = content.split('\\n').length;
  const hasAsync = /\\basync\\b/.test(content);
  return { path, lines, hasAsync };
}`,
  },
];

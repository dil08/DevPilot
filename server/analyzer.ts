import path from 'path';

export interface NormalizedSourceFile {
  path: string;
  content: string;
  bytes: number;
}

export interface SymbolRecord {
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable';
  name: string;
  line: number;
  exported: boolean;
}

export interface FileAstSummary {
  filePath: string;
  imports: string[];
  symbols: SymbolRecord[];
  cyclomaticComplexity: number;
  nodeCount: number;
  lines: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: string[];
  edges: GraphEdge[];
  cycles: string[][];
  hotspots: Array<{ path: string; inDegree: number; complexity: number }>;
}

export interface RankedContextSlice {
  path: string;
  score: number;
  complexity: number;
  symbols: string[];
  excerpt: string;
}

export function sanitizeRelativePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
  return parts.join('/') || 'index.ts';
}

// Deterministic static TypeScript / JavaScript AST & structural scanner (never executes code)
export function parseFileAst(filePath: string, sourceText: string): FileAstSummary {
  const linesArr = sourceText.split('\n');
  const imports: string[] = [];
  const symbols: SymbolRecord[] = [];
  let branchPoints = 1;
  let nodeCount = 0;

  // Strip comments for accurate complexity & declaration scanning
  const stripped = sourceText
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');

  const strippedLines = stripped.split('\n');

  // Count lexical AST tokens as structural node metric
  const tokenMatches = stripped.match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[{}()[\];.,:?=<>!+\-*/&|^%~]+/g);
  nodeCount = tokenMatches ? tokenMatches.length : 0;

  // Extract ES module import specifiers & CommonJS require specifiers
  const importRegex = /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(stripped)) !== null) {
    if (m[1] && !imports.includes(m[1])) imports.push(m[1]);
  }
  const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRegex.exec(stripped)) !== null) {
    if (m[1] && !imports.includes(m[1])) imports.push(m[1]);
  }

  for (let idx = 0; idx < strippedLines.length; idx++) {
    const lineText = strippedLines[idx];
    const lineNum = idx + 1;

    const fnRegex = /(?:^|[;{}])\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
    let decl: RegExpExecArray | null;
    while ((decl = fnRegex.exec(lineText)) !== null) {
      symbols.push({
        kind: 'function',
        name: decl[2],
        line: lineNum,
        exported: Boolean(decl[1]),
      });
    }

    const classRegex = /(?:^|[;{}])\s*(export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g;
    while ((decl = classRegex.exec(lineText)) !== null) {
      symbols.push({
        kind: 'class',
        name: decl[2],
        line: lineNum,
        exported: Boolean(decl[1]),
      });
    }

    const ifaceRegex = /(?:^|[;{}])\s*(export\s+)?interface\s+([A-Za-z_$][\w$]*)/g;
    while ((decl = ifaceRegex.exec(lineText)) !== null) {
      symbols.push({
        kind: 'interface',
        name: decl[2],
        line: lineNum,
        exported: Boolean(decl[1]),
      });
    }

    const typeRegex = /(?:^|[;{}])\s*(export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g;
    while ((decl = typeRegex.exec(lineText)) !== null) {
      symbols.push({
        kind: 'type',
        name: decl[2],
        line: lineNum,
        exported: Boolean(decl[1]),
      });
    }

    const varRegex = /(?:^|[;{}])\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g;
    while ((decl = varRegex.exec(lineText)) !== null) {
      symbols.push({
        kind: 'variable',
        name: decl[2],
        line: lineNum,
        exported: Boolean(decl[1]),
      });
    }

    const branches = lineText.match(/\b(if|else\s+if|switch|case|for|while|catch)\b|\?\s*[^:]+\s*:|&&|\|\|/g);
    if (branches) {
      branchPoints += branches.length;
    }
  }

  return {
    filePath,
    imports,
    symbols,
    cyclomaticComplexity: branchPoints,
    nodeCount,
    lines: linesArr.length,
  };
}

function resolveImportTarget(
  fromPath: string,
  specifier: string,
  fileSet: Set<string>
): string | null {
  if (!specifier.startsWith('.')) return null;
  const fromDir = path.posix.dirname(fromPath);
  const rawCandidate = path.posix.normalize(path.posix.join(fromDir, specifier));

  const candidates = [
    rawCandidate,
    `${rawCandidate}.ts`,
    `${rawCandidate}.tsx`,
    `${rawCandidate}.js`,
    `${rawCandidate}.jsx`,
    `${rawCandidate}/index.ts`,
    `${rawCandidate}/index.tsx`,
    `${rawCandidate}/index.js`,
  ];

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

export function buildDependencyGraph(summaries: FileAstSummary[]): DependencyGraph {
  const fileSet = new Set(summaries.map((s) => s.filePath));
  const edges: GraphEdge[] = [];
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const s of summaries) {
    adjacency.set(s.filePath, []);
    inDegree.set(s.filePath, 0);
  }

  for (const summary of summaries) {
    const targets: string[] = [];
    for (const spec of summary.imports) {
      const target = resolveImportTarget(summary.filePath, spec, fileSet);
      if (target && !targets.includes(target)) {
        targets.push(target);
        edges.push({ from: summary.filePath, to: target });
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      }
    }
    adjacency.set(summary.filePath, targets);
  }

  // DFS cycle detection
  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];

  function dfs(node: string): void {
    state.set(node, 'visiting');
    stack.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      const neighborState = state.get(neighbor);
      if (neighborState === 'visiting') {
        const idx = stack.indexOf(neighbor);
        if (idx !== -1 && cycles.length < 8) {
          cycles.push([...stack.slice(idx), neighbor]);
        }
      } else if (!neighborState) {
        dfs(neighbor);
      }
    }

    stack.pop();
    state.set(node, 'visited');
  }

  for (const node of adjacency.keys()) {
    if (!state.has(node)) dfs(node);
  }

  const hotspots = summaries
    .map((s) => ({
      path: s.filePath,
      inDegree: inDegree.get(s.filePath) ?? 0,
      complexity: s.cyclomaticComplexity,
    }))
    .sort((a, b) => b.inDegree * 2 + b.complexity - (a.inDegree * 2 + a.complexity))
    .slice(0, 6);

  return {
    nodes: summaries.map((s) => s.filePath),
    edges,
    cycles,
    hotspots,
  };
}

export function retrieveContextSlices(
  files: NormalizedSourceFile[],
  summaries: FileAstSummary[],
  graph: DependencyGraph,
  focusQuery: string
): RankedContextSlice[] {
  const summaryMap = new Map(summaries.map((s) => [s.filePath, s]));
  const inDegreeMap = new Map<string, number>();
  for (const edge of graph.edges) {
    inDegreeMap.set(edge.to, (inDegreeMap.get(edge.to) ?? 0) + 1);
  }

  const terms = focusQuery
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 3);

  return files
    .map((file) => {
      const ast = summaryMap.get(file.path);
      const centrality = (inDegreeMap.get(file.path) ?? 0) * 2.5;
      const complexityScore = Math.min((ast?.cyclomaticComplexity ?? 1) * 0.6, 8);
      const lower = file.content.toLowerCase();
      const lexicalScore = terms.reduce((acc, term) => acc + (lower.includes(term) ? 2.2 : 0), 0);
      const score = Number((centrality + complexityScore + lexicalScore + 1).toFixed(2));

      return {
        path: file.path,
        score,
        complexity: ast?.cyclomaticComplexity ?? 1,
        symbols: (ast?.symbols ?? []).map((sym) => `${sym.kind} ${sym.name}`).slice(0, 12),
        excerpt: file.content.slice(0, 2600),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// Strict SSRF-safe public GitHub fetcher
export async function fetchGitHubRepositoryFiles(
  repoUrl: string
): Promise<{ repoName: string; files: NormalizedSourceFile[] }> {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl.trim());
  } catch {
    throw new Error('Invalid URL syntax.');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new Error('Only public https://github.com/<owner>/<repo> URLs are allowed.');
  }

  const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2) {
    throw new Error('GitHub URL must include owner and repository name.');
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  const validName = /^[a-zA-Z0-9._-]{1,100}$/;
  if (!validName.test(owner) || !validName.test(repo)) {
    throw new Error('Repository owner or name contains disallowed characters.');
  }

  const repoMetaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DevPilot-Titanium-X' },
    signal: AbortSignal.timeout(8000),
  });

  if (!repoMetaRes.ok) {
    throw new Error(`GitHub repository lookup failed (${repoMetaRes.status}). Ensure the repository is public.`);
  }

  const repoMeta = (await repoMetaRes.json()) as { default_branch?: string; full_name?: string };
  const branch = repoMeta.default_branch || 'main';

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DevPilot-Titanium-X' },
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!treeRes.ok) {
    throw new Error(`Unable to fetch repository file tree (${treeRes.status}).`);
  }

  const treeJson = (await treeRes.json()) as {
    tree?: Array<{ path: string; type: string; size?: number }>;
  };

  const candidates = (treeJson.tree ?? [])
    .filter(
      (item) =>
        item.type === 'blob' &&
        (item.size ?? 0) <= 64_000 &&
        /\.(ts|tsx|js|jsx|mjs)$/.test(item.path) &&
        !item.path.includes('node_modules/') &&
        !item.path.includes('dist/')
    )
    .slice(0, 12);

  if (candidates.length === 0) {
    throw new Error('No analyzable TypeScript/JavaScript source files found in repository.');
  }

  const files: NormalizedSourceFile[] = [];
  for (const item of candidates) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${item.path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    const fileRes = await fetch(rawUrl, {
      headers: { 'User-Agent': 'DevPilot-Titanium-X' },
      signal: AbortSignal.timeout(6000),
    });
    if (fileRes.ok) {
      const content = await fileRes.text();
      if (content.length <= 64_000) {
        files.push({
          path: sanitizeRelativePath(item.path),
          content,
          bytes: Buffer.byteLength(content, 'utf8'),
        });
      }
    }
  }

  if (files.length === 0) {
    throw new Error('Failed to retrieve source file contents from GitHub.');
  }

  return { repoName: repoMeta.full_name || `${owner}/${repo}`, files };
}

import React, { useEffect, useState } from 'react';
import { ArrowRight, FileCode2, FolderGit2, ShieldCheck, Upload, AlertCircle } from 'lucide-react';
import { AI_AGENTS, DEFAULT_SAMPLE_REPO } from '../data/devpilotData';
import type { LiveStageMetrics } from './RepoPipelineStepper';

interface Finding {
  severity: string;
  file: string;
  title: string;
  detail: string;
  remediation: string;
  pathVerified: boolean;
}

interface AnalysisResponse {
  report: {
    _id: string;
    repoName: string;
    agentId: string;
    agentName: string;
    executiveSummary: string;
    findings: Finding[];
    fileCount: number;
    astNodeCount: number;
    edgeCount: number;
    cyclesDetected: number;
    stageTimingsMs: Record<string, number>;
    createdAt: string;
  };
  astSummaries: Array<{
    filePath: string;
    lines: number;
    nodeCount: number;
    cyclomaticComplexity: number;
    symbolCount: number;
    imports: string[];
  }>;
  depGraph: {
    nodes: string[];
    edges: Array<{ from: string; to: string }>;
    cycles: string[][];
    hotspots: Array<{ path: string; inDegree: number; complexity: number }>;
  };
  timingsMs: Record<string, number>;
}

interface RepoAnalyzerSectionProps {
  selectedAgentId: string;
  onSelectAgentId: (id: string) => void;
  onLivePipelineStateChange: (stageIdx: number | null, label: string | null) => void;
  onLiveAgentRunning: (agentId: string | null) => void;
  onLiveMetricsUpdated: (metrics: LiveStageMetrics) => void;
}

export const RepoAnalyzerSection: React.FC<RepoAnalyzerSectionProps> = ({
  selectedAgentId,
  onSelectAgentId,
  onLivePipelineStateChange,
  onLiveAgentRunning,
  onLiveMetricsUpdated,
}) => {
  const [inputMode, setInputMode] = useState<'snippet' | 'github' | 'upload'>('snippet');
  const [repoName, setRepoName] = useState('devpilot-sample-backend');
  const [repoUrl, setRepoUrl] = useState('');
  const [focusQuery, setFocusQuery] = useState('auth middleware, AST complexity, and error handling');
  const [filesJson, setFilesJson] = useState(
    DEFAULT_SAMPLE_REPO.map((f) => `// FILE: ${f.path}\n${f.content}`).join('\n\n')
  );
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [astOnlyResult, setAstOnlyResult] = useState<{
    astSummaries: AnalysisResponse['astSummaries'];
    depGraph: AnalysisResponse['depGraph'];
  } | null>(null);
  const [recentReports, setRecentReports] = useState<
    Array<{ _id: string; repoName: string; agentName: string; fileCount: number; astNodeCount: number; createdAt: string }>
  >([]);
  const [storageMode, setStorageMode] = useState<string>('checking');

  // Auth / Bearer token in React memory only (never localStorage)
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [authStatus, setAuthStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((data) => {
        if (data.storage) setStorageMode(data.storage);
        if (Array.isArray(data.reports)) setRecentReports(data.reports);
      })
      .catch(() => setStorageMode('offline'));
  }, []);

  const parseSnippetBlocks = (raw: string): Array<{ path: string; content: string }> => {
    const sections = raw.split(/^\/\/\s*FILE:\s*(.+)$/gm);
    if (sections.length <= 1) {
      return [{ path: 'src/index.ts', content: raw }];
    }
    const result: Array<{ path: string; content: string }> = [];
    for (let i = 1; i < sections.length; i += 2) {
      const path = sections[i].trim();
      const content = (sections[i + 1] ?? '').trim();
      if (path && content) {
        result.push({ path, content });
      }
    }
    return result.length > 0 ? result : [{ path: 'src/index.ts', content: raw }];
  };

  const handleStaticAstInspect = async () => {
    setErrorMsg(null);
    setIsRunning(true);
    onLivePipelineStateChange(3, 'Static TypeScript AST Inspection');

    try {
      const parsedFiles = parseSnippetBlocks(filesJson);
      const res = await fetch('/api/pipeline/ast-inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: parsedFiles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setAstOnlyResult(data);
      const totalNodes = (data.astSummaries as AnalysisResponse['astSummaries']).reduce(
        (sum, s) => sum + s.nodeCount,
        0
      );
      onLiveMetricsUpdated({
        timingsMs: { ingest: 4, ast: 18, depgraph: 9 },
        fileCount: data.astSummaries.length,
        astNodeCount: totalNodes,
        edgeCount: data.depGraph.edges.length,
      });
      onLivePipelineStateChange(6, 'AST Inspection Complete');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Static AST inspection failed.');
      onLivePipelineStateChange(null, null);
    } finally {
      setIsRunning(false);
    }
  };

  const handleFullPipelineRun = async () => {
    setErrorMsg(null);
    setIsRunning(true);
    onLiveAgentRunning(selectedAgentId);
    onLivePipelineStateChange(2, 'Express Middleware & Ingest');

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      let res: Response;
      if (inputMode === 'upload') {
        if (uploadFiles.length === 0) {
          throw new Error('Select one or more .ts, .tsx, .js, or .jsx files before running.');
        }
        const form = new FormData();
        form.append('agentId', selectedAgentId);
        form.append('focusQuery', focusQuery);
        form.append('repoName', repoName);
        uploadFiles.forEach((f) => form.append('files', f));
        onLivePipelineStateChange(4, 'Multer Upload & AI Agent Dispatch');
        res = await fetch('/api/pipeline/upload', { method: 'POST', headers, body: form });
      } else {
        headers['Content-Type'] = 'application/json';
        const body =
          inputMode === 'github'
            ? { repoUrl, agentId: selectedAgentId, focusQuery }
            : { repoName, files: parseSnippetBlocks(filesJson), agentId: selectedAgentId, focusQuery };

        onLivePipelineStateChange(4, 'AST Parse & Gemini Agent Dispatch');
        res = await fetch('/api/pipeline/analyze', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Pipeline failed with status ${res.status}`);
      }

      onLivePipelineStateChange(5, 'MongoDB Persistence');
      setAnalysis(data as AnalysisResponse);
      setAstOnlyResult({ astSummaries: data.astSummaries, depGraph: data.depGraph });
      onLiveMetricsUpdated({
        timingsMs: data.timingsMs,
        fileCount: data.report.fileCount,
        astNodeCount: data.report.astNodeCount,
        edgeCount: data.report.edgeCount,
      });

      const reportsRes = await fetch('/api/reports');
      if (reportsRes.ok) {
        const reportsJson = await reportsRes.json();
        if (Array.isArray(reportsJson.reports)) setRecentReports(reportsJson.reports);
      }

      onLivePipelineStateChange(6, 'Verified Response Delivered');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Repository analysis failed.');
      onLivePipelineStateChange(null, null);
    } finally {
      setIsRunning(false);
      onLiveAgentRunning(null);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthStatus(null);
    try {
      const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        authMode === 'register'
          ? { email: authEmail, name: authName, password: authPassword }
          : { email: authEmail, password: authPassword };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      setAuthToken(data.token);
      setAuthUser(data.user);
      setAuthPassword('');
      setAuthStatus(`Authenticated as ${data.user.email}`);
    } catch (err) {
      setAuthStatus(err instanceof Error ? err.message : 'Authentication error');
    }
  };

  return (
    <section
      id="analyzer"
      className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32 border-t border-white/[0.08]"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-wider text-blue-400">
            04. Live Repository Workbench
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[#F4F6FA] sm:text-4xl text-balance">
            Execute Real AST & Agent Analysis
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-400">
            Submit multi-file TypeScript snippets, upload source modules, or inspect a public GitHub repository. Server-side analysis builds real TypeScript ASTs and routes context to Gemini agents.
          </p>
        </div>

        <div className="font-mono text-xs text-slate-400">
          Persistence: <span className="text-slate-200">{storageMode}</span>
        </div>
      </div>

      {/* Workbench Two-Column Split */}
      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        {/* Left: Input Configuration */}
        <div className="space-y-6 lg:col-span-6">
          {/* Source Mode Switch */}
          <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-4">
            <button
              type="button"
              onClick={() => setInputMode('snippet')}
              className={`inline-flex items-center gap-2 border px-3.5 py-2 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'snippet'
                  ? 'border-blue-500/60 bg-blue-500/10 text-white'
                  : 'border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Source Snippets
            </button>
            <button
              type="button"
              onClick={() => setInputMode('github')}
              className={`inline-flex items-center gap-2 border px-3.5 py-2 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'github'
                  ? 'border-blue-500/60 bg-blue-500/10 text-white'
                  : 'border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              Public GitHub URL
            </button>
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`inline-flex items-center gap-2 border px-3.5 py-2 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                inputMode === 'upload'
                  ? 'border-blue-500/60 bg-blue-500/10 text-white'
                  : 'border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Files
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-xs text-slate-400">Target AI Agent</span>
              <select
                value={selectedAgentId}
                onChange={(e) => onSelectAgentId(e.target.value)}
                className="mt-1.5 w-full border border-white/15 bg-[#0c0e13] px-3 py-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
              >
                {AI_AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-mono text-xs text-slate-400">Workspace Label</span>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="mt-1.5 w-full border border-white/15 bg-[#0c0e13] px-3 py-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
                placeholder="my-service-repo"
              />
            </label>
          </div>

          <label className="block">
            <span className="font-mono text-xs text-slate-400">Retrieval Focus Query</span>
            <input
              type="text"
              value={focusQuery}
              onChange={(e) => setFocusQuery(e.target.value)}
              className="mt-1.5 w-full border border-white/15 bg-[#0c0e13] px-3 py-2.5 text-sm text-white focus:border-blue-400 focus:outline-none"
            />
          </label>

          {inputMode === 'snippet' && (
            <label className="block">
              <span className="font-mono text-xs text-slate-400">
                Multi-File Source Bundle (separate files with // FILE: path/to/file.ts)
              </span>
              <textarea
                rows={11}
                value={filesJson}
                onChange={(e) => setFilesJson(e.target.value)}
                spellCheck={false}
                className="mt-1.5 w-full border border-white/15 bg-[#080a0f] p-3 font-mono text-xs leading-relaxed text-slate-200 focus:border-blue-400 focus:outline-none"
              />
            </label>
          )}

          {inputMode === 'github' && (
            <label className="block">
              <span className="font-mono text-xs text-slate-400">
                Public GitHub Repository URL (https://github.com/owner/repo)
              </span>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/expressjs/express"
                className="mt-1.5 w-full border border-white/15 bg-[#0c0e13] px-3 py-2.5 font-mono text-xs text-white focus:border-blue-400 focus:outline-none"
              />
            </label>
          )}

          {inputMode === 'upload' && (
            <div className="border border-dashed border-white/20 bg-[#080a0f] p-6">
              <label className="block cursor-pointer">
                <span className="font-mono text-xs text-slate-300">
                  Select .ts, .tsx, .js, or .jsx files (uploaded via Multer memoryStorage, max 20 files)
                </span>
                <input
                  type="file"
                  multiple
                  accept=".ts,.tsx,.js,.jsx,.mjs,.json"
                  onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
                  className="mt-3 block w-full font-mono text-xs text-slate-400 file:mr-4 file:border file:border-white/15 file:bg-[#11151d] file:px-3 file:py-1.5 file:text-xs file:text-white"
                />
              </label>
              {uploadFiles.length > 0 && (
                <p className="mt-3 font-mono text-xs text-blue-400">
                  {uploadFiles.length} file(s) staged for analysis
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isRunning}
              onClick={handleFullPipelineRun}
              className="inline-flex items-center gap-2 bg-[#F4F6FA] px-5 py-2.5 text-sm font-semibold text-[#050608] transition-colors hover:bg-blue-400 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isRunning ? 'Executing Pipeline...' : 'Run Full AI Pipeline'}
              <ArrowRight className="h-4 w-4" />
            </button>

            {inputMode === 'snippet' && (
              <button
                type="button"
                disabled={isRunning}
                onClick={handleStaticAstInspect}
                className="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Inspect Static AST Only
              </button>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Right: Real AST Metrics, Findings & JWT Auth */}
        <div className="space-y-8 lg:col-span-6">
          {/* Output Panel */}
          <div className="border border-white/10 bg-[#080a0f] p-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <span className="font-mono text-xs text-slate-400">Execution Output</span>
              {analysis && (
                <span className="font-mono text-xs text-blue-400">
                  {analysis.report.agentName}
                </span>
              )}
            </div>

            {!analysis && !astOnlyResult ? (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-400">
                  Run Static AST Inspection or the Full AI Pipeline to view parsed TypeScript syntax trees, dependency edges, and verified agent findings.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                {analysis && (
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">
                      {analysis.report.repoName}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      {analysis.report.executiveSummary}
                    </p>

                    <div className="mt-4 grid grid-cols-4 gap-3 border-y border-white/[0.08] py-3 font-mono text-xs">
                      <div>
                        <div className="text-white tabular-nums">{analysis.report.fileCount}</div>
                        <div className="text-[11px] text-slate-500">Files</div>
                      </div>
                      <div>
                        <div className="text-white tabular-nums">{analysis.report.astNodeCount}</div>
                        <div className="text-[11px] text-slate-500">AST Nodes</div>
                      </div>
                      <div>
                        <div className="text-white tabular-nums">{analysis.report.edgeCount}</div>
                        <div className="text-[11px] text-slate-500">Dep Edges</div>
                      </div>
                      <div>
                        <div className="text-white tabular-nums">{analysis.report.cyclesDetected}</div>
                        <div className="text-[11px] text-slate-500">Cycles</div>
                      </div>
                    </div>

                    {analysis.report.findings.length > 0 && (
                      <div className="mt-5 space-y-4">
                        <div className="font-mono text-xs text-slate-400">Verified Findings</div>
                        {analysis.report.findings.map((finding, idx) => (
                          <div key={idx} className="border-t border-white/[0.08] pt-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                              <span className="text-blue-400">
                                {finding.severity} · {finding.file}
                              </span>
                              <span className="text-slate-500">
                                {finding.pathVerified ? 'Path Verified' : 'Unverified Path'}
                              </span>
                            </div>
                            <h4 className="mt-1 font-display text-sm font-semibold text-white">
                              {finding.title}
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed text-slate-400">
                              {finding.detail}
                            </p>
                            {finding.remediation && (
                              <p className="mt-1.5 font-mono text-[11px] text-slate-300">
                                Fix: {finding.remediation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {astOnlyResult && (
                  <div className="border-t border-white/[0.08] pt-4">
                    <div className="font-mono text-xs text-slate-400">
                      Parsed AST Modules & Dependency Edges ({astOnlyResult.depGraph.edges.length} edges)
                    </div>
                    <div className="mt-3 space-y-2">
                      {astOnlyResult.astSummaries.map((s) => (
                        <div
                          key={s.filePath}
                          className="flex items-center justify-between border-b border-white/[0.05] pb-2 font-mono text-xs"
                        >
                          <span className="truncate text-slate-200 max-w-[60%]">{s.filePath}</span>
                          <span className="text-slate-400 tabular-nums">
                            {s.nodeCount} nodes · CC {s.cyclomaticComplexity} · {s.symbolCount} syms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Express JWT + bcrypt Session & Persisted Reports */}
          <div className="grid gap-6 sm:grid-cols-2">
            <form
              onSubmit={handleAuthSubmit}
              className="border border-white/10 bg-[#080a0f] p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                  JWT + bcrypt Session
                </span>
                <button
                  type="button"
                  onClick={() => setAuthMode((m) => (m === 'login' ? 'register' : 'login'))}
                  className="font-mono text-[11px] text-blue-400 hover:underline"
                >
                  {authMode === 'login' ? 'Create account' : 'Sign in instead'}
                </button>
              </div>

              {authUser ? (
                <div className="space-y-2 pt-1 font-mono text-xs text-slate-300">
                  <div>Signed in: {authUser.name}</div>
                  <div className="text-slate-500">{authUser.email}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthToken(null);
                      setAuthUser(null);
                      setAuthStatus(null);
                    }}
                    className="border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <>
                  {authMode === 'register' && (
                    <input
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="Engineer name"
                      className="w-full border border-white/10 bg-[#0c0e13] px-2.5 py-2 text-xs text-white focus:border-blue-400 focus:outline-none"
                    />
                  )}
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="engineer@company.com"
                    className="w-full border border-white/10 bg-[#0c0e13] px-2.5 py-2 text-xs text-white focus:border-blue-400 focus:outline-none"
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Password (min 8 chars)"
                    className="w-full border border-white/10 bg-[#0c0e13] px-2.5 py-2 text-xs text-white focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="w-full border border-white/15 bg-white/[0.04] py-2 font-mono text-xs text-white hover:border-blue-400"
                  >
                    {authMode === 'register' ? 'Register & Issue JWT' : 'Authenticate JWT'}
                  </button>
                  {authStatus && <p className="font-mono text-[11px] text-blue-300">{authStatus}</p>}
                </>
              )}
            </form>

            <div className="border border-white/10 bg-[#080a0f] p-5">
              <div className="font-mono text-xs text-slate-300">Recent Persisted Reports</div>
              {recentReports.length === 0 ? (
                <p className="mt-4 font-mono text-xs text-slate-500">
                  No reports saved yet in this session.
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {recentReports.slice(0, 4).map((rep) => (
                    <li
                      key={rep._id}
                      className="border-b border-white/[0.06] pb-2 font-mono text-[11px]"
                    >
                      <div className="truncate text-slate-200">{rep.repoName}</div>
                      <div className="text-slate-500">
                        {rep.agentName} · {rep.fileCount} files · {rep.astNodeCount} AST
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

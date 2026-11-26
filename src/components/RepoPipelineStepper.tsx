import React, { useState } from 'react';
import { Check, Copy, Maximize2, X } from 'lucide-react';
import { REPO_PROCESSING_STAGES, type RepoProcessingStage } from '../data/devpilotData';

export interface LiveStageMetrics {
  timingsMs?: Record<string, number>;
  fileCount?: number;
  astNodeCount?: number;
  edgeCount?: number;
}

interface RepoPipelineStepperProps {
  liveMetrics: LiveStageMetrics | null;
}

function highlightCodeLine(line: string): React.ReactNode {
  const keywords =
    /\b(import|from|export|async|function|const|let|return|if|else|for|of|new|throw|await|interface|type)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = keywords.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push(line.slice(lastIdx, match.index));
    }
    parts.push(
      <span key={`${match.index}-${match[0]}`} className="text-blue-400">
        {match[0]}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < line.length) {
    parts.push(line.slice(lastIdx));
  }
  return parts.length > 0 ? parts : line;
}

export const RepoPipelineStepper: React.FC<RepoPipelineStepperProps> = ({ liveMetrics }) => {
  const [selectedId, setSelectedId] = useState<RepoProcessingStage['id']>('ingest');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const stage =
    REPO_PROCESSING_STAGES.find((s) => s.id === selectedId) ?? REPO_PROCESSING_STAGES[0];

  const liveDuration = liveMetrics?.timingsMs?.[stage.id];
  const isLive = typeof liveDuration === 'number';

  const displayDuration = isLive ? liveDuration : stage.demoMetrics.durationMs;
  const displayFiles = isLive && liveMetrics?.fileCount ? liveMetrics.fileCount : stage.demoMetrics.filesProcessed;
  const displaySymbols =
    isLive && liveMetrics?.astNodeCount
      ? liveMetrics.astNodeCount
      : stage.demoMetrics.symbolsIndexed;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stage.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const renderCodeLines = (codeText: string) =>
    codeText.split('\n').map((line, i) => (
      <div key={i} className="table-row">
        <span className="table-cell select-none pr-4 text-right text-slate-600 tabular-nums">
          {i + 1}
        </span>
        <span className="table-cell whitespace-pre text-slate-200">{highlightCodeLine(line)}</span>
      </div>
    ));

  return (
    <section
      id="repository-pipeline"
      className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32 border-t border-white/[0.08]"
    >
      <div className="max-w-2xl">
        <p className="font-mono text-xs tracking-wider text-blue-400">
          02. Repository Processing Pipeline
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[#F4F6FA] sm:text-4xl text-balance">
          Static AST & Context Routing Engine
        </h2>
        <p className="mt-3 text-base leading-relaxed text-slate-400">
          Inspect each deterministic stage of repository compilation. Select a stage below to examine its runtime contracts, execution metrics, and server implementation.
        </p>
      </div>

      {/* Spacious Horizontal Stepper */}
      <div
        role="tablist"
        aria-label="Repository processing stages"
        className="mt-10 grid grid-cols-2 gap-3 border-b border-white/[0.08] pb-6 sm:grid-cols-3 lg:grid-cols-6"
      >
        {REPO_PROCESSING_STAGES.map((item) => {
          const active = item.id === stage.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setSelectedId(item.id);
                setCopied(false);
              }}
              className={`flex flex-col items-start border px-4 py-3 text-left transition-colors ${
                active
                  ? 'border-blue-500/60 bg-blue-500/[0.08] text-white'
                  : 'border-white/[0.08] bg-transparent text-slate-400 hover:border-white/25 hover:text-slate-200'
              }`}
            >
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  active ? 'text-blue-400' : 'text-slate-500'
                }`}
              >
                {item.step}
              </span>
              <span className="mt-1 font-display text-sm font-semibold whitespace-nowrap">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Clean Two-Column Selected Stage Detail */}
      <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:items-start">
        {/* Left Column: Stage description, technologies, contracts, metrics */}
        <div className="space-y-8 lg:col-span-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
              <span className="text-blue-400">Stage {stage.step}</span>
              <span aria-hidden="true">·</span>
              <span>{stage.subtitle}</span>
            </div>
            <h3 className="mt-2 font-display text-2xl font-semibold text-white">
              {stage.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{stage.description}</p>
          </div>

          <div className="border-t border-white/[0.08] pt-5">
            <div className="font-mono text-xs text-slate-500">Technologies</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-200">
              {stage.technologies.map((tech, idx) => (
                <React.Fragment key={tech}>
                  <span>{tech}</span>
                  {idx < stage.technologies.length - 1 && (
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-white/[0.08] pt-5">
            <div>
              <div className="font-mono text-xs text-slate-500">Input Contract</div>
              <pre className="mt-1.5 overflow-x-auto bg-[#0c0e13] px-3 py-2 font-mono text-xs text-slate-300 border border-white/[0.06]">
                {stage.inputContract}
              </pre>
            </div>
            <div>
              <div className="font-mono text-xs text-slate-500">Output Contract</div>
              <pre className="mt-1.5 overflow-x-auto bg-[#0c0e13] px-3 py-2 font-mono text-xs text-blue-300 border border-white/[0.06]">
                {stage.outputContract}
              </pre>
            </div>
          </div>

          <div className="border-t border-white/[0.08] pt-5">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-slate-500">Execution Telemetry</span>
              <span className={isLive ? 'text-blue-400' : 'text-slate-400'}>
                {isLive ? 'Live Backend Execution' : 'Demonstration Metric'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <div className="font-display text-2xl font-semibold text-white tabular-nums">
                  {displayDuration} ms
                </div>
                <div className="font-mono text-[11px] text-slate-500">Elapsed Time</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold text-white tabular-nums">
                  {displayFiles}
                </div>
                <div className="font-mono text-[11px] text-slate-500">Files Parsed</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold text-white tabular-nums">
                  {displaySymbols}
                </div>
                <div className="font-mono text-[11px] text-slate-500">AST / Symbols</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Syntax-Highlighted Code Editor */}
        <div className="border border-white/10 bg-[#080a0f] lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="font-mono text-xs text-slate-300">{stage.filename}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 border border-white/10 px-2.5 py-1 font-mono text-xs text-slate-300 transition-colors hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-1.5 border border-white/10 px-2.5 py-1 font-mono text-xs text-slate-300 transition-colors hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Expand
              </button>
            </div>
          </div>
          <div className="overflow-x-auto p-4 font-mono text-xs leading-6">
            <div className="table w-full">{renderCodeLines(stage.code)}</div>
          </div>
        </div>
      </div>

      {/* Expanded Code Editor Modal */}
      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${stage.filename} expanded view`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col border border-white/15 bg-[#080a0f]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <span className="font-mono text-xs text-slate-200">
                {stage.filename} — {stage.title}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 border border-white/10 px-3 py-1.5 font-mono text-xs text-slate-200 hover:border-white/30"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label="Close expanded editor"
                  className="inline-flex items-center justify-center border border-white/10 p-1.5 text-slate-300 hover:border-white/30 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-5 font-mono text-xs leading-6">
              <div className="table w-full">{renderCodeLines(stage.code)}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

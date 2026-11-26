import React, { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';
import type { SyllabusModule } from '../data/devpilotData';

export const SyllabusSection: React.FC = () => {
  const [modules, setModules] = useState<SyllabusModule[]>([]);
  const [activeId, setActiveId] = useState<string>('web-fundamentals');
  const [probeOutput, setProbeOutput] = useState<string | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);

  useEffect(() => {
    fetch('/api/syllabus')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.modules)) {
          setModules(data.modules);
        }
      })
      .catch(() => {
        // Handled silently if offline
      });
  }, []);

  const current = modules.find((m) => m.id === activeId) ?? modules[0];

  const runDiagnosticProbe = async (probeName: string) => {
    setProbeLoading(true);
    setProbeOutput(null);
    try {
      const res = await fetch('/api/syllabus/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          probe: probeName,
          input: current?.codeSnippet ?? '',
        }),
      });
      const json = await res.json();
      setProbeOutput(JSON.stringify(json, null, 2));
    } catch (err) {
      setProbeOutput(err instanceof Error ? err.message : 'Probe execution failed.');
    } finally {
      setProbeLoading(false);
    }
  };

  return (
    <section
      id="syllabus"
      className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32 border-t border-white/[0.08]"
    >
      <div className="max-w-2xl">
        <p className="font-mono text-xs tracking-wider text-blue-400">
          05. Engineering Syllabus & Runtime Curriculum
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[#F4F6FA] sm:text-4xl text-balance">
          Full-Stack Systems Architecture
        </h2>
        <p className="mt-3 text-base leading-relaxed text-slate-400">
          Explore the complete underlying runtime stack powering DevPilot AI—from browser async primitives and Node.js Streams to Express middleware security and MongoDB Mongoose indexing.
        </p>
      </div>

      {/* Horizontal Module Selector */}
      <div className="mt-10 flex flex-wrap gap-2 border-b border-white/[0.08] pb-5">
        {modules.map((mod) => {
          const active = mod.id === current?.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => {
                setActiveId(mod.id);
                setProbeOutput(null);
              }}
              className={`border px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-blue-500/60 bg-blue-500/10 text-white'
                  : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
              }`}
            >
              {mod.title}
            </button>
          );
        })}
      </div>

      {current && (
        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          {/* Left: Curriculum Topics & Live Probe */}
          <div className="space-y-6 lg:col-span-5">
            <div>
              <div className="font-mono text-xs text-blue-400">{current.category}</div>
              <h3 className="mt-2 font-display text-2xl font-semibold text-white">
                {current.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{current.summary}</p>
            </div>

            <div className="border-t border-white/[0.08] pt-5">
              <div className="font-mono text-xs text-slate-500">Core Engineering Competencies</div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-slate-300">
                {current.topics.map((topic, idx) => (
                  <React.Fragment key={topic}>
                    <span className="font-mono">{topic}</span>
                    {idx < current.topics.length - 1 && (
                      <span aria-hidden="true" className="text-slate-600">
                        /
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="border-t border-white/[0.08] pt-5">
              <button
                type="button"
                disabled={probeLoading}
                onClick={() => runDiagnosticProbe(current.endpointProbe)}
                className="inline-flex items-center gap-2 border border-blue-500/50 bg-blue-500/10 px-4 py-2 font-mono text-xs text-blue-200 transition-colors hover:bg-blue-500/20 whitespace-nowrap shrink-0"
              >
                <Terminal className="h-3.5 w-3.5" />
                {probeLoading ? 'Probing Server...' : `Execute Live ${current.title} Probe`}
              </button>

              {probeOutput && (
                <pre className="mt-4 overflow-x-auto border border-white/10 bg-[#080a0f] p-4 font-mono text-xs text-blue-300">
                  {probeOutput}
                </pre>
              )}
            </div>
          </div>

          {/* Right: Production Implementation Snippet */}
          <div className="border border-white/10 bg-[#080a0f] lg:col-span-7">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 font-mono text-xs text-slate-400">
              <span>Reference Implementation — {current.title}</span>
              <span>TypeScript / Node.js</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-slate-200">
              {current.codeSnippet}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
};

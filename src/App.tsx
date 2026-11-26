/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Sparkles } from 'lucide-react';
import { NeuralReactor } from './components/three/NeuralReactor';
import { CircularCursor } from './components/CircularCursor';
import { InteractivePipeline } from './components/InteractivePipeline';
import { RepoPipelineStepper, type LiveStageMetrics } from './components/RepoPipelineStepper';
import { AgentShowcase } from './components/AgentShowcase';
import { RepoAnalyzerSection } from './components/RepoAnalyzerSection';
import { SyllabusSection } from './components/SyllabusSection';

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const scrollProgressRef = useRef<number>(0);
  const heroSectionRef = useRef<HTMLElement | null>(null);

  const [selectedAgentId, setSelectedAgentId] = useState<string>('architect');
  const [liveStageIdx, setLiveStageIdx] = useState<number | null>(null);
  const [liveExecLabel, setLiveExecLabel] = useState<string | null>(null);
  const [activeRunningAgentId, setActiveRunningAgentId] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<LiveStageMetrics | null>(null);

  // GSAP ScrollTrigger for cinematic reactor layer separation & section entrances
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (heroSectionRef.current) {
        ScrollTrigger.create({
          trigger: heroSectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            scrollProgressRef.current = self.progress;
          },
        });
      }

      gsap.utils.toArray<HTMLElement>('main > section').forEach((sec, idx) => {
        if (idx === 0) return; // Hero renders immediately at zero latency
        gsap.from(sec, {
          opacity: 0,
          y: 28,
          duration: 0.75,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: sec,
            start: 'top 86%',
            once: true,
          },
        });
      });
    });

    return () => ctx.revert();
  }, []);

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#050608] text-[#F4F6FA]">
      <CircularCursor />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#050608]/95">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4 lg:px-10">
          {/* Zone 1: Single text wordmark */}
          <a
            href="#hero"
            className="font-display text-lg font-bold tracking-tight text-[#F4F6FA] whitespace-nowrap shrink-0"
          >
            DevPilot AI
          </a>

          {/* Zone 2: 5 concise single-line text links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400"
          >
            <a
              href="#hero"
              className="transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              Reactor
            </a>
            <a
              href="#pipeline"
              className="transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              Pipeline
            </a>
            <a
              href="#repository-pipeline"
              className="transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              Repository
            </a>
            <a
              href="#agents"
              className="transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              Agents
            </a>
            <a
              href="#syllabus"
              className="transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              Syllabus
            </a>
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => scrollToId('analyzer')}
              className="bg-[#F4F6FA] px-4 py-2 text-xs font-semibold text-[#050608] transition-colors hover:bg-blue-400 hover:text-white whitespace-nowrap shrink-0"
            >
              Analyze Repo
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* 01. Full-Width Cinematic Hero Section (Borderless Floating 3D Reactor) */}
        <section
          id="hero"
          ref={heroSectionRef}
          className="relative mx-auto max-w-[1280px] px-6 pt-12 pb-20 lg:px-10 lg:pt-16 lg:pb-28"
        >
          <div className="grid items-center gap-10 lg:grid-cols-12">
            {/* Left Side: Editorial Typography & CTAs */}
            <div className="lg:col-span-5">
              <p className="font-mono text-xs tracking-wider text-blue-400">
                Project Titanium X · Autonomous Code Intelligence
              </p>

              <h1 className="mt-5 font-display text-[clamp(2.5rem,4.5vw,4.15rem)] font-bold leading-[1.06] tracking-tight text-[#F4F6FA] text-balance">
                Engineered to understand entire codebases.
              </h1>

              <p className="mt-6 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
                DevPilot AI parses TypeScript syntax trees, constructs directed dependency topologies, and orchestrates six specialized engineering agents across a verified full-stack pipeline.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => scrollToId('analyzer')}
                  className="group inline-flex items-center gap-2.5 bg-[#F4F6FA] px-6 py-3 text-sm font-semibold text-[#050608] transition-all duration-200 hover:bg-blue-400 hover:text-white whitespace-nowrap shrink-0"
                >
                  Launch Repo Analyzer
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  onClick={() => scrollToId('pipeline')}
                  className="inline-flex items-center gap-2 border border-white/15 px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-white/40 hover:text-white whitespace-nowrap shrink-0"
                >
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  Explore Architecture
                </button>
              </div>

              {/* Minimal Unboxed Technical Indicators */}
              <div className="mt-12 grid grid-cols-3 gap-6 border-t border-white/[0.08] pt-6">
                <div>
                  <div className="font-display text-2xl font-semibold text-white tabular-nums">
                    06
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                    AI Agents
                  </div>
                </div>
                <div>
                  <div className="font-display text-2xl font-semibold text-white tabular-nums">
                    07
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                    Backend Stages
                  </div>
                </div>
                <div>
                  <div className="font-display text-2xl font-semibold text-white tabular-nums">
                    AST
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                    Static Topology
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side: Transparent Floating 3D Neural Reactor (NO container border or card) */}
            <div className="lg:col-span-7">
              <NeuralReactor scrollProgressRef={scrollProgressRef} />
            </div>
          </div>
        </section>

        {/* 02. Redesigned 7-Stage Backend Pipeline */}
        <InteractivePipeline
          liveActiveStageIndex={liveStageIdx}
          liveExecutionLabel={liveExecLabel}
        />

        {/* 03. Repository Processing Horizontal Stepper */}
        <RepoPipelineStepper liveMetrics={liveMetrics} />

        {/* 04. Six Interactive 3D AI Agents */}
        <AgentShowcase
          activeRunningAgentId={activeRunningAgentId}
          onSelectAgentForAnalysis={(agentId) => {
            setSelectedAgentId(agentId);
            scrollToId('analyzer');
          }}
        />

        {/* 05. Live Repository Analyzer Workbench */}
        <RepoAnalyzerSection
          selectedAgentId={selectedAgentId}
          onSelectAgentId={setSelectedAgentId}
          onLivePipelineStateChange={(idx, label) => {
            setLiveStageIdx(idx);
            setLiveExecLabel(label);
          }}
          onLiveAgentRunning={setActiveRunningAgentId}
          onLiveMetricsUpdated={setLiveMetrics}
        />

        {/* 06. Complete Backend Engineering Syllabus */}
        <SyllabusSection />
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-white/[0.08] py-10">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-4 px-6 text-xs text-slate-500 sm:flex-row sm:items-center lg:px-10">
          <div className="font-display text-sm font-semibold text-slate-300">
            DevPilot AI — Project Titanium X
          </div>
          <div className="flex flex-wrap items-center gap-6 font-mono">
            <a href="#hero" className="hover:text-slate-200">
              Reactor
            </a>
            <a href="#pipeline" className="hover:text-slate-200">
              Pipeline
            </a>
            <a href="#agents" className="hover:text-slate-200">
              Agents
            </a>
            <a href="#syllabus" className="hover:text-slate-200">
              Syllabus
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

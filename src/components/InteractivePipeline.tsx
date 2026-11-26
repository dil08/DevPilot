import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Play, RotateCcw } from 'lucide-react';
import { BACKEND_PIPELINE_STAGES } from '../data/devpilotData';
import { detectSoftwareWebGL, disposeObject3D, scheduleAfterDraw } from './three/webglUtils';

interface InteractivePipelineProps {
  liveActiveStageIndex: number | null;
  liveExecutionLabel: string | null;
}

export const InteractivePipeline: React.FC<InteractivePipelineProps> = ({
  liveActiveStageIndex,
  liveExecutionLabel,
}) => {
  const [demoStageIndex, setDemoStageIndex] = useState<number | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef<number>(0);

  const effectiveActiveIndex =
    liveActiveStageIndex !== null
      ? liveActiveStageIndex
      : demoStageIndex !== null
        ? demoStageIndex
        : selectedStageIndex;

  activeIndexRef.current = effectiveActiveIndex;

  // Demo walkthrough runner
  useEffect(() => {
    if (!isDemoRunning) return;
    let step = 0;
    setDemoStageIndex(0);
    setSelectedStageIndex(0);

    const timer = window.setInterval(() => {
      step++;
      if (step >= BACKEND_PIPELINE_STAGES.length) {
        window.clearInterval(timer);
        setIsDemoRunning(false);
        return;
      }
      setDemoStageIndex(step);
      setSelectedStageIndex(step);
    }, 850);

    return () => window.clearInterval(timer);
  }, [isDemoRunning]);

  // 3D WebGL Floating Technology Nodes & Data Packet Conduit
  useEffect(() => {
    const container = canvasWrapRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(container.clientWidth, 320);
    const height = 160;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(0, 0.35, 11.5);

    const ambient = new THREE.AmbientLight('#94a3b8', 0.8);
    scene.add(ambient);

    const key = new THREE.DirectionalLight('#f8fafc', 2.0);
    key.position.set(4, 6, 6);
    scene.add(key);

    const blueFill = new THREE.DirectionalLight('#3b82f6', 1.4);
    blueFill.position.set(-5, -3, 4);
    scene.add(blueFill);

    // 7 distinct floating metallic nodes aligned horizontally
    const nodeGroups: THREE.Group[] = [];
    const nodeMaterials: THREE.MeshStandardMaterial[] = [];
    const spanX = 11.4;
    const startX = -spanX / 2;
    const stepX = spanX / 6;

    const geometries = [
      new THREE.OctahedronGeometry(0.32, 0),
      new THREE.TorusGeometry(0.28, 0.08, 16, 36),
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.IcosahedronGeometry(0.32, 0),
      new THREE.TorusKnotGeometry(0.22, 0.06, 48, 8),
      new THREE.CylinderGeometry(0.26, 0.26, 0.44, 16),
      new THREE.DodecahedronGeometry(0.32, 0),
    ];

    const ringGeo = new THREE.TorusGeometry(0.44, 0.022, 12, 48);

    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      g.position.set(startX + i * stepX, 0, 0);

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#b6c2d4'),
        metalness: 0.9,
        roughness: 0.22,
        emissive: new THREE.Color('#2563eb'),
        emissiveIntensity: 0.12,
      });
      nodeMaterials.push(mat);

      const coreMesh = new THREE.Mesh(geometries[i], mat);
      g.add(coreMesh);

      const halo = new THREE.Mesh(
        ringGeo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color('#475569'),
          metalness: 0.95,
          roughness: 0.18,
        })
      );
      halo.rotation.x = Math.PI * 0.35;
      g.add(halo);

      scene.add(g);
      nodeGroups.push(g);
    }

    // Connecting data pathway curve + glowing travelling data packets
    const curvePts = nodeGroups.map((ng) => ng.position.clone());
    const pathwayCurve = new THREE.CatmullRomCurve3(curvePts);
    const pathwayGeo = new THREE.TubeGeometry(pathwayCurve, 96, 0.022, 8, false);
    const pathwayMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#334155'),
      metalness: 0.85,
      roughness: 0.3,
      emissive: new THREE.Color('#1d4ed8'),
      emissiveIntensity: 0.35,
    });
    scene.add(new THREE.Mesh(pathwayGeo, pathwayMat));

    const packetGeo = new THREE.SphereGeometry(0.085, 16, 16);
    const packetMat = new THREE.MeshBasicMaterial({ color: '#60a5fa' });
    const packets: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(packetGeo, packetMat);
      scene.add(p);
      packets.push(p);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 280);
        camera.aspect = w / height;
        camera.updateProjectionMatrix();
        renderer.setSize(w, height);
      }
    });
    resizeObserver.observe(container);

    let isVisible = true;
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    io.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;
    const timers: number[] = [];
    let disposed = false;
    const _pt = new THREE.Vector3();

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      if (isVisible) {
        const activeIdx = activeIndexRef.current;

        nodeGroups.forEach((g, idx) => {
          const isActive = idx === activeIdx;
          const isPassed = idx <= activeIdx;
          g.rotation.y += delta * (isActive ? 1.8 : 0.45);
          g.rotation.x = Math.sin(elapsed * 1.1 + idx) * 0.22;
          g.position.y = Math.sin(elapsed * 1.5 + idx * 0.8) * 0.08 + (isActive ? 0.14 : 0);

          const targetScale = isActive ? 1.24 : 0.94;
          const nextS = THREE.MathUtils.damp(g.scale.x, targetScale, 8, delta);
          g.scale.setScalar(nextS);

          const mat = nodeMaterials[idx];
          mat.emissiveIntensity = THREE.MathUtils.damp(
            mat.emissiveIntensity,
            isActive ? 1.45 : isPassed ? 0.45 : 0.08,
            8,
            delta
          );
        });

        packets.forEach((p, idx) => {
          const t = (elapsed * 0.22 + idx * 0.25) % 1;
          pathwayCurve.getPointAt(t, _pt);
          p.position.copy(_pt);
        });

        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        scheduleAfterDraw(renderer, tick, (id) => timers.push(id));
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      timers.forEach((id) => clearTimeout(id));
      resizeObserver.disconnect();
      io.disconnect();
      disposeObject3D(scene);
      renderer.dispose();
    };
  }, []);

  const currentStage = BACKEND_PIPELINE_STAGES[effectiveActiveIndex] ?? BACKEND_PIPELINE_STAGES[0];

  return (
    <section
      id="pipeline"
      className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32 border-t border-white/[0.08]"
    >
      {/* Header Row */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-wider text-blue-400">
            01. Backend Request Architecture
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[#F4F6FA] sm:text-4xl text-balance">
            Seven-Stage Execution Pipeline
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-400">
            Every repository inspection flows deterministically from browser capture through Express security middleware, TypeScript AST compilation, Gemini agent orchestration, and Mongoose persistence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {liveExecutionLabel ? (
            <span className="font-mono text-xs text-blue-400">
              Live Execution: {liveExecutionLabel}
            </span>
          ) : isDemoRunning ? (
            <span className="font-mono text-xs text-slate-300">
              Demonstration Walkthrough Active
            </span>
          ) : (
            <span className="font-mono text-xs text-slate-500">
              Interactive Architecture View
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setDemoStageIndex(0);
              setIsDemoRunning(true);
            }}
            className="inline-flex items-center gap-2 border border-blue-500/50 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-500/20 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5" />
            Run Pipeline Walkthrough
          </button>

          <button
            type="button"
            onClick={() => {
              setIsDemoRunning(false);
              setDemoStageIndex(null);
              setSelectedStageIndex(0);
            }}
            className="inline-flex items-center gap-2 border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Floating 3D WebGL Node & Data Packet Pathway */}
      <div className="mt-10 hidden md:block">
        <div ref={canvasWrapRef} className="h-[160px] w-full" />
      </div>

      {/* Spacious 7-Stage Open Grid (no congested nested cards) */}
      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.08] py-8 sm:grid-cols-4 lg:grid-cols-7">
        {BACKEND_PIPELINE_STAGES.map((stage, idx) => {
          const isActive = idx === effectiveActiveIndex;
          const isCompleted = idx < effectiveActiveIndex;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => {
                setIsDemoRunning(false);
                setDemoStageIndex(null);
                setSelectedStageIndex(idx);
              }}
              className={`group text-left transition-opacity duration-200 ${
                isActive ? 'opacity-100' : isCompleted ? 'opacity-80 hover:opacity-100' : 'opacity-50 hover:opacity-90'
              }`}
            >
              <div className="flex items-baseline justify-between border-b pb-3 transition-colors duration-200 border-white/10 group-hover:border-white/30">
                <span
                  className={`font-display text-3xl font-bold tabular-nums tracking-tight ${
                    isActive ? 'text-blue-400' : 'text-[#C8D0DC]'
                  }`}
                >
                  {stage.number}
                </span>
                <span
                  className={`h-1.5 w-6 transition-colors ${
                    isActive ? 'bg-blue-400' : isCompleted ? 'bg-slate-400' : 'bg-white/10'
                  }`}
                />
              </div>
              <h3 className="mt-3 font-display text-sm font-semibold text-[#F4F6FA]">
                {stage.name}
              </h3>
              <p className="mt-1 font-mono text-[11px] leading-snug text-slate-400">
                {stage.layer}
              </p>
            </button>
          );
        })}
      </div>

      {/* Selected Stage Architectural Detail */}
      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
            <span className="text-blue-400">Stage {currentStage.number}</span>
            <span aria-hidden="true">/</span>
            <span>{currentStage.technology}</span>
          </div>
          <h3 className="mt-2 font-display text-2xl font-semibold text-white">
            {currentStage.name} — {currentStage.layer}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
            {currentStage.summary}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5">
          <div className="border-t border-white/10 pt-3">
            <div className="font-mono text-[11px] text-slate-500">Input Contract</div>
            <div className="mt-1.5 font-mono text-xs text-slate-200">
              {currentStage.contractIn}
            </div>
          </div>
          <div className="border-t border-white/10 pt-3">
            <div className="font-mono text-[11px] text-slate-500">Output Contract</div>
            <div className="mt-1.5 font-mono text-xs text-blue-300">
              {currentStage.contractOut}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

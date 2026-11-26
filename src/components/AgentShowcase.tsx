import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { AI_AGENTS, type AgentSpec } from '../data/devpilotData';
import { detectSoftwareWebGL, disposeObject3D, scheduleAfterDraw } from './three/webglUtils';

interface AgentShowcaseProps {
  activeRunningAgentId: string | null;
  onSelectAgentForAnalysis: (agentId: string) => void;
}

function buildAgentMeshGroup(type: AgentSpec['geometryType'], accentHex: string): {
  root: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  glassMesh: THREE.Mesh;
} {
  const root = new THREE.Group();

  const titaniumMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#cfd8e5'),
    metalness: 0.94,
    roughness: 0.18,
    clearcoat: 0.9,
    envMapIntensity: 1.5,
  });

  const graphiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1c222e'),
    metalness: 0.8,
    roughness: 0.45,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.55,
    metalness: 0.3,
    roughness: 0.25,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dbeafe'),
    metalness: 0.05,
    roughness: 0.08,
    transparent: true,
    opacity: 0.24,
    clearcoat: 1.0,
    depthWrite: false,
  });

  let primaryGeo: THREE.BufferGeometry;
  switch (type) {
    case 'dodecahedron_gyro':
      primaryGeo = new THREE.DodecahedronGeometry(0.72, 0);
      break;
    case 'torus_lattice':
      primaryGeo = new THREE.TorusKnotGeometry(0.46, 0.13, 64, 12, 2, 3);
      break;
    case 'octahedron_shield':
      primaryGeo = new THREE.OctahedronGeometry(0.76, 0);
      break;
    case 'helical_coil':
      primaryGeo = new THREE.TorusGeometry(0.56, 0.17, 20, 48);
      break;
    case 'cubic_matrix':
      primaryGeo = new THREE.BoxGeometry(0.84, 0.84, 0.84);
      break;
    default:
      primaryGeo = new THREE.IcosahedronGeometry(0.74, 0);
      break;
  }

  const primaryMesh = new THREE.Mesh(primaryGeo, titaniumMat);
  root.add(primaryMesh);

  const collarRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 16, 48), graphiteMat);
  collarRing.rotation.x = Math.PI * 0.36;
  root.add(collarRing);

  const innerCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), coreMat);
  root.add(innerCore);

  const glassMesh = new THREE.Mesh(new THREE.SphereGeometry(1.12, 28, 28), glassMat);
  glassMesh.renderOrder = 3;
  root.add(glassMesh);

  return { root, coreMat, glassMesh };
}

export const AgentShowcase: React.FC<AgentShowcaseProps> = ({
  activeRunningAgentId,
  onSelectAgentForAnalysis,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const hoveredIndexRef = useRef<number>(-1);
  const pointerTiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const ripplePulseRef = useRef<number[]>(AI_AGENTS.map(() => 0));
  const runningAgentRef = useRef<string | null>(activeRunningAgentId);
  runningAgentRef.current = activeRunningAgentId;

  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // Single WebGL Context Scissored Multi-Viewport Renderer for all 6 AI Agents
  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setScissorTest(true);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 25);
    camera.position.set(0, 0, 3.9);

    scene.add(new THREE.HemisphereLight('#cbd5e1', '#0f172a', 1.15));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.1);
    keyLight.position.set(3, 4, 5);
    scene.add(keyLight);

    const blueLight = new THREE.DirectionalLight('#60a5fa', 1.4);
    blueLight.position.set(-4, -2, 3);
    scene.add(blueLight);

    const agentAssemblies = AI_AGENTS.map((agent) => buildAgentMeshGroup(agent.geometryType, agent.accentColor));
    agentAssemblies.forEach((asm) => {
      asm.root.visible = false;
      scene.add(asm.root);
    });

    const syncCanvasSize = () => {
      const rect = section.getBoundingClientRect();
      renderer.setSize(Math.max(rect.width, 300), Math.max(rect.height, 400), false);
    };
    syncCanvasSize();

    const resizeObserver = new ResizeObserver(syncCanvasSize);
    resizeObserver.observe(section);

    let isVisible = true;
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.02 }
    );
    io.observe(section);

    const clock = new THREE.Clock();
    let frameId = 0;
    const timers: number[] = [];
    let disposed = false;

    const tick = () => {
      if (disposed) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      if (isVisible) {
        const sectionRect = section.getBoundingClientRect();
        const canvasWidth = sectionRect.width;
        const canvasHeight = sectionRect.height;

        renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        renderer.setScissor(0, 0, canvasWidth, canvasHeight);
        renderer.clear();

        for (let i = 0; i < AI_AGENTS.length; i++) {
          const slotEl = slotRefs.current[i];
          if (!slotEl) continue;

          const slotRect = slotEl.getBoundingClientRect();
          if (slotRect.bottom < 0 || slotRect.top > window.innerHeight) continue;

          const left = slotRect.left - sectionRect.left;
          const bottom = sectionRect.bottom - slotRect.bottom;
          const width = slotRect.width;
          const height = slotRect.height;

          if (width <= 0 || height <= 0) continue;

          const asm = agentAssemblies[i];
          const isHovered = hoveredIndexRef.current === i;
          const isRunning = runningAgentRef.current === AI_AGENTS[i].id;
          ripplePulseRef.current[i] = Math.max(0, ripplePulseRef.current[i] - delta * 1.4);
          const pulse = ripplePulseRef.current[i];

          asm.root.visible = true;
          const speed = isRunning ? 1.9 : isHovered ? 1.3 : 0.45;
          asm.root.rotation.y += delta * speed;
          asm.root.rotation.x = THREE.MathUtils.damp(
            asm.root.rotation.x,
            (isHovered ? -pointerTiltRef.current.y * 0.45 : 0.2) + Math.sin(elapsed + i) * 0.12,
            6,
            delta
          );
          asm.root.rotation.z = THREE.MathUtils.damp(
            asm.root.rotation.z,
            isHovered ? -pointerTiltRef.current.x * 0.35 : 0,
            6,
            delta
          );
          asm.root.position.y = Math.sin(elapsed * 1.4 + i * 1.1) * 0.08;
          asm.root.scale.setScalar(1 + pulse * 0.24 + (isHovered ? 0.08 : 0));

          asm.coreMat.emissiveIntensity =
            0.55 + (isHovered ? 0.9 : 0) + (isRunning ? 1.3 : 0) + pulse * 2.0;

          camera.aspect = width / height;
          camera.updateProjectionMatrix();

          renderer.setViewport(left, bottom, width, height);
          renderer.setScissor(left, bottom, width, height);
          renderer.render(scene, camera);
          asm.root.visible = false;
        }
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

  return (
    <section
      id="agents"
      ref={sectionRef}
      className="relative mx-auto max-w-[1280px] px-6 py-24 lg:px-10 lg:py-32 border-t border-white/[0.08]"
    >
      {/* Shared Scissored 3D Canvas Overlay */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      <div className="relative z-10 max-w-2xl">
        <p className="font-mono text-xs tracking-wider text-blue-400">
          03. Specialized Intelligence Modules
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[#F4F6FA] sm:text-4xl text-balance">
          Six Autonomous Engineering Agents
        </h2>
        <p className="mt-3 text-base leading-relaxed text-slate-400">
          Each agent operates on ranked TypeScript AST slices and dependency graphs with dedicated structural objectives. Click any agent module to trigger an energy pulse and launch a targeted repository run.
        </p>
      </div>

      {/* Spacious 3-Column Open Technical Grid */}
      <div className="relative z-10 mt-14 grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
        {AI_AGENTS.map((agent, idx) => {
          const isRunning = activeRunningAgentId === agent.id;
          const isHovered = hoveredAgentId === agent.id;

          return (
            <div
              key={agent.id}
              data-interactive="agent"
              onMouseEnter={() => {
                hoveredIndexRef.current = idx;
                setHoveredAgentId(agent.id);
              }}
              onMouseLeave={() => {
                hoveredIndexRef.current = -1;
                setHoveredAgentId(null);
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                pointerTiltRef.current = {
                  x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                  y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
                };
              }}
              onClick={() => {
                ripplePulseRef.current[idx] = 1;
              }}
              className={`group flex flex-col border-t pt-6 transition-colors duration-200 ${
                isRunning
                  ? 'border-blue-400'
                  : isHovered
                    ? 'border-white/35'
                    : 'border-white/[0.1]'
              }`}
            >
              {/* 3D Viewport Slot */}
              <div
                ref={(el) => {
                  slotRefs.current[idx] = el;
                }}
                className="h-44 w-full"
              />

              <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-slate-500">
                <span>0{idx + 1} · {agent.role}</span>
                {isRunning && <span className="text-blue-400">Executing</span>}
              </div>

              <h3 className="mt-2 font-display text-xl font-semibold text-[#F4F6FA]">
                {agent.name}
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {agent.responsibility}
              </p>

              <ul className="mt-4 space-y-1.5 font-mono text-xs text-slate-300">
                {agent.capabilities.map((cap) => (
                  <li key={cap} className="flex items-center gap-2">
                    <span className="h-px w-3 bg-blue-400/70" aria-hidden="true" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    ripplePulseRef.current[idx] = 1;
                    onSelectAgentForAnalysis(agent.id);
                  }}
                  className="border border-white/15 px-3.5 py-2 font-mono text-xs text-slate-200 transition-colors hover:border-blue-400 hover:text-white whitespace-nowrap shrink-0"
                >
                  Run {agent.name}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

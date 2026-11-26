import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import {
  detectSoftwareWebGL,
  createProceduralEnvironment,
  createBrushedMetalMaps,
  scheduleAfterDraw,
  disposeObject3D,
} from './webglUtils';
import { createTitaniumCore } from './TitaniumCore';
import { createMechanicalRings } from './MechanicalRings';
import { createOrbitalAgents } from './OrbitalAgents';
import { createParticleSystem } from './ParticleSystem';
import { createEnergyShockwave } from './EnergyShockwave';

interface NeuralReactorProps {
  scrollProgressRef: React.MutableRefObject<number>;
  onPulseTriggered?: () => void;
}

export const NeuralReactor: React.FC<NeuralReactorProps> = ({
  scrollProgressRef,
  onPulseTriggered,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pulseCallbackRef = useRef(onPulseTriggered);
  pulseCallbackRef.current = onPulseTriggered;

  const [webglError, setWebglError] = useState<string | null>(null);
  const [pulseCount, setPulseCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = detectSoftwareWebGL();
    const initialWidth = Math.max(container.clientWidth, 320);
    const initialHeight = Math.max(container.clientHeight, 360);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      setWebglError(
        err instanceof Error
          ? `WebGL initialization failed: ${err.message}`
          : 'WebGL context could not be initialized on this device.'
      );
      return;
    }

    const pixelRatio = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(initialWidth, initialHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.background = 'transparent';
    canvas.setAttribute('aria-label', 'DevPilot Neural Reactor interactive 3D intelligence sculpture');
    container.innerHTML = '';
    container.appendChild(canvas);

    // Scene & Camera (framed so reactor occupies ~85% of canvas area)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, initialWidth / initialHeight, 0.1, 60);
    const baseCameraPos = new THREE.Vector3(0, 0.25, 8.2);
    camera.position.copy(baseCameraPos);

    // Procedural Studio Environment Reflection (zero external assets)
    const envTex = createProceduralEnvironment(renderer);
    scene.environment = envTex;

    // 3-Point + Rim Studio Lighting Rig for high contrast against obsidian background
    const hemiLight = new THREE.HemisphereLight('#b8d4ff', '#1e293b', 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#fff7ed', 2.4);
    keyLight.position.set(5, 6, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    const d = 4.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#60a5fa', 1.35);
    fillLight.position.set(-6, -2, 4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#e2e8f0', 2.1);
    rimLight.position.set(0, 4, -6);
    scene.add(rimLight);

    const coreAccentLight = new THREE.PointLight('#3b82f6', 2.8, 9, 1.5);
    coreAccentLight.position.set(0, 0, 0);
    scene.add(coreAccentLight);

    // Build Composite Neural Reactor Sculpture
    const reactorRoot = new THREE.Group();
    reactorRoot.name = 'DevPilotNeuralReactor';
    scene.add(reactorRoot);

    const brushedMaps = createBrushedMetalMaps(renderer);
    const titaniumCore = createTitaniumCore(brushedMaps, isSoftwareGl);
    const mechanicalRings = createMechanicalRings(brushedMaps);
    const orbitalAgents = createOrbitalAgents();
    const particleSystem = createParticleSystem(pixelRatio);
    const energyShockwave = createEnergyShockwave();

    reactorRoot.add(titaniumCore.group);
    reactorRoot.add(mechanicalRings.group);
    reactorRoot.add(orbitalAgents.group);
    reactorRoot.add(particleSystem.group);
    scene.add(energyShockwave.group);

    // Drag to rotate 360° manually
    const controls = new OrbitControls(camera, canvas);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.72;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Interactive State & GSAP Shockwave Timeline
    const targetPointer = new THREE.Vector2(0, 0);
    const smoothPointer = new THREE.Vector2(0, 0);
    let hoverTarget = 0;
    let hoverSmooth = 0;
    let isDragging = false;
    let pointerDownPos = { x: 0, y: 0 };

    const pulseState = {
      explode: 0,
      speedMultiplier: 1,
      shockProgress: 0,
      shockOpacity: 0,
      emissivePulse: 0,
      burst: 0,
    };

    let activeTimeline: gsap.core.Timeline | null = null;

    const triggerShockwaveTimeline = () => {
      if (activeTimeline) {
        activeTimeline.kill();
      }
      pulseState.shockProgress = 0;
      pulseState.shockOpacity = 1;

      activeTimeline = gsap.timeline({
        onComplete: () => {
          pulseState.shockOpacity = 0;
        },
      });

      activeTimeline
        .to(
          pulseState,
          {
            explode: 1,
            speedMultiplier: 3.1,
            emissivePulse: 1,
            burst: 1,
            duration: 0.42,
            ease: 'power3.out',
          },
          0
        )
        .to(
          pulseState,
          {
            shockProgress: 1,
            shockOpacity: 0,
            duration: 0.95,
            ease: 'power2.out',
          },
          0.02
        )
        .to(
          pulseState,
          {
            explode: 0,
            speedMultiplier: 1,
            emissivePulse: 0,
            burst: 0,
            duration: 1.25,
            ease: 'elastic.out(1, 0.55)',
          },
          0.48
        );

      setPulseCount((c) => c + 1);
      pulseCallbackRef.current?.();
    };

    // Raycaster for hover inspection
    const raycaster = new THREE.Raycaster();
    const rayPointer = new THREE.Vector2();
    let lastRaycastAt = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      targetPointer.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1));

      const now = performance.now();
      if (now - lastRaycastAt > 45) {
        lastRaycastAt = now;
        rayPointer.set(nx, ny);
        raycaster.setFromCamera(rayPointer, camera);
        const hits = raycaster.intersectObject(reactorRoot, true);
        hoverTarget = hits.length > 0 ? 1 : 0;
      }
    };

    const handlePointerLeave = () => {
      targetPointer.set(0, 0);
      hoverTarget = 0;
    };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist < 7) {
        triggerShockwaveTimeline();
      }
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Reloading graphics pipeline...');
    };

    const handleContextRestored = () => {
      setWebglError(null);
    };

    canvas.addEventListener('pointermove', handlePointerMove, { passive: true });
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // ResizeObserver for crisp responsive sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 280);
        const h = Math.max(entry.contentRect.height, 320);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Visibility pause when offscreen
    let isVisible = true;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.05 }
    );
    intersectionObserver.observe(container);

    // Animation Loop
    const clock = new THREE.Clock();
    let frameId = 0;
    const timers: number[] = [];
    let disposed = false;

    const registerTimer = (id: number) => {
      timers.push(id);
    };

    const tick = () => {
      if (disposed) return;

      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (isVisible) {
        const motionFactor = prefersReducedMotion ? 0.18 : 1;
        const dt = Math.min(delta, 0.05) * motionFactor;

        // Smoothly damp pointer tracking & hover state
        smoothPointer.x = THREE.MathUtils.damp(smoothPointer.x, targetPointer.x, 5.5, Math.min(delta, 0.05));
        smoothPointer.y = THREE.MathUtils.damp(smoothPointer.y, targetPointer.y, 5.5, Math.min(delta, 0.05));
        hoverSmooth = THREE.MathUtils.damp(hoverSmooth, hoverTarget, 6.0, Math.min(delta, 0.05));

        const scrollExplode = THREE.MathUtils.clamp(scrollProgressRef.current, 0, 1) * 0.85;
        const combinedExplode = Math.min(1.25, pulseState.explode * 0.85 + scrollExplode);

        // Tilt reactor smoothly toward pointer + continuous subtle rotation
        if (!isDragging) {
          reactorRoot.rotation.y += dt * 0.14 * pulseState.speedMultiplier;
        }
        reactorRoot.rotation.x = THREE.MathUtils.damp(
          reactorRoot.rotation.x,
          -smoothPointer.y * 0.24 + scrollExplode * 0.35,
          4.5,
          Math.min(delta, 0.05)
        );
        reactorRoot.rotation.z = THREE.MathUtils.damp(
          reactorRoot.rotation.z,
          -smoothPointer.x * 0.16,
          4.5,
          Math.min(delta, 0.05)
        );

        // Subtle camera perspective shift & metallic light tracking
        fillLight.position.x = -6 + smoothPointer.x * 4.5;
        fillLight.position.y = -2 + smoothPointer.y * 4.0;
        coreAccentLight.intensity = 2.6 + hoverSmooth * 1.4 + pulseState.emissivePulse * 5.0;

        // Update sub-assemblies
        titaniumCore.uniforms.uMouse.value.copy(smoothPointer);
        titaniumCore.uniforms.uHoverIntensity.value = hoverSmooth;
        titaniumCore.uniforms.uShockWave.value = pulseState.shockProgress;

        titaniumCore.update(elapsed * motionFactor, combinedExplode, pulseState.emissivePulse);
        mechanicalRings.update(
          dt,
          elapsed * motionFactor,
          combinedExplode,
          pulseState.speedMultiplier,
          pulseState.emissivePulse,
          smoothPointer.x,
          smoothPointer.y
        );
        orbitalAgents.update(
          dt,
          elapsed * motionFactor,
          combinedExplode,
          pulseState.speedMultiplier,
          pulseState.emissivePulse
        );
        particleSystem.update(
          dt,
          elapsed * motionFactor,
          smoothPointer,
          pulseState.burst,
          combinedExplode
        );

        energyShockwave.trigger(pulseState.shockProgress, pulseState.shockOpacity);
        energyShockwave.faceCamera(camera);

        controls.update();
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        scheduleAfterDraw(renderer, tick, registerTimer);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      timers.forEach((id) => clearTimeout(id));
      activeTimeline?.kill();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      envTex.dispose();
      brushedMaps.roughnessMap.dispose();
      brushedMaps.bumpMap.dispose();
      disposeObject3D(scene);
      renderer.dispose();
    };
  }, [scrollProgressRef]);

  return (
    <div className="relative w-full h-full min-h-[460px] lg:min-h-[620px] select-none">
      {webglError ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center w-full h-full min-h-[460px] px-6 text-center border border-white/10 bg-[#0c0e13]/70"
        >
          <p className="font-mono text-xs uppercase tracking-widest text-blue-400">
            WebGL Fallback Diagnostic
          </p>
          <h3 className="mt-2 font-display text-lg font-semibold text-white">
            3D Hardware Acceleration Unavailable
          </h3>
          <p className="mt-2 max-w-md text-sm text-slate-400">{webglError}</p>
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            data-interactive="reactor"
            className="w-full h-full min-h-[460px] lg:min-h-[620px] cursor-grab active:cursor-grabbing"
          />
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-3 font-mono text-[11px] text-slate-400/80">
            <span>Drag to orbit</span>
            <span aria-hidden="true">·</span>
            <span>Click to trigger shockwave</span>
            {pulseCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-blue-400 tabular-nums">Pulses: {pulseCount}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

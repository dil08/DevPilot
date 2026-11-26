import React, { useEffect, useRef, useState } from 'react';

interface RippleEvent {
  id: number;
  x: number;
  y: number;
}

export const CircularCursor: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [touchRipples, setTouchRipples] = useState<RippleEvent[]>([]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const innerRingRef = useRef<SVGGElement | null>(null);
  const outerRingRef = useRef<SVGGElement | null>(null);
  const particlesRef = useRef<SVGGElement | null>(null);
  const lensRef = useRef<HTMLDivElement | null>(null);
  const clickWaveRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const finePointer =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(pointer: fine) and (hover: hover)').matches;

    if (prefersReducedMotion) return;

    if (!finePointer) {
      setIsTouchDevice(true);
      const handleTouch = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        const id = Date.now() + Math.random();
        setTouchRipples((prev) => [...prev.slice(-4), { id, x: touch.clientX, y: touch.clientY }]);
        window.setTimeout(() => {
          setTouchRipples((prev) => prev.filter((r) => r.id !== id));
        }, 700);
      };
      window.addEventListener('touchstart', handleTouch, { passive: true });
      return () => window.removeEventListener('touchstart', handleTouch);
    }

    setEnabled(true);
    document.body.classList.add('custom-cursor-active');

    let targetX = window.innerWidth * 0.5;
    let targetY = window.innerHeight * 0.5;
    let curX = targetX;
    let curY = targetY;
    let velX = 0;
    let velY = 0;
    let visible = false;
    let hoveringInteractive = false;
    let hoverMagX = 0;
    let hoverMagY = 0;
    let innerAngle = 0;
    let outerAngle = 0;
    let particleAngle = 0;
    let currentSize = 32;
    let clickPulse = 0;

    const isInteractiveEl = (el: EventTarget | null): HTMLElement | null => {
      if (!(el instanceof HTMLElement)) return null;
      return el.closest('button, a, input, textarea, select, [role="button"], [data-interactive]');
    };

    const onMouseMove = (e: MouseEvent) => {
      visible = true;
      const interactive = isInteractiveEl(e.target);
      hoveringInteractive = Boolean(interactive);

      if (interactive && interactive.tagName !== 'CANVAS') {
        const rect = interactive.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        // Subtle magnetic pull toward button center without hijacking pointer precision
        hoverMagX = (cx - e.clientX) * 0.14;
        hoverMagY = (cy - e.clientY) * 0.14;
      } else {
        hoverMagX = 0;
        hoverMagY = 0;
      }

      targetX = e.clientX + hoverMagX;
      targetY = e.clientY + hoverMagY;
    };

    const onMouseLeave = () => {
      visible = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      clickPulse = 1;
      if (clickWaveRef.current) {
        clickWaveRef.current.style.left = `${e.clientX}px`;
        clickWaveRef.current.style.top = `${e.clientY}px`;
        clickWaveRef.current.classList.remove('touch-ripple-ring');
        void clickWaveRef.current.offsetWidth;
        clickWaveRef.current.classList.add('touch-ripple-ring');
      }
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mousedown', onMouseDown, { passive: true });

    let rafId = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Spring-based cursor tracking
      const stiffness = 240;
      const damping = 26;
      const fx = (targetX - curX) * stiffness;
      const fy = (targetY - curY) * stiffness;
      velX = (velX + fx * dt) * Math.exp(-damping * dt);
      velY = (velY + fy * dt) * Math.exp(-damping * dt);
      curX += velX * dt;
      curY += velY * dt;

      const speed = Math.hypot(velX, velY);
      const velocityExpand = Math.min(speed * 0.012, 10);
      clickPulse = Math.max(0, clickPulse - dt * 3.5);

      const targetSize = (hoveringInteractive ? 58 : 32) + velocityExpand + clickPulse * 14;
      currentSize += (targetSize - currentSize) * Math.min(1, dt * 14);

      const rotBoost = hoveringInteractive ? 2.1 : 1.0 + Math.min(speed * 0.002, 1.4);
      innerAngle = (innerAngle + dt * 52 * rotBoost) % 360;
      outerAngle = (outerAngle - dt * 36 * rotBoost) % 360;
      particleAngle = (particleAngle + dt * 88 * rotBoost) % 360;

      if (rootRef.current) {
        rootRef.current.style.opacity = visible ? '1' : '0';
        rootRef.current.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;
      }

      if (lensRef.current) {
        lensRef.current.style.width = `${currentSize}px`;
        lensRef.current.style.height = `${currentSize}px`;
        lensRef.current.style.boxShadow = hoveringInteractive
          ? '0 0 22px rgba(96, 165, 250, 0.35), inset 0 0 12px rgba(255, 255, 255, 0.2)'
          : '0 0 12px rgba(200, 208, 220, 0.2), inset 0 0 8px rgba(255, 255, 255, 0.08)';
      }

      if (innerRingRef.current) {
        innerRingRef.current.style.transform = `rotate(${innerAngle}deg)`;
      }
      if (outerRingRef.current) {
        outerRingRef.current.style.transform = `rotate(${outerAngle}deg)`;
      }
      if (particlesRef.current) {
        particlesRef.current.style.transform = `rotate(${particleAngle}deg)`;
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      document.body.classList.remove('custom-cursor-active');
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  if (isTouchDevice) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden" aria-hidden="true">
        {touchRipples.map((r) => (
          <div
            key={r.id}
            style={{ left: r.x, top: r.y }}
            className="touch-ripple-ring absolute h-12 w-12 rounded-full border border-blue-400/70 bg-blue-400/10"
          />
        ))}
      </div>
    );
  }

  if (!enabled) return null;

  return (
    <>
      {/* Click expanding shockwave ring */}
      <div
        ref={clickWaveRef}
        aria-hidden="true"
        className="pointer-events-none fixed z-[9998] h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200/70 opacity-0"
      />

      {/* Circular Orbital VFX Cursor */}
      <div
        ref={rootRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-[9999] opacity-0 will-change-transform"
      >
        <div
          ref={lensRef}
          className="relative -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] backdrop-brightness-110 transition-shadow duration-150"
          style={{ width: 32, height: 32 }}
        >
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full overflow-visible"
            fill="none"
          >
            {/* Outer broken metallic orbital ring (rotates anticlockwise) */}
            <g ref={outerRingRef} style={{ transformOrigin: '50px 50px' }}>
              <circle
                cx="50"
                cy="50"
                r="46"
                stroke="rgba(226, 232, 240, 0.72)"
                strokeWidth="1.8"
                strokeDasharray="44 18 22 18"
                strokeLinecap="round"
              />
            </g>

            {/* Middle continuous hairline metallic lens rim */}
            <circle
              cx="50"
              cy="50"
              r="34"
              stroke="rgba(148, 163, 184, 0.45)"
              strokeWidth="1.2"
            />

            {/* Inner broken orbital ring (rotates clockwise) */}
            <g ref={innerRingRef} style={{ transformOrigin: '50px 50px' }}>
              <circle
                cx="50"
                cy="50"
                r="23"
                stroke="rgba(96, 165, 250, 0.85)"
                strokeWidth="1.8"
                strokeDasharray="28 14 14 14"
                strokeLinecap="round"
              />
            </g>

            {/* Revolving micro orbital particles */}
            <g ref={particlesRef} style={{ transformOrigin: '50px 50px' }}>
              <circle cx="50" cy="4" r="2.2" fill="#F4F6FA" />
              <circle cx="91" cy="68" r="1.9" fill="#60A5FA" />
              <circle cx="14" cy="72" r="1.7" fill="#C8D0DC" />
            </g>

            {/* Small white central dot */}
            <circle cx="50" cy="50" r="3.4" fill="#FFFFFF" />
          </svg>
        </div>
      </div>
    </>
  );
};

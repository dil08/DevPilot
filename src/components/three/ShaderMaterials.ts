import * as THREE from 'three';

export interface LiquidTitaniumUniforms {
  uTime: { value: number };
  uMouse: { value: THREE.Vector2 };
  uHoverIntensity: { value: number };
  uShockWave: { value: number };
  uEmissiveBoost: { value: number };
}

export function createLiquidTitaniumMaterial(
  maps: { roughnessMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture }
): { material: THREE.MeshPhysicalMaterial; uniforms: LiquidTitaniumUniforms } {
  const uniforms: LiquidTitaniumUniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uHoverIntensity: { value: 0 },
    uShockWave: { value: 0 },
    uEmissiveBoost: { value: 0 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#cfd8e5'),
    metalness: 0.94,
    roughness: 0.19,
    roughnessMap: maps.roughnessMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.012,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    anisotropy: 0.8,
    anisotropyRotation: 0.35,
    envMapIntensity: 1.55,
    emissive: new THREE.Color('#2563eb'),
    emissiveIntensity: 0.06,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uMouse = uniforms.uMouse;
    shader.uniforms.uHoverIntensity = uniforms.uHoverIntensity;
    shader.uniforms.uShockWave = uniforms.uShockWave;
    shader.uniforms.uEmissiveBoost = uniforms.uEmissiveBoost;

    shader.vertexShader =
      `
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uHoverIntensity;
      uniform float uShockWave;
      varying vec3 vLocalPos;
      varying float vWaveField;

      float titaniumWave(vec3 p, float t) {
        float w1 = sin(p.x * 4.5 + t * 1.4) * cos(p.y * 4.2 - t * 1.1);
        float w2 = sin((p.z + p.x) * 6.0 - t * 1.8) * 0.5;
        return (w1 + w2) * 0.5;
      }
      \n` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vLocalPos = position;
      float baseDeform = titaniumWave(position, uTime) * (0.016 + uHoverIntensity * 0.022);
      float mouseProximity = dot(normalize(position), normalize(vec3(uMouse.x, uMouse.y, 0.85)));
      float cursorPull = smoothstep(0.35, 1.0, mouseProximity) * (0.028 * uHoverIntensity);
      float shockPulse = sin(length(position.xy) * 10.0 - uShockWave * 14.0) * 0.035 * sin(uShockWave * 3.14159);
      float disp = baseDeform + cursorPull + shockPulse;
      vWaveField = disp;
      transformed += normal * disp;
      `
    );

    shader.fragmentShader =
      `
      uniform float uTime;
      uniform float uHoverIntensity;
      uniform float uShockWave;
      uniform float uEmissiveBoost;
      varying vec3 vLocalPos;
      varying float vWaveField;
      \n` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      vec3 viewDirFrag = normalize(vViewPosition);
      float fresnelTerm = pow(1.0 - clamp(abs(dot(normalize(normal), viewDirFrag)), 0.0, 1.0), 3.0);
      float energyLine = smoothstep(0.92, 0.99, abs(sin(vLocalPos.y * 12.0 + uTime * 2.2)));
      vec3 electricAccent = vec3(0.28, 0.58, 1.0);
      totalEmissiveRadiance += electricAccent * fresnelTerm * (0.28 + uHoverIntensity * 0.45 + uEmissiveBoost * 0.8);
      totalEmissiveRadiance += electricAccent * energyLine * (0.08 + uEmissiveBoost * 0.55);
      `
    );
  };

  material.customProgramCacheKey = () => 'liquid-titanium-pbr-v1';

  return { material, uniforms };
}

export function createGlassShellMaterial(isSoftwareGl: boolean): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dce9ff'),
    metalness: 0.05,
    roughness: 0.06,
    transmission: isSoftwareGl ? 0 : 0.88,
    transparent: true,
    opacity: isSoftwareGl ? 0.24 : 0.96,
    ior: 1.52,
    thickness: 0.65,
    attenuationColor: new THREE.Color('#60a5fa'),
    attenuationDistance: 2.6,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.6,
    depthWrite: false,
  });
}

export function createShockwaveShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColorCore: { value: new THREE.Color('#e2e8f0') },
      uColorAccent: { value: new THREE.Color('#3b82f6') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform float uOpacity;
      uniform vec3 uColorCore;
      uniform vec3 uColorAccent;
      varying vec2 vUv;

      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float dist = length(centered);
        float radius = mix(0.18, 0.94, uProgress);

        // Localized chromatic aberration across shockwave ring
        float ringR = exp(-pow((dist - (radius + 0.015)) * 22.0, 2.0));
        float ringG = exp(-pow((dist - radius) * 24.0, 2.0));
        float ringB = exp(-pow((dist - (radius - 0.015)) * 22.0, 2.0));

        // Secondary trailing harmonic ripple
        float ripple = exp(-pow((dist - (radius * 0.78)) * 30.0, 2.0)) * 0.45;

        float angle = atan(centered.y, centered.x);
        float noiseMod = 0.82 + 0.18 * sin(angle * 12.0 + uProgress * 10.0);

        vec3 chromaColor = vec3(
          ringR * uColorCore.r + ripple * 0.4,
          ringG * mix(uColorCore.g, uColorAccent.g, 0.5) + ripple * 0.6,
          ringB * uColorAccent.b + ripple
        );

        float alpha = clamp((ringG + ripple) * noiseMod * uOpacity, 0.0, 1.0);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(chromaColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createGpuParticleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uBurst: { value: 0 },
    },
    vertexShader: `
      attribute float aScale;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec2 uMouse;
      uniform float uBurst;
      varying float vAlpha;
      varying float vTint;

      void main() {
        vec3 pos = position;
        float angle = uTime * (0.18 + aPhase * 0.08);
        float c = cos(angle);
        float s = sin(angle);
        pos.xz = mat2(c, -s, s, c) * pos.xz;
        pos.y += sin(uTime * 1.1 + aPhase * 6.2831) * 0.14;

        // Radial burst during click shockwave
        pos += normalize(pos) * uBurst * 0.85;

        // Subtle pointer field repulsion
        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        vec2 ndc = (projectionMatrix * mvPos).xy;
        float dMouse = length(ndc - uMouse * 0.5);
        float push = smoothstep(0.65, 0.0, dMouse) * 0.24;
        pos += normalize(pos) * push;

        mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = (24.0 * aScale * uPixelRatio) / max(1.0, -mvPos.z);

        vAlpha = 0.45 + 0.45 * sin(uTime * 1.8 + aPhase * 6.2831);
        vTint = aPhase;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vTint;

      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.08, d);
        vec3 silver = vec3(0.84, 0.88, 0.94);
        vec3 blue = vec3(0.32, 0.60, 1.0);
        vec3 col = mix(silver, blue, step(0.65, vTint));
        gl_FragColor = vec4(col, core * vAlpha * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

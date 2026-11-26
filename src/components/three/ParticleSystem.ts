import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createGpuParticleMaterial } from './ShaderMaterials';

export interface ParticleSystemAssembly {
  group: THREE.Group;
  update: (
    delta: number,
    elapsed: number,
    pointerNdc: THREE.Vector2,
    burstAmount: number,
    explodeFactor: number
  ) => void;
}

interface ShardDatum {
  radius: number;
  theta: number;
  phi: number;
  speed: number;
  scale: number;
  rotSpeed: number;
}

export function createParticleSystem(pixelRatio: number): ParticleSystemAssembly {
  const group = new THREE.Group();
  group.name = 'ParticleSystem';

  // 1. InstancedMesh of floating metallic micro-processor shards (120 units)
  const shardCount = 120;
  const shardGeo = new RoundedBoxGeometry(0.055, 0.022, 0.085, 2, 0.008);
  const shardMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#c2ccd8'),
    metalness: 0.92,
    roughness: 0.22,
    clearcoat: 0.7,
    envMapIntensity: 1.4,
  });

  const instancedShards = new THREE.InstancedMesh(shardGeo, shardMat, shardCount);
  instancedShards.frustumCulled = false;

  const shardData: ShardDatum[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < shardCount; i++) {
    const radius = 2.0 + Math.random() * 1.45;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.85;
    shardData.push({
      radius,
      theta,
      phi,
      speed: (0.14 + Math.random() * 0.24) * (i % 2 === 0 ? 1 : -1),
      scale: 0.7 + Math.random() * 0.65,
      rotSpeed: 0.6 + Math.random() * 1.2,
    });

    dummy.position.set(
      Math.cos(theta) * Math.cos(phi) * radius,
      Math.sin(phi) * radius,
      Math.sin(theta) * Math.cos(phi) * radius
    );
    dummy.scale.setScalar(shardData[i].scale);
    dummy.updateMatrix();
    instancedShards.setMatrixAt(i, dummy.matrix);
  }
  instancedShards.instanceMatrix.needsUpdate = true;
  group.add(instancedShards);

  // 2. GPU Shader Particle Cloud (380 particles)
  const pointCount = 380;
  const pointGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(pointCount * 3);
  const scales = new Float32Array(pointCount);
  const phases = new Float32Array(pointCount);

  for (let i = 0; i < pointCount; i++) {
    const r = 1.65 + Math.random() * 1.95;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.8;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    scales[i] = 0.6 + Math.random() * 1.4;
    phases[i] = Math.random();
  }

  pointGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  pointGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const gpuMat = createGpuParticleMaterial();
  gpuMat.uniforms.uPixelRatio.value = pixelRatio;

  const points = new THREE.Points(pointGeo, gpuMat);
  points.frustumCulled = false;
  group.add(points);

  const update = (
    delta: number,
    elapsed: number,
    pointerNdc: THREE.Vector2,
    burstAmount: number,
    explodeFactor: number
  ) => {
    const dt = Math.min(delta, 0.05);

    gpuMat.uniforms.uTime.value = elapsed;
    gpuMat.uniforms.uMouse.value.copy(pointerNdc);
    gpuMat.uniforms.uBurst.value = burstAmount + explodeFactor * 0.45;

    for (let i = 0; i < shardCount; i++) {
      const d = shardData[i];
      d.theta += dt * d.speed;
      const r = d.radius + burstAmount * 0.7 + explodeFactor * 0.5;
      const floatY = Math.sin(elapsed * 1.3 + i) * 0.08;

      dummy.position.set(
        Math.cos(d.theta) * Math.cos(d.phi) * r,
        Math.sin(d.phi) * r + floatY,
        Math.sin(d.theta) * Math.cos(d.phi) * r
      );
      dummy.rotation.set(elapsed * d.rotSpeed, d.theta, elapsed * 0.5);
      dummy.scale.setScalar(d.scale);
      dummy.updateMatrix();
      instancedShards.setMatrixAt(i, dummy.matrix);
    }
    instancedShards.instanceMatrix.needsUpdate = true;
  };

  return { group, update };
}

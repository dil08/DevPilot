import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface OrbitalAgentsAssembly {
  group: THREE.Group;
  pods: THREE.Group[];
  update: (
    delta: number,
    elapsed: number,
    explodeFactor: number,
    speedMultiplier: number,
    pulseIntensity: number
  ) => void;
}

interface OrbitParams {
  radius: number;
  speed: number;
  inclinationX: number;
  inclinationZ: number;
  phase: number;
}

const ORBIT_CONFIGS: OrbitParams[] = [
  { radius: 2.82, speed: 0.48, inclinationX: 0.35, inclinationZ: 0.22, phase: 0 },
  { radius: 2.95, speed: -0.41, inclinationX: -0.52, inclinationZ: 0.38, phase: 1.05 },
  { radius: 2.75, speed: 0.56, inclinationX: 0.72, inclinationZ: -0.28, phase: 2.1 },
  { radius: 3.05, speed: 0.37, inclinationX: -0.24, inclinationZ: -0.62, phase: 3.14 },
  { radius: 2.88, speed: -0.51, inclinationX: 0.58, inclinationZ: 0.45, phase: 4.18 },
  { radius: 2.98, speed: 0.44, inclinationX: -0.68, inclinationZ: -0.18, phase: 5.22 },
];

export function createOrbitalAgents(): OrbitalAgentsAssembly {
  const group = new THREE.Group();
  group.name = 'OrbitalAgents';

  const titaniumMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d2dbe7'),
    metalness: 0.94,
    roughness: 0.16,
    clearcoat: 1.0,
    envMapIntensity: 1.6,
  });

  const graphiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#141820'),
    metalness: 0.78,
    roughness: 0.48,
    envMapIntensity: 1.1,
  });

  const coreGlowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#93c5fd'),
    emissive: new THREE.Color('#3b82f6'),
    emissiveIntensity: 1.15,
    metalness: 0.2,
    roughness: 0.2,
  });

  const orbGeo = new THREE.SphereGeometry(0.155, 28, 28);
  const collarGeo = new THREE.TorusGeometry(0.22, 0.022, 12, 36);
  const chassisGeo = new RoundedBoxGeometry(0.16, 0.26, 0.16, 2, 0.025);
  const beaconGeo = new THREE.OctahedronGeometry(0.065, 0);

  const pods: THREE.Group[] = [];
  const orbitAngles = ORBIT_CONFIGS.map((c) => c.phase);

  for (let i = 0; i < 6; i++) {
    const pod = new THREE.Group();

    const orb = new THREE.Mesh(orbGeo, titaniumMat);
    orb.castShadow = true;
    pod.add(orb);

    const chassis = new THREE.Mesh(chassisGeo, graphiteMat);
    chassis.rotation.z = Math.PI / 4;
    pod.add(chassis);

    const collar = new THREE.Mesh(collarGeo, titaniumMat);
    collar.rotation.x = Math.PI / 2.4;
    pod.add(collar);

    const beacon = new THREE.Mesh(beaconGeo, coreGlowMat);
    beacon.position.y = 0.19;
    pod.add(beacon);

    group.add(pod);
    pods.push(pod);
  }

  const _pos = new THREE.Vector3();
  const _euler = new THREE.Euler();

  const update = (
    delta: number,
    elapsed: number,
    explodeFactor: number,
    speedMultiplier: number,
    pulseIntensity: number
  ) => {
    const dt = Math.min(delta, 0.05);

    coreGlowMat.emissiveIntensity = 1.1 + Math.sin(elapsed * 3.2) * 0.3 + pulseIntensity * 2.4;

    for (let i = 0; i < pods.length; i++) {
      const cfg = ORBIT_CONFIGS[i];
      orbitAngles[i] += dt * cfg.speed * speedMultiplier;

      const r = cfg.radius + explodeFactor * 0.72;
      const ang = orbitAngles[i];

      _pos.set(
        Math.cos(ang) * r,
        Math.sin(elapsed * 1.4 + cfg.phase) * 0.16,
        Math.sin(ang) * r
      );
      _euler.set(cfg.inclinationX, 0, cfg.inclinationZ);
      _pos.applyEuler(_euler);

      const pod = pods[i];
      pod.position.copy(_pos);
      pod.rotation.y = elapsed * 0.9 + cfg.phase;
      pod.rotation.x = Math.sin(elapsed * 0.8 + i) * 0.35;
    }
  };

  return { group, pods, update };
}

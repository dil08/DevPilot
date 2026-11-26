import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface MechanicalRingsAssembly {
  group: THREE.Group;
  outerRing: THREE.Group;
  middleRing: THREE.Group;
  innerRing: THREE.Group;
  update: (
    delta: number,
    elapsed: number,
    explodeFactor: number,
    speedMultiplier: number,
    pulseIntensity: number,
    pointerTiltX: number,
    pointerTiltY: number
  ) => void;
}

export function createMechanicalRings(maps: {
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}): MechanicalRingsAssembly {
  const group = new THREE.Group();
  group.name = 'MechanicalRings';

  const brushedTitanium = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#c7d1de'),
    metalness: 0.95,
    roughness: 0.2,
    roughnessMap: maps.roughnessMap,
    bumpMap: maps.bumpMap,
    bumpScale: 0.008,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
    anisotropy: 0.75,
    envMapIntensity: 1.5,
  });

  const polishedChrome = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#eef2f6'),
    metalness: 1.0,
    roughness: 0.06,
    clearcoat: 1.0,
    envMapIntensity: 1.8,
  });

  const darkGraphite = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#191e28'),
    metalness: 0.82,
    roughness: 0.46,
    envMapIntensity: 1.15,
  });

  const conduitGlowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#93c5fd'),
    emissive: new THREE.Color('#3b82f6'),
    emissiveIntensity: 0.65,
    metalness: 0.2,
    roughness: 0.25,
  });

  // Helper: Create beveled mechanical arc segment
  const createArcFlange = (innerR: number, outerR: number, arcRad: number, depth: number) => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerR, -arcRad / 2, arcRad / 2, false);
    shape.absarc(0, 0, innerR, arcRad / 2, -arcRad / 2, true);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.015,
      bevelSegments: 2,
      curveSegments: 28,
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  };

  // =========================================================
  // 1. OUTER GYROSCOPE RING (Continuous Y-axis rotation)
  // =========================================================
  const outerRing = new THREE.Group();
  const outerMainTorus = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.085, 24, 96), brushedTitanium);
  outerMainTorus.castShadow = true;
  outerRing.add(outerMainTorus);

  const outerInnerRail = new THREE.Mesh(new THREE.TorusGeometry(2.24, 0.032, 16, 96), polishedChrome);
  outerRing.add(outerInnerRail);

  const outerFlangeGeo = createArcFlange(2.26, 2.52, Math.PI * 0.42, 0.14);
  const clampGeo = new RoundedBoxGeometry(0.18, 0.24, 0.26, 3, 0.03);

  const outerSegments: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const segGroup = new THREE.Group();
    const ang = (i * Math.PI) / 2;
    segGroup.rotation.z = ang;

    const flange = new THREE.Mesh(outerFlangeGeo, darkGraphite);
    flange.castShadow = true;
    segGroup.add(flange);

    const clamp = new THREE.Mesh(clampGeo, polishedChrome);
    clamp.position.set(2.38, 0, 0);
    segGroup.add(clamp);

    outerRing.add(segGroup);
    outerSegments.push(segGroup);
  }

  // Instanced precision rivets around outer ring (24 rivets)
  const rivetGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.19, 10);
  rivetGeo.rotateX(Math.PI / 2);
  const rivetInst = new THREE.InstancedMesh(rivetGeo, polishedChrome, 24);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 2.38, Math.sin(a) * 2.38, 0);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    rivetInst.setMatrixAt(i, dummy.matrix);
  }
  rivetInst.instanceMatrix.needsUpdate = true;
  rivetInst.computeBoundingSphere();
  outerRing.add(rivetInst);

  outerRing.rotation.x = 0.38;
  group.add(outerRing);

  // =========================================================
  // 2. MIDDLE GYROSCOPE RING (Continuous X-axis rotation)
  // =========================================================
  const middleRing = new THREE.Group();
  const midTorus = new THREE.Mesh(new THREE.TorusGeometry(1.94, 0.072, 24, 88), darkGraphite);
  midTorus.castShadow = true;
  middleRing.add(midTorus);

  const midChromeLip = new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.024, 16, 88), polishedChrome);
  middleRing.add(midChromeLip);

  const midFlangeGeo = createArcFlange(1.84, 2.04, Math.PI * 0.55, 0.12);
  const knotCouplerGeo = new THREE.TorusKnotGeometry(0.09, 0.025, 48, 10, 2, 3);
  const trunnionGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.24, 16);

  const midSegments: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const segGroup = new THREE.Group();
    segGroup.rotation.z = (i * Math.PI * 2) / 3;

    const flange = new THREE.Mesh(midFlangeGeo, brushedTitanium);
    segGroup.add(flange);

    const coupler = new THREE.Mesh(knotCouplerGeo, polishedChrome);
    coupler.position.set(1.94, 0, 0);
    segGroup.add(coupler);

    const trunnion = new THREE.Mesh(trunnionGeo, darkGraphite);
    trunnion.position.set(-1.94, 0, 0);
    trunnion.rotation.z = Math.PI / 2;
    segGroup.add(trunnion);

    middleRing.add(segGroup);
    midSegments.push(segGroup);
  }

  middleRing.rotation.y = 0.65;
  group.add(middleRing);

  // =========================================================
  // 3. INNER GYROSCOPE RING (Continuous diagonal rotation)
  // =========================================================
  const innerRing = new THREE.Group();
  const innerTorus = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.058, 20, 80), brushedTitanium);
  innerRing.add(innerTorus);

  const innerConduit = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.018, 12, 80), conduitGlowMat);
  innerConduit.position.z = 0.045;
  innerRing.add(innerConduit);

  const finGeo = new RoundedBoxGeometry(0.11, 0.045, 0.18, 2, 0.012);
  const finInst = new THREE.InstancedMesh(finGeo, darkGraphite, 18);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 1.56, Math.sin(a) * 1.56, 0);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    finInst.setMatrixAt(i, dummy.matrix);
  }
  finInst.instanceMatrix.needsUpdate = true;
  finInst.computeBoundingSphere();
  innerRing.add(finInst);

  innerRing.rotation.set(0.85, 0.45, 0.35);
  group.add(innerRing);

  const update = (
    delta: number,
    elapsed: number,
    explodeFactor: number,
    speedMultiplier: number,
    pulseIntensity: number,
    pointerTiltX: number,
    pointerTiltY: number
  ) => {
    const dt = Math.min(delta, 0.05);

    // Distinct continuous rotational axes & speeds
    outerRing.rotation.y += dt * 0.42 * speedMultiplier;
    outerRing.rotation.x = 0.38 + pointerTiltY * 0.25;

    middleRing.rotation.x += dt * 0.58 * speedMultiplier;
    middleRing.rotation.y = 0.65 + pointerTiltX * 0.28;

    // Diagonal continuous rotation for inner ring
    innerRing.rotation.x += dt * 0.48 * speedMultiplier;
    innerRing.rotation.y += dt * 0.66 * speedMultiplier;
    innerRing.rotation.z += dt * 0.31 * speedMultiplier;

    // Expand outer & middle rings radially on click shockwave or scroll
    const outerScale = 1 + explodeFactor * 0.24;
    const midScale = 1 + explodeFactor * 0.17;
    const innerScale = 1 + explodeFactor * 0.11;

    outerRing.scale.setScalar(outerScale);
    middleRing.scale.setScalar(midScale);
    innerRing.scale.setScalar(innerScale);

    outerSegments.forEach((seg, idx) => {
      const a = (idx * Math.PI) / 2;
      const offset = explodeFactor * 0.36;
      seg.position.set(Math.cos(a) * offset, Math.sin(a) * offset, Math.sin(elapsed * 1.5 + idx) * 0.025);
    });

    midSegments.forEach((seg, idx) => {
      const a = (idx * Math.PI * 2) / 3;
      const offset = explodeFactor * 0.28;
      seg.position.set(Math.cos(a) * offset, Math.sin(a) * offset, 0);
    });

    conduitGlowMat.emissiveIntensity = 0.65 + Math.sin(elapsed * 3.5) * 0.25 + pulseIntensity * 2.8;
  };

  return {
    group,
    outerRing,
    middleRing,
    innerRing,
    update,
  };
}

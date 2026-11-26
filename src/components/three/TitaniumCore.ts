import * as THREE from 'three';
import {
  createLiquidTitaniumMaterial,
  createGlassShellMaterial,
  type LiquidTitaniumUniforms,
} from './ShaderMaterials';

export interface TitaniumCoreAssembly {
  group: THREE.Group;
  innerSphere: THREE.Mesh;
  innerCrystal: THREE.Mesh;
  glassShell: THREE.Mesh;
  circuitMeshes: THREE.Mesh[];
  shellPlates: THREE.Group;
  uniforms: LiquidTitaniumUniforms;
  update: (elapsed: number, explodeFactor: number, pulseIntensity: number) => void;
}

export function createTitaniumCore(
  maps: { roughnessMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture },
  isSoftwareGl: boolean
): TitaniumCoreAssembly {
  const group = new THREE.Group();
  group.name = 'TitaniumCore';

  const { material: titaniumMat, uniforms } = createLiquidTitaniumMaterial(maps);

  const darkGraphiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#181c24'),
    metalness: 0.78,
    roughness: 0.45,
    envMapIntensity: 1.1,
  });

  const chromeMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#eef2f8'),
    metalness: 1.0,
    roughness: 0.06,
    clearcoat: 1.0,
    envMapIntensity: 1.8,
  });

  // 1. Central Liquid-Metal Titanium Sphere
  const sphereGeo = new THREE.SphereGeometry(0.92, 64, 64);
  const innerSphere = new THREE.Mesh(sphereGeo, titaniumMat);
  innerSphere.castShadow = true;
  innerSphere.receiveShadow = true;
  group.add(innerSphere);

  // 2. Internal Glowing Neural Core Crystal (revealed on click/scroll split)
  const crystalGeo = new THREE.IcosahedronGeometry(0.56, 1);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#60a5fa'),
    emissive: new THREE.Color('#2563eb'),
    emissiveIntensity: 1.4,
    metalness: 0.4,
    roughness: 0.15,
    wireframe: true,
  });
  const innerCrystal = new THREE.Mesh(crystalGeo, crystalMat);
  group.add(innerCrystal);

  // 3. Internal Glowing Energy Conduit Pathways (TubeGeometry along 3D CatmullRomCurve3)
  const circuitMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const pts: THREE.Vector3[] = [];
    const offsetAngle = (i * Math.PI * 2) / 3;
    for (let s = 0; s <= 16; s++) {
      const t = (s / 16) * Math.PI * 2;
      const r = 1.02 + Math.sin(t * 2) * 0.06;
      pts.push(
        new THREE.Vector3(
          Math.cos(t + offsetAngle) * r,
          Math.sin(t * 2) * 0.48,
          Math.sin(t + offsetAngle) * r
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.018, 8, true);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#93c5fd'),
      emissive: new THREE.Color('#3b82f6'),
      emissiveIntensity: 1.1,
      metalness: 0.3,
      roughness: 0.2,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tubeMesh);
    circuitMeshes.push(tubeMesh);
  }

  // 4. Precision-Machined Articulated Titanium Shell Plates (ExtrudeGeometry with bevels)
  const shellPlates = new THREE.Group();
  const arcShape = new THREE.Shape();
  arcShape.absarc(0, 0, 1.18, -0.42, 0.42, false);
  arcShape.absarc(0, 0, 1.06, 0.42, -0.42, true);
  arcShape.closePath();

  const plateGeo = new THREE.ExtrudeGeometry(arcShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 24,
  });
  plateGeo.translate(0, 0, -0.11);

  const pinGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.32, 12);

  for (let i = 0; i < 4; i++) {
    const platePivot = new THREE.Group();
    const angle = (i * Math.PI) / 2;
    platePivot.rotation.y = angle;
    platePivot.rotation.z = i % 2 === 0 ? 0.28 : -0.28;

    const plateMesh = new THREE.Mesh(plateGeo, i % 2 === 0 ? darkGraphiteMat : titaniumMat);
    plateMesh.castShadow = true;
    plateMesh.receiveShadow = true;
    plateMesh.userData.baseRadius = 0;
    platePivot.add(plateMesh);

    const pinMesh = new THREE.Mesh(pinGeo, chromeMat);
    pinMesh.position.set(1.12, 0, 0);
    pinMesh.rotation.x = Math.PI / 2;
    platePivot.add(pinMesh);

    shellPlates.add(platePivot);
  }
  group.add(shellPlates);

  // 5. Outer Transparent Optical Glass Containment Shell
  const glassGeo = new THREE.SphereGeometry(1.32, 48, 48);
  const glassMat = createGlassShellMaterial(isSoftwareGl);
  const glassShell = new THREE.Mesh(glassGeo, glassMat);
  glassShell.renderOrder = 4;
  group.add(glassShell);

  const update = (elapsed: number, explodeFactor: number, pulseIntensity: number) => {
    innerSphere.rotation.y = elapsed * 0.28;
    innerSphere.rotation.x = Math.sin(elapsed * 0.35) * 0.18;

    innerCrystal.rotation.y = -elapsed * 0.55;
    innerCrystal.rotation.z = elapsed * 0.4;
    const cMat = innerCrystal.material as THREE.MeshStandardMaterial;
    cMat.emissiveIntensity = 1.2 + Math.sin(elapsed * 3.2) * 0.35 + pulseIntensity * 2.2;

    shellPlates.rotation.y = -elapsed * 0.22;
    shellPlates.children.forEach((pivot, idx) => {
      const radialPush = explodeFactor * 0.55;
      const plate = pivot.children[0];
      if (plate) {
        plate.position.x = radialPush;
        plate.position.y = Math.sin(elapsed * 1.4 + idx) * 0.03;
      }
    });

    circuitMeshes.forEach((mesh, idx) => {
      mesh.rotation.y = elapsed * (0.3 + idx * 0.08);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.9 + Math.sin(elapsed * 4.0 + idx * 2.1) * 0.4 + pulseIntensity * 2.5;
    });

    uniforms.uTime.value = elapsed;
    uniforms.uEmissiveBoost.value = pulseIntensity;
    glassShell.scale.setScalar(1 + explodeFactor * 0.16);
  };

  return {
    group,
    innerSphere,
    innerCrystal,
    glassShell,
    circuitMeshes,
    shellPlates,
    uniforms,
    update,
  };
}

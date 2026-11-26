import * as THREE from 'three';
import { createShockwaveShaderMaterial } from './ShaderMaterials';

export interface EnergyShockwaveAssembly {
  group: THREE.Group;
  trigger: (progress: number, opacity: number) => void;
  faceCamera: (camera: THREE.Camera) => void;
}

export function createEnergyShockwave(): EnergyShockwaveAssembly {
  const group = new THREE.Group();
  group.name = 'EnergyShockwave';

  const primaryMat = createShockwaveShaderMaterial();
  const secondaryMat = createShockwaveShaderMaterial();
  secondaryMat.uniforms.uColorCore.value.set('#93c5fd');

  const planeGeo = new THREE.PlaneGeometry(7.2, 7.2);

  const primaryMesh = new THREE.Mesh(planeGeo, primaryMat);
  primaryMesh.renderOrder = 6;
  primaryMesh.visible = false;
  group.add(primaryMesh);

  const secondaryMesh = new THREE.Mesh(planeGeo, secondaryMat);
  secondaryMesh.renderOrder = 5;
  secondaryMesh.rotation.x = Math.PI * 0.35;
  secondaryMesh.visible = false;
  group.add(secondaryMesh);

  const trigger = (progress: number, opacity: number) => {
    const active = opacity > 0.01;
    primaryMesh.visible = active;
    secondaryMesh.visible = active;
    primaryMat.uniforms.uProgress.value = progress;
    primaryMat.uniforms.uOpacity.value = opacity;

    secondaryMat.uniforms.uProgress.value = Math.max(0, progress - 0.1);
    secondaryMat.uniforms.uOpacity.value = opacity * 0.72;
  };

  const faceCamera = (camera: THREE.Camera) => {
    primaryMesh.quaternion.copy(camera.quaternion);
  };

  return { group, trigger, faceCamera };
}

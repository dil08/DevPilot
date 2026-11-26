import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let cachedIsSoftwareGl: boolean | null = null;

export function detectSoftwareWebGL(): boolean {
  if (cachedIsSoftwareGl !== null) return cachedIsSoftwareGl;
  if (typeof document === 'undefined') return false;

  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) {
      cachedIsSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedIsSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedIsSoftwareGl;
  } catch {
    cachedIsSoftwareGl = false;
    return false;
  }
}

export function createProceduralEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();
  return envTex;
}

export function createBrushedMetalMaps(renderer: THREE.WebGLRenderer): {
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Fine directional brushed titanium micro-grooves
    for (let y = 0; y < size; y++) {
      const lum = 105 + Math.floor(Math.sin(y * 0.7) * 18 + (Math.random() - 0.5) * 32);
      ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      ctx.fillRect(0, y, size, 1);
    }

    // Subtle machined panel seam lines
    ctx.strokeStyle = 'rgba(40,40,40,0.65)';
    ctx.lineWidth = 2;
    for (let i = 32; i < size; i += 64) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
  }

  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

  const roughnessMap = new THREE.CanvasTexture(canvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 2);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(canvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 2);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = maxAniso;

  return { roughnessMap, bumpMap };
}

export function scheduleAfterDraw(
  renderer: THREE.WebGLRenderer,
  cb: () => void,
  registerTimer: (id: number) => void
): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (typeof gl.fenceSync === 'function') {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        registerTimer(window.setTimeout(poll, 5));
      } else {
        if (sync) gl.deleteSync(sync);
        registerTimer(window.setTimeout(cb, 80));
      }
    };
    registerTimer(window.setTimeout(poll, 5));
  } else {
    registerTimer(window.setTimeout(cb, 80));
  }
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((mat) => mat.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
    }
  });
}

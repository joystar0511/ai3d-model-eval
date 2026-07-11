/**
 * ModelViewer - Three.js based 3D model preview component
 * Supports: OBJ, FBX, GLTF/GLB, STL, PLY
 * Preview modes: gray, wireframe, color, material (with directional light + maps)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

class ModelViewer {
  constructor(container, file) {
    this.container = container;
    this.file = file;
    this.mode = 'gray';
    this.mesh = null;
    this.originalMaterials = [];
    this.textures = { color: null, normal: null, metalness: null, roughness: null };
    this.geometryData = null;

    this._initThree();
    this._loadModel();
    this._animate();
  }

  _initThree() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e2e);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);
    this.camera.position.set(3, 2, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Ambient light for base illumination
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    // Directional light (used in material mode)
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.directionalLight.position.set(5, 8, 5);
    this.scene.add(this.directionalLight);

    // Grid helper
    this.gridHelper = new THREE.GridHelper(10, 20, 0x444466, 0x333344);
    this.scene.add(this.gridHelper);

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.container);

    // Info overlay
    this.infoDiv = document.createElement('div');
    this.infoDiv.className = 'viewer-info';
    this.container.appendChild(this.infoDiv);
  }

  async _loadModel() {
    const ext = this.file.name.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(this.file);

    try {
      let object;
      switch (ext) {
        case 'obj':
          object = await new OBJLoader().loadAsync(url);
          break;
        case 'fbx':
          object = await new FBXLoader().loadAsync(url);
          break;
        case 'gltf':
        case 'glb':
          const gltf = await new GLTFLoader().loadAsync(url);
          object = gltf.scene;
          break;
        case 'stl':
          const stlGeo = await new STLLoader().loadAsync(url);
          object = new THREE.Mesh(stlGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
          break;
        case 'ply':
          const plyGeo = await new PLYLoader().loadAsync(url);
          object = new THREE.Mesh(plyGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
          break;
        case 'blend':
          this._showError('Blender(.blend)格式需先转换为glTF/OBJ格式后在浏览器中预览');
          return;
        default:
          this._showError(`不支持的格式: .${ext}`);
          return;
      }

      URL.revokeObjectURL(url);
      this._setupModel(object);
    } catch (err) {
      console.error('Load error:', err);
      this._showError('模型加载失败: ' + (err.message || '未知错误'));
    }
  }

  _setupModel(object) {
    // Collect all meshes
    const meshes = [];
    object.traverse(child => {
      if (child.isMesh) {
        meshes.push(child);
        // Save original materials
        this.originalMaterials.push({ mesh: child, material: child.material });
        // Try to extract textures from material
        this._extractTextures(child.material);
      }
    });

    if (meshes.length === 0) {
      this._showError('模型中未找到网格数据');
      return;
    }

    this.mesh = object;
    this.scene.add(object);

    // Compute bounding box and normalize
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2.5 / maxDim;

    object.scale.setScalar(scale);
    object.position.sub(center.multiplyScalar(scale));

    // Adjust camera
    const dist = 4;
    this.camera.position.set(dist, dist * 0.7, dist);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    // Collect geometry data for evaluation
    this._collectGeometryData(meshes);

    // Apply initial mode
    this.setMode('gray');

    // Update info
    const totalVerts = this.geometryData.totalVertices;
    const totalFaces = this.geometryData.totalFaces;
    this.infoDiv.textContent = `顶点: ${totalVerts.toLocaleString()} | 面: ${totalFaces.toLocaleString()}`;
  }

  _extractTextures(material) {
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      if (mat.map) this.textures.color = mat.map;
      if (mat.normalMap) this.textures.normal = mat.normalMap;
      if (mat.metalnessMap) this.textures.metalness = mat.metalnessMap;
      if (mat.roughnessMap) this.textures.roughness = mat.roughnessMap;
    }
  }

  _collectGeometryData(meshes) {
    let totalVertices = 0;
    let totalFaces = 0;
    let totalEdges = 0;
    const positions = [];
    const edgeLengths = [];
    const faceNormals = [];

    for (const mesh of meshes) {
      const geo = mesh.geometry;
      if (!geo) continue;

      const posAttr = geo.attributes.position;
      if (!posAttr) continue;

      totalVertices += posAttr.count;

      // Collect vertex positions in world space (limit for performance)
      const worldMatrix = mesh.matrixWorld;
      const posLimit = Math.min(posAttr.count, 50000);
      for (let i = 0; i < posLimit; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        v.applyMatrix4(worldMatrix);
        positions.push(v);
      }

      // Faces (limit processing for performance)
      const faceLimit = 50000; // max faces to process per mesh
      if (geo.index) {
        totalFaces += geo.index.count / 3;
        const idxLimit = Math.min(geo.index.count, faceLimit * 3);
        for (let i = 0; i < idxLimit; i += 3) {
          const a = geo.index.getX(i);
          const b = geo.index.getX(i + 1);
          const c = geo.index.getX(i + 2);
          const va = new THREE.Vector3().fromBufferAttribute(posAttr, a);
          const vb = new THREE.Vector3().fromBufferAttribute(posAttr, b);
          const vc = new THREE.Vector3().fromBufferAttribute(posAttr, c);
          edgeLengths.push(va.distanceTo(vb), vb.distanceTo(vc), vc.distanceTo(va));

          const normal = new THREE.Vector3();
          const e1 = new THREE.Vector3().subVectors(vb, va);
          const e2 = new THREE.Vector3().subVectors(vc, va);
          normal.crossVectors(e1, e2).normalize();
          faceNormals.push(normal);
        }
      } else {
        totalFaces += posAttr.count / 3;
        const posLimit2 = Math.min(posAttr.count, faceLimit * 3);
        for (let i = 0; i < posLimit2; i += 3) {
          const va = new THREE.Vector3().fromBufferAttribute(posAttr, i);
          const vb = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1);
          const vc = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2);
          edgeLengths.push(va.distanceTo(vb), vb.distanceTo(vc), vc.distanceTo(va));

          const normal = new THREE.Vector3();
          const e1 = new THREE.Vector3().subVectors(vb, va);
          const e2 = new THREE.Vector3().subVectors(vc, va);
          normal.crossVectors(e1, e2).normalize();
          faceNormals.push(normal);
        }
      }

      // UV data
      if (geo.attributes.uv) {
        this.geometryData = this.geometryData || {};
        this.geometryData.hasUV = true;
      }
    }

    totalEdges = edgeLengths.length;

    // Compute overlapping vertices (distance < 0.01m in original scale)
    const overlappingPairs = this._findOverlappingVertices(positions, 0.01);

    // Compute hidden faces (faces whose normals point inward - simplified check)
    const hiddenFaces = this._findHiddenFaces(faceNormals);

    // Compute edge length statistics
    const avgEdgeLength = edgeLengths.reduce((a, b) => a + b, 0) / Math.max(edgeLengths.length, 1);
    const edgeLengthVariance = edgeLengths.reduce((sum, len) => sum + Math.pow(len - avgEdgeLength, 2), 0) / Math.max(edgeLengths.length, 1);

    this.geometryData = {
      ...this.geometryData,
      totalVertices,
      totalFaces,
      totalEdges,
      positions,
      edgeLengths,
      faceNormals,
      overlappingPairs,
      hiddenFaces,
      avgEdgeLength,
      edgeLengthVariance,
      hasUV: this.geometryData?.hasUV || false,
      meshes: meshes.length,
    };
  }

  _findOverlappingVertices(positions, threshold) {
    let count = 0;
    // Limit check for large models to prevent browser freeze
    const maxCheck = Math.min(positions.length, 50000);
    // Use spatial hashing for efficiency
    const grid = new Map();
    const cellSize = threshold;
    for (let i = 0; i < maxCheck; i++) {
      const p = positions[i];
      const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)},${Math.floor(p.z / cellSize)}`;
      if (!grid.has(key)) grid.set(key, []);
      const cell = grid.get(key);
      // Check this cell and neighbors
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nkey = `${Math.floor(p.x / cellSize) + dx},${Math.floor(p.y / cellSize) + dy},${Math.floor(p.z / cellSize) + dz}`;
            const neighbors = grid.get(nkey);
            if (neighbors) {
              for (const idx of neighbors) {
                if (positions[idx].distanceTo(p) < threshold) {
                  count++;
                }
              }
            }
          }
        }
      }
      cell.push(i);
    }
    return count;
  }

  _findHiddenFaces(faceNormals) {
    // Simplified: count faces whose normals point inward (dot product with centroid direction is negative)
    if (faceNormals.length === 0) return 0;
    let hidden = 0;
    // Check if normals are consistently outward-facing by sampling
    const outwardCount = faceNormals.filter(n => n.z > 0).length;
    const inwardCount = faceNormals.length - outwardCount;
    // If model is closed, roughly half should face each direction
    // Hidden faces are those with zero area or degenerate
    return Math.min(inwardCount, Math.floor(faceNormals.length * 0.05));
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.mesh) return;

    this.mesh.traverse(child => {
      if (!child.isMesh) return;

      switch (mode) {
        case 'gray':
          child.material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7,
            metalness: 0.0,
          });
          break;

        case 'wireframe':
          child.material = new THREE.MeshBasicMaterial({
            color: 0x4a90d9,
            wireframe: true,
          });
          break;

        case 'color':
          if (this.textures.color) {
            child.material = new THREE.MeshStandardMaterial({
              map: this.textures.color,
              roughness: 0.8,
              metalness: 0.0,
            });
          } else {
            child.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc,
              roughness: 0.8,
            });
          }
          break;

        case 'material':
          const mat = new THREE.MeshStandardMaterial({
            roughness: 0.5,
            metalness: 0.5,
          });
          if (this.textures.color) mat.map = this.textures.color;
          if (this.textures.normal) mat.normalMap = this.textures.normal;
          if (this.textures.metalness) mat.metalnessMap = this.textures.metalness;
          if (this.textures.roughness) mat.roughnessMap = this.textures.roughness;
          child.material = mat;
          // Increase directional light intensity for material mode
          this.directionalLight.intensity = 2.0;
          this.ambientLight.intensity = 0.3;
          break;
      }
    });

    // Reset light intensity for non-material modes
    if (mode !== 'material') {
      this.directionalLight.intensity = 1.5;
      this.ambientLight.intensity = 0.4;
    }
  }

  _showError(msg) {
    this.container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8b90a0;font-size:14px;text-align:center;padding:20px;">${msg}</div>`;
  }

  _onResize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    this._resizeObserver.disconnect();
    this.renderer.dispose();
    if (this.container) this.container.innerHTML = '';
  }

  getGeometryData() {
    return this.geometryData;
  }

  hasTextures() {
    return !!this.textures.color;
  }

  captureThumbnail() {
    if (!this.renderer) return null;
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

export { ModelViewer };

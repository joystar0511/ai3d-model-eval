/**
 * ModelViewer - Three.js based 3D model preview component
 * Supports: OBJ, FBX, GLTF/GLB, STL, PLY
 * Preview modes: gray, wireframe, color, material (PBR with directional light + all maps)
 *
 * Textures are uploaded separately by the user:
 *   - BaseColor (map)
 *   - NormalMap (normalMap)
 *   - MetallicMap (metalnessMap)
 *   - Roughness (roughnessMap)
 *   - Emission (emissiveMap)
 *
 * Also provides shape fingerprint and ring-line circumference analysis
 * for human model similarity comparison and joint wiring evaluation.
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
    this.geometryData = null;
    this.shapeFingerprint = null;   // For similarity comparison
    this.ringLineData = null;       // For joint wiring analysis

    // PBR textures - uploaded separately by user
    this.textures = {
      baseColor: null,
      normalMap: null,
      metallicMap: null,
      roughness: null,
      emission: null,
    };
    this.textureFiles = {
      baseColor: null,
      normalMap: null,
      metallicMap: null,
      roughness: null,
      emission: null,
    };
    this.textureImageData = {
      baseColor: null,
      normalMap: null,
      metallicMap: null,
      roughness: null,
      emission: null,
    };

    this._isLoading = true;
    this._initThree();
    this._loadModel().finally(() => {
      this._isLoading = false;
    });
    this._animate();
  }

  _initThree() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 320;

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

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.directionalLight.position.set(5, 8, 5);
    this.scene.add(this.directionalLight);

    this.fillLight = new THREE.DirectionalLight(0x8899ff, 0.3);
    this.fillLight.position.set(-5, 3, -5);
    this.scene.add(this.fillLight);

    this.gridHelper = new THREE.GridHelper(10, 20, 0x444466, 0x333344);
    this.scene.add(this.gridHelper);

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.container);

    this.infoDiv = document.createElement('div');
    this.infoDiv.className = 'viewer-info';
    this.container.appendChild(this.infoDiv);

    // Grid toggle button — sits next to the stats text
    this.gridToggleBtn = document.createElement('button');
    this.gridToggleBtn.className = 'grid-toggle-btn';
    this.gridToggleBtn.textContent = '网格 ON';
    this.gridToggleBtn.title = '显示/隐藏地面网格';
    this.gridToggleBtn.addEventListener('click', () => this._toggleGrid());
    this.container.appendChild(this.gridToggleBtn);
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
    const meshes = [];
    object.traverse(child => {
      if (child.isMesh) meshes.push(child);
    });

    if (meshes.length === 0) {
      this._showError('模型中未找到网格数据');
      return;
    }

    this.mesh = object;
    this.scene.add(object);

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2.5 / maxDim;

    object.scale.setScalar(scale);
    object.position.sub(center.multiplyScalar(scale));

    const dist = 4;
    this.camera.position.set(dist, dist * 0.7, dist);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this._collectGeometryData(meshes);
    this._computeShapeFingerprint();
    this._computeRingLineData();

    this.setMode('gray');

    const totalVerts = this.geometryData.totalVertices;
    const totalFaces = this.geometryData.totalFaces;
    const hasUV = this.geometryData.hasUV;
    this.infoDiv.textContent = `顶点: ${totalVerts.toLocaleString()} | 面: ${totalFaces.toLocaleString()}${hasUV ? '' : ' | ⚠ 无UV'}`;

    // If no UV, warn when user tries to use texture modes
    if (!hasUV) {
      this._noUV = true;
    } else {
      this._noUV = false;
    }
  }

  /**
   * Compute shape fingerprint for similarity comparison with standard human model.
   * The fingerprint includes:
   * - Bounding box proportions (width/height/depth ratio)
   * - Vertex density distribution along Y axis (body height segments)
   * - Overall silhouette characteristics
   */
  _computeShapeFingerprint() {
    if (!this.geometryData || !this.geometryData.positions || this.geometryData.positions.length === 0) {
      this.shapeFingerprint = null;
      return;
    }

    const positions = this.geometryData.positions;

    // Find bounding box from actual positions
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const p of positions) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;

    // Proportion ratios (normalized to height = 1)
    const heightNorm = Math.max(height, 0.001);
    const widthRatio = width / heightNorm;
    const depthRatio = depth / heightNorm;

    // Vertex density distribution along Y axis (10 segments)
    const segments = 10;
    const segmentHeight = height / segments;
    const density = new Array(segments).fill(0);

    for (const p of positions) {
      const seg = Math.floor((p.y - minY) / Math.max(segmentHeight, 0.0001));
      if (seg >= 0 && seg < segments) {
        density[seg]++;
      }
    }

    // Normalize density to percentages
    const totalVerts = positions.length;
    const densityPct = density.map(d => d / Math.max(totalVerts, 1));

    // Cross-section width at each Y segment (approximate silhouette)
    const crossWidth = new Array(segments).fill(0);
    const crossDepth = new Array(segments).fill(0);
    const segMinX = new Array(segments).fill(Infinity);
    const segMaxX = new Array(segments).fill(-Infinity);
    const segMinZ = new Array(segments).fill(Infinity);
    const segMaxZ = new Array(segments).fill(-Infinity);

    for (const p of positions) {
      const seg = Math.floor((p.y - minY) / Math.max(segmentHeight, 0.0001));
      if (seg >= 0 && seg < segments) {
        if (p.x < segMinX[seg]) segMinX[seg] = p.x;
        if (p.x > segMaxX[seg]) segMaxX[seg] = p.x;
        if (p.z < segMinZ[seg]) segMinZ[seg] = p.z;
        if (p.z > segMaxZ[seg]) segMaxZ[seg] = p.z;
      }
    }

    for (let i = 0; i < segments; i++) {
      crossWidth[i] = (segMaxX[i] - segMinX[i]) / heightNorm;
      crossDepth[i] = (segMaxZ[i] - segMinZ[i]) / heightNorm;
    }

    this.shapeFingerprint = {
      widthRatio,
      depthRatio,
      heightNorm,
      densityPct,
      crossWidth,
      crossDepth,
      totalVertices: this.geometryData.totalVertices,
    };
  }

  /**
   * Compute ring-line circumference data for joint wiring analysis.
   * A "ring line" (环线) is a set of edges that form a horizontal loop
   * at roughly the same Y height. We slice the model along Y axis,
   * find connected edge loops at each slice, and compute their circumferences.
   */
  _computeRingLineData() {
    if (!this.geometryData || !this.geometryData.positions || this.geometryData.positions.length === 0) {
      this.ringLineData = null;
      return;
    }

    const positions = this.geometryData.positions;
    const edgeLengths = this.geometryData.edgeLengths;

    // Find Y range
    let minY = Infinity, maxY = -Infinity;
    for (const p of positions) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const height = maxY - minY;
    if (height < 0.01) {
      this.ringLineData = null;
      return;
    }

    // Slice model into horizontal bands and compute cross-section circumferences
    // using vertex positions at each band
    const sliceCount = 30; // 30 horizontal slices
    const sliceHeight = height / sliceCount;
    const circumferences = [];

    for (let s = 0; s < sliceCount; s++) {
      const sliceY = minY + s * sliceHeight;
      const halfBand = sliceHeight * 0.5; // Band width to collect vertices

      // Collect vertices in this horizontal band
      const bandVerts = [];
      for (const p of positions) {
        if (Math.abs(p.y - sliceY) < halfBand) {
          bandVerts.push(p);
        }
      }

      if (bandVerts.length < 3) continue;

      // Compute approximate circumference by sorting vertices around center
      const centerX = bandVerts.reduce((sum, v) => sum + v.x, 0) / bandVerts.length;
      const centerZ = bandVerts.reduce((sum, v) => sum + v.z, 0) / bandVerts.length;

      // Sort by angle around center axis (Y axis)
      const sorted = bandVerts.map(v => {
        const angle = Math.atan2(v.z - centerZ, v.x - centerX);
        return { angle, x: v.x, z: v.z };
      }).sort((a, b) => a.angle - b.angle);

      // Compute circumference as sum of consecutive edge distances
      let circumference = 0;
      for (let i = 0; i < sorted.length; i++) {
        const next = sorted[(i + 1) % sorted.length];
        const dx = next.x - sorted[i].x;
        const dz = next.z - sorted[i].z;
        circumference += Math.sqrt(dx * dx + dz * dz);
      }

      circumferences.push({
        sliceIndex: s,
        yPosition: sliceY,
        relativeY: (sliceY - minY) / height, // 0-1 normalized height
        circumference,
        vertexCount: bandVerts.length,
      });
    }

    if (circumferences.length < 5) {
      this.ringLineData = null;
      return;
    }

    // Compute average circumference
    const avgCirc = circumferences.reduce((sum, c) => sum + c.circumference, 0) / circumferences.length;

    // Find joint regions: circumferences < 50% of average
    const jointThreshold = avgCirc * 0.5;
    const jointRings = circumferences.filter(c => c.circumference < jointThreshold);
    const jointRatio = jointRings.length / circumferences.length;

    this.ringLineData = {
      circumferences,
      avgCircumference: avgCirc,
      jointThreshold,
      jointRings,
      jointRatio,
      totalRings: circumferences.length,
    };
  }

  /**
   * Compute similarity between this model and a standard model's fingerprint.
   * Returns a value between 0 and 1.
   */
  computeSimilarity(standardFingerprint) {
    if (!this.shapeFingerprint || !standardFingerprint) return 0;

    let score = 0;

    // 1. Bounding box proportion similarity (weight: 30%)
    const widthDiff = Math.abs(this.shapeFingerprint.widthRatio - standardFingerprint.widthRatio);
    const depthDiff = Math.abs(this.shapeFingerprint.depthRatio - standardFingerprint.depthRatio);
    const proportionScore = Math.max(0, 1 - (widthDiff + depthDiff) * 0.5);
    score += proportionScore * 0.30;

    // 2. Vertex density distribution similarity (weight: 40%)
    const thisDensity = this.shapeFingerprint.densityPct;
    const stdDensity = standardFingerprint.densityPct;
    let densityDiff = 0;
    for (let i = 0; i < Math.min(thisDensity.length, stdDensity.length); i++) {
      densityDiff += Math.abs(thisDensity[i] - stdDensity[i]);
    }
    const densityScore = Math.max(0, 1 - densityDiff * 2);
    score += densityScore * 0.40;

    // 3. Cross-section silhouette similarity (weight: 30%)
    const thisWidth = this.shapeFingerprint.crossWidth;
    const stdWidth = standardFingerprint.crossWidth;
    const thisDepth = this.shapeFingerprint.crossDepth;
    const stdDepth = standardFingerprint.crossDepth;
    let silhouetteDiff = 0;
    for (let i = 0; i < Math.min(thisWidth.length, stdWidth.length); i++) {
      silhouetteDiff += Math.abs(thisWidth[i] - stdWidth[i]);
      silhouetteDiff += Math.abs(thisDepth[i] - stdDepth[i]);
    }
    const silhouetteScore = Math.max(0, 1 - silhouetteDiff * 0.5);
    score += silhouetteScore * 0.30;

    return score;
  }

  async setTextures(textureFiles) {
    const loader = new THREE.TextureLoader();

    for (const [key, file] of Object.entries(textureFiles)) {
      if (!file) {
        this.textures[key] = null;
        this.textureFiles[key] = null;
        this.textureImageData[key] = null;
        continue;
      }

      this.textureFiles[key] = file;

      try {
        const url = URL.createObjectURL(file);
        const texture = await loader.loadAsync(url);
        URL.revokeObjectURL(url);

        if (key === 'baseColor' || key === 'emission') {
          texture.colorSpace = THREE.SRGBColorSpace;
        } else {
          texture.colorSpace = THREE.NoColorSpace;
        }
        // flipY defaults to true in Three.js — this is correct for UV mapping
        // Do NOT set flipY = false, it breaks UV mapping
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;

        this.textures[key] = texture;
        this._extractImageData(key, file);
      } catch (e) {
        console.error(`Failed to load texture ${key}:`, e);
      }
    }

    if (this.mesh) {
      this.setMode(this.mode);
    }
  }

  async _extractImageData(key, file) {
    try {
      const img = await this._loadImage(file);
      const canvas = document.createElement('canvas');
      const maxSize = 512;
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      this.textureImageData[key] = {
        data: imageData.data,
        width: canvas.width,
        height: canvas.height,
      };
    } catch (e) {
      console.error(`Failed to extract image data for ${key}:`, e);
    }
  }

  _loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  _collectGeometryData(meshes) {
    let totalVertices = 0;
    let totalFaces = 0;
    let totalEdges = 0;
    const positions = [];
    const uvs = []; // Parallel to positions, for UV-based texture symmetry analysis
    const edgeLengths = [];
    const faceNormals = [];
    let hasUV = false;

    // Vertex neighbors map (for unmerged vertex detection and UV shell counting)
    const vertexNeighbors = new Map();
    // UV faces for occupancy calculation
    const uvFaces = [];
    let vertexOffset = 0;

    for (const mesh of meshes) {
      const geo = mesh.geometry;
      if (!geo) continue;

      const posAttr = geo.attributes.position;
      if (!posAttr) continue;

      totalVertices += posAttr.count;

      const worldMatrix = mesh.matrixWorld;
      const posLimit = Math.min(posAttr.count, 50000);
      const uvAttr = geo.attributes.uv;
      if (uvAttr) hasUV = true;

      for (let i = 0; i < posLimit; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        v.applyMatrix4(worldMatrix);
        positions.push(v);

        // Collect UV parallel to position (for texture symmetry analysis)
        if (uvAttr && i < uvAttr.count) {
          uvs.push({ u: uvAttr.getX(i), v: uvAttr.getY(i) });
        } else {
          uvs.push(null);
        }
      }

      const faceLimit = 50000;
      if (geo.index) {
        totalFaces += geo.index.count / 3;
        const idxLimit = Math.min(geo.index.count, faceLimit * 3);
        for (let i = 0; i < idxLimit; i += 3) {
          const a = geo.index.getX(i);
          const b = geo.index.getX(i + 1);
          const c = geo.index.getX(i + 2);
          const va = new THREE.Vector3().fromBufferAttribute(posAttr, a).applyMatrix4(worldMatrix);
          const vb = new THREE.Vector3().fromBufferAttribute(posAttr, b).applyMatrix4(worldMatrix);
          const vc = new THREE.Vector3().fromBufferAttribute(posAttr, c).applyMatrix4(worldMatrix);
          edgeLengths.push(va.distanceTo(vb), vb.distanceTo(vc), vc.distanceTo(va));

          const normal = new THREE.Vector3();
          const e1 = new THREE.Vector3().subVectors(vb, va);
          const e2 = new THREE.Vector3().subVectors(vc, va);
          normal.crossVectors(e1, e2).normalize();
          faceNormals.push(normal);

          // Build vertex neighbors for topological connectivity (Issue 2)
          if (a < posLimit && b < posLimit) {
            this._addNeighbor(vertexNeighbors, a + vertexOffset, b + vertexOffset);
          }
          if (b < posLimit && c < posLimit) {
            this._addNeighbor(vertexNeighbors, b + vertexOffset, c + vertexOffset);
          }
          if (c < posLimit && a < posLimit) {
            this._addNeighbor(vertexNeighbors, c + vertexOffset, a + vertexOffset);
          }

          // Collect UV faces for occupancy calculation (Issue 4)
          if (uvAttr && a < uvAttr.count && b < uvAttr.count && c < uvAttr.count) {
            uvFaces.push([
              { u: uvAttr.getX(a), v: uvAttr.getY(a) },
              { u: uvAttr.getX(b), v: uvAttr.getY(b) },
              { u: uvAttr.getX(c), v: uvAttr.getY(c) },
            ]);
          }
        }
      } else {
        totalFaces += posAttr.count / 3;
        const posLimit2 = Math.min(posAttr.count, faceLimit * 3);
        for (let i = 0; i < posLimit2; i += 3) {
          const va = new THREE.Vector3().fromBufferAttribute(posAttr, i).applyMatrix4(worldMatrix);
          const vb = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1).applyMatrix4(worldMatrix);
          const vc = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2).applyMatrix4(worldMatrix);
          edgeLengths.push(va.distanceTo(vb), vb.distanceTo(vc), vc.distanceTo(va));

          const normal = new THREE.Vector3();
          const e1 = new THREE.Vector3().subVectors(vb, va);
          const e2 = new THREE.Vector3().subVectors(vc, va);
          normal.crossVectors(e1, e2).normalize();
          faceNormals.push(normal);

          // Build vertex neighbors
          if (i + 2 < posLimit) {
            this._addNeighbor(vertexNeighbors, i + vertexOffset, (i + 1) + vertexOffset);
            this._addNeighbor(vertexNeighbors, (i + 1) + vertexOffset, (i + 2) + vertexOffset);
            this._addNeighbor(vertexNeighbors, (i + 2) + vertexOffset, i + vertexOffset);
          }

          // Collect UV faces
          if (uvAttr && i + 2 < uvAttr.count) {
            uvFaces.push([
              { u: uvAttr.getX(i), v: uvAttr.getY(i) },
              { u: uvAttr.getX(i + 1), v: uvAttr.getY(i + 1) },
              { u: uvAttr.getX(i + 2), v: uvAttr.getY(i + 2) },
            ]);
          }
        }
      }

      if (geo.attributes.uv) {
        hasUV = true;
      }

      vertexOffset += posLimit;
    }

    totalEdges = edgeLengths.length;

    // Count truly unmerged vertices using topological connectivity (Issue 2)
    const unmergedPairs = this._countUnmergedVertices(positions, vertexNeighbors);
    const hiddenFaces = this._findHiddenFaces(faceNormals);

    // Calculate UV occupancy and shell count (Issue 4)
    let uvOccupancy = 0;
    let uvShellCount = 0;
    if (hasUV && uvFaces.length > 0) {
      // UV occupancy: rasterize UV triangles onto a 64x64 grid
      const uvGridSize = 64;
      const uvGrid = new Uint8Array(uvGridSize * uvGridSize);
      for (const face of uvFaces) {
        const [ua, ub, uc] = face;
        // Only rasterize triangles with all UVs in [0,1] range
        if (ua.u >= 0 && ua.u <= 1 && ua.v >= 0 && ua.v <= 1 &&
            ub.u >= 0 && ub.u <= 1 && ub.v >= 0 && ub.v <= 1 &&
            uc.u >= 0 && uc.u <= 1 && uc.v >= 0 && uc.v <= 1) {
          this._rasterizeUVTriangle(uvGrid, uvGridSize, ua, ub, uc);
        }
      }
      let occupiedCells = 0;
      for (let i = 0; i < uvGrid.length; i++) {
        if (uvGrid[i]) occupiedCells++;
      }
      uvOccupancy = occupiedCells / (uvGridSize * uvGridSize);

      // UV shell count: connected components of vertex graph
      // In BufferGeometry, UV seams create vertex splits, so counting
      // connected components through shared edges gives the UV shell count
      const totalVerts = positions.length;
      const ufParent = new Array(totalVerts);
      for (let i = 0; i < totalVerts; i++) ufParent[i] = i;

      const ufFind = (x) => {
        while (ufParent[x] !== x) { ufParent[x] = ufParent[ufParent[x]]; x = ufParent[x]; }
        return x;
      };
      const ufUnion = (a, b) => {
        const ra = ufFind(a), rb = ufFind(b);
        if (ra !== rb) ufParent[ra] = rb;
      };

      for (const [v, neighbors] of vertexNeighbors) {
        for (const nb of neighbors) {
          ufUnion(v, nb);
        }
      }

      // Group by root, check if component has UVs in [0,1] range
      const shellMap = new Map();
      for (let i = 0; i < totalVerts; i++) {
        const root = ufFind(i);
        if (!shellMap.has(root)) {
          shellMap.set(root, { hasValidUV: false });
        }
        const uv = uvs[i];
        if (uv && uv.u >= 0 && uv.u <= 1 && uv.v >= 0 && uv.v <= 1) {
          shellMap.get(root).hasValidUV = true;
        }
      }

      for (const shell of shellMap.values()) {
        if (shell.hasValidUV) uvShellCount++;
      }
    }

    const avgEdgeLength = edgeLengths.reduce((a, b) => a + b, 0) / Math.max(edgeLengths.length, 1);
    const edgeLengthVariance = edgeLengths.reduce((sum, len) => sum + Math.pow(len - avgEdgeLength, 2), 0) / Math.max(edgeLengths.length, 1);

    this.geometryData = {
      totalVertices,
      totalFaces,
      totalEdges,
      positions,
      uvs,
      edgeLengths,
      faceNormals,
      unmergedPairs,
      hiddenFaces,
      avgEdgeLength,
      edgeLengthVariance,
      hasUV,
      meshes: meshes.length,
      uvOccupancy,
      uvShellCount,
    };
  }

  /**
   * Count truly unmerged vertices — vertices at the exact same position
   * that belong to DIFFERENT connected components of the mesh graph.
   *
   * In BufferGeometry, one logical vertex may be split into multiple entries
   * (different normals / UVs) with identical position values. These are
   * "属性拆分" (attribute splits) — they're in the same connected component
   * (reachable through edges) and should NOT be counted.
   *
   * True unmerged vertices are at the same position but in different
   * connected components (e.g., two separate mesh pieces touching at a point
   * without being welded). Only these are counted.
   *
   * Algorithm:
   * 1. Build global Union-Find over ALL edges in the mesh
   * 2. Group vertices by position (with tolerance)
   * 3. For each group, count distinct connected components
   * 4. Extra components beyond 1 = unmerged count
   */
  _countUnmergedVertices(positions, vertexNeighbors) {
    const n = positions.length;

    // Step 1: Build global Union-Find over all edges
    const parent = new Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;

    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (a, b) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    // Union all edges from the neighbor map
    for (const [v, neighbors] of vertexNeighbors) {
      for (const nb of neighbors) {
        union(v, nb);
      }
    }

    // Step 2: Group vertices by position (tolerance-based hashing)
    const tolerance = 1e-4;
    const positionMap = new Map();
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      const key = `${Math.round(p.x / tolerance)},${Math.round(p.y / tolerance)},${Math.round(p.z / tolerance)}`;
      if (!positionMap.has(key)) {
        positionMap.set(key, []);
      }
      positionMap.get(key).push(i);
    }

    // Step 3: For each position group, count distinct connected components
    let unmergedCount = 0;
    for (const [key, indices] of positionMap) {
      if (indices.length < 2) continue;

      const components = new Set();
      for (const idx of indices) {
        components.add(find(idx));
      }

      // Extra components = truly unmerged vertices at this position
      if (components.size > 1) {
        unmergedCount += components.size - 1;
      }
    }

    console.log(`[未合并点] 顶点数=${n}, 唯一位置=${positionMap.size}, 真正未合并=${unmergedCount}`);
    return unmergedCount;
  }

  /** Add bidirectional neighbor relationship between two vertex indices */
  _addNeighbor(map, a, b) {
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a).add(b);
    map.get(b).add(a);
  }

  /** Rasterize a UV triangle onto a grid for occupancy calculation */
  _rasterizeUVTriangle(grid, gridSize, ua, ub, uc) {
    // Convert UV coordinates to grid coordinates
    const ax = ua.u * gridSize, ay = ua.v * gridSize;
    const bx = ub.u * gridSize, by = ub.v * gridSize;
    const cx = uc.u * gridSize, cy = uc.v * gridSize;

    // Bounding box
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(gridSize - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(gridSize - 1, Math.ceil(Math.max(ay, by, cy)));

    // For each cell in bounding box, check if inside triangle
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const px = gx + 0.5, py = gy + 0.5;
        if (this._pointInTriangle(px, py, ax, ay, bx, by, cx, cy)) {
          grid[gy * gridSize + gx] = 1;
        }
      }
    }
  }

  /** Check if point (px, py) is inside triangle (ax,ay)-(bx,by)-(cx,cy) */
  _pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
  }

  _findHiddenFaces(faceNormals) {
    if (faceNormals.length === 0) return 0;
    let hidden = 0;
    const outwardCount = faceNormals.filter(n => n.z > 0).length;
    const inwardCount = faceNormals.length - outwardCount;
    return Math.min(inwardCount, Math.floor(faceNormals.length * 0.05));
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.mesh) return;

    // Warn if texture mode requested but model has no UV
    if (this._noUV && (mode === 'color' || mode === 'material')) {
      console.warn('Model has no UV coordinates — texture will not map correctly');
    }

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
          if (this.textures.baseColor) {
            child.material = new THREE.MeshStandardMaterial({
              map: this.textures.baseColor,
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

          if (this.textures.baseColor) mat.map = this.textures.baseColor;
          if (this.textures.normalMap) {
            mat.normalMap = this.textures.normalMap;
            mat.normalScale = new THREE.Vector2(1, 1);
          }
          if (this.textures.metallicMap) {
            mat.metalnessMap = this.textures.metallicMap;
            mat.metalness = 1.0;
          }
          if (this.textures.roughness) {
            mat.roughnessMap = this.textures.roughness;
            mat.roughness = 1.0;
          }
          if (this.textures.emission) {
            mat.emissiveMap = this.textures.emission;
            mat.emissive = new THREE.Color(0xffffff);
            mat.emissiveIntensity = 1.0;
          }

          child.material = mat;

          this.directionalLight.intensity = 2.5;
          this.ambientLight.intensity = 0.25;
          this.fillLight.intensity = 0.4;
          break;
      }
    });

    if (mode !== 'material') {
      this.directionalLight.intensity = 1.5;
      this.ambientLight.intensity = 0.4;
      this.fillLight.intensity = 0.3;
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

  /** Toggle ground grid visibility */
  _toggleGrid() {
    this.gridHelper.visible = !this.gridHelper.visible;
    this.gridToggleBtn.textContent = this.gridHelper.visible ? '网格 ON' : '网格 OFF';
    this.gridToggleBtn.classList.toggle('grid-off', !this.gridHelper.visible);
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    this._resizeObserver.disconnect();
    this.renderer.dispose();
    if (this.container) this.container.innerHTML = '';
  }

  get isLoading() {
    return this._isLoading;
  }

  getGeometryData() {
    return this.geometryData;
  }

  getShapeFingerprint() {
    return this.shapeFingerprint;
  }

  getRingLineData() {
    return this.ringLineData;
  }

  hasTextures() {
    return !!this.textures.baseColor;
  }

  hasUV() {
    return this.geometryData ? this.geometryData.hasUV : false;
  }

  getTextureInfo() {
    return {
      hasColorMap: !!this.textures.baseColor,
      hasNormalMap: !!this.textures.normalMap,
      hasMetalnessMap: !!this.textures.metallicMap,
      hasRoughnessMap: !!this.textures.roughness,
      hasEmissionMap: !!this.textures.emission,
      imageData: this.textureImageData,
    };
  }

  captureThumbnail() {
    if (!this.renderer) return null;
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

export { ModelViewer };

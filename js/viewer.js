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

    this._initThree();
    this._loadModel();
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

      if (geo.attributes.uv) {
        hasUV = true;
      }
    }

    totalEdges = edgeLengths.length;

    // Compute close-pair data: average edge length as baseline + pairs below 5% of average
    const avgEdgeLengthPre = edgeLengths.length > 0
      ? edgeLengths.reduce((a, b) => a + b, 0) / edgeLengths.length
      : 0;
    const closePairData = this._computeClosePairData(positions, avgEdgeLengthPre);
    const hiddenFaces = this._findHiddenFaces(faceNormals);

    const avgEdgeLength = avgEdgeLengthPre;
    const edgeLengthVariance = edgeLengths.reduce((sum, len) => sum + Math.pow(len - avgEdgeLength, 2), 0) / Math.max(edgeLengths.length, 1);

    this.geometryData = {
      totalVertices,
      totalFaces,
      totalEdges,
      positions,
      uvs,
      edgeLengths,
      faceNormals,
      pairDistanceAvg: closePairData.avg,
      closePairDistances: closePairData.distances,
      hiddenFaces,
      avgEdgeLength,
      edgeLengthVariance,
      hasUV,
      meshes: meshes.length,
    };
  }

  /**
   * Compute close-pair data for the "重合点" scoring dimension.
   *
   * Algorithm:
   * 1. Deduplicate buffer-geometry positions (same vertex may appear
   *    multiple times with different normals/UVs).
   * 2. Use the average EDGE LENGTH as the baseline ("平均值").
   * 3. Use a spatial hash grid to efficiently find every pair whose
   *    distance is below 5% of that average.
   *
   * Returns { avg, distances } where:
   *   avg        — average edge length (the "平均值" in scoring criteria)
   *   distances  — array of actual distances for pairs below 5% of avg
   */
  _computeClosePairData(positions, avgEdgeLength) {
    // --- Step 0: deduplicate positions ---
    const DEDUP_EPS = 1e-6;
    const seen = new Set();
    const unique = [];
    for (const p of positions) {
      const key = `${Math.round(p.x / DEDUP_EPS)},${Math.round(p.y / DEDUP_EPS)},${Math.round(p.z / DEDUP_EPS)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
      }
    }

    const n = unique.length;
    if (n < 2 || !avgEdgeLength || avgEdgeLength < 1e-10) {
      console.log(`[重合点-采集] 唯一顶点=${n}, 平均边长=${avgEdgeLength?.toFixed(6)}, 跳过(数据不足)`);
      return { avg: 0, distances: [] };
    }

    // --- Step 1: use average edge length as the baseline ---
    const avgDistance = avgEdgeLength;
    const threshold = avgDistance * 0.05;

    console.log(`[重合点-采集] 原始顶点=${positions.length}, 去重后=${n}, 平均边长=${avgDistance.toFixed(6)}, 5%阈值=${threshold.toFixed(6)}`);

    // --- Step 2: find all pairs with distance < 5% of average ---
    const closePairDistances = [];
    const MAX_CLOSE_PAIRS = 500;

    const cellSize = threshold;
    const grid = new Map();
    const maxCheck = Math.min(n, 50000);

    for (let i = 0; i < maxCheck; i++) {
      if (closePairDistances.length >= MAX_CLOSE_PAIRS) break;

      const p = unique[i];
      const gx = Math.floor(p.x / cellSize);
      const gy = Math.floor(p.y / cellSize);
      const gz = Math.floor(p.z / cellSize);

      for (let dx = -1; dx <= 1; dx++) {
        if (closePairDistances.length >= MAX_CLOSE_PAIRS) break;
        for (let dy = -1; dy <= 1; dy++) {
          if (closePairDistances.length >= MAX_CLOSE_PAIRS) break;
          for (let dz = -1; dz <= 1; dz++) {
            if (closePairDistances.length >= MAX_CLOSE_PAIRS) break;
            const nkey = `${gx + dx},${gy + dy},${gz + dz}`;
            const neighbors = grid.get(nkey);
            if (neighbors) {
              for (const idx of neighbors) {
                const d = unique[idx].distanceTo(p);
                if (d < threshold) {
                  closePairDistances.push(d);
                  if (closePairDistances.length >= MAX_CLOSE_PAIRS) break;
                }
              }
            }
          }
        }
      }

      const key = `${gx},${gy},${gz}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }

    console.log(`[重合点-采集] 找到近距点对=${closePairDistances.length}对`);
    if (closePairDistances.length > 0 && closePairDistances.length <= 20) {
      closePairDistances.forEach((d, i) => {
        const pct = (d / avgDistance) * 100;
        console.log(`  对${i}: 距离=${d.toFixed(6)} (${pct.toFixed(2)}% of 平均边长)`);
      });
    }

    return { avg: avgDistance, distances: closePairDistances };
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

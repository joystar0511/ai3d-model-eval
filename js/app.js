/**
 * App - Main application controller for AI 3D Topology Low-Poly Model Evaluation Tool
 *
 * Models and textures uploaded separately:
 * - Model file: OBJ, FBX, GLTF/GLB, STL, PLY
 * - Texture files: BaseColor, NormalMap, MetallicMap, Roughness, Emission
 *
 * Standard human body model: ADMIN ONLY (URL ?admin=1)
 * Per-model display mode: each model card has its own mode buttons (gray/wireframe/color/material)
 * Model Library: displayed at bottom 1/3 of page
 */

import { ModelViewer } from './viewer.js';
import { ModelEvaluator, DIMENSIONS } from './evaluator.js';
import { CloudStorage } from './cloud.js';

const TEXTURE_SLOTS = [
  { key: 'baseColor',   label: 'BaseColor',   icon: '🎨', accept: 'image/*' },
  { key: 'normalMap',   label: 'NormalMap',   icon: '📐', accept: 'image/*' },
  { key: 'metallicMap', label: 'MetallicMap', icon: '✨', accept: 'image/*' },
  { key: 'roughness',   label: 'Roughness',   icon: '🔍', accept: 'image/*' },
  { key: 'emission',    label: 'Emission',    icon: '💡', accept: 'image/*' },
];

class App {
  constructor() {
    this.models = [];
    this.isEvaluating = false;

    // Standard human body model reference (admin only)
    this.standardModel = {
      file: null,
      viewer: null,
      fingerprint: null,
      ringLineData: null,
    };

    // Admin mode detection
    this.isAdmin = this._detectAdminMode();

    this._initDOM();
    this._bindEvents();
    this._loadLibrary();
  }

  /** Detect admin mode from URL parameter: ?admin=1 or ?admin=true */
  _detectAdminMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === '1' || params.get('admin') === 'true';
  }

  _initDOM() {
    // Standard model elements (admin only)
    if (this.isAdmin) {
      const section = document.getElementById('standardModelSection');
      if (section) section.style.display = 'block';
    }

    this.standardUploadZone = document.getElementById('standardUploadZone');
    this.standardFileInput = document.getElementById('standardFileInput');
    this.standardPreviewBox = document.getElementById('standardPreviewBox');
    this.standardPreviewViewer = document.getElementById('standardPreviewViewer');
    this.standardPreviewInfo = document.getElementById('standardPreviewInfo');
    this.standardRemoveBtn = document.getElementById('standardRemoveBtn');

    // Main upload elements
    this.uploadArea = document.getElementById('uploadArea');
    this.initialUpload = document.getElementById('initialUpload');
    this.splitButtons = document.getElementById('splitButtons');
    this.btnAddMore = document.getElementById('btnAddMore');
    this.btnEvaluate = document.getElementById('btnEvaluate');
    this.fileInput = document.getElementById('fileInput');
    this.fileInputAdd = document.getElementById('fileInputAdd');
    this.modelGrid = document.getElementById('modelGrid');
    this.pkSection = document.getElementById('pkSection');
    this.progressOverlay = document.getElementById('progressOverlay');
    this.progressBar = document.getElementById('progressBar');
    this.progressText = document.getElementById('progressText');
    this.toast = document.getElementById('toast');

    // Library elements
    this.libraryGrid = document.getElementById('libraryGrid');
    this.libraryRefreshBtn = document.getElementById('libraryRefreshBtn');
  }

  _bindEvents() {
    // Standard model upload (admin)
    if (this.isAdmin) {
      this.standardUploadZone.addEventListener('click', () => this.standardFileInput.click());
      this.standardUploadZone.addEventListener('dragover', e => {
        e.preventDefault();
        this.standardUploadZone.classList.add('dragover');
      });
      this.standardUploadZone.addEventListener('dragleave', e => {
        e.preventDefault();
        this.standardUploadZone.classList.remove('dragover');
      });
      this.standardUploadZone.addEventListener('drop', e => {
        e.preventDefault();
        this.standardUploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          this._handleStandardModel(e.dataTransfer.files[0]);
        }
      });
      this.standardFileInput.addEventListener('change', e => {
        if (e.target.files.length > 0) {
          this._handleStandardModel(e.target.files[0]);
        }
      });
      this.standardRemoveBtn.addEventListener('click', () => this._removeStandardModel());
    }

    // Main model upload
    this.initialUpload.addEventListener('click', () => this.fileInput.click());
    this.initialUpload.addEventListener('dragover', e => this._onDragOver(e));
    this.initialUpload.addEventListener('dragleave', e => this._onDragLeave(e));
    this.initialUpload.addEventListener('drop', e => this._onDrop(e));
    this.fileInput.addEventListener('change', e => this._handleFiles(e.target.files));

    this.btnAddMore.addEventListener('click', () => this.fileInputAdd.click());
    this.btnEvaluate.addEventListener('click', () => this._startEvaluation());
    this.fileInputAdd.addEventListener('change', e => this._handleFiles(e.target.files));

    // Library refresh
    this.libraryRefreshBtn.addEventListener('click', () => this._refreshLibrary());
  }

  // === Per-Model Display Mode ===

  /** Set display mode for a single model */
  _setModelMode(modelId, mode) {
    const model = this.models.find(m => m.id === modelId);
    if (!model || !model.viewer) return;

    model.mode = mode;

    // Update this card's mode buttons only
    const card = document.getElementById(`card-${modelId}`);
    if (card) {
      card.querySelectorAll('.card-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
    }

    // Check for UV presence when switching to texture modes
    if (mode === 'color' || mode === 'material') {
      if (!model.viewer.hasUV()) {
        this._showToast(`⚠ 模型 "${model.name}" 无UV坐标，贴图可能显示异常`, 'warn');
      }
    }

    // Apply to this model only
    model.viewer.setMode(mode);
  }

  // === Standard Human Model Handling (Admin Only) ===

  async _handleStandardModel(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const supported = ['obj', 'fbx', 'gltf', 'glb', 'stl', 'ply'];
    if (!supported.includes(ext)) {
      this._showToast(`标准模型不支持格式: .${ext}`, 'error');
      return;
    }

    if (this.standardModel.viewer) {
      this.standardModel.viewer.dispose();
    }

    this.standardModel.file = file;
    this.standardUploadZone.style.display = 'none';
    this.standardPreviewBox.style.display = 'block';

    this.standardModel.viewer = new ModelViewer(this.standardPreviewViewer, file);

    const waitForLoad = () => {
      return new Promise(resolve => {
        let attempts = 0;
        const check = () => {
          const geoData = this.standardModel.viewer.getGeometryData();
          if (geoData) {
            this.standardModel.fingerprint = this.standardModel.viewer.getShapeFingerprint();
            this.standardModel.ringLineData = this.standardModel.viewer.getRingLineData();
            this.standardPreviewInfo.textContent = `顶点: ${geoData.totalVertices.toLocaleString()} | 面: ${geoData.totalFaces.toLocaleString()} | ✅ 已就绪`;
            resolve();
          } else if (attempts < 60) {
            attempts++;
            setTimeout(check, 200);
          } else {
            this.standardPreviewInfo.textContent = '⚠️ 模型加载超时';
            resolve();
          }
        };
        check();
      });
    };

    await waitForLoad();
    this._showToast('标准人体模型已加载，评测时将参照此模型进行对比分析', 'success');
  }

  _removeStandardModel() {
    if (this.standardModel.viewer) {
      this.standardModel.viewer.dispose();
    }
    this.standardModel = {
      file: null,
      viewer: null,
      fingerprint: null,
      ringLineData: null,
    };
    this.standardPreviewBox.style.display = 'none';
    this.standardUploadZone.style.display = 'block';
    this.standardFileInput.value = '';
    this._showToast('标准人体模型已移除', 'success');
  }

  // === Main Model Handling ===

  _onDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  }

  _onDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
  }

  _onDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    this._handleFiles(e.dataTransfer.files);
  }

  _handleFiles(fileList) {
    // Check if any model is currently loading
    const loadingModels = this.models.filter(m => m.viewer && m.viewer.isLoading);
    if (loadingModels.length > 0) {
      this._showToast('有模型正在上传中，请等待当前模型加载完成后再上传', 'warn');
      return;
    }

    const files = Array.from(fileList);
    const supported = ['obj', 'fbx', 'gltf', 'glb', 'stl', 'ply', 'blend'];
    let validCount = 0;

    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!supported.includes(ext)) {
        this._showToast(`不支持的格式: ${file.name} (支持: ${supported.join(', ')})`, 'error');
        continue;
      }
      this._addModel(file);
      validCount++;
    }

    this.fileInput.value = '';
    this.fileInputAdd.value = '';

    if (validCount > 0) {
      this._updateUI();
    }
  }

  _addModel(file) {
    const modelId = 'model_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const model = {
      id: modelId,
      file: file,
      name: '',
      viewer: null,
      evaluation: null,
      notes: '',
      mode: 'gray', // Per-model display mode
      shared: false,
      textureFiles: {
        baseColor: null,
        normalMap: null,
        metallicMap: null,
        roughness: null,
        emission: null,
      },
    };
    this.models.push(model);
    this._renderModelCard(model);
  }

  _renderModelCard(model) {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.id = `card-${model.id}`;
    card.innerHTML = `
      <div class="model-card-header">
        <span class="card-index">模型 #${this.models.length}</span>
        <button class="card-remove" data-id="${model.id}" title="移除">&times;</button>
      </div>
      <div class="viewer-container" id="viewer-${model.id}"></div>

      <!-- Per-card viewer mode buttons (controls this model only) -->
      <div class="card-viewer-modes">
        <button class="card-mode-btn ${model.mode === 'gray' ? 'active' : ''}" data-mode="gray" title="无贴图，灰色材质显示模型形状">
          <span>🔘</span> 灰模显示
        </button>
        <button class="card-mode-btn ${model.mode === 'wireframe' ? 'active' : ''}" data-mode="wireframe" title="蓝色线框，查看拓扑布线结构">
          <span>🔷</span> 线框显示
        </button>
        <button class="card-mode-btn ${model.mode === 'color' ? 'active' : ''}" data-mode="color" title="贴上颜色贴图(BaseColor)的效果">
          <span>🎨</span> 颜色贴图
        </button>
        <button class="card-mode-btn ${model.mode === 'material' ? 'active' : ''}" data-mode="material" title="平行光 + PBR全贴图材质效果">
          <span>💡</span> 材质效果
        </button>
      </div>

      <!-- Texture Upload Section -->
      <div class="texture-section">
        <div class="texture-section-title">PBR 贴图上传</div>
        <div class="texture-slots" id="texture-slots-${model.id}">
          ${TEXTURE_SLOTS.map(slot => `
            <div class="texture-slot" data-model="${model.id}" data-key="${slot.key}">
              <input type="file" class="texture-file-input" accept="${slot.accept}" data-model="${model.id}" data-key="${slot.key}" style="display:none;" />
              <div class="texture-slot-inner">
                <span class="texture-slot-icon">${slot.icon}</span>
                <span class="texture-slot-label">${slot.label}</span>
                <span class="texture-slot-status" id="tex-status-${model.id}-${slot.key}">未上传</span>
              </div>
              <button class="texture-slot-btn" data-model="${model.id}" data-key="${slot.key}">选择</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="model-name-section">
        <input type="text" class="model-name-input" placeholder="请输入模型名称..." data-id="${model.id}" value="${this._guessName(model.file.name)}" />
      </div>
      <div class="score-section" id="score-${model.id}"></div>
      <div class="notes-section" id="notes-${model.id}"></div>
    `;

    this.modelGrid.appendChild(card);

    const viewerContainer = card.querySelector(`#viewer-${model.id}`);
    model.viewer = new ModelViewer(viewerContainer, model.file);

    // Apply this model's own mode
    model.viewer.setMode(model.mode);

    const nameInput = card.querySelector('.model-name-input');
    nameInput.addEventListener('input', e => {
      model.name = e.target.value.trim();
    });
    model.name = this._guessName(model.file.name);
    nameInput.value = model.name;

    card.querySelectorAll('.texture-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileInput = card.querySelector(`.texture-file-input[data-key="${btn.dataset.key}"]`);
        fileInput.click();
      });
    });

    card.querySelectorAll('.texture-file-input').forEach(input => {
      input.addEventListener('change', e => {
        if (e.target.files.length > 0) {
          this._handleTextureUpload(e.target.dataset.model, e.target.dataset.key, e.target.files[0]);
        }
      });
    });

    card.querySelector('.card-remove').addEventListener('click', () => {
      this._removeModel(model.id);
    });

    // Per-card mode buttons (control this model only)
    card.querySelectorAll('.card-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setModelMode(model.id, btn.dataset.mode);
      });
    });
  }

  async _handleTextureUpload(modelId, textureKey, file) {
    const model = this.models.find(m => m.id === modelId);
    if (!model) return;

    model.textureFiles[textureKey] = file;

    const statusEl = document.getElementById(`tex-status-${modelId}-${textureKey}`);
    if (statusEl) {
      const fileName = file.name.length > 15 ? file.name.slice(0, 12) + '...' : file.name;
      statusEl.textContent = fileName;
      statusEl.classList.add('uploaded');
    }

    const slotEl = document.querySelector(`.texture-slot[data-model="${modelId}"][data-key="${textureKey}"]`);
    if (slotEl) slotEl.classList.add('has-texture');

    await model.viewer.setTextures(model.textureFiles);

    // If user uploaded a color map and current mode is 'color', refresh display
    if (textureKey === 'baseColor' && model.mode === 'color') {
      model.viewer.setMode('color');
    }

    this._showToast(`${TEXTURE_SLOTS.find(s => s.key === textureKey).label} 已加载`, 'success');
  }

  _guessName(fileName) {
    return fileName.replace(/\.[^.]+$/, '');
  }

  _removeModel(modelId) {
    const idx = this.models.findIndex(m => m.id === modelId);
    if (idx === -1) return;

    const model = this.models[idx];
    if (model.viewer) model.viewer.dispose();

    this.models.splice(idx, 1);
    const card = document.getElementById(`card-${modelId}`);
    if (card) card.remove();

    this.models.forEach((m, i) => {
      const idxEl = document.querySelector(`#card-${m.id} .card-index`);
      if (idxEl) idxEl.textContent = `模型 #${i + 1}`;
    });

    this._updateUI();
  }

  _updateUI() {
    if (this.models.length > 0) {
      this.initialUpload.style.display = 'none';
      this.splitButtons.style.display = 'flex';
      this.modelGrid.style.display = 'grid';
    } else {
      this.initialUpload.style.display = 'block';
      this.splitButtons.style.display = 'none';
      this.modelGrid.style.display = 'none';
    }
  }

  async _startEvaluation() {
    const unnamed = this.models.filter(m => !m.name || m.name.trim() === '');
    if (unnamed.length > 0) {
      this._showToast(`还有 ${unnamed.length} 个模型未命名，请为所有模型命名后再开始评测`, 'error');
      unnamed.forEach(m => {
        const input = document.querySelector(`.model-name-input[data-id="${m.id}"]`);
        if (input) {
          input.style.borderColor = 'var(--red)';
          input.focus();
          setTimeout(() => { input.style.borderColor = ''; }, 3000);
        }
      });
      return;
    }

    if (this.isEvaluating) return;
    this.isEvaluating = true;

    const hasStandardModel = this.standardModel.fingerprint !== null;

    this.progressOverlay.classList.add('visible');
    this.progressBar.style.width = '0%';
    this.progressText.textContent = '正在初始化AI分析引擎...';

    await this._delay(500);

    const totalSteps = this.models.length * DIMENSIONS.length;
    let currentStep = 0;

    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      this.progressText.textContent = `正在分析模型 "${model.name}" (${i + 1}/${this.models.length})...`;

      const geoData = model.viewer.getGeometryData();
      const texInfo = model.viewer.getTextureInfo();

      const userFingerprint = model.viewer.getShapeFingerprint();
      const userRingLineData = model.viewer.getRingLineData();

      const standardModelRef = hasStandardModel ? {
        fingerprint: this.standardModel.fingerprint,
        ringLineData: this.standardModel.ringLineData,
      } : null;

      const result = await ModelEvaluator.evaluate(
        geoData, texInfo,
        standardModelRef,
        userFingerprint,
        userRingLineData,
        (progress) => {
          const overall = Math.round(((currentStep + progress / 100 * DIMENSIONS.length) / totalSteps) * 100);
          this.progressBar.style.width = `${overall}%`;
        }
      );

      model.evaluation = result;
      currentStep += DIMENSIONS.length;

      this._renderScore(model);
    }

    this.progressBar.style.width = '100%';
    this.progressText.textContent = '分析完成！';
    await this._delay(600);

    this.progressOverlay.classList.remove('visible');
    this.isEvaluating = false;

    this.models.forEach(m => this._renderNotesAndShare(m));

    if (this.models.length >= 2) {
      this._renderPK();
    }

    const charCount = this.models.filter(m => m.evaluation?.isCharacterModel).length;
    if (hasStandardModel && charCount > 0) {
      this._showToast(`评测完成！${charCount} 个模型被识别为角色模型。所有模型评分已生成`, 'success');
    } else {
      this._showToast('评测完成！所有模型评分已生成', 'success');
    }
  }

  _renderScore(model) {
    const scoreSection = document.getElementById(`score-${model.id}`);
    const ev = model.evaluation;

    let typeBadgeHTML = '';
    if (ev.isCharacterModel) {
      typeBadgeHTML = `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);border-radius:6px;font-size:12px;margin-bottom:12px;">
        <span>👤</span>
        <span style="color:var(--gold);font-weight:600;">角色模型</span>
        <span style="color:var(--text-dim);font-size:11px;">相似度 ${ev.similarity.toFixed(2)}%</span>
      </div>`;
    }

    let breakdownHTML = '';
    for (const item of ev.breakdown) {
      const color = item.percentage >= 80 ? '#4ade80' : item.percentage >= 60 ? '#fbbf24' : '#f87171';
      breakdownHTML += `
        <div class="score-item">
          <span class="item-name">${item.name}</span>
          <span class="item-score" style="color:${color}">${item.score.toFixed(2)}/${item.max}</span>
        </div>
      `;
    }

    scoreSection.innerHTML = `
      ${typeBadgeHTML}
      <div class="score-total">
        <span class="score-value">${ev.totalScore.toFixed(2)}</span>
        <span class="score-max">/ ${ev.maxScore}</span>
        <span class="score-grade ${ev.gradeClass}">${ev.grade}</span>
      </div>
      <div class="score-breakdown">${breakdownHTML}</div>
    `;
    scoreSection.classList.add('visible');
  }

  _renderNotesAndShare(model) {
    const notesSection = document.getElementById(`notes-${model.id}`);

    // Build recommendation tags based on Excel criteria
    let recTagsHTML = '';
    const ev = model.evaluation;
    if (ev) {
      const tags = ModelEvaluator.generateUsageTags(ev.breakdown, {
        faces: model.viewer?.getGeometryData()?.totalFaces || 0,
        vertices: model.viewer?.getGeometryData()?.totalVertices || 0,
      });

      recTagsHTML = tags.map(t => `
        <span class="rec-tag rec-tag-${t.color}">
          ${t.label}
        </span>
      `).join('');

      // If no tags match, show a default message
      if (tags.length === 0) {
        recTagsHTML = '<span class="rec-tag rec-tag-gray">暂无推荐用途</span>';
      }
    }

    notesSection.innerHTML = `
      <textarea placeholder="输入评论..." data-id="${model.id}">${model.notes}</textarea>
      <div class="recommendation-section">
        <div class="rec-label">模型用途推荐</div>
        <div class="rec-tags">${recTagsHTML}</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-green btn-sm share-btn" data-id="${model.id}" style="flex:1;">
          <span>Share to Cloud</span>
        </button>
        <button class="btn btn-outline btn-sm view-report-btn" data-id="${model.id}" style="flex:1;">
          <span>📄 查看完整报告</span>
        </button>
      </div>
      <div class="share-status" id="share-status-${model.id}"></div>
    `;
    notesSection.classList.add('visible');

    const textarea = notesSection.querySelector('textarea');
    textarea.addEventListener('input', e => {
      model.notes = e.target.value;
    });

    const shareBtn = notesSection.querySelector('.share-btn');
    shareBtn.addEventListener('click', async () => {
      await this._shareModel(model, shareBtn);
    });

    const reportBtn = notesSection.querySelector('.view-report-btn');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        this._showFullReport(model);
      });
    }
  }

  async _shareModel(model, btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>上传中...</span>';

    try {
      // Capture thumbnail with color texture if available
      const previousMode = model.viewer.mode || 'gray';
      const texInfo = model.viewer.getTextureInfo();
      if (texInfo.hasColorMap) {
        model.viewer.setMode('color');
        // Wait a frame for the texture to render
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      const thumbnail = model.viewer.captureThumbnail();
      // Restore original mode
      model.viewer.setMode(previousMode);

      const geoData = model.viewer.getGeometryData();

      // Convert model file to base64 for download
      const modelFileData = await this._fileToBase64(model.file);

      // Convert texture files to base64
      const textureFilesData = {};
      for (const [key, file] of Object.entries(model.textureFiles)) {
        if (file) {
          textureFilesData[key] = {
            name: file.name,
            type: file.type,
            data: await this._fileToBase64(file),
          };
        }
      }

      const modelData = {
        name: model.name,
        scores: model.evaluation,
        notes: model.notes,
        thumbnail: thumbnail,
        meta: {
          vertices: geoData?.totalVertices || 0,
          faces: geoData?.totalFaces || 0,
          hasTextures: texInfo.hasColorMap || texInfo.hasNormalMap || texInfo.hasMetalnessMap || texInfo.hasRoughnessMap || texInfo.hasEmissionMap,
          textureCount: [texInfo.hasColorMap, texInfo.hasNormalMap, texInfo.hasMetalnessMap, texInfo.hasRoughnessMap, texInfo.hasEmissionMap].filter(Boolean).length,
          fileName: model.file.name,
          fileSize: model.file.size,
          fileType: model.file.type,
          isCharacterModel: model.evaluation?.isCharacterModel || false,
          similarity: model.evaluation?.similarity || 0,
        },
        modelFile: modelFileData,
        textureFiles: textureFilesData,
      };

      await CloudStorage.shareModel(modelData);
      model.shared = true;

      const status = document.getElementById(`share-status-${model.id}`);
      status.textContent = '已成功分享到云端模型库';
      status.classList.add('visible');

      btn.innerHTML = '<span>已分享</span>';
      this._showToast(`模型 "${model.name}" 已分享到云端库`, 'success');

      // Refresh library display
      this._loadLibrary();
    } catch (e) {
      console.error('Share failed:', e);
      btn.disabled = false;
      btn.innerHTML = '<span>Share to Cloud</span>';
      this._showToast('分享失败，请重试', 'error');
    }
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // === Model Library ===

  _loadLibrary() {
    // 1. Render from localStorage cache immediately
    const cached = CloudStorage.getAllModels();
    this._renderLibrary(cached);

    // 2. Async refresh from Firebase
    this._asyncRefreshLibrary();
  }

  async _asyncRefreshLibrary() {
    try {
      const models = await CloudStorage.getLibraryAsync();
      // Re-render with fresh data from cloud
      this._renderLibrary(models);
    } catch (e) {
      console.warn('Library async refresh failed:', e);
    }
  }

  _refreshLibrary() {
    const cached = CloudStorage.getAllModels();
    this._renderLibrary(cached, true); // randomize from cache

    // Also refresh from cloud
    this._asyncRefreshLibrary();
  }

  _renderLibrary(allModels, randomize = false) {
    this.libraryGrid.innerHTML = '';

    if (!allModels || allModels.length === 0) {
      this.libraryGrid.innerHTML = `
        <div class="library-empty-state">
          <span class="empty-icon">📭</span>
          <p>模型库暂无模型</p>
          <p class="empty-hint">评测完成后可将模型分享到此处</p>
        </div>
      `;
      return;
    }

    // Select 4 models to display (random or first 4)
    let displayModels;
    if (randomize && allModels.length > 4) {
      // Shuffle and pick 4
      const shuffled = [...allModels].sort(() => Math.random() - 0.5);
      displayModels = shuffled.slice(0, 4);
    } else {
      displayModels = allModels.slice(0, 4);
    }

    for (const m of displayModels) {
      const card = document.createElement('div');
      card.className = 'library-card';

      const thumbnailHTML = m.thumbnail
        ? `<img src="${m.thumbnail}" alt="${m.name}" />`
        : `<span class="lib-placeholder">🧊</span>`;

      const scoreHTML = m.scores
        ? `<div class="lib-score">${m.scores.totalScore.toFixed(2)}/100</div>`
        : '';

      const charBadgeHTML = m.meta?.isCharacterModel
        ? `<span class="lib-char-badge">👤 角色模型</span>`
        : '';

      const notesHTML = m.notes
        ? `<div class="lib-notes">${m.notes.length > 60 ? m.notes.slice(0, 60) + '...' : m.notes}</div>`
        : '';

      const metaHTML = `
        <div class="lib-meta">
          ${m.meta?.vertices ? `顶点: ${m.meta.vertices.toLocaleString()}` : ''}
          ${m.meta?.faces ? ` | 面: ${m.meta.faces.toLocaleString()}` : ''}
          ${m.meta?.textureCount ? ` | 贴图: ${m.meta.textureCount}` : ''}
          ${charBadgeHTML}
        </div>
      `;

      // Show download button if model has files (inline or in separate Firebase nodes)
      const hasFiles = m.modelFile || m.meta?.hasModelFile !== false;
      const downloadBtnHTML = hasFiles
        ? `<button class="lib-download-btn" title="打包下载模型及贴图">⬇</button>`
        : '';

      card.innerHTML = `
        <div class="lib-preview">${thumbnailHTML}</div>
        <div class="lib-info">
          <div class="lib-name">${m.name || '未命名'}</div>
          ${scoreHTML}
          ${notesHTML}
          ${metaHTML}
        </div>
        ${downloadBtnHTML}
      `;

      // Bind download button
      if (hasFiles) {
        const dlBtn = card.querySelector('.lib-download-btn');
        if (dlBtn) {
          dlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._downloadModelZip(m, dlBtn);
          });
        }
      }

      this.libraryGrid.appendChild(card);
    }
  }

  // === ZIP Download ===

  async _downloadModelZip(model, btn) {
    const m = model;
    let hasModelFile = !!m.modelFile;
    let texFiles = m.textureFiles || {};
    let texEntries = Object.entries(texFiles).filter(([k, f]) => f && f.data);

    const originalText = btn.textContent;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      // If no local file data, fetch from Firebase on-demand
      if (!hasModelFile && texEntries.length === 0) {
        btn.textContent = '🔄';
        console.log('[Download] Fetching files from Firebase for model:', m.id);
        const files = await CloudStorage.fetchModelFiles(m.id);

        if (files.modelFile) {
          m.modelFile = files.modelFile;  // cache for potential re-download
          hasModelFile = true;
        }
        if (files.textureFiles && Object.keys(files.textureFiles).length > 0) {
          m.textureFiles = files.textureFiles;  // cache
          texFiles = files.textureFiles;
          texEntries = Object.entries(texFiles).filter(([k, f]) => f && f.data);
        }
      }

      if (!hasModelFile && texEntries.length === 0) {
        alert('该模型没有可下载的文件数据\n\n可能原因：\n• 文件过大未成功上传\n• 模型为旧版数据（升级前分享）\n\n请尝试重新分享该模型。');
        return;
      }

      btn.textContent = '📦';

      // Check if JSZip is available
      if (typeof JSZip === 'undefined') {
        // Fallback: download files individually
        this._downloadFilesIndividually(m);
        return;
      }

      const zip = new JSZip();
      const safeName = (m.name || 'model').replace(/[<>:"/\\|?*]/g, '_');
      const folder = zip.folder(safeName);

      // Add model file
      if (hasModelFile) {
        const fileName = m.meta?.fileName || `${safeName}.glb`;
        const blob = this._dataUrlToBlob(m.modelFile);
        folder.file(fileName, blob);
      }

      // Add texture files
      for (const [key, texFile] of texEntries) {
        const texName = texFile.name || `${key}.png`;
        const blob = this._dataUrlToBlob(texFile.data);
        folder.file(`textures/${texName}`, blob);
      }

      // Generate zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Trigger download — browser will show save dialog
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this._showToast(`已打包下载 "${safeName}.zip"`, 'success');
    } catch (e) {
      console.error('ZIP download failed:', e);
      // Fallback: download files individually
      this._downloadFilesIndividually(m);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  _dataUrlToBlob(dataUrl) {
    if (dataUrl instanceof Blob) return dataUrl;
    if (typeof dataUrl !== 'string') return new Blob([dataUrl]);
    const parts = dataUrl.split(',');
    const meta = parts[0];
    const base64Data = parts[1] || parts[0];
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const byteString = atob(base64Data);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  _downloadFilesIndividually(m) {
    if (m.modelFile) {
      const fileName = m.meta?.fileName || `${m.name || 'model'}.glb`;
      this._triggerFileDownload(m.modelFile, fileName);
    }
    const texFiles = m.textureFiles || {};
    let delay = 300;
    for (const [key, texFile] of Object.entries(texFiles)) {
      if (texFile && texFile.data) {
        setTimeout(() => {
          this._triggerFileDownload(texFile.data, texFile.name || `${key}.png`);
        }, delay);
        delay += 300;
      }
    }
  }

  _triggerFileDownload(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // === PK Section ===

  /**
   * Generate SVG radar chart for 6-dimension comparison.
   * Each dimension is 0-10, with rings at 2/4/6/8/10.
   */
  _generateRadarChartSVG(dimsA, dimsB, nameA, nameB) {
    const cx = 200, cy = 200, r = 150;
    const n = dimsA.length; // 6
    const angleStep = (Math.PI * 2) / n;
    const startAngle = -Math.PI / 2; // Start from top

    // Helper: convert (dim index, score 0-10) to (x, y)
    const pointAt = (i, score) => {
      const angle = startAngle + i * angleStep;
      const dist = (score / 10) * r;
      return [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];
    };

    // Generate grid rings (concentric polygons at 2, 4, 6, 8, 10)
    let gridRings = '';
    for (const level of [2, 4, 6, 8, 10]) {
      const points = [];
      for (let i = 0; i < n; i++) {
        const [x, y] = pointAt(i, level);
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      gridRings += `<polygon points="${points.join(' ')}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    }

    // Generate axis lines and labels
    let axes = '';
    let labels = '';
    for (let i = 0; i < n; i++) {
      const [x, y] = pointAt(i, 10);
      axes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;

      // Label position (slightly outside the outer ring)
      const [lx, ly] = pointAt(i, 11.5);
      const labelName = dimsA[i].name;
      labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="#e8eaf0" font-size="13" font-weight="600">${labelName}</text>`;

      // Score label
      const [sx, sy] = pointAt(i, dimsA[i].score);
      labels += `<text x="${sx.toFixed(1)}" y="${(sy - 8).toFixed(1)}" text-anchor="middle" fill="#60a5fa" font-size="10" font-weight="600">${dimsA[i].score.toFixed(1)}</text>`;
      const [sx2, sy2] = pointAt(i, dimsB[i].score);
      labels += `<text x="${sx2.toFixed(1)}" y="${(sy2 + 12).toFixed(1)}" text-anchor="middle" fill="#f87171" font-size="10" font-weight="600">${dimsB[i].score.toFixed(1)}</text>`;
    }

    // Generate polygon A (blue)
    const pointsA = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = pointAt(i, dimsA[i].score);
      pointsA.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    // Generate polygon B (red)
    const pointsB = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = pointAt(i, dimsB[i].score);
      pointsB.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    return `
      <svg viewBox="0 0 400 400" style="width:100%;max-width:400px;margin:0 auto;display:block;">
        ${gridRings}
        ${axes}
        <polygon points="${pointsB.join(' ')}" fill="rgba(239,68,68,0.15)" stroke="#ef4444" stroke-width="2"/>
        <polygon points="${pointsA.join(' ')}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2"/>
        ${labels}
      </svg>
    `;
  }

  _renderPK() {
    const evaluatedModels = this.models.filter(m => m.evaluation);
    if (evaluatedModels.length < 2) return;

    const pkData = ModelEvaluator.compareModels(
      evaluatedModels.map(m => ({
        name: m.name,
        result: m.evaluation,
        meta: {
          faces: m.viewer?.getGeometryData()?.totalFaces || 0,
          vertices: m.viewer?.getGeometryData()?.totalVertices || 0,
        },
      }))
    );
    if (!pkData) return;

    // Compute 6 macro dimensions for radar chart
    const dimsWinner = ModelEvaluator.computeSixDimensions(pkData.winner.result.breakdown);
    const dimsRunner = ModelEvaluator.computeSixDimensions(pkData.runner.result.breakdown);

    const radarSVG = this._generateRadarChartSVG(
      dimsWinner, dimsRunner,
      pkData.winner.name, pkData.runner.name
    );

    const winnerType = pkData.winnerIsChar ? '<span style="color:var(--gold);font-size:12px;">👤 角色模型</span>' : '';
    const runnerType = pkData.runnerIsChar ? '<span style="color:var(--gold);font-size:12px;">👤 角色模型</span>' : '';

    // Generate usage tags for both models (with descriptions)
    const winnerTags = ModelEvaluator.generateUsageTags(pkData.winner.result.breakdown, pkData.winner.meta);
    const runnerTags = ModelEvaluator.generateUsageTags(pkData.runner.result.breakdown, pkData.runner.meta);

    // Build per-model summary paragraphs
    const winnerTagsHTML = winnerTags.length > 0
      ? winnerTags.map(t => `<span class="rec-tag rec-tag-${t.color}">${t.label}</span>`).join('')
      : '<span class="rec-tag rec-tag-gray">暂无推荐用途</span>';
    const runnerTagsHTML = runnerTags.length > 0
      ? runnerTags.map(t => `<span class="rec-tag rec-tag-${t.color}">${t.label}</span>`).join('')
      : '<span class="rec-tag rec-tag-gray">暂无推荐用途</span>';

    const winnerDescHTML = winnerTags.length > 0
      ? winnerTags.map(t => `<p class="pk-summary-desc">${t.description}</p>`).join('')
      : '';
    const runnerDescHTML = runnerTags.length > 0
      ? runnerTags.map(t => `<p class="pk-summary-desc">${t.description}</p>`).join('')
      : '';

    const winnerStrengths = pkData.winnerStrengths.length > 0
      ? `<div class="pk-summary-strengths"><span class="pk-strength-label">优势项：</span>${pkData.winnerStrengths.join('、')}</div>`
      : '';
    const runnerStrengths = pkData.runnerStrengths.length > 0
      ? `<div class="pk-summary-strengths"><span class="pk-strength-label">优势项：</span>${pkData.runnerStrengths.join('、')}</div>`
      : '';

    this.pkSection.innerHTML = `
      <h2>Model PK - 对比评测</h2>
      <div class="pk-container">
        <div class="pk-card">
          ${pkData.winner.result.totalScore > pkData.runner.result.totalScore ? '<div class="pk-winner-badge">优胜者</div>' : ''}
          <div class="pk-model-name">${pkData.winner.name}</div>
          ${winnerType}
          <div class="pk-model-score">${pkData.winner.result.totalScore.toFixed(2)}<span style="font-size:18px;color:#8b90a0">/100</span></div>
        </div>
        <div class="pk-card">
          ${pkData.runner.result.totalScore > pkData.winner.result.totalScore ? '<div class="pk-winner-badge">优胜者</div>' : ''}
          <div class="pk-model-name">${pkData.runner.name}</div>
          ${runnerType}
          <div class="pk-model-score">${pkData.runner.result.totalScore.toFixed(2)}<span style="font-size:18px;color:#8b90a0">/100</span></div>
        </div>
      </div>
      <div style="margin-top:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;">
        <div style="display:flex;gap:16px;margin-bottom:16px;align-items:center;justify-content:center;">
          <span style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:3px;"></span>
            <span style="font-size:14px;font-weight:600;">${pkData.winner.name}</span>
          </span>
          <span style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-block;width:14px;height:14px;background:#ef4444;border-radius:3px;"></span>
            <span style="font-size:14px;font-weight:600;">${pkData.runner.name}</span>
          </span>
        </div>
        <div class="pk-radar-container">${radarSVG}</div>
      </div>
      <div class="pk-summary-section">
        <h3 class="pk-summary-title">📋 对比分析摘要</h3>
        <div class="pk-summary-divider"></div>
        <div class="pk-summary-model">
          <div class="pk-summary-model-header">
            <span class="pk-summary-model-name" style="color:#3b82f6;">${pkData.winner.name}</span>
            <span class="pk-summary-model-score">${pkData.winner.result.totalScore.toFixed(2)} / 100</span>
          </div>
          <div class="pk-summary-tags">${winnerTagsHTML}</div>
          ${winnerDescHTML}
          ${winnerStrengths}
        </div>
        <div class="pk-summary-divider"></div>
        <div class="pk-summary-model">
          <div class="pk-summary-model-header">
            <span class="pk-summary-model-name" style="color:#ef4444;">${pkData.runner.name}</span>
            <span class="pk-summary-model-score">${pkData.runner.result.totalScore.toFixed(2)} / 100</span>
          </div>
          <div class="pk-summary-tags">${runnerTagsHTML}</div>
          ${runnerDescHTML}
          ${runnerStrengths}
        </div>
      </div>
      <div style="text-align:center;margin-top:16px;">
        <button class="btn btn-outline btn-sm" id="viewFullPKBtn">
          <span>📄 查看完整对比报告</span>
        </button>
      </div>
    `;
    this.pkSection.classList.add('visible');

    // Bind full PK report button
    const fullPKBtn = this.pkSection.querySelector('#viewFullPKBtn');
    if (fullPKBtn) {
      fullPKBtn.addEventListener('click', () => this._showFullPKReport());
    }
  }

  // === Full Report Overlay ===

  _showFullReport(model) {
    const ev = model.evaluation;
    if (!ev) return;

    // Remove any existing overlay
    const existing = document.getElementById('fullReportOverlay');
    if (existing) existing.remove();

    // Build breakdown HTML
    let breakdownHTML = '';
    for (const item of ev.breakdown) {
      const pct = item.percentage;
      const color = pct >= 80 ? '#4ade80' : pct >= 60 ? '#fbbf24' : '#f87171';
      breakdownHTML += `
        <div class="detail-score-item">
          <span class="detail-item-name">${item.name}</span>
          <div class="detail-item-bar-outer">
            <div class="detail-item-bar-inner" style="width:${pct}%;background:${color};"></div>
          </div>
          <span class="detail-item-score" style="color:${color}">${item.score.toFixed(2)}/${item.max}</span>
        </div>
      `;
    }

    // Build analysis HTML
    let analysisHTML = '';
    if (ev.analysis) {
      analysisHTML = ev.analysis.map(a => `
        <div class="detail-analysis-item">
          <div class="detail-analysis-title">${a.title}</div>
          <div class="detail-analysis-content">${a.content}</div>
        </div>
      `).join('');
    }

    // Build usage tags HTML
    const tags = ModelEvaluator.generateUsageTags(ev.breakdown, {
      faces: model.viewer?.getGeometryData()?.totalFaces || 0,
      vertices: model.viewer?.getGeometryData()?.totalVertices || 0,
    });
    let tagsHTML = tags.length > 0
      ? tags.map(t => `<span class="rec-tag rec-tag-${t.color}">${t.label}</span>`).join('')
      : '<span class="rec-tag rec-tag-gray">暂无推荐用途</span>';

    // Type badge
    const typeBadge = ev.isCharacterModel
      ? `<span class="detail-type-badge" style="color:var(--gold);">👤 角色模型 <span class="detail-similarity">相似度 ${ev.similarity.toFixed(2)}%</span></span>`
      : '';

    const geoData = model.viewer?.getGeometryData();

    const overlay = document.createElement('div');
    overlay.id = 'fullReportOverlay';
    overlay.className = 'full-report-overlay visible';
    overlay.innerHTML = `
      <div class="full-report-panel">
        <button class="full-report-close" id="reportCloseBtn">×</button>

        <!-- Share buttons (top-right) -->
        <div class="share-bar">
          <span class="share-bar-label">分享到：</span>
          <button class="share-btn-circle share-weibo" data-platform="weibo" title="分享到微博">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10.7 13.5c-2.4-.6-4.3.7-4.3 2.8 0 2.2 1.9 3.5 4.3 2.9 2.3-.6 3.7-2.1 3.7-3.5 0-1.3-1.4-1.8-3.7-2.2zm-1 4.5c-.8.2-1.6-.2-1.7-.9-.1-.7.5-1.4 1.3-1.6.8-.2 1.6.2 1.7.9.1.7-.5 1.4-1.3 1.6zm1.3-1.8c-.3.1-.6 0-.7-.2-.1-.2.1-.5.4-.6.3-.1.6 0 .7.2.1.2-.1.5-.4.6z"/><path d="M20.5 11.6c-.3-1.4-1.4-2.4-2.7-2.4-.3 0-.6.1-.7.4-.1.3 0 .6.3.7.8.2 1.4.8 1.6 1.6.1.3.4.5.7.4.3-.1.5-.4.4-.7z"/><path d="M23 11c-.5-2.9-2.8-5.1-5.7-5.1-.6 0-1.1.1-1.3.4-.2.3-.1.7.2.8.2.1.5.1.8.1 2 0 3.7 1.5 4 3.6 0 .3.3.6.6.5.3 0 .5-.3.4-.6z"/></svg>
          </button>
          <button class="share-btn-circle share-wechat" data-platform="wechat" title="分享到微信">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8.7 6.5c.5 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm4.7 0c.5 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm-6.2 6.4c-.6 0-1.1-.4-1.1-1s.5-1 1.1-1 1.1.4 1.1 1-.5 1-1.1 1zm4.7 0c-.6 0-1.1-.4-1.1-1s.5-1 1.1-1 1.1.4 1.1 1-.5 1-1.1 1z"/><path d="M9.1 4C5.2 4 2 6.6 2 9.8c0 1.8 1 3.4 2.6 4.5l-.7 2 2.3-1.2c.8.2 1.6.4 2.4.4h.6c-.1-.4-.2-.9-.2-1.3 0-3 2.8-5.4 6.3-5.4h.6C15.3 5.8 12.5 4 9.1 4zm8.8 4.4c-3.1 0-5.6 2.1-5.6 4.7 0 2.6 2.5 4.7 5.6 4.7.7 0 1.4-.1 2-.3l1.8 1-.5-1.6c1.3-.9 2.3-2.2 2.3-3.8 0-2.6-2.5-4.7-5.6-4.7z"/></svg>
          </button>
          <button class="share-btn-circle share-xhs" data-platform="xiaohongshu" title="分享到小红书">
            <span style="font-size:12px;font-weight:700;">小红书</span>
          </button>
          <button class="share-btn-circle share-douyin" data-platform="douyin" title="分享到抖音">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.8c-.6-1.1-1.4-2-2.4-2.6v2.8c.7.5 1.2 1.3 1.4 2.2.2.9 0 1.8-.5 2.6-.5.8-1.3 1.3-2.2 1.5-.9.2-1.8 0-2.6-.5-.8-.5-1.3-1.3-1.5-2.2V20c1.1.3 2.3.3 3.4 0 1.1-.3 2.1-.9 2.9-1.7.8-.8 1.4-1.8 1.7-2.9.3-1.1.3-2.3 0-3.4V5.8z"/><path d="M13.8 5.2c-.6-.4-1.1-.9-1.5-1.5h-2.2v10.5c0 .5-.2 1-.5 1.4-.4.4-.8.6-1.4.6-.5 0-1-.2-1.4-.6-.4-.4-.6-.9-.6-1.4 0-.5.2-1 .6-1.4.4-.4.9-.6 1.4-.6.2 0 .4 0 .6.1V9.7c-.2 0-.4-.1-.6-.1-1.1 0-2.1.4-2.9 1.2-.8.8-1.2 1.8-1.2 2.9s.4 2.1 1.2 2.9c.8.8 1.8 1.2 2.9 1.2s2.1-.4 2.9-1.2c.8-.8 1.2-1.8 1.2-2.9V5.2z"/></svg>
          </button>
        </div>

        <div class="full-report-content">
          <div class="detail-header">
            <div class="detail-thumbnail">
              ${model.viewer?.captureThumbnail() ? `<img src="${model.viewer.captureThumbnail()}" />` : '<span class="lib-placeholder">🧊</span>'}
            </div>
            <div class="detail-title-area">
              <h2 class="detail-model-name">${model.name}</h2>
              ${typeBadge}
              <div class="detail-total-score">
                <span class="detail-score-value">${ev.totalScore.toFixed(2)}</span>
                <span class="detail-score-max">/ ${ev.maxScore}</span>
                <span class="score-grade ${ev.gradeClass}">${ev.grade}</span>
              </div>
            </div>
          </div>

          <div class="detail-rec-tags">
            <div class="rec-label">模型用途推荐</div>
            <div class="rec-tags">${tagsHTML}</div>
          </div>

          <div class="detail-breakdown">
            <h3>详细评分</h3>
            ${breakdownHTML}
          </div>

          <div class="detail-analysis-section">
            <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;color:var(--text);">分析报告</h3>
            ${analysisHTML}
          </div>

          <div class="detail-meta-section">
            <h3>模型信息</h3>
            <div class="detail-meta-list">
              <span class="detail-meta-item">顶点: ${(geoData?.totalVertices || 0).toLocaleString()}</span>
              <span class="detail-meta-item">面: ${(geoData?.totalFaces || 0).toLocaleString()}</span>
              <span class="detail-meta-item">UV: ${geoData?.hasUV ? '有' : '无'}</span>
              <span class="detail-meta-item">UV壳数: ${geoData?.uvShellCount || 0}</span>
              <span class="detail-meta-item">UV占用: ${((geoData?.uvOccupancy || 0) * 100).toFixed(1)}%</span>
              <span class="detail-meta-item">空洞: ${geoData?.holeCount || 0}</span>
              <span class="detail-meta-item">平滑比值: ${(geoData?.smoothRatio || 0).toFixed(3)}</span>
            </div>
          </div>

          ${model.notes ? `
          <div class="detail-notes-section">
            <h3>评论</h3>
            <div class="detail-notes-text">${model.notes}</div>
          </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Bind close button
    overlay.querySelector('#reportCloseBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Bind share buttons
    overlay.querySelectorAll('.share-btn-circle').forEach(btn => {
      btn.addEventListener('click', () => {
        this._shareToPlatform(btn.dataset.platform, model.name, ev.totalScore);
      });
    });
  }

  _showFullPKReport() {
    const evaluatedModels = this.models.filter(m => m.evaluation);
    if (evaluatedModels.length < 2) return;

    const pkData = ModelEvaluator.compareModels(
      evaluatedModels.map(m => ({
        name: m.name,
        result: m.evaluation,
        meta: {
          faces: m.viewer?.getGeometryData()?.totalFaces || 0,
          vertices: m.viewer?.getGeometryData()?.totalVertices || 0,
        },
      }))
    );
    if (!pkData) return;

    const dimsWinner = ModelEvaluator.computeSixDimensions(pkData.winner.result.breakdown);
    const dimsRunner = ModelEvaluator.computeSixDimensions(pkData.runner.result.breakdown);
    const radarSVG = this._generateRadarChartSVG(dimsWinner, dimsRunner, pkData.winner.name, pkData.runner.name);

    // Generate usage tags for both models (with descriptions)
    const winnerTags = ModelEvaluator.generateUsageTags(pkData.winner.result.breakdown, pkData.winner.meta);
    const runnerTags = ModelEvaluator.generateUsageTags(pkData.runner.result.breakdown, pkData.runner.meta);

    const winnerTagsHTML = winnerTags.length > 0
      ? winnerTags.map(t => `<span class="rec-tag rec-tag-${t.color}">${t.label}</span>`).join('')
      : '<span class="rec-tag rec-tag-gray">暂无推荐用途</span>';
    const runnerTagsHTML = runnerTags.length > 0
      ? runnerTags.map(t => `<span class="rec-tag rec-tag-${t.color}">${t.label}</span>`).join('')
      : '<span class="rec-tag rec-tag-gray">暂无推荐用途</span>';

    const winnerDescHTML = winnerTags.length > 0
      ? winnerTags.map(t => `<p class="pk-summary-desc">${t.description}</p>`).join('')
      : '';
    const runnerDescHTML = runnerTags.length > 0
      ? runnerTags.map(t => `<p class="pk-summary-desc">${t.description}</p>`).join('')
      : '';

    const winnerStrengths = pkData.winnerStrengths.length > 0
      ? `<div class="pk-summary-strengths"><span class="pk-strength-label">优势项：</span>${pkData.winnerStrengths.join('、')}</div>`
      : '';
    const runnerStrengths = pkData.runnerStrengths.length > 0
      ? `<div class="pk-summary-strengths"><span class="pk-strength-label">优势项：</span>${pkData.runnerStrengths.join('、')}</div>`
      : '';

    // Remove any existing overlay
    const existing = document.getElementById('fullReportOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fullReportOverlay';
    overlay.className = 'full-report-overlay visible';
    overlay.innerHTML = `
      <div class="full-report-panel" style="max-width:900px;">
        <button class="full-report-close" id="reportCloseBtn">×</button>

        <div class="share-bar">
          <span class="share-bar-label">分享到：</span>
          <button class="share-btn-circle share-weibo" data-platform="weibo" title="分享到微博">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10.7 13.5c-2.4-.6-4.3.7-4.3 2.8 0 2.2 1.9 3.5 4.3 2.9 2.3-.6 3.7-2.1 3.7-3.5 0-1.3-1.4-1.8-3.7-2.2z"/></svg>
          </button>
          <button class="share-btn-circle share-wechat" data-platform="wechat" title="分享到微信">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.1 4C5.2 4 2 6.6 2 9.8c0 1.8 1 3.4 2.6 4.5l-.7 2 2.3-1.2c.8.2 1.6.4 2.4.4z"/></svg>
          </button>
          <button class="share-btn-circle share-xhs" data-platform="xiaohongshu" title="分享到小红书">
            <span style="font-size:12px;font-weight:700;">小红书</span>
          </button>
          <button class="share-btn-circle share-douyin" data-platform="douyin" title="分享到抖音">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.8c-.6-1.1-1.4-2-2.4-2.6v2.8c.7.5 1.2 1.3 1.4 2.2z"/></svg>
          </button>
        </div>

        <div class="full-report-content">
          <h2 style="font-size:24px;font-weight:800;margin-bottom:20px;text-align:center;">Model PK - 对比评测报告</h2>

          <div class="pk-container" style="margin-bottom:24px;">
            <div class="pk-card">
              ${pkData.winner.result.totalScore > pkData.runner.result.totalScore ? '<div class="pk-winner-badge">优胜者</div>' : ''}
              <div class="pk-model-name">${pkData.winner.name}</div>
              <div class="pk-model-score">${pkData.winner.result.totalScore.toFixed(2)}<span style="font-size:18px;color:#8b90a0">/100</span></div>
            </div>
            <div class="pk-card">
              ${pkData.runner.result.totalScore > pkData.winner.result.totalScore ? '<div class="pk-winner-badge">优胜者</div>' : ''}
              <div class="pk-model-name">${pkData.runner.name}</div>
              <div class="pk-model-score">${pkData.runner.result.totalScore.toFixed(2)}<span style="font-size:18px;color:#8b90a0">/100</span></div>
            </div>
          </div>

          <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;">
            <div style="display:flex;gap:16px;margin-bottom:16px;align-items:center;justify-content:center;">
              <span style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:14px;height:14px;background:#3b82f6;border-radius:3px;"></span>
                <span style="font-size:14px;font-weight:600;">${pkData.winner.name}</span>
              </span>
              <span style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:14px;height:14px;background:#ef4444;border-radius:3px;"></span>
                <span style="font-size:14px;font-weight:600;">${pkData.runner.name}</span>
              </span>
            </div>
            <div class="pk-radar-container">${radarSVG}</div>
          </div>

          <div class="pk-summary-section" style="margin-bottom:20px;">
            <h3 class="pk-summary-title">📋 对比分析摘要</h3>
            <div class="pk-summary-divider"></div>
            <div class="pk-summary-model">
              <div class="pk-summary-model-header">
                <span class="pk-summary-model-name" style="color:#3b82f6;">${pkData.winner.name}</span>
                <span class="pk-summary-model-score">${pkData.winner.result.totalScore.toFixed(2)} / 100</span>
              </div>
              <div class="pk-summary-tags">${winnerTagsHTML}</div>
              ${winnerDescHTML}
              ${winnerStrengths}
            </div>
            <div class="pk-summary-divider"></div>
            <div class="pk-summary-model">
              <div class="pk-summary-model-header">
                <span class="pk-summary-model-name" style="color:#ef4444;">${pkData.runner.name}</span>
                <span class="pk-summary-model-score">${pkData.runner.result.totalScore.toFixed(2)} / 100</span>
              </div>
              <div class="pk-summary-tags">${runnerTagsHTML}</div>
              ${runnerDescHTML}
              ${runnerStrengths}
            </div>
          </div>

          <!-- Detailed dimension comparison -->
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;">
            <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;color:var(--text);">六维详细对比</h3>
            ${dimsWinner.map((d, i) => `
              <div class="detail-score-item">
                <span class="detail-item-name">${d.name}</span>
                <div class="detail-item-bar-outer">
                  <div class="detail-item-bar-inner" style="width:${(d.score/10)*100}%;background:#3b82f6;"></div>
                </div>
                <span class="detail-item-score" style="color:#60a5fa;">${d.score.toFixed(2)}</span>
              </div>
              <div class="detail-score-item">
                <span class="detail-item-name"></span>
                <div class="detail-item-bar-outer">
                  <div class="detail-item-bar-inner" style="width:${(dimsRunner[i].score/10)*100}%;background:#ef4444;"></div>
                </div>
                <span class="detail-item-score" style="color:#f87171;">${dimsRunner[i].score.toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#reportCloseBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelectorAll('.share-btn-circle').forEach(btn => {
      btn.addEventListener('click', () => {
        this._shareToPlatform(btn.dataset.platform, `模型对比报告`, null);
      });
    });
  }

  /**
   * Share to social platforms.
   * - Weibo: opens share dialog
   * - WeChat: shows QR code popup
   * - Xiaohongshu: copies link + opens website
   * - Douyin: copies link + opens website
   */
  _shareToPlatform(platform, modelName, score) {
    const shareUrl = window.location.href.split('?')[0]; // Base URL without params
    const title = score !== null
      ? `我用AI 3D评测工具评测了模型"${modelName}"，得分${score.toFixed(2)}分！`
      : `AI 3D拓扑低模评测工具 - 模型对比报告`;

    switch (platform) {
      case 'weibo': {
        const url = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title)}`;
        window.open(url, '_blank', 'width=600,height=500');
        break;
      }
      case 'wechat': {
        // Show QR code popup
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`;
        const popup = document.createElement('div');
        popup.className = 'qr-popup';
        popup.innerHTML = `
          <div class="qr-popup-content">
            <h4>微信扫一扫分享</h4>
            <img src="${qrUrl}" alt="QR Code" style="width:240px;height:240px;border-radius:12px;" />
            <p>打开微信，扫描二维码即可分享</p>
            <button class="btn btn-outline btn-sm" id="qrCloseBtn">关闭</button>
          </div>
        `;
        popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:10002;';
        document.body.appendChild(popup);
        popup.querySelector('#qrCloseBtn').addEventListener('click', () => popup.remove());
        popup.addEventListener('click', (e) => {
          if (e.target === popup) popup.remove();
        });
        break;
      }
      case 'xiaohongshu': {
        // Copy link to clipboard, then open website
        navigator.clipboard.writeText(shareUrl).then(() => {
          this._showToast('链接已复制，正在跳转小红书，请粘贴链接分享', 'success');
          setTimeout(() => window.open('https://www.xiaohongshu.com/', '_blank'), 500);
        }).catch(() => {
          this._showToast('请手动复制链接：' + shareUrl, 'warn');
          window.open('https://www.xiaohongshu.com/', '_blank');
        });
        break;
      }
      case 'douyin': {
        navigator.clipboard.writeText(shareUrl).then(() => {
          this._showToast('链接已复制，正在跳转抖音，请粘贴链接分享', 'success');
          setTimeout(() => window.open('https://www.douyin.com/', '_blank'), 500);
        }).catch(() => {
          this._showToast('请手动复制链接：' + shareUrl, 'warn');
          window.open('https://www.douyin.com/', '_blank');
        });
        break;
      }
    }
  }

  // === Utility ===

  _showToast(msg, type = '') {
    this.toast.textContent = msg;
    this.toast.className = 'toast visible ' + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toast.classList.remove('visible');
    }, 4000);
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}

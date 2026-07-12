/**
 * App - Main application controller for AI 3D Topology Low-Poly Model Evaluation Tool
 *
 * Models and textures uploaded separately:
 * - Model file: OBJ, FBX, GLTF/GLB, STL, PLY
 * - Texture files: BaseColor, NormalMap, MetallicMap, Roughness, Emission
 *
 * Standard human body model: ADMIN ONLY (URL ?admin=1)
 * Global display mode toolbar: applies to all user models simultaneously
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
    this.globalMode = 'gray'; // Current global display mode

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

    // Global mode toolbar
    this.globalModeToolbar = document.getElementById('globalModeToolbar');
    this.globalModeBtns = document.querySelectorAll('.global-mode-btn');

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

    // Global display mode toolbar
    this.globalModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this._setGlobalMode(mode);
      });
    });

    // Library refresh
    this.libraryRefreshBtn.addEventListener('click', () => this._refreshLibrary());
  }

  // === Global Display Mode ===

  /** Set display mode for ALL user models simultaneously */
  _setGlobalMode(mode) {
    this.globalMode = mode;

    // Update global toolbar button states
    this.globalModeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Update all per-card mode buttons
    document.querySelectorAll('.card-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Check for UV presence when switching to texture modes
    if (mode === 'color' || mode === 'material') {
      let noUVCount = 0;
      for (const model of this.models) {
        if (model.viewer && !model.viewer.hasUV()) {
          noUVCount++;
        }
      }
      if (noUVCount > 0) {
        this._showToast(`⚠ ${noUVCount} 个模型无UV坐标，贴图可能显示异常`, 'warn');
      }
    }

    // Apply to all user models
    for (const model of this.models) {
      if (model.viewer) {
        model.viewer.setMode(mode);
      }
    }
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

      <!-- Per-card viewer mode buttons (controls global mode) -->
      <div class="card-viewer-modes">
        <button class="card-mode-btn ${this.globalMode === 'gray' ? 'active' : ''}" data-mode="gray" title="无贴图，灰色材质显示模型形状">
          <span>🔘</span> 灰模显示
        </button>
        <button class="card-mode-btn ${this.globalMode === 'wireframe' ? 'active' : ''}" data-mode="wireframe" title="蓝色线框，查看拓扑布线结构">
          <span>🔷</span> 线框显示
        </button>
        <button class="card-mode-btn ${this.globalMode === 'color' ? 'active' : ''}" data-mode="color" title="贴上颜色贴图(BaseColor)的效果">
          <span>🎨</span> 颜色贴图
        </button>
        <button class="card-mode-btn ${this.globalMode === 'material' ? 'active' : ''}" data-mode="material" title="平行光 + PBR全贴图材质效果">
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

    // Apply current global mode to new model
    model.viewer.setMode(this.globalMode);

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

    // Per-card mode buttons (control global mode)
    card.querySelectorAll('.card-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setGlobalMode(btn.dataset.mode);
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
    if (textureKey === 'baseColor' && this.globalMode === 'color') {
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
      this.globalModeToolbar.classList.add('visible');
    } else {
      this.initialUpload.style.display = 'block';
      this.splitButtons.style.display = 'none';
      this.modelGrid.style.display = 'none';
      this.globalModeToolbar.classList.remove('visible');
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

    // Build recommendation tags
    let recTagsHTML = '';
    const ev = model.evaluation;
    if (ev) {
      const tags = [];

      // Purple "不可打印" tag if unmerged vertices exist
      if (ev.unmergedPairs > 0) {
        tags.push({ label: '不可打印', color: 'purple', detail: `${ev.unmergedPairs} 组未合并点` });
      } else {
        tags.push({ label: '可打印', color: 'green', detail: '无未合并点' });
      }

      // Character model tag
      if (ev.isCharacterModel) {
        tags.push({ label: '角色模型', color: 'gold', detail: `相似度 ${ev.similarity.toFixed(1)}%` });
      }

      // Score-based tag (high quality only)
      if (ev.totalScore >= 80) {
        tags.push({ label: '高质量', color: 'blue', detail: `${ev.totalScore.toFixed(1)}分` });
      }

      recTagsHTML = tags.map(t => `
        <span class="rec-tag rec-tag-${t.color}" title="${t.detail}">
          ${t.label}
          <span class="rec-tag-detail">${t.detail}</span>
        </span>
      `).join('');
    }

    notesSection.innerHTML = `
      <textarea placeholder="输入备注..." data-id="${model.id}">${model.notes}</textarea>
      <div class="recommendation-section">
        <div class="rec-label">模型用途推荐</div>
        <div class="rec-tags">${recTagsHTML}</div>
      </div>
      <button class="btn btn-green btn-sm share-btn" data-id="${model.id}">
        <span>Share to Cloud</span>
      </button>
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

      const downloadBtnHTML = m.modelFile
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
      if (m.modelFile) {
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
    const hasModelFile = !!m.modelFile;
    const texFiles = m.textureFiles || {};
    const texEntries = Object.entries(texFiles).filter(([k, f]) => f && f.data);

    if (!hasModelFile && texEntries.length === 0) {
      alert('该模型没有可下载的文件数据');
      return;
    }

    const originalText = btn.textContent;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
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

  _renderPK() {
    const evaluatedModels = this.models.filter(m => m.evaluation);
    if (evaluatedModels.length < 2) return;

    const pkData = ModelEvaluator.compareModels(
      evaluatedModels.map(m => ({ name: m.name, result: m.evaluation }))
    );
    if (!pkData) return;

    let compHTML = '';
    for (const dim of pkData.dimensionComparison) {
      compHTML += `
        <div class="pk-comp-item">
          <span class="pk-comp-label">${dim.name}</span>
          <div class="pk-comp-bar">
            <div class="pk-comp-fill a" style="width:${dim.winnerPct}%"><span class="pk-comp-value">${dim.winner.toFixed(2)}</span></div>
          </div>
          <div class="pk-comp-bar">
            <div class="pk-comp-fill b" style="width:${dim.runnerPct}%"><span class="pk-comp-value">${dim.runner.toFixed(2)}</span></div>
          </div>
        </div>
      `;
    }

    const winnerType = pkData.winnerIsChar ? '<span style="color:var(--gold);font-size:12px;">👤 角色模型</span>' : '';
    const runnerType = pkData.runnerIsChar ? '<span style="color:var(--gold);font-size:12px;">👤 角色模型</span>' : '';

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
      <div style="margin-top:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;">
        <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;">
          <span style="display:inline-block;width:12px;height:12px;background:var(--blue);border-radius:3px;"></span>
          <span style="font-size:14px;">${pkData.winner.name}</span>
          <span style="display:inline-block;width:12px;height:12px;background:var(--red);border-radius:3px;margin-left:20px;"></span>
          <span style="font-size:14px;">${pkData.runner.name}</span>
        </div>
        <div class="pk-comparison">${compHTML}</div>
      </div>
      <div style="margin-top:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;font-size:14px;color:var(--text-dim);line-height:1.8;">
        <strong style="color:var(--text);">对比分析摘要：</strong><br>
        ${pkData.summary}
      </div>
    `;
    this.pkSection.classList.add('visible');
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

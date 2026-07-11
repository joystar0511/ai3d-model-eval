/**
 * App - Main application controller for AI 3D Topology Low-Poly Model Evaluation Tool
 *
 * Models and textures are uploaded separately:
 * - Model file: OBJ, FBX, GLTF/GLB, STL, PLY
 * - Texture files: BaseColor, NormalMap, MetallicMap, Roughness, Emission
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
    this._initDOM();
    this._bindEvents();
  }

  _initDOM() {
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
  }

  _bindEvents() {
    this.initialUpload.addEventListener('click', () => this.fileInput.click());
    this.initialUpload.addEventListener('dragover', e => this._onDragOver(e));
    this.initialUpload.addEventListener('dragleave', e => this._onDragLeave(e));
    this.initialUpload.addEventListener('drop', e => this._onDrop(e));
    this.fileInput.addEventListener('change', e => this._handleFiles(e.target.files));

    this.btnAddMore.addEventListener('click', () => this.fileInputAdd.click());
    this.btnEvaluate.addEventListener('click', () => this._startEvaluation());
    this.fileInputAdd.addEventListener('change', e => this._handleFiles(e.target.files));
  }

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
      <div class="viewer-modes" id="modes-${model.id}">
        <button class="viewer-mode-btn active" data-mode="gray">灰模</button>
        <button class="viewer-mode-btn" data-mode="wireframe">线框</button>
        <button class="viewer-mode-btn" data-mode="color">颜色贴图</button>
        <button class="viewer-mode-btn" data-mode="material">材质灯光</button>
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

    // Initialize viewer
    const viewerContainer = card.querySelector(`#viewer-${model.id}`);
    model.viewer = new ModelViewer(viewerContainer, model.file);

    // Bind mode buttons
    const modeButtons = card.querySelectorAll('.viewer-mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        model.viewer.setMode(btn.dataset.mode);
      });
    });

    // Bind name input
    const nameInput = card.querySelector('.model-name-input');
    nameInput.addEventListener('input', e => {
      model.name = e.target.value.trim();
    });
    model.name = this._guessName(model.file.name);
    nameInput.value = model.name;

    // Bind texture upload slots
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

    // Bind remove button
    card.querySelector('.card-remove').addEventListener('click', () => {
      this._removeModel(model.id);
    });
  }

  async _handleTextureUpload(modelId, textureKey, file) {
    const model = this.models.find(m => m.id === modelId);
    if (!model) return;

    model.textureFiles[textureKey] = file;

    // Update status display
    const statusEl = document.getElementById(`tex-status-${modelId}-${textureKey}`);
    if (statusEl) {
      const fileName = file.name.length > 15 ? file.name.slice(0, 12) + '...' : file.name;
      statusEl.textContent = fileName;
      statusEl.classList.add('uploaded');
    }

    // Update slot visual
    const slotEl = document.querySelector(`.texture-slot[data-model="${modelId}"][data-key="${textureKey}"]`);
    if (slotEl) slotEl.classList.add('has-texture');

    // Update viewer textures
    await model.viewer.setTextures(model.textureFiles);

    // Auto-switch to material mode if user uploads textures
    if (textureKey === 'baseColor') {
      const colorBtn = document.querySelector(`#modes-${modelId} .viewer-mode-btn[data-mode="color"]`);
      if (colorBtn) colorBtn.click();
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

      const result = await ModelEvaluator.evaluate(geoData, texInfo, (progress) => {
        const overall = Math.round(((currentStep + progress / 100 * DIMENSIONS.length) / totalSteps) * 100);
        this.progressBar.style.width = `${overall}%`;
      });

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

    this._showToast('评测完成！所有模型评分已生成', 'success');
  }

  _renderScore(model) {
    const scoreSection = document.getElementById(`score-${model.id}`);
    const ev = model.evaluation;

    let breakdownHTML = '';
    for (const item of ev.breakdown) {
      const color = item.percentage >= 80 ? '#4ade80' : item.percentage >= 60 ? '#fbbf24' : '#f87171';
      breakdownHTML += `
        <div class="score-item">
          <span class="item-name">${item.name}</span>
          <span class="item-score" style="color:${color}">${item.score}/${item.max}</span>
        </div>
      `;
    }

    scoreSection.innerHTML = `
      <div class="score-total">
        <span class="score-value">${ev.totalScore}</span>
        <span class="score-max">/ ${ev.maxScore}</span>
        <span class="score-grade ${ev.gradeClass}">${ev.grade}</span>
      </div>
      <div class="score-breakdown">${breakdownHTML}</div>
    `;
    scoreSection.classList.add('visible');
  }

  _renderNotesAndShare(model) {
    const notesSection = document.getElementById(`notes-${model.id}`);
    notesSection.innerHTML = `
      <textarea placeholder="输入备注..." data-id="${model.id}">${model.notes}</textarea>
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
      const thumbnail = model.viewer.captureThumbnail();
      const geoData = model.viewer.getGeometryData();
      const texInfo = model.viewer.getTextureInfo();

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
        },
      };

      await CloudStorage.shareModel(modelData);
      model.shared = true;

      const status = document.getElementById(`share-status-${model.id}`);
      status.textContent = '已成功分享到云端模型库';
      status.classList.add('visible');

      btn.innerHTML = '<span>已分享</span>';
      this._showToast(`模型 "${model.name}" 已分享到云端库`, 'success');
    } catch (e) {
      console.error('Share failed:', e);
      btn.disabled = false;
      btn.innerHTML = '<span>Share to Cloud</span>';
      this._showToast('分享失败，请重试', 'error');
    }
  }

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
            <div class="pk-comp-fill a" style="width:${dim.winnerPct}%"><span class="pk-comp-value">${dim.winner}/${dim.max}</span></div>
          </div>
          <div class="pk-comp-bar">
            <div class="pk-comp-fill b" style="width:${dim.runnerPct}%"><span class="pk-comp-value">${dim.runner}/${dim.max}</span></div>
          </div>
        </div>
      `;
    }

    this.pkSection.innerHTML = `
      <h2>Model PK - 对比评测</h2>
      <div class="pk-container">
        <div class="pk-card">
          ${pkData.winner.result.totalScore > pkData.runner.result.totalScore ? '<div class="pk-winner-badge">优胜者</div>' : ''}
          <div class="pk-model-name">${pkData.winner.name}</div>
          <div class="pk-model-score">${pkData.winner.result.totalScore}<span style="font-size:18px;color:#8b90a0">/100</span></div>
        </div>
        <div class="pk-card">
          ${pkData.runner.result.totalScore > pkData.winner.result.totalScore ? '<div class="pk-winner-badge">优胜者</div>' : ''}
          <div class="pk-model-name">${pkData.runner.name}</div>
          <div class="pk-model-score">${pkData.runner.result.totalScore}<span style="font-size:18px;color:#8b90a0">/100</span></div>
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

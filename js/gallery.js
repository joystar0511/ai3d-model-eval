/**
 * Gallery Page - Display all models from the library
 * Click a model card to view its full evaluation results
 * Admin can login to delete models
 */

import { CloudStorage } from './cloud.js';
import { ModelEvaluator } from './evaluator.js';
import { ModelViewer } from './viewer.js';

class GalleryApp {
  constructor() {
    this.galleryGrid = document.getElementById('galleryGrid');
    this.detailOverlay = document.getElementById('detailOverlay');
    this.detailPanel = document.getElementById('detailPanel');
    this.detailContent = document.getElementById('detailContent');
    this.detailCloseBtn = document.getElementById('detailCloseBtn');

    // Admin state
    this.isAdmin = sessionStorage.getItem('ai3d_admin') === 'true';
    this.currentModels = [];

    // Detail panel 3D viewer
    this.detailViewer = null;

    this._bindEvents();
    this._updateAdminUI();
    this._loadModels();
  }

  _bindEvents() {
    this.detailCloseBtn.addEventListener('click', () => this._closeDetail());
    this.detailOverlay.addEventListener('click', (e) => {
      if (e.target === this.detailOverlay) this._closeDetail();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeDetail();
    });

    // Admin login/logout button
    const adminBtn = document.getElementById('adminToggleBtn');
    if (adminBtn) {
      adminBtn.addEventListener('click', () => this._toggleAdmin());
    }
  }

  // === Admin ===

  _toggleAdmin() {
    if (this.isAdmin) {
      // Logout
      this.isAdmin = false;
      sessionStorage.removeItem('ai3d_admin');
      this._updateAdminUI();
      this._renderGallery(this.currentModels);
      this._showToast('已退出管理员模式');
    } else {
      // Login — prompt for password
      this._showLoginDialog();
    }
  }

  _showLoginDialog() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'admin-login-overlay';
    overlay.innerHTML = `
      <div class="admin-login-dialog">
        <div class="admin-login-title">🔐 管理员登录</div>
        <input type="password" class="admin-login-input" placeholder="请输入管理员密码" autocomplete="off" />
        <div class="admin-login-error" style="display:none;">密码错误，请重试</div>
        <div class="admin-login-actions">
          <button class="admin-login-cancel">取消</button>
          <button class="admin-login-confirm">确认</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.admin-login-input');
    const errorEl = overlay.querySelector('.admin-login-error');
    const cancelBtn = overlay.querySelector('.admin-login-cancel');
    const confirmBtn = overlay.querySelector('.admin-login-confirm');

    input.focus();

    const close = () => {
      document.body.removeChild(overlay);
    };

    cancelBtn.addEventListener('click', close);

    const tryLogin = () => {
      const password = input.value;
      const adminPwd = (typeof window !== 'undefined' && window.ADMIN_PASSWORD) ? window.ADMIN_PASSWORD : '';
      if (password && password === adminPwd) {
        this.isAdmin = true;
        sessionStorage.setItem('ai3d_admin', 'true');
        this._updateAdminUI();
        this._renderGallery(this.currentModels);
        close();
        this._showToast('管理员登录成功');
      } else {
        errorEl.style.display = 'block';
        input.value = '';
        input.focus();
      }
    };

    confirmBtn.addEventListener('click', tryLogin);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryLogin();
      if (e.key === 'Escape') close();
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  _updateAdminUI() {
    const btn = document.getElementById('adminToggleBtn');
    const badge = document.getElementById('adminBadge');
    if (btn) {
      btn.textContent = this.isAdmin ? '🚪 退出管理' : '🔐 管理';
      btn.classList.toggle('admin-active', this.isAdmin);
    }
    if (badge) {
      badge.style.display = this.isAdmin ? 'inline-flex' : 'none';
    }
  }

  _showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'gallery-toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
      background: rgba(30,30,46,0.95); color: #e2e8f0; padding: 12px 24px;
      border-radius: 10px; border: 1px solid var(--border); font-size: 14px;
      z-index: 10000; backdrop-filter: blur(10px); transition: opacity .3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    setTimeout(() => { document.body.removeChild(toast); }, 2400);
  }

  // === Data Loading ===

  _loadModels() {
    // 1. Render from localStorage cache immediately
    const cached = CloudStorage.getAllModels();
    this.currentModels = cached;
    this._renderGallery(cached);

    // 2. Async refresh from Firebase
    this._asyncRefreshGallery();
  }

  async _asyncRefreshGallery() {
    try {
      const models = await CloudStorage.getLibraryAsync();
      this.currentModels = models;
      this._renderGallery(models);
    } catch (e) {
      console.warn('Gallery async refresh failed:', e);
    }
  }

  // === Rendering ===

  _renderGallery(models) {
    this.galleryGrid.innerHTML = '';

    if (!models || models.length === 0) {
      this.galleryGrid.innerHTML = `
        <div class="library-empty-state">
          <span class="empty-icon">📭</span>
          <p>模型库暂无模型</p>
          <p class="empty-hint">评测完成后可将模型分享到此处</p>
        </div>
      `;
      return;
    }

    for (const m of models) {
      const card = this._createCard(m);
      this.galleryGrid.appendChild(card);
    }
  }

  _createCard(m) {
    const card = document.createElement('div');
    card.className = 'library-card gallery-card';

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

    // Download button (show if model has files — inline or in separate Firebase nodes)
    const hasFiles = m.modelFile || m.meta?.hasModelFile !== false;
    const downloadBtnHTML = hasFiles
      ? `<button class="gallery-download-btn" title="下载模型及贴图文件">⬇</button>`
      : '';

    // Delete button (admin only)
    const deleteBtnHTML = this.isAdmin
      ? `<button class="gallery-delete-btn" title="删除此模型">🗑</button>`
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
      ${deleteBtnHTML}
    `;

    card.addEventListener('click', (e) => {
      // Don't trigger detail when clicking buttons
      if (e.target.classList.contains('gallery-download-btn')) {
        e.stopPropagation();
        this._downloadModelZip(m, e.target);
        return;
      }
      if (e.target.classList.contains('gallery-delete-btn')) {
        e.stopPropagation();
        this._confirmDelete(m);
        return;
      }
      this._showDetail(m);
    });

    return card;
  }

  // === Delete ===

  _confirmDelete(model) {
    const overlay = document.createElement('div');
    overlay.className = 'admin-login-overlay';
    overlay.innerHTML = `
      <div class="admin-login-dialog" style="max-width:400px;">
        <div class="admin-login-title">🗑 确认删除</div>
        <div style="color:var(--text-dim);margin:12px 0 20px;line-height:1.6;">
          确定要删除模型 <strong style="color:var(--text);">${model.name || '未命名'}</strong> 吗？<br/>
          <span style="color:var(--text-dim);font-size:13px;">此操作不可撤销，模型将从云端和本地同时移除。</span>
        </div>
        <div class="admin-login-actions">
          <button class="admin-login-cancel">取消</button>
          <button class="admin-login-confirm" style="background:#ef4444;color:#fff;">删除</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('.admin-login-cancel');
    const confirmBtn = overlay.querySelector('.admin-login-confirm');

    const close = () => document.body.removeChild(overlay);

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.textContent = '删除中...';
      confirmBtn.disabled = true;
      try {
        await CloudStorage.deleteModel(model.id);
        close();
        // Refresh gallery
        this._loadModels();
        this._showToast(`已删除模型 "${model.name || '未命名'}"`);
      } catch (e) {
        console.error('Delete failed:', e);
        confirmBtn.textContent = '删除';
        confirmBtn.disabled = false;
        this._showToast('删除失败，请重试');
      }
    });
  }

  // === Download (ZIP) ===

  async _downloadModelZip(model, btn) {
    const m = model;
    let hasModelFile = !!m.modelFile;
    let texFiles = m.textureFiles || {};
    let texEntries = Object.entries(texFiles).filter(([k, f]) => f && f.data);

    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

    try {
      // If no local file data, fetch from Firebase on-demand
      if (!hasModelFile && texEntries.length === 0) {
        if (btn) btn.textContent = '🔄';
        console.log('[Download] Fetching files from Firebase for model:', m.id);
        const files = await CloudStorage.fetchModelFiles(m.id);

        if (files.modelFile) {
          m.modelFile = files.modelFile;
          hasModelFile = true;
        }
        if (files.textureFiles && Object.keys(files.textureFiles).length > 0) {
          m.textureFiles = files.textureFiles;
          texFiles = files.textureFiles;
          texEntries = Object.entries(texFiles).filter(([k, f]) => f && f.data);
        }
      }

      if (!hasModelFile && texEntries.length === 0) {
        alert('该模型没有可下载的文件数据\n\n可能原因：\n• 文件过大未成功上传\n• 模型为旧版数据（升级前分享）\n\n请尝试重新分享该模型。');
        return;
      }

      if (btn) btn.textContent = '📦';

      if (typeof JSZip === 'undefined') {
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

      // Trigger download
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this._showToast(`已打包下载 "${safeName}.zip"`);
    } catch (e) {
      console.error('ZIP download failed:', e);
      this._downloadFilesIndividually(m);
    } finally {
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
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
      this._triggerDownload(m.modelFile, fileName);
    }
    const texFiles = m.textureFiles || {};
    let delay = 300;
    for (const [key, texFile] of Object.entries(texFiles)) {
      if (texFile && texFile.data) {
        setTimeout(() => {
          this._triggerDownload(texFile.data, texFile.name || `${key}.png`);
        }, delay);
        delay += 300;
      }
    }
  }

  _triggerDownload(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // === Detail Panel ===

  async _showDetail(model) {
    const m = model;
    const ev = m.scores;

    // Dispose previous viewer if exists
    if (this.detailViewer) {
      this.detailViewer.dispose();
      this.detailViewer = null;
    }

    const thumbnailHTML = m.thumbnail
      ? `<img src="${m.thumbnail}" alt="${m.name}" />`
      : `<span class="lib-placeholder">🧊</span>`;

    // Character badge
    let typeBadgeHTML = '';
    if (ev?.isCharacterModel) {
      typeBadgeHTML = `<div class="detail-type-badge">
        <span>👤</span>
        <span>角色模型</span>
        <span class="detail-similarity">相似度 ${ev.similarity.toFixed(2)}%</span>
      </div>`;
    }

    // Score breakdown
    let breakdownHTML = '';
    if (ev?.breakdown) {
      for (const item of ev.breakdown) {
        const color = item.percentage >= 80 ? '#4ade80' : item.percentage >= 60 ? '#fbbf24' : '#f87171';
        const barWidth = Math.max(2, item.percentage);
        breakdownHTML += `
          <div class="detail-score-item">
            <span class="detail-item-name">${item.name}</span>
            <div class="detail-item-bar-outer">
              <div class="detail-item-bar-inner" style="width:${barWidth}%;background:${color}"></div>
            </div>
            <span class="detail-item-score" style="color:${color}">${item.score.toFixed(2)}/${item.max}</span>
          </div>
        `;
      }
    }

    // Analysis text
    let analysisHTML = '';
    if (ev?.analysis && ev.analysis.length > 0) {
      analysisHTML = '<div class="detail-analysis-section">';
      for (const a of ev.analysis) {
        analysisHTML += `
          <div class="detail-analysis-item">
            <div class="detail-analysis-title">${a.title}</div>
            <div class="detail-analysis-content">${a.content}</div>
          </div>
        `;
      }
      analysisHTML += '</div>';
    }

    // Recommendation tags (based on Excel criteria)
    let recTagsHTML = '';
    if (ev) {
      const tags = ModelEvaluator.generateUsageTags(ev.breakdown, m.meta);
      recTagsHTML = tags.map(t => `
        <span class="rec-tag rec-tag-${t.color}">
          ${t.label}
        </span>
      `).join('');
      if (tags.length === 0) {
        recTagsHTML = '<span class="rec-tag rec-tag-gray">暂无推荐用途</span>';
      }
    }

    // Meta info
    const metaParts = [];
    if (m.meta?.vertices) metaParts.push(`顶点: ${m.meta.vertices.toLocaleString()}`);
    if (m.meta?.faces) metaParts.push(`面: ${m.meta.faces.toLocaleString()}`);
    if (m.meta?.textureCount !== undefined) metaParts.push(`贴图: ${m.meta.textureCount}`);
    if (m.meta?.fileName) metaParts.push(`文件: ${m.meta.fileName}`);
    if (m.meta?.fileSize) metaParts.push(`大小: ${(m.meta.fileSize / 1024 / 1024).toFixed(2)} MB`);
    if (m.sharedAt) metaParts.push(`分享时间: ${new Date(m.sharedAt).toLocaleString('zh-CN')}`);
    if (m.sharedBy) metaParts.push(`分享者: ${m.sharedBy}`);

    const metaHTML = metaParts.length > 0
      ? `<div class="detail-meta-list">${metaParts.map(p => `<div class="detail-meta-item">${p}</div>`).join('')}</div>`
      : '';

    // Admin delete button in detail
    const adminDeleteHTML = this.isAdmin
      ? `<button class="detail-delete-btn" id="detailDeleteBtn">🗑 删除此模型</button>`
      : '';

    this.detailContent.innerHTML = `
      <div class="detail-header">
        <div class="detail-thumbnail" id="detailViewerContainer">
          <div class="detail-viewer-loading" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;flex-direction:column;gap:8px;">
            <div class="spinner" style="margin:0 auto;"></div>
            <p style="font-size:12px;color:var(--text-dim);">加载3D预览中...</p>
          </div>
        </div>
        <div class="detail-title-area">
          <h2 class="detail-model-name">${m.name || '未命名'}</h2>
          ${typeBadgeHTML}
          ${ev ? `<div class="detail-total-score">
            <span class="detail-score-value">${ev.totalScore.toFixed(2)}</span>
            <span class="detail-score-max">/ ${ev.maxScore}</span>
            <span class="score-grade ${ev.gradeClass}">${ev.grade}</span>
          </div>` : ''}
        </div>
      </div>

      <!-- Per-model display mode buttons -->
      <div class="card-viewer-modes" style="margin-bottom:16px;">
        <button class="card-mode-btn active" data-mode="gray" title="灰模显示">
          <span>🔘</span> 灰模
        </button>
        <button class="card-mode-btn" data-mode="wireframe" title="线框显示">
          <span>🔷</span> 线框
        </button>
        <button class="card-mode-btn" data-mode="color" title="颜色贴图">
          <span>🎨</span> 颜色
        </button>
        <button class="card-mode-btn" data-mode="material" title="材质效果">
          <span>💡</span> 材质
        </button>
      </div>

      ${recTagsHTML ? `<div class="detail-rec-tags"><div class="rec-label">模型用途推荐</div><div class="rec-tags">${recTagsHTML}</div></div>` : ''}

      ${ev?.breakdown ? `<div class="detail-breakdown"><h3>评分明细</h3>${breakdownHTML}</div>` : ''}

      ${analysisHTML}

      ${metaHTML ? `<div class="detail-meta-section"><h3>模型信息</h3>${metaHTML}</div>` : ''}

      ${m.notes ? `<div class="detail-notes-section"><h3>评论</h3><div class="detail-notes-text">${m.notes}</div></div>` : ''}

      ${adminDeleteHTML}
    `;

    // Bind admin delete button in detail
    if (this.isAdmin) {
      const detailDelBtn = document.getElementById('detailDeleteBtn');
      if (detailDelBtn) {
        detailDelBtn.addEventListener('click', () => {
          this._closeDetail();
          this._confirmDelete(m);
        });
      }
    }

    // Bind mode buttons
    this.detailContent.querySelectorAll('.card-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this.detailContent.querySelectorAll('.card-mode-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === mode);
        });
        if (this.detailViewer) {
          this.detailViewer.setMode(mode);
        }
      });
    });

    this.detailOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';

    // Asynchronously load 3D viewer
    await this._loadDetailViewer(m);
  }

  /** Load 3D model into the detail panel viewer */
  async _loadDetailViewer(m) {
    const container = document.getElementById('detailViewerContainer');
    if (!container) return;

    try {
      // Ensure we have the model file data
      let hasModelFile = !!m.modelFile;
      let texFiles = m.textureFiles || {};
      let texEntries = Object.entries(texFiles).filter(([k, f]) => f && f.data);

      // Fetch from Firebase if not available locally
      if (!hasModelFile && texEntries.length === 0) {
        const files = await CloudStorage.fetchModelFiles(m.id);
        if (files.modelFile) {
          m.modelFile = files.modelFile;
          hasModelFile = true;
        }
        if (files.textureFiles) {
          m.textureFiles = files.textureFiles;
          texFiles = files.textureFiles;
          texEntries = Object.entries(texFiles).filter(([k, f]) => f && f.data);
        }
      }

      if (!hasModelFile) {
        // Fall back to thumbnail
        container.innerHTML = m.thumbnail
          ? `<img src="${m.thumbnail}" alt="${m.name}" />`
          : `<span class="lib-placeholder">🧊</span>`;
        return;
      }

      // Convert data URL to File object
      const modelFile = this._dataUrlToFile(m.modelFile, m.meta?.fileName || 'model.glb');

      // Create viewer
      this.detailViewer = new ModelViewer(container, modelFile);

      // Wait for model to load
      await new Promise(resolve => {
        let attempts = 0;
        const check = () => {
          const geoData = this.detailViewer.getGeometryData();
          if (geoData || attempts >= 50) {
            resolve();
          } else {
            attempts++;
            setTimeout(check, 200);
          }
        };
        check();
      });

      // Load textures if available
      if (texEntries.length > 0) {
        const textureFiles = {};
        for (const [key, texFile] of texEntries) {
          textureFiles[key] = this._dataUrlToFile(texFile.data, texFile.name || `${key}.png`);
        }
        await this.detailViewer.setTextures(textureFiles);
      }

      // Apply default mode (gray)
      this.detailViewer.setMode('gray');

    } catch (e) {
      console.error('Detail viewer load failed:', e);
      container.innerHTML = m.thumbnail
        ? `<img src="${m.thumbnail}" alt="${m.name}" />`
        : `<span class="lib-placeholder">🧊</span>`;
    }
  }

  /** Convert a data URL to a File object */
  _dataUrlToFile(dataUrl, fileName) {
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
    const blob = new Blob([bytes], { type: mime });
    return new File([blob], fileName, { type: mime });
  }

  _closeDetail() {
    // Dispose 3D viewer if exists
    if (this.detailViewer) {
      this.detailViewer.dispose();
      this.detailViewer = null;
    }
    this.detailOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new GalleryApp();
});

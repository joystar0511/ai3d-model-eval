/**
 * Gallery Page - Display all models from the library
 * Click a model card to view its full evaluation results
 * Admin can login to delete models
 */

import { CloudStorage } from './cloud.js';

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

    // Download button (always visible if files exist)
    const downloadBtnHTML = m.modelFile
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
        this._downloadModel(m);
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

  // === Download ===

  _downloadModel(model) {
    const m = model;
    const hasModelFile = !!m.modelFile;
    const texFiles = m.textureFiles || {};
    const texCount = Object.values(texFiles).filter(f => f && f.data).length;

    if (!hasModelFile && texCount === 0) {
      alert('该模型没有可下载的文件数据');
      return;
    }

    // Download model file
    if (hasModelFile) {
      const fileName = m.meta?.fileName || `${m.name || 'model'}.glb`;
      this._triggerDownload(m.modelFile, fileName);
    }

    // Download texture files with slight delay to avoid browser blocking
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

  _showDetail(model) {
    const m = model;
    const ev = m.scores;

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

    // Recommendation tags
    let recTagsHTML = '';
    if (ev) {
      const tags = [];
      if (ev.unmergedPairs > 0) {
        tags.push({ label: '不可打印', color: 'purple', detail: `${ev.unmergedPairs} 组未合并点` });
      } else {
        tags.push({ label: '可打印', color: 'green', detail: '无未合并点' });
      }
      if (ev.isCharacterModel) {
        tags.push({ label: '角色模型', color: 'gold', detail: `相似度 ${ev.similarity.toFixed(1)}%` });
      }
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
        <div class="detail-thumbnail">${thumbnailHTML}</div>
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

      ${recTagsHTML ? `<div class="detail-rec-tags"><div class="rec-label">模型用途推荐</div><div class="rec-tags">${recTagsHTML}</div></div>` : ''}

      ${ev?.breakdown ? `<div class="detail-breakdown"><h3>评分明细</h3>${breakdownHTML}</div>` : ''}

      ${analysisHTML}

      ${metaHTML ? `<div class="detail-meta-section"><h3>模型信息</h3>${metaHTML}</div>` : ''}

      ${m.notes ? `<div class="detail-notes-section"><h3>备注</h3><div class="detail-notes-text">${m.notes}</div></div>` : ''}

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

    this.detailOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  _closeDetail() {
    this.detailOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new GalleryApp();
});

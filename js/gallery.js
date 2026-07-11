/**
 * Gallery Page - Display all models from the library
 * Click a model card to view its full evaluation results
 */

import { CloudStorage } from './cloud.js';

class GalleryApp {
  constructor() {
    this.galleryGrid = document.getElementById('galleryGrid');
    this.detailOverlay = document.getElementById('detailOverlay');
    this.detailPanel = document.getElementById('detailPanel');
    this.detailContent = document.getElementById('detailContent');
    this.detailCloseBtn = document.getElementById('detailCloseBtn');

    this._bindEvents();
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
  }

  _loadModels() {
    const allModels = CloudStorage.getAllModels();
    this._renderGallery(allModels);
  }

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

      card.innerHTML = `
        <div class="lib-preview">${thumbnailHTML}</div>
        <div class="lib-info">
          <div class="lib-name">${m.name || '未命名'}</div>
          ${scoreHTML}
          ${notesHTML}
          ${metaHTML}
        </div>
      `;

      card.addEventListener('click', () => this._showDetail(m));
      this.galleryGrid.appendChild(card);
    }
  }

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
    `;

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

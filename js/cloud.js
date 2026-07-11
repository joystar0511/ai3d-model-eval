/**
 * CloudStorage - Model sharing & library backend
 *
 * Default implementation uses localStorage for demo purposes.
 * To enable real cross-user sharing, configure a backend endpoint:
 *   window.CLOUD_API_URL = 'https://your-api.com/models'
 *
 * Supported backends:
 *   - localStorage (default, single-user demo)
 *   - REST API (set CLOUD_API_URL)
 *   - Firebase (see README for setup instructions)
 */

const STORAGE_KEY = 'ai3d_model_library';
const SHARED_KEY = 'ai3d_shared_models';

class CloudStorage {

  /**
   * Share a model to the cloud library
   * @param {Object} modelData - { name, scores, notes, thumbnail, meta }
   * @returns {Promise<Object>} shared model record
   */
  static async shareModel(modelData) {
    const record = {
      id: this._genId(),
      name: modelData.name,
      scores: modelData.scores,
      notes: modelData.notes || '',
      thumbnail: modelData.thumbnail || null,
      meta: {
        vertices: modelData.meta?.vertices || 0,
        faces: modelData.meta?.faces || 0,
        hasTextures: modelData.meta?.hasTextures || false,
        textureCount: modelData.meta?.textureCount || 0,
        fileName: modelData.meta?.fileName || '',
        fileSize: modelData.meta?.fileSize || 0,
        isCharacterModel: modelData.meta?.isCharacterModel || false,
        similarity: modelData.meta?.similarity || 0,
      },
      sharedAt: new Date().toISOString(),
      sharedBy: this._getUserTag(),
    };

    // Try cloud API if configured
    if (window.CLOUD_API_URL) {
      try {
        const resp = await fetch(window.CLOUD_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (resp.ok) {
          const saved = await resp.json();
          return saved;
        }
      } catch (e) {
        console.warn('Cloud API failed, falling back to local storage:', e);
      }
    }

    // Fallback: localStorage
    const shared = this._getSharedList();
    shared.unshift(record);
    // Keep max 200 records
    if (shared.length > 200) shared.length = 200;
    this._saveSharedList(shared);

    return record;
  }

  /**
   * Get all shared models from the library
   * @returns {Promise<Array>} list of shared models
   */
  static async getLibrary() {
    // Try cloud API if configured
    if (window.CLOUD_API_URL) {
      try {
        const resp = await fetch(window.CLOUD_API_URL);
        if (resp.ok) {
          return await resp.json();
        }
      } catch (e) {
        console.warn('Cloud API failed, falling back to local storage:', e);
      }
    }

    // Fallback: localStorage
    return this._getSharedList();
  }

  /**
   * Get all shared models from the library (synchronous for inline display)
   * @returns {Array} list of shared models
   */
  static getAllModels() {
    return this._getSharedList();
  }

  /**
   * Delete a shared model (only by owner)
   * @param {string} id - model ID
   * @returns {Promise<boolean>}
   */
  static async deleteModel(id) {
    if (window.CLOUD_API_URL) {
      try {
        const resp = await fetch(`${window.CLOUD_API_URL}/${id}`, { method: 'DELETE' });
        return resp.ok;
      } catch (e) {
        console.warn('Cloud API delete failed:', e);
      }
    }

    const shared = this._getSharedList();
    const filtered = shared.filter(m => m.id !== id);
    this._saveSharedList(filtered);
    return true;
  }

  // === localStorage helpers ===

  static _getSharedList() {
    try {
      return JSON.parse(localStorage.getItem(SHARED_KEY) || '[]');
    } catch {
      return [];
    }
  }

  static _saveSharedList(list) {
    try {
      localStorage.setItem(SHARED_KEY, JSON.stringify(list));
    } catch (e) {
      // Storage might be full (thumbnail too large)
      // Try saving without thumbnails
      const lite = list.map(m => ({ ...m, thumbnail: null }));
      localStorage.setItem(SHARED_KEY, JSON.stringify(lite));
    }
  }

  static _genId() {
    return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  static _getUserTag() {
    let tag = localStorage.getItem('ai3d_user_tag');
    if (!tag) {
      tag = '用户' + Math.random().toString(36).slice(2, 6).toUpperCase();
      localStorage.setItem('ai3d_user_tag', tag);
    }
    return tag;
  }
}

export { CloudStorage };

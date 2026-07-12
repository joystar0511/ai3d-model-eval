/**
 * CloudStorage - Model sharing & library backend
 *
 * Primary backend: Firebase Realtime Database (REST API)
 * Cache/fallback:  localStorage
 *
 * To configure Firebase, edit js/firebase-config.js
 */

const STORAGE_KEY = 'ai3d_model_library';
const SHARED_KEY = 'ai3d_shared_models';

class CloudStorage {

  /**
   * Get the Firebase DB URL from config
   */
  static _getDbUrl() {
    return (typeof window !== 'undefined' && window.FIREBASE_DB_URL) ? window.FIREBASE_DB_URL : '';
  }

  /**
   * Check if Firebase is configured
   */
  static isFirebaseConfigured() {
    return !!this._getDbUrl();
  }

  /**
   * Share a model to the cloud library
   * @param {Object} modelData - { name, scores, notes, thumbnail, meta, modelFile, textureFiles }
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
        fileType: modelData.meta?.fileType || '',
        isCharacterModel: modelData.meta?.isCharacterModel || false,
        similarity: modelData.meta?.similarity || 0,
      },
      modelFile: modelData.modelFile || null,
      textureFiles: modelData.textureFiles || {},
      sharedAt: new Date().toISOString(),
      sharedBy: this._getUserTag(),
    };

    // Save to localStorage first (immediate local availability)
    const shared = this._getSharedList();
    shared.unshift(record);
    if (shared.length > 200) shared.length = 200;
    this._saveSharedList(shared);

    // Try Firebase
    const dbUrl = this._getDbUrl();
    if (dbUrl) {
      try {
        // Calculate total payload size
        const payloadStr = JSON.stringify(record);
        const sizeMB = new Blob([payloadStr]).size / 1024 / 1024;

        if (sizeMB > 8) {
          // Payload too large — strip file data, keep metadata + thumbnail
          const liteRecord = { ...record, modelFile: null, textureFiles: {} };
          const resp = await fetch(`${dbUrl}/models/${record.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(liteRecord),
          });
          if (resp.ok) {
            console.log('[Firebase] Model shared (metadata only, file data too large)');
            return record;
          }
        } else {
          const resp = await fetch(`${dbUrl}/models/${record.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: payloadStr,
          });
          if (resp.ok) {
            console.log('[Firebase] Model shared successfully');
            return record;
          }
        }
      } catch (e) {
        console.warn('[Firebase] Share failed, model saved locally only:', e);
      }
    }

    return record;
  }

  /**
   * Get all shared models from Firebase (async)
   * @returns {Promise<Array>} list of shared models
   */
  static async getLibraryAsync() {
    const dbUrl = this._getDbUrl();
    if (!dbUrl) {
      return this._getSharedList();
    }

    try {
      const resp = await fetch(`${dbUrl}/models.json?orderBy="sharedAt"&limitToLast=200`);
      if (resp.ok) {
        const data = await resp.json();
        if (!data) return [];

        // Firebase returns an object keyed by model ID
        let models = Object.values(data);

        // Sort by sharedAt descending (newest first)
        models.sort((a, b) => {
          const aTime = new Date(a.sharedAt || 0).getTime();
          const bTime = new Date(b.sharedAt || 0).getTime();
          return bTime - aTime;
        });

        // Update localStorage cache
        this._saveSharedList(models);

        return models;
      }
    } catch (e) {
      console.warn('[Firebase] Fetch failed, using local cache:', e);
    }

    return this._getSharedList();
  }

  /**
   * Get all shared models (synchronous, from localStorage cache)
   * Call getLibraryAsync() to refresh from Firebase
   * @returns {Array} list of shared models
   */
  static getAllModels() {
    return this._getSharedList();
  }

  /**
   * Get all shared models from the library (legacy async method)
   * @returns {Promise<Array>}
   */
  static async getLibrary() {
    return this.getLibraryAsync();
  }

  /**
   * Delete a shared model (only by owner)
   * @param {string} id - model ID
   * @returns {Promise<boolean>}
   */
  static async deleteModel(id) {
    const dbUrl = this._getDbUrl();
    if (dbUrl) {
      try {
        const resp = await fetch(`${dbUrl}/models/${id}.json`, { method: 'DELETE' });
        if (!resp.ok) {
          console.warn('[Firebase] Delete failed');
        }
      } catch (e) {
        console.warn('[Firebase] Delete failed:', e);
      }
    }

    // Also remove from localStorage
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
      // Storage might be full — progressively strip large data
      // Level 1: strip texture files data
      try {
        const lite1 = list.map(m => ({ ...m, textureFiles: {} }));
        localStorage.setItem(SHARED_KEY, JSON.stringify(lite1));
        console.warn('Storage full: saved without texture file data');
        return;
      } catch (e2) {}
      // Level 2: also strip model file data
      try {
        const lite2 = list.map(m => ({ ...m, modelFile: null, textureFiles: {} }));
        localStorage.setItem(SHARED_KEY, JSON.stringify(lite2));
        console.warn('Storage full: saved without model/texture file data');
        return;
      } catch (e3) {}
      // Level 3: also strip thumbnails
      try {
        const lite3 = list.map(m => ({ ...m, modelFile: null, textureFiles: {}, thumbnail: null }));
        localStorage.setItem(SHARED_KEY, JSON.stringify(lite3));
        console.warn('Storage full: saved without file data and thumbnails');
      } catch (e4) {
        console.error('Storage completely full, cannot save');
      }
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

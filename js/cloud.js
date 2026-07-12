/**
 * CloudStorage - Model sharing & library backend
 *
 * Primary backend: Firebase Realtime Database (REST API)
 * Cache/fallback:  localStorage
 *
 * Architecture (v2 — split storage):
 *   models/{id}         → metadata only (name, scores, thumbnail, meta)
 *   modelFiles/{id}     → model file (base64)
 *   textureFiles/{id}/{key} → texture file (base64)
 *
 * Files are fetched on-demand during download, not during gallery load.
 * This keeps gallery loading fast and avoids localStorage overflow.
 *
 * To configure Firebase, edit js/firebase-config.js
 */

const STORAGE_KEY = 'ai3d_model_library';
const SHARED_KEY = 'ai3d_shared_models';

// Per-file upload size limit (base64 encoded, ~16MB raw file)
const MAX_FILE_SIZE_MB = 24;

class CloudStorage {

  /**
   * Get the Firebase DB URL from config
   */
  static _getDbUrl() {
    let url = (typeof window !== 'undefined' && window.FIREBASE_DB_URL) ? window.FIREBASE_DB_URL : '';
    // Strip trailing slash to avoid double-slash in URL construction
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  /**
   * Check if Firebase is configured
   */
  static isFirebaseConfigured() {
    return !!this._getDbUrl();
  }

  /**
   * Share a model to the cloud library
   * Uploads metadata and file data as SEPARATE Firebase nodes
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
        hasModelFile: !!modelData.modelFile,
        hasTextureFiles: !!(modelData.textureFiles && Object.keys(modelData.textureFiles).filter(k => modelData.textureFiles[k]).length > 0),
      },
      sharedAt: new Date().toISOString(),
      sharedBy: this._getUserTag(),
    };

    const dbUrl = this._getDbUrl();

    if (dbUrl) {
      let metadataUploaded = false;
      let fileUploadErrors = [];

      try {
        // 1. Upload metadata (small payload — always succeeds)
        const metaResp = await fetch(`${dbUrl}/models/${record.id}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (metaResp.ok) {
          metadataUploaded = true;
          console.log('[Firebase] Metadata uploaded');
        } else {
          throw new Error(`Metadata upload failed: ${metaResp.status}`);
        }

        // 2. Upload model file separately (if exists)
        if (modelData.modelFile) {
          const fileSizeMB = new Blob([JSON.stringify(modelData.modelFile)]).size / 1024 / 1024;
          if (fileSizeMB > MAX_FILE_SIZE_MB) {
            console.warn(`[Firebase] Model file too large (${fileSizeMB.toFixed(1)}MB), skipping file upload`);
            fileUploadErrors.push('model_file_too_large');
          } else {
            try {
              const fileResp = await fetch(`${dbUrl}/modelFiles/${record.id}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modelData.modelFile),
              });
              if (fileResp.ok) {
                console.log('[Firebase] Model file uploaded');
              } else {
                console.warn(`[Firebase] Model file upload failed: ${fileResp.status}`);
                fileUploadErrors.push('model_file_failed');
              }
            } catch (e) {
              console.warn('[Firebase] Model file upload error:', e);
              fileUploadErrors.push('model_file_error');
            }
          }
        }

        // 3. Upload texture files separately (each as its own node)
        if (modelData.textureFiles) {
          for (const [key, texFile] of Object.entries(modelData.textureFiles)) {
            if (texFile && texFile.data) {
              const texSizeMB = new Blob([JSON.stringify(texFile)]).size / 1024 / 1024;
              if (texSizeMB > MAX_FILE_SIZE_MB) {
                console.warn(`[Firebase] Texture ${key} too large (${texSizeMB.toFixed(1)}MB), skipping`);
                fileUploadErrors.push(`texture_${key}_too_large`);
                continue;
              }
              try {
                const texResp = await fetch(`${dbUrl}/textureFiles/${record.id}/${key}.json`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(texFile),
                });
                if (texResp.ok) {
                  console.log(`[Firebase] Texture ${key} uploaded`);
                } else {
                  console.warn(`[Firebase] Texture ${key} upload failed: ${texResp.status}`);
                  fileUploadErrors.push(`texture_${key}_failed`);
                }
              } catch (e) {
                console.warn(`[Firebase] Texture ${key} upload error:`, e);
                fileUploadErrors.push(`texture_${key}_error`);
              }
            }
          }
        }

        // If file uploads had errors, update metadata to reflect what's available
        if (fileUploadErrors.length > 0) {
          // Still keep hasModelFile/hasTextureFiles as originally set —
          // download function will try to fetch and handle failure gracefully
          console.warn('[Firebase] Some file uploads failed:', fileUploadErrors);
        }

        console.log('[Firebase] Model shared successfully (split upload)');
      } catch (e) {
        console.warn('[Firebase] Share failed, model saved locally only:', e);
      }
    }

    // Save metadata to localStorage (NO file data — prevents overflow)
    const shared = this._getSharedList();
    shared.unshift(record);
    if (shared.length > 200) shared.length = 200;
    this._saveSharedList(shared);

    return record;
  }

  /**
   * Fetch model file and texture files from Firebase (on-demand)
   * Called when user clicks download button
   * @param {string} modelId - model ID
   * @returns {Promise<{modelFile: Object|null, textureFiles: Object}>}
   */
  static async fetchModelFiles(modelId) {
    const dbUrl = this._getDbUrl();
    if (!dbUrl) return { modelFile: null, textureFiles: {} };

    try {
      // Fetch model file and texture files in parallel
      const [modelFileResp, texFilesResp] = await Promise.all([
        fetch(`${dbUrl}/modelFiles/${modelId}.json`),
        fetch(`${dbUrl}/textureFiles/${modelId}.json`),
      ]);

      let modelFile = null;
      let textureFiles = {};

      if (modelFileResp.ok) {
        modelFile = await modelFileResp.json();
      }

      if (texFilesResp.ok) {
        const texData = await texFilesResp.json();
        if (texData) {
          textureFiles = texData;
        }
      }

      return { modelFile, textureFiles };
    } catch (e) {
      console.warn('[Firebase] Fetch files failed:', e);
      return { modelFile: null, textureFiles: {} };
    }
  }

  /**
   * Get all shared models from Firebase (async)
   * Returns metadata only — file data is fetched on-demand via fetchModelFiles()
   * @returns {Promise<Array>} list of shared models
   */
  static async getLibraryAsync() {
    const dbUrl = this._getDbUrl();
    if (!dbUrl) {
      return this._getSharedList();
    }

    try {
      const resp = await fetch(`${dbUrl}/models.json`);
      if (resp.ok) {
        const data = await resp.json();
        if (!data) return [];

        let models = Object.values(data);

        // Sort by sharedAt descending (newest first)
        models.sort((a, b) => {
          const aTime = new Date(a.sharedAt || 0).getTime();
          const bTime = new Date(b.sharedAt || 0).getTime();
          return bTime - aTime;
        });

        // Cache metadata only in localStorage (strip any inline file data)
        const cacheModels = models.map(m => ({
          ...m,
          modelFile: null,
          textureFiles: {},
        }));
        this._saveSharedList(cacheModels);

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
   * Delete a shared model from all Firebase nodes + localStorage
   * @param {string} id - model ID
   * @returns {Promise<boolean>}
   */
  static async deleteModel(id) {
    const dbUrl = this._getDbUrl();
    if (dbUrl) {
      try {
        // Delete from all three nodes in parallel
        await Promise.all([
          fetch(`${dbUrl}/models/${id}.json`, { method: 'DELETE' }),
          fetch(`${dbUrl}/modelFiles/${id}.json`, { method: 'DELETE' }),
          fetch(`${dbUrl}/textureFiles/${id}.json`, { method: 'DELETE' }),
        ]);
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
      // Level 1: strip thumbnails
      try {
        const lite1 = list.map(m => ({ ...m, thumbnail: null }));
        localStorage.setItem(SHARED_KEY, JSON.stringify(lite1));
        console.warn('Storage full: saved without thumbnails');
        return;
      } catch (e2) {}
      // Level 2: strip notes (keep only essential metadata)
      try {
        const lite2 = list.map(m => ({ ...m, thumbnail: null, notes: '' }));
        localStorage.setItem(SHARED_KEY, JSON.stringify(lite2));
        console.warn('Storage full: saved without thumbnails and notes');
        return;
      } catch (e3) {}
      // Level 3: keep only the 50 most recent models with minimal data
      try {
        const lite3 = list.slice(0, 50).map(m => ({
          id: m.id,
          name: m.name,
          scores: m.scores,
          meta: m.meta,
          sharedAt: m.sharedAt,
        }));
        localStorage.setItem(SHARED_KEY, JSON.stringify(lite3));
        console.warn('Storage full: saved minimal data for 50 most recent models');
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

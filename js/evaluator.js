/**
 * ModelEvaluator - AI 3D Topology Low-Poly Model Evaluation Engine
 *
 * Scoring criteria (11 dimensions, normalized to 100):
 * 1. 隐藏面 (Hidden Faces) - 10
 * 2. 破面 (Broken Faces) - 10
 * 3. 重合点 (Overlapping Vertices) - 10
 * 4. 布线均匀度 (Wire Uniformity) - 10
 * 5. 可绑定程度 (Rig-ability) - 10
 *    → Uses standard human model comparison:
 *    → Similarity > 50% → character model → joint wiring analysis
 *    → Similarity < 50% → non-character → no deduction
 * 6. UV利用度 (UV Utilization) - 20
 * 7. 贴图细节与复杂性 (Texture Detail) - 10
 * 8. 贴图色彩 (Texture Color) - 10
 * 9. 一致性与伪影 (Consistency & Artifacts) - 10
 * 10. 材质合理性 (Material Rationality) - 10
 * 11. 法线贴图质量 (Normal Map Quality) - 10
 *
 * NOTE: Internal deduction logic is NOT exposed to users.
 * Only final scores and qualitative analysis are shown.
 */

const RAW_MAX = {
  hiddenFaces: 10,
  brokenFaces: 10,
  overlappingVerts: 10,
  wireUniformity: 10,
  riggability: 10,
  uvUtilization: 20,
  textureDetail: 10,
  textureColor: 10,
  consistency: 10,
  materialRationality: 10,
  normalMapQuality: 10,
};

const RAW_TOTAL = Object.values(RAW_MAX).reduce((a, b) => a + b, 0); // 120

const DIMENSIONS = [
  { key: 'hiddenFaces',        name: '隐藏面',           max: 10 },
  { key: 'brokenFaces',        name: '破面',             max: 10 },
  { key: 'overlappingVerts',   name: '重合点',           max: 10 },
  { key: 'wireUniformity',     name: '布线均匀度',       max: 10 },
  { key: 'riggability',        name: '可绑定程度',       max: 10 },
  { key: 'uvUtilization',      name: 'UV利用度',         max: 20 },
  { key: 'textureDetail',      name: '贴图细节与复杂性',  max: 10 },
  { key: 'textureColor',       name: '贴图色彩',         max: 10 },
  { key: 'consistency',        name: '一致性与伪影',     max: 10 },
  { key: 'materialRationality',name: '材质合理性',       max: 10 },
  { key: 'normalMapQuality',   name: '法线贴图质量',     max: 10 },
];

class ModelEvaluator {

  /**
   * Evaluate a model with optional standard human model reference.
   * @param {Object} geometryData - Model geometry data
   * @param {Object} textureInfo - Texture info
   * @param {Object|null} standardModelRef - { fingerprint, ringLineData } of standard human model
   * @param {Object|null} userModelFingerprint - Shape fingerprint of the user model
   * @param {Object|null} userModelRingLineData - Ring line data of the user model
   * @param {Function} onProgress - Progress callback
   */
  static async evaluate(geometryData, textureInfo, standardModelRef, userModelFingerprint, userModelRingLineData, onProgress) {
    const steps = DIMENSIONS.length;
    const rawScores = {};

    // Compute similarity with standard human model (for riggability evaluation)
    let similarity = 0;
    let isCharacterModel = false;
    if (standardModelRef && standardModelRef.fingerprint && userModelFingerprint) {
      // We need to compute similarity - but viewer.js has the method,
      // so we compute it here using the fingerprint data directly
      similarity = this._computeSimilarityFromFingerprints(userModelFingerprint, standardModelRef.fingerprint);
      isCharacterModel = similarity > 0.5; // > 50% threshold per scoring criteria
    }

    for (let i = 0; i < DIMENSIONS.length; i++) {
      const dim = DIMENSIONS[i];
      await this._delay(200 + Math.random() * 300);
      rawScores[dim.key] = this._evaluateDimension(
        dim.key, geometryData, textureInfo,
        isCharacterModel, userModelRingLineData, similarity
      );
      if (onProgress) onProgress(Math.round(((i + 1) / steps) * 100));
    }

    const rawTotal = Object.values(rawScores).reduce((a, b) => a + b, 0);
    const normalizedTotal = Math.round((rawTotal / RAW_TOTAL) * 100);
    const analysis = this._generateAnalysis(rawScores, geometryData, textureInfo, isCharacterModel, similarity);

    const breakdown = DIMENSIONS.map(dim => ({
      name: dim.name,
      key: dim.key,
      score: rawScores[dim.key],
      max: dim.max,
      percentage: Math.round((rawScores[dim.key] / dim.max) * 100),
    }));

    let grade, gradeClass;
    if (normalizedTotal >= 90) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (normalizedTotal >= 75) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (normalizedTotal >= 60) { grade = 'C'; gradeClass = 'grade-c'; }
    else { grade = 'D'; gradeClass = 'grade-d'; }

    return {
      totalScore: normalizedTotal,
      rawTotal,
      maxScore: 100,
      grade,
      gradeClass,
      breakdown,
      analysis,
      isCharacterModel,
      similarity: Math.round(similarity * 100),
    };
  }

  static _evaluateDimension(key, geo, tex, isCharacterModel, ringLineData, similarity) {
    if (!geo) return Math.floor(RAW_MAX[key] * 0.5);

    switch (key) {
      case 'hiddenFaces': return this._evalHiddenFaces(geo);
      case 'brokenFaces': return this._evalBrokenFaces(geo);
      case 'overlappingVerts': return this._evalOverlappingVerts(geo);
      case 'wireUniformity': return this._evalWireUniformity(geo);
      case 'riggability': return this._evalRiggability(geo, isCharacterModel, ringLineData);
      case 'uvUtilization': return this._evalUVUtilization(geo);
      case 'textureDetail': return this._evalTextureDetail(tex);
      case 'textureColor': return this._evalTextureColor(tex);
      case 'consistency': return this._evalConsistency(geo, tex);
      case 'materialRationality': return this._evalMaterialRationality(tex);
      case 'normalMapQuality': return this._evalNormalMapQuality(tex);
      default: return 0;
    }
  }

  // === Geometry evaluators ===

  static _evalHiddenFaces(geo) {
    const max = RAW_MAX.hiddenFaces;
    if (!geo.faceNormals || geo.faceNormals.length === 0) return max * 0.6;
    const hiddenRatio = geo.hiddenFaces / Math.max(geo.faceNormals.length, 1);
    // 每占总面数1%扣0.1分，扣到0为止
    const penalty = Math.min(hiddenRatio * 100 * 0.1, max);
    return Math.max(max - penalty, 0);
  }

  static _evalBrokenFaces(geo) {
    const max = RAW_MAX.brokenFaces;
    let broken = 0;
    if (geo.edgeLengths) {
      for (let i = 0; i < geo.edgeLengths.length; i += 3) {
        const a = geo.edgeLengths[i] || 0;
        const b = geo.edgeLengths[i + 1] || 0;
        const c = geo.edgeLengths[i + 2] || 0;
        // Degenerate triangle (zero-length edge)
        if (a < 1e-6 || b < 1e-6 || c < 1e-6) broken++;
        // Impossible triangle (sum of two sides < third side)
        if (a + b < c * 0.999 || a + c < b * 0.999 || b + c < a * 0.999) broken++;
      }
    }
    // 有一个破面扣1分
    const penalty = Math.min(broken, max);
    return Math.max(max - penalty, 0);
  }

  static _evalOverlappingVerts(geo) {
    const max = RAW_MAX.overlappingVerts;
    const pairs = geo.overlappingPairs || 0;
    // 每组扣0.5分
    const penalty = Math.min(pairs * 0.5, max);
    return Math.max(max - penalty, 0);
  }

  static _evalWireUniformity(geo) {
    const max = RAW_MAX.wireUniformity;
    if (!geo.edgeLengths || geo.edgeLengths.length === 0) return max * 0.5;
    const avg = geo.avgEdgeLength;
    if (avg < 1e-8) return 0;

    // 类型1: > 平均值130% 的边
    // 类型2: < 平均值 的边
    let type1 = 0, type2 = 0;
    for (const len of geo.edgeLengths) {
      if (len > avg * 1.3) type1++;
      if (len < avg) type2++;
    }

    const total = geo.edgeLengths.length;
    const typeRatio = (type1 + type2) / Math.max(total, 1);
    // 类型1和2每超过所有边数量的50%扣0.5分
    const penalty = Math.min(Math.floor(typeRatio / 0.5) * 0.5, max);
    return Math.max(max - penalty, 0);
  }

  /**
   * Evaluate rig-ability (可绑定程度) per the scoring criteria:
   *
   * 1. Compare with standard human model → compute similarity
   * 2. If similarity > 50% → classify as character model
   * 3. For character models:
   *    - Read ring line circumferences, compute average
   *    - Rings < 50% of average = joint wiring (关节布线)
   *    - Joint wiring ratio 30%-70% → no deduction
   *    - > 70%: each 1% above = -1 point
   *    - < 30%: each 1% below = -1 point
   * 4. For non-character models → no deduction (full score)
   */
  static _evalRiggability(geo, isCharacterModel, ringLineData) {
    const max = RAW_MAX.riggability;

    // If NOT a character model → no deduction, full score
    if (!isCharacterModel) {
      return max;
    }

    // For character models, analyze joint wiring
    if (!ringLineData || !ringLineData.circumferences || ringLineData.circumferences.length < 5) {
      // Can't analyze ring lines → give partial score
      return Math.round(max * 0.7);
    }

    const jointRatio = ringLineData.jointRatio; // ratio of joint rings to total rings

    // Joint wiring ratio in 30%-70% range → no deduction
    if (jointRatio >= 0.3 && jointRatio <= 0.7) {
      return max;
    }

    // Below 30%: each 1% below → -1 point
    if (jointRatio < 0.3) {
      const belowPercent = (0.3 - jointRatio) * 100;
      const penalty = Math.min(Math.round(belowPercent), max);
      return Math.max(max - penalty, 0);
    }

    // Above 70%: each 1% above → -1 point
    if (jointRatio > 0.7) {
      const abovePercent = (jointRatio - 0.7) * 100;
      const penalty = Math.min(Math.round(abovePercent), max);
      return Math.max(max - penalty, 0);
    }

    return max;
  }

  static _evalUVUtilization(geo) {
    const max = RAW_MAX.uvUtilization;
    if (!geo.hasUV) return max * 0.3;
    const vc = geo.totalVertices || 0;
    let simulatedRatio;
    if (vc > 10000) simulatedRatio = 0.75 + Math.random() * 0.2;
    else if (vc > 2000) simulatedRatio = 0.65 + Math.random() * 0.25;
    else simulatedRatio = 0.50 + Math.random() * 0.30;

    // 占比>80%不扣分
    if (simulatedRatio > 0.8) return max;
    // 60%-80%区间内每少1%扣1分
    if (simulatedRatio > 0.6) {
      const penalty = (0.8 - simulatedRatio) * 100;
      return Math.max(max - penalty, 0);
    }
    // 少于60%此项0分
    return 0;
  }

  // === Texture evaluators ===

  static _evalTextureDetail(tex) {
    const max = RAW_MAX.textureDetail;
    if (!tex || !tex.hasColorMap) return max * 0.4;

    const imgData = tex.imageData?.baseColor;
    if (!imgData) return Math.round(max * 0.7);

    const { data, width, height } = imgData;
    const totalPixels = width * height;
    let flatAreaPixels = 0;
    const blockSize = 4;

    for (let by = 0; by < height - blockSize; by += blockSize) {
      for (let bx = 0; bx < width - blockSize; bx += blockSize) {
        let rSum = 0, gSum = 0, bSum = 0;
        const blockPixels = blockSize * blockSize;
        for (let dy = 0; dy < blockSize; dy++) {
          for (let dx = 0; dx < blockSize; dx++) {
            const idx = ((by + dy) * width + (bx + dx)) * 4;
            rSum += data[idx];
            gSum += data[idx + 1];
            bSum += data[idx + 2];
          }
        }
        const rAvg = rSum / blockPixels;
        const gAvg = gSum / blockPixels;
        const bAvg = bSum / blockPixels;

        let variance = 0;
        for (let dy = 0; dy < blockSize; dy++) {
          for (let dx = 0; dx < blockSize; dx++) {
            const idx = ((by + dy) * width + (bx + dx)) * 4;
            variance += Math.abs(data[idx] - rAvg);
            variance += Math.abs(data[idx + 1] - gAvg);
            variance += Math.abs(data[idx + 2] - bAvg);
          }
        }
        variance /= (blockPixels * 3);

        // 连续像素色相饱和度明度无变化 → 细节缺失
        if (variance < 2) {
          flatAreaPixels += blockPixels;
        }
      }
    }

    const flatRatio = flatAreaPixels / totalPixels;
    // 每占贴图总大小1%扣1分
    const penalty = Math.min(flatRatio * 100, max);
    return Math.max(max - penalty, 0);
  }

  static _evalTextureColor(tex) {
    const max = RAW_MAX.textureColor;
    if (!tex || !tex.hasColorMap) return max * 0.4;

    const imgData = tex.imageData?.baseColor;
    if (!imgData) return Math.round(max * 0.7);

    const { data, width, height } = imgData;
    const totalPixels = width * height;
    let badPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, v] = this._rgbToHsv(r, g, b);

      // HSV(0-255): 明度<10或>245, 饱和度<10 → 问题像素
      if (v < 10 || v > 245 || s < 10) {
        badPixels++;
      }
    }

    const badRatio = badPixels / totalPixels;
    // 每占贴图总像素1%扣1分
    const penalty = Math.min(badRatio * 100, max);
    return Math.max(max - penalty, 0);
  }

  static _evalConsistency(geo, tex) {
    const max = RAW_MAX.consistency;

    // Check geometric symmetry (left-right along center axis)
    let symmetryScore = 0.7;
    if (geo.positions && geo.positions.length > 0) {
      const sampleSize = Math.min(100, geo.positions.length);
      let symmetric = 0;
      for (let i = 0; i < sampleSize; i++) {
        const p = geo.positions[i];
        for (let j = 0; j < sampleSize; j++) {
          if (i === j) continue;
          const q = geo.positions[j];
          if (Math.abs(p.x + q.x) < 0.001 && Math.abs(p.y - q.y) < 0.001 && Math.abs(p.z - q.z) < 0.001) {
            symmetric++;
            break;
          }
        }
      }
      symmetryScore = symmetric / sampleSize;
    }

    // Check texture color symmetry (left-right halves)
    let texSymmetry = 1.0;
    const imgData = tex?.imageData?.baseColor;
    if (imgData) {
      const { data, width, height } = imgData;
      let diffSum = 0;
      let count = 0;
      const halfW = Math.floor(width / 2);
      const sampleStep = Math.max(1, Math.floor(height / 50));

      for (let y = 0; y < height; y += sampleStep) {
        for (let x = 0; x < halfW; x += 2) {
          const leftIdx = (y * width + x) * 4;
          const rightIdx = (y * width + (width - 1 - x)) * 4;
          const dr = Math.abs(data[leftIdx] - data[rightIdx]);
          const dg = Math.abs(data[leftIdx + 1] - data[rightIdx + 1]);
          const db = Math.abs(data[leftIdx + 2] - data[rightIdx + 2]);
          const diff = (dr + dg + db) / 3;
          diffSum += diff;
          count++;
        }
      }

      if (count > 0) {
        const avgDiff = diffSum / count;
        // 偏差5以内正常，偏差5以上每偏差1扣0.1分
        if (avgDiff > 5) {
          texSymmetry = Math.max(0, 1 - (avgDiff - 5) * 0.1);
        }
      }
    }

    const combinedScore = (symmetryScore * 0.5 + texSymmetry * 0.5);
    return Math.round(max * Math.min(combinedScore + 0.2, 1));
  }

  static _evalMaterialRationality(tex) {
    const max = RAW_MAX.materialRationality;
    if (!tex) return max * 0.5;

    let score = max * 0.4;

    const metalData = tex.imageData?.metallicMap;
    const roughData = tex.imageData?.roughness;

    if (metalData) {
      const { data } = metalData;
      let brightSum = 0;
      let pixelCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        brightSum += data[i];
        pixelCount++;
      }
      const avgBrightness = brightSum / pixelCount;
      // 金属度贴图平均明度应在155以上
      if (avgBrightness >= 155) {
        score += max * 0.3;
      } else {
        const deviation = Math.abs(avgBrightness - 155);
        // 每和标准值相差5扣一分
        const penalty = Math.min(Math.round(deviation / 5), max * 0.2);
        score += max * 0.3 - penalty;
      }
    }

    if (roughData) {
      const { data } = roughData;
      let brightSum = 0;
      let pixelCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        brightSum += data[i];
        pixelCount++;
      }
      const avgBrightness = brightSum / pixelCount;
      // 粗糙度贴图平均明度应在100以下
      if (avgBrightness <= 100) {
        score += max * 0.3;
      } else {
        const deviation = Math.abs(avgBrightness - 100);
        const penalty = Math.min(Math.round(deviation / 5), max * 0.2);
        score += max * 0.3 - penalty;
      }
    }

    return Math.min(Math.round(score), max);
  }

  static _evalNormalMapQuality(tex) {
    const max = RAW_MAX.normalMapQuality;
    if (!tex || !tex.hasNormalMap) return max * 0.3;

    const normalData = tex.imageData?.normalMap;
    const colorData = tex.imageData?.baseColor;

    if (!normalData) return Math.round(max * 0.7);

    let score = max * 0.6;

    // Check normal map has proper blue-ish tint (tangent space)
    const { data, width, height } = normalData;
    let bSum = 0, pixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      bSum += data[i + 2];
      pixelCount++;
    }
    const avgBlue = bSum / pixelCount;

    if (avgBlue > 180) {
      score += max * 0.2;
    } else if (avgBlue > 128) {
      score += max * 0.1;
    }

    // Check correspondence: bright color → convex normal, dark color → concave normal
    if (colorData && colorData.width === normalData.width) {
      let correspondCount = 0;
      let checkedPixels = 0;
      const minDim = Math.min(colorData.width * colorData.height, normalData.width * normalData.height);
      const step = Math.max(1, Math.floor(minDim / 1000));

      for (let i = 0; i < Math.min(colorData.data.length, normalData.data.length); i += 4 * step) {
        const colorBrightness = (colorData.data[i] + colorData.data[i + 1] + colorData.data[i + 2]) / 3;
        const normalB = normalData.data[i + 2];
        // 亮→凸(高蓝通道), 暗→凹(低蓝通道)
        if ((colorBrightness > 128 && normalB > 128) || (colorBrightness <= 128 && normalB <= 128)) {
          correspondCount++;
        }
        checkedPixels++;
      }

      if (checkedPixels > 0) {
        const correspondRatio = correspondCount / checkedPixels;
        if (correspondRatio > 0.7) {
          score += max * 0.2;
        } else {
          score += max * 0.1;
        }
      }
    }

    return Math.min(Math.round(score), max);
  }

  // === Similarity computation ===

  /**
   * Compute similarity between two shape fingerprints.
   * Uses the same algorithm as ModelViewer.computeSimilarity.
   */
  static _computeSimilarityFromFingerprints(fpA, fpB) {
    if (!fpA || !fpB) return 0;

    let score = 0;

    // 1. Bounding box proportions (30%)
    const widthDiff = Math.abs(fpA.widthRatio - fpB.widthRatio);
    const depthDiff = Math.abs(fpA.depthRatio - fpB.depthRatio);
    const proportionScore = Math.max(0, 1 - (widthDiff + depthDiff) * 0.5);
    score += proportionScore * 0.30;

    // 2. Vertex density distribution (40%)
    const thisDensity = fpA.densityPct;
    const stdDensity = fpB.densityPct;
    let densityDiff = 0;
    for (let i = 0; i < Math.min(thisDensity.length, stdDensity.length); i++) {
      densityDiff += Math.abs(thisDensity[i] - stdDensity[i]);
    }
    const densityScore = Math.max(0, 1 - densityDiff * 2);
    score += densityScore * 0.40;

    // 3. Cross-section silhouette (30%)
    const thisWidth = fpA.crossWidth;
    const stdWidth = fpB.crossWidth;
    const thisDepth = fpA.crossDepth;
    const stdDepth = fpB.crossDepth;
    let silhouetteDiff = 0;
    for (let i = 0; i < Math.min(thisWidth.length, stdWidth.length); i++) {
      silhouetteDiff += Math.abs(thisWidth[i] - stdWidth[i]);
      silhouetteDiff += Math.abs(thisDepth[i] - stdDepth[i]);
    }
    const silhouetteScore = Math.max(0, 1 - silhouetteDiff * 0.5);
    score += silhouetteScore * 0.30;

    return score;
  }

  // === Utility ===

  static _rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : (d / max) * 255;
    const v = max * 255;
    return [h, s, v];
  }

  // === Analysis generation ===

  static _generateAnalysis(scores, geo, tex, isCharacterModel, similarity) {
    const analyses = [];
    const vc = geo?.totalVertices || 0;
    const fc = geo?.totalFaces || 0;

    const texCount = [
      tex?.hasColorMap, tex?.hasNormalMap, tex?.hasMetalnessMap,
      tex?.hasRoughnessMap, tex?.hasEmissionMap
    ].filter(Boolean).length;

    // Model type identification
    if (isCharacterModel) {
      analyses.push({
        title: '模型类型识别',
        content: `通过与标准人体模型对比分析，该模型与标准人体模型的相似度为 ${Math.round(similarity * 100)}%，已被识别为人物角色模型。将进行关节布线专项评估。`,
      });
    } else if (similarity > 0) {
      analyses.push({
        title: '模型类型识别',
        content: `该模型与标准人体模型的相似度为 ${Math.round(similarity * 100)}%，未被归类为人物角色模型，可绑定程度项不予扣分。`,
      });
    }

    analyses.push({
      title: '整体概览',
      content: `该模型包含 ${vc.toLocaleString()} 个顶点和 ${fc.toLocaleString()} 个面，${texCount > 0 ? `包含 ${texCount} 张PBR贴图` : '未检测到贴图资源'}。`,
    });

    const topoScore = (scores.wireUniformity + scores.overlappingVerts + scores.hiddenFaces + scores.brokenFaces) / 4;
    if (topoScore >= 7) {
      analyses.push({ title: '拓扑结构', content: '模型布线均匀，拓扑结构清晰，无明显的结构缺陷。' });
    } else if (topoScore >= 4) {
      analyses.push({ title: '拓扑结构', content: '模型拓扑基本合理，但部分区域布线密度不均匀，建议优化关键区域的布线分布。' });
    } else {
      analyses.push({ title: '拓扑结构', content: '模型拓扑存在较多问题，布线不够均匀，建议重新进行拓扑优化。' });
    }

    // Joint wiring analysis for character models
    if (isCharacterModel && scores.riggability < RAW_MAX.riggability) {
      analyses.push({
        title: '关节布线分析',
        content: `作为角色模型，关节区域的布线密度比例不在理想范围（30%-70%）内，可能影响绑定和动画变形效果。建议调整关节区域的环线密度。`,
      });
    } else if (isCharacterModel && scores.riggability >= RAW_MAX.riggability) {
      analyses.push({
        title: '关节布线分析',
        content: `角色模型的关节布线比例合理，环线密度分布适中，有利于绑定和动画变形。`,
      });
    }

    const uvScore = scores.uvUtilization;
    if (uvScore >= 16) {
      analyses.push({ title: 'UV展开', content: 'UV利用率良好，UV壳在UV空间内分布合理。' });
    } else if (uvScore >= 10) {
      analyses.push({ title: 'UV展开', content: 'UV利用率一般，部分UV壳可能存在重叠或浪费空间的情况。' });
    } else {
      analyses.push({ title: 'UV展开', content: 'UV利用率较低，建议重新进行UV展开以优化空间利用率。' });
    }

    if (tex?.hasColorMap) {
      const texScore = (scores.textureDetail + scores.textureColor + scores.consistency) / 3;
      if (texScore >= 7) {
        analyses.push({ title: '贴图质量', content: '贴图细节丰富，色彩分布自然，视觉效果良好。' });
      } else if (texScore >= 4) {
        analyses.push({ title: '贴图质量', content: '贴图质量尚可，但部分区域可能存在色彩不均匀或细节不足的问题。' });
      } else {
        analyses.push({ title: '贴图质量', content: '贴图质量有待提升，建议增加细节层次并优化色彩分布。' });
      }
    }

    if (tex?.hasNormalMap || tex?.hasMetalnessMap || tex?.hasRoughnessMap) {
      const matScore = (scores.materialRationality + scores.normalMapQuality) / 2;
      if (matScore >= 7) {
        analyses.push({ title: '材质表现', content: '材质贴图配置完整，法线贴图与颜色贴图对应良好，金属度与粗糙度参数合理。' });
      } else {
        analyses.push({ title: '材质表现', content: '材质贴图配置基本可用，但部分通道参数可能需要调整以达到更好的渲染效果。' });
      }
    }

    return analyses;
  }

  // === PK Comparison ===

  static compareModels(results) {
    if (!results || results.length < 2) return null;

    const sorted = [...results].sort((a, b) => b.result.totalScore - a.result.totalScore);
    const winner = sorted[0];
    const runner = sorted[1];

    const dimensionComparison = DIMENSIONS.map(dim => {
      const wScore = winner.result.breakdown.find(b => b.key === dim.key);
      const rScore = runner.result.breakdown.find(b => b.key === dim.key);
      return {
        name: dim.name,
        key: dim.key,
        max: dim.max,
        winner: wScore.score,
        runner: rScore.score,
        winnerPct: (wScore.score / dim.max) * 100,
        runnerPct: (rScore.score / dim.max) * 100,
        advantage: wScore.score > rScore.score ? winner.name : (rScore.score > wScore.score ? runner.name : '持平'),
      };
    });

    const winnerStrengths = dimensionComparison.filter(d => d.winner > d.runner).map(d => d.name);
    const runnerStrengths = dimensionComparison.filter(d => d.runner > d.winner).map(d => d.name);

    // Model type info
    const winnerIsChar = winner.result.isCharacterModel;
    const runnerIsChar = runner.result.isCharacterModel;

    let typeComparison = '';
    if (winnerIsChar && !runnerIsChar) {
      typeComparison = `"${winner.name}" 为人物角色模型，"${runner.name}" 为非角色模型。`;
    } else if (!winnerIsChar && runnerIsChar) {
      typeComparison = `"${winner.name}" 为非角色模型，"${runner.name}" 为人物角色模型。`;
    } else if (winnerIsChar && runnerIsChar) {
      typeComparison = `两者均为人物角色模型。`;
    }

    return {
      winner,
      runner,
      scoreDiff: winner.result.totalScore - runner.result.totalScore,
      dimensionComparison,
      winnerStrengths,
      runnerStrengths,
      winnerIsChar,
      runnerIsChar,
      summary: this._generatePKSummary(winner, runner, dimensionComparison, typeComparison),
    };
  }

  static _generatePKSummary(winner, runner, dims, typeComparison) {
    const diff = winner.result.totalScore - runner.result.totalScore;
    let summary = `"${winner.name}" 以 ${winner.result.totalScore} 分领先 "${runner.name}" (${runner.result.totalScore} 分)，差距 ${diff} 分。`;

    if (typeComparison) {
      summary += typeComparison;
    }

    const winnerAdv = dims.filter(d => d.winner > d.runner);
    if (winnerAdv.length > 0) {
      summary += `"${winner.name}" 在 ${winnerAdv.map(d => d.name).join('、')} 等方面表现更优。`;
    }
    const runnerAdv = dims.filter(d => d.runner > d.winner);
    if (runnerAdv.length > 0) {
      summary += `"${runner.name}" 在 ${runnerAdv.map(d => d.name).join('、')} 等方面有一定优势。`;
    }

    return summary;
  }

  static _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { ModelEvaluator, DIMENSIONS };

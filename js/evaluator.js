/**
 * ModelEvaluator - AI 3D Topology Low-Poly Model Evaluation Engine
 *
 * Scoring criteria (12 dimensions, normalized to 100):
 * 1. 隐藏面 (Hidden Faces) - 10
 * 2. 破面 (Broken Faces) - 10
 * 3. 重合点 (Unmerged Vertices) - 10 (no deduction, recommendation tag only)
 * 4. 布线均匀度 (Wire Uniformity) - 10
 * 5. 可绑定程度 (Rig-ability) - 10
 * 6. UV利用度 (UV Utilization) - 10
 * 7. 贴图细节与复杂性 (Texture Detail) - 10 (HSV bin analysis)
 * 8. 贴图色彩 (Texture Color) - 10 (brightness < 2 or > 253)
 * 9. 一致性与伪影 (Consistency & Artifacts) - 10 (model-space UV symmetry)
 * 10. 材质合理性 (Material Rationality) - 10
 * 11. 法线贴图质量 (Normal Map Quality) - 10
 * 12. 模型光滑度 (Model Smoothness) - 10
 *
 * All scores retain 2 decimal places.
 * Internal deduction logic is NOT exposed to users.
 */

const RAW_MAX = {
  hiddenFaces: 10,
  brokenFaces: 10,
  overlappingVerts: 10,
  wireUniformity: 10,
  riggability: 10,
  uvUtilization: 10,
  textureDetail: 10,
  textureColor: 10,
  consistency: 10,
  materialRationality: 10,
  normalMapQuality: 10,
  modelSmoothness: 10,
};

const RAW_TOTAL = Object.values(RAW_MAX).reduce((a, b) => a + b, 0); // 120

const DIMENSIONS = [
  { key: 'hiddenFaces',        name: '隐藏面',           max: 10 },
  { key: 'brokenFaces',        name: '破面',             max: 10 },
  { key: 'overlappingVerts',   name: '重合点',           max: 10 },
  { key: 'wireUniformity',     name: '布线均匀度',       max: 10 },
  { key: 'riggability',        name: '可绑定程度',       max: 10 },
  { key: 'uvUtilization',      name: 'UV利用度',         max: 10 },
  { key: 'textureDetail',      name: '贴图细节与复杂性',  max: 10 },
  { key: 'textureColor',       name: '贴图色彩',         max: 10 },
  { key: 'consistency',        name: '一致性与伪影',     max: 10 },
  { key: 'materialRationality',name: '材质合理性',       max: 10 },
  { key: 'normalMapQuality',   name: '法线贴图质量',     max: 10 },
  { key: 'modelSmoothness',    name: '模型光滑度',       max: 10 },
];

/** Round to 2 decimal places */
function r2(x) {
  return Math.round(x * 100) / 100;
}

class ModelEvaluator {

  /**
   * Evaluate a model with optional standard human model reference.
   */
  static async evaluate(geometryData, textureInfo, standardModelRef, userModelFingerprint, userModelRingLineData, onProgress) {
    const steps = DIMENSIONS.length;
    const rawScores = {};

    // Compute similarity with standard human model
    let similarity = 0;
    let isCharacterModel = false;
    if (standardModelRef && standardModelRef.fingerprint && userModelFingerprint) {
      similarity = this._computeSimilarityFromFingerprints(userModelFingerprint, standardModelRef.fingerprint);
      isCharacterModel = similarity > 0.5;
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

    // Format all raw scores to 2 decimal places
    for (const key in rawScores) {
      rawScores[key] = r2(rawScores[key]);
    }

    const rawTotal = r2(Object.values(rawScores).reduce((a, b) => a + b, 0));
    const normalizedTotal = r2((rawTotal / RAW_TOTAL) * 100);
    const analysis = this._generateAnalysis(rawScores, geometryData, textureInfo, isCharacterModel, similarity);

    const breakdown = DIMENSIONS.map(dim => ({
      name: dim.name,
      key: dim.key,
      score: r2(rawScores[dim.key]),
      max: dim.max,
      percentage: r2((rawScores[dim.key] / dim.max) * 100),
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
      similarity: r2(similarity * 100),
      unmergedPairs: geometryData?.unmergedPairs || 0,
    };
  }

  static _evaluateDimension(key, geo, tex, isCharacterModel, ringLineData, similarity) {
    if (!geo) return RAW_MAX[key] * 0.5;

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
      case 'modelSmoothness': return this._evalModelSmoothness(geo);
      default: return 0;
    }
  }

  // === Geometry evaluators ===

  static _evalHiddenFaces(geo) {
    const max = RAW_MAX.hiddenFaces;
    if (!geo.faceNormals || geo.faceNormals.length === 0) return max * 0.6;
    const hiddenRatio = geo.hiddenFaces / Math.max(geo.faceNormals.length, 1);
    const penalty = Math.min(hiddenRatio * 100 * 0.1, max);
    return Math.max(max - penalty, 0);
  }

  static _evalBrokenFaces(geo) {
    const max = RAW_MAX.brokenFaces;
    let broken = 0;

    // Check for degenerate faces (zero-length edges, triangle inequality violations)
    if (geo.edgeLengths) {
      for (let i = 0; i < geo.edgeLengths.length; i += 3) {
        const a = geo.edgeLengths[i] || 0;
        const b = geo.edgeLengths[i + 1] || 0;
        const c = geo.edgeLengths[i + 2] || 0;
        if (a < 1e-6 || b < 1e-6 || c < 1e-6) broken++;
        if (a + b < c * 0.999 || a + c < b * 0.999 || b + c < a * 0.999) broken++;
      }
    }

    // Add holes: edge triangles without corresponding faces (Issue 1: 破面检测)
    if (geo.holeCount) {
      broken += geo.holeCount;
    }

    console.log(`[破面] 退化面+三角不等式违反=${broken - (geo.holeCount || 0)}, 空洞=${geo.holeCount || 0}, 总破面=${broken}`);
    const penalty = Math.min(broken, max);
    return Math.max(max - penalty, 0);
  }

  /**
   * 重合点 (Overlapping / Too-close Vertices)
   *
   * Scoring criterion: 模型上是否有相距距离过近的点
   *
   * Deduction logic:
   * 1. Compute ALL pairwise distances between vertices → database
   * 2. Take the average of all distances → avg
   * 3. For each pair with distance < 5% of avg:
   *    - Base deduction: 0.5 per pair
   *    - For each full percentage point below 5%: deduction doubles
   *      e.g. 4% of avg → 1 pp below → 0.5 × 2 = 1.0
   *           3% of avg → 2 pp below → 0.5 × 4 = 2.0
   *           2% of avg → 3 pp below → 0.5 × 8 = 4.0
   *           1% of avg → 4 pp below → 0.5 × 16 = 8.0
   *           0% of avg → 5 pp below → 0.5 × 32 = 16.0
   * 4. Total deduction capped at 10; score never goes negative.
   *
   * Example: 2 pairs at 4% of avg → 0.5×2 × 2 pairs = 2.0 pts deducted.
   */
  static _evalOverlappingVerts(geo) {
    // Unmerged vertices no longer affect score; only shown as a recommendation tag
    const max = RAW_MAX.overlappingVerts;
    const pairs = geo.unmergedPairs || 0;
    console.log(`[未合并点] 未合并点对=${pairs}, 不扣分, 得分=${max}`);
    return max;
  }

  static _evalWireUniformity(geo) {
    const max = RAW_MAX.wireUniformity;
    if (!geo.edgeLengths || geo.edgeLengths.length === 0) return max * 0.5;
    const avg = geo.avgEdgeLength;
    if (avg < 1e-8) return 0;

    let type1 = 0, type2 = 0;
    for (const len of geo.edgeLengths) {
      if (len > avg * 1.3) type1++;
      if (len < avg) type2++;
    }

    const total = geo.edgeLengths.length;
    const typeRatio = (type1 + type2) / Math.max(total, 1);
    const penalty = Math.min(Math.floor(typeRatio / 0.5) * 0.5, max);
    return Math.max(max - penalty, 0);
  }

  /**
   * Evaluate rig-ability per scoring criteria:
   * - similarity > 50% → character model → joint wiring analysis
   * - non-character → no deduction (full score)
   */
  static _evalRiggability(geo, isCharacterModel, ringLineData) {
    const max = RAW_MAX.riggability;

    if (!isCharacterModel) {
      return max;
    }

    if (!ringLineData || !ringLineData.circumferences || ringLineData.circumferences.length < 5) {
      return max * 0.7;
    }

    const jointRatio = ringLineData.jointRatio;

    if (jointRatio >= 0.3 && jointRatio <= 0.7) {
      return max;
    }

    if (jointRatio < 0.3) {
      const belowPercent = (0.3 - jointRatio) * 100;
      const penalty = Math.min(Math.round(belowPercent), max);
      return Math.max(max - penalty, 0);
    }

    if (jointRatio > 0.7) {
      const abovePercent = (jointRatio - 0.7) * 100;
      const penalty = Math.min(Math.round(abovePercent), max);
      return Math.max(max - penalty, 0);
    }

    return max;
  }

  /**
   * UV利用度 (UV Utilization)
   *
   * Uses actual UV data from the model:
   * - Divide UV space [0,1]x[0,1] into a 32x32 grid
   * - Count occupied cells (cells with at least one UV point)
   * - Utilization ratio = occupied / total
   * - Also checks for UVs outside [0,1] range (indicates poor layout)
   * - Score based on utilization ratio: >80% = full, <60% = 0
   */
  static _evalUVUtilization(geo) {
    const max = RAW_MAX.uvUtilization;
    if (!geo.hasUV) return max * 0.3;

    const uvs = geo.uvs;
    if (!uvs || uvs.length === 0) return max * 0.3;

    // 32x32 grid in UV space
    const gridSize = 32;
    const grid = new Set();
    let outOfRangeCount = 0;
    let validCount = 0;

    for (let i = 0; i < uvs.length; i++) {
      const uv = uvs[i];
      if (!uv) continue;
      validCount++;

      const u = uv.u;
      const v = uv.v;

      // Check if UV is outside [0,1] range
      if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) {
        outOfRangeCount++;
      }

      // Clamp to grid
      const gu = Math.max(0, Math.min(gridSize - 1, Math.floor(u * gridSize)));
      const gv = Math.max(0, Math.min(gridSize - 1, Math.floor(v * gridSize)));
      grid.add(gu * gridSize + gv);
    }

    if (validCount === 0) return max * 0.3;

    const totalCells = gridSize * gridSize;
    const occupiedCells = grid.size;
    const utilizationRatio = occupiedCells / totalCells;

    // Out-of-range UVs indicate poor layout
    const outOfRangeRatio = outOfRangeCount / validCount;

    // Score: utilization > 80% = full marks
    // utilization 60-80% = proportional
    // utilization < 60% = 0
    let score;
    if (utilizationRatio > 0.8) {
      score = max;
    } else if (utilizationRatio > 0.6) {
      score = max * ((utilizationRatio - 0.6) / 0.2);
    } else {
      score = 0;
    }

    // Penalty for out-of-range UVs (max 30% of score)
    if (outOfRangeRatio > 0) {
      const penalty = Math.min(outOfRangeRatio * 0.5, 0.3) * max;
      score = Math.max(score - penalty, 0);
    }

    return Math.max(score, 0);
  }

  // === Texture evaluators (REWRITTEN per user spec) ===

  /**
   * 贴图细节与复杂性 (Texture Detail & Complexity)
   *
   * New logic:
   * - Pick all pixels' HSV (0-255)
   * - Bin saturation into bins of 5 → count non-empty bins
   * - Bin value/brightness into bins of 5 → count non-empty bins
   * - Standard = 20 bins for each
   * - Each missing bin → -0.5
   * - Score = max(0, 10 - penalty)
   */
  static _evalTextureDetail(tex) {
    const max = RAW_MAX.textureDetail;
    // No color texture uploaded → 0 points
    if (!tex || !tex.hasColorMap) return 0;

    const imgData = tex.imageData?.baseColor;
    if (!imgData) return 0;

    const { data, width, height } = imgData;
    const totalPixels = width * height;

    // Create saturation bins and value bins (0-255, bin size = 5 → 51 bins)
    const satBins = new Set();
    const valBins = new Set();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, v] = this._rgbToHsv255(r, g, b);

      const satBin = Math.floor(s / 5);
      const valBin = Math.floor(v / 5);
      satBins.add(satBin);
      valBins.add(valBin);
    }

    const satCount = satBins.size;
    const valCount = valBins.size;

    // Standard is 20, each missing → -0.5
    const satMissing = Math.max(0, 20 - satCount);
    const valMissing = Math.max(0, 20 - valCount);
    const penalty = (satMissing + valMissing) * 0.5;

    return Math.max(max - penalty, 0);
  }

  /**
   * 贴图色彩 (Texture Color)
   *
   * Logic:
   * - HSV (0-255) standard
   * - Check if any pixels have brightness (V) < 2 or > 253
   * - If such pixels make up > 20% of total pixels, the texture's base color
   *   naturally includes near-pure-black/white — no deduction
   * - Otherwise: each 1% of total pixels with such brightness → -0.5
   * - Score = max(0, 10 - penalty)
   */
  static _evalTextureColor(tex) {
    const max = RAW_MAX.textureColor;
    // No color texture uploaded → 0 points
    if (!tex || !tex.hasColorMap) return 0;

    const imgData = tex.imageData?.baseColor;
    if (!imgData) return 0;

    const { data } = imgData;
    const totalPixels = data.length / 4;
    let badPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, v] = this._rgbToHsv255(r, g, b);

      // Brightness < 2 or > 253
      if (v < 2 || v > 253) {
        badPixels++;
      }
    }

    const badRatio = badPixels / totalPixels;

    // If near-pure-black/white pixels > 20%, the texture's base color
    // naturally includes these extremes — no deduction
    if (badRatio > 0.20) {
      console.log(`[贴图色彩] 纯黑纯白占比=${(badRatio * 100).toFixed(1)}% > 20%, 贴图基色包含极值, 不扣分, 得分=${max}`);
      return max;
    }

    const badPercent = badRatio * 100;
    // Each 1% → -0.5
    const penalty = badPercent * 0.5;

    console.log(`[贴图色彩] 纯黑纯白占比=${badPercent.toFixed(1)}%, 扣分=${penalty.toFixed(2)}, 得分=${Math.max(max - penalty, 0).toFixed(2)}`);
    return Math.max(max - penalty, 0);
  }

  /**
   * 一致性与伪影 (Consistency & Artifacts)
   *
   * Logic:
   * - Use model-space vertical centerline as symmetry axis
   * - For each left-side vertex, mirror to right side
   * - If mirrored position has NO matching right-side vertex → non-symmetric part,
   *   IGNORE (no deduction) per user spec
   * - If matched, sample texture at both UV positions, compare HSV differences
   * - Diff <= 20: normal (no penalty)
   * - Diff > 20: each point above 20 → -0.1
   * - If most of the model is non-symmetric (asymmetric by design),
   *   scale down penalties proportionally
   * - Score = max(0, 10 - total penalty)
   */
  static _evalConsistency(geo, tex) {
    const max = RAW_MAX.consistency;

    // Need both UV data and base color texture; no color texture → 0 points
    if (!geo?.uvs || !tex?.hasColorMap || !tex?.imageData?.baseColor) {
      return 0;
    }

    const { positions, uvs } = geo;
    const imgData = tex.imageData.baseColor;
    const { data, width, height } = imgData;

    // Find center X and model width (model is normalized to ~2.5 units)
    let minX = Infinity, maxX = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    const centerX = (minX + maxX) / 2;
    const modelWidth = maxX - minX;

    // Use model-relative matching threshold (1.5% of model width)
    // Tighter than the old fixed 0.1 to avoid false matches
    const matchThreshold = Math.max(modelWidth * 0.015, 0.01);
    const centerEpsilon = modelWidth * 0.01; // Small band around centerline

    // Build spatial hash of right-side vertices
    const cellSize = matchThreshold;
    const grid = new Map();

    const leftIndices = [];
    for (let i = 0; i < positions.length; i++) {
      if (!uvs[i]) continue;
      if (positions[i].x > centerX + centerEpsilon) {
        const p = positions[i];
        const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)},${Math.floor(p.z / cellSize)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      } else if (positions[i].x < centerX - centerEpsilon) {
        leftIndices.push(i);
      }
    }

    if (leftIndices.length === 0 || grid.size === 0) return max * 0.5;

    // Sample up to 80 left-side vertices
    const maxPairs = 80;
    const sampleStep = Math.max(1, Math.floor(leftIndices.length / maxPairs));

    let totalPenalty = 0;
    let pairCount = 0;
    let nonSymmetricCount = 0;

    for (let si = 0; si < leftIndices.length; si += sampleStep) {
      const leftIdx = leftIndices[si];
      const lp = positions[leftIdx];

      // Mirrored position
      const mx = 2 * centerX - lp.x;
      const my = lp.y;
      const mz = lp.z;

      // Find nearest right vertex using grid search
      let nearestIdx = -1;
      let nearestDist = Infinity;

      const gx = Math.floor(mx / cellSize);
      const gy = Math.floor(my / cellSize);
      const gz = Math.floor(mz / cellSize);

      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            const key = `${gx + dx},${gy + dy},${gz + dz}`;
            const cell = grid.get(key);
            if (cell) {
              for (const idx of cell) {
                const rp = positions[idx];
                const dist = Math.sqrt(
                  (rp.x - mx) ** 2 + (rp.y - my) ** 2 + (rp.z - mz) ** 2
                );
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearestIdx = idx;
                }
              }
            }
          }
        }
      }

      // No match within threshold → non-symmetric part, IGNORE (no penalty)
      if (nearestIdx === -1 || nearestDist > matchThreshold) {
        nonSymmetricCount++;
        continue;
      }

      // Get UVs for both vertices
      const leftUV = uvs[leftIdx];
      const rightUV = uvs[nearestIdx];

      // Sample texture at both UV positions
      const leftColor = this._sampleTexture(imgData, leftUV.u, leftUV.v);
      const rightColor = this._sampleTexture(imgData, rightUV.u, rightUV.v);

      if (!leftColor || !rightColor) continue;

      // Convert to HSV (0-255)
      const [lh, ls, lv] = this._rgbToHsv255(leftColor.r, leftColor.g, leftColor.b);
      const [rh, rs, rv] = this._rgbToHsv255(rightColor.r, rightColor.g, rightColor.b);

      // Compute differences (hue wrapping)
      const hDiff = this._hueDiff255(lh, rh);
      const sDiff = Math.abs(ls - rs);
      const vDiff = Math.abs(lv - rv);

      // Each component: diff > 20 → (diff - 20) * 0.1 penalty
      if (hDiff > 20) totalPenalty += (hDiff - 20) * 0.1;
      if (sDiff > 20) totalPenalty += (sDiff - 20) * 0.1;
      if (vDiff > 20) totalPenalty += (vDiff - 20) * 0.1;

      pairCount++;
    }

    if (pairCount === 0) {
      // All vertices are non-symmetric → model is asymmetric by design
      return max;
    }

    // Calculate non-symmetric ratio
    const totalSampled = pairCount + nonSymmetricCount;
    const nonSymmetricRatio = nonSymmetricCount / totalSampled;

    // If most of the model is non-symmetric, it's asymmetric by design
    // Scale down penalties proportionally — non-symmetric parts don't
    // contribute to consistency issues
    const symmetryFactor = 1 - nonSymmetricRatio;

    const avgPenalty = totalPenalty / pairCount;
    const scaledPenalty = avgPenalty * symmetryFactor;

    return Math.max(max - scaledPenalty, 0);
  }

  static _evalMaterialRationality(tex) {
    const max = RAW_MAX.materialRationality;

    // Start from full score; deduct 2 for each missing PBR map
    let score = max;

    const metalData = tex?.imageData?.metallicMap;
    const roughData = tex?.imageData?.roughness;

    // No Metallic map → -2 points
    if (!metalData) {
      score -= 2;
    } else {
      const { data } = metalData;
      let brightSum = 0;
      let pixelCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        brightSum += data[i];
        pixelCount++;
      }
      const avgBrightness = brightSum / pixelCount;
      if (avgBrightness >= 155) {
        // Good metallic value
      } else {
        const deviation = Math.abs(avgBrightness - 155);
        const penalty = Math.min(Math.round(deviation / 10), 3);
        score -= penalty;
      }
    }

    // No Roughness map → -2 points
    if (!roughData) {
      score -= 2;
    } else {
      const { data } = roughData;
      let brightSum = 0;
      let pixelCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        brightSum += data[i];
        pixelCount++;
      }
      const avgBrightness = brightSum / pixelCount;
      if (avgBrightness <= 100) {
        // Good roughness value
      } else {
        const deviation = Math.abs(avgBrightness - 100);
        const penalty = Math.min(Math.round(deviation / 10), 3);
        score -= penalty;
      }
    }

    return Math.max(score, 0);
  }

  static _evalNormalMapQuality(tex) {
    const max = RAW_MAX.normalMapQuality;
    // No normal map uploaded → 8 points (baseline for missing texture)
    if (!tex || !tex.hasNormalMap) return 8;

    const normalData = tex.imageData?.normalMap;
    if (!normalData) return 8;

    const colorData = tex.imageData?.baseColor;

    let score = max * 0.6;

    const { data } = normalData;
    let bSum = 0, pixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      bSum += data[i + 2];
      pixelCount++;
    }
    const avgBlue = bSum / pixelCount;

    // Good blue channel → bonus; poor blue channel → penalty (can go below 8)
    if (avgBlue > 180) {
      score += max * 0.2;
    } else if (avgBlue > 128) {
      score += max * 0.1;
    } else if (avgBlue < 80) {
      // Very poor normal map quality — penalty
      const penalty = Math.min((80 - avgBlue) / 80 * max * 0.3, max * 0.3);
      score -= penalty;
    }

    if (colorData && colorData.width === normalData.width) {
      let correspondCount = 0;
      let checkedPixels = 0;
      const minDim = Math.min(colorData.width * colorData.height, normalData.width * normalData.height);
      const step = Math.max(1, Math.floor(minDim / 1000));

      for (let i = 0; i < Math.min(colorData.data.length, normalData.data.length); i += 4 * step) {
        const colorBrightness = (colorData.data[i] + colorData.data[i + 1] + colorData.data[i + 2]) / 3;
        const normalB = normalData.data[i + 2];
        if ((colorBrightness > 128 && normalB > 128) || (colorBrightness <= 128 && normalB <= 128)) {
          correspondCount++;
        }
        checkedPixels++;
      }

      if (checkedPixels > 0) {
        const correspondRatio = correspondCount / checkedPixels;
        if (correspondRatio > 0.7) {
          score += max * 0.2;
        } else if (correspondRatio < 0.3) {
          // Very poor correspondence — penalty (can go below 8)
          score -= max * 0.15;
        } else {
          score += max * 0.1;
        }
      }
    }

    return Math.min(score, max);
  }

  /**
   * 模型光滑度 (Model Smoothness)
   *
   * Scoring criterion: 造型是否过度圆润
   *
   * Deduction logic:
   * - > 20000 triangles: deduct 0.5 per 1000 above 20000
   * - < 5000 triangles: deduct 0.5 per 1000 below 5000
   * - 5000-20000: compare with 15000, deduct 0.1 per 1000 deviation from 15000
   *
   * Score = max(0, 10 - total deduction)
   */
  static _evalModelSmoothness(geo) {
    const max = RAW_MAX.modelSmoothness;
    if (!geo || !geo.totalFaces) return max * 0.5;

    const faces = geo.totalFaces;
    let deduction = 0;

    if (faces > 20000) {
      const excess = faces - 20000;
      deduction = (excess / 1000) * 0.5;
    } else if (faces < 5000) {
      const deficit = 5000 - faces;
      deduction = (deficit / 1000) * 0.5;
    } else {
      // 5000-20000: compare with 15000
      const deviation = Math.abs(faces - 15000);
      deduction = (deviation / 1000) * 0.1;
    }

    const score = Math.max(max - deduction, 0);
    console.log(`[模型光滑度] 面数=${faces}, 扣分=${deduction.toFixed(2)}, 得分=${score.toFixed(2)}`);
    return score;
  }

  // === Texture sampling & HSV utilities ===

  /**
   * Sample texture color at UV coordinates.
   * texture.flipY = true (Three.js default), so UV (0,0) → bottom-left of image.
   * Canvas getImageData starts from top-left, so we need to flip V.
   */
  static _sampleTexture(imgData, u, v) {
    if (!imgData) return null;
    const { data, width, height } = imgData;
    // Clamp UV to [0, 1)
    u = Math.max(0, Math.min(0.9999, u));
    v = Math.max(0, Math.min(0.9999, v));
    const px = Math.min(Math.floor(u * width), width - 1);
    // Flip V: UV v=0 is bottom of texture, but image data row 0 is top
    const py = height - 1 - Math.min(Math.floor(v * height), height - 1);
    const idx = (py * width + px) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  }

  /**
   * Convert RGB to HSV, all components in 0-255 range.
   */
  static _rgbToHsv255(r, g, b) {
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
    h = (h / 360) * 255; // Convert hue to 0-255
    const s = max === 0 ? 0 : (d / max) * 255;
    const v = max * 255;
    return [h, s, v];
  }

  /**
   * Compute hue difference with wrapping (0-255 range).
   */
  static _hueDiff255(h1, h2) {
    const diff = Math.abs(h1 - h2);
    return Math.min(diff, 255 - diff);
  }

  // === Similarity computation ===

  static _computeSimilarityFromFingerprints(fpA, fpB) {
    if (!fpA || !fpB) return 0;

    let score = 0;

    const widthDiff = Math.abs(fpA.widthRatio - fpB.widthRatio);
    const depthDiff = Math.abs(fpA.depthRatio - fpB.depthRatio);
    const proportionScore = Math.max(0, 1 - (widthDiff + depthDiff) * 0.5);
    score += proportionScore * 0.30;

    const thisDensity = fpA.densityPct;
    const stdDensity = fpB.densityPct;
    let densityDiff = 0;
    for (let i = 0; i < Math.min(thisDensity.length, stdDensity.length); i++) {
      densityDiff += Math.abs(thisDensity[i] - stdDensity[i]);
    }
    const densityScore = Math.max(0, 1 - densityDiff * 2);
    score += densityScore * 0.40;

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

  // === Analysis generation ===

  static _generateAnalysis(scores, geo, tex, isCharacterModel, similarity) {
    const analyses = [];
    const vc = geo?.totalVertices || 0;
    const fc = geo?.totalFaces || 0;

    const texCount = [
      tex?.hasColorMap, tex?.hasNormalMap, tex?.hasMetalnessMap,
      tex?.hasRoughnessMap, tex?.hasEmissionMap
    ].filter(Boolean).length;

    if (isCharacterModel) {
      analyses.push({
        title: '模型类型识别',
        content: `通过与标准人体模型对比分析，该模型与标准人体模型的相似度为 ${r2(similarity * 100)}%，已被识别为人物角色模型。将进行关节布线专项评估。`,
      });
    } else if (similarity > 0) {
      analyses.push({
        title: '模型类型识别',
        content: `该模型与标准人体模型的相似度为 ${r2(similarity * 100)}%，未被归类为人物角色模型，可绑定程度项不予扣分。`,
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
    if (uvScore >= 8) {
      analyses.push({ title: 'UV展开', content: 'UV利用率良好，UV壳在UV空间内分布合理。' });
    } else if (uvScore >= 5) {
      analyses.push({ title: 'UV展开', content: 'UV利用率一般，部分UV壳可能存在重叠或浪费空间的情况。' });
    } else {
      analyses.push({ title: 'UV展开', content: 'UV利用率较低，建议重新进行UV展开以优化空间利用率。' });
    }

    // Model smoothness analysis
    const smoothScore = scores.modelSmoothness;
    if (fc > 20000) {
      analyses.push({ title: '模型光滑度', content: `模型面数（${fc.toLocaleString()}）偏高，造型可能过度圆润，建议减少面数至20000以下以优化性能。` });
    } else if (fc < 5000) {
      analyses.push({ title: '模型光滑度', content: `模型面数（${fc.toLocaleString()}）偏低，造型细节可能不足，建议增加面数至5000以上以改善圆润度。` });
    } else if (smoothScore >= 9) {
      analyses.push({ title: '模型光滑度', content: `模型面数（${fc.toLocaleString()}）接近理想范围（5000-20000），光滑度适中。` });
    } else {
      analyses.push({ title: '模型光滑度', content: `模型面数（${fc.toLocaleString()}）在合理范围内，但偏离理想值15000，光滑度可进一步优化。` });
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

    // Material analysis (always show — scores exist even without maps)
    {
      const matScore = (scores.materialRationality + scores.normalMapQuality) / 2;
      const missingMaps = [];
      if (!tex?.hasNormalMap) missingMaps.push('法线贴图');
      if (!tex?.hasMetalnessMap) missingMaps.push('金属度贴图');
      if (!tex?.hasRoughnessMap) missingMaps.push('粗糙度贴图');

      if (matScore >= 8 && missingMaps.length === 0) {
        analyses.push({ title: '材质表现', content: '材质贴图配置完整，法线贴图与颜色贴图对应良好，金属度与粗糙度参数合理。' });
      } else if (missingMaps.length > 0) {
        analyses.push({ title: '材质表现', content: `缺失${missingMaps.join('、')}，材质配置不完整。建议补充相应贴图以提升渲染效果。` });
      } else if (matScore >= 6) {
        analyses.push({ title: '材质表现', content: '材质贴图配置基本可用，但部分通道参数可能需要调整以达到更好的渲染效果。' });
      } else {
        analyses.push({ title: '材质表现', content: '材质贴图存在较多问题，建议检查法线贴图质量及金属度/粗糙度参数。' });
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
      scoreDiff: r2(winner.result.totalScore - runner.result.totalScore),
      dimensionComparison,
      winnerStrengths,
      runnerStrengths,
      winnerIsChar,
      runnerIsChar,
      summary: this._generatePKSummary(winner, runner, dimensionComparison, typeComparison),
    };
  }

  static _generatePKSummary(winner, runner, dims, typeComparison) {
    const diff = r2(winner.result.totalScore - runner.result.totalScore);
    let summary = `"${winner.name}" 以 ${winner.result.totalScore.toFixed(2)} 分领先 "${runner.name}" (${runner.result.totalScore.toFixed(2)} 分)，差距 ${diff.toFixed(2)} 分。`;

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

  /**
   * Generate usage recommendation tags based on evaluation scores.
   *
   * Tag criteria (from Excel spec):
   * - 次世代游戏: 材质合理性>6, 模型光滑度>8, UV利用度>9, 法线贴图质量>8, 其他项>3
   * - 手绘游戏: 贴图细节与复杂性>8, 其他项>3
   * - 3D打印: 模型光滑度>9, 其他项>3
   * - 影视动画: 所有项>9
   *
   * A model can match multiple tags — all matching tags are returned.
   *
   * @param {Array} breakdown - The breakdown array from evaluation result
   * @returns {Array} Array of { label, color } objects
   */
  static generateUsageTags(breakdown) {
    if (!breakdown || !Array.isArray(breakdown)) return [];

    const scores = {};
    for (const item of breakdown) {
      scores[item.key] = item.score;
    }

    const allKeys = DIMENSIONS.map(d => d.key);

    // Helper: check if all dimensions NOT in excludeKeys meet the threshold
    const checkOthers = (excludeKeys, threshold) => {
      for (const key of allKeys) {
        if (!excludeKeys.includes(key)) {
          if (!(scores[key] > threshold)) return false;
        }
      }
      return true;
    };

    const tags = [];

    // 次世代游戏: 材质合理性>6, 模型光滑度>8, UV利用度>9, 法线贴图质量>8, 其他项>3
    if (scores.materialRationality > 6 &&
        scores.modelSmoothness > 8 &&
        scores.uvUtilization > 9 &&
        scores.normalMapQuality > 8 &&
        checkOthers(['materialRationality', 'modelSmoothness', 'uvUtilization', 'normalMapQuality'], 3)) {
      tags.push({ label: '次世代游戏', color: 'blue' });
    }

    // 手绘游戏: 贴图细节与复杂性>8, 其他项>3
    if (scores.textureDetail > 8 &&
        checkOthers(['textureDetail'], 3)) {
      tags.push({ label: '手绘游戏', color: 'green' });
    }

    // 3D打印: 模型光滑度>9, 其他项>3
    if (scores.modelSmoothness > 9 &&
        checkOthers(['modelSmoothness'], 3)) {
      tags.push({ label: '3D打印', color: 'purple' });
    }

    // 影视动画: 所有项>9
    if (allKeys.every(key => scores[key] > 9)) {
      tags.push({ label: '影视动画', color: 'gold' });
    }

    return tags;
  }
}

export { ModelEvaluator, DIMENSIONS };

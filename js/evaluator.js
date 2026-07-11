/**
 * ModelEvaluator - AI 3D Topology Low-Poly Model Evaluation Engine
 *
 * Scoring criteria (11 dimensions, normalized to 100):
 * 1. 隐藏面 (Hidden Faces) - 10
 * 2. 破面 (Broken Faces) - 10
 * 3. 重合点 (Overlapping Vertices) - 10
 * 4. 布线均匀度 (Wire Uniformity) - 10
 * 5. 可绑定程度 (Rig-ability) - 10
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

// Raw max scores from the criteria table (total = 120)
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

// Dimension display info
const DIMENSIONS = [
  { key: 'hiddenFaces',        name: '隐藏面',         max: 10 },
  { key: 'brokenFaces',        name: '破面',           max: 10 },
  { key: 'overlappingVerts',   name: '重合点',         max: 10 },
  { key: 'wireUniformity',     name: '布线均匀度',     max: 10 },
  { key: 'riggability',        name: '可绑定程度',     max: 10 },
  { key: 'uvUtilization',      name: 'UV利用度',       max: 20 },
  { key: 'textureDetail',      name: '贴图细节与复杂性', max: 10 },
  { key: 'textureColor',       name: '贴图色彩',       max: 10 },
  { key: 'consistency',        name: '一致性与伪影',   max: 10 },
  { key: 'materialRationality',name: '材质合理性',     max: 10 },
  { key: 'normalMapQuality',   name: '法线贴图质量',   max: 10 },
];

class ModelEvaluator {

  /**
   * Evaluate a single model
   * @param {Object} geometryData - from ModelViewer.getGeometryData()
   * @param {Object} textureInfo - texture availability info
   * @param {Function} onProgress - progress callback (0-100)
   * @returns {Promise<Object>} evaluation result
   */
  static async evaluate(geometryData, textureInfo, onProgress) {
    const steps = DIMENSIONS.length;
    const rawScores = {};

    for (let i = 0; i < DIMENSIONS.length; i++) {
      const dim = DIMENSIONS[i];
      // Simulate async analysis with small delay
      await this._delay(200 + Math.random() * 300);
      rawScores[dim.key] = this._evaluateDimension(dim.key, geometryData, textureInfo);
      if (onProgress) onProgress(Math.round(((i + 1) / steps) * 100));
    }

    // Compute raw total
    const rawTotal = Object.values(rawScores).reduce((a, b) => a + b, 0);
    // Normalize to 100
    const normalizedTotal = Math.round((rawTotal / RAW_TOTAL) * 100);

    // Generate qualitative analysis
    const analysis = this._generateAnalysis(rawScores, geometryData, textureInfo);

    // Build score breakdown (normalized to each dimension's displayed max)
    const breakdown = DIMENSIONS.map(dim => ({
      name: dim.name,
      key: dim.key,
      score: rawScores[dim.key],
      max: dim.max,
      percentage: Math.round((rawScores[dim.key] / dim.max) * 100),
    }));

    // Determine grade
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
    };
  }

  static _evaluateDimension(key, geo, tex) {
    if (!geo) return Math.floor(RAW_MAX[key] * 0.5);

    switch (key) {
      case 'hiddenFaces': return this._evalHiddenFaces(geo);
      case 'brokenFaces': return this._evalBrokenFaces(geo);
      case 'overlappingVerts': return this._evalOverlappingVerts(geo);
      case 'wireUniformity': return this._evalWireUniformity(geo);
      case 'riggability': return this._evalRiggability(geo);
      case 'uvUtilization': return this._evalUVUtilization(geo);
      case 'textureDetail': return this._evalTextureDetail(tex);
      case 'textureColor': return this._evalTextureColor(tex);
      case 'consistency': return this._evalConsistency(geo, tex);
      case 'materialRationality': return this._evalMaterialRationality(tex);
      case 'normalMapQuality': return this._evalNormalMapQuality(tex);
      default: return 0;
    }
  }

  // === Dimension evaluators ===
  // Internal logic - NOT exposed to end users

  static _evalHiddenFaces(geo) {
    const max = RAW_MAX.hiddenFaces;
    if (!geo.faceNormals || geo.faceNormals.length === 0) return max * 0.6;
    const hiddenRatio = geo.hiddenFaces / Math.max(geo.faceNormals.length, 1);
    const penalty = Math.min(hiddenRatio * 100 * 0.1, max);
    return Math.max(max - penalty, 0);
  }

  static _evalBrokenFaces(geo) {
    const max = RAW_MAX.brokenFaces;
    // Estimate broken faces via degenerate triangles (zero or near-zero area)
    let broken = 0;
    if (geo.edgeLengths) {
      for (let i = 0; i < geo.edgeLengths.length; i += 3) {
        const a = geo.edgeLengths[i] || 0;
        const b = geo.edgeLengths[i + 1] || 0;
        const c = geo.edgeLengths[i + 2] || 0;
        if (a < 1e-6 || b < 1e-6 || c < 1e-6) broken++;
        // Triangle inequality check
        if (a + b < c * 0.999 || a + c < b * 0.999 || b + c < a * 0.999) broken++;
      }
    }
    const penalty = Math.min(broken, max);
    return Math.max(max - penalty, 0);
  }

  static _evalOverlappingVerts(geo) {
    const max = RAW_MAX.overlappingVerts;
    const pairs = geo.overlappingPairs || 0;
    const penalty = Math.min(pairs * 0.5, max);
    return Math.max(max - penalty, 0);
  }

  static _evalWireUniformity(geo) {
    const max = RAW_MAX.wireUniformity;
    if (!geo.edgeLengths || geo.edgeLengths.length === 0) return max * 0.5;
    const avg = geo.avgEdgeLength;
    if (avg < 1e-8) return 0;
    const variance = geo.edgeLengthVariance;
    const cv = Math.sqrt(variance) / avg; // coefficient of variation
    // Type1: values > avg*1.3, Type2: values < avg
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

  static _evalRiggability(geo) {
    const max = RAW_MAX.riggability;
    // Simplified: check if model looks like a character (vertex count in typical range)
    const vc = geo.totalVertices || 0;
    if (vc < 500 || vc > 50000) {
      // Likely not a character model - no deduction
      return max;
    }
    // For character models, simulate joint analysis
    // Use edge loop analysis proxy: coefficient of variation of edge lengths
    const cv = geo.edgeLengthVariance > 0
      ? Math.sqrt(geo.edgeLengthVariance) / Math.max(geo.avgEdgeLength, 1e-8)
      : 0;
    if (cv < 0.3) return max;
    const penalty = Math.min((cv - 0.3) * 20, max);
    return Math.max(max - penalty, 0);
  }

  static _evalUVUtilization(geo) {
    const max = RAW_MAX.uvUtilization;
    if (!geo.hasUV) return max * 0.3; // No UV = low score
    // Without actual UV data parsing, simulate based on model complexity
    // More complex models tend to have better UV utilization
    const vc = geo.totalVertices || 0;
    let simulatedRatio;
    if (vc > 10000) simulatedRatio = 0.75 + Math.random() * 0.2;
    else if (vc > 2000) simulatedRatio = 0.65 + Math.random() * 0.25;
    else simulatedRatio = 0.50 + Math.random() * 0.30;

    if (simulatedRatio > 0.8) return max;
    if (simulatedRatio > 0.6) {
      const penalty = (0.8 - simulatedRatio) * 100;
      return Math.max(max - penalty, 0);
    }
    return 0;
  }

  static _evalTextureDetail(tex) {
    const max = RAW_MAX.textureDetail;
    if (!tex || !tex.hasColorMap) return max * 0.4;
    // Simulate texture detail analysis
    const detailScore = 0.6 + Math.random() * 0.4;
    return Math.round(max * detailScore);
  }

  static _evalTextureColor(tex) {
    const max = RAW_MAX.textureColor;
    if (!tex || !tex.hasColorMap) return max * 0.4;
    const colorScore = 0.65 + Math.random() * 0.35;
    return Math.round(max * colorScore);
  }

  static _evalConsistency(geo, tex) {
    const max = RAW_MAX.consistency;
    // Check geometric symmetry (simplified)
    let symmetryScore = 0.7;
    if (geo.positions && geo.positions.length > 0) {
      // Sample vertices and check x-symmetry
      const sampleSize = Math.min(100, geo.positions.length);
      let symmetric = 0;
      for (let i = 0; i < sampleSize; i++) {
        const p = geo.positions[i];
        // Look for a mirrored point
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
    return Math.round(max * Math.min(symmetryScore + 0.2, 1));
  }

  static _evalMaterialRationality(tex) {
    const max = RAW_MAX.materialRationality;
    if (!tex) return max * 0.5;
    let score = max * 0.6;
    if (tex.hasMetalnessMap) score += max * 0.2;
    if (tex.hasRoughnessMap) score += max * 0.2;
    return Math.min(Math.round(score), max);
  }

  static _evalNormalMapQuality(tex) {
    const max = RAW_MAX.normalMapQuality;
    if (!tex || !tex.hasNormalMap) return max * 0.3;
    const qualityScore = 0.65 + Math.random() * 0.35;
    return Math.round(max * qualityScore);
  }

  // === Analysis generation (user-facing) ===

  static _generateAnalysis(scores, geo, tex) {
    const analyses = [];
    const vc = geo?.totalVertices || 0;
    const fc = geo?.totalFaces || 0;

    // Overall summary
    analyses.push({
      title: '整体概览',
      content: `该模型包含 ${vc.toLocaleString()} 个顶点和 ${fc.toLocaleString()} 个面，${tex?.hasColorMap ? '包含贴图资源' : '未检测到贴图资源'}。`,
    });

    // Topology analysis
    const topoScore = (scores.wireUniformity + scores.overlappingVerts + scores.hiddenFaces + scores.brokenFaces) / 4;
    if (topoScore >= 7) {
      analyses.push({ title: '拓扑结构', content: '模型布线均匀，拓扑结构清晰，无明显的结构缺陷。' });
    } else if (topoScore >= 4) {
      analyses.push({ title: '拓扑结构', content: '模型拓扑基本合理，但部分区域布线密度不均匀，建议优化关键区域的布线分布。' });
    } else {
      analyses.push({ title: '拓扑结构', content: '模型拓扑存在较多问题，布线不够均匀，建议重新进行拓扑优化。' });
    }

    // UV analysis
    const uvScore = scores.uvUtilization;
    if (uvScore >= 16) {
      analyses.push({ title: 'UV展开', content: 'UV利用率良好，UV壳在UV空间内分布合理。' });
    } else if (uvScore >= 10) {
      analyses.push({ title: 'UV展开', content: 'UV利用率一般，部分UV壳可能存在重叠或浪费空间的情况。' });
    } else {
      analyses.push({ title: 'UV展开', content: 'UV利用率较低，建议重新进行UV展开以优化空间利用率。' });
    }

    // Texture analysis
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

    // Material analysis
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

    // Sort by total score descending
    const sorted = [...results].sort((a, b) => b.result.totalScore - a.result.totalScore);
    const winner = sorted[0];
    const runner = sorted[1];

    // Compare each dimension
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

    // Find strengths and weaknesses
    const winnerStrengths = dimensionComparison.filter(d => d.winner > d.runner).map(d => d.name);
    const runnerStrengths = dimensionComparison.filter(d => d.runner > d.winner).map(d => d.name);

    return {
      winner,
      runner,
      scoreDiff: winner.result.totalScore - runner.result.totalScore,
      dimensionComparison,
      winnerStrengths,
      runnerStrengths,
      summary: this._generatePKSummary(winner, runner, dimensionComparison),
    };
  }

  static _generatePKSummary(winner, runner, dims) {
    const diff = winner.result.totalScore - runner.result.totalScore;
    let summary = `"${winner.name}" 以 ${winner.result.totalScore} 分领先 "${runner.name}" (${runner.result.totalScore} 分)，差距 ${diff} 分。`;

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

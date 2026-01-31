import { MAX_PHRASE_LEN, MAX_SEED_LEN } from './state.js';

export function sanitizeInput(text, maxLen) {
  if (!text) return '';
  const trimmed = text.trim().slice(0, maxLen);
  return trimmed.replace(/[<>]/g, '');
}

export function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function pickFromIntensity(rng, sets, intensity, lowThreshold = 0.15, highThreshold = 0.85) {
  const roll = rng();
  let idx = intensity;
  // 同一強度に固定すると単調になるため、隣接強度に少し揺らす。
  if (roll < lowThreshold && intensity > 0) idx = intensity - 1;
  if (roll > highThreshold && intensity < sets.length - 1) idx = intensity + 1;
  return sets[idx];
}

export function getIntensity(level) {
  const num = Number(level) || 3;
  if (num <= 2) return 0;
  if (num === 3) return 1;
  return 2;
}

export function getBreakIntensity(value) {
  if (value === 'weak') return 0;
  if (value === 'strong') return 2;
  return 1;
}

export function applyBreakRule(rule, head, tail) {
  switch (rule) {
    case 'cut':
      return `${head}…`;
    case 'sokuon':
      return `${head}っ…`;
    case 'choke':
      return `${head}…っ`;
    case 'repeat':
      return `${head.slice(0, Math.max(1, Math.floor(head.length * 0.6)))}…${head}…`;
    case 'split':
    default:
      return `${head}…${tail.slice(0, Math.max(1, Math.floor(tail.length * 0.5)))}…`;
  }
}

export function breakPhrase(text, intensity, rng, rules, weights) {
  if (!text) return '';
  const cleaned = text.replace(/[A-Za-z0-9]/g, '').replace(/ー/g, '').trim();
  if (!cleaned) return '';
  // 強さに応じて残存率を変え、途切れの強度を担保する。
  const remainRate = intensity === 0 ? 0.8 : intensity === 1 ? 0.6 : 0.4;
  const baseLen = Math.max(1, Math.floor(cleaned.length * remainRate));
  const head = cleaned.slice(0, baseLen);
  const tailStart = Math.max(1, Math.floor(cleaned.length * 0.5));
  const tail = cleaned.slice(tailStart);
  const enabled = rules && rules.length ? rules : ['cut', 'sokuon', 'choke', 'repeat', 'split'];
  // すべてOFFでも生成が止まらないよう全候補にフォールバックする。
  let total = 0;
  for (const key of enabled) {
    const w = Math.max(1, weights?.[key] ?? 1);
    total += w;
  }
  let pickPoint = rng() * (total || enabled.length);
  let rule = enabled[enabled.length - 1];
  if (!total) {
    rule = enabled[Math.floor(rng() * enabled.length)];
  } else {
    for (const key of enabled) {
      pickPoint -= Math.max(1, weights?.[key] ?? 1);
      if (pickPoint <= 0) {
        rule = key;
        break;
      }
    }
  }
  return applyBreakRule(rule, head, tail);
}

export function makeBreakExample(text, intensity, rule) {
  if (!text) return '-';
  const cleaned = text.replace(/[A-Za-z0-9]/g, '').replace(/ー/g, '').trim();
  if (!cleaned) return '-';
  const remainRate = intensity === 0 ? 0.8 : intensity === 1 ? 0.6 : 0.4;
  const baseLen = Math.max(1, Math.floor(cleaned.length * remainRate));
  const head = cleaned.slice(0, baseLen);
  const tailStart = Math.max(1, Math.floor(cleaned.length * 0.5));
  const tail = cleaned.slice(tailStart);
  return applyBreakRule(rule, head, tail);
}

export function generateLine({
  level,
  length,
  phrase,
  phraseMode,
  breakIntensity,
  breakRules,
  breakWeights,
  seedText,
  tone,
  style,
  flow,
  reduceEllipsis,
  lexicon,
}) {
  const toneAlias = {
    harsh: 'rage',
    neutral: 'emotionless',
    soft: 'timid',
    intense: 'shaken',
  };
  const safeSeed = sanitizeInput(seedText, MAX_SEED_LEN);
  const rng = safeSeed ? mulberry32(hashSeed(safeSeed)) : Math.random;

  const intensity = getIntensity(level);
  const safePhrase = sanitizeInput(phrase, MAX_PHRASE_LEN);

  const toneWeights = {
    emotionless: { harsh: 0.5, neutral: 9, soft: 0.5, intense: 0.25 },
    timid: { harsh: 0.25, neutral: 1.5, soft: 8.5, intense: 0.25 },
    shaken: { harsh: 0.75, neutral: 3.5, soft: 1.5, intense: 4.5 },
    panic: { harsh: 4, neutral: 1.5, soft: 0.75, intense: 4.5 },
    rage: { harsh: 7, neutral: 0.5, soft: 0.25, intense: 4.5 },
  };
  const normalizedTone = toneAlias[tone] || tone;
  const currentTone = normalizedTone && toneWeights[normalizedTone] ? normalizedTone : 'emotionless';
  const styleConfig = {
    none: { jitterLow: 0.15, jitterHigh: 0.85, shortBias: 'none', midBias: 'none', longBias: 'none' },
    restrained: { jitterLow: 0.12, jitterHigh: 0.88, shortBias: 'cut', midBias: 'cut', longBias: 'short' },
    unsteady: { jitterLow: 0.22, jitterHigh: 0.78, shortBias: 'cont', midBias: 'after', longBias: 'long' },
    flat: { jitterLow: 0.08, jitterHigh: 0.92, shortBias: 'none', midBias: 'none', longBias: 'flat' },
  };
  const currentStyle = styleConfig[style] ? style : 'none';
  const toneStructureBias = {
    emotionless: { short: [55, 45], medium: [55, 45], long: [40, 45, 15] },
    timid: { short: [70, 30], medium: [35, 65], long: [30, 35, 35] },
    shaken: { short: [40, 60], medium: [25, 25, 50], long: [15, 70, 15] },
    panic: { short: [35, 65], medium: [75, 25], long: [70, 20, 10] },
    rage: { short: [30, 70], medium: [75, 25], long: [60, 25, 15] },
  };

  const ellipsisTuning = {
    emotionless: { after: 0.45, cut: 0.45, compress: 0.7 },
    timid: { after: 0.5, cut: 0.45, compress: 0.7 },
    shaken: { after: 0.3, cut: 0.25, compress: 0.55 },
    panic: { after: 0.25, cut: 0.2, compress: 0.5 },
    rage: { after: 0.2, cut: 0.15, compress: 0.45 },
  };

  function clampRate(value, min = 0, max = 0.9) {
    return Math.max(min, Math.min(max, value));
  }

  function getEllipsisRates() {
    const base = ellipsisTuning[currentTone] || ellipsisTuning.emotionless;
    const boost = reduceEllipsis ? 0.15 : 0;
    const compressBoost = reduceEllipsis ? 0.1 : 0;
    return {
      after: clampRate(base.after + boost),
      cut: clampRate(base.cut + boost),
      compress: clampRate(base.compress + compressBoost),
    };
  }

  function pickByTone(items) {
    const weights = toneWeights[currentTone] || toneWeights.emotionless;
    const total = items.reduce((sum, item) => sum + (weights[item.tone] || 1), 0);
    let r = rng() * total;
    for (const item of items) {
      r -= weights[item.tone] || 1;
      if (r <= 0) return item.text;
    }
    return items[items.length - 1].text;
  }

  function getSoundKey(text) {
    const core = text.replace(/…/g, '');
    return core.slice(0, 2);
  }

  function pickByToneAvoid(items, prevText, strict) {
    const prevKey = prevText ? getSoundKey(prevText) : '';
    const filtered = items.filter((item) => {
      if (!prevText) return true;
      if (item.text === prevText) return false;
      if (strict && getSoundKey(item.text) === prevKey) return false;
      return true;
    });
    const pool = filtered.length ? filtered : items;
    const repeatPenalty = {
      emotionless: 0.7,
      timid: 0.8,
      shaken: 0.7,
      panic: 0.75,
      rage: 0.65,
    };
    const tonePenalty = repeatPenalty[currentTone] ?? 0.75;
    const total = pool.reduce((sum, item) => {
      const base = toneWeights[currentTone]?.[item.tone] || 1;
      const sameKey = !strict && prevKey && getSoundKey(item.text) === prevKey;
      const factor = sameKey ? tonePenalty : 1;
      return sum + base * factor;
    }, 0);
    let r = rng() * total;
    for (const item of pool) {
      const base = toneWeights[currentTone]?.[item.tone] || 1;
      const sameKey = !strict && prevKey && getSoundKey(item.text) === prevKey;
      const factor = sameKey ? tonePenalty : 1;
      r -= base * factor;
      if (r <= 0) return item.text;
    }
    return pool[pool.length - 1].text;
  }

  function pickByToneWithBias(items, biasFn) {
    const weights = toneWeights[currentTone] || toneWeights.emotionless;
    const total = items.reduce((sum, item) => {
      const base = weights[item.tone] || 1;
      return sum + base * biasFn(item.text);
    }, 0);
    let r = rng() * total;
    for (const item of items) {
      r -= (weights[item.tone] || 1) * biasFn(item.text);
      if (r <= 0) return item.text;
    }
    return items[items.length - 1].text;
  }

  function stripEllipsis(text) {
    return text.replace(/…+/g, '');
  }

  function compressEllipsis(text) {
    return text.replace(/…{2,}/g, '…');
  }

  function pickTextFromIntensity(sets) {
    const cfg = styleConfig[currentStyle];
    const bucket = pickFromIntensity(rng, sets, intensity, cfg.jitterLow, cfg.jitterHigh);
    return pickByTone(bucket);
  }

  function pickTextFromIntensityAvoid(sets, prevText, strict) {
    const cfg = styleConfig[currentStyle];
    const bucket = pickFromIntensity(rng, sets, intensity, cfg.jitterLow, cfg.jitterHigh);
    return pickByToneAvoid(bucket, prevText, strict);
  }

  function pickCutFromIntensityAvoid(sets, prevText, strict) {
    const picked = pickTextFromIntensityAvoid(sets, prevText, strict);
    const rates = getEllipsisRates();
    if (rng() < rates.cut) {
      return stripEllipsis(picked);
    }
    if (rng() < rates.compress) {
      return compressEllipsis(picked);
    }
    return picked;
  }

  function pickAfterFromIntensity(sets) {
    const cfg = styleConfig[currentStyle];
    const bucket = pickFromIntensity(rng, sets, intensity, cfg.jitterLow, cfg.jitterHigh);
    const biasFn = (text) => {
      const core = text.replace(/…/g, '');
      if (core.length <= 2) return 1.4;
      if (core.length <= 3) return 1.2;
      return 0.85;
    };
    // 余韻は短めを出やすくして間延びを抑える。
    const picked = pickByToneWithBias(bucket, biasFn);
    const rates = getEllipsisRates();
    return rng() < rates.after ? stripEllipsis(picked) : picked;
  }

  function pickAfterFromIntensityAvoid(sets, prevText, strict) {
    const cfg = styleConfig[currentStyle];
    const bucket = pickFromIntensity(rng, sets, intensity, cfg.jitterLow, cfg.jitterHigh);
    const biasFn = (text) => {
      const core = text.replace(/…/g, '');
      if (core.length <= 2) return 1.4;
      if (core.length <= 3) return 1.2;
      return 0.85;
    };
    const prevKey = prevText ? getSoundKey(prevText) : '';
    const filtered = bucket.filter((item) => {
      if (!prevText) return true;
      if (item.text === prevText) return false;
      if (strict && getSoundKey(item.text) === prevKey) return false;
      return true;
    });
    const pool = filtered.length ? filtered : bucket;
    const picked = pickByToneWithBias(pool, biasFn);
    const rates = getEllipsisRates();
    return rng() < rates.after ? stripEllipsis(picked) : picked;
  }

  function normalizeWeights(weights) {
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map((value) => Math.max(1, Math.round((value / total) * 100)));
  }

  function applyBias2(weights, biasType) {
    let [a, b] = weights;
    if (biasType === 'cut' || biasType === 'after') {
      b *= 1.3;
      a *= 0.7;
    } else if (biasType === 'cont') {
      a *= 1.3;
      b *= 0.7;
    }
    return normalizeWeights([a, b]);
  }

  function applyBias3(weights, biasType) {
    let [a, b, c] = weights;
    if (biasType === 'short') {
      a *= 1.3;
      b *= 0.9;
      c *= 0.8;
    } else if (biasType === 'long' || biasType === 'flat') {
      a *= 0.8;
      b *= 1.3;
      c *= 0.9;
    }
    return normalizeWeights([a, b, c]);
  }

  const lex = lexicon && lexicon.pre ? lexicon : null;
  if (!lex) {
    return '';
  }

  const pre = [lex.pre['1'], lex.pre['2'], lex.pre['3']];
  const cont = [lex.cont['1'], lex.cont['2'], lex.cont['3']];
  const cut = [lex.cut['1'], lex.cut['2'], lex.cut['3']];
  const after = [lex.after['1'], lex.after['2'], lex.after['3']];

  const parts = [];
  const flowMode = flow || 'none';
  const strictRepeat = length === 'xlong' || flowMode === 'sudden';
  const preVal = pickTextFromIntensity(pre);
  const contVal = pickTextFromIntensityAvoid(cont, preVal, strictRepeat);
  const cutVal = pickCutFromIntensityAvoid(cut, contVal, strictRepeat);
  const afterVal = pickAfterFromIntensityAvoid(after, cutVal, strictRepeat);
  const extraCont = pickTextFromIntensityAvoid(cont, contVal, strictRepeat);
  const extraCont2 = pickTextFromIntensityAvoid(cont, extraCont, strictRepeat);
  const extraCut = pickTextFromIntensityAvoid(cut, cutVal, strictRepeat);
  const extraAfter = pickAfterFromIntensityAvoid(after, afterVal, strictRepeat);

  function dropLeadingEllipsis(text) {
    return text.replace(/^…+/, '');
  }

  function pickPattern(patterns) {
    const total = patterns.reduce((sum, item) => sum + item.weight, 0);
    let r = rng() * total;
    for (const item of patterns) {
      r -= item.weight;
      if (r <= 0) {
        item.apply();
        return;
      }
    }
    patterns[patterns.length - 1].apply();
  }

  function buildDefault() {
    const cfg = styleConfig[currentStyle];
    const toneBias = toneStructureBias[currentTone] || toneStructureBias.emotionless;
    if (length === 'short') {
      const weights = applyBias2(toneBias.short, cfg.shortBias);
      pickPattern([
        { weight: weights[0], apply: () => parts.push(preVal, contVal) },
        { weight: weights[1], apply: () => parts.push(contVal, cutVal) },
      ]);
    } else if (length === 'medium') {
      if (currentTone === 'shaken') {
        pickPattern([
          { weight: toneBias.medium[0], apply: () => parts.push(preVal, contVal, cutVal) },
          { weight: toneBias.medium[1], apply: () => parts.push(preVal, contVal, afterVal) },
          { weight: toneBias.medium[2], apply: () => parts.push(preVal, contVal, extraCont, cutVal) },
        ]);
      } else {
        const weights = applyBias2(toneBias.medium, cfg.midBias);
        pickPattern([
          { weight: weights[0], apply: () => parts.push(preVal, contVal, cutVal) },
          { weight: weights[1], apply: () => parts.push(preVal, contVal, afterVal) },
        ]);
      }
    } else if (length === 'long') {
      // 長は構成パターンを複数用意して揺らぎを作る。
      let weights = applyBias3(toneBias.long, cfg.longBias);
      pickPattern([
        { weight: weights[0], apply: () => parts.push(preVal, contVal, cutVal, afterVal) },
        { weight: weights[1], apply: () => parts.push(preVal, contVal, extraCont, cutVal, afterVal) },
        { weight: weights[2], apply: () => parts.push(preVal, contVal, cutVal, afterVal, extraAfter) },
      ]);
    } else {
      let weights = applyBias3(toneBias.long, cfg.longBias);
      pickPattern([
        { weight: weights[0], apply: () => parts.push(preVal, contVal, extraCont, cutVal, afterVal, extraAfter) },
        { weight: weights[1], apply: () => parts.push(preVal, contVal, extraCont, cutVal, extraAfter, afterVal) },
        { weight: weights[2], apply: () => parts.push(preVal, contVal, extraCont, extraCont2, cutVal, afterVal, extraAfter) },
      ]);
    }
  }

  function buildSudden() {
    const suddenCont = dropLeadingEllipsis(contVal);
    const suddenExtraCont = dropLeadingEllipsis(extraCont);
    if (length === 'short') {
      parts.push(suddenCont, cutVal);
    } else if (length === 'medium') {
      parts.push(suddenCont, cutVal, afterVal);
    } else if (length === 'long') {
      parts.push(suddenCont, suddenExtraCont, cutVal, afterVal);
    } else {
      parts.push(suddenCont, suddenExtraCont, cutVal, afterVal);
    }
  }

  function buildEndure() {
    if (length === 'short') {
      pickPattern([
        { weight: 1, apply: () => parts.push(preVal, contVal) },
        { weight: 1, apply: () => parts.push(preVal, cutVal) },
      ]);
    } else if (length === 'medium') {
      pickPattern([
        { weight: 1, apply: () => parts.push(preVal, contVal, cutVal) },
        { weight: 1, apply: () => parts.push(preVal, contVal, afterVal) },
      ]);
    } else if (length === 'long') {
      parts.push(preVal, contVal, extraCut, cutVal, afterVal);
    } else {
      parts.push(preVal, contVal, extraCut, cutVal, afterVal, extraAfter);
    }
  }

  function buildContinuous() {
    if (length === 'short') {
      parts.push(contVal, extraCont);
    } else if (length === 'medium') {
      pickPattern([
        { weight: 1, apply: () => parts.push(preVal, contVal, extraCont) },
        { weight: 1, apply: () => parts.push(contVal, extraCont, cutVal) },
      ]);
    } else if (length === 'long') {
      parts.push(preVal, contVal, extraCont, cutVal, afterVal);
    } else {
      parts.push(preVal, contVal, extraCont, extraCont2, cutVal, afterVal, extraAfter);
    }
  }

  if (flowMode === 'sudden') {
    buildSudden();
  } else if (flowMode === 'endure') {
    buildEndure();
  } else if (flowMode === 'continuous') {
    buildContinuous();
  } else {
    buildDefault();
  }

  if (safePhrase) {
    const phraseVal = phraseMode === 'broken'
      ? breakPhrase(safePhrase, breakIntensity, rng, breakRules, breakWeights)
      : safePhrase;
    if (parts.length >= 2) {
      parts.splice(1, 0, phraseVal);
    } else {
      parts.push(phraseVal);
    }
  }

  return parts.join(' ');
}

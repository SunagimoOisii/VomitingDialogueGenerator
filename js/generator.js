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
  symbolOptions,
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
    emotionless: { short: [55, 45], medium: [55, 45], long: [35, 50, 15] },
    timid: { short: [80, 20], medium: [25, 75], long: [20, 30, 50] },
    shaken: { short: [30, 70], medium: [15, 15, 70], long: [10, 75, 15] },
    panic: { short: [25, 75], medium: [85, 15], long: [80, 15, 5] },
    rage: { short: [20, 80], medium: [85, 15], long: [85, 10, 5] },
  };

  const ellipsisTuning = {
    emotionless: { after: 0.45, cut: 0.45, compress: 0.7 },
    timid: { after: 0.5, cut: 0.45, compress: 0.7 },
    shaken: { after: 0.3, cut: 0.25, compress: 0.55 },
    panic: { after: 0.25, cut: 0.2, compress: 0.5 },
    rage: { after: 0.2, cut: 0.15, compress: 0.45 },
  };
  const symbolTuning = {
    emotionless: { rate: 1 },
    timid: { rate: 1 },
    shaken: { rate: 1 },
    panic: { rate: 1 },
    rage: { rate: 1 },
  };

  function clampRate(value, min = 0, max = 0.9) {
    return Math.max(min, Math.min(max, value));
  }

  function getEllipsisRates() {
    const base = ellipsisTuning[currentTone] || ellipsisTuning.emotionless;
    const boost = reduceEllipsis ? 0.15 : 0;
    const compressBoost = reduceEllipsis ? 0.1 : 0;
    const styleBoost = currentStyle === 'unsteady' ? 0.12 : currentStyle === 'restrained' ? -0.12 : 0;
    const styleCompress = currentStyle === 'unsteady' ? 0.08 : currentStyle === 'restrained' ? -0.08 : 0;
    return {
      after: clampRate(base.after + boost + styleBoost),
      cut: clampRate(base.cut + boost + styleBoost),
      compress: clampRate(base.compress + compressBoost + styleCompress),
    };
  }

  function pickSymbol() {
    const map = {
      '!': '！',
      '!?': '！？',
      '?!': '？！',
      '♡': '♡',
    };
    const options = (symbolOptions && symbolOptions.length ? symbolOptions : Object.keys(map))
      .map((key) => map[key])
      .filter(Boolean);
    if (!options.length) return '';
    return options[Math.floor(rng() * options.length)];
  }

  function applySymbolToCut(text) {
    if (!text) return text;
    if (!symbolTuning[currentTone]) return text;
    if (currentStyle === 'restrained') return text;
    const symbol = pickSymbol();
    if (!symbol) return text;
    const base = text.replace(/…+$/g, '');
    return `${base}${symbol}`;
  }

  function pickByTone(items) {
    const total = items.reduce((sum, item) => sum + getToneWeight(item), 0);
    let r = rng() * total;
    for (const item of items) {
      r -= getToneWeight(item);
      if (r <= 0) return item.text;
    }
    return items[items.length - 1].text;
  }

  function normalizeCore(text) {
    return text.replace(/[…,\s]/g, '').trim();
  }

  function getSoundKey(text) {
    const core = normalizeCore(text);
    return core.slice(0, 2);
  }

  function getSoundGroup(text) {
    const core = normalizeCore(text);
    const head = core[0] || '';
    if ('んむ'.includes(head)) return 'nasal';
    if ('はひふへほ'.includes(head)) return 'breath';
    if ('くけこぐげご'.includes(head)) return 'guttural';
    if ('うおえゔ'.includes(head)) return 'vowel';
    if ('がぎぐげご'.includes(head)) return 'harsh';
    return 'other';
  }

  function getToneWeight(item) {
    const weights = toneWeights[currentTone] || toneWeights.emotionless;
    const base = weights[item.tone] || 1;
    const levelBias = {
      0: { harsh: 0.6, intense: 0.7, neutral: 1, soft: 1.1 },
      1: { harsh: 0.85, intense: 0.95, neutral: 1, soft: 1.05 },
      2: { harsh: 1.15, intense: 1.2, neutral: 1, soft: 0.85 },
    };
    const bias = levelBias[intensity] || levelBias[1];
    const core = normalizeCore(item.text);
    const len = core.length;
    const styleBias = {
      restrained: len <= 2 ? 1.2 : 0.85,
      unsteady: len <= 2 ? 0.9 : 1.15,
      flat: 1,
      none: 1,
    };
    return base * (bias[item.tone] || 1) * (styleBias[currentStyle] || 1);
  }

  function pickByToneAvoid(items, prevText, strict) {
    const prevKey = prevText ? getSoundKey(prevText) : '';
    const prevGroup = prevText ? getSoundGroup(prevText) : '';
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
    const groupPenalty = 0.65;
    const total = pool.reduce((sum, item) => {
      const base = getToneWeight(item);
      const sameKey = !strict && prevKey && getSoundKey(item.text) === prevKey;
      const sameGroup = !strict && prevGroup && getSoundGroup(item.text) === prevGroup;
      const factor = (sameKey ? tonePenalty : 1) * (sameGroup ? groupPenalty : 1);
      return sum + base * factor;
    }, 0);
    let r = rng() * total;
    for (const item of pool) {
      const base = getToneWeight(item);
      const sameKey = !strict && prevKey && getSoundKey(item.text) === prevKey;
      const sameGroup = !strict && prevGroup && getSoundGroup(item.text) === prevGroup;
      const factor = (sameKey ? tonePenalty : 1) * (sameGroup ? groupPenalty : 1);
      r -= base * factor;
      if (r <= 0) return item.text;
    }
    return pool[pool.length - 1].text;
  }

  function pickByToneWithBias(items, biasFn) {
    const total = items.reduce((sum, item) => {
      const base = getToneWeight(item);
      return sum + base * biasFn(item.text);
    }, 0);
    let r = rng() * total;
    for (const item of items) {
      r -= getToneWeight(item) * biasFn(item.text);
      if (r <= 0) return item.text;
    }
    return items[items.length - 1].text;
  }

  function pickCutStrong() {
    const pool = cutFiltered[intensity] || [];
    if (!pool.length) return pickCutFromIntensityAvoid(cutFiltered, contVal, strictRepeat);
    const weightMap = { harsh: 2.2, intense: 1.8, neutral: 0.45, soft: 0.3 };
    const total = pool.reduce((sum, item) => sum + getToneWeight(item) * (weightMap[item.tone] || 1), 0);
    let r = rng() * total;
    for (const item of pool) {
      r -= getToneWeight(item) * (weightMap[item.tone] || 1);
      if (r <= 0) return item.text;
    }
    return pool[pool.length - 1].text;
  }

  function pickPreSoft() {
    const pool = pre[intensity] || [];
    if (!pool.length) return pickTextFromIntensity(pre);
    const weightMap = { soft: 1.7, neutral: 1.1, harsh: 0.6, intense: 0.6 };
    const total = pool.reduce((sum, item) => sum + getToneWeight(item) * (weightMap[item.tone] || 1), 0);
    let r = rng() * total;
    for (const item of pool) {
      r -= getToneWeight(item) * (weightMap[item.tone] || 1);
      if (r <= 0) return item.text;
    }
    return pool[pool.length - 1].text;
  }

  function pickContStrong() {
    const pool = contFiltered[intensity] || [];
    if (!pool.length) return pickTextFromIntensityAvoid(contFiltered, preVal, strictRepeat);
    const weightMap = { harsh: 1.6, intense: 1.6, neutral: 0.7, soft: 0.6 };
    const total = pool.reduce((sum, item) => sum + getToneWeight(item) * (weightMap[item.tone] || 1), 0);
    let r = rng() * total;
    for (const item of pool) {
      r -= getToneWeight(item) * (weightMap[item.tone] || 1);
      if (r <= 0) return item.text;
    }
    return pool[pool.length - 1].text;
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

  function applyBias4(weights, biasType) {
    let [a, b, c, d] = weights;
    if (biasType === 'short') {
      a *= 1.3;
      b *= 0.95;
      c *= 0.85;
      d *= 0.9;
    } else if (biasType === 'long' || biasType === 'flat') {
      a *= 0.75;
      b *= 1.25;
      c *= 1.05;
      d *= 1.15;
    }
    return normalizeWeights([a, b, c, d]);
  }

  const lex = lexicon && lexicon.pre ? lexicon : null;
  if (!lex) {
    return '';
  }

  const pre = [lex.pre['1'], lex.pre['2'], lex.pre['3']];
  const cont = [lex.cont['1'], lex.cont['2'], lex.cont['3']];
  const cut = [lex.cut['1'], lex.cut['2'], lex.cut['3']];
  const after = [lex.after['1'], lex.after['2'], lex.after['3']];

  function filterSetBy(setGroup, predicate) {
    return setGroup.map((bucket) => bucket.filter(predicate));
  }

  const isStandaloneVe = (item) => item.text.startsWith('ゔぇ');
  const isBurstWord = (item) => /おゔぇ|おえ|ゔぇ|うぇ|ぐえ/.test(item.text);
  const isBurstTone = () => currentTone === 'shaken' || currentTone === 'panic' || currentTone === 'rage';
  const burstEnabled = intensity >= 1 && isBurstTone();

  const contFiltered = filterSetBy(cont, (item) => {
    if (!burstEnabled && isBurstWord(item)) return false;
    return !isStandaloneVe(item);
  });
  const cutFiltered = filterSetBy(cut, (item) => {
    if (!burstEnabled && isBurstWord(item)) return false;
    if (intensity < 2 && isStandaloneVe(item)) return false;
    return true;
  });

  const parts = [];
  const flowMode = flow || 'none';
  const strictRepeat = length === 'xlong' || flowMode === 'sudden';
  const preVal = pickTextFromIntensity(pre);
  let endurePreVal = preVal;
  let burstCount = 0;
  const incBurstIfNeeded = (text) => {
    if (!text) return;
    if (/おゔぇ|おえ|ゔぇ|うぇ|ぐえ/.test(text)) burstCount += 1;
  };

  const contVal = pickTextFromIntensityAvoid(contFiltered, preVal, strictRepeat);
  incBurstIfNeeded(contVal);
  let cutVal = pickCutFromIntensityAvoid(cutFiltered, contVal, strictRepeat);
  cutVal = applySymbolToCut(cutVal);
  incBurstIfNeeded(cutVal);
  const afterVal = pickAfterFromIntensityAvoid(after, cutVal, strictRepeat);
  let extraCont = pickTextFromIntensityAvoid(contFiltered, contVal, strictRepeat);
  incBurstIfNeeded(extraCont);
  let extraCont2 = pickTextFromIntensityAvoid(contFiltered, extraCont, strictRepeat);
  incBurstIfNeeded(extraCont2);
  let extraCut = pickTextFromIntensityAvoid(cutFiltered, cutVal, strictRepeat);
  extraCut = applySymbolToCut(extraCut);
  incBurstIfNeeded(extraCut);
  const extraAfter = pickAfterFromIntensityAvoid(after, afterVal, strictRepeat);

  if (burstCount > 1) {
    const contNoBurst = filterSetBy(contFiltered, (item) => !isBurstWord(item));
    const cutNoBurst = filterSetBy(cutFiltered, (item) => !isBurstWord(item));
    if (isBurstWord(extraCont) && contNoBurst[intensity]?.length) {
      extraCont = pickTextFromIntensityAvoid(contNoBurst, contVal, strictRepeat);
    }
    if (isBurstWord(extraCont2) && contNoBurst[intensity]?.length) {
      extraCont2 = pickTextFromIntensityAvoid(contNoBurst, extraCont, strictRepeat);
    }
    if (isBurstWord(extraCut) && cutNoBurst[intensity]?.length) {
      extraCut = pickTextFromIntensityAvoid(cutNoBurst, cutVal, strictRepeat);
    }
    if (isBurstWord(cutVal) && cutNoBurst[intensity]?.length) {
      cutVal = pickCutFromIntensityAvoid(cutNoBurst, contVal, strictRepeat);
    }
  }

  const endurePre = pickPreSoft();
  const endureCont = pickTextFromIntensityAvoid(contFiltered, endurePre, strictRepeat);
  const endureCut = pickCutFromIntensityAvoid(cutFiltered, endureCont, strictRepeat);
  const endureExtraCut = pickTextFromIntensityAvoid(cutFiltered, endureCut, strictRepeat);

  const suddenCutStrong = dropLeadingEllipsis(pickCutStrong());
  const suddenContStrong = dropLeadingEllipsis(pickContStrong());

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
      if (currentStyle === 'restrained') {
        parts.push(preVal, contVal, cutVal);
      } else if (currentStyle === 'unsteady') {
        parts.push(preVal, contVal, extraCont, cutVal);
      } else if (currentStyle === 'flat') {
        parts.push(preVal, contVal, afterVal);
      } else if (currentTone === 'shaken') {
        const baseWeights = [
          toneBias.medium[0],
          toneBias.medium[1],
          toneBias.medium[2],
          Math.round(toneBias.medium[2] * 0.7),
        ];
        const weights = applyBias4(baseWeights, cfg.midBias);
        pickPattern([
          { weight: weights[0], apply: () => parts.push(preVal, contVal, cutVal) },
          { weight: weights[1], apply: () => parts.push(preVal, contVal, afterVal) },
          { weight: weights[2], apply: () => parts.push(preVal, contVal, extraCont, cutVal) },
          { weight: weights[3], apply: () => parts.push(preVal, contVal, extraCont, afterVal) },
        ]);
      } else {
        const baseWeights = [
          toneBias.medium[0],
          toneBias.medium[1],
          Math.round((toneBias.medium[0] + toneBias.medium[1]) * 0.35),
        ];
        const weights = applyBias3(baseWeights, cfg.midBias);
        pickPattern([
          { weight: weights[0], apply: () => parts.push(preVal, contVal, cutVal) },
          { weight: weights[1], apply: () => parts.push(preVal, contVal, afterVal) },
          { weight: weights[2], apply: () => parts.push(preVal, extraCont, cutVal) },
        ]);
      }
    } else if (length === 'long') {
      // 長は構成パターンを複数用意して揺らぎを作る。
      const baseWeights = [
        toneBias.long[0],
        toneBias.long[1],
        toneBias.long[2],
        Math.round((toneBias.long[0] + toneBias.long[1]) * 0.35),
      ];
      let weights = applyBias4(baseWeights, cfg.longBias);
      pickPattern([
        { weight: weights[0], apply: () => parts.push(preVal, contVal, cutVal, afterVal) },
        { weight: weights[1], apply: () => parts.push(preVal, contVal, extraCont, cutVal, afterVal) },
        { weight: weights[2], apply: () => parts.push(preVal, contVal, cutVal, afterVal, extraAfter) },
        { weight: weights[3], apply: () => parts.push(preVal, extraCont, cutVal, afterVal) },
      ]);
    } else {
      const baseWeights = [
        toneBias.long[0],
        toneBias.long[1],
        toneBias.long[2],
        Math.round((toneBias.long[0] + toneBias.long[1]) * 0.35),
      ];
      let weights = applyBias4(baseWeights, cfg.longBias);
      pickPattern([
        { weight: weights[0], apply: () => parts.push(preVal, contVal, extraCont, cutVal, afterVal, extraAfter) },
        { weight: weights[1], apply: () => parts.push(preVal, contVal, extraCont, cutVal, extraAfter, afterVal) },
        { weight: weights[2], apply: () => parts.push(preVal, contVal, extraCont, extraCont2, cutVal, afterVal, extraAfter) },
        { weight: weights[3], apply: () => parts.push(preVal, extraCont, extraCont2, cutVal, afterVal) },
      ]);
    }
  }

  function buildSudden() {
    const suddenCont = suddenContStrong;
    const suddenExtraCont = dropLeadingEllipsis(extraCont);
    const suddenCut = suddenCutStrong;
    if (length === 'short') {
      parts.push(suddenCut);
    } else if (length === 'medium') {
      parts.push(suddenCut, afterVal);
    } else if (length === 'long') {
      parts.push(suddenCont, suddenCut, afterVal);
    } else {
      parts.push(suddenCont, suddenExtraCont, suddenCut, afterVal);
    }
  }

  function buildEndure() {
    if (length === 'short') {
      parts.push(endurePre, endureCont, endureExtraCut, endureCut);
    } else if (length === 'medium') {
      parts.push(endurePre, endureCont, endureExtraCut, endureCut, afterVal);
    } else if (length === 'long') {
      parts.push(endurePre, endureCont, endureExtraCut, endureCut, afterVal);
    } else {
      parts.push(endurePre, endureCont, endureExtraCut, endureCut, afterVal, extraAfter);
    }
  }

  function buildContinuous() {
    if (length === 'short') {
      const contStrong = pickContStrong();
      parts.push(contStrong, contVal, extraCont);
    } else if (length === 'medium') {
      const contStrong = pickContStrong();
      parts.push(preVal, contStrong, contVal, extraCont, extraCont2, cutVal);
    } else if (length === 'long') {
      const contStrong = pickContStrong();
      parts.push(preVal, contStrong, contVal, extraCont, extraCont2, cutVal, afterVal);
    } else {
      const contStrong = pickContStrong();
      parts.push(preVal, contStrong, contVal, extraCont, extraCont2, cutVal, afterVal, extraAfter);
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

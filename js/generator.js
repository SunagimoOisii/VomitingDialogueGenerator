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

export function pickFromIntensity(rng, sets, intensity) {
  const roll = rng();
  let idx = intensity;
  // 同一強度に固定すると単調になるため、隣接強度に少し揺らす。
  if (roll < 0.15 && intensity > 0) idx = intensity - 1;
  if (roll > 0.85 && intensity < sets.length - 1) idx = intensity + 1;
  return pick(rng, sets[idx]);
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

export function breakPhrase(text, intensity, rng, rules) {
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
  const rule = enabled[Math.floor(rng() * enabled.length)];
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
  seedText,
}) {
  const safeSeed = sanitizeInput(seedText, MAX_SEED_LEN);
  const rng = safeSeed ? mulberry32(hashSeed(safeSeed)) : Math.random;

  const intensity = getIntensity(level);
  const safePhrase = sanitizeInput(phrase, MAX_PHRASE_LEN);

  const toneWeights = {
    harsh: { harsh: 3, neutral: 2, soft: 1 },
    neutral: { harsh: 1, neutral: 2, soft: 1 },
    soft: { harsh: 1, neutral: 2, soft: 3 },
  };
  const currentTone = 'harsh';

  function pickByTone(items) {
    const weights = toneWeights[currentTone] || toneWeights.neutral;
    const total = items.reduce((sum, item) => sum + (weights[item.tone] || 1), 0);
    let r = rng() * total;
    for (const item of items) {
      r -= weights[item.tone] || 1;
      if (r <= 0) return item.text;
    }
    return items[items.length - 1].text;
  }

  function pickTextFromIntensity(sets) {
    const bucket = pickFromIntensity(rng, sets, intensity);
    return pickByTone(bucket);
  }

  const pre = [
    [
      { text: 'うっ…', tone: 'neutral' },
      { text: 'ん…', tone: 'soft' },
      { text: '…っ', tone: 'neutral' },
      { text: 'う…', tone: 'soft' },
      { text: 'は…', tone: 'soft' },
      { text: 'ひっ…', tone: 'soft' },
      { text: 'お…', tone: 'soft' },
      { text: 'ぅ…', tone: 'soft' },
    ],
    [
      { text: 'うぐ…', tone: 'neutral' },
      { text: 'うう…', tone: 'neutral' },
      { text: '…っ…', tone: 'neutral' },
      { text: 'ん…っ', tone: 'neutral' },
      { text: 'はっ…', tone: 'soft' },
      { text: 'う゛…', tone: 'harsh' },
      { text: 'くっ…', tone: 'neutral' },
      { text: 'ん…う…', tone: 'soft' },
    ],
    [
      { text: 'う゛…', tone: 'harsh' },
      { text: 'ぐっ…', tone: 'harsh' },
      { text: 'げほっ…', tone: 'harsh' },
      { text: 'ぐ…っ', tone: 'harsh' },
      { text: 'う゛ぐ…', tone: 'harsh' },
      { text: 'がっ…', tone: 'harsh' },
      { text: 'ぐ゛…', tone: 'harsh' },
      { text: 'けほ…っ', tone: 'neutral' },
    ],
  ];
  const cont = [
    [
      { text: '…っ…', tone: 'neutral' },
      { text: '…ん…', tone: 'soft' },
      { text: '…こっ…', tone: 'neutral' },
      { text: '…っ', tone: 'neutral' },
      { text: '…んっ…', tone: 'soft' },
      { text: '…こ…', tone: 'soft' },
      { text: '…ん…っ', tone: 'neutral' },
      { text: '…っ…ん…', tone: 'neutral' },
    ],
    [
      { text: '…っ…っ…', tone: 'neutral' },
      { text: '…こっ…', tone: 'neutral' },
      { text: '…ぐ…', tone: 'neutral' },
      { text: '…ん…っ…', tone: 'neutral' },
      { text: '…こっ…っ…', tone: 'harsh' },
      { text: '…っ…ぐ…', tone: 'neutral' },
      { text: '…こ…っ…', tone: 'soft' },
      { text: '…ん…っ…っ…', tone: 'neutral' },
    ],
    [
      { text: '…っ…っ…っ…', tone: 'harsh' },
      { text: '…ごっ…', tone: 'harsh' },
      { text: '…ゔ…', tone: 'harsh' },
      { text: '…ぐっ…っ…', tone: 'harsh' },
      { text: '…っ…こっ…', tone: 'neutral' },
      { text: '…ごっ…っ…', tone: 'harsh' },
      { text: '…ゔ…っ…', tone: 'harsh' },
      { text: '…ぐ…っ…っ…', tone: 'harsh' },
    ],
  ];
  const cut = [
    [
      { text: 'はっ…', tone: 'neutral' },
      { text: 'けほ…', tone: 'neutral' },
      { text: 'ひゅっ…', tone: 'soft' },
      { text: 'は…', tone: 'soft' },
      { text: 'けほっ…', tone: 'neutral' },
      { text: 'ひっ…', tone: 'soft' },
      { text: 'はぁ…', tone: 'soft' },
      { text: 'かは…', tone: 'neutral' },
    ],
    [
      { text: 'かはっ…', tone: 'neutral' },
      { text: 'けほっ…', tone: 'neutral' },
      { text: 'はぁ…', tone: 'soft' },
      { text: 'はっ…は…', tone: 'neutral' },
      { text: 'けほ…っ', tone: 'neutral' },
      { text: 'はぁ…っ', tone: 'neutral' },
      { text: 'かは…っ', tone: 'neutral' },
      { text: 'ひゅ…っ', tone: 'soft' },
    ],
    [
      { text: 'がはっ…', tone: 'harsh' },
      { text: 'げほっ…', tone: 'harsh' },
      { text: 'はぁ…っ', tone: 'neutral' },
      { text: 'がは…っ', tone: 'harsh' },
      { text: 'げほ…っ', tone: 'harsh' },
      { text: 'がは…っ…', tone: 'harsh' },
      { text: 'けほ…っ', tone: 'neutral' },
      { text: 'げほ…っ…', tone: 'harsh' },
    ],
  ];
  const after = [
    [
      { text: 'はぁ…', tone: 'soft' },
      { text: '…はぁ', tone: 'soft' },
      { text: '…ふぅ', tone: 'soft' },
      { text: '…は…', tone: 'soft' },
      { text: '…ふぅ…', tone: 'soft' },
      { text: '…はぁ…', tone: 'soft' },
      { text: '…ふ…', tone: 'soft' },
      { text: '…は…っ', tone: 'neutral' },
    ],
    [
      { text: 'はぁ…はぁ…', tone: 'neutral' },
      { text: '…はぁ', tone: 'soft' },
      { text: '…ふぅ…', tone: 'soft' },
      { text: 'はぁ…っ', tone: 'neutral' },
      { text: '…はぁ…', tone: 'soft' },
      { text: '…はぁ…はぁ', tone: 'neutral' },
      { text: '…ふぅ…っ', tone: 'neutral' },
      { text: 'はぁ…は…', tone: 'soft' },
    ],
    [
      { text: 'はぁ…っ', tone: 'neutral' },
      { text: '…はぁ…っ', tone: 'neutral' },
      { text: '…はぁ…はぁ…', tone: 'neutral' },
      { text: 'はぁ…っ…', tone: 'neutral' },
      { text: '…はぁ…っ…', tone: 'neutral' },
      { text: '…はぁ…はぁ…っ', tone: 'neutral' },
      { text: 'はぁ…っ…はぁ', tone: 'neutral' },
      { text: '…はぁ…っ…っ', tone: 'neutral' },
    ],
  ];

  const parts = [];
  const preVal = pickTextFromIntensity(pre);
  const contVal = pickTextFromIntensity(cont);
  const cutVal = pickTextFromIntensity(cut);
  const afterVal = pickTextFromIntensity(after);

  if (length === 'short') {
    if (rng() < 0.5) {
      parts.push(preVal, contVal);
    } else {
      parts.push(contVal, cutVal);
    }
  } else if (length === 'medium') {
    if (rng() < 0.5) {
      parts.push(preVal, contVal, cutVal);
    } else {
      parts.push(preVal, contVal, afterVal);
    }
  } else {
    const extraCont = pickTextFromIntensity(cont);
    const extraAfter = pickTextFromIntensity(after);
    // 長は構成パターンを複数用意して揺らぎを作る。
    const roll = rng();
    if (roll < 0.34) {
      parts.push(preVal, contVal, cutVal, afterVal);
    } else if (roll < 0.68) {
      parts.push(preVal, contVal, extraCont, cutVal, afterVal);
    } else {
      parts.push(preVal, contVal, cutVal, afterVal, extraAfter);
    }
  }

  if (safePhrase) {
    const phraseVal = phraseMode === 'broken'
      ? breakPhrase(safePhrase, breakIntensity, rng, breakRules)
      : safePhrase;
    if (parts.length >= 2) {
      parts.splice(1, 0, phraseVal);
    } else {
      parts.push(phraseVal);
    }
  }

  return parts.join(' ');
}

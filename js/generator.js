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

  const pre = [
    ['うっ…', 'ん…', '…っ', 'う…', 'は…'],
    ['うぐ…', 'うう…', '…っ…', 'ん…っ', 'はっ…'],
    ['う゛…', 'ぐっ…', 'げほっ…', 'ぐ…っ', 'う゛ぐ…'],
  ];
  const cont = [
    ['…っ…', '…ん…', '…こっ…', '…っ', '…んっ…'],
    ['…っ…っ…', '…こっ…', '…ぐ…', '…ん…っ…', '…こっ…っ…'],
    ['…っ…っ…っ…', '…ごっ…', '…ゔ…', '…ぐっ…っ…', '…っ…こっ…'],
  ];
  const cut = [
    ['はっ…', 'けほ…', 'ひゅっ…', 'は…', 'けほっ…'],
    ['かはっ…', 'けほっ…', 'はぁ…', 'はっ…は…', 'けほ…っ'],
    ['がはっ…', 'げほっ…', 'はぁ…っ', 'がは…っ', 'げほ…っ'],
  ];
  const after = [
    ['はぁ…', '…はぁ', '…ふぅ', '…は…', '…ふぅ…'],
    ['はぁ…はぁ…', '…はぁ', '…ふぅ…', 'はぁ…っ', '…はぁ…'],
    ['はぁ…っ', '…はぁ…っ', '…はぁ…はぁ…', 'はぁ…っ…', '…はぁ…っ…'],
  ];

  const parts = [];
  const preVal = pickFromIntensity(rng, pre, intensity);
  const contVal = pickFromIntensity(rng, cont, intensity);
  const cutVal = pickFromIntensity(rng, cut, intensity);
  const afterVal = pickFromIntensity(rng, after, intensity);

  if (length === 'short') {
    parts.push(preVal, contVal);
  } else if (length === 'medium') {
    parts.push(preVal, contVal, cutVal);
  } else {
    const extraCont = pickFromIntensity(rng, cont, intensity);
    // 長はときどき継続音を追加して尺と勢いを確保する。
    if (rng() < 0.4) {
      parts.push(preVal, contVal, extraCont, cutVal, afterVal);
    } else {
      parts.push(preVal, contVal, cutVal, afterVal);
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

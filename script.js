const gate = document.querySelector('.gate');
const gateAgree = gate?.querySelector('.btn-primary');
const gateToggle = gate?.querySelector('input[type="checkbox"]');
const generateBtn = document.querySelector('#generate-btn');
const outputEl = document.querySelector('#output');

const levelInput = document.querySelector('#level-input');
const phraseInput = document.querySelector('#phrase-input');
const seedInput = document.querySelector('#seed-input');

const STORAGE_KEY = 'vomit-gen:skipGate';

function loadGatePreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveGatePreference(skip) {
  try {
    localStorage.setItem(STORAGE_KEY, skip ? '1' : '0');
  } catch {
    // ignore storage errors (private mode etc.)
  }
}

function showGate() {
  gate?.classList.add('is-visible');
}

function hideGate() {
  gate?.classList.remove('is-visible');
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function getActiveSegValue(name) {
  const seg = document.querySelector(`.seg[data-seg="${name}"]`);
  const active = seg?.querySelector('.seg-btn.is-active');
  return active?.dataset.value || '';
}

function getIntensity(level) {
  const num = Number(level) || 3;
  if (num <= 2) return 0;
  if (num === 3) return 1;
  return 2;
}

function breakPhrase(text) {
  if (!text) return '';
  const cut = Math.max(1, Math.floor(text.length * 0.7));
  return `${text.slice(0, cut)}…`;
}

function generateLine() {
  const seedText = seedInput?.value?.trim() || '';
  const rng = seedText ? mulberry32(hashSeed(seedText)) : Math.random;

  const intensity = getIntensity(levelInput?.value);
  const length = getActiveSegValue('length') || 'medium';
  const phrase = phraseInput?.value?.trim() || '';
  const phraseMode = getActiveSegValue('phrase-mode') || 'raw';

  const pre = [
    ['うっ…', 'ん…', '…っ'],
    ['うぐ…', 'うう…', '…っ…'],
    ['う゛…', 'ぐっ…', 'げほっ…'],
  ];
  const cont = [
    ['…っ…', '…ん…', '…こっ…'],
    ['…っ…っ…', '…こっ…', '…ぐ…'],
    ['…っ…っ…っ…', '…ごっ…', '…ゔ…'],
  ];
  const cut = [
    ['はっ…', 'けほ…', 'ひゅっ…'],
    ['かはっ…', 'けほっ…', 'はぁ…'],
    ['がはっ…', 'げほっ…', 'はぁ…っ'],
  ];
  const after = [
    ['はぁ…', '…はぁ', '…ふぅ'],
    ['はぁ…はぁ…', '…はぁ', '…ふぅ…'],
    ['はぁ…っ', '…はぁ…っ', '…はぁ…はぁ…'],
  ];

  const parts = [];
  const preVal = pick(rng, pre[intensity]);
  const contVal = pick(rng, cont[intensity]);
  const cutVal = pick(rng, cut[intensity]);
  const afterVal = pick(rng, after[intensity]);

  if (length === 'short') {
    parts.push(preVal, contVal);
  } else if (length === 'medium') {
    parts.push(preVal, contVal, cutVal);
  } else {
    parts.push(preVal, contVal, cutVal, afterVal);
  }

  if (phrase) {
    const phraseVal = phraseMode === 'broken' ? breakPhrase(phrase) : phrase;
    if (parts.length >= 2) {
      parts.splice(1, 0, phraseVal);
    } else {
      parts.push(phraseVal);
    }
  }

  return parts.join(' ');
}

function generateAndRender() {
  const text = generateLine();
  if (outputEl) {
    outputEl.textContent = text;
  }
}

if (gate) {
  const skip = loadGatePreference();
  if (!skip) {
    showGate();
  } else {
    hideGate();
    generateAndRender();
  }

  gateAgree?.addEventListener('click', () => {
    const skipNext = !!gateToggle?.checked;
    saveGatePreference(skipNext);
    hideGate();
    generateAndRender();
  });
}

generateBtn?.addEventListener('click', () => {
  generateAndRender();
});

// simple segmented button state
for (const seg of document.querySelectorAll('.seg')) {
  seg.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn');
    if (!btn) return;
    for (const sibling of seg.querySelectorAll('.seg-btn')) {
      sibling.classList.remove('is-active');
    }
    btn.classList.add('is-active');
  });
}

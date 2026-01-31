const gate = document.querySelector('.gate');
const gateAgree = gate?.querySelector('.btn-primary');
const gateToggle = gate?.querySelector('input[type="checkbox"]');
const generateBtn = document.querySelector('#generate-btn');
const copyBtn = document.querySelector('#copy-btn');
const historyAddBtn = document.querySelector('#history-add-btn');
const historyClearBtn = document.querySelector('#history-clear-btn');
const historyList = document.querySelector('#history-list');
const historyEmpty = document.querySelector('#history-empty');
const outputEl = document.querySelector('#output');

const levelInput = document.querySelector('#level-input');
const phraseInput = document.querySelector('#phrase-input');
const seedInput = document.querySelector('#seed-input');
const breakExampleItems = document.querySelectorAll('.break-examples-list li');

const STORAGE_KEY = 'vomit-gen:skipGate';
const HISTORY_KEY = 'vomit-gen:history';
const MAX_HISTORY = 50;
const MAX_PHRASE_LEN = 40;
const MAX_SEED_LEN = 40;

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

function sanitizeInput(text, maxLen) {
  if (!text) return '';
  const trimmed = text.trim().slice(0, maxLen);
  return trimmed.replace(/[<>]/g, '');
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.text === 'string');
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

function renderHistory() {
  if (!historyList || !historyEmpty) return;
  const list = loadHistory();
  historyList.innerHTML = '';
  if (list.length === 0) {
    historyEmpty.style.display = 'block';
    return;
  }
  historyEmpty.style.display = 'none';
  for (const item of list) {
    const li = document.createElement('li');
    const text = document.createElement('div');
    text.className = 'history-text';
    text.textContent = item.text;
    const del = document.createElement('button');
    del.className = 'mini';
    del.textContent = '削除';
    del.addEventListener('click', () => {
      removeHistoryItem(item.id);
    });
    li.append(text, del);
    historyList.append(li);
  }
}

function addHistoryItem(text) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
  };
  const list = loadHistory();
  list.unshift(entry);
  const trimmed = list.slice(0, MAX_HISTORY);
  saveHistory(trimmed);
  renderHistory();
}

function removeHistoryItem(id) {
  const list = loadHistory().filter((item) => item.id !== id);
  saveHistory(list);
  renderHistory();
}

function clearHistory() {
  saveHistory([]);
  renderHistory();
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

function pickFromIntensity(rng, sets, intensity) {
  const roll = rng();
  let idx = intensity;
  if (roll < 0.15 && intensity > 0) idx = intensity - 1;
  if (roll > 0.85 && intensity < sets.length - 1) idx = intensity + 1;
  return pick(rng, sets[idx]);
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

function getBreakIntensity(value) {
  if (value === 'weak') return 0;
  if (value === 'strong') return 2;
  return 1;
}

function getEnabledBreakRules() {
  const checks = document.querySelectorAll('input[name="break-rule"]');
  const enabled = [];
  for (const input of checks) {
    if (input instanceof HTMLInputElement && input.checked) {
      enabled.push(input.value);
    }
  }
  return enabled.length ? enabled : ['cut', 'sokuon', 'choke', 'repeat', 'split'];
}

function applyBreakRule(rule, head, tail) {
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

function breakPhrase(text, intensity, rng, rules) {
  if (!text) return '';
  const cleaned = text.replace(/[A-Za-z0-9]/g, '').replace(/ー/g, '').trim();
  if (!cleaned) return '';
  const remainRate = intensity === 0 ? 0.8 : intensity === 1 ? 0.6 : 0.4;
  const baseLen = Math.max(1, Math.floor(cleaned.length * remainRate));
  const head = cleaned.slice(0, baseLen);
  const tailStart = Math.max(1, Math.floor(cleaned.length * 0.5));
  const tail = cleaned.slice(tailStart);
  const enabled = rules && rules.length ? rules : ['cut', 'sokuon', 'choke', 'repeat', 'split'];
  const rule = enabled[Math.floor(rng() * enabled.length)];
  return applyBreakRule(rule, head, tail);
}

function makeBreakExample(text, intensity, rule) {
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

function updateBreakExamples() {
  if (!breakExampleItems.length) return;
  const phrase = sanitizeInput(phraseInput?.value, MAX_PHRASE_LEN);
  const breakIntensity = getBreakIntensity(getActiveSegValue('phrase-break'));
  for (const item of breakExampleItems) {
    const rule = item.getAttribute('data-rule') || '';
    const text = makeBreakExample(phrase, breakIntensity, rule);
    const target = item.querySelector('.ex-text');
    if (target) target.textContent = text;
  }
}

function generateLine() {
  const seedText = sanitizeInput(seedInput?.value, MAX_SEED_LEN);
  const rng = seedText ? mulberry32(hashSeed(seedText)) : Math.random;

  const intensity = getIntensity(levelInput?.value);
  const length = getActiveSegValue('length') || 'medium';
  const phrase = sanitizeInput(phraseInput?.value, MAX_PHRASE_LEN);
  const phraseMode = getActiveSegValue('phrase-mode') || 'raw';
  const breakIntensity = getBreakIntensity(getActiveSegValue('phrase-break'));
  const breakRules = getEnabledBreakRules();

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
    if (rng() < 0.4) {
      parts.push(preVal, contVal, extraCont, cutVal, afterVal);
    } else {
      parts.push(preVal, contVal, cutVal, afterVal);
    }
  }

  if (phrase) {
    const phraseVal = phraseMode === 'broken'
      ? breakPhrase(phrase, breakIntensity, rng, breakRules)
      : phrase;
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
  return text;
}

if (gate) {
  const skip = loadGatePreference();
  if (!skip) {
    showGate();
  } else {
    hideGate();
  }

  gateAgree?.addEventListener('click', () => {
    const skipNext = !!gateToggle?.checked;
    saveGatePreference(skipNext);
    hideGate();
  });
}

generateBtn?.addEventListener('click', () => {
  generateAndRender();
});

historyAddBtn?.addEventListener('click', () => {
  const text = outputEl?.textContent?.trim();
  if (!text) return;
  addHistoryItem(text);
});

historyClearBtn?.addEventListener('click', () => {
  clearHistory();
});

copyBtn?.addEventListener('click', async () => {
  const text = outputEl?.textContent?.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore clipboard errors
  }
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
    if (btn.closest('.seg')?.getAttribute('data-seg') === 'phrase-break') {
      updateBreakExamples();
    }
  });
}

renderHistory();
updateBreakExamples();

phraseInput?.addEventListener('input', () => {
  updateBreakExamples();
});

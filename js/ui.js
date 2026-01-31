import {
  loadGatePreference,
  saveGatePreference,
  loadHistory,
  addHistoryItem,
  removeHistoryItem,
  clearHistory,
  MAX_PHRASE_LEN,
} from './state.js';
import {
  generateLine,
  getBreakIntensity,
  makeBreakExample,
  sanitizeInput,
} from './generator.js';
import { loadLexicon } from './lexicon.js';

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
let lexicon = null;

function getActiveSegValue(name) {
  const seg = document.querySelector(`.seg[data-seg="${name}"]`);
  const active = seg?.querySelector('.seg-btn.is-active');
  return active?.dataset.value || '';
}

function getEnabledBreakRules() {
  const checks = document.querySelectorAll('input[name="break-rule"]');
  const enabled = [];
  for (const input of checks) {
    if (input instanceof HTMLInputElement && input.checked) {
      enabled.push(input.value);
    }
  }
  // 全OFFでも例が生成できるよう既定ルールに戻す。
  return enabled.length ? enabled : ['cut', 'sokuon', 'choke', 'repeat', 'split'];
}

function showGate() {
  gate?.classList.add('is-visible');
}

function hideGate() {
  gate?.classList.remove('is-visible');
}

function renderHistory(list = loadHistory()) {
  if (!historyList || !historyEmpty) return;
  historyList.innerHTML = '';
  if (list.length === 0) {
    // 空表示は文言で明示してスクロールを空にしない。
    historyEmpty.style.display = 'block';
    return;
  }
  historyEmpty.style.display = 'none';
  for (const item of list) {
    const li = document.createElement('li');
    const text = document.createElement('div');
    text.className = 'history-text';
    text.textContent = item.text;
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = formatParams(item.params);
    const actions = document.createElement('div');
    actions.className = 'history-actions-inline';
    const restore = document.createElement('button');
    restore.className = 'mini';
    restore.textContent = '復元';
    restore.addEventListener('click', () => {
      applyParams(item.params);
      generateAndRender();
    });
    const del = document.createElement('button');
    del.className = 'mini';
    del.textContent = '削除';
    del.addEventListener('click', () => {
      const next = removeHistoryItem(item.id);
      renderHistory(next);
    });
    actions.append(restore, del);
    li.append(text, meta, actions);
    historyList.append(li);
  }
}

function setSegActive(name, value) {
  const seg = document.querySelector(`.seg[data-seg="${name}"]`);
  if (!seg) return;
  for (const btn of seg.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('is-active', btn.getAttribute('data-value') === value);
  }
}

function applyParams(params) {
  if (!params) return;
  if (levelInput) levelInput.value = params.level ?? '3';
  setSegActive('length', params.length || 'medium');
  setSegActive('tone', params.tone || 'harsh');
  setSegActive('flow', params.flow || 'none');
  if (phraseInput) phraseInput.value = params.phrase || '';
  setSegActive('phrase-mode', params.phraseMode || 'raw');
  setSegActive('phrase-break', params.breakIntensity || 'mid');
  if (seedInput) seedInput.value = params.seedText || '';
  const checks = document.querySelectorAll('input[name="break-rule"]');
  const enabled = new Set(params.breakRules || []);
  for (const input of checks) {
    if (input instanceof HTMLInputElement) {
      input.checked = enabled.has(input.value);
    }
  }
  updateBreakExamples();
}

function formatParams(params) {
  if (!params) return 'パラメータ未記録';
  const toneMap = {
    harsh: '苦しめ',
    soft: '弱め',
    neutral: '淡々',
    intense: '追い込み',
  };
  const lengthMap = {
    short: '短',
    medium: '中',
    long: '長',
    xlong: '超長',
  };
  const flowMap = {
    none: '指定なし',
    sudden: '突然',
    endure: '耐えて',
    continuous: '連続',
  };
  const breakMap = {
    weak: '弱',
    mid: '中',
    strong: '強',
  };
  const ruleMap = {
    cut: '末尾カット',
    sokuon: '促音',
    choke: '詰まり',
    repeat: '繰り返し',
    split: '分断',
  };
  const base = [
    `Lv${params.level ?? '-'}`,
    lengthMap[params.length] || '中',
    toneMap[params.tone] || '苦しめ',
    flowMap[params.flow] || '指定なし',
    `途切れ:${breakMap[params.breakIntensity] || '中'}`,
  ];
  const rules = params.breakRules?.length
    ? `ルール:${params.breakRules.map((rule) => ruleMap[rule] || rule).join(',')}`
    : '';
  const phrase = params.phrase ? `フレーズ:${params.phrase}` : '';
  const seed = params.seedText ? `シード:${params.seedText}` : '';
  return [...base, rules, phrase, seed].filter(Boolean).join('・');
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

function generateAndRender() {
  const text = generateLine({
    level: levelInput?.value,
    length: getActiveSegValue('length') || 'medium',
    tone: getActiveSegValue('tone') || 'harsh',
    flow: getActiveSegValue('flow') || 'none',
    phrase: phraseInput?.value,
    phraseMode: getActiveSegValue('phrase-mode') || 'raw',
    breakIntensity: getBreakIntensity(getActiveSegValue('phrase-break')),
    breakRules: getEnabledBreakRules(),
    seedText: seedInput?.value,
    lexicon,
  });

  if (outputEl) {
    outputEl.textContent = text || '語彙データを読み込めませんでした';
  }
  return text;
}

export function initUI() {
  loadLexicon().then((data) => {
    lexicon = data;
  });

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
    const params = {
      level: levelInput?.value,
      length: getActiveSegValue('length') || 'medium',
      tone: getActiveSegValue('tone') || 'harsh',
      flow: getActiveSegValue('flow') || 'none',
      phrase: phraseInput?.value?.trim() || '',
      phraseMode: getActiveSegValue('phrase-mode') || 'raw',
      breakIntensity: getActiveSegValue('phrase-break') || 'mid',
      breakRules: getEnabledBreakRules(),
      seedText: seedInput?.value?.trim() || '',
    };
    const next = addHistoryItem({ text, params });
    renderHistory(next);
  });

  historyClearBtn?.addEventListener('click', () => {
    const next = clearHistory();
    renderHistory(next);
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

  phraseInput?.addEventListener('input', () => {
    updateBreakExamples();
  });

  renderHistory();
  updateBreakExamples();

}

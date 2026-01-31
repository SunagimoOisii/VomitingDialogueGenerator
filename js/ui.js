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
    const del = document.createElement('button');
    del.className = 'mini';
    del.textContent = '削除';
    del.addEventListener('click', () => {
      const next = removeHistoryItem(item.id);
      renderHistory(next);
    });
    li.append(text, del);
    historyList.append(li);
  }
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
    phrase: phraseInput?.value,
    phraseMode: getActiveSegValue('phrase-mode') || 'raw',
    breakIntensity: getBreakIntensity(getActiveSegValue('phrase-break')),
    breakRules: getEnabledBreakRules(),
    seedText: seedInput?.value,
  });

  if (outputEl) {
    outputEl.textContent = text;
  }
  return text;
}

export function initUI() {
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
    const next = addHistoryItem(text);
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

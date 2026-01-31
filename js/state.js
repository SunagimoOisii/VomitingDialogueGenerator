export const STORAGE_KEY = 'vomit-gen:skipGate';
export const HISTORY_KEY = 'vomit-gen:history';
export const MAX_HISTORY = 50;
export const MAX_PHRASE_LEN = 40;
export const MAX_SEED_LEN = 40;

export function loadGatePreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // 保存不可な環境でも動作を止めないため、失敗時は既定値に戻す。
    return false;
  }
}

export function saveGatePreference(skip) {
  try {
    localStorage.setItem(STORAGE_KEY, skip ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.text === 'string');
  } catch {
    // 破損データがあっても画面を壊さないよう空配列扱いにする。
    return [];
  }
}

export function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

export function addHistoryItem(text) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
  };
  const list = loadHistory();
  list.unshift(entry);
  // 上限超過は古い順に切り捨てる。
  const trimmed = list.slice(0, MAX_HISTORY);
  saveHistory(trimmed);
  return trimmed;
}

export function removeHistoryItem(id) {
  const list = loadHistory().filter((item) => item.id !== id);
  saveHistory(list);
  return list;
}

export function clearHistory() {
  saveHistory([]);
  return [];
}

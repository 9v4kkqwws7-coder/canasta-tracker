const TARGET = 5000;
const KEY = 'canastaTrackerDataV2';
const SYNC_KEY = 'canastaTrackerSyncV1';

let state = load();
let syncConfig = loadSyncConfig();
let syncTimer = null;

function fresh() {
  return {
    current: { startedAt: new Date().toISOString(), rounds: [] },
    games: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizeRound(r) {
  return {
    ...r,
    mu: Number(r?.mu || 0),
    as: Number(r?.as || 0),
    redMu: clampRedThree(r?.redMu),
    redAs: clampRedThree(r?.redAs)
  };
}

function normalizeState(saved) {
  if (!saved || typeof saved !== 'object') return fresh();
  const current = saved.current && typeof saved.current === 'object' ? saved.current : {};
  return {
    ...saved,
    current: {
      ...current,
      startedAt: current.startedAt || new Date().toISOString(),
      rounds: Array.isArray(current.rounds) ? current.rounds.map(normalizeRound) : []
    },
    games: Array.isArray(saved.games) ? saved.games.map(g => ({
      ...g,
      rounds: Array.isArray(g.rounds) ? g.rounds.map(normalizeRound) : []
    })) : [],
    updatedAt: saved.updatedAt || new Date(0).toISOString()
  };
}

function clampRedThree(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(4, Math.trunc(n)));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved ? normalizeState(saved) : fresh();
  } catch {
    return fresh();
  }
}

function loadSyncConfig() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY)) || { workerUrl: '', key: '' };
  } catch {
    return { workerUrl: '', key: '' };
  }
}

function persist({ remote = true } = {}) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
  if (remote && syncReady()) schedulePush();
}

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function totals(rounds = state.current.rounds) {
  return rounds.reduce((a, r) => ({ mu: a.mu + Number(r.mu), as: a.as + Number(r.as) }), { mu: 0, as: 0 });
}

function redThreeBonus(count) {
  const n = clampRedThree(count);
  return n === 4 ? 800 : n * 100;
}

function redThreeStats(rounds = []) {
  return rounds.reduce((a, r) => {
    const mu = clampRedThree(r.redMu);
    const as = clampRedThree(r.redAs);
    a.muCount += mu;
    a.asCount += as;
    a.muBonus += redThreeBonus(mu);
    a.asBonus += redThreeBonus(as);
    if (mu === 4) a.muFour++;
    if (as === 4) a.asFour++;
    return a;
  }, { muCount: 0, asCount: 0, muBonus: 0, asBonus: 0, muFour: 0, asFour: 0 });
}

function fmt(n) { return new Intl.NumberFormat('de-DE').format(n); }
function dateFmt(s) { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(s)); }

function render() {
  const t = totals();
  $('#muTotal').textContent = fmt(t.mu);
  $('#asTotal').textContent = fmt(t.as);
  $('#muRemaining').textContent = t.mu >= TARGET ? 'Ziel erreicht' : `Noch ${fmt(TARGET - t.mu)}`;
  $('#asRemaining').textContent = t.as >= TARGET ? 'Ziel erreicht' : `Noch ${fmt(TARGET - t.as)}`;
  $('#roundHeading').textContent = `Runde ${state.current.rounds.length + 1}`;
  updateRedThreePreview();

  const rl = $('#roundsList');
  rl.innerHTML = '';
  if (!state.current.rounds.length) {
    rl.textContent = 'Noch keine Runde gespeichert.';
    rl.className = 'list empty';
  } else {
    rl.className = 'list';
    let c = { mu: 0, as: 0 };
    state.current.rounds.forEach((r, i) => {
      c.mu += +r.mu; c.as += +r.as;
      const redMu = clampRedThree(r.redMu);
      const redAs = clampRedThree(r.redAs);
      const redLine = redMu || redAs
        ? `<div class="red-three-meta">Rote Dreien: MU ${redMu} (${fmt(redThreeBonus(redMu))}) · AS ${redAs} (${fmt(redThreeBonus(redAs))})</div>`
        : '';
      const d = document.createElement('div');
      d.className = 'row';
      d.innerHTML = `<div><strong>Runde ${i + 1}: MU ${fmt(r.mu)} · AS ${fmt(r.as)}</strong><div class="round-meta">Gesamt: ${fmt(c.mu)} : ${fmt(c.as)}</div>${redLine}</div><button data-edit="${i}">Ändern</button><button data-del="${i}">Löschen</button>`;
      rl.appendChild(d);
    });
  }

  const hl = $('#historyList');
  hl.innerHTML = '';
  if (!state.games.length) {
    hl.textContent = 'Noch keine beendeten Spiele.';
    hl.className = 'list empty';
  } else {
    hl.className = 'list';
    [...state.games].reverse().forEach((g, rev) => {
      const i = state.games.length - 1 - rev;
      const t = totals(g.rounds);
      const reds = redThreeStats(g.rounds);
      const winner = t.mu === t.as ? 'Unentschieden' : t.mu > t.as ? 'MU' : 'AS';
      const d = document.createElement('div');
      d.className = 'row';
      d.innerHTML = `<div><strong>${dateFmt(g.finishedAt)} · ${winner}</strong><div class="history-meta">MU ${fmt(t.mu)} : ${fmt(t.as)} AS · ${g.rounds.length} Runden</div><div class="red-three-meta">Rote Dreien: MU ${reds.muCount} · AS ${reds.asCount}</div></div><button data-load="${i}">Ansehen</button><button data-game-del="${i}">Löschen</button>`;
      hl.appendChild(d);
    });
  }

  renderStats();
  renderSyncSettings();
}

function renderStats() {
  const games = state.games;
  let muWins = 0, asWins = 0, totalRounds = 0, bestMu = null, bestAs = null;
  const allRounds = [];
  games.forEach(g => {
    const t = totals(g.rounds);
    if (t.mu > t.as) muWins++; else if (t.as > t.mu) asWins++;
    totalRounds += g.rounds.length;
    g.rounds.forEach(r => {
      allRounds.push(r);
      bestMu = bestMu === null ? +r.mu : Math.max(bestMu, +r.mu);
      bestAs = bestAs === null ? +r.as : Math.max(bestAs, +r.as);
    });
  });
  allRounds.push(...state.current.rounds);
  const reds = redThreeStats(allRounds);
  const vals = [
    ['Spiele', games.length], ['Siege MU', muWins], ['Siege AS', asWins],
    ['MU Siegquote', games.length ? `${Math.round(muWins / games.length * 100)} %` : '–'],
    ['Ø Runden', games.length ? (totalRounds / games.length).toFixed(1) : '–'],
    ['Beste MU-Runde', bestMu ?? '–'], ['Beste AS-Runde', bestAs ?? '–'],
    ['Rote Dreien MU', reds.muCount], ['Rote Dreien AS', reds.asCount],
    ['Dreier-Wert MU', `${fmt(reds.muBonus)} P`], ['Dreier-Wert AS', `${fmt(reds.asBonus)} P`],
    ['4er-Sätze MU', reds.muFour], ['4er-Sätze AS', reds.asFour],
    ['Gespeicherte Runden', allRounds.length]
  ];
  $('#statsGrid').innerHTML = vals.map(([k, v]) => `<article class="stat"><strong>${v}</strong><span>${k}</span></article>`).join('');
}

function readRedThreeInputs(muSelector = '#redMuInput', asSelector = '#redAsInput') {
  const redMu = clampRedThree($(muSelector)?.value || 0);
  const redAs = clampRedThree($(asSelector)?.value || 0);
  if (redMu + redAs > 4) return null;
  return { redMu, redAs };
}

function updateRedThreePreview() {
  const muInput = $('#redMuInput');
  const asInput = $('#redAsInput');
  const preview = $('#redThreePreview');
  if (!muInput || !asInput || !preview) return;
  const values = readRedThreeInputs();
  if (!values) {
    preview.textContent = 'Es gibt pro Runde insgesamt nur vier rote Dreien.';
    preview.classList.add('warning');
    return;
  }
  preview.classList.remove('warning');
  preview.textContent = `Auswertung: MU ${fmt(redThreeBonus(values.redMu))} P · AS ${fmt(redThreeBonus(values.redAs))} P (nicht automatisch addiert)`;
}

function saveRound() {
  const mu = $('#muInput').value, as = $('#asInput').value;
  if (mu === '' || as === '') return alert('Bitte Punkte für MU und AS eingeben.');
  const reds = readRedThreeInputs();
  if (!reds) return alert('Pro Runde gibt es insgesamt höchstens vier rote Dreien. Bitte Eingabe prüfen.');
  state.current.rounds.push({ mu: +mu, as: +as, ...reds });
  $('#muInput').value = ''; $('#asInput').value = '';
  $('#redMuInput').value = '0'; $('#redAsInput').value = '0';
  const t = totals();
  persist();
  if (t.mu >= TARGET || t.as >= TARGET) {
    setTimeout(() => { if (confirm(`Ziel erreicht (${fmt(t.mu)} : ${fmt(t.as)}). Spiel beenden?`)) finishGame(); }, 50);
  }
}

function finishGame() {
  if (!state.current.rounds.length) return alert('Noch keine Runde gespeichert.');
  state.games.push({ startedAt: state.current.startedAt, finishedAt: new Date().toISOString(), rounds: structuredClone(state.current.rounds) });
  state.current = { startedAt: new Date().toISOString(), rounds: [] };
  persist();
}

$('#saveRoundBtn').onclick = saveRound;
$('#finishGameBtn').onclick = finishGame;
$('#newGameBtn').onclick = () => {
  if (state.current.rounds.length && !confirm('Aktuelles Spiel verwerfen und neu beginnen?')) return;
  state.current = { startedAt: new Date().toISOString(), rounds: [] };
  persist();
};
$('#undoBtn').onclick = () => {
  if (state.current.rounds.length && confirm('Letzte Runde löschen?')) { state.current.rounds.pop(); persist(); }
};

$('#redMuInput').oninput = updateRedThreePreview;
$('#redAsInput').oninput = updateRedThreePreview;

$$('.tab').forEach(b => b.onclick = () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.view').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $('#' + b.dataset.view).classList.add('active');
});

document.addEventListener('click', e => {
  const ed = e.target.dataset.edit;
  if (ed !== undefined) {
    const r = state.current.rounds[+ed];
    $('#editIndex').value = ed;
    $('#editMu').value = r.mu;
    $('#editAs').value = r.as;
    $('#editRedMu').value = clampRedThree(r.redMu);
    $('#editRedAs').value = clampRedThree(r.redAs);
    $('#editDialog').showModal();
  }
  const del = e.target.dataset.del;
  if (del !== undefined && confirm('Diese Runde löschen?')) { state.current.rounds.splice(+del, 1); persist(); }
  const gd = e.target.dataset.gameDel;
  if (gd !== undefined && confirm('Dieses gespeicherte Spiel löschen?')) { state.games.splice(+gd, 1); persist(); }
  const ld = e.target.dataset.load;
  if (ld !== undefined) {
    const g = state.games[+ld], t = totals(g.rounds), reds = redThreeStats(g.rounds);
    alert(`${dateFmt(g.finishedAt)}\nMU ${fmt(t.mu)} : ${fmt(t.as)} AS\n${g.rounds.length} Runden\n\nRote Dreien\nMU: ${reds.muCount} · Auswertungswert ${fmt(reds.muBonus)} P\nAS: ${reds.asCount} · Auswertungswert ${fmt(reds.asBonus)} P`);
  }
});

$('#saveEditBtn').onclick = e => {
  e.preventDefault();
  const i = +$('#editIndex').value;
  const reds = readRedThreeInputs('#editRedMu', '#editRedAs');
  if (!reds) return alert('Pro Runde gibt es insgesamt höchstens vier rote Dreien. Bitte Eingabe prüfen.');
  state.current.rounds[i] = { mu: +$('#editMu').value, as: +$('#editAs').value, ...reds };
  $('#editDialog').close();
  persist();
};

$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `canasta-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#importInput').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d.current || !Array.isArray(d.games)) throw new Error();
    if (confirm('Vorhandene Daten durch dieses Backup ersetzen?')) { state = normalizeState(d); persist(); }
  } catch { alert('Ungültige Backup-Datei.'); }
  e.target.value = '';
};

$('#resetBtn').onclick = () => {
  if (confirm('Wirklich alle Canasta-Daten auf diesem Gerät löschen?')) { state = fresh(); persist(); }
};

function syncReady() {
  return !!(syncConfig.workerUrl && syncConfig.key);
}

function cleanWorkerUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function renderSyncSettings() {
  const urlInput = $('#workerUrlInput');
  const keyInput = $('#syncKeyInput');
  if (!urlInput || !keyInput) return;
  if (document.activeElement !== urlInput) urlInput.value = syncConfig.workerUrl || '';
  if (document.activeElement !== keyInput) keyInput.value = syncConfig.key || '';
  if (!syncReady()) setSyncStatus('GitHub-Sync noch nicht eingerichtet.');
}

function setSyncStatus(text, isError = false) {
  const el = $('#syncStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#fca5a5' : '';
}

async function syncFetch(path, options = {}) {
  if (!syncReady()) throw new Error('Sync nicht eingerichtet');
  const res = await fetch(`${cleanWorkerUrl(syncConfig.workerUrl)}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Canasta-Key': syncConfig.key,
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function schedulePush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushRemote(false), 500);
}

async function pushRemote(showStatus = true) {
  if (!syncReady()) return;
  try {
    if (showStatus) setSyncStatus('Synchronisiere mit GitHub …');
    await syncFetch('/state', { method: 'PUT', body: JSON.stringify(state) });
    setSyncStatus(`Mit GitHub synchronisiert · ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    setSyncStatus(`Sync fehlgeschlagen: ${err.message}. Lokale Daten bleiben erhalten.`, true);
  }
}

async function syncNow() {
  if (!syncReady()) return alert('Bitte zuerst Worker-URL und Sync-Schlüssel eintragen.');
  setSyncStatus('Prüfe GitHub-Datenstand …');
  try {
    const remote = await syncFetch('/state', { method: 'GET' });
    if (!remote.state) {
      await pushRemote(true);
      return;
    }

    const remoteState = normalizeState(remote.state);
    const localTime = Date.parse(state.updatedAt || 0) || 0;
    const remoteTime = Date.parse(remoteState.updatedAt || 0) || 0;

    if (remoteTime > localTime) {
      state = remoteState;
      localStorage.setItem(KEY, JSON.stringify(state));
      render();
      setSyncStatus('Neueren Datenstand aus GitHub geladen.');
    } else if (localTime > remoteTime) {
      await pushRemote(true);
    } else {
      setSyncStatus('Lokaler und GitHub-Datenstand sind identisch.');
    }
  } catch (err) {
    setSyncStatus(`Sync fehlgeschlagen: ${err.message}`, true);
  }
}

$('#saveSyncBtn').onclick = () => {
  const workerUrl = cleanWorkerUrl($('#workerUrlInput').value);
  const key = $('#syncKeyInput').value.trim();
  if (!workerUrl || !key) return alert('Bitte Worker-URL und Sync-Schlüssel eingeben.');
  syncConfig = { workerUrl, key };
  localStorage.setItem(SYNC_KEY, JSON.stringify(syncConfig));
  setSyncStatus('Sync-Zugang gespeichert.');
  syncNow();
};

$('#syncNowBtn').onclick = syncNow;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
render();
if (syncReady()) setTimeout(syncNow, 250);

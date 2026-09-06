// Mobile usability + red-three display patch.
// Keeps the existing data model and GitHub sync fully compatible.

(() => {
  function redCountsOnly() {
    const mu = clampRedThree($('#redMuInput')?.value || 0);
    const as = clampRedThree($('#redAsInput')?.value || 0);
    const preview = $('#redThreePreview');
    if (!preview) return;

    if (mu + as > 4) {
      preview.textContent = 'Es gibt pro Runde insgesamt nur vier rote Dreien.';
      preview.classList.add('warning');
      return;
    }

    preview.classList.remove('warning');
    preview.textContent = `Anzahl: MU ${mu} · AS ${as}`;
  }

  // Replace the former points preview. The stored redMu/redAs values stay unchanged.
  updateRedThreePreview = redCountsOnly;

  // Statistics: red threes are counts only; no derived points or 4-set scoring.
  renderStats = function () {
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
      ['Gespeicherte Runden', allRounds.length]
    ];
    $('#statsGrid').innerHTML = vals.map(([k, v]) => `<article class="stat"><strong>${v}</strong><span>${k}</span></article>`).join('');
  };

  function sanitizeRedThreeText() {
    redCountsOnly();

    const note = document.querySelector('.red-three-box .rule-note');
    if (note && note.textContent !== 'Erfasst wird nur die Anzahl der roten Dreien.') {
      note.textContent = 'Erfasst wird nur die Anzahl der roten Dreien.';
    }

    document.querySelectorAll('.red-three-meta').forEach(el => {
      const m = el.textContent.match(/^Rote Dreien: MU (\d+)(?: \([^)]*\))? · AS (\d+)(?: \([^)]*\))?$/);
      if (m) {
        const clean = `Rote Dreien: MU ${m[1]} · AS ${m[2]}`;
        if (el.textContent !== clean) el.textContent = clean;
      }
    });
  }

  function addSignToggle(inputId) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.signReady === '1') return;
    input.dataset.signReady = '1';
    input.dataset.negative = Number(input.value) < 0 ? '1' : '0';

    const holder = document.createElement('div');
    holder.className = 'signed-number';
    input.parentNode.insertBefore(holder, input);
    holder.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sign-toggle';
    button.setAttribute('aria-label', 'Vorzeichen wechseln');
    holder.appendChild(button);

    const paint = () => {
      const neg = input.dataset.negative === '1';
      button.textContent = neg ? '−' : '±';
      button.classList.toggle('active', neg);
    };

    const applySign = () => {
      if (input.value === '') return;
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      const abs = Math.abs(n);
      input.value = input.dataset.negative === '1' ? String(-abs) : String(abs);
    };

    button.addEventListener('click', () => {
      input.dataset.negative = input.dataset.negative === '1' ? '0' : '1';
      applySign();
      paint();
      input.focus();
    });

    input.addEventListener('input', () => {
      if (input.value !== '') applySign();
    });

    input.addEventListener('change', () => {
      if (input.value !== '') input.dataset.negative = Number(input.value) < 0 ? '1' : '0';
      paint();
    });

    input._applyCanastaSign = applySign;
    input._resetCanastaSign = () => {
      input.dataset.negative = '0';
      paint();
    };
    paint();
  }

  const style = document.createElement('style');
  style.textContent = `
    .signed-number { display: grid; grid-template-columns: minmax(0,1fr) 52px; gap: 8px; align-items: stretch; }
    .signed-number input { min-width: 0; }
    .sign-toggle { margin-top: 6px; border: 1px solid #4b5563; border-radius: 10px; background: #1f2937; color: #f9fafb; font-size: 23px; font-weight: 800; min-height: 46px; }
    .sign-toggle.active { background: #7f1d1d; border-color: #ef4444; color: #fff; }
  `;
  document.head.appendChild(style);

  ['muInput', 'asInput', 'editMu', 'editAs'].forEach(addSignToggle);

  // Ensure the selected sign is applied before the existing save handlers run.
  $('#saveRoundBtn')?.addEventListener('click', () => {
    $('#muInput')?._applyCanastaSign?.();
    $('#asInput')?._applyCanastaSign?.();
    setTimeout(() => {
      if ($('#muInput')?.value === '') $('#muInput')?._resetCanastaSign?.();
      if ($('#asInput')?.value === '') $('#asInput')?._resetCanastaSign?.();
    }, 0);
  }, true);

  $('#saveEditBtn')?.addEventListener('click', () => {
    $('#editMu')?._applyCanastaSign?.();
    $('#editAs')?._applyCanastaSign?.();
  }, true);

  // When an existing round is opened for editing, reflect its stored sign.
  document.addEventListener('click', e => {
    if (e.target?.dataset?.edit !== undefined) {
      setTimeout(() => {
        ['editMu', 'editAs'].forEach(id => {
          const input = document.getElementById(id);
          if (!input) return;
          input.dataset.negative = Number(input.value) < 0 ? '1' : '0';
          const btn = input.parentElement?.querySelector('.sign-toggle');
          if (btn) {
            const neg = input.dataset.negative === '1';
            btn.textContent = neg ? '−' : '±';
            btn.classList.toggle('active', neg);
          }
        });
      }, 0);
    }
  }, true);

  // Replace the old game-detail alert so red threes are shown only as counts.
  document.addEventListener('click', e => {
    const ld = e.target?.dataset?.load;
    if (ld === undefined) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const g = state.games[+ld];
    if (!g) return;
    const t = totals(g.rounds);
    const reds = redThreeStats(g.rounds);
    alert(`${dateFmt(g.finishedAt)}\nMU ${fmt(t.mu)} : ${fmt(t.as)} AS\n${g.rounds.length} Runden\n\nRote Dreien\nMU: ${reds.muCount}\nAS: ${reds.asCount}`);
  }, true);

  const observer = new MutationObserver(() => sanitizeRedThreeText());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  render();
  sanitizeRedThreeText();
})();

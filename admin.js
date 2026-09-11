/**
 * admin.js
 * 管理画面のメインロジック
 */

// =============================================
// 状態管理
// =============================================
let appState = {
  tournament: null,
  settings: {
    title: '',
    numPlayers: 8,
    playerNames: [],
    playerCategories: [],
    colors: {
      bg: '#1a1a2e',
      bgOpacity: 1,
      slot: '#16213e',
      slotWin: '#e94560',
      slotBye: '#2a2a3e',
      text: '#eaeaea',
      line: '#4a4a6a',
      lineWin: '#e94560',
      accent: '#0f3460',
      labelText: '#8888aa',
      byeText: '#444466'
    },
    displayWidth: {
      enabled: false,
      value: 1200
    },
    logos: []
  },
  selectedMatch: null
};

// ロゴのレイヤー表示ラベル
const LOGO_LAYER_LABELS = {
  front: '前面（ブラケットの上）',
  back: '背面（透かし）'
};

// ロゴのドラッグ/リサイズ状態
let logoDrag = null;

// カラープリセット
const PRESETS = {
  dark: {
    bg: '#1a1a2e', bgOpacity: 1,
    slot: '#16213e', slotWin: '#e94560', slotBye: '#2a2a3e',
    text: '#eaeaea', line: '#4a4a6a', lineWin: '#e94560',
    accent: '#0f3460', labelText: '#8888aa', byeText: '#444466'
  },
  light: {
    bg: '#f0f4ff', bgOpacity: 1,
    slot: '#ffffff', slotWin: '#e74c3c', slotBye: '#e8e8f0',
    text: '#222244', line: '#aaaacc', lineWin: '#e74c3c',
    accent: '#c8d4ff', labelText: '#6666aa', byeText: '#99a0c8'
  },
  ocean: {
    bg: '#001529', bgOpacity: 1,
    slot: '#003366', slotWin: '#00c8ff', slotBye: '#001f44',
    text: '#cce8ff', line: '#0055aa', lineWin: '#00c8ff',
    accent: '#004488', labelText: '#6699cc', byeText: '#335577'
  },
  forest: {
    bg: '#0d1f0f', bgOpacity: 1,
    slot: '#1a3a1e', slotWin: '#2ecc71', slotBye: '#0f2212',
    text: '#c8f0cc', line: '#2a5c2e', lineWin: '#2ecc71',
    accent: '#1a4a1e', labelText: '#66aa77', byeText: '#3a5a3e'
  },
  fire: {
    bg: '#1a0a00', bgOpacity: 1,
    slot: '#2d1200', slotWin: '#ff6600', slotBye: '#1a0800',
    text: '#ffe8cc', line: '#662200', lineWin: '#ff6600',
    accent: '#331100', labelText: '#aa7755', byeText: '#5a3a22'
  },
  bitblock: {
    bg: '#0a0a0a', bgOpacity: 1,
    slot: '#161616', slotWin: '#e0142c', slotBye: '#141414',
    text: '#ffffff', titleText: '#ffffff', line: '#ffffff', lineWin: '#e0142c',
    accent: '#333333', labelText: '#cccccc', byeText: '#555555'
  }
};

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  bindEvents();

  if (appState.tournament) {
    restoreUI();
  }
});

function loadFromStorage() {
  const saved = TournamentLib.loadTournament();
  if (saved) {
    appState.tournament = saved.tournament;
    appState.settings = { ...appState.settings, ...saved.settings };
  }
  if (!Array.isArray(appState.settings.logos)) {
    appState.settings.logos = [];
  }
}

function restoreUI() {
  // フォーム値を復元
  document.getElementById('input-title').value = appState.settings.title || '';
  document.getElementById('input-num').value = appState.settings.numPlayers || 8;

  // 色を復元
  applyColorsToUI(appState.settings.colors);

  // 表示幅設定を復元
  applyDisplayWidthToUI(appState.settings.displayWidth);

  // プレイヤーリストを復元
  buildPlayerNameList(appState.settings.numPlayers);
  const names = appState.settings.playerNames || [];
  const categories = appState.settings.playerCategories || [];
  document.querySelectorAll('.player-name-input').forEach((inp, i) => {
    inp.value = names[i] || '';
  });
  document.querySelectorAll('.player-category-input').forEach((inp, i) => {
    inp.value = categories[i] || '';
  });

  // セクション表示
  document.getElementById('players-section').style.display = '';
  document.getElementById('design-section').style.display = '';
  document.getElementById('logos-section').style.display = '';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('tournament-wrapper').style.display = '';

  renderLogoList();
  updateTournamentDisplay();
}

// =============================================
// イベントバインド
// =============================================
function bindEvents() {
  // 参加人数 ±ボタン
  document.getElementById('num-minus').addEventListener('click', () => {
    const inp = document.getElementById('input-num');
    inp.value = Math.max(2, parseInt(inp.value) - 1);
  });
  document.getElementById('num-plus').addEventListener('click', () => {
    const inp = document.getElementById('input-num');
    inp.value = Math.min(64, parseInt(inp.value) + 1);
  });

  // 生成ボタン
  document.getElementById('btn-generate').addEventListener('click', onGenerate);

  // 名前反映
  document.getElementById('btn-apply-names').addEventListener('click', onApplyNames);

  // リセット
  document.getElementById('btn-reset').addEventListener('click', onReset);

  // カラーピッカー
  ['bg', 'slot', 'win', 'text', 'bye'].forEach(key => {
    const mapKey = key === 'win' ? 'slotWin' : (key === 'bye' ? 'byeText' : key);
    const inp = document.getElementById(`color-${key}`);
    if (!inp) return;
    inp.addEventListener('input', () => {
      document.getElementById(`color-${key}-label`).textContent = inp.value;
      appState.settings.colors[mapKey] = inp.value;
      updateTournamentDisplay();
      saveState();
    });
  });

  // 透過スライダー
  document.getElementById('range-opacity').addEventListener('input', function () {
    document.getElementById('opacity-val').textContent = `${this.value}%`;
    appState.settings.colors.bgOpacity = this.value / 100;
    updateTournamentDisplay();
    saveState();
  });

  // 投影画面の表示幅 固定トグル
  document.getElementById('toggle-fixed-width').addEventListener('change', function () {
    appState.settings.displayWidth.enabled = this.checked;
    document.getElementById('fixed-width-group').style.display = this.checked ? '' : 'none';
    saveState();
    showToast(this.checked ? '投影画面の表示幅を固定しました' : '投影画面の表示幅を自動フィットに戻しました');
  });

  // 表示幅スライダー
  const widthSlider = document.getElementById('range-display-width');
  widthSlider.addEventListener('input', function () {
    appState.settings.displayWidth.value = parseInt(this.value);
    document.getElementById('display-width-val').textContent = `${this.value}px`;
    saveState();
  });

  // 表示幅 ±ボタン
  document.getElementById('width-minus').addEventListener('click', () => {
    const v = Math.max(400, parseInt(widthSlider.value) - 20);
    widthSlider.value = v;
    appState.settings.displayWidth.value = v;
    document.getElementById('display-width-val').textContent = `${v}px`;
    saveState();
  });
  document.getElementById('width-plus').addEventListener('click', () => {
    const v = Math.min(3000, parseInt(widthSlider.value) + 20);
    widthSlider.value = v;
    appState.settings.displayWidth.value = v;
    document.getElementById('display-width-val').textContent = `${v}px`;
    saveState();
  });

  // プリセット
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;
      appState.settings.colors = { ...preset };
      applyColorsToUI(preset);
      updateTournamentDisplay();
      saveState();
      showToast(`プリセット「${btn.title}」を適用しました`);
    });
  });

  // タイトル変更
  document.getElementById('input-title').addEventListener('input', function () {
    appState.settings.title = this.value;
    if (appState.tournament) {
      updateTournamentDisplay();
      saveState();
    }
  });

  // モーダル
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-reset').addEventListener('click', onModalReset);

  // SVG クリック（イベント委譲）
  document.getElementById('tournament-svg').addEventListener('click', onSvgClick);

  // 画像・ロゴ追加
  document.getElementById('btn-add-logo').addEventListener('click', () => {
    document.getElementById('logo-file-input').click();
  });
  document.getElementById('logo-file-input').addEventListener('change', onLogoFileSelected);

  // ロゴのドラッグ移動・リサイズ（SVG上でマウス/タッチ操作）
  const svgEl = document.getElementById('tournament-svg');
  svgEl.addEventListener('pointerdown', onLogoPointerDown);
  document.addEventListener('pointermove', onLogoPointerMove);
  document.addEventListener('pointerup', onLogoPointerUp);
  document.addEventListener('pointercancel', onLogoPointerUp);
}

// =============================================
// トーナメント生成
// =============================================
function onGenerate() {
  const title = document.getElementById('input-title').value.trim() || 'トーナメント大会';
  const num = Math.min(64, Math.max(2, parseInt(document.getElementById('input-num').value) || 8));

  document.getElementById('input-title').value = title;
  document.getElementById('input-num').value = num;

  appState.settings.title = title;
  appState.settings.numPlayers = num;

  // 名前リスト（以前の名前を引き継ぐ）
  const oldNames = appState.settings.playerNames || [];
  const names = [];
  for (let i = 0; i < num; i++) names.push(oldNames[i] || '');
  appState.settings.playerNames = names;

  const oldCategories = appState.settings.playerCategories || [];
  const categories = [];
  for (let i = 0; i < num; i++) categories.push(oldCategories[i] || '');
  appState.settings.playerCategories = categories;

  // トーナメント生成
  appState.tournament = TournamentLib.generateTournament(num, names, categories);

  // UI 更新
  buildPlayerNameList(num);

  document.getElementById('players-section').style.display = '';
  document.getElementById('design-section').style.display = '';
  document.getElementById('logos-section').style.display = '';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('tournament-wrapper').style.display = '';

  renderLogoList();
  updateTournamentDisplay();
  saveState();
  showToast(`${num}人のトーナメント表を生成しました！`, 'success');
}

// =============================================
// 参加者名リスト作成
// =============================================
function buildPlayerNameList(num) {
  const container = document.getElementById('player-names-list');
  container.innerHTML = '';
  const names = appState.settings.playerNames || [];
  const categories = appState.settings.playerCategories || [];

  for (let i = 0; i < num; i++) {
    const row = document.createElement('div');
    row.className = 'player-name-row';

    const idx = document.createElement('span');
    idx.className = 'player-index';
    idx.textContent = `${i + 1}.`;

    const inputsWrap = document.createElement('div');
    inputsWrap.className = 'player-inputs-wrap';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'player-name-input';
    inp.placeholder = `Player ${i + 1}`;
    inp.maxLength = 20;
    inp.value = names[i] || '';
    inp.dataset.index = i;

    const catInp = document.createElement('input');
    catInp.type = 'text';
    catInp.className = 'player-category-input';
    catInp.placeholder = 'カテゴリー（例：hiphop）';
    catInp.maxLength = 20;
    catInp.value = categories[i] || '';
    catInp.dataset.index = i;

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        catInp.focus();
      }
    });
    catInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const nextRow = container.querySelectorAll('.player-name-input')[i + 1];
        if (nextRow) nextRow.focus();
      }
    });

    inputsWrap.appendChild(inp);
    inputsWrap.appendChild(catInp);

    row.appendChild(idx);
    row.appendChild(inputsWrap);
    container.appendChild(row);
  }
}

// =============================================
// 名前反映
// =============================================
function onApplyNames() {
  const inputs = document.querySelectorAll('.player-name-input');
  const names = [];
  inputs.forEach((inp, i) => {
    names[i] = inp.value.trim();
  });
  appState.settings.playerNames = names;

  const catInputs = document.querySelectorAll('.player-category-input');
  const categories = [];
  catInputs.forEach((inp, i) => {
    categories[i] = inp.value.trim();
  });
  appState.settings.playerCategories = categories;

  // トーナメントを名前付きで再生成（勝敗の「結果」は保持したいが、
  // 勝者オブジェクトを丸ごとコピーすると古い名前のまま残ってしまうため、
  // どちらのスロット（player1/player2）が勝ったかだけを引き継ぎ、
  // setMatchWinner で新しい名前付きデータに対して再度勝者を確定する）
  const oldTournament = appState.tournament;
  const newTournament = TournamentLib.generateTournament(names.length, names, categories);

  if (oldTournament) {
    const numRounds = oldTournament.rounds.length;
    for (let r = 0; r < numRounds; r++) {
      const ids = oldTournament.rounds[r].matches;
      ids.forEach(id => applyOldWinnerToNewTournament(oldTournament.matches[id], newTournament));
    }
    if (oldTournament.thirdPlaceMatchId) {
      applyOldWinnerToNewTournament(oldTournament.matches[oldTournament.thirdPlaceMatchId], newTournament);
    }
  }

  appState.tournament = newTournament;

  updateTournamentDisplay();
  saveState();
  showToast('参加者名を反映しました', 'success');
}

// 旧トーナメントで手動確定していた勝者を、新しい（名前更新済みの）
// トーナメントに対して同じスロットで再確定する
function applyOldWinnerToNewTournament(oldMatch, newTournament) {
  if (!oldMatch || !oldMatch.winner) return;
  // BYEによる自動勝ち上がりは再生成時に自動で解決されるためスキップ
  if (oldMatch.winner.isBye || oldMatch.winner.autoAdvanced) return;

  const newMatch = newTournament.matches[oldMatch.id];
  if (!newMatch) return;

  let slot = null;
  if (oldMatch.player1 && oldMatch.winner.id !== undefined && oldMatch.player1.id === oldMatch.winner.id) {
    slot = 'player1';
  } else if (oldMatch.player2 && oldMatch.winner.id !== undefined && oldMatch.player2.id === oldMatch.winner.id) {
    slot = 'player2';
  }
  if (!slot) return;

  // 新しい試合の対応スロットにまだ両者が揃っていない場合は反映不可（不整合防止）
  if (!newMatch.player1 || !newMatch.player2) return;
  if (!newMatch.player1.name || !newMatch.player2.name) return;
  if (newMatch.player1.isBye || newMatch.player2.isBye) return;

  TournamentLib.setMatchWinner(newTournament, oldMatch.id, slot);
}

// =============================================
// SVG クリックで勝者選択
// =============================================
function onSvgClick(e) {
  const target = e.target;
  const matchId = target.getAttribute('data-match-id');
  const slot = target.getAttribute('data-slot');

  if (!matchId || !slot) return;

  const match = appState.tournament.matches[matchId];
  if (!match) return;

  const p1 = match.player1;
  const p2 = match.player2;

  // 両プレイヤーが揃っているか確認
  if (!p1 || !p2 || p1.isBye || p2.isBye) return;
  if (!p1.name || !p2.name) {
    showToast('前のラウンドの結果が確定していません', 'error');
    return;
  }

  openModal(match);
}

// =============================================
// 勝者選択モーダル
// =============================================
function openModal(match) {
  appState.selectedMatch = match;
  const modal = document.getElementById('winner-modal');
  const info = document.getElementById('modal-match-info');
  const players = document.getElementById('modal-players');

  let roundLabel;
  if (match.isThirdPlace) {
    roundLabel = '🥉 3位決定戦';
  } else {
    const numRounds = appState.tournament.rounds.length;
    const roundNames = ['1回戦', '2回戦', '3回戦', '4回戦', '5回戦', '準々決勝', '準決勝', '決勝'];
    if (match.roundIndex === numRounds - 1) {
      roundLabel = '決勝';
    } else if (match.roundIndex === numRounds - 2) {
      roundLabel = numRounds > 2 ? '準決勝' : '1回戦';
    } else if (match.roundIndex === numRounds - 3) {
      roundLabel = '準々決勝';
    } else {
      roundLabel = `第${match.roundIndex + 1}回戦`;
    }
  }
  info.textContent = match.isThirdPlace ? roundLabel : `${roundLabel} − 試合 ${match.matchIndex + 1}`;

  players.innerHTML = '';

  [{ slot: 'player1', player: match.player1 }, { slot: 'player2', player: match.player2 }].forEach(({ slot, player }) => {
    if (!player || player.isBye) return;

    const btn = document.createElement('button');
    btn.className = 'modal-player-btn';
    if (match.winner && match.winner.name === player.name) {
      btn.style.borderColor = '#e94560';
      btn.style.background = 'rgba(233,69,96,0.2)';
    }

    btn.innerHTML = `
      <span class="player-num">${slot === 'player1' ? 'Player A' : 'Player B'}</span>
      <span>${player.name || `---`}</span>
      ${match.winner && match.winner.name === player.name ? '<i class="fas fa-trophy" style="color:#e94560;margin-left:auto"></i>' : ''}
    `;
    btn.addEventListener('click', () => {
      TournamentLib.setMatchWinner(appState.tournament, match.id, slot);
      updateTournamentDisplay();
      saveState();
      closeModal();
      showToast(`${player.name} が勝利しました 🎉`, 'success');
    });
    players.appendChild(btn);
  });

  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('winner-modal').style.display = 'none';
  appState.selectedMatch = null;
}

function onModalReset() {
  if (!appState.selectedMatch) return;
  TournamentLib.resetMatchWinner(appState.tournament, appState.selectedMatch.id);
  updateTournamentDisplay();
  saveState();
  closeModal();
  showToast('結果をリセットしました');
}

// モーダル外クリックで閉じる
document.getElementById('winner-modal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

// =============================================
// トーナメント表示更新
// =============================================
function updateTournamentDisplay() {
  if (!appState.tournament) return;

  const titleEl = document.getElementById('tournament-title-display');
  titleEl.textContent = appState.settings.title || 'トーナメント大会';

  const meta = document.getElementById('tournament-meta');
  const n = appState.settings.numPlayers;
  const total = appState.tournament.total;
  const byeCount = total - n;
  meta.textContent = `参加人数: ${n}人${byeCount > 0 ? ` (シード: ${byeCount}枠)` : ''}  |  ${appState.tournament.rounds.length} ラウンド`;

  const svg = document.getElementById('tournament-svg');
  DrawLib.drawTournament(svg, appState.tournament, appState.settings, true);
}

// =============================================
// リセット
// =============================================
function onReset() {
  if (!confirm('トーナメント表をリセットしますか？\nこの操作は取り消せません。')) return;
  localStorage.removeItem('tournamentData');
  appState.tournament = null;
  appState.settings.playerNames = [];
  appState.settings.playerCategories = [];

  document.getElementById('players-section').style.display = 'none';
  document.getElementById('design-section').style.display = 'none';
  document.getElementById('logos-section').style.display = 'none';
  document.getElementById('empty-state').style.display = '';
  document.getElementById('tournament-wrapper').style.display = 'none';
  document.getElementById('input-title').value = '';
  document.getElementById('input-num').value = 8;

  appState.settings.logos = [];
  renderLogoList();

  // 投影ページに通知
  try {
    const bc = new BroadcastChannel('tournament_channel');
    bc.postMessage({ type: 'RESET' });
    bc.close();
  } catch (e) {}

  showToast('リセットしました');
}

// =============================================
// 保存
// =============================================
function saveState() {
  TournamentLib.saveTournament(appState.tournament, appState.settings);
}

// =============================================
// カラーUI反映
// =============================================
function applyColorsToUI(colors) {
  const map = {
    bg: 'bg', slot: 'slot', slotWin: 'win', text: 'text', byeText: 'bye'
  };
  for (const [key, domKey] of Object.entries(map)) {
    const inp = document.getElementById(`color-${domKey}`);
    const lbl = document.getElementById(`color-${domKey}-label`);
    if (inp && colors[key]) {
      inp.value = colors[key];
      if (lbl) lbl.textContent = colors[key];
    }
  }
  if (colors.bgOpacity !== undefined) {
    const pct = Math.round(colors.bgOpacity * 100);
    document.getElementById('range-opacity').value = pct;
    document.getElementById('opacity-val').textContent = `${pct}%`;
  }
}

// =============================================
// 表示幅UI反映
// =============================================
function applyDisplayWidthToUI(displayWidth) {
  const dw = displayWidth || { enabled: false, value: 1200 };
  document.getElementById('toggle-fixed-width').checked = !!dw.enabled;
  document.getElementById('fixed-width-group').style.display = dw.enabled ? '' : 'none';
  const val = dw.value || 1200;
  document.getElementById('range-display-width').value = val;
  document.getElementById('display-width-val').textContent = `${val}px`;
}

// =============================================
// 画像・ロゴ管理
// =============================================
function onLogoFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('画像ファイルを選択してください', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    showToast('画像サイズが大きすぎます（4MB以下にしてください）', 'error');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function (evt) {
    const dataUrl = evt.target.result;
    const img = new Image();
    img.onload = function () {
      const aspect = img.naturalHeight / img.naturalWidth;
      if (!Array.isArray(appState.settings.logos)) appState.settings.logos = [];
      const count = appState.settings.logos.length;
      const logo = {
        id: 'logo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        dataUrl,
        layer: 'front',
        x: 24 + (count % 4) * 24,
        y: 24 + (count % 4) * 24,
        width: 80,
        aspect: aspect || 1,
        opacity: 1
      };
      appState.settings.logos.push(logo);
      renderLogoList();
      updateTournamentDisplay();
      saveState();
      showToast('画像を追加しました。ブラケット上でドラッグして位置調整できます', 'success');
    };
    img.onerror = function () {
      showToast('画像の読み込みに失敗しました', 'error');
    };
    img.src = dataUrl;
  };
  reader.onerror = function () {
    showToast('ファイルの読み込みに失敗しました', 'error');
  };
  reader.readAsDataURL(file);

  e.target.value = '';
}

// =============================================
// ロゴのドラッグ移動・リサイズ（SVG上でのポインター操作）
// =============================================
function svgPointFromEvent(svgEl, evt) {
  const pt = svgEl.createSVGPoint ? svgEl.createSVGPoint() : null;
  const rect = svgEl.getBoundingClientRect();
  const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
  if (vb && vb.width) {
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX + vb.x,
      y: (evt.clientY - rect.top) * scaleY + vb.y
    };
  }
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

function onLogoPointerDown(e) {
  const target = e.target;
  const logoId = target.getAttribute && target.getAttribute('data-logo-id');
  if (!logoId) return;

  const logo = (appState.settings.logos || []).find(l => l.id === logoId);
  if (!logo) return;

  const svgEl = document.getElementById('tournament-svg');
  const start = svgPointFromEvent(svgEl, e);
  const isHandle = target.classList && target.classList.contains('logo-resize-handle');

  logoDrag = {
    logo,
    mode: isHandle ? 'resize' : 'move',
    startX: start.x,
    startY: start.y,
    origX: logo.x !== undefined ? logo.x : 24,
    origY: logo.y !== undefined ? logo.y : 24,
    origWidth: logo.width || 80
  };

  e.preventDefault();
}

function onLogoPointerMove(e) {
  if (!logoDrag) return;
  const svgEl = document.getElementById('tournament-svg');
  const cur = svgPointFromEvent(svgEl, e);
  const dx = cur.x - logoDrag.startX;
  const dy = cur.y - logoDrag.startY;
  const logo = logoDrag.logo;

  if (logoDrag.mode === 'move') {
    logo.x = Math.round(logoDrag.origX + dx);
    logo.y = Math.round(logoDrag.origY + dy);
  } else {
    const newWidth = Math.max(20, Math.round(logoDrag.origWidth + dx));
    logo.width = newWidth;
    refreshLogoWidthUI(logo.id, newWidth);
  }

  updateTournamentDisplay();
}

function onLogoPointerUp() {
  if (!logoDrag) return;
  logoDrag = null;
  saveState();
}

function refreshLogoWidthUI(logoId, width) {
  const slider = document.querySelector(`.logo-slider-row .range-input[data-logo-id="${logoId}"]`);
  if (slider) {
    slider.value = width;
    const label = slider.parentElement && slider.parentElement.querySelector('label');
    if (label) label.textContent = `幅 ${width}px`;
  }
}

function renderLogoList() {
  const container = document.getElementById('logo-list');
  if (!container) return;
  container.innerHTML = '';

  const logos = appState.settings.logos || [];
  if (logos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint-text logo-empty-hint';
    empty.textContent = '追加された画像はありません。';
    container.appendChild(empty);
    return;
  }

  logos.forEach(logo => {
    const item = document.createElement('div');
    item.className = 'logo-item';

    const thumb = document.createElement('img');
    thumb.className = 'logo-thumb';
    thumb.src = logo.dataUrl;
    thumb.alt = '';

    const body = document.createElement('div');
    body.className = 'logo-item-body';

    const layerSelect = document.createElement('select');
    layerSelect.className = 'logo-position-select';
    Object.entries(LOGO_LAYER_LABELS).forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if ((logo.layer || 'front') === val) opt.selected = true;
      layerSelect.appendChild(opt);
    });
    layerSelect.addEventListener('change', () => {
      logo.layer = layerSelect.value;
      updateTournamentDisplay();
      saveState();
    });

    const widthRow = document.createElement('div');
    widthRow.className = 'logo-slider-row';
    const widthLabel = document.createElement('label');
    widthLabel.textContent = `幅 ${logo.width}px`;
    const widthSlider = document.createElement('input');
    widthSlider.type = 'range';
    widthSlider.className = 'range-input';
    widthSlider.dataset.logoId = logo.id;
    widthSlider.min = '30';
    widthSlider.max = '400';
    widthSlider.step = '5';
    widthSlider.value = logo.width;
    widthSlider.addEventListener('input', () => {
      logo.width = parseInt(widthSlider.value);
      widthLabel.textContent = `幅 ${logo.width}px`;
      updateTournamentDisplay();
      saveState();
    });
    widthRow.appendChild(widthLabel);
    widthRow.appendChild(widthSlider);

    const opacityRow = document.createElement('div');
    opacityRow.className = 'logo-slider-row';
    const opacityLabel = document.createElement('label');
    opacityLabel.textContent = `不透明度 ${Math.round(logo.opacity * 100)}%`;
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.className = 'range-input';
    opacitySlider.min = '10';
    opacitySlider.max = '100';
    opacitySlider.step = '5';
    opacitySlider.value = Math.round(logo.opacity * 100);
    opacitySlider.addEventListener('input', () => {
      logo.opacity = parseInt(opacitySlider.value) / 100;
      opacityLabel.textContent = `不透明度 ${Math.round(logo.opacity * 100)}%`;
      updateTournamentDisplay();
      saveState();
    });
    opacityRow.appendChild(opacityLabel);
    opacityRow.appendChild(opacitySlider);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'logo-remove-btn';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    removeBtn.title = '削除';
    removeBtn.addEventListener('click', () => {
      appState.settings.logos = appState.settings.logos.filter(l => l.id !== logo.id);
      renderLogoList();
      updateTournamentDisplay();
      saveState();
      showToast('画像を削除しました');
    });

    body.appendChild(layerSelect);
    body.appendChild(widthRow);
    body.appendChild(opacityRow);

    item.appendChild(thumb);
    item.appendChild(body);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
}

// =============================================
// トースト通知
// =============================================
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast${type ? ' ' + type : ''} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = `toast${type ? ' ' + type : ''}`;
  }, 2800);
}

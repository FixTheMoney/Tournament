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
      bg: '#000000',
      bgOpacity: 1,
      slot: '#000000',
      slotWin: '#c6504c',
      slotBye: '#141414',
      text: '#fdfdfd',
      titleText: '#fdfdfd',
      line: '#ffffff',
      lineWin: '#c6504c',
      border: '#ffffff',
      borderWidth: 1.5,
      accent: '#333333',
      labelText: '#aaaaaa',
      byeText: '#555555'
    },
    displayWidth: {
      enabled: false,
      value: 1200
    },
    pageBackground: {
      color: '#0d0d1a',
      imageDataUrl: null
    },
    showCategory: true,
    nameFont: "'Noto Sans JP', sans-serif",
    nameBold: false,
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
  light: {
    bg: '#faf2cc', bgOpacity: 1,
    slot: '#faf2cc', slotWin: '#c6504c', slotBye: '#efe6bd',
    text: '#000000', titleText: '#000000', line: '#000000', lineWin: '#c6504c',
    border: '#000000', borderWidth: 1.5,
    accent: '#d8cca0', labelText: '#555555', byeText: '#999999'
  },
  dark: {
    bg: '#000000', bgOpacity: 1,
    slot: '#000000', slotWin: '#c6504c', slotBye: '#141414',
    text: '#fdfdfd', titleText: '#fdfdfd', line: '#ffffff', lineWin: '#c6504c',
    border: '#ffffff', borderWidth: 1.5,
    accent: '#333333', labelText: '#aaaaaa', byeText: '#555555'
  }
};

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  loadFromStorage();
  bindEvents();

  // 旧localStorage方式で保存されていたスナップショットがあれば、
  // より容量の大きいIndexedDBへ1回だけ自動移行する
  try {
    await SnapshotDB.migrateFromLocalStorageIfNeeded();
  } catch (e) {
    console.warn('スナップショットの移行処理でエラーが発生しました', e);
  }
  renderSnapshotList();

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
  if (!appState.settings.pageBackground) {
    appState.settings.pageBackground = { color: '#0d0d1a', imageDataUrl: null };
  }
  if (appState.settings.showCategory === undefined) {
    appState.settings.showCategory = true;
  }
  if (!appState.settings.nameFont) {
    appState.settings.nameFont = "'Noto Sans JP', sans-serif";
  }
  if (appState.settings.nameBold === undefined) {
    appState.settings.nameBold = false;
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

  // ページ背景設定を復元
  applyPageBackgroundToUI(appState.settings.pageBackground);
  applyPageBackgroundToArea(appState.settings.pageBackground);

  // カテゴリー表示トグルを復元
  const showCatToggle = document.getElementById('toggle-show-category');
  if (showCatToggle) showCatToggle.checked = appState.settings.showCategory !== false;

  // 対戦者名フォント・太字設定を復元
  const nameFontSelect = document.getElementById('select-name-font');
  if (nameFontSelect) nameFontSelect.value = appState.settings.nameFont || "'Noto Sans JP', sans-serif";
  const nameBoldToggle = document.getElementById('toggle-name-bold');
  if (nameBoldToggle) nameBoldToggle.checked = !!appState.settings.nameBold;

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
  document.getElementById('page-bg-section').style.display = '';
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
  ['bg', 'slot', 'winbox', 'winline', 'text', 'border', 'bye'].forEach(key => {
    const mapKey = key === 'winbox' ? 'slotWin' : (key === 'winline' ? 'lineWin' : (key === 'bye' ? 'byeText' : key));
    const inp = document.getElementById(`color-${key}`);
    if (!inp) return;
    inp.addEventListener('input', () => {
      document.getElementById(`color-${key}-label`).textContent = inp.value;
      appState.settings.colors[mapKey] = inp.value;
      updateTournamentDisplay();
      saveState();
    });
  });

  // プレイヤー枠線の太さ
  const borderWidthInput = document.getElementById('range-border-width');
  if (borderWidthInput) {
    borderWidthInput.addEventListener('input', function () {
      const v = parseFloat(this.value);
      appState.settings.colors.borderWidth = v;
      document.getElementById('border-width-val').textContent = `${v}px`;
      updateTournamentDisplay();
      saveState();
    });
  }

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

  // カテゴリー表示トグル
  const showCatToggle = document.getElementById('toggle-show-category');
  if (showCatToggle) {
    showCatToggle.addEventListener('change', function () {
      appState.settings.showCategory = this.checked;
      updateTournamentDisplay();
      saveState();
      showToast(this.checked ? 'カテゴリー表示をオンにしました' : 'カテゴリー表示をオフにしました');
    });
  }

  // 対戦者名のフォント選択
  const nameFontSelect = document.getElementById('select-name-font');
  if (nameFontSelect) {
    nameFontSelect.addEventListener('change', function () {
      appState.settings.nameFont = this.value;
      updateTournamentDisplay();
      saveState();
      showToast('対戦者名のフォントを変更しました');
    });
  }

  // 対戦者名の太字トグル
  const nameBoldToggle = document.getElementById('toggle-name-bold');
  if (nameBoldToggle) {
    nameBoldToggle.addEventListener('change', function () {
      appState.settings.nameBold = this.checked;
      updateTournamentDisplay();
      saveState();
      showToast(this.checked ? '対戦者名を太字にしました' : '対戦者名を通常の太さに戻しました');
    });
  }

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

  // ページ背景設定
  const pageBgColorInput = document.getElementById('color-page-bg');
  if (pageBgColorInput) {
    pageBgColorInput.addEventListener('input', function () {
      if (!appState.settings.pageBackground) {
        appState.settings.pageBackground = { color: '#0d0d1a', imageDataUrl: null };
      }
      appState.settings.pageBackground.color = this.value;
      document.getElementById('color-page-bg-label').textContent = this.value;
      applyPageBackgroundToArea(appState.settings.pageBackground);
      saveState();
    });
  }
  const btnAddPageBg = document.getElementById('btn-add-page-bg');
  if (btnAddPageBg) {
    btnAddPageBg.addEventListener('click', () => {
      document.getElementById('page-bg-file-input').click();
    });
  }
  const pageBgFileInput = document.getElementById('page-bg-file-input');
  if (pageBgFileInput) {
    pageBgFileInput.addEventListener('change', onPageBgFileSelected);
  }
  const btnRemovePageBg = document.getElementById('btn-remove-page-bg');
  if (btnRemovePageBg) {
    btnRemovePageBg.addEventListener('click', onRemovePageBgImage);
  }

  // ロゴのドラッグ移動・リサイズ（SVG上でマウス/タッチ操作）
  const svgEl = document.getElementById('tournament-svg');
  svgEl.addEventListener('pointerdown', onLogoPointerDown);
  document.addEventListener('pointermove', onLogoPointerMove);
  document.addEventListener('pointerup', onLogoPointerUp);
  document.addEventListener('pointercancel', onLogoPointerUp);

  // スナップショット保存・画像保存
  document.getElementById('btn-save-snapshot').addEventListener('click', onSaveSnapshot);
  document.getElementById('btn-save-image').addEventListener('click', onSaveImage);
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
  document.getElementById('page-bg-section').style.display = '';
  document.getElementById('design-section').style.display = '';
  document.getElementById('logos-section').style.display = '';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('tournament-wrapper').style.display = '';

  renderLogoList();
  applyPageBackgroundToUI(appState.settings.pageBackground);
  applyPageBackgroundToArea(appState.settings.pageBackground);
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

  const svg = document.getElementById('tournament-svg');
  DrawLib.drawTournament(svg, appState.tournament, appState.settings, true);
  fitTournamentToArea();
}

// =============================================
// トーナメント表示の自動フィット（画面内でできるだけ大きく表示し、はみ出す場合はスクロールで対応）
// display.js の fitToScreen()/centerScaleWrap() と同様の仕組み。
// サイズの制限は設けず、小さい場合は拡大し、大きすぎる場合は縮小する。
// =============================================
let adminZoom = 1;

function fitTournamentToArea() {
  const svg = document.getElementById('tournament-svg');
  const outer = document.getElementById('svg-scroll-wrap');
  if (!svg || !outer) return;
  if (!svg.getAttribute('width') || !svg.getAttribute('height')) return;

  const svgW = parseFloat(svg.getAttribute('width'));
  const svgH = parseFloat(svg.getAttribute('height'));
  if (!svgW || !svgH) return;

  const cs = getComputedStyle(outer);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = outer.clientWidth - padX;
  const availH = outer.clientHeight - padY;
  if (availW <= 0 || availH <= 0) return;

  const scaleX = availW / svgW;
  const scaleY = availH / svgH;
  adminZoom = Math.min(scaleX, scaleY);

  const wrap = document.getElementById('svg-scale-wrap');
  if (wrap) wrap.style.transform = `scale(${adminZoom})`;

  centerAdminScaleWrap();
}

/**
 * #svg-scale-wrap を #svg-scroll-wrap 内で中央寄せする。
 * コンテンツが親に収まる場合のみ margin で中央寄せし、
 * はみ出す場合は margin を 0 にすることで、
 * 上端・左端まで正しくスクロールできる状態を保つ。
 */
function centerAdminScaleWrap() {
  const outer = document.getElementById('svg-scroll-wrap');
  const wrap = document.getElementById('svg-scale-wrap');
  const svg = document.getElementById('tournament-svg');
  if (!outer || !wrap || !svg) return;

  const svgW = parseFloat(svg.getAttribute('width')) || 0;
  const svgH = parseFloat(svg.getAttribute('height')) || 0;
  const scaledW = svgW * adminZoom;
  const scaledH = svgH * adminZoom;

  const cs = getComputedStyle(outer);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = outer.clientWidth - padX;
  const availH = outer.clientHeight - padY;

  const marginX = Math.max(0, (availW - scaledW) / 2);
  const marginY = Math.max(0, (availH - scaledH) / 2);

  wrap.style.marginLeft = `${marginX}px`;
  wrap.style.marginRight = `${marginX}px`;
  wrap.style.marginTop = `${marginY}px`;
  wrap.style.marginBottom = `${marginY}px`;
}

window.addEventListener('resize', () => {
  if (appState.tournament) fitTournamentToArea();
});

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
  document.getElementById('page-bg-section').style.display = 'none';
  document.getElementById('design-section').style.display = 'none';
  document.getElementById('logos-section').style.display = 'none';
  document.getElementById('empty-state').style.display = '';
  document.getElementById('tournament-wrapper').style.display = 'none';
  document.getElementById('input-title').value = '';
  document.getElementById('input-num').value = 8;

  appState.settings.logos = [];
  renderLogoList();

  appState.settings.pageBackground = { color: '#0d0d1a', imageDataUrl: null };
  applyPageBackgroundToUI(appState.settings.pageBackground);
  applyPageBackgroundToArea(appState.settings.pageBackground);

  appState.settings.showCategory = true;
  const showCatToggle = document.getElementById('toggle-show-category');
  if (showCatToggle) showCatToggle.checked = true;

  appState.settings.nameFont = "'Noto Sans JP', sans-serif";
  appState.settings.nameBold = false;
  const nameFontSelect = document.getElementById('select-name-font');
  if (nameFontSelect) nameFontSelect.value = "'Noto Sans JP', sans-serif";
  const nameBoldToggle = document.getElementById('toggle-name-bold');
  if (nameBoldToggle) nameBoldToggle.checked = false;

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
    bg: 'bg', slot: 'slot', slotWin: 'winbox', lineWin: 'winline', text: 'text', border: 'border', byeText: 'bye'
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
  const bw = colors.borderWidth !== undefined ? colors.borderWidth : 1.5;
  const bwInput = document.getElementById('range-border-width');
  const bwLabel = document.getElementById('border-width-val');
  if (bwInput) bwInput.value = bw;
  if (bwLabel) bwLabel.textContent = `${bw}px`;
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
// ページ背景UI反映
// =============================================
function applyPageBackgroundToUI(pageBackground) {
  const pb = pageBackground || { color: '#0d0d1a', imageDataUrl: null };
  const colorInput = document.getElementById('color-page-bg');
  const colorLabel = document.getElementById('color-page-bg-label');
  if (colorInput) colorInput.value = pb.color || '#0d0d1a';
  if (colorLabel) colorLabel.textContent = pb.color || '#0d0d1a';

  const preview = document.getElementById('page-bg-preview');
  const removeBtn = document.getElementById('btn-remove-page-bg');
  if (preview) {
    if (pb.imageDataUrl) {
      preview.style.backgroundImage = `url("${pb.imageDataUrl}")`;
      preview.innerHTML = '';
    } else {
      preview.style.backgroundImage = 'none';
      preview.innerHTML = '<span class="page-bg-preview-empty">未設定</span>';
    }
  }
  if (removeBtn) {
    removeBtn.style.display = pb.imageDataUrl ? '' : 'none';
  }
}

// =============================================
// ページ背景をトーナメントエリアに適用（引き伸ばし表示）
// =============================================
function applyPageBackgroundToArea(pageBackground) {
  const pb = pageBackground || { color: '#0d0d1a', imageDataUrl: null };
  const area = document.getElementById('tournament-area');
  if (!area) return;
  area.style.backgroundColor = pb.color || '#0d0d1a';
  if (pb.imageDataUrl) {
    area.style.backgroundImage = `url("${pb.imageDataUrl}")`;
    area.style.backgroundSize = '100% 100%';
    area.style.backgroundRepeat = 'no-repeat';
    area.style.backgroundPosition = 'center';
  } else {
    area.style.backgroundImage = 'none';
  }
}

// =============================================
// ページ背景画像アップロード
// =============================================
function onPageBgFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('画像ファイルを選択してください', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > 6 * 1024 * 1024) {
    showToast('画像サイズが大きすぎます（6MB以下にしてください）', 'error');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function (evt) {
    const dataUrl = evt.target.result;
    if (!appState.settings.pageBackground) {
      appState.settings.pageBackground = { color: '#0d0d1a', imageDataUrl: null };
    }
    appState.settings.pageBackground.imageDataUrl = dataUrl;
    applyPageBackgroundToUI(appState.settings.pageBackground);
    applyPageBackgroundToArea(appState.settings.pageBackground);
    saveState();
    showToast('背景画像を設定しました', 'success');
  };
  reader.onerror = function () {
    showToast('ファイルの読み込みに失敗しました', 'error');
  };
  reader.readAsDataURL(file);

  e.target.value = '';
}

function onRemovePageBgImage() {
  if (!appState.settings.pageBackground) {
    appState.settings.pageBackground = { color: '#0d0d1a', imageDataUrl: null };
  }
  appState.settings.pageBackground.imageDataUrl = null;
  applyPageBackgroundToUI(appState.settings.pageBackground);
  applyPageBackgroundToArea(appState.settings.pageBackground);
  saveState();
  showToast('背景画像を削除しました');
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

// =============================================
// スナップショット保存・読込・削除（ブラウザのIndexedDB内で管理）
// JSONファイルの書き出し/アップロードは行わず、このブラウザ内に
// 複数のスナップショット（名前付きの状態保存）として保持する。
// 背景画像・ロゴ画像などを含むとデータ量が大きくなるため、容量が
// 限られるlocalStorageではなくIndexedDB（SnapshotDB）に保存する。
// =============================================

async function onSaveSnapshot() {
  if (!appState.tournament) {
    showToast('保存するトーナメントデータがありません', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-save-snapshot');
  const nameInput = document.getElementById('input-snapshot-name');
  const customName = nameInput ? nameInput.value.trim() : '';
  const label = customName || appState.settings.title || 'トーナメント';

  const snapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: label,
    savedAt: Date.now(),
    tournament: appState.tournament,
    settings: appState.settings
  };

  if (saveBtn) saveBtn.disabled = true;
  try {
    await SnapshotDB.add(snapshot);
    await SnapshotDB.trimToMax(SnapshotDB.MAX_SNAPSHOTS);

    if (nameInput) nameInput.value = '';
    await renderSnapshotList();
    showToast('現在の状態を保存しました', 'success');
  } catch (e) {
    console.error('スナップショット保存エラー', e);
    const isQuota = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
    showToast(
      isQuota
        ? '保存に失敗しました（ブラウザの保存容量が不足しています）'
        : '保存に失敗しました',
      'error'
    );
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function onLoadSnapshot(id) {
  let list;
  try {
    list = await SnapshotDB.getAll();
  } catch (e) {
    showToast('スナップショットの読込に失敗しました', 'error');
    return;
  }
  const snapshot = list.find(s => s.id === id);
  if (!snapshot) {
    showToast('スナップショットが見つかりませんでした', 'error');
    return;
  }

  if (!confirm(`「${snapshot.name}」の状態を読み込みます。現在のトーナメント表・設定は上書きされます。よろしいですか？`)) {
    return;
  }

  appState.tournament = snapshot.tournament;
  appState.settings = { ...appState.settings, ...snapshot.settings };
  if (!Array.isArray(appState.settings.logos)) appState.settings.logos = [];
  if (!appState.settings.pageBackground) appState.settings.pageBackground = { color: '#0d0d1a', imageDataUrl: null };
  if (appState.settings.showCategory === undefined) appState.settings.showCategory = true;
  if (!appState.settings.nameFont) appState.settings.nameFont = "'Noto Sans JP', sans-serif";
  if (appState.settings.nameBold === undefined) appState.settings.nameBold = false;

  restoreUI();
  saveState();
  showToast(`「${snapshot.name}」を読み込みました`, 'success');
}

async function onDeleteSnapshot(id) {
  let list;
  try {
    list = await SnapshotDB.getAll();
  } catch (e) {
    showToast('削除に失敗しました', 'error');
    return;
  }
  const snapshot = list.find(s => s.id === id);
  if (!snapshot) return;
  if (!confirm(`「${snapshot.name}」を削除します。よろしいですか？`)) return;

  try {
    await SnapshotDB.remove(id);
    await renderSnapshotList();
    showToast('削除しました');
  } catch (e) {
    showToast('削除に失敗しました', 'error');
  }
}

async function renderSnapshotList() {
  const container = document.getElementById('snapshot-list');
  if (!container) return;

  let list = [];
  try {
    list = await SnapshotDB.getAll();
  } catch (e) {
    console.warn('スナップショット一覧の取得に失敗しました', e);
  }

  container.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'snapshot-empty-hint';
    empty.textContent = '保存済みのスナップショットはありません。';
    container.appendChild(empty);
    return;
  }

  list.forEach(snapshot => {
    const item = document.createElement('div');
    item.className = 'snapshot-item';

    const info = document.createElement('div');
    info.className = 'snapshot-item-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'snapshot-item-name';
    nameEl.textContent = snapshot.name;
    nameEl.title = snapshot.name;
    const dateEl = document.createElement('div');
    dateEl.className = 'snapshot-item-date';
    const d = new Date(snapshot.savedAt);
    dateEl.textContent = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    info.appendChild(nameEl);
    info.appendChild(dateEl);

    const actions = document.createElement('div');
    actions.className = 'snapshot-item-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'snapshot-btn';
    loadBtn.title = 'この状態を読み込む';
    loadBtn.innerHTML = '<i class="fas fa-folder-open"></i> <span>読込</span>';
    loadBtn.addEventListener('click', () => onLoadSnapshot(snapshot.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'snapshot-btn danger';
    deleteBtn.title = 'このスナップショットを削除';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> <span>削除</span>';
    deleteBtn.addEventListener('click', () => onDeleteSnapshot(snapshot.id));

    actions.appendChild(loadBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  });
}

// =============================================
// トーナメント表を画像（PNG）として保存
// ページ背景（色・背景画像）も含めて書き出す
// =============================================
function onSaveImage() {
  if (!appState.tournament) {
    showToast('保存するトーナメント表がありません', 'error');
    return;
  }

  const svgEl = document.getElementById('tournament-svg');
  const svgW = parseFloat(svgEl.getAttribute('width'));
  const svgH = parseFloat(svgEl.getAttribute('height'));
  if (!svgW || !svgH) {
    showToast('画像の生成に失敗しました', 'error');
    return;
  }

  // ブラケットの周囲に余白を付け、背景がきちんと見えるようにする
  const PADDING = 40;
  const canvasW = svgW + PADDING * 2;
  const canvasH = svgH + PADDING * 2;
  const pageBg = appState.settings.pageBackground || { color: '#0d0d1a', imageDataUrl: null };

  // SVGをシリアライズしてdata URLに変換（フォントの外部リンクはそのままImageで読み込む）
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgEl);

  // 名前空間が無い場合の保険
  if (!svgString.match(/^<svg[^>]+xmlns=/)) {
    svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  // 高解像度で書き出すための倍率（2倍でRetina相当）
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW * scale;
  canvas.height = canvasH * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  function drawBracketAndFinish(bgImg) {
    // 1. 背景色を全体に塗る
    ctx.fillStyle = pageBg.color || '#0d0d1a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 2. 背景画像があれば、画面表示と同じく background-size:100% 100% 相当で
    //    縦横比を保たずキャンバス全体に引き伸ばして描画する
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, canvasW, canvasH);
    }

    // 3. 背景の上にブラケットSVGを重ねる
    const svgImg = new Image();
    svgImg.onload = function () {
      ctx.drawImage(svgImg, PADDING, PADDING, svgW, svgH);
      URL.revokeObjectURL(svgUrl);
      finalizeAndDownload(canvas);
    };
    svgImg.onerror = function () {
      URL.revokeObjectURL(svgUrl);
      showToast('画像の生成に失敗しました（フォントや画像の読み込みに問題がある可能性があります）', 'error');
    };
    svgImg.src = svgUrl;
  }

  function finalizeAndDownload(canvas) {
    canvas.toBlob(function (blob) {
      if (!blob) {
        showToast('画像の生成に失敗しました', 'error');
        return;
      }
      const pngUrl = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const safeTitle = (appState.settings.title || 'トーナメント').replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${safeTitle}_${dateStr}.png`;

      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(pngUrl);

      showToast('トーナメント表を画像として保存しました', 'success');
    }, 'image/png');
  }

  // 背景画像が設定されていれば先に読み込んでから合成する
  if (pageBg.imageDataUrl) {
    const bgImg = new Image();
    bgImg.onload = function () {
      drawBracketAndFinish(bgImg);
    };
    bgImg.onerror = function () {
      // 背景画像の読み込みに失敗しても背景色だけで続行する
      drawBracketAndFinish(null);
    };
    bgImg.src = pageBg.imageDataUrl;
  } else {
    drawBracketAndFinish(null);
  }
}

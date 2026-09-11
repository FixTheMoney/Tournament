/**
 * display.js
 * 投影用表示画面のロジック
 */

let displayState = {
  tournament: null,
  settings: null,
  zoom: 1,
  zoomStep: 0.1,
  fixedWidth: false,
  fixedWidthValue: null
};

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  loadAndRender();
  setupBroadcastChannel();
  bindDisplayEvents();
});

function loadAndRender() {
  const saved = TournamentLib.loadTournament();
  if (saved && saved.tournament) {
    displayState.tournament = saved.tournament;
    displayState.settings = saved.settings || {};
    showTournament();
  } else {
    showWaiting();
  }
}

// =============================================
// BroadcastChannel でリアルタイム更新を受信
// =============================================
function setupBroadcastChannel() {
  try {
    const bc = new BroadcastChannel('tournament_channel');
    bc.addEventListener('message', e => {
      const { type, data } = e.data;
      if (type === 'UPDATE' && data) {
        displayState.tournament = data.tournament;
        displayState.settings = data.settings || {};
        flashUpdate();
        if (document.getElementById('tournament-display').style.display !== 'none') {
          renderTournament();
        } else {
          showTournament();
        }
      } else if (type === 'RESET') {
        displayState.tournament = null;
        displayState.settings = null;
        showWaiting();
      }
    });
  } catch (e) {
    // BroadcastChannel 非対応のブラウザはポーリング
    setInterval(() => {
      const saved = TournamentLib.loadTournament();
      if (saved && saved.tournament) {
        const oldUpdated = displayState.settings?._lastSaved;
        if (!oldUpdated || saved.updatedAt > oldUpdated) {
          displayState.tournament = saved.tournament;
          displayState.settings = saved.settings || {};
          displayState.settings._lastSaved = saved.updatedAt;
          if (document.getElementById('tournament-display').style.display !== 'none') {
            renderTournament();
          } else {
            showTournament();
          }
        }
      }
    }, 1500);
  }
}

// =============================================
// 表示切り替え
// =============================================
function showWaiting() {
  document.getElementById('waiting-screen').style.display = '';
  document.getElementById('tournament-display').style.display = 'none';
}

function showTournament() {
  document.getElementById('waiting-screen').style.display = 'none';
  document.getElementById('tournament-display').style.display = 'flex';
  renderTournament();
}

// =============================================
// トーナメント描画
// =============================================
function renderTournament() {
  if (!displayState.tournament) return;

  const settings = displayState.settings || {};

  // タイトル
  const titleEl = document.getElementById('display-title');
  titleEl.textContent = settings.title || 'トーナメント大会';

  // メタ情報
  const metaEl = document.getElementById('display-meta');
  const n = settings.numPlayers || displayState.tournament.numPlayers;
  const total = displayState.tournament.total;
  const byeCount = total - n;
  metaEl.textContent = `参加人数: ${n}人${byeCount > 0 ? ` (シード: ${byeCount}枠)` : ''}  ·  ${displayState.tournament.rounds.length}ラウンド`;

  // SVG 描画
  const svg = document.getElementById('display-svg');
  DrawLib.drawTournament(svg, displayState.tournament, settings, false);

  // 投影用タイトルカラーをカスタム色に合わせる
  if (settings.colors && settings.colors.text) {
    titleEl.style.color = settings.colors.text;
  }

  // 表示幅設定を反映してからズームをリセット（フィット/固定）
  applyDisplayWidth(settings.displayWidth);
}

// =============================================
// 表示幅の固定 / 自動フィット切り替え
// =============================================
function applyDisplayWidth(displayWidth) {
  displayState.fixedWidth = !!(displayWidth && displayWidth.enabled && displayWidth.value);
  displayState.fixedWidthValue = displayWidth && displayWidth.value ? displayWidth.value : null;

  if (displayState.fixedWidth) {
    setFixedWidth(displayState.fixedWidthValue);
  } else {
    fitToScreen();
  }
}

/**
 * SVGの表示幅を指定ピクセルに固定する（アスペクト比は維持）
 */
function setFixedWidth(targetWidth) {
  const svg = document.getElementById('display-svg');
  const svgW = parseFloat(svg.getAttribute('width'));
  if (!svgW) return;

  const scale = targetWidth / svgW;
  displayState.zoom = Math.max(0.1, Math.min(5, scale));
  const wrap = document.getElementById('svg-scale-wrap');
  wrap.style.transform = `scale(${displayState.zoom})`;
  document.getElementById('zoom-label').textContent = `${Math.round(displayState.zoom * 100)}%`;
}

// =============================================
// ズーム機能
// =============================================
function setZoom(zoom) {
  displayState.zoom = Math.max(0.3, Math.min(3, zoom));
  const wrap = document.getElementById('svg-scale-wrap');
  wrap.style.transform = `scale(${displayState.zoom})`;
  document.getElementById('zoom-label').textContent = `${Math.round(displayState.zoom * 100)}%`;
}

function fitToScreen() {
  const svg = document.getElementById('display-svg');
  const outer = document.getElementById('svg-outer-wrap');
  if (!svg.getAttribute('width') || !svg.getAttribute('height')) return;

  const svgW = parseFloat(svg.getAttribute('width'));
  const svgH = parseFloat(svg.getAttribute('height'));
  const outerW = outer.clientWidth - 20;
  const outerH = outer.clientHeight - 20;

  const scaleX = outerW / svgW;
  const scaleY = outerH / svgH;
  const scale = Math.min(scaleX, scaleY, 1.5);
  setZoom(scale);
}

// =============================================
// コントロールイベント
// =============================================
function bindDisplayEvents() {
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    setZoom(displayState.zoom + displayState.zoomStep);
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    setZoom(displayState.zoom - displayState.zoomStep);
  });
  document.getElementById('btn-zoom-fit').addEventListener('click', fitToScreen);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

  // キーボードショートカット
  document.addEventListener('keydown', e => {
    if (e.key === '+' || e.key === '=') setZoom(displayState.zoom + displayState.zoomStep);
    if (e.key === '-') setZoom(displayState.zoom - displayState.zoomStep);
    if (e.key === '0') fitToScreen();
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    if (e.key === 'r' || e.key === 'R') loadAndRender();
  });

  // ピンチズーム（タッチデバイス）
  let lastDist = null;
  document.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDist !== null) {
        const delta = (dist - lastDist) / 300;
        setZoom(displayState.zoom + delta);
      }
      lastDist = dist;
      e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('touchend', () => { lastDist = null; });

  // ホイールズーム
  document.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -displayState.zoomStep : displayState.zoomStep;
      setZoom(displayState.zoom + delta);
    }
  }, { passive: false });

  // リサイズ
  window.addEventListener('resize', () => {
    if (!displayState.tournament) return;
    if (displayState.fixedWidth) {
      setFixedWidth(displayState.fixedWidthValue);
    } else {
      fitToScreen();
    }
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(e => console.log(e));
  } else {
    document.exitFullscreen();
  }
}

// =============================================
// 更新フラッシュ
// =============================================
function flashUpdate() {
  const flash = document.getElementById('update-flash');
  flash.classList.add('active');
  setTimeout(() => flash.classList.remove('active'), 300);
}

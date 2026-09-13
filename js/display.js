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
        applyPageBackground(null);
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
  applyPageBackground(null);
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

  // SVG 描画
  const svg = document.getElementById('display-svg');
  DrawLib.drawTournament(svg, displayState.tournament, settings, false);

  // 表示幅設定を反映してからズームをリセット（フィット/固定）
  applyDisplayWidth(settings.displayWidth);

  // ページ背景（トーナメントエリア周囲）を反映
  applyPageBackground(settings.pageBackground);
}

// =============================================
// ページ背景（トーナメントエリア周囲）の適用
// =============================================
function applyPageBackground(pageBackground) {
  const mainEl = document.getElementById('display-main');
  if (!mainEl) return;
  const pb = pageBackground || { color: '#0d0d1a', imageDataUrl: null };
  mainEl.style.backgroundColor = pb.color || '#0d0d1a';
  if (pb.imageDataUrl) {
    mainEl.style.backgroundImage = `url("${pb.imageDataUrl}")`;
    mainEl.style.backgroundSize = '100% 100%';
    mainEl.style.backgroundRepeat = 'no-repeat';
    mainEl.style.backgroundPosition = 'center';
  } else {
    mainEl.style.backgroundImage = 'none';
  }
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
  centerScaleWrap();
}

// =============================================
// ズーム機能
// =============================================
function setZoom(zoom) {
  displayState.zoom = Math.max(0.3, Math.min(3, zoom));
  const wrap = document.getElementById('svg-scale-wrap');
  wrap.style.transform = `scale(${displayState.zoom})`;
  document.getElementById('zoom-label').textContent = `${Math.round(displayState.zoom * 100)}%`;
  centerScaleWrap();
}

/**
 * #svg-scale-wrap を #svg-outer-wrap 内で中央寄せする。
 * コンテンツが親に収まる場合のみ margin で中央寄せし、
 * はみ出す場合は margin を0にすることで、
 * 上端・左端まで正しくスクロールできる状態を維持する
 * （flexboxのcenter系プロパティやtranslate(-50%,-50%)は
 *   はみ出し時に開始側へスクロールできなくなるため使用しない）。
 */
function centerScaleWrap() {
  const outer = document.getElementById('svg-outer-wrap');
  const wrap = document.getElementById('svg-scale-wrap');
  const svg = document.getElementById('display-svg');
  if (!outer || !wrap || !svg) return;

  const svgW = parseFloat(svg.getAttribute('width')) || 0;
  const svgH = parseFloat(svg.getAttribute('height')) || 0;
  const scaledW = svgW * displayState.zoom;
  const scaledH = svgH * displayState.zoom;

  // padding分を差し引いた実際の表示可能領域
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

/**
 * draw.js
 * トーナメント表を SVG で描画するモジュール (v6)
 * ── 左右のブロックが中央（決勝）に向かって収束するレイアウト ──
 * ── タイトル直下にラウンドラベル行、優勝者バナーは決定時のみラベル行の下に表示 ──
 * ── ロゴ・画像はSVG座標系に自由配置。管理画面ではドラッグ移動・ハンドルでリサイズ可能 ──
 */

// =============================================
// レイアウト定数
// =============================================
const SLOT_W       = 190;  // プレイヤー枠の幅
const SLOT_H       = 58;   // プレイヤー枠の高さ（従来比 約+25%。名前の視認性向上のため）
const SLOT_W_COMPACT_NAMED = 220;  // コンパクト表示: 名前を表示する枠（1回戦・決勝・3位決定戦）の幅（中間ラウンドを小さくする分、通常より大きくできる）
const SLOT_W_COMPACT_MINI  = 26;   // コンパクト表示: 中間ラウンド（2回戦〜準決勝など）用の小さな枠幅。名前は表示しないが、勝敗を示す色とクリック可能な枠として視認できる最小限のサイズ
const ROUND_GAP_COMPACT_LINE = 32; // コンパクト表示: 小さな枠同士の間隔（間隔を詰めて接続線の連続感を高めるため、通常より狭くする）
const PAIR_GAP     = 8;    // 1試合の2枠の隙間
const MATCH_GAP    = 28;   // 試合と試合の間
const ROUND_GAP    = 64;   // ラウンド間の水平間隔
const MARGIN_LEFT  = 30;   // 左マージン
const MARGIN_RIGHT = 30;   // 右マージン

const TITLE_Y             = 36;  // タイトルの中心Y座標（上に少し余白を確保）
const TITLE_TO_LABEL_GAP  = 42;  // タイトル中心 〜 ラウンドラベル(ベースライン)の間隔（タイトル下の余白）
const LABEL_ROW_PAD_BELOW = 16;  // ラウンドラベル行の下に確保する余白（ディセンダー＋ゆとり）
const CHAMP_GAP_ABOVE     = 28;  // ラウンドラベル行 〜 優勝者バナー（決定時のみ表示）の間隔（もう少し下げる）
const CHAMP_BANNER_W      = 270; // 優勝者バナーの幅
const CHAMP_BANNER_H      = 60;  // 優勝者バナーの高さ
const BRACKET_GAP_TOP     = 20;  // （優勝者バナー or ラウンドラベル行）〜 ブラケット開始の間隔

const THIRD_GAP_ABOVE = 64;  // 決勝の下端〜3位決定戦ラベルの間隔
const THIRD_LABEL_H   = 26;  // 3位決定戦ラベルの高さ
const THIRD_GAP_BELOW = 26;  // 3位決定戦ラベル〜対戦枠の間隔

const LOGO_DEFAULT_X  = 24;  // ロゴのデフォルトX座標（未配置時）
const LOGO_DEFAULT_Y  = 24;  // ロゴのデフォルトY座標（未配置時）
const LOGO_HANDLE_SIZE = 16; // リサイズハンドルのサイズ

// プレイヤー枠内テキストのフォントサイズ
const NAME_SIZE_INLINE   = 20;  // 名前＋カテゴリーが1行に収まる場合の名前フォントサイズ（最大限大きく）
const CAT_SIZE_INLINE    = 14;  // 1行表示時のカテゴリーフォントサイズ（名前より少し小さめ）
const NAME_SIZE_STACKED  = 18;  // 1行に収まらず2段表示にフォールバックした場合の名前フォントサイズ
const CAT_SIZE_STACKED   = 13;  // 2段表示時のカテゴリーフォントサイズ
const BYE_FONT_SIZE      = 15;  // BYE表示のフォントサイズ
const EMPTY_FONT_SIZE    = 18;  // 未確定プレースホルダー（─ ─ ─）のフォントサイズ
const NAME_CAT_GAP       = 8;   // 1行表示時の名前とカテゴリーの間隔(px)

/**
 * メイン描画関数
 */
function drawTournament(svgEl, tournament, settings = {}, isAdmin = false) {
  // SVG クリア
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const rounds      = tournament.rounds;
  const numRounds   = rounds.length;
  const matchCounts = rounds.map(r => r.matches.length);
  const matchH      = SLOT_H * 2 + PAIR_GAP;

  const hasThirdPlace = !!(tournament.thirdPlaceMatchId && tournament.matches[tournament.thirdPlaceMatchId]);

  const colors = settings.colors || {};
  const C = {
    bg:          colors.bg          || '#1a1a2e',
    bgOp:        colors.bgOpacity   !== undefined ? colors.bgOpacity : 1,
    slot:        colors.slot        || '#16213e',
    slotWin:     colors.slotWin     || '#e94560',
    slotBye:     colors.slotBye     || '#2a2a3e',
    text:        colors.text        || '#eaeaea',
    titleText:   colors.titleText   || colors.text || '#eaeaea',
    line:        colors.line        || '#4a4a6a',
    lineWin:     colors.lineWin     || '#e94560',
    border:      colors.border      || colors.accent || '#8888aa',
    borderWidth: colors.borderWidth !== undefined ? colors.borderWidth : 1.5,
    accent:      colors.accent      || '#0f3460',
    label:       colors.labelText   || '#8888aa',
    byeText:     colors.byeText     || '#444466',
    bronze:      '#c08a4e',
    showCategory: settings.showCategory !== false,
    nameFont:    settings.nameFont || "'Noto Sans JP', sans-serif",
    nameBold:    !!settings.nameBold,
    compactMode: !!settings.compactMode
  };

  // =============================================
  // コンパクト表示（ラウンド別の枠幅）
  // OFF: 全ラウンド共通で SLOT_W を使用（従来通り）
  // ON : ラウンド0（1回戦）・決勝 = 名前ありの大きめの枠（3位決定戦と同じ扱い）
  //      それ以外の中間ラウンド（2回戦〜準決勝など）= 名前は表示しない小さな枠
  //      （色と枠線でクリック位置がわかる程度のミニサイズにして、隣接ギャップも
  //      狭めることでブラケット全体を圧縮する）
  // =============================================
  function colWidth(r) {
    if (!C.compactMode) return SLOT_W;
    if (r === 0 || r === numRounds - 1) return SLOT_W_COMPACT_NAMED;
    return SLOT_W_COMPACT_MINI;
  }
  function colGap(r) {
    // r はこのギャップの左側のカレムインデリズ。
    // カレム（r）と次のカレム（r+1）の両方が枠非表示（線のみ）の場合は、
    // 間隔をより狭めて接続線を連続して見せる
    if (C.compactMode && r >= 1) return ROUND_GAP_COMPACT_LINE;
    return ROUND_GAP;
  }
  function sumCols(fromInclusive, toExclusive) {
    let total = 0;
    for (let i = fromInclusive; i < toExclusive; i++) {
      total += colWidth(i) + colGap(i);
    }
    return total;
  }

  // =============================================
  // ロゴ・画像の準備（自由配置：ドラッグ&リサイズ対応）
  // レイヤー: 'back'（ブラケットの背面・透かし）/ 'front'（前面）
  // =============================================
  const allLogos = (settings.logos || []).filter(l => l && l.dataUrl);
  const backLogos  = allLogos.filter(l => l.layer === 'back' || l.position === 'background');
  const frontLogos = allLogos.filter(l => !(l.layer === 'back' || l.position === 'background'));

  // =============================================
  // 優勝者判定（レイアウト計算で使用するため先に求める）
  // =============================================
  const finalId    = rounds[numRounds - 1].matches[0];
  const finalMatch = tournament.matches[finalId];
  const hasChampion = !!(finalMatch && finalMatch.winner && !finalMatch.winner.isBye);

  // =============================================
  // X座標ヘルパー（左半分 → 中央（決勝）← 右半分 のミラー配置）
  // =============================================
  const xCenter = numRounds === 1
    ? MARGIN_LEFT
    : MARGIN_LEFT + sumCols(0, numRounds - 1);

  const xLeft  = (r) => MARGIN_LEFT + sumCols(0, r);
  const xRight = (r) => xCenter + sumCols(r + 1, numRounds);

  const xRightOuter = numRounds >= 2 ? xRight(0) : xCenter;
  let svgWidth = Math.max(xRightOuter + colWidth(0) + MARGIN_RIGHT, CHAMP_BANNER_W + MARGIN_LEFT + MARGIN_RIGHT + 200);

  // =============================================
  // 垂直レイアウト計算
  // タイトル → ラウンドラベル行 → （優勝者バナー：決定時のみ）→ ブラケット
  // =============================================
  const titleY = TITLE_Y;
  const labelY = TITLE_Y + TITLE_TO_LABEL_GAP;
  const labelRowBottom = labelY + LABEL_ROW_PAD_BELOW;

  let champTop = null;
  let BRACKET_TOP;
  if (hasChampion) {
    champTop = labelRowBottom + CHAMP_GAP_ABOVE;
    BRACKET_TOP = champTop + CHAMP_BANNER_H + BRACKET_GAP_TOP;
  } else {
    BRACKET_TOP = labelRowBottom + BRACKET_GAP_TOP;
  }

  let totalH, halfMatchCount0;
  if (numRounds === 1) {
    totalH = matchH;
  } else {
    halfMatchCount0 = matchCounts[0] / 2;
    totalH = halfMatchCount0 * (matchH + MATCH_GAP) - MATCH_GAP;
  }

  const finalYAbs = BRACKET_TOP + totalH / 2;
  const bracketBottom = BRACKET_TOP + totalH;

  let svgHeight = bracketBottom + 30;
  let thirdYAbs = null;
  let thirdLabelYAbs = null;
  if (hasThirdPlace) {
    const finalBottom = finalYAbs + matchH / 2;
    thirdLabelYAbs = finalBottom + THIRD_GAP_ABOVE;
    thirdYAbs = thirdLabelYAbs + THIRD_LABEL_H / 2 + THIRD_GAP_BELOW + matchH / 2;
    svgHeight = Math.max(svgHeight, thirdYAbs + matchH / 2 + 30);
  }

  svgEl.setAttribute('width',   svgWidth);
  svgEl.setAttribute('height',  svgHeight);
  svgEl.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

  // =============================================
  // defs (フィルタ)
  // =============================================
  const defs = ce('defs', {});

  // 注意: フィルタ領域は userSpaceOnUse + SVG全体をカバーする絶対座標で指定する。
  // objectBoundingBox（相対%指定）だと、完全な水平/垂直線（bboxの高さ or 幅が0）に
  // フィルタを適用した際にフィルタ領域が消滅し、線自体が描画されなくなるバグがあるため。
  const fGlow = ce('filter', {
    id: 'glow-win', filterUnits: 'userSpaceOnUse',
    x: -40, y: -40, width: svgWidth + 80, height: svgHeight + 80
  });
  fGlow.appendChild(ce('feDropShadow', { dx: 0, dy: 0, stdDeviation: 5, 'flood-color': C.slotWin, 'flood-opacity': 0.85 }));
  defs.appendChild(fGlow);

  const fGlowGold = ce('filter', {
    id: 'glow-gold', filterUnits: 'userSpaceOnUse',
    x: -40, y: -40, width: svgWidth + 80, height: svgHeight + 80
  });
  fGlowGold.appendChild(ce('feDropShadow', { dx: 0, dy: 0, stdDeviation: 7, 'flood-color': '#ffd700', 'flood-opacity': 0.75 }));
  defs.appendChild(fGlowGold);

  const fTitle = ce('filter', {
    id: 'glow-title', filterUnits: 'userSpaceOnUse',
    x: -40, y: -40, width: svgWidth + 80, height: svgHeight + 80
  });
  fTitle.appendChild(ce('feDropShadow', { dx: 0, dy: 0, stdDeviation: 8, 'flood-color': C.slotWin, 'flood-opacity': 0.5 }));
  defs.appendChild(fTitle);

  svgEl.appendChild(defs);

  // =============================================
  // 背景
  // =============================================
  const bgFill = hexToRgba(C.bg, C.bgOp);
  svgEl.appendChild(ce('rect', {
    x: 0, y: 0, width: svgWidth, height: svgHeight,
    fill: bgFill, rx: 14
  }));

  // =============================================
  // 背面ロゴ（透かし・ブラケットより奥に表示）
  // =============================================
  backLogos.forEach(logo => drawLogoImage(svgEl, logo, isAdmin));

  // =============================================
  // タイトル
  // =============================================
  const titleEl = ce('text', {
    x: svgWidth / 2, y: titleY,
    'text-anchor': 'middle', 'dominant-baseline': 'middle',
    fill: C.titleText, 'font-size': 28, 'font-weight': 'bold',
    'font-family': 'Noto Sans JP, sans-serif',
    filter: 'url(#glow-title)'
  });
  titleEl.textContent = settings.title || 'トーナメント大会';
  svgEl.appendChild(titleEl);

  // =============================================
  // ラウンドラベル（タイトル直下の行）
  // =============================================
  function addLabel(x, text) {
    const lEl = ce('text', {
      x, y: labelY,
      'text-anchor': 'middle', fill: C.label,
      'font-size': 14, 'font-family': 'Noto Sans JP, sans-serif',
      'letter-spacing': '0.05em'
    });
    lEl.textContent = text;
    svgEl.appendChild(lEl);
  }

  if (numRounds >= 2) {
    for (let r = 0; r <= numRounds - 2; r++) {
      const label = getRoundLabel(r, numRounds);
      addLabel(xLeft(r) + colWidth(r) / 2, label);
      addLabel(xRight(r) + colWidth(r) / 2, label);
    }
  }
  addLabel(xCenter + colWidth(numRounds - 1) / 2, '決勝');

  // =============================================
  // 優勝者バナー（ラウンドラベル行の下・中央、優勝者決定時のみ表示）
  // =============================================
  if (hasChampion) {
    const champBoxX = svgWidth / 2 - CHAMP_BANNER_W / 2;

    const cRect = ce('rect', {
      x: champBoxX, y: champTop, width: CHAMP_BANNER_W, height: CHAMP_BANNER_H,
      fill: '#c9942f', rx: 10,
      filter: 'url(#glow-gold)'
    });
    svgEl.appendChild(cRect);

    const icon = ce('text', {
      x: svgWidth / 2, y: champTop + 18,
      'text-anchor': 'middle', fill: '#3a2600', 'font-size': 14,
      'font-weight': 'bold',
      'font-family': 'Noto Sans JP, sans-serif'
    });
    icon.textContent = '🏆 CHAMPION 🏆';
    svgEl.appendChild(icon);

    const cName = ce('text', {
      x: svgWidth / 2, y: champTop + CHAMP_BANNER_H - 18,
      'text-anchor': 'middle', fill: '#2a1a00', 'font-size': 22,
      'font-weight': 'bold', 'font-family': 'Noto Sans JP, sans-serif'
    });
    cName.textContent = truncate(finalMatch.winner.name, 16);
    svgEl.appendChild(cName);
  }

  // =============================================
  // 座標マップの構築
  // =============================================
  const matchX = {};
  const matchY = {};
  const matchW = {};
  const matchSide = {};

  matchX[finalId] = xCenter;
  matchY[finalId] = finalYAbs;
  matchW[finalId] = colWidth(numRounds - 1);
  matchSide[finalId] = 'final';

  if (numRounds >= 2) {
    for (let r = 0; r <= numRounds - 2; r++) {
      const localCount = halfMatchCount0 / Math.pow(2, r);
      const blockH = totalH / localCount;
      const ids = rounds[r].matches;
      const half = ids.length / 2;
      const leftIds  = ids.slice(0, half);
      const rightIds = ids.slice(half);
      const w = colWidth(r);

      leftIds.forEach((id, li) => {
        matchY[id] = BRACKET_TOP + li * blockH + blockH / 2;
        matchX[id] = xLeft(r);
        matchW[id] = w;
        matchSide[id] = 'left';
      });
      rightIds.forEach((id, li) => {
        matchY[id] = BRACKET_TOP + li * blockH + blockH / 2;
        matchX[id] = xRight(r);
        matchW[id] = w;
        matchSide[id] = 'right';
      });
    }
  }

  // =============================================
  // BYE不戦勝の判定
  // ラウンド0の試合で片方がBYEの場合、その試合枠（両スロット）と
  // それに続く接続線は非表示にし、実際に対戦が発生する次ラウンドから
  // 表示が始まるようにする（BYE同士の対戦は seed 分散アルゴリズムの
  // 性質上発生しないため、ラウンド0のみで判定すれば十分）
  // =============================================
  function isHiddenByeMatch(m) {
    if (!m || m.isThirdPlace || m.roundIndex !== 0) return false;
    const p1Bye = !!(m.player1 && m.player1.isBye);
    const p2Bye = !!(m.player2 && m.player2.isBye);
    return p1Bye || p2Bye; // どちらかがBYEを含む場合は非表示（不戦勝はブラケットに表示しない）
  }

  // =============================================
  // コンパクト表示: この試合の枠自体を描画するかどうかを判定
  // コンパクト表示ON時は、名前ありの大きな枠か、名前なしの小さな枠かの違いはあれど、
  // すべてのラウンドで何らかの視認・クリック可能な枠を描画する（枠を完全に消して
  // 接続線だけにはしない。クリック位置がわかりにくくなるため）
  // =============================================
  function computeShowBox(m) {
    return true;
  }

  // =============================================
  // コンパクト表示: このスロットの対戦者名を表示するかどうかを判定
  // ・OFF（通常表示）の場合は常にtrue
  // ・3位決定戦は常にtrue（単発の対戦で幅への影響が小さいため）
  // ・1回戦（ラウンド0）・決勝（最終ラウンド）は常にtrue（名前ありの大きな枠）
  // ・それ以外の中間ラウンド（2回戦〜準決勝など）はfalse（名前は表示せず、
  //   小さな枠の色と接続線のみで勝敗を示す）
  // =============================================
  function computeShowName(m) {
    if (!C.compactMode) return true;
    if (m.isThirdPlace) return true;
    return m.roundIndex === 0 || m.roundIndex === numRounds - 1;
  }

  // =============================================
  // 接続線（子試合 → 親試合）
  // =============================================
  for (const mid in tournament.matches) {
    const m = tournament.matches[mid];
    if (m.isThirdPlace || !m.nextMatchId || matchX[mid] === undefined) continue;
    if (isHiddenByeMatch(m)) continue;

    const childSide  = matchSide[mid];
    const parentId   = m.nextMatchId;
    const parentSide = matchSide[parentId];
    if (matchX[parentId] === undefined) continue;

    const outX = childSide === 'left' ? matchX[mid] + matchW[mid] : matchX[mid];
    let inX;
    if (parentSide === 'final') {
      inX = childSide === 'left' ? matchX[parentId] : matchX[parentId] + matchW[parentId];
    } else if (parentSide === 'left') {
      inX = matchX[parentId];
    } else {
      inX = matchX[parentId] + matchW[parentId];
    }

    const childY  = matchY[mid];
    const parentY = matchY[parentId];
    const isWin   = !!(m.winner && !m.winner.isBye);

    drawLine(svgEl, outX, childY, inX, parentY, isWin ? C.lineWin : C.line, isWin);
  }

  // =============================================
  // 3位決定戦の接続線（準決勝敗者 → 3位決定戦、破線）
  // =============================================
  // 3位決定戦は常に枠・名前を表示するため、決勝と同じ「名前あり」の幅
  // （colWidth(numRounds-1)。コンパクト表示時はSLOT_W_COMPACT_NAMED）を使う
  const tpWidth = colWidth(numRounds - 1);
  if (hasThirdPlace) {
    const tp = tournament.matches[tournament.thirdPlaceMatchId];
    const [semiLeftId, semiRightId] = tp.semiIds;
    const tpX = xCenter;
    const tpY1 = thirdYAbs - matchH / 2;              // player1 slot top
    const tpY2 = thirdYAbs + PAIR_GAP / 2;            // player2 slot top
    const tpSlot1Cy = tpY1 + SLOT_H / 2;
    const tpSlot2Cy = tpY2 + SLOT_H / 2;

    const isWin = !!(tp.winner && !tp.winner.isBye);
    const tpLineColor = isWin ? C.bronze : C.line;

    if (matchX[semiLeftId] !== undefined) {
      const outX = matchX[semiLeftId] + matchW[semiLeftId]; // 左ブロックなので右端から出る
      drawLine(svgEl, outX, matchY[semiLeftId], tpX, tpSlot1Cy, tpLineColor, false, true);
    }
    if (matchX[semiRightId] !== undefined) {
      const outX = matchX[semiRightId]; // 右ブロックなので左端から出る
      drawLine(svgEl, outX, matchY[semiRightId], tpX + tpWidth, tpSlot2Cy, tpLineColor, false, true);
    }
  }

  // =============================================
  // プレイヤー枠描画（通常のブラケット）
  // =============================================
  for (const mid in tournament.matches) {
    const m = tournament.matches[mid];
    if (m.isThirdPlace || matchX[mid] === undefined) continue;
    if (isHiddenByeMatch(m)) continue;

    const x  = matchX[mid];
    const cy = matchY[mid];
    const y1 = cy - matchH / 2;
    const y2 = cy + PAIR_GAP / 2;
    const w  = matchW[mid];

    const showBox  = computeShowBox(m);
    const showName = computeShowName(m);
    drawSlot(svgEl, m, 'player1', x, y1, w, SLOT_H, C, isAdmin, showName, showBox);
    drawSlot(svgEl, m, 'player2', x, y2, w, SLOT_H, C, isAdmin, showName, showBox);
  }

  // =============================================
  // 3位決定戦の描画
  // =============================================
  if (hasThirdPlace) {
    const tp = tournament.matches[tournament.thirdPlaceMatchId];
    const tpX = xCenter;

    const lbl = ce('text', {
      x: tpX + tpWidth / 2, y: thirdLabelYAbs,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: C.bronze,
      'font-size': 14, 'font-weight': 'bold',
      'font-family': 'Noto Sans JP, sans-serif',
      'letter-spacing': '0.04em'
    });
    lbl.textContent = '🥉 3位決定戦';
    svgEl.appendChild(lbl);

    const y1 = thirdYAbs - matchH / 2;
    const y2 = thirdYAbs + PAIR_GAP / 2;

    drawSlot(svgEl, tp, 'player1', tpX, y1, tpWidth, SLOT_H, { ...C, slotWin: C.bronze }, isAdmin, true, true);
    drawSlot(svgEl, tp, 'player2', tpX, y2, tpWidth, SLOT_H, { ...C, slotWin: C.bronze }, isAdmin, true, true);
  }

  // =============================================
  // 前面ロゴ（ブラケットより手前に表示、最後に描画）
  // =============================================
  frontLogos.forEach(logo => drawLogoImage(svgEl, logo, isAdmin));
}

// =============================================
// ロゴ・画像描画（管理画面ではドラッグ移動・リサイズハンドル付き）
// =============================================
function drawLogoImage(svgEl, logo, isAdmin) {
  const x = logo.x !== undefined ? logo.x : LOGO_DEFAULT_X;
  const y = logo.y !== undefined ? logo.y : LOGO_DEFAULT_Y;
  const w = logo.width || 80;
  const h = w * (logo.aspect || 1);
  const opacity = logo.opacity !== undefined ? logo.opacity : 1;

  const g = ce('g', isAdmin ? { 'data-logo-id': logo.id, class: 'logo-drag-group' } : {});

  if (isAdmin) {
    g.appendChild(ce('rect', {
      x, y, width: w, height: h,
      fill: 'none', stroke: '#4fc3f7', 'stroke-width': 1.5,
      'stroke-dasharray': '4 3',
      class: 'logo-drag-border', 'data-logo-id': logo.id
    }));
  }

  const imgAttrs = {
    x, y, width: w, height: h,
    href: logo.dataUrl, opacity,
    preserveAspectRatio: 'xMidYMid meet'
  };
  if (isAdmin) {
    imgAttrs['data-logo-id'] = logo.id;
    imgAttrs.class = 'logo-drag-image';
  }
  const img = ce('image', imgAttrs);
  // 古いブラウザ互換のため xlink:href も設定
  try {
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', logo.dataUrl);
  } catch (e) { /* noop */ }
  g.appendChild(img);

  if (isAdmin) {
    const hs = LOGO_HANDLE_SIZE;
    g.appendChild(ce('rect', {
      x: x + w - hs / 2, y: y + h - hs / 2, width: hs, height: hs, rx: 3,
      fill: '#4fc3f7', stroke: '#0d3a4a', 'stroke-width': 1,
      class: 'logo-resize-handle', 'data-logo-id': logo.id
    }));
  }

  svgEl.appendChild(g);
}

// =============================================
// プレイヤー枠描画
// =============================================
function drawSlot(svgEl, match, slot, x, y, w, h, C, isAdmin, showName = true, showBox = true) {
  const player = match[slot];
  if (!player) return;

  const isWinner  = match.winner && !match.winner.isBye && match.winner.name === player.name && player.name !== '';
  const isBye     = player.isBye;
  const isEmpty   = !player.name || player.name === '';
  const isAutoAdv = player.autoAdvanced;
  const canClick  = isAdmin && !isBye && !isEmpty;
  const hasCategory = C.showCategory && !isBye && !isEmpty && !!(player.category && player.category.trim());

  let fill = C.slot;
  if (isBye)          fill = C.slotBye;
  else if (isWinner)  fill = C.slotWin;
  else if (isAutoAdv) fill = blendHex(C.slot, '#1a4a2a', 0.5);

  const attrs = {
    x, y, width: w, height: h,
    fill, rx: 5,
    stroke: isWinner ? C.slotWin : (isBye ? 'none' : C.border),
    'stroke-width': isWinner ? Math.max(C.borderWidth, 2) : C.borderWidth,
    opacity: isBye ? 0.35 : 1,
    'data-match-id': match.id,
    'data-slot': slot
  };
  if (isWinner) attrs.filter = 'url(#glow-win)';
  if (canClick) attrs.class = 'slot-clickable';

  const rect = ce('rect', attrs);
  if (canClick) rect.style.cursor = 'pointer';
  svgEl.appendChild(rect);

  if (isWinner) {
    const dot = ce('circle', { cx: x + 14, cy: y + h / 2, r: 5, fill: '#fff' });
    svgEl.appendChild(dot);
  }

  // コンパクト表示: 名前を表示しないスロット（2回戦）は、枠の色（勝者強調）と
  // 接続線の色のみで勝敗を示し、テキストは一切描画しない
  if (!showName) return;

  const tx = x + (isWinner ? 28 : 12);
  const padRight = 12;
  const availW = Math.max(10, w - (tx - x) - padRight);
  const nameColor = isBye ? C.byeText : (isWinner ? '#fff' : (isEmpty ? C.label : C.text));
  const nameWeight = (isWinner || C.nameBold) ? 'bold' : 'normal';
  const nameFontFamily = `${C.nameFont}, "Noto Sans JP", sans-serif`;
  const ty = y + h / 2;

  // BYE表示
  if (isBye) {
    const tEl = ce('text', {
      x: tx, y: ty, 'dominant-baseline': 'middle',
      fill: nameColor, 'font-size': BYE_FONT_SIZE, 'font-family': 'Noto Sans JP, sans-serif',
      'pointer-events': 'none'
    });
    tEl.textContent = 'BYE';
    svgEl.appendChild(tEl);
    return;
  }

  // 未確定プレースホルダー
  if (isEmpty) {
    const tEl = ce('text', {
      x: tx, y: ty, 'dominant-baseline': 'middle',
      fill: nameColor, 'font-size': EMPTY_FONT_SIZE, 'font-family': 'Noto Sans JP, sans-serif',
      'pointer-events': 'none'
    });
    tEl.textContent = '─ ─ ─';
    svgEl.appendChild(tEl);
    return;
  }

  const rawName = player.name;
  const catColor = isWinner ? 'rgba(255,255,255,0.85)' : C.label;

  if (hasCategory) {
    const catText = `(${player.category.trim()})`;

    // まず「名前 + カテゴリー」の1行表示が枠幅に収まるか判定
    const nameW = measureTextWidth(rawName, NAME_SIZE_INLINE, nameWeight, nameFontFamily);
    const catW  = measureTextWidth(catText, CAT_SIZE_INLINE, 'normal');
    const totalW = nameW + NAME_CAT_GAP + catW;

    if (totalW <= availW) {
      // 1行表示：名前の後にカテゴリー（デフォルト位置）
      const textEl = ce('text', {
        x: tx, y: ty, 'dominant-baseline': 'middle',
        'font-size': NAME_SIZE_INLINE,
        'pointer-events': 'none'
      });
      const nameTspan = ce('tspan', { fill: nameColor, 'font-weight': nameWeight, 'font-family': nameFontFamily });
      nameTspan.textContent = rawName;
      textEl.appendChild(nameTspan);

      const catTspan = ce('tspan', { fill: catColor, 'font-size': CAT_SIZE_INLINE, dx: NAME_CAT_GAP, 'font-family': 'Noto Sans JP, sans-serif' });
      catTspan.textContent = catText;
      textEl.appendChild(catTspan);

      svgEl.appendChild(textEl);
    } else {
      // 収まらない場合：カテゴリーを下段に移動し、名前・カテゴリーのフォントを調整
      const nameY = y + h * 0.35;
      const catY  = y + h * 0.72;

      const nameDisplay = truncateToWidth(rawName, NAME_SIZE_STACKED, availW, nameWeight, nameFontFamily);
      const catDisplay  = truncateToWidth(catText, CAT_SIZE_STACKED, availW, 'normal');

      const nameEl = ce('text', {
        x: tx, y: nameY, 'dominant-baseline': 'middle',
        fill: nameColor, 'font-size': NAME_SIZE_STACKED, 'font-weight': nameWeight,
        'font-family': nameFontFamily, 'pointer-events': 'none'
      });
      nameEl.textContent = nameDisplay;
      svgEl.appendChild(nameEl);

      const catEl = ce('text', {
        x: tx, y: catY, 'dominant-baseline': 'middle',
        fill: catColor, 'font-size': CAT_SIZE_STACKED,
        'font-family': 'Noto Sans JP, sans-serif', 'pointer-events': 'none'
      });
      catEl.textContent = catDisplay;
      svgEl.appendChild(catEl);
    }
  } else {
    // カテゴリー無し：1行で名前のみ、枠幅に収まるよう自動調整
    const nameDisplay = truncateToWidth(rawName, NAME_SIZE_INLINE, availW, nameWeight, nameFontFamily);
    const tEl = ce('text', {
      x: tx, y: ty, 'dominant-baseline': 'middle',
      fill: nameColor, 'font-size': NAME_SIZE_INLINE, 'font-weight': nameWeight,
      'font-family': nameFontFamily, 'pointer-events': 'none'
    });
    tEl.textContent = nameDisplay;
    svgEl.appendChild(tEl);
  }
}

// =============================================
// 直角コネクタ線（方向を問わず H-V-H で結ぶ）
// =============================================
function drawLine(svgEl, x1, y1, x2, y2, color, isWin, isDashed) {
  let d;
  if (Math.abs(y1 - y2) < 1) {
    d = `M ${x1} ${y1} H ${x2}`;
  } else {
    const mx = (x1 + x2) / 2;
    d = `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`;
  }
  const attrs = {
    d, stroke: color,
    'stroke-width': isWin ? 4 : 2.5,
    fill: 'none',
    opacity: isWin ? 0.95 : (isDashed ? 0.6 : 0.55)
  };
  if (isDashed) attrs['stroke-dasharray'] = '5 4';
  const path = ce('path', attrs);
  if (isWin) path.setAttribute('filter', 'url(#glow-win)');
  svgEl.appendChild(path);
}

// =============================================
// ユーティリティ
// =============================================
function ce(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, v);
  }
  return el;
}

function hexToRgba(hex, opacity = 1) {
  if (!hex || hex.length < 7) return `rgba(26,26,46,${opacity})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function blendHex(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, '0');
  const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, '0');
  const b = Math.round(b1 + (b2 - b1) * t).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

// =============================================
// テキスト幅計測（Canvas 2D を利用したピクセル単位での実測）
// フォントサイズに応じて「名前+カテゴリー」が1行に収まるか判定し、
// 収まらない場合の省略（truncate）にも使用する。
// =============================================
let _measureCanvas = null;
function getMeasureCtx() {
  if (!_measureCanvas) {
    _measureCanvas = document.createElement('canvas');
  }
  return _measureCanvas.getContext('2d');
}

function measureTextWidth(text, fontSize, weight, fontFamily) {
  if (!text) return 0;
  const ctx = getMeasureCtx();
  ctx.font = `${weight || 'normal'} ${fontSize}px ${fontFamily || '"Noto Sans JP", sans-serif'}`;
  return ctx.measureText(text).width;
}

/**
 * text を fontSize/weight で maxWidth 以内に収まるよう末尾を省略（…付き）する。
 * 文字数ではなく実測ピクセル幅で判定するため、フォントサイズ変更に強い。
 */
function truncateToWidth(text, fontSize, maxWidth, weight, fontFamily) {
  if (!text) return '';
  if (measureTextWidth(text, fontSize, weight, fontFamily) <= maxWidth) return text;

  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + '…';
    if (measureTextWidth(candidate, fontSize, weight, fontFamily) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? text.slice(0, lo) + '…' : '…';
}

function getRoundLabel(r, total) {
  if (total === 1) return '決勝';
  if (r === total - 1) return '決勝';
  if (r === total - 2) return total > 2 ? '準決勝' : '1回戦';
  if (r === total - 3) return '準々決勝';
  return `第${r + 1}回戦`;
}

window.DrawLib = { drawTournament, hexToRgba };

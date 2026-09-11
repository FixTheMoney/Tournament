/**
 * tournament.js
 * トーナメント表の生成・管理ロジック
 */

// =============================================
// トーナメント生成ロジック
// =============================================

/**
 * 2の累乗の中で n 以上の最小値を返す
 */
function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * シード（不戦勝）枠を均等に分散配置するためのインデックスを生成
 */
function generateByeSlots(n, total) {
  const byeCount = total - n;
  if (byeCount === 0) return [];

  const slots = [];
  const step = total / byeCount;
  for (let i = 0; i < byeCount; i++) {
    slots.push(Math.floor(i * step + step - 1));
  }
  return slots;
}

/**
 * トーナメントの対戦組み合わせツリーを生成
 * @param {number} numPlayers - 参加者数
 * @param {string[]} playerNames - 参加者名の配列
 * @param {string[]} [playerCategories] - 参加者カテゴリの配列（省略可）
 * @returns {Object} トーナメントデータ
 */
function generateTournament(numPlayers, playerNames, playerCategories) {
  const total = nextPowerOf2(numPlayers);
  const numRounds = Math.log2(total);
  const byeSlots = generateByeSlots(numPlayers, total);
  const categories = playerCategories || [];

  // スロット配列を作成（BYE or プレイヤー名）
  const slots = [];
  let playerIndex = 0;
  for (let i = 0; i < total; i++) {
    if (byeSlots.includes(i)) {
      slots.push({ name: 'BYE', isBye: true, id: `bye_${i}` });
    } else {
      const name = playerNames[playerIndex] || `Player ${playerIndex + 1}`;
      const category = categories[playerIndex] || '';
      slots.push({ name, category, isBye: false, id: `player_${i}` });
      playerIndex++;
    }
  }

  const tournament = {
    numPlayers,
    total,
    rounds: [],
    matches: {},
    thirdPlaceMatchId: null
  };

  // Round 1: スロットをペアにして試合を作る
  let currentRoundMatches = [];
  for (let i = 0; i < total; i += 2) {
    const p1 = slots[i];
    const p2 = slots[i + 1];
    const matchId = `r0_m${i / 2}`;
    const match = {
      id: matchId,
      roundIndex: 0,
      matchIndex: i / 2,
      player1: p1,
      player2: p2,
      winner: null,
      nextMatchId: null,
      nextSlot: null
    };

    if (p1.isBye && p2.isBye) {
      match.winner = { name: 'BYE', isBye: true, id: `bye_auto_${i}` };
    } else if (p1.isBye) {
      match.winner = { ...p2, autoAdvanced: true };
    } else if (p2.isBye) {
      match.winner = { ...p1, autoAdvanced: true };
    }

    currentRoundMatches.push(match);
    tournament.matches[matchId] = match;
  }
  tournament.rounds.push({ matches: currentRoundMatches.map(m => m.id) });

  // 以降のラウンドを構築
  for (let r = 1; r < numRounds; r++) {
    const prevRoundMatches = currentRoundMatches;
    currentRoundMatches = [];
    for (let i = 0; i < prevRoundMatches.length; i += 2) {
      const m1 = prevRoundMatches[i];
      const m2 = prevRoundMatches[i + 1];
      const matchId = `r${r}_m${i / 2}`;

      const p1 = m1.winner || { name: '', isBye: false, fromMatchId: m1.id, id: `from_${m1.id}` };
      const p2 = m2.winner || { name: '', isBye: false, fromMatchId: m2.id, id: `from_${m2.id}` };

      const match = {
        id: matchId,
        roundIndex: r,
        matchIndex: i / 2,
        player1: p1,
        player2: p2,
        winner: null,
        nextMatchId: null,
        nextSlot: null,
        prevMatch1Id: m1.id,
        prevMatch2Id: m2.id
      };

      m1.nextMatchId = matchId;
      m1.nextSlot = 'player1';
      m2.nextMatchId = matchId;
      m2.nextSlot = 'player2';

      currentRoundMatches.push(match);
      tournament.matches[matchId] = match;
    }
    tournament.rounds.push({ matches: currentRoundMatches.map(m => m.id) });
  }

  // --- 3位決定戦の設置（参加人数が4人以上の場合） ---
  if (numPlayers >= 4 && numRounds >= 2) {
    const semiRoundIndex = numRounds - 2;
    const semiIds = tournament.rounds[semiRoundIndex].matches;
    if (semiIds.length === 2) {
      const semi1 = tournament.matches[semiIds[0]];
      const semi2 = tournament.matches[semiIds[1]];

      const thirdPlaceMatch = {
        id: 'third_place',
        roundIndex: semiRoundIndex,
        matchIndex: 0,
        isThirdPlace: true,
        semiIds: [semi1.id, semi2.id],
        player1: { name: '', isBye: false, fromMatchId: semi1.id, id: `tp_from_${semi1.id}` },
        player2: { name: '', isBye: false, fromMatchId: semi2.id, id: `tp_from_${semi2.id}` },
        winner: null,
        nextMatchId: null,
        nextSlot: null
      };

      semi1.loserNextMatchId = 'third_place';
      semi1.loserNextSlot = 'player1';
      semi2.loserNextMatchId = 'third_place';
      semi2.loserNextSlot = 'player2';

      tournament.matches['third_place'] = thirdPlaceMatch;
      tournament.thirdPlaceMatchId = 'third_place';
    }
  }

  // BYE による自動進出を再帰的に解決（3位決定戦の敗者伝播も含む）
  resolveByeAdvancement(tournament);

  return tournament;
}

/**
 * BYE による自動進出を全ラウンドで解決し、3位決定戦の敗者情報も同期する
 */
function resolveByeAdvancement(tournament) {
  for (let r = 1; r < tournament.rounds.length; r++) {
    const roundMatchIds = tournament.rounds[r].matches;
    for (const matchId of roundMatchIds) {
      const match = tournament.matches[matchId];
      if (match.prevMatch1Id) {
        const prev1 = tournament.matches[match.prevMatch1Id];
        if (prev1.winner) {
          match.player1 = { ...prev1.winner };
        }
      }
      if (match.prevMatch2Id) {
        const prev2 = tournament.matches[match.prevMatch2Id];
        if (prev2.winner) {
          match.player2 = { ...prev2.winner };
        }
      }
      if (match.player1.isBye && match.player2.isBye) {
        match.winner = { name: 'BYE', isBye: true, id: `bye_auto_r${r}` };
      } else if (match.player1.isBye) {
        match.winner = { ...match.player2, autoAdvanced: true };
      } else if (match.player2.isBye) {
        match.winner = { ...match.player1, autoAdvanced: true };
      }
    }
  }

  seedThirdPlaceMatch(tournament);
}

/**
 * 準決勝の敗者情報を3位決定戦に同期する
 */
function seedThirdPlaceMatch(tournament) {
  const tpId = tournament.thirdPlaceMatchId;
  if (!tpId) return;
  const tp = tournament.matches[tpId];
  if (!tp || !tp.semiIds) return;

  tp.semiIds.forEach((semiId, idx) => {
    const semi = tournament.matches[semiId];
    if (!semi || !semi.winner) return;
    const slot = idx === 0 ? 'player1' : 'player2';

    let loser;
    const p1MatchesWinner = semi.player1 &&
      semi.player1.name === semi.winner.name &&
      !!semi.player1.isBye === !!semi.winner.isBye;
    loser = p1MatchesWinner ? semi.player2 : semi.player1;

    if (loser) {
      tp[slot] = { ...loser };
    }
  });

  // 両者揃った時点で BYE が絡む場合は自動決定
  if (tp.player1 && tp.player2) {
    if (tp.player1.isBye && tp.player2.isBye) {
      tp.winner = { name: 'BYE', isBye: true };
    } else if (tp.player1.isBye && tp.player2.name) {
      tp.winner = { ...tp.player2, autoAdvanced: true };
    } else if (tp.player2.isBye && tp.player1.name) {
      tp.winner = { ...tp.player1, autoAdvanced: true };
    }
  }
}

/**
 * 試合の勝者を設定して、後続試合（および3位決定戦）に反映する
 */
function setMatchWinner(tournament, matchId, winnerSlot) {
  const match = tournament.matches[matchId];
  if (!match) return false;

  const loserSlot = winnerSlot === 'player1' ? 'player2' : 'player1';
  const winner = match[winnerSlot];
  const loser = match[loserSlot];

  match.winner = { ...winner, advanced: true };

  // 次の試合に勝者を伝播
  propagateWinner(tournament, matchId);

  // 3位決定戦への敗者伝播（準決勝のみ該当）
  if (match.loserNextMatchId) {
    const lm = tournament.matches[match.loserNextMatchId];
    if (lm) {
      lm[match.loserNextSlot] = { ...loser };
      if (lm.player1 && lm.player2) {
        if (lm.player1.isBye && lm.player2.isBye) {
          lm.winner = { name: 'BYE', isBye: true };
        } else if (lm.player1.isBye && lm.player2.name) {
          lm.winner = { ...lm.player2, autoAdvanced: true };
        } else if (lm.player2.isBye && lm.player1.name) {
          lm.winner = { ...lm.player1, autoAdvanced: true };
        }
      }
    }
  }

  return true;
}

/**
 * 勝者を後続試合に再帰的に伝播
 */
function propagateWinner(tournament, matchId) {
  const match = tournament.matches[matchId];
  if (!match || !match.winner || !match.nextMatchId) return;

  const nextMatch = tournament.matches[match.nextMatchId];
  if (!nextMatch) return;

  nextMatch[match.nextSlot] = { ...match.winner };

  if (nextMatch.player1 && nextMatch.player2) {
    if (nextMatch.player1.isBye && nextMatch.player2.isBye) {
      nextMatch.winner = { name: 'BYE', isBye: true };
      propagateWinner(tournament, nextMatch.id);
    } else if (nextMatch.player1.isBye && !nextMatch.player2.isBye) {
      nextMatch.winner = { ...nextMatch.player2, autoAdvanced: true };
      propagateWinner(tournament, nextMatch.id);
    } else if (nextMatch.player2.isBye && !nextMatch.player1.isBye) {
      nextMatch.winner = { ...nextMatch.player1, autoAdvanced: true };
      propagateWinner(tournament, nextMatch.id);
    }
  }
}

/**
 * 試合の勝者をリセット（後続試合・3位決定戦への伝播も解除）
 */
function resetMatchWinner(tournament, matchId) {
  const match = tournament.matches[matchId];
  if (!match) return;

  match.winner = null;

  // 後続試合（勝者側）のリセット
  if (match.nextMatchId) {
    const nextMatch = tournament.matches[match.nextMatchId];
    if (nextMatch) {
      nextMatch[match.nextSlot] = { name: '', isBye: false, fromMatchId: matchId };
      if (nextMatch.winner && !nextMatch.winner.isBye) {
        resetMatchWinner(tournament, nextMatch.id);
      } else {
        nextMatch.winner = null;
      }
    }
  }

  // 3位決定戦（敗者側）のリセット
  if (match.loserNextMatchId) {
    const loserMatch = tournament.matches[match.loserNextMatchId];
    if (loserMatch) {
      loserMatch[match.loserNextSlot] = { name: '', isBye: false, fromMatchId: matchId };
      loserMatch.winner = null;
    }
  }
}

/**
 * 参加者名を更新
 */
function updatePlayerName(tournament, originalId, newName) {
  for (const matchId in tournament.matches) {
    const match = tournament.matches[matchId];
    if (match.player1 && match.player1.id === originalId) {
      match.player1.name = newName;
    }
    if (match.player2 && match.player2.id === originalId) {
      match.player2.name = newName;
    }
    if (match.winner && match.winner.id === originalId) {
      match.winner.name = newName;
    }
  }
}

/**
 * トーナメントデータを LocalStorage / BroadcastChannel 用に保存
 */
function saveTournament(tournament, settings) {
  const data = { tournament, settings, updatedAt: Date.now() };
  localStorage.setItem('tournamentData', JSON.stringify(data));
  try {
    const bc = new BroadcastChannel('tournament_channel');
    bc.postMessage({ type: 'UPDATE', data });
    bc.close();
  } catch (e) {
    console.warn('BroadcastChannel not supported', e);
  }
}

/**
 * トーナメントデータを LocalStorage から読み込む
 */
function loadTournament() {
  const raw = localStorage.getItem('tournamentData');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// エクスポート
window.TournamentLib = {
  generateTournament,
  setMatchWinner,
  resetMatchWinner,
  updatePlayerName,
  saveTournament,
  loadTournament,
  nextPowerOf2,
  resolveByeAdvancement,
  seedThirdPlaceMatch
};

function emptyPlayerStat() {
  return {
    hu: 0,
    zimo: 0,
    chong: 0,
    fanSum: 0,
    fanHands: 0,
    specialDi: 0,
    maxLian: 0,
  };
}

function ensurePlayerStat(game, id) {
  if (!id) return emptyPlayerStat();
  if (!game.playerStats) game.playerStats = {};
  if (!game.playerStats[id]) game.playerStats[id] = emptyPlayerStat();
  return game.playerStats[id];
}

function recordLian(game, dealerId, consecutiveBefore, dealerStays) {
  if (!dealerId) return;
  const streak = dealerStays ? Number(consecutiveBefore || 0) + 1 : Number(consecutiveBefore || 0);
  const st = ensurePlayerStat(game, dealerId);
  if (streak > st.maxLian) st.maxLian = streak;
}

function recordWindProgress(game, result) {
  if (!result || !result.windCompleted) return;
  game.windsCompleted = (Number(game.windsCompleted) || 0) + 1;
}

function addSpecialDi(game, id, delta) {
  if (!id || !delta) return;
  const st = ensurePlayerStat(game, id);
  st.specialDi = Math.round((st.specialDi + delta) * 100) / 100;
}

function recordSpecialStats(game, result) {
  const di = Number(result.di) || 0;
  (result.payments || []).forEach((p) => {
    addSpecialDi(game, p.winnerId, di);
    addSpecialDi(game, p.loserId, -di);
  });
}

function recomputeSpecialDi(game) {
  Object.keys(game.playerStats || {}).forEach((id) => {
    game.playerStats[id].specialDi = 0;
  });
  (game.log || []).forEach((row) => {
    if (row.type !== "special") return;
    const di = Number(row.di != null ? row.di : row.faceFan) || 0;
    (row.payments || []).forEach((p) => {
      const winner = p.winnerId || row.winnerId;
      const loser = p.loserId;
      addSpecialDi(game, winner, di);
      addSpecialDi(game, loser, -di);
    });
  });
}

function recordWinStats(game, result) {
  const winnerIds = [...new Set((result.payments || []).map((p) => p.winnerId))];
  const seenFan = new Set();
  (result.payments || []).forEach((p) => {
    if (seenFan.has(p.winnerId)) return;
    seenFan.add(p.winnerId);
    const st = ensurePlayerStat(game, p.winnerId);
    const face = Number(p.breakdown && p.breakdown.faceFan) || 0;
    st.fanSum += face;
    st.fanHands += 1;
  });
  winnerIds.forEach((id) => {
    const st = ensurePlayerStat(game, id);
    if (result.isZimo) st.zimo += 1;
    else st.hu += 1;
  });
  if (!result.isZimo) {
    const discarderId = result.payments[0] && result.payments[0].loserId;
    if (discarderId) ensurePlayerStat(game, discarderId).chong += 1;
  }
}

function formatStatDi(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(v);
}

function playerStatRows(game) {
  const seatedIds = (game.seats || []).filter(Boolean);
  const seatedSet = new Set(seatedIds);
  const ordered = [];
  const seen = new Set();
  seatedIds.forEach((id) => {
    const p = (game.players || []).find((x) => x.id === id);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      ordered.push(p);
    }
  });
  (game.players || []).forEach((p) => {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      ordered.push(p);
    }
  });
  return ordered.map((p) => {
    const st = (game.playerStats && game.playerStats[p.id]) || emptyPlayerStat();
    const wins = st.hu + st.zimo;
    return {
      player: p,
      seated: seatedSet.has(p.id),
      ...st,
      wins,
      avgFan: st.fanHands ? st.fanSum / st.fanHands : null,
    };
  });
}

function maxIds(rows, key, minValue) {
  if (!rows.length) return [];
  const m = Math.max(...rows.map((r) => Number(r[key]) || 0));
  if (m < (minValue == null ? 0 : minValue)) return [];
  if (m === 0 && minValue == null) return [];
  return rows.filter((r) => (Number(r[key]) || 0) === m).map((r) => r.player.id);
}

function pickFanKings(rows) {
  const withFan = rows.filter((r) => r.avgFan != null);
  if (withFan.length < 2) return { big: null, small: null };
  const meanWins = rows.reduce((s, r) => s + r.wins, 0) / rows.length;
  const regular = withFan.filter((r) => r.wins >= meanWins);
  const pool = regular.length >= 2 ? regular : withFan;
  const spread = Math.max(...pool.map((r) => r.avgFan)) - Math.min(...pool.map((r) => r.avgFan));
  if (spread < 1e-9) return { big: null, small: null };
  const byBig = pool
    .slice()
    .sort((a, b) => b.avgFan - a.avgFan || b.fanHands - a.fanHands || b.fanSum - a.fanSum);
  const big = byBig[0];
  const rest = pool.filter((r) => r.player.id !== big.player.id);
  const small = rest
    .slice()
    .sort((a, b) => a.avgFan - b.avgFan || b.fanHands - a.fanHands || a.fanSum - b.fanSum)[0];
  if (!small || small.avgFan >= big.avgFan) return { big, small: null };
  return { big, small };
}

function assignTitles(rows, unlocked) {
  const titles = {};
  rows.forEach((r) => {
    titles[r.player.id] = [];
  });
  if (!unlocked || !rows.length) return titles;

  const add = (ids, name) => {
    ids.forEach((id) => {
      if (titles[id] && !titles[id].includes(name)) titles[id].push(name);
    });
  };

  add(maxIds(rows, "hu"), "食糊王");
  add(maxIds(rows, "zimo"), "自摸王");
  add(maxIds(rows, "maxLian"), "連莊王");
  add(maxIds(rows, "chong"), "出銃王");

  const specials = rows.map((r) => r.specialDi);
  if (specials.some((v) => v !== 0)) add(maxIds(rows, "specialDi", -Infinity), "運氣王");

  const kings = pickFanKings(rows);
  if (kings.big) add([kings.big.player.id], "大牌王");
  if (kings.small) add([kings.small.player.id], "細牌王");

  const meanWins = rows.reduce((s, r) => s + r.wins, 0) / rows.length;
  rows.forEach((r) => {
    if (r.wins < meanWins) titles[r.player.id].push("陪跑員");
  });

  return titles;
}

const TITLE_ORDER = [
  "食糊王",
  "自摸王",
  "連莊王",
  "出銃王",
  "大牌王",
  "細牌王",
  "陪跑員",
  "運氣王",
];

function buildStatsView(game) {
  const winds = Number(game.windsCompleted) || 0;
  const unlocked = winds >= 4;
  const rows = playerStatRows(game);
  const titles = assignTitles(rows, unlocked);
  const ranked = rows.slice().sort((a, b) => b.hu - a.hu || b.zimo - a.zimo || b.wins - a.wins);
  const crown = {
    hu: unlocked ? new Set(maxIds(rows, "hu")) : new Set(),
    zimo: unlocked ? new Set(maxIds(rows, "zimo")) : new Set(),
    chong: unlocked ? new Set(maxIds(rows, "chong")) : new Set(),
    specialDi: unlocked && rows.some((r) => r.specialDi !== 0)
      ? new Set(maxIds(rows, "specialDi", -Infinity))
      : new Set(),
  };
  return { winds, unlocked, ranked, titles, crown };
}

const Stats = {
  emptyPlayerStat,
  ensurePlayerStat,
  recordLian,
  recordWindProgress,
  recordSpecialStats,
  recomputeSpecialDi,
  recordWinStats,
  formatStatDi,
  buildStatsView,
  TITLE_ORDER,
};

if (typeof window !== "undefined") window.Stats = Stats;
if (typeof module !== "undefined" && module.exports) module.exports = Stats;

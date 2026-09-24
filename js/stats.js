const KIND_RATE_DEFS = [
  { kind: "追三/四", label: "被追三/四率" },
  { kind: "123順子", label: "骰123率" },
  { kind: "暗槓", label: "暗槓率" },
  { kind: "花草", label: "花草率" },
  { kind: "圍骰", label: "圍骰率" },
];

function emptyKinds() {
  const o = {};
  KIND_RATE_DEFS.forEach((d) => {
    o[d.kind] = 0;
  });
  return o;
}

function emptyPlayerStat() {
  return {
    hu: 0,
    zimo: 0,
    chong: 0,
    fanSum: 0,
    fanHands: 0,
    specialDi: 0,
    maxLian: 0,
    handsPlayed: 0,
    kinds: emptyKinds(),
  };
}

function ensurePlayerStat(game, id) {
  if (!id) return emptyPlayerStat();
  if (!game.playerStats) game.playerStats = {};
  if (!game.playerStats[id]) game.playerStats[id] = emptyPlayerStat();
  const st = game.playerStats[id];
  if (!st.kinds) st.kinds = emptyKinds();
  if (st.handsPlayed == null) st.handsPlayed = 0;
  KIND_RATE_DEFS.forEach((d) => {
    if (st.kinds[d.kind] == null) st.kinds[d.kind] = 0;
  });
  return st;
}

function seatedIdsFrom(game, row) {
  const raw = row && Array.isArray(row.seats) ? row.seats : game.seats;
  return [...new Set((raw || []).filter(Boolean))];
}

function recordSeatedHands(game, seats) {
  seatedIdsFrom(game, { seats: seats || game.seats }).forEach((id) => {
    ensurePlayerStat(game, id).handsPlayed += 1;
  });
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

function specialSubjectId(row) {
  if (!row) return null;
  if (row.subjectId) return row.subjectId;
  const pays = row.payments || [];
  const winners = [
    ...new Set(pays.map((p) => p.winnerId || row.winnerId).filter(Boolean)),
  ];
  const losers = [...new Set(pays.map((p) => p.loserId).filter(Boolean))];
  if (row.receive === true) return winners[0] || row.winnerId || null;
  if (row.receive === false) return losers[0] || null;
  if (row.kind === "追三/四" || row.kind === "123順子") return losers[0] || null;
  if (row.kind === "圍骰" || row.kind === "暗槓" || row.kind === "花草") {
    return winners[0] || row.winnerId || null;
  }
  if (losers.length === 1 && winners.length !== 1) return losers[0];
  if (winners.length === 1) return winners[0];
  return row.winnerId || null;
}

function bumpKind(game, id, kind) {
  if (!id || !kind || kind === "其他") return;
  const st = ensurePlayerStat(game, id);
  st.kinds[kind] = (st.kinds[kind] || 0) + 1;
}

function recordSpecialStats(game, result) {
  const seated = new Set(seatedIdsFrom(game));
  const di = Number(result.di) || 0;
  (result.payments || []).forEach((p) => {
    if (seated.has(p.winnerId)) addSpecialDi(game, p.winnerId, di);
    if (seated.has(p.loserId)) addSpecialDi(game, p.loserId, -di);
  });
  if (seated.has(result.subjectId)) bumpKind(game, result.subjectId, result.kind);
}

function recomputeSpecialDi(game) {
  Object.keys(game.playerStats || {}).forEach((id) => {
    const st = ensurePlayerStat(game, id);
    st.specialDi = 0;
    st.kinds = emptyKinds();
    st.handsPlayed = 0;
  });
  const rows = (game.log || []).slice().reverse();
  rows.forEach((row) => {
    const seated = new Set(seatedIdsFrom(game, row));
    if (row.type === "win" || row.type === "draw") {
      seated.forEach((id) => {
        ensurePlayerStat(game, id).handsPlayed += 1;
      });
    }
    if (row.type !== "special") return;
    const di = Number(row.di != null ? row.di : row.faceFan) || 0;
    (row.payments || []).forEach((p) => {
      const winner = p.winnerId || row.winnerId;
      const loser = p.loserId;
      if (!row.seats || seated.has(winner)) addSpecialDi(game, winner, di);
      if (!row.seats || seated.has(loser)) addSpecialDi(game, loser, -di);
    });
    const subject = specialSubjectId(row);
    if (subject && (!row.seats || seated.has(subject))) bumpKind(game, subject, row.kind);
  });
}

function recordWinStats(game, result) {
  recordSeatedHands(game, game.seats);
  const seated = new Set(seatedIdsFrom(game));
  const winnerIds = [...new Set((result.payments || []).map((p) => p.winnerId))];
  const seenFan = new Set();
  (result.payments || []).forEach((p) => {
    if (!seated.has(p.winnerId) || seenFan.has(p.winnerId)) return;
    seenFan.add(p.winnerId);
    const st = ensurePlayerStat(game, p.winnerId);
    const face = Number(p.breakdown && p.breakdown.faceFan) || 0;
    st.fanSum += face;
    st.fanHands += 1;
  });
  winnerIds.forEach((id) => {
    if (!seated.has(id)) return;
    const st = ensurePlayerStat(game, id);
    if (result.isZimo) st.zimo += 1;
    else st.hu += 1;
  });
  if (!result.isZimo) {
    const discarderId = result.payments[0] && result.payments[0].loserId;
    if (discarderId && seated.has(discarderId)) ensurePlayerStat(game, discarderId).chong += 1;
  }
}

function formatStatDi(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(v);
}

function formatPct(n) {
  const v = Number(n) || 0;
  if (Math.abs(v - Math.round(v)) < 0.05) return `${Math.round(v)}%`;
  return `${v.toFixed(1)}%`;
}

function pct(n, d) {
  if (!d) return 0;
  return (Number(n) / d) * 100;
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
    const kinds = st.kinds || emptyKinds();
    const wins = st.hu + st.zimo;
    const denom = st.handsPlayed || 0;
    return {
      player: p,
      seated: seatedSet.has(p.id),
      ...st,
      kinds,
      handsPlayed: denom,
      wins,
      avgFan: st.fanHands ? st.fanSum / st.fanHands : null,
      huRate: pct(st.hu, denom),
      zimoRate: pct(st.zimo, denom),
      chongRate: pct(st.chong, denom),
      kindRates: KIND_RATE_DEFS.map((d) => ({
        kind: d.kind,
        label: d.label,
        count: kinds[d.kind] || 0,
        rate: pct(kinds[d.kind] || 0, denom),
      })),
    };
  });
}

function radarScores(row) {
  const n = Number(row.handsPlayed) || 0;
  if (!n) {
    return { attack: 0.03, defense: 0.03, power: 0.03, luck: 0.03 };
  }
  const kinds = row.kinds || {};
  const good =
    (kinds["圍骰"] || 0) + (kinds["花草"] || 0) + (kinds["暗槓"] || 0);
  const bad = (kinds["追三/四"] || 0) + (kinds["123順子"] || 0);
  const di = Number(row.specialDi) || 0;
  const luck =
    good || bad || di
      ? Math.min(1, Math.max(0, 0.35 + (good - bad) / n + di * 0.02))
      : 0.04;
  return {
    attack: Math.min(1, (row.hu + row.zimo) / n),
    defense: Math.min(1, Math.max(0, 1 - (row.chong || 0) / n)),
    power: Math.min(1, (row.avgFan || 0) / 100),
    luck,
  };
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
  recordSeatedHands,
  recordWinStats,
  formatStatDi,
  formatPct,
  radarScores,
  buildStatsView,
  TITLE_ORDER,
  KIND_RATE_DEFS,
};

if (typeof window !== "undefined") window.Stats = Stats;
if (typeof module !== "undefined" && module.exports) module.exports = Stats;

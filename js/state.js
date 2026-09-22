const STORAGE_KEY = "himu-tai-pai-v1";

function uid() {
  return "p_" + Math.random().toString(36).slice(2, 10);
}

function defaultSettings() {
  return {
    taiValue: 0.5,
    keepExact: true,
    continueDealerOnDraw: true,
  };
}

function emptyGame() {
  return {
    settings: defaultSettings(),
    players: [],
    seats: [null, null, null, null],
    dealerSeat: 0,
    consecutive: 0,
    roundWind: 0,
    roundHand: 0,
    la: [],
    laPendingCancel: [],
    lastWinnerId: null,
    lastWinnerIds: [],
    playerStats: {},
    windsCompleted: 0,
    log: [],
    started: false,
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function addDeltaMap(map, id, amount, keepExact) {
  if (!id) return;
  map[id] = Scoring.roundAmount((Number(map[id]) || 0) + (Number(amount) || 0), keepExact);
}

function pushTag(tags, id, label) {
  if (!id || !label) return;
  if (!tags[id]) tags[id] = [];
  if (!tags[id].includes(label)) tags[id].push(label);
}

function buildWinLogExtra(game, result, keepExact) {
  const deltas = {};
  (result.kicks || []).forEach((k) => {
    addDeltaMap(deltas, k.pullerId, -k.refund, keepExact);
    addDeltaMap(deltas, k.pulledId, k.refund, keepExact);
  });
  (result.payments || []).forEach((p) => {
    addDeltaMap(deltas, p.loserId, -p.delta, keepExact);
    addDeltaMap(deltas, p.winnerId, p.delta, keepExact);
  });
  const tags = {};
  const dealerId = game.seats[game.dealerSeat];
  pushTag(tags, dealerId, "莊");
  if (result.type === "special") {
    const di = Stats.formatStatDi(result.di);
    (result.payments || []).forEach((p) => {
      pushTag(tags, p.winnerId, `獎${di}底`);
      pushTag(tags, p.loserId, `罰${di}底`);
    });
  } else {
    const seen = new Set();
    (result.payments || []).forEach((p) => {
      if (!seen.has(p.winnerId)) {
        seen.add(p.winnerId);
        const face = p.breakdown ? p.breakdown.faceFan : 0;
        pushTag(tags, p.winnerId, result.isZimo ? `自摸${face}番` : `食糊${face}番`);
      }
      if (p.count > 1) pushTag(tags, p.loserId, `被拉${p.count}口`);
    });
    (result.kicks || []).forEach((k) => {
      pushTag(tags, k.pulledId, "踢半");
    });
  }
  return {
    deltas,
    tags,
    dealerId,
    roundWind: game.roundWind,
    roundHand: game.roundHand,
  };
}

const State = {
  game: emptyGame(),
  undoStack: [],

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.game = emptyGame();
        this.undoStack = [];
        return this.game;
      }
      const parsed = JSON.parse(raw);
      this.game = parsed.game || emptyGame();
      if (this.game.settings && this.game.settings.keepExact === undefined) {
        this.game.settings.keepExact = true;
      }
      if (!this.game.laPendingCancel) this.game.laPendingCancel = [];
      if (this.game.roundWind === undefined) this.game.roundWind = 0;
      if (this.game.roundHand === undefined) this.game.roundHand = 0;
      if (this.game.lastWinnerId === undefined) this.game.lastWinnerId = null;
      if (!this.game.lastWinnerIds) this.game.lastWinnerIds = [];
      if (!this.game.playerStats) this.game.playerStats = {};
      if (this.game.windsCompleted === undefined) this.game.windsCompleted = 0;
      Stats.recomputeSpecialDi(this.game);
      this.undoStack = parsed.undoStack || [];
      return this.game;
    } catch (e) {
      this.game = emptyGame();
      this.undoStack = [];
      return this.game;
    }
  },

  save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ game: this.game, undoStack: this.undoStack })
    );
  },

  hasActiveGame() {
    return !!(this.game && this.game.started);
  },

  snapshot() {
    this.undoStack.push(clone(this.game));
    if (this.undoStack.length > 30) this.undoStack.shift();
  },

  undo() {
    if (!this.undoStack.length) return false;
    this.game = this.undoStack.pop();
    this.save();
    return true;
  },

  resetToSetup(keepPlayers) {
    const players = (keepPlayers || []).map((p) => ({
      ...p,
      score: 0,
    }));
    this.game = emptyGame();
    this.game.players = players;
    this.undoStack = [];
    this.save();
  },

  addPlayer({ name, iconType, icon }) {
    const player = {
      id: uid(),
      name: (name || "").trim() || "未命名",
      iconType: iconType || "emoji",
      icon: icon || "🐶",
      score: 0,
    };
    this.game.players.push(player);
    const empty = this.game.seats.findIndex((id) => !id);
    if (empty >= 0) this.game.seats[empty] = player.id;
    this.save();
    return player;
  },

  updatePlayer(id, patch) {
    const p = this.game.players.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    this.save();
  },

  player(id) {
    return this.game.players.find((x) => x.id === id);
  },

  seatedPlayers() {
    return this.game.seats.map((id) => this.player(id));
  },

  startNewGame({ settings, seats, dealerSeat }) {
    this.game.settings = { ...defaultSettings(), ...settings };
    this.game.seats = seats.slice();
    this.game.dealerSeat = dealerSeat;
    this.game.consecutive = 0;
    this.game.roundWind = 0;
    this.game.roundHand = 0;
    this.game.lastWinnerId = null;
    this.game.lastWinnerIds = [];
    this.game.playerStats = {};
    this.game.windsCompleted = 0;
    this.game.la = [];
    this.game.laPendingCancel = [];
    this.game.log = [];
    this.game.started = true;
    this.game.players.forEach((p) => {
      p.score = 0;
    });
    this.undoStack = [];
    this.save();
  },

  applyWin(result, faceFan, note) {
    this.snapshot();
    const keepExact = this.game.settings.keepExact;
    const extra = buildWinLogExtra(this.game, result, keepExact);
    (result.kicks || []).forEach((k) => {
      const puller = this.player(k.pullerId);
      const pulled = this.player(k.pulledId);
      puller.score = Scoring.roundAmount(puller.score - k.refund, keepExact);
      pulled.score = Scoring.roundAmount(pulled.score + k.refund, keepExact);
    });
    result.payments.forEach((p) => {
      const loser = this.player(p.loserId);
      const winner = this.player(p.winnerId);
      loser.score = Scoring.roundAmount(loser.score - p.delta, keepExact);
      winner.score = Scoring.roundAmount(winner.score + p.delta, keepExact);
    });
    if (result.type === "special") {
      Stats.recordSpecialStats(this.game, result);
    } else if (!result.roundUnchanged) {
      const dealerId = this.game.seats[this.game.dealerSeat];
      Stats.recordLian(this.game, dealerId, this.game.consecutive, !!result.dealerStays);
      Stats.recordWinStats(this.game, result);
      Stats.recordWindProgress(this.game, result);
      this.game.la = result.nextLa;
      this.game.laPendingCancel = [];
      this.game.dealerSeat = result.dealerSeat;
      this.game.consecutive = result.consecutive;
      this.game.roundWind = result.roundWind;
      this.game.roundHand = result.roundHand;
      this.game.lastWinnerId =
        result.lastWinnerId !== undefined ? result.lastWinnerId : result.winnerId;
      this.game.lastWinnerIds = result.lastWinnerIds || (result.winnerId ? [result.winnerId] : []);
    }
    this.game.log.unshift({
      id: uid(),
      type: result.type === "special" ? "special" : "win",
      text: note,
      faceFan,
      winnerId: result.winnerId,
      payments: result.payments.map((p) => ({
        loserId: p.loserId,
        winnerId: p.winnerId,
        paid: p.paid,
        delta: p.delta,
        count: p.count,
        totalFan: p.breakdown && p.breakdown.totalFan,
        faceFan: p.breakdown && p.breakdown.faceFan,
      })),
      di: result.type === "special" ? result.di : undefined,
      ...extra,
    });
    this.save();
    if (result.type === "special") return [];
    return result.payments.filter((p) => p.askSurrender);
  },

  applyDraw(result) {
    this.snapshot();
    const wind = this.game.roundWind;
    const hand = this.game.roundHand;
    const from = Scoring.roundLabel(wind, hand);
    const dealerId = this.game.seats[this.game.dealerSeat];
    const stays = this.game.settings.continueDealerOnDraw;
    const tags = {};
    pushTag(tags, dealerId, "莊");
    pushTag(tags, dealerId, "流局");
    Stats.recordLian(this.game, dealerId, this.game.consecutive, !!stays);
    Stats.recordWindProgress(this.game, result);
    this.game.laPendingCancel = [];
    this.game.dealerSeat = result.dealerSeat;
    this.game.consecutive = result.consecutive;
    this.game.roundWind = result.roundWind;
    this.game.roundHand = result.roundHand;
    this.game.log.unshift({
      id: uid(),
      type: "draw",
      text: result.consecutive
        ? `${from}流局，連莊 ${this.game.consecutive}`
        : `${from}流局，過莊`,
      deltas: {},
      tags,
      dealerId,
      roundWind: wind,
      roundHand: hand,
    });
    this.save();
  },

  surrender(winnerId, loserId) {
    const row = (this.game.la || []).find(
      (r) => r.winnerId === winnerId && r.loserId === loserId
    );
    if (!row) return;
    this.game.la = this.game.la.filter(
      (r) => !(r.winnerId === winnerId && r.loserId === loserId)
    );
    const winner = this.player(winnerId);
    const loser = this.player(loserId);
    const log = {
      id: uid(),
      type: "surrender",
      text: `${loser?.name || "玩家"} 向 ${winner?.name || "贏家"} 投降，拉數重置`,
    };
    this.game.log.unshift(log);
    if (!this.game.laPendingCancel) this.game.laPendingCancel = [];
    this.game.laPendingCancel.push({
      winnerId: row.winnerId,
      loserId: row.loserId,
      count: row.count,
      lastPaid: row.lastPaid,
      skipUntil: row.skipUntil || 0,
      logId: log.id,
    });
    this.save();
  },

  cancelSurrender(winnerId, loserId) {
    const pending = this.game.laPendingCancel || [];
    const i = pending.findIndex(
      (r) => r.winnerId === winnerId && r.loserId === loserId
    );
    if (i < 0) return;
    const row = pending.splice(i, 1)[0];
    this.game.laPendingCancel = pending;
    this.game.la.push({
      winnerId: row.winnerId,
      loserId: row.loserId,
      count: row.count,
      lastPaid: row.lastPaid,
      skipUntil: row.skipUntil || 0,
    });
    this.game.log = (this.game.log || []).filter((l) => l.id !== row.logId);
    this.save();
  },

  skipDeclinedSurrenders() {
    let changed = false;
    (this.game.la || []).forEach((row) => {
      if (Scoring.canSurrender(row)) {
        row.skipUntil = row.count + 3;
        changed = true;
      }
    });
    if (changed) this.save();
  },

  setSeat(seat, playerId) {
    const id = playerId || null;
    const seats = this.game.seats;
    if (!id) {
      seats[seat] = null;
      this.save();
      return;
    }
    const from = seats.indexOf(id);
    const displaced = seats[seat];
    if (from >= 0 && from !== seat) {
      seats[from] = displaced || null;
    }
    seats[seat] = id;
    this.save();
  },
};

if (typeof window !== "undefined") {
  window.State = State;
  window.defaultSettings = defaultSettings;
}
if (typeof module !== "undefined" && module.exports) module.exports = State;

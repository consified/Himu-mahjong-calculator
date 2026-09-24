const WIND = ["東", "南", "西", "北"];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

const ui = {
  winMode: "zimo",
  winnerSeat: null,
  discarderSeat: null,
  extraWinnerSeats: [],
  multiRon: false,
  faceFans: {},
  specialReceive: false,
  specialKind: "追三/四",
  specialPerDoor: true,
  specialTargets: [],
  specialDi: 1,
  surrenderQueue: [],
  pendingDealerSeat: null,
  logView: "full",
  logDesc: true,
  statPlayerId: null,
  resultPage: 0,
  screen: "screen-home",
};

const SPECIAL_KINDS = {
  recv: ["圍骰", "暗槓", "花草", "其他"],
  pay: ["追三/四", "123順子", "其他"],
};

function specialKindList() {
  return ui.specialReceive ? SPECIAL_KINDS.recv : SPECIAL_KINDS.pay;
}

function ensureSpecialKind() {
  const list = specialKindList();
  if (!list.includes(ui.specialKind)) ui.specialKind = list[0];
}

function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  ui.screen = id;
  document.documentElement.dataset.screen = id;
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  const target = $(id);
  if (target) target.classList.add("active");
  const inPlay = id === "screen-table" || id === "screen-log" || id === "screen-stats";
  $("tab-bar").classList.toggle("visible", inPlay);
  $("screen-table").classList.toggle("with-tabs", inPlay);
  $("screen-log").classList.toggle("with-tabs", inPlay);
  $("screen-stats").classList.toggle("with-tabs", inPlay);
  $("tab-table").classList.toggle("active", id === "screen-table");
  $("tab-log").classList.toggle("active", id === "screen-log");
  $("tab-stats").classList.toggle("active", id === "screen-stats");
  const header = $("app-header");
  if (header) header.classList.toggle("hidden", id === "screen-home");
  if (id === "screen-home") window.scrollTo(0, 0);
}

function goHome(ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  document.querySelectorAll(".modal.active").forEach((el) => el.classList.remove("active"));
  showScreen("screen-home");
}

document.addEventListener(
  "click",
  function (ev) {
    const hit = ev.target.closest("#btn-back-home");
    if (!hit) return;
    ev.preventDefault();
    ev.stopPropagation();
    try {
      goHome();
    } catch (err) {
      window.location.href = "./?home=1";
    }
  },
  true
);

function openModal(id) {
  $(id).classList.add("active");
}

function closeModal(id) {
  $(id).classList.remove("active");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const max = 96;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        h = (h * max) / w;
        w = max;
      } else {
        w = (w * max) / h;
        h = max;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function avatarHtml(player) {
  if (!player) return `<span class="avatar">?</span>`;
  if (player.iconType === "photo" && player.icon) {
    return `<span class="avatar"><img alt="" src="${player.icon}" /></span>`;
  }
  return `<span class="avatar">${player.icon || "🐶"}</span>`;
}

function formatMoney(n) {
  const v = Number(n) || 0;
  const s = Object.is(v, -0) ? 0 : v;
  return (Math.round(s * 100) / 100).toFixed(2);
}

function renderSetupPlayers() {
  const box = $("setup-players");
  box.innerHTML = State.game.players
    .map(
      (p) => `<div class="player-edit">${avatarHtml(p)}<div>${esc(p.name)}</div></div>`
    )
    .join("");
}

function renderSetupSeats() {
  const box = $("setup-seats");
  const { seats, dealerSeat, players } = State.game;
  box.innerHTML = [0, 1, 2, 3]
    .map((seat) => {
      const options = players
        .map(
          (p) =>
            `<option value="${p.id}" ${seats[seat] === p.id ? "selected" : ""}>${esc(p.name)}</option>`
        )
        .join("");
      return `<label class="field">${WIND[seat]}
        <select data-setup-seat="${seat}">
          <option value="">— 未入座 —</option>
          ${options}
        </select>
      </label>`;
    })
    .join("");

  box.querySelectorAll("[data-setup-seat]").forEach((sel) => {
    sel.onchange = () => {
      State.setSeat(Number(sel.dataset.setupSeat), sel.value || null);
      renderSetupSeats();
    };
  });

  const dealerSel = $("setup-dealer");
  const seated = [0, 1, 2, 3]
    .map((seat) => ({ seat, player: State.player(seats[seat]) }))
    .filter((x) => x.player);
  if (!seated.length) {
    dealerSel.innerHTML = `<option value="">— 先入座 —</option>`;
    dealerSel.disabled = true;
  } else {
    dealerSel.disabled = false;
    const current = seated.some((x) => x.seat === dealerSeat)
      ? dealerSeat
      : seated[0].seat;
    if (current !== dealerSeat) {
      State.game.dealerSeat = current;
      State.save();
    }
    dealerSel.innerHTML = seated
      .map(
        (x) =>
          `<option value="${x.seat}" ${x.seat === State.game.dealerSeat ? "selected" : ""}>${esc(
            x.player.name
          )}（${WIND[x.seat]}）</option>`
      )
      .join("");
  }
  dealerSel.onchange = () => {
    if (dealerSel.value === "") return;
    State.game.dealerSeat = Number(dealerSel.value);
    State.save();
  };
}

function updateBaseHint() {
  const tai = Number($("setup-tai").value) || 0;
  $("setup-base-hint").textContent = `底金 = 5 底番 × 台價 = ${formatMoney(5 * tai)}`;
}

function laText(playerId) {
  const rows = State.game.la.filter((r) => r.loserId === playerId);
  if (!rows.length) return "";
  return rows
    .map((r) => {
      const w = State.player(r.winnerId);
      return `被${esc(w?.name || "?")}拉${r.count}口`;
    })
    .join("<br>");
}

function renderTable() {
  const g = State.game;
  const n = g.consecutive;
  $("round-label").textContent = Scoring.roundLabel(g.roundWind, g.roundHand);
  [0, 1, 2, 3].forEach((seat) => {
    const el = $("seat-" + seat);
    const p = State.player(g.seats[seat]);
    const isDealer = g.dealerSeat === seat;
    el.classList.toggle("dealer", isDealer);
    el.innerHTML = `<div class="seat-head">${avatarHtml(p)}${
      isDealer
        ? `<span class="label">莊</span>${n ? `<span class="label">連${n}</span>` : ""}`
        : ""
    }</div>
      <div class="name">${p ? esc(p.name) : "空位"}</div>
      <div class="score">${p ? formatMoney(p.score) : "-"}</div>
      <div class="meta">${p ? laText(p.id) : ""}</div>`;
  });
  renderLog();
  $("btn-undo").disabled = !State.undoStack.length;
}

function formatLogNum(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (Object.is(v, -0)) return "0";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(v);
}

function logNumClass(n) {
  const v = Number(n) || 0;
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "zero";
}

function eventDeltas(row) {
  if (row.deltas && Object.keys(row.deltas).length) return row.deltas;
  const d = {};
  (row.payments || []).forEach((p) => {
    const amt = p.delta != null ? p.delta : p.paid;
    d[p.winnerId] = (Number(d[p.winnerId]) || 0) + (Number(amt) || 0);
    d[p.loserId] = (Number(d[p.loserId]) || 0) - (Number(amt) || 0);
  });
  return d;
}

function eventTags(row, id) {
  if (row.tags && row.tags[id]) return row.tags[id];
  const out = [];
  if (row.dealerId === id) out.push("莊");
  if (row.type === "draw" && row.dealerId === id) out.push("流局");
  if (row.type === "special") {
    const di = Stats.formatStatDi(row.di != null ? row.di : row.faceFan);
    const kind = row.kind ? `${row.kind} ` : "";
    const isWin = (row.payments || []).some((p) => p.winnerId === id);
    const isLose = (row.payments || []).some((p) => p.loserId === id);
    if (isWin) out.push(`${kind}獎${di}底`);
    if (isLose) out.push(`${kind}罰${di}底`);
  }
  if (row.type === "win") {
    const won = (row.payments || []).some((p) => p.winnerId === id);
    if (won) {
      const p = (row.payments || []).find((x) => x.winnerId === id);
      const face = p && p.faceFan != null ? p.faceFan : row.faceFan;
      const zimo = row.isZimo || (row.text && row.text.indexOf("自摸") >= 0);
      out.push(zimo ? `自摸${face || 0}番` : `食糊${face || 0}番`);
    }
  }
  if (row.type === "surrender" && row.text && row.text.indexOf(State.player(id)?.name || "___") >= 0) {
    out.push("投降");
  }
  return out;
}

function tagClass(label) {
  if (label === "莊") return "tag-dealer";
  if (label.indexOf("獎") === 0 || label.indexOf("自摸") === 0 || label.indexOf("食糊") === 0) return "tag-good";
  if (label.indexOf("罰") === 0 || label.indexOf("被拉") === 0 || label === "流局") return "tag-bad";
  return "";
}

function renderLog() {
  const g = State.game;
  const board = $("log-board");
  if (!board) return;
  const seats = [0, 1, 2, 3].map((seat) => ({
    seat,
    player: State.player(g.seats[seat]),
  }));
  const showScore = ui.logView !== "event";
  const showTags = ui.logView !== "score";
  let rows = (g.log || []).filter((r) => r.type !== "surrender");
  if (!ui.logDesc) rows = rows.slice().reverse();

  const head = `<div class="log-rail"></div>${seats
    .map((s) => {
      const p = s.player;
      if (!p) {
        return `<div class="log-col-head"><div class="log-head-name">空</div></div>`;
      }
      const sc = p.score;
      return `<div class="log-col-head">
        ${avatarHtml(p)}
        <div class="log-head-name">${esc(p.name)}</div>
        <div class="log-head-score ${logNumClass(sc)}">${formatLogNum(sc)}</div>
      </div>`;
    })
    .join("")}`;

  if (!rows.length) {
    board.innerHTML = `<div class="log-grid log-head">${head}</div><p class="hint" style="padding:12px">尚未有紀錄</p>`;
    return;
  }

  const body = rows
    .map((row, idx) => {
      const prev = rows[idx - 1];
      const wind = row.roundWind != null ? row.roundWind : 0;
      const hand = row.roundHand != null ? row.roundHand : 0;
      const showRail =
        !prev || prev.roundWind !== row.roundWind || prev.roundHand !== row.roundHand;
      const rail = showRail
        ? `<div class="log-rail"><span class="log-rail-dot"></span><span class="log-rail-wind">${WIND[wind] || "東"}</span><span class="log-rail-meta">${WIND[wind] || "東"}圈${hand + 1}</span></div>`
        : `<div class="log-rail"><span class="log-rail-line"></span></div>`;
      const lid = row.id || "row" + idx;
      const deltas = eventDeltas(row);
      const cells = seats
        .map((s) => {
          const id = s.player && s.player.id;
          const delta = id ? Number(deltas[id]) || 0 : 0;
          const tags = id && showTags ? eventTags(row, id) : [];
          const tagHtml = tags
            .map((t) => `<span class="log-tag ${tagClass(t)}">${esc(t)}</span>`)
            .join("");
          return `<div class="log-cell">
            ${showScore ? `<div class="log-delta ${logNumClass(delta)}">${formatLogNum(delta)}</div>` : ""}
            ${tagHtml ? `<div class="log-tags">${tagHtml}</div>` : ""}
          </div>`;
        })
        .join("");
      return `<button type="button" class="log-row" data-log-id="${esc(lid)}">${rail}${cells}</button>
        <div class="log-detail" id="log-detail-${esc(lid)}" hidden><div class="log-detail-text">${esc(
        row.text || ""
      )}</div></div>`;
    })
    .join("");

  board.innerHTML = `<div class="log-grid log-head">${head}</div><div class="log-stream">${body}</div>`;
  board.querySelectorAll(".log-row").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.logId;
      const box = $("log-detail-" + id);
      if (box) box.hidden = !box.hidden;
      btn.classList.toggle("open", box && !box.hidden);
    };
  });
}

function statTitlePills(view, row) {
  const id = row.player.id;
  const bench = row.seated ? "" : `<span class="stat-pill">未上桌</span>`;
  const pills = (view.titles[id] || [])
    .slice()
    .sort((a, b) => Stats.TITLE_ORDER.indexOf(a) - Stats.TITLE_ORDER.indexOf(b))
    .map((t) => `<span class="stat-pill">${esc(t)}</span>`)
    .join("");
  return `${bench}${pills}`;
}

function statCrown(view, id, key) {
  return view.crown[key] && view.crown[key].has(id)
    ? `<span class="stat-crown">👑</span>`
    : "";
}

function radarSvg(row, ranked) {
  const s = Stats.radarScores(row, ranked);
  const cx = 100;
  const cy = 96;
  const r = 58;
  const axes = [
    { key: "attack", label: "進攻", x: 0, y: -1 },
    { key: "defense", label: "防守", x: 1, y: 0 },
    { key: "power", label: "牌力", x: 0, y: 1 },
    { key: "luck", label: "運氣", x: -1, y: 0 },
  ];
  const diamond = (scale) =>
    axes
      .map((a) => `${cx + a.x * r * scale},${cy + a.y * r * scale}`)
      .join(" ");
  const valuePts = axes
    .map((a) => `${cx + a.x * r * s[a.key]},${cy + a.y * r * s[a.key]}`)
    .join(" ");
  const labels = axes
    .map((a) => {
      const lx = cx + a.x * (r + 20);
      const ly = cy + a.y * (r + 18) + 4;
      return `<text x="${lx}" y="${ly}" text-anchor="middle">${a.label}</text>`;
    })
    .join("");
  return `<svg class="stat-radar" viewBox="0 0 200 196" aria-hidden="true">
      <polygon points="${diamond(1)}" class="radar-grid" />
      <polygon points="${diamond(0.66)}" class="radar-grid" />
      <polygon points="${diamond(0.33)}" class="radar-grid" />
      <line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" class="radar-axis" />
      <line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" class="radar-axis" />
      <polygon points="${valuePts}" class="radar-fill" />
      ${labels}
    </svg>`;
}

function renderStats() {
  const view = Stats.buildStatsView(State.game);
  $("stats-hint").textContent = view.unlocked
    ? `已完成 ${view.winds} 圈。點玩家睇詳細比率。頭銜按目前食糊／自摸／出銃／連莊／賞罰統計。`
    : `已完成 ${view.winds}／4 圈。點玩家睇詳細比率。打完東南西北一個全圈之後先會賦予頭銜。`;
  if (!view.ranked.length) {
    $("stats-list").innerHTML = `<div class="card"><p class="hint">尚未有玩家。</p></div>`;
    return;
  }
  $("stats-list").innerHTML = view.ranked
    .map((row) => {
      const id = row.player.id;
      const crown = (key) => statCrown(view, id, key);
      return `<button type="button" class="stat-card" data-player-id="${esc(id)}">
        <div class="stat-head">
          ${avatarHtml(row.player)}
          <div class="stat-name">${esc(row.player.name)}</div>
          <div class="stat-titles">${statTitlePills(view, row)}</div>
        </div>
        <div class="stat-grid">
          <div class="stat-cell"><div class="num">${row.hu}${crown("hu")}</div><div class="lbl">食糊</div></div>
          <div class="stat-cell"><div class="num">${row.zimo}${crown("zimo")}</div><div class="lbl">自摸</div></div>
          <div class="stat-cell"><div class="num">${row.chong}${crown("chong")}</div><div class="lbl">出銃</div></div>
          <div class="stat-cell"><div class="num">${Stats.formatStatDi(row.specialDi)}${crown("specialDi")}</div><div class="lbl">特別賞罰</div></div>
        </div>
      </button>`;
    })
    .join("");
  $("stats-list").querySelectorAll("[data-player-id]").forEach((btn) => {
    btn.onclick = () => openStatDetail(btn.dataset.playerId);
  });
}

function openStatDetail(playerId) {
  ui.statPlayerId = playerId;
  renderStatDetail();
  openModal("modal-stat");
}

function renderStatDetail() {
  const view = Stats.buildStatsView(State.game);
  const box = $("stat-detail");
  if (!box) return;
  const row =
    view.ranked.find((r) => r.player.id === ui.statPlayerId) || view.ranked[0];
  if (!row) {
    box.innerHTML = `<p class="hint">尚未有玩家。</p>`;
    return;
  }
  ui.statPlayerId = row.player.id;
  const id = row.player.id;
  const crown = (key) => statCrown(view, id, key);
  const avg = row.avgFan == null ? "-" : Stats.formatStatDi(row.avgFan);
  const score = Number(row.player.score) || 0;
  const scoreCls = score > 0 ? "pos" : score < 0 ? "neg" : "";
  const extra = (row.kindRates || [])
    .map(
      (k) =>
        `<div class="stat-cell"><div class="num">${Stats.formatPct(k.rate)}</div><div class="lbl">${esc(
          k.label
        )}</div></div>`
    )
    .join("");
  const dock = view.ranked
    .map((r) => {
      const on = r.player.id === id ? "on" : "";
      return `<button type="button" class="stat-dock-item ${on}" data-player-id="${esc(
        r.player.id
      )}">${avatarHtml(r.player)}<span>${esc(r.player.name)}</span></button>`;
    })
    .join("");
  box.innerHTML = `
    <div class="stat-detail-card">
      <div class="stat-detail-head">
        ${avatarHtml(row.player)}
        <div class="stat-name">${esc(row.player.name)}</div>
        <div class="stat-detail-score ${scoreCls}">${formatMoney(score)}</div>
      </div>
      <div class="stat-titles stat-detail-titles">${statTitlePills(view, row)}</div>
      <div class="stat-grid">
        <div class="stat-cell"><div class="num">${row.hu}${crown("hu")}</div><div class="lbl">食糊</div></div>
        <div class="stat-cell"><div class="num">${row.zimo}${crown("zimo")}</div><div class="lbl">自摸</div></div>
        <div class="stat-cell"><div class="num">${row.chong}${crown("chong")}</div><div class="lbl">出銃</div></div>
        <div class="stat-cell"><div class="num">${Stats.formatStatDi(row.specialDi)}${crown("specialDi")}</div><div class="lbl">特別賞罰</div></div>
      </div>
      <div class="stat-grid">
        <div class="stat-cell"><div class="num">${avg}</div><div class="lbl">平均番數</div></div>
        <div class="stat-cell"><div class="num">${Stats.formatPct(row.huRate)}</div><div class="lbl">食糊率</div></div>
        <div class="stat-cell"><div class="num">${Stats.formatPct(row.zimoRate)}</div><div class="lbl">自摸率</div></div>
        <div class="stat-cell"><div class="num">${Stats.formatPct(row.chongRate)}</div><div class="lbl">出銃率</div></div>
      </div>
      <div class="stat-grid stat-grid-extra">${extra}</div>
      ${radarSvg(row, view.ranked)}
      <div class="stat-brand">🦊 Himu Sex Boys Club 港式台牌</div>
      <div class="stat-dock-row">
        <div class="stat-dock">${dock}</div>
        <button type="button" class="stat-share-fab" id="stat-share" aria-label="分享賽果">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v11" />
            <path d="M8.2 7.8 12 4l3.8 3.8" />
            <path d="M6 12.5v6.2A1.8 1.8 0 0 0 7.8 20.5h8.4a1.8 1.8 0 0 0 1.8-1.8v-6.2" />
          </svg>
        </button>
      </div>
      <button class="btn" id="stat-detail-close" type="button">關閉</button>
    </div>`;
  box.querySelectorAll(".stat-dock-item").forEach((btn) => {
    btn.onclick = () => {
      ui.statPlayerId = btn.dataset.playerId;
      renderStatDetail();
    };
  });
  const closeBtn = $("stat-detail-close");
  if (closeBtn) closeBtn.onclick = () => closeModal("modal-stat");
  const shareBtn = $("stat-share");
  if (shareBtn) shareBtn.onclick = () => shareStatCard(row, view);
}

function shareFont() {
  return `system-ui, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function loadAvatarImage(player) {
  return new Promise((resolve) => {
    if (!player || player.iconType !== "photo" || !player.icon) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = player.icon;
  });
}

function drawAvatarOnCanvas(ctx, player, img, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#e8dfd0";
  ctx.fill();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = "#2c2518";
    ctx.font = `${Math.round(size * 0.52)}px ${shareFont()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(player?.icon || "🐶", x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.strokeStyle = "#c4a574";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawStatGrid(ctx, items, y, x0, width, cols, numSize) {
  const colW = width / cols;
  items.forEach((it, i) => {
    const cx = x0 + (i % cols) * colW + colW / 2;
    const cy = y + Math.floor(i / cols) * 78;
    ctx.fillStyle = "#2c2518";
    ctx.font = `800 ${numSize}px ${shareFont()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(it.num + (it.crown ? " 👑" : ""), cx, cy);
    ctx.fillStyle = "#8a7c68";
    ctx.font = `700 18px ${shareFont()}`;
    ctx.fillText(it.lbl, cx, cy + 24);
  });
  return y + Math.ceil(items.length / cols) * 78;
}

function drawShareRadar(ctx, scores, cx, cy, r) {
  const axes = [
    { key: "attack", label: "進攻", x: 0, y: -1 },
    { key: "defense", label: "防守", x: 1, y: 0 },
    { key: "power", label: "牌力", x: 0, y: 1 },
    { key: "luck", label: "運氣", x: -1, y: 0 },
  ];
  const pts = (scale) =>
    axes.map((a) => [cx + a.x * r * scale, cy + a.y * r * scale]);
  const strokePoly = (scale, color, width) => {
    const p = pts(scale);
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    p.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  strokePoly(1, "#d7cbb8", 1.4);
  strokePoly(0.66, "#d7cbb8", 1.2);
  strokePoly(0.33, "#d7cbb8", 1.2);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.strokeStyle = "#e2d6c4";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  const fill = axes.map((a) => [
    cx + a.x * r * (scores[a.key] || 0),
    cy + a.y * r * (scores[a.key] || 0),
  ]);
  ctx.beginPath();
  ctx.moveTo(fill[0][0], fill[0][1]);
  fill.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = "rgba(212, 176, 106, 0.42)";
  ctx.fill();
  ctx.strokeStyle = "#b8924a";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#8a7c68";
  ctx.font = `700 18px ${shareFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  axes.forEach((a) => {
    ctx.fillText(a.label, cx + a.x * (r + 28), cy + a.y * (r + 26));
  });
}

async function renderStatShareJpeg(row, view) {
  const player = row.player;
  const avatarImg = await loadAvatarImage(player);
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {
      /* ignore */
    }
  }
  const W = 720;
  const pad = 36;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = 1280 * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f7f1e6";
  roundRectPath(ctx, 0, 0, W, 1280, 36);
  ctx.fill();

  let y = 32;
  drawAvatarOnCanvas(ctx, player, avatarImg, pad, y, 64);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2c2518";
  ctx.font = `800 28px ${shareFont()}`;
  const name = String(player.name || "");
  ctx.fillText(name, pad + 78, y + 32);
  const score = Number(player.score) || 0;
  ctx.textAlign = "right";
  ctx.font = `800 34px ${shareFont()}`;
  ctx.fillStyle = score > 0 ? "#2e9e5b" : score < 0 ? "#c44536" : "#6d5f4a";
  ctx.fillText(formatMoney(score), W - pad, y + 32);
  y += 88;

  const titles = [];
  if (!row.seated) titles.push("未上桌");
  (view.titles[player.id] || [])
    .slice()
    .sort((a, b) => Stats.TITLE_ORDER.indexOf(a) - Stats.TITLE_ORDER.indexOf(b))
    .forEach((t) => titles.push(t));
  if (titles.length) {
    ctx.font = `700 18px ${shareFont()}`;
    let tx = pad;
    let ty = y;
    titles.forEach((t) => {
      const tw = ctx.measureText(t).width + 28;
      if (tx + tw > W - pad) {
        tx = pad;
        ty += 36;
      }
      roundRectPath(ctx, tx, ty - 20, tw, 30, 15);
      ctx.fillStyle = "#e7ddce";
      ctx.fill();
      ctx.fillStyle = "#6d5f4a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t, tx + tw / 2, ty - 5);
      tx += tw + 8;
    });
    y = ty + 28;
  }

  const id = player.id;
  const crown = (key) => !!(view.crown[key] && view.crown[key].has(id));
  const avg = row.avgFan == null ? "-" : Stats.formatStatDi(row.avgFan);
  y = drawStatGrid(
    ctx,
    [
      { num: String(row.hu), lbl: "食糊", crown: crown("hu") },
      { num: String(row.zimo), lbl: "自摸", crown: crown("zimo") },
      { num: String(row.chong), lbl: "出銃", crown: crown("chong") },
      { num: Stats.formatStatDi(row.specialDi), lbl: "特別賞罰", crown: crown("specialDi") },
    ],
    y + 28,
    pad,
    W - pad * 2,
    4,
    36
  );
  y = drawStatGrid(
    ctx,
    [
      { num: avg, lbl: "平均番數" },
      { num: Stats.formatPct(row.huRate), lbl: "食糊率" },
      { num: Stats.formatPct(row.zimoRate), lbl: "自摸率" },
      { num: Stats.formatPct(row.chongRate), lbl: "出銃率" },
    ],
    y + 8,
    pad,
    W - pad * 2,
    4,
    32
  );
  y = drawStatGrid(
    ctx,
    (row.kindRates || []).map((k) => ({
      num: Stats.formatPct(k.rate),
      lbl: k.label,
    })),
    y + 4,
    pad,
    W - pad * 2,
    3,
    28
  );

  drawShareRadar(ctx, Stats.radarScores(row), W / 2, y + 118, 88);
  y += 250;

  const brand = "Himu Sex Boys Club 港式台牌";
  ctx.font = `700 17px ${shareFont()}`;
  const brandW = ctx.measureText(brand).width;
  const foxW = 28;
  const gap = 8;
  const lockX = (W - (foxW + gap + brandW)) / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `32px ${shareFont()}`;
  ctx.fillText("🦊", lockX, y + 8);
  ctx.fillStyle = "#8a7c68";
  ctx.font = `700 17px ${shareFont()}`;
  ctx.fillText(brand, lockX + foxW + gap, y + 8);

  const usedH = Math.min(1280, y + 48);
  const out = document.createElement("canvas");
  out.width = W * scale;
  out.height = usedH * scale;
  const octx = out.getContext("2d");
  octx.fillStyle = "#f7f1e6";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0, out.width, usedH * scale, 0, 0, out.width, usedH * scale);
  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))),
      "image/jpeg",
      0.92
    );
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareJpegBlob(blob, filename) {
  const file = new File([blob], filename, { type: "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  downloadBlob(blob, filename);
}

async function shareStatCard(row, view) {
  const btn = $("stat-share");
  if (btn) btn.disabled = true;
  try {
    const blob = await renderStatShareJpeg(row, view);
    const safe = String(row.player.name || "player").replace(/[\\/:*?"<>|]/g, "_");
    await shareJpegBlob(blob, `${safe}-統計.jpg`);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    try {
      const blob = await renderStatShareJpeg(row, view);
      const safe = String(row.player.name || "player").replace(/[\\/:*?"<>|]/g, "_");
      downloadBlob(blob, `${safe}-統計.jpg`);
    } catch (e2) {
      alert("無法產生分享圖片");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function resultTitles(view, id) {
  return (view.titles[id] || [])
    .slice()
    .sort((a, b) => Stats.TITLE_ORDER.indexOf(a) - Stats.TITLE_ORDER.indexOf(b));
}

function resultTitleHtml(titles) {
  return titles
    .map((t) => `<span class="result-mini-title">🏆 ${esc(t)}</span>`)
    .join("");
}

function scoreTone(n) {
  const v = Number(n) || 0;
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "";
}

function rankPlayersByScore() {
  return (State.game.players || []).slice().sort((a, b) => {
    const d = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (d) return d;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
  });
}

function settlePayments() {
  const keepExact = State.game.settings && State.game.settings.keepExact;
  const people = (State.game.players || []).map((p) => ({
    id: p.id,
    player: p,
    remain: Number(p.score) || 0,
  }));
  const creditors = people
    .filter((p) => p.remain > 0.005)
    .sort((a, b) => b.remain - a.remain);
  const debtors = people
    .filter((p) => p.remain < -0.005)
    .sort((a, b) => a.remain - b.remain);
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const need = -debtors[i].remain;
    const give = creditors[j].remain;
    const amt = Scoring.roundAmount(Math.min(need, give), keepExact);
    if (amt > 0.005) {
      rows.push({ from: debtors[i].player, to: creditors[j].player, amount: amt });
      debtors[i].remain = Scoring.roundAmount(debtors[i].remain + amt, keepExact);
      creditors[j].remain = Scoring.roundAmount(creditors[j].remain - amt, keepExact);
    }
    if (Math.abs(debtors[i].remain) < 0.01) i += 1;
    else if (Math.abs(creditors[j].remain) < 0.01) j += 1;
    else i += 1;
  }
  return rows;
}

function resultSeatCardHtml(p, titles, pos) {
  const sc = p ? Number(p.score) || 0 : 0;
  return `<div class="result-seat-card ${pos}">
      ${avatarHtml(p)}
      <div class="nm">${esc(p?.name || "空位")}</div>
      <div class="sc ${scoreTone(sc)}">${p ? formatMoney(sc) : "-"}</div>
      ${resultTitleHtml(titles)}
    </div>`;
}

function resultBrandHtml() {
  return `<div class="result-brand">🦊 Himu Sex Boys Club 港式台牌</div>`;
}

function renderResultPages() {
  const view = Stats.buildStatsView(State.game);
  const g = State.game;
  const north = State.player(g.seats[3]);
  const east = State.player(g.seats[0]);
  const south = State.player(g.seats[1]);
  const west = State.player(g.seats[2]);
  $("result-page-0").innerHTML = `<div class="result-card">
    <div class="result-table">
      ${resultSeatCardHtml(north, resultTitles(view, north?.id), "n")}
      ${resultSeatCardHtml(west, resultTitles(view, west?.id), "w")}
      ${resultSeatCardHtml(east, resultTitles(view, east?.id), "e")}
      ${resultSeatCardHtml(south, resultTitles(view, south?.id), "s")}
    </div>
    ${resultBrandHtml()}
  </div>`;

  const ranked = rankPlayersByScore();
  $("result-page-1").innerHTML = `<div class="result-card">${
    ranked.length
      ? ranked
          .map((p, i) => {
            const titles = resultTitles(view, p.id);
            return `<div class="result-rank-row">
              <div class="result-rank-n">${i === 0 ? "👑" : `${i + 1}位`}</div>
              ${avatarHtml(p)}
              <div class="result-rank-main">
                <div class="result-rank-name">${esc(p.name)}</div>
                ${resultTitleHtml(titles)}
              </div>
              <div class="result-rank-score ${scoreTone(p.score)}">${formatMoney(p.score)}</div>
            </div>`;
          })
          .join("") + resultBrandHtml()
      : `<p class="result-empty">尚未有玩家。</p>`
  }</div>`;

  const statsRows = view.ranked;
  $("result-page-2").innerHTML = `<div class="result-card">${
    statsRows.length
      ? statsRows
          .map((row) => {
            const id = row.player.id;
            const pills = resultTitles(view, id)
              .map((t) => `<span class="stat-pill">${esc(t)}</span>`)
              .join("");
            const crown = (key) =>
              view.crown[key] && view.crown[key].has(id)
                ? `<span class="stat-crown">👑</span>`
                : "";
            return `<div class="result-stat-block">
              <div class="result-stat-top">
                ${avatarHtml(row.player)}
                <div class="result-stat-name">${esc(row.player.name)}</div>
                <div class="result-stat-titles">${pills}</div>
              </div>
              <div class="stat-grid">
                <div class="stat-cell"><div class="num">${row.hu}${crown("hu")}</div><div class="lbl">食糊</div></div>
                <div class="stat-cell"><div class="num">${row.zimo}${crown("zimo")}</div><div class="lbl">自摸</div></div>
                <div class="stat-cell"><div class="num">${row.chong}${crown("chong")}</div><div class="lbl">出銃</div></div>
                <div class="stat-cell"><div class="num">${Stats.formatStatDi(row.specialDi)}${crown(
              "specialDi"
            )}</div><div class="lbl">特別賞罰</div></div>
              </div>
            </div>`;
          })
          .join("") + resultBrandHtml()
      : `<p class="result-empty">尚未有統計。</p>`
  }</div>`;

  const pays = settlePayments();
  $("result-page-3").innerHTML = `<div class="result-card">${
    pays.length
      ? pays
          .map(
            (p) => `<div class="result-pay-row">
              <div>
                ${avatarHtml(p.from)}
                <div class="result-pay-name">${esc(p.from.name)}</div>
              </div>
              <div class="result-pay-arrow">→</div>
              <div>
                ${avatarHtml(p.to)}
                <div class="result-pay-name">${esc(p.to.name)}</div>
              </div>
              <div class="result-pay-amt">$${formatMoney(p.amount)}</div>
            </div>`
          )
          .join("") + resultBrandHtml()
      : `<p class="result-empty">分數打平，唔使找數。</p>${resultBrandHtml()}`
  }</div>`;

  updateResultDots();
}

function updateResultDots() {
  const box = $("result-dots");
  if (!box) return;
  box.innerHTML = [0, 1, 2, 3]
    .map(
      (i) =>
        `<button type="button" class="result-dot ${
          i === ui.resultPage ? "on" : ""
        }" data-result-page="${i}" aria-label="第${i + 1}頁"></button>`
    )
    .join("");
  box.querySelectorAll("[data-result-page]").forEach((btn) => {
    btn.onclick = () => scrollResultPage(Number(btn.dataset.resultPage));
  });
}

function scrollResultPage(i) {
  ui.resultPage = Math.max(0, Math.min(3, i));
  const scroller = $("result-scroller");
  if (scroller) scroller.scrollTo({ left: scroller.clientWidth * ui.resultPage, behavior: "smooth" });
  updateResultDots();
}

function bindResultPager() {
  const root = $("result-scroller");
  if (!root || root.dataset.pagerBound) return;
  root.dataset.pagerBound = "1";
  let x0 = 0;
  let y0 = 0;
  let axis = null;
  let tracking = false;
  let wheelAt = 0;

  root.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      tracking = true;
      axis = null;
      x0 = e.clientX;
      y0 = e.clientY;
    },
    { passive: true }
  );
  root.addEventListener(
    "pointermove",
    (e) => {
      if (!tracking || axis) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    },
    { passive: true }
  );
  const finish = (e) => {
    if (!tracking) return;
    tracking = false;
    if (axis !== "x") return;
    const dx = e.clientX - x0;
    if (dx <= -40) scrollResultPage(ui.resultPage + 1);
    else if (dx >= 40) scrollResultPage(ui.resultPage - 1);
  };
  root.addEventListener("pointerup", finish, { passive: true });
  root.addEventListener(
    "pointercancel",
    () => {
      tracking = false;
    },
    { passive: true }
  );
  root.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = Date.now();
      if (now - wheelAt < 420) return;
      wheelAt = now;
      if (e.deltaX > 10) scrollResultPage(ui.resultPage + 1);
      else if (e.deltaX < -10) scrollResultPage(ui.resultPage - 1);
    },
    { passive: false }
  );
}

function openResultModal() {
  ui.resultPage = 0;
  renderResultPages();
  openModal("modal-result");
  const scroller = $("result-scroller");
  if (scroller) scroller.scrollLeft = 0;
  document.querySelectorAll(".result-page").forEach((el) => {
    el.scrollTop = 0;
  });
  updateResultDots();
}

function drawBrandFooter(ctx, W, y) {
  const brand = "Himu Sex Boys Club 港式台牌";
  ctx.font = `700 16px ${shareFont()}`;
  const brandW = ctx.measureText(brand).width;
  const foxW = 26;
  const total = foxW + 8 + brandW;
  const x = W - 36 - total;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `28px ${shareFont()}`;
  ctx.fillText("🦊", x, y);
  ctx.fillStyle = "#b09a7a";
  ctx.font = `700 16px ${shareFont()}`;
  ctx.fillText(brand, x + foxW + 8, y);
}

function cropCanvasJpeg(canvas, scale, usedH) {
  const W = canvas.width / scale;
  const h = Math.min(canvas.height / scale, Math.max(usedH, 360));
  const out = document.createElement("canvas");
  out.width = W * scale;
  out.height = h * scale;
  const octx = out.getContext("2d");
  octx.fillStyle = "#f7f1e6";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0, out.width, h * scale, 0, 0, out.width, h * scale);
  return new Promise((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/jpeg", 0.92);
  });
}

async function renderResultShareJpeg(page) {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {
      /* ignore */
    }
  }
  const view = Stats.buildStatsView(State.game);
  const W = 720;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = 1600 * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f7f1e6";
  roundRectPath(ctx, 0, 0, W, 1600, 28);
  ctx.fill();

  const avatars = {};
  const need = new Set();
  (State.game.players || []).forEach((p) => need.add(p.id));
  await Promise.all(
    [...need].map(async (id) => {
      avatars[id] = await loadAvatarImage(State.player(id));
    })
  );

  const drawP = (p, x, y, size) => {
    if (!p) return;
    drawAvatarOnCanvas(ctx, p, avatars[p.id], x, y, size);
  };

  let used = 420;
  if (page === 0) {
    const seats = [
      { p: State.player(State.game.seats[3]), x: W / 2, y: 48 },
      { p: State.player(State.game.seats[0]), x: W - 150, y: 210 },
      { p: State.player(State.game.seats[1]), x: W / 2, y: 372 },
      { p: State.player(State.game.seats[2]), x: 150, y: 210 },
    ];
    seats.forEach(({ p, x, y }) => {
      roundRectPath(ctx, x - 90, y, 180, 150, 18);
      ctx.fillStyle = "#fffdf8";
      ctx.fill();
      drawP(p, x - 28, y + 12, 56);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#2c2518";
      ctx.font = `700 20px ${shareFont()}`;
      ctx.fillText(p?.name || "空位", x, y + 74);
      const sc = p ? Number(p.score) || 0 : 0;
      ctx.fillStyle = sc > 0 ? "#2e9e5b" : sc < 0 ? "#c44536" : "#6d5f4a";
      ctx.font = `800 26px ${shareFont()}`;
      ctx.fillText(p ? formatMoney(sc) : "-", x, y + 98);
      const titles = resultTitles(view, p?.id);
      ctx.fillStyle = "#9a8048";
      ctx.font = `700 15px ${shareFont()}`;
      titles.slice(0, 2).forEach((t, i) => ctx.fillText("🏆 " + t, x, y + 126 + i * 16));
    });
    used = 560;
  } else if (page === 1) {
    let y = 28;
    rankPlayersByScore().forEach((p, i) => {
      ctx.fillStyle = "#2c2518";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `800 20px ${shareFont()}`;
      ctx.fillText(i === 0 ? "👑" : `${i + 1}位`, 28, y + 28);
      drawP(p, 88, y + 8, 48);
      ctx.fillStyle = "#2c2518";
      ctx.font = `800 24px ${shareFont()}`;
      ctx.fillText(p.name, 150, y + 22);
      ctx.fillStyle = "#9a8048";
      ctx.font = `700 15px ${shareFont()}`;
      ctx.fillText(resultTitles(view, p.id).map((t) => "🏆" + t).join("  ") || "", 150, y + 46);
      const sc = Number(p.score) || 0;
      ctx.textAlign = "right";
      ctx.fillStyle = sc > 0 ? "#2e9e5b" : sc < 0 ? "#c44536" : "#6d5f4a";
      ctx.font = `800 28px ${shareFont()}`;
      ctx.fillText(formatMoney(sc), W - 28, y + 28);
      y += 78;
    });
    used = y + 24;
  } else if (page === 2) {
    let y = 20;
    view.ranked.forEach((row) => {
      roundRectPath(ctx, 20, y, W - 40, 118, 16);
      ctx.fillStyle = "#fffdf8";
      ctx.fill();
      drawP(row.player, 32, y + 14, 36);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#2c2518";
      ctx.font = `800 22px ${shareFont()}`;
      ctx.fillText(row.player.name, 80, y + 32);
      ctx.textAlign = "right";
      ctx.fillStyle = "#6d5f4a";
      ctx.font = `700 14px ${shareFont()}`;
      ctx.fillText(resultTitles(view, row.player.id).join("  "), W - 36, y + 32);
      const cells = [
        [String(row.hu), "食糊"],
        [String(row.zimo), "自摸"],
        [String(row.chong), "出銃"],
        [Stats.formatStatDi(row.specialDi), "特別賞罰"],
      ];
      cells.forEach((c, i) => {
        const cx = 90 + i * 155;
        ctx.textAlign = "center";
        ctx.fillStyle = "#2c2518";
        ctx.font = `800 26px ${shareFont()}`;
        ctx.fillText(c[0], cx, y + 74);
        ctx.fillStyle = "#8a7c68";
        ctx.font = `700 14px ${shareFont()}`;
        ctx.fillText(c[1], cx, y + 96);
      });
      y += 130;
    });
    used = y + 8;
  } else {
    const pays = settlePayments();
    let y = 24;
    if (!pays.length) {
      ctx.fillStyle = "#8a7c68";
      ctx.textAlign = "center";
      ctx.font = `700 22px ${shareFont()}`;
      ctx.fillText("分數打平，唔使找數。", W / 2, 180);
      used = 280;
    } else {
      pays.forEach((p) => {
        drawP(p.from, 40, y, 52);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#2c2518";
        ctx.font = `700 16px ${shareFont()}`;
        ctx.fillText(p.from.name, 66, y + 56);
        ctx.font = `800 22px ${shareFont()}`;
        ctx.fillStyle = "#8a7c68";
        ctx.fillText("→", W / 2 - 40, y + 16);
        drawP(p.to, 250, y, 52);
        ctx.fillStyle = "#2c2518";
        ctx.font = `700 16px ${shareFont()}`;
        ctx.fillText(p.to.name, 276, y + 56);
        ctx.textAlign = "right";
        ctx.fillStyle = "#2e9e5b";
        ctx.font = `800 28px ${shareFont()}`;
        ctx.fillText("$" + formatMoney(p.amount), W - 32, y + 18);
        y += 92;
      });
      used = y + 8;
    }
  }

  drawBrandFooter(ctx, W, used + 18);
  return cropCanvasJpeg(canvas, scale, used + 56);
}

async function shareResultPage() {
  const btn = $("result-share");
  if (btn) btn.disabled = true;
  const names = ["戰況", "排行榜", "統計", "找數"];
  try {
    const blob = await renderResultShareJpeg(ui.resultPage);
    await shareJpegBlob(blob, `總賽果-${names[ui.resultPage] || "分享"}.jpg`);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    try {
      const blob = await renderResultShareJpeg(ui.resultPage);
      downloadBlob(blob, `總賽果-${names[ui.resultPage] || "分享"}.jpg`);
    } catch (e2) {
      alert("無法產生分享圖片");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function seatChoices(targetId, selected, excludeSeat) {
  const g = State.game;
  $(targetId).innerHTML = [0, 1, 2, 3]
    .filter((s) => s !== excludeSeat)
    .map((seat) => {
      const p = State.player(g.seats[seat]);
      return `<button type="button" class="choice ${
        selected === seat ? "selected" : ""
      }" data-seat="${seat}">${avatarHtml(p)} ${esc(p?.name || "")} · ${WIND[seat]}</button>`;
    })
    .join("");
}

function allWinnerSeats() {
  const list = [ui.winnerSeat, ...(ui.extraWinnerSeats || [])];
  return [...new Set(list)].filter((s) => {
    if (s == null) return false;
    if (ui.winMode === "hu" && s === ui.discarderSeat) return false;
    return true;
  }).slice(0, 3);
}

function currentWinDraft() {
  if (ui.winnerSeat == null) return null;
  const g = State.game;
  if (ui.winMode === "special") {
    const others = ui.specialPerDoor ? null : ui.specialTargets;
    if (!ui.specialPerDoor && (!others || !others.length)) return null;
    return Scoring.settleSpecial({
      seats: g.seats,
      subjectSeat: ui.winnerSeat,
      receive: ui.specialReceive,
      kind: ui.specialKind,
      perDoor: ui.specialPerDoor,
      otherSeats: ui.specialTargets,
      di: ui.specialDi,
      taiValue: g.settings.taiValue,
      keepExact: g.settings.keepExact,
    });
  }
  if (ui.winMode === "hu" && ui.discarderSeat == null) return null;
  if (ui.winMode === "hu" && ui.discarderSeat === ui.winnerSeat) return null;
  const winSeats = allWinnerSeats();
  if (!winSeats.length) return null;
  const faceFans = {};
  winSeats.forEach((s) => {
    faceFans[s] = ui.faceFans[s] != null ? Number(ui.faceFans[s]) : 5;
  });
  return Scoring.settleWin({
    seats: g.seats,
    dealerSeat: g.dealerSeat,
    consecutive: g.consecutive,
    taiValue: g.settings.taiValue,
    keepExact: g.settings.keepExact,
    roundWind: g.roundWind,
    roundHand: g.roundHand,
    winnerSeat: winSeats[0],
    winnerSeats: winSeats,
    isZimo: ui.winMode === "zimo",
    discarderSeat: ui.discarderSeat,
    faceFans,
    laList: g.la,
    lastWinnerId: g.lastWinnerId,
    lastWinnerIds: g.lastWinnerIds,
  });
}

function renderWinPreview() {
  const result = currentWinDraft();
  if (!result) {
    $("win-preview").textContent =
      ui.winMode === "special" ? "請揀賞罰對象。" : "請選齊贏家／放炮者。";
    return;
  }
  if (result.type === "special") {
    const sub = State.player(result.subjectId);
    const scope = result.perDoor ? "每門" : "指定玩家";
    const verb = result.receive ? "收" : "賠";
    const lines = [
      `${esc(sub?.name)} 特別賞罰　${verb}　${esc(result.kind || "")}　${scope}　${result.di}底（${result.fans}番）`,
      `每門／每人 ${formatMoney(result.each)}　台價 ${formatMoney(State.game.settings.taiValue)}`,
    ];
    const projected = {};
    State.game.players.forEach((p) => {
      projected[p.id] = p.score;
    });
    result.payments.forEach((p) => {
      projected[p.loserId] = Scoring.roundAmount(
        (projected[p.loserId] || 0) - p.delta,
        State.game.settings.keepExact
      );
      projected[p.winnerId] = Scoring.roundAmount(
        (projected[p.winnerId] || 0) + p.delta,
        State.game.settings.keepExact
      );
      lines.push(
        `${esc(State.player(p.loserId)?.name)} → ${esc(State.player(p.winnerId)?.name)} ${formatMoney(
          p.paid
        )}　計分 ${formatMoney(projected[p.loserId])} / ${formatMoney(projected[p.winnerId])}`
      );
    });
    $("win-preview").innerHTML = lines.join("<br>");
    return;
  }
  const winSeats = result.winnerSeats || [result.winnerSeat];
  const names = winSeats
    .map((s) => State.player(State.game.seats[s])?.name)
    .filter(Boolean)
    .join("、");
  const multi = winSeats.length > 1;
  const lines = [
    `${esc(names)} ${result.isZimo ? "自摸" : multi ? `一炮${winSeats.length}響` : "食糊"}`,
    `底番 ${Scoring.BASE_FAN}　連莊 n=${State.game.consecutive}　莊番公式 1+2n=${Scoring.dealerFan(
      State.game.consecutive
    )}`,
  ];
  const projected = {};
  State.game.players.forEach((p) => {
    projected[p.id] = p.score;
  });
  (result.kicks || []).forEach((k) => {
    const puller = State.player(k.pullerId);
    const pulled = State.player(k.pulledId);
    projected[k.pullerId] = Scoring.roundAmount(
      (projected[k.pullerId] || 0) - k.refund,
      State.game.settings.keepExact
    );
    projected[k.pulledId] = Scoring.roundAmount(
      (projected[k.pulledId] || 0) + k.refund,
      State.game.settings.keepExact
    );
    lines.push(
      `${esc(pulled?.name)} 食返 ${esc(puller?.name)}　踢半 ${formatMoney(k.previousPaid)} → ${formatMoney(
        k.kicked
      )}（退回 ${formatMoney(k.refund)}）`
    );
  });
  result.payments.forEach((p) => {
    const loser = State.player(p.loserId);
    const b = p.breakdown;
    const laBit =
      p.count > 1
        ? ` + 拉${p.count}口 ${formatMoney(p.pulled)}（上一口×1.5 進位）`
        : p.kicked
          ? "　反向重計拉數"
          : "";
    projected[p.loserId] = Scoring.roundAmount(
      (projected[p.loserId] || 0) - p.delta,
      State.game.settings.keepExact
    );
    projected[p.winnerId] = Scoring.roundAmount(
      (projected[p.winnerId] || 0) + p.delta,
      State.game.settings.keepExact
    );
    lines.push(
      `${esc(loser?.name)} 枱面 ${formatMoney(p.paid)}（${b.baseFan}+莊${b.dealerFan}+牌${b.faceFan}=${b.totalFan}番 → 本口 ${formatMoney(
        p.basePay
      )}${laBit}）　計分 ${formatMoney(projected[p.loserId])}`
    );
  });
  (result.keptLa || []).forEach((row) => {
    const w = State.player(row.winnerId);
    const l = State.player(row.loserId);
    lines.push(`${esc(w?.name)} 拉 ${esc(l?.name)} ${row.count}口（繼續，今口唔重置）`);
  });
  (result.keptLa || []).forEach((row) => {
    const winner = State.player(row.winnerId);
    const loser = State.player(row.loserId);
    lines.push(`${esc(winner?.name)} 對 ${esc(loser?.name)} 拉${row.count}口保留`);
  });
  const shown = new Set();
  result.payments.forEach((p) => {
    if (!shown.has(p.winnerId)) {
      shown.add(p.winnerId);
      lines.push(`${esc(State.player(p.winnerId)?.name)} 計分 ${formatMoney(projected[p.winnerId])}`);
    }
  });
  $("win-preview").innerHTML = lines.join("<br>");
}

function bindWinChoices() {
  $("win-mode-zimo").onclick = () => {
    ui.winMode = "zimo";
    ui.discarderSeat = null;
    ui.extraWinnerSeats = [];
    refreshWinModal();
  };
  $("win-mode-hu").onclick = () => {
    ui.winMode = "hu";
    refreshWinModal();
  };
  $("win-mode-special").onclick = () => {
    ui.winMode = "special";
    ui.discarderSeat = null;
    ui.extraWinnerSeats = [];
    refreshWinModal();
  };
  $("win-multi-toggle").onchange = () => {
    ui.multiRon = $("win-multi-toggle").checked;
    if (!ui.multiRon) ui.extraWinnerSeats = [];
    refreshWinModal();
  };
  $("win-discarder").onclick = (ev) => {
    const b = ev.target.closest("[data-seat]");
    if (!b) return;
    const seat = Number(b.dataset.seat);
    if (!ui.multiRon) {
      ui.discarderSeat = seat;
      ui.extraWinnerSeats = [];
    } else if (ui.discarderSeat == null || seat === ui.discarderSeat) {
      ui.discarderSeat = seat;
      ui.extraWinnerSeats = ui.extraWinnerSeats.filter((s) => s !== seat);
    } else {
      const i = ui.extraWinnerSeats.indexOf(seat);
      if (i >= 0) ui.extraWinnerSeats.splice(i, 1);
      else if (allWinnerSeats().length < 3) {
        ui.extraWinnerSeats.push(seat);
        if (ui.faceFans[seat] == null) ui.faceFans[seat] = 5;
      }
    }
    refreshWinModal();
  };
  $("special-pay").onclick = () => {
    ui.specialReceive = false;
    ensureSpecialKind();
    refreshWinModal();
  };
  $("special-recv").onclick = () => {
    ui.specialReceive = true;
    ensureSpecialKind();
    refreshWinModal();
  };
  $("special-kind").onclick = (ev) => {
    const b = ev.target.closest("[data-kind]");
    if (!b) return;
    ui.specialKind = b.dataset.kind;
    refreshWinModal();
  };
  $("special-door").onclick = () => {
    ui.specialPerDoor = true;
    refreshWinModal();
  };
  $("special-others").onclick = () => {
    ui.specialPerDoor = false;
    refreshWinModal();
  };
  $("special-targets").onclick = (ev) => {
    const b = ev.target.closest("[data-special-seat]");
    if (!b) return;
    const seat = Number(b.dataset.specialSeat);
    const i = ui.specialTargets.indexOf(seat);
    if (i >= 0) ui.specialTargets.splice(i, 1);
    else ui.specialTargets.push(seat);
    refreshWinModal();
  };
  $("special-di").oninput = () => {
    ui.specialDi = Number($("special-di").value) || 0;
    refreshWinModal();
  };
}

function renderDiscarderChoices() {
  const g = State.game;
  const hint = $("win-discarder-hint");
  if (hint) {
    hint.textContent = ui.multiRon
      ? "先揀放炮者，再點其他同時食糊嘅人。"
      : "揀放炮者。";
  }
  $("win-discarder").innerHTML = [0, 1, 2, 3]
    .filter((s) => s !== ui.winnerSeat)
    .map((seat) => {
      const p = State.player(g.seats[seat]);
      const isD = ui.discarderSeat === seat;
      const isE = ui.multiRon && ui.extraWinnerSeats.includes(seat);
      let cls = "choice";
      if (isD) cls += " selected";
      if (isE) cls += " extra-hu";
      const badge = isD ? " · 放炮" : isE ? " · 食糊" : "";
      return `<button type="button" class="${cls}" data-seat="${seat}">${avatarHtml(p)} ${esc(
        p?.name || ""
      )} · ${WIND[seat]}${badge}</button>`;
    })
    .join("");
}

function renderWinFaces() {
  const seats = allWinnerSeats();
  $("win-faces").innerHTML = seats
    .map((seat) => {
      const p = State.player(State.game.seats[seat]);
      const v = ui.faceFans[seat] != null ? ui.faceFans[seat] : 5;
      return `<label class="field">${esc(p?.name || "玩家")} 牌面番數
      <input type="number" inputmode="numeric" min="0" step="1" data-face-seat="${seat}" value="${v}" />
    </label>`;
    })
    .join("");
  $("win-faces").querySelectorAll("[data-face-seat]").forEach((inp) => {
    inp.oninput = () => {
      ui.faceFans[Number(inp.dataset.faceSeat)] = Number(inp.value) || 0;
      renderWinPreview();
    };
  });
}

function renderSpecialTargets() {
  const box = $("special-targets");
  box.innerHTML = [0, 1, 2, 3]
    .filter((s) => s !== ui.winnerSeat)
    .map((seat) => {
      const p = State.player(State.game.seats[seat]);
      const on = ui.specialTargets.includes(seat);
      return `<button type="button" class="choice ${on ? "selected" : ""}" data-special-seat="${seat}">${avatarHtml(
        p
      )} ${esc(p?.name || "")} · ${WIND[seat]}</button>`;
    })
    .join("");
}

function refreshWinModal() {
  const p = State.player(State.game.seats[ui.winnerSeat]);
  const isZimo = ui.winMode === "zimo";
  const isHu = ui.winMode === "hu";
  const isSpecial = ui.winMode === "special";
  const extraCount = allWinnerSeats().length;
  $("win-title").textContent = isSpecial
    ? `${p?.name || "玩家"}　特別賞罰`
    : isZimo
      ? `${p?.name || "玩家"}　自摸`
      : extraCount > 1
        ? `一炮${extraCount}響`
        : `${p?.name || "玩家"}　食糊`;
  $("win-mode-zimo").className = isZimo ? "btn" : "btn ghost";
  $("win-mode-hu").className = isHu ? "btn" : "btn ghost";
  $("win-mode-special").className = isSpecial ? "btn" : "btn ghost";
  $("win-discarder-wrap").style.display = isHu ? "" : "none";
  $("win-special-wrap").style.display = isSpecial ? "" : "none";
  $("win-faces").style.display = isSpecial ? "none" : "";
  if (isHu) {
    const tog = $("win-multi-toggle");
    if (tog) tog.checked = !!ui.multiRon;
    renderDiscarderChoices();
  }
  if (isSpecial) {
    ensureSpecialKind();
    $("special-pay").className = ui.specialReceive ? "btn ghost" : "btn";
    $("special-recv").className = ui.specialReceive ? "btn" : "btn ghost";
    $("special-kind").innerHTML = specialKindList()
      .map(
        (k) =>
          `<button type="button" class="choice ${
            ui.specialKind === k ? "selected" : ""
          }" data-kind="${esc(k)}">${esc(k)}</button>`
      )
      .join("");
    $("special-door").className = ui.specialPerDoor ? "btn" : "btn ghost";
    $("special-others").className = ui.specialPerDoor ? "btn ghost" : "btn";
    $("special-targets-wrap").style.display = ui.specialPerDoor ? "none" : "";
    if (!ui.specialPerDoor) renderSpecialTargets();
    if (document.activeElement !== $("special-di")) {
      $("special-di").value = String(ui.specialDi);
    }
    const fans = Scoring.roundAmount(Number(ui.specialDi || 0) * Scoring.BASE_FAN, true);
    const each = Scoring.handAmount(fans, State.game.settings.taiValue, State.game.settings.keepExact);
    $("special-di-hint").textContent = `${ui.specialDi || 0} 底 = ${fans} 番　每人 ${formatMoney(each)}`;
  }
  if (!isSpecial) renderWinFaces();
  renderWinPreview();
}

function openWinFromSeat(seat) {
  if (!State.player(State.game.seats[seat])) return;
  ui.winnerSeat = seat;
  ui.winMode = "zimo";
  ui.discarderSeat = null;
  ui.extraWinnerSeats = [];
  ui.multiRon = false;
  ui.faceFans = { [seat]: 5 };
  ui.specialReceive = false;
  ui.specialKind = "追三/四";
  ui.specialPerDoor = true;
  ui.specialTargets = [];
  ui.specialDi = 1;
  refreshWinModal();
  openModal("modal-win");
}

function renderDealerChoices() {
  $("dealer-choices").innerHTML = [0, 1, 2, 3]
    .map((seat) => {
      const p = State.player(State.game.seats[seat]);
      return `<button type="button" class="choice ${
        ui.pendingDealerSeat === seat ? "selected" : ""
      }" data-seat="${seat}">${avatarHtml(p)} ${esc(p?.name || "")} · ${WIND[seat]}</button>`;
    })
    .join("");
}

function openDealerModal() {
  ui.pendingDealerSeat = State.game.dealerSeat;
  renderDealerChoices();
  openModal("modal-dealer");
}

function confirmDealerChange() {
  const next = ui.pendingDealerSeat;
  closeModal("modal-dealer");
  if (next == null || next === State.game.dealerSeat) return;
  State.game.dealerSeat = next;
  State.game.consecutive = 0;
  State.save();
  renderTable();
  const now = Scoring.roundLabel(State.game.roundWind, State.game.roundHand);
  $("reset-round-text").textContent = `莊家已改。而家係${now}，要唔要重設返東風東圈？連莊已清零。`;
  openModal("modal-reset-round");
}

function winNote(result) {
  if (result.type === "special") {
    const sub = State.player(result.subjectId);
    const verb = result.receive ? "收" : "賠";
    const scope = result.perDoor ? "每門" : "指定玩家";
    const pays = result.payments
      .map(
        (p) =>
          `${State.player(p.loserId)?.name}畀${State.player(p.winnerId)?.name} ${formatMoney(p.paid)}`
      )
      .join("，");
    return `${sub?.name} 特別賞罰 ${verb}${result.kind || ""} ${scope} ${result.di}底（${result.fans}番）　${pays}`;
  }
  const winSeats = result.winnerSeats || [result.winnerSeat];
  const names = winSeats
    .map((s) => State.player(State.game.seats[s])?.name)
    .filter(Boolean)
    .join("、");
  const seen = new Set();
  const faces = result.payments
    .filter((p) => {
      if (seen.has(p.winnerId)) return false;
      seen.add(p.winnerId);
      return true;
    })
    .map((p) => `${State.player(p.winnerId)?.name}牌面${p.breakdown.faceFan}`)
    .join("、");
  const kicks = (result.kicks || [])
    .map(
      (k) =>
        `${State.player(k.pulledId)?.name}食返${State.player(k.pullerId)?.name}踢半${k.previousPaid}→${k.kicked}`
    )
    .join("；");
  const pays = result.payments
    .map(
      (p) =>
        `${State.player(p.loserId)?.name}畀${State.player(p.winnerId)?.name} -${formatMoney(p.paid)}`
    )
    .join("，");
  const kind = result.isZimo ? "自摸" : winSeats.length > 1 ? `一炮${winSeats.length}響` : "食糊";
  return `${names} ${kind} ${faces}${kicks ? `　${kicks}` : ""}　${pays}`;
}

function processSurrenders() {
  const hits = ui.surrenderQueue || [];
  ui.surrenderQueue = [];
  if (hits.length) {
    const names = hits
      .map((p) => {
        const loser = State.player(p.loserId);
        const winner = State.player(p.winnerId);
        return `${loser?.name || "玩家"}被${winner?.name || "贏家"}拉滿${p.count}口`;
      })
      .join("、");
    openLaModal(`${names}。可喺下面揀邊條投降（分數已入帳）。`);
  } else {
    renderTable();
  }
}

function openLaModal(hint) {
  $("surrender-text").textContent =
    hint || "列出所有進行中嘅拉數。被拉三口可投降；若今次唔降，要等到第六口。";
  renderLaList();
  openModal("modal-surrender");
}

function laRowHtml(row, pending) {
  const winner = State.player(row.winnerId);
  const loser = State.player(row.loserId);
  const can = !pending && Scoring.canSurrender(row);
  const nextChance = row.skipUntil && row.count < row.skipUntil ? row.skipUntil : null;
  const btn = pending
    ? `<button type="button" class="btn ghost" data-cancel-winner="${row.winnerId}" data-cancel-loser="${row.loserId}">取消</button>`
    : can
      ? `<button type="button" class="btn danger" data-surrender-winner="${row.winnerId}" data-surrender-loser="${row.loserId}">投降</button>`
      : `<button type="button" class="btn ghost" disabled>投降</button>`;
  const extra = pending
    ? "　已投降，可取消"
    : can
      ? "　可投降"
      : nextChance
        ? `　已唔降，第${nextChance}口先可投降`
        : row.count % 3 === 0
          ? ""
          : `　第${Math.ceil(row.count / 3) * 3 || 3}口可投降`;
  return `<div class="la-row ${can ? "alert" : ""} ${pending ? "pending" : ""}">
    <div class="la-main">
      ${avatarHtml(loser)} ${esc(loser?.name || "玩家")}
      被 ${avatarHtml(winner)} ${esc(winner?.name || "贏家")} 拉
      <strong>${row.count}</strong> 口
      <div class="hint">枱面 ${formatMoney(row.lastPaid)}${extra}</div>
    </div>
    ${btn}
  </div>`;
}

function renderLaList() {
  const box = $("la-list");
  const rows = State.game.la || [];
  const pending = State.game.laPendingCancel || [];
  if (!rows.length && !pending.length) {
    box.innerHTML = `<p class="hint">而家冇拉數。</p>`;
    return;
  }
  box.innerHTML =
    rows.map((row) => laRowHtml(row, false)).join("") +
    pending.map((row) => laRowHtml(row, true)).join("");
  box.querySelectorAll("[data-surrender-winner]").forEach((btn) => {
    btn.onclick = () => {
      State.surrender(btn.dataset.surrenderWinner, btn.dataset.surrenderLoser);
      renderLaList();
      renderTable();
    };
  });
  box.querySelectorAll("[data-cancel-winner]").forEach((btn) => {
    btn.onclick = () => {
      State.cancelSurrender(btn.dataset.cancelWinner, btn.dataset.cancelLoser);
      renderLaList();
      renderTable();
    };
  });
}

function renderManage() {
  $("manage-players").innerHTML = State.game.players
    .map(
      (p) => `<div class="player-edit">${avatarHtml(p)}<div>${esc(p.name)}　<span class="hint">${formatMoney(p.score)}</span></div></div>`
    )
    .join("");
  $("manage-seats").innerHTML = [0, 1, 2, 3]
    .map((seat) => {
      const options = State.game.players
        .map(
          (p) =>
            `<option value="${p.id}" ${State.game.seats[seat] === p.id ? "selected" : ""}>${esc(p.name)}</option>`
        )
        .join("");
      return `<label class="field">${WIND[seat]}
        <select data-manage-seat="${seat}">${options}</select>
      </label>`;
    })
    .join("");
  $("manage-seats").querySelectorAll("[data-manage-seat]").forEach((sel) => {
    sel.onchange = () => {
      State.setSeat(Number(sel.dataset.manageSeat), sel.value);
      renderManage();
      renderTable();
    };
  });
}

function addPlayerFromSetup(iconType, icon) {
  const name = $("setup-name").value.trim();
  if (!name) {
    alert("請先輸入名字");
    return;
  }
  State.addPlayer({ name, iconType, icon });
  $("setup-name").value = "";
  renderSetupPlayers();
  renderSetupSeats();
}

function addPlayerFromManage(iconType, icon) {
  const name = $("manage-name").value.trim();
  if (!name) {
    alert("請先輸入名字");
    return;
  }
  State.addPlayer({ name, iconType, icon });
  $("manage-name").value = "";
  renderManage();
}

function goToFreshSetup() {
  State.resetToSetup([]);
  $("setup-tai").value = "0.5";
  $("setup-round").checked = true;
  $("setup-draw-dealer").checked = true;
  $("setup-name").value = "";
  if ($("setup-animal")) $("setup-animal").value = "🐶";
  showScreen("screen-setup");
  renderSetupPlayers();
  renderSetupSeats();
  updateBaseHint();
}

function startGame() {
  const seats = State.game.seats.slice();
  if (seats.some((id) => !id) || new Set(seats).size !== 4) {
    alert("請讓四個座位坐滿、且四人不同");
    return;
  }
  State.startNewGame({
    settings: {
      taiValue: Number($("setup-tai").value) || 0.5,
      keepExact: $("setup-round").checked,
      continueDealerOnDraw: $("setup-draw-dealer").checked,
    },
    seats,
    dealerSeat: State.game.dealerSeat,
  });
  showScreen("screen-table");
  renderTable();
}

function initAnimalMenus() {
  $("setup-animal-wrap").innerHTML = animalSelectHtml("🐶", 'id="setup-animal"');
  $("manage-animal-wrap").innerHTML = animalSelectHtml("🐶", 'id="manage-animal"');
}

function boot() {
  State.load();
  initAnimalMenus();
  $("setup-tai").oninput = updateBaseHint;
  updateBaseHint();

  $("btn-add-emoji").onclick = () =>
    addPlayerFromSetup("emoji", $("setup-animal").value);
  $("btn-add-photo").onclick = () => $("photo-input").click();
  $("photo-input").onchange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    const icon = await compressImage(file);
    addPlayerFromSetup("photo", icon);
  };

  $("btn-start").onclick = startGame;
  $("tab-table").onclick = () => {
    showScreen("screen-table");
    renderTable();
  };
  $("tab-log").onclick = () => {
    renderLog();
    showScreen("screen-log");
  };
  $("log-view-seg").onclick = (ev) => {
    const b = ev.target.closest("[data-log-view]");
    if (!b) return;
    ui.logView = b.dataset.logView;
    $("log-view-seg").querySelectorAll(".log-seg-btn").forEach((x) => x.classList.toggle("on", x === b));
    renderLog();
  };
  $("log-order-seg").onclick = (ev) => {
    const b = ev.target.closest("[data-log-order]");
    if (!b) return;
    ui.logDesc = b.dataset.logOrder === "desc";
    $("log-order-seg").querySelectorAll(".log-seg-btn").forEach((x) => x.classList.toggle("on", x === b));
    renderLog();
  };
  $("tab-stats").onclick = () => {
    renderStats();
    showScreen("screen-stats");
  };
  $("modal-stat").onclick = (ev) => {
    if (ev.target.id === "modal-stat") closeModal("modal-stat");
  };
  $("btn-result").onclick = () => openResultModal();
  $("result-close").onclick = () => closeModal("modal-result");
  $("modal-result").onclick = (ev) => {
    if (ev.target.id === "modal-result") closeModal("modal-result");
  };
  $("result-share").onclick = () => shareResultPage();
  bindResultPager();
  $("result-scroller").addEventListener(
    "scroll",
    () => {
      const scroller = $("result-scroller");
      const w = scroller.clientWidth || 1;
      const next = Math.round(scroller.scrollLeft / w);
      if (next !== ui.resultPage) {
        ui.resultPage = Math.max(0, Math.min(3, next));
        updateResultDots();
      }
    },
    { passive: true }
  );

  $("btn-set-dealer").onclick = () => openDealerModal();
  $("dealer-cancel").onclick = () => closeModal("modal-dealer");
  $("dealer-confirm").onclick = () => confirmDealerChange();
  $("dealer-choices").onclick = (ev) => {
    const b = ev.target.closest("[data-seat]");
    if (!b) return;
    ui.pendingDealerSeat = Number(b.dataset.seat);
    renderDealerChoices();
  };
  [0, 1, 2, 3].forEach((seat) => {
    $("seat-" + seat).onclick = () => openWinFromSeat(seat);
  });
  $("win-cancel").onclick = () => closeModal("modal-win");
  bindWinChoices();
  $("win-confirm").onclick = () => {
    const result = currentWinDraft();
    if (!result) {
      alert(ui.winMode === "special" ? "請揀賞罰對象" : "請選齊贏家／放炮者");
      return;
    }
    if (result.type === "special") {
      State.applyWin(result, result.di, winNote(result));
      closeModal("modal-win");
      renderTable();
      return;
    }
    const faceFans = {};
    (result.winnerSeats || [result.winnerSeat]).forEach((s) => {
      faceFans[s] = ui.faceFans[s] != null ? Number(ui.faceFans[s]) : 5;
    });
    ui.surrenderQueue = State.applyWin(result, faceFans, winNote(result));
    closeModal("modal-win");
    if (ui.surrenderQueue.length) processSurrenders();
    else renderTable();
  };

  $("surrender-close").onclick = () => {
    State.skipDeclinedSurrenders();
    closeModal("modal-surrender");
    renderTable();
  };
  $("btn-la").onclick = () => openLaModal();

  $("btn-draw").onclick = () => {
    if (!confirm("確認流局？")) return;
    const result = Scoring.settleDraw({
      dealerSeat: State.game.dealerSeat,
      consecutive: State.game.consecutive,
      roundWind: State.game.roundWind,
      roundHand: State.game.roundHand,
      continueDealerOnDraw: State.game.settings.continueDealerOnDraw,
    });
    State.applyDraw(result);
    renderTable();
  };

  $("btn-undo").onclick = () => {
    if (State.undo()) renderTable();
  };

  $("btn-manage").onclick = () => {
    renderManage();
    openModal("modal-manage");
  };
  $("manage-close").onclick = () => {
    closeModal("modal-manage");
    renderTable();
  };
  $("reset-round-keep").onclick = () => closeModal("modal-reset-round");
  $("reset-round-ok").onclick = () => {
    State.game.roundWind = 0;
    State.game.roundHand = 0;
    State.game.consecutive = 0;
    State.save();
    closeModal("modal-reset-round");
    renderTable();
  };
  $("manage-add-emoji").onclick = () =>
    addPlayerFromManage("emoji", $("manage-animal").value);
  $("manage-add-photo").onclick = () => $("manage-photo").click();
  $("manage-photo").onchange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    const icon = await compressImage(file);
    addPlayerFromManage("photo", icon);
  };

  $("btn-new").onclick = () => openModal("modal-new-game");
  $("new-game-cancel").onclick = () => closeModal("modal-new-game");
  $("new-game-ok").onclick = () => {
    closeModal("modal-new-game");
    goToFreshSetup();
  };

  $("btn-enter-game").onclick = () => {
    if (State.hasActiveGame()) {
      showScreen("screen-table");
      renderTable();
    } else {
      showScreen("screen-setup");
      renderSetupPlayers();
      renderSetupSeats();
    }
  };

  showScreen("screen-home");
}

boot();

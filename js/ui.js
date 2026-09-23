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
  faceFans: {},
  specialReceive: false,
  specialPerDoor: true,
  specialTargets: [],
  specialDi: 1,
  surrenderQueue: [],
  pendingDealerSeat: null,
  logView: "full",
  logDesc: true,
  screen: "screen-home",
};

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
    .join(" · ");
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
      <div class="name">${p ? esc(p.name) : "空位"} · ${WIND[seat]}</div>
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
    const isWin = (row.payments || []).some((p) => p.winnerId === id);
    const isLose = (row.payments || []).some((p) => p.loserId === id);
    if (isWin) out.push(`獎${di}底`);
    if (isLose) out.push(`罰${di}底`);
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

function renderStats() {
  const view = Stats.buildStatsView(State.game);
  $("stats-hint").textContent = view.unlocked
    ? `已完成 ${view.winds} 圈。頭銜按目前食糊／自摸／出銃／連莊／賞罰統計。`
    : `已完成 ${view.winds}／4 圈。打完東南西北一個全圈之後先會賦予頭銜。`;
  if (!view.ranked.length) {
    $("stats-list").innerHTML = `<div class="card"><p class="hint">尚未有入座玩家。</p></div>`;
    return;
  }
  $("stats-list").innerHTML = view.ranked
    .map((row) => {
      const id = row.player.id;
      const pills = (view.titles[id] || [])
        .slice()
        .sort((a, b) => Stats.TITLE_ORDER.indexOf(a) - Stats.TITLE_ORDER.indexOf(b))
        .map((t) => `<span class="stat-pill">${esc(t)}</span>`)
        .join("");
      const crown = (key) =>
        view.crown[key] && view.crown[key].has(id)
          ? `<span class="stat-crown">👑</span>`
          : "";
      return `<div class="stat-card">
        <div class="stat-head">
          ${avatarHtml(row.player)}
          <div class="stat-name">${esc(row.player.name)}</div>
          <div class="stat-titles">${pills}</div>
        </div>
        <div class="stat-grid">
          <div class="stat-cell"><div class="num">${row.hu}${crown("hu")}</div><div class="lbl">食糊</div></div>
          <div class="stat-cell"><div class="num">${row.zimo}${crown("zimo")}</div><div class="lbl">自摸</div></div>
          <div class="stat-cell"><div class="num">${row.chong}${crown("chong")}</div><div class="lbl">出銃</div></div>
          <div class="stat-cell"><div class="num">${Stats.formatStatDi(row.specialDi)}${crown("specialDi")}</div><div class="lbl">特別賞罰</div></div>
        </div>
      </div>`;
    })
    .join("");
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
      `${esc(sub?.name)} 特別賞罰　${verb}　${scope}　${result.di}底（${result.fans}番）`,
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
  $("win-discarder").onclick = (ev) => {
    const b = ev.target.closest("[data-seat]");
    if (!b) return;
    ui.discarderSeat = Number(b.dataset.seat);
    ui.extraWinnerSeats = ui.extraWinnerSeats.filter((s) => s !== ui.discarderSeat);
    refreshWinModal();
  };
  $("win-multi").onclick = (ev) => {
    const b = ev.target.closest("[data-multi-seat]");
    if (!b) return;
    const seat = Number(b.dataset.multiSeat);
    const i = ui.extraWinnerSeats.indexOf(seat);
    if (i >= 0) ui.extraWinnerSeats.splice(i, 1);
    else if (allWinnerSeats().length < 3) ui.extraWinnerSeats.push(seat);
    if (ui.faceFans[seat] == null) ui.faceFans[seat] = 5;
    refreshWinModal();
  };
  $("special-pay").onclick = () => {
    ui.specialReceive = false;
    refreshWinModal();
  };
  $("special-recv").onclick = () => {
    ui.specialReceive = true;
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

function renderWinMulti() {
  const box = $("win-multi");
  if (ui.winMode !== "hu") {
    box.innerHTML = "";
    return;
  }
  if (ui.discarderSeat == null) {
    box.innerHTML = `<p class="hint">先揀放炮者，再加其他食糊玩家。</p>`;
    return;
  }
  const others = [0, 1, 2, 3].filter((s) => s !== ui.winnerSeat && s !== ui.discarderSeat);
  if (!others.length) {
    box.innerHTML = `<p class="hint">冇其他人可以加。</p>`;
    return;
  }
  box.innerHTML = others
    .map((seat) => {
      const p = State.player(State.game.seats[seat]);
      const on = ui.extraWinnerSeats.includes(seat);
      return `<button type="button" class="choice ${on ? "selected" : ""}" data-multi-seat="${seat}">${avatarHtml(
        p
      )} ${esc(p?.name || "")} · ${WIND[seat]}</button>`;
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
  if (isHu) seatChoices("win-discarder", ui.discarderSeat, ui.winnerSeat);
  if (isSpecial) {
    $("special-pay").className = ui.specialReceive ? "btn ghost" : "btn";
    $("special-recv").className = ui.specialReceive ? "btn" : "btn ghost";
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
  if (!isSpecial) {
    renderWinMulti();
    renderWinFaces();
  }
  renderWinPreview();
}

function openWinFromSeat(seat) {
  if (!State.player(State.game.seats[seat])) return;
  ui.winnerSeat = seat;
  ui.winMode = "zimo";
  ui.discarderSeat = null;
  ui.extraWinnerSeats = [];
  ui.faceFans = { [seat]: 5 };
  ui.specialReceive = false;
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
    return `${sub?.name} 特別賞罰 ${verb}${scope} ${result.di}底（${result.fans}番）　${pays}`;
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
  $("btn-back-home").onclick = goHome;

  showScreen("screen-home");
}

boot();

const BASE_FAN = 5;
const LA_MULTIPLIER = 1.5;

function dealerFan(n) {
  return 1 + 2 * Number(n || 0);
}

function roundAmount(amount, keepExact) {
  const n = Number(amount) || 0;
  if (keepExact !== false) return Math.round(n * 100) / 100;
  return Math.round(n);
}

function roundUp(amount, keepExact) {
  const n = Number(amount) || 0;
  if (keepExact === false) return Math.ceil(n - 1e-9);
  return Math.ceil(n * 100 - 1e-9) / 100;
}

function roundDown(amount, keepExact) {
  const n = Number(amount) || 0;
  if (keepExact === false) return Math.floor(n + 1e-9);
  return Math.floor(n * 100 + 1e-9) / 100;
}

function shouldPayDealerFan({ winnerIsDealer, payerIsDealer }) {
  if (winnerIsDealer) return true;
  return !!payerIsDealer;
}

function fanBreakdown({ faceFan, consecutive, winnerIsDealer, payerIsDealer }) {
  const face = Math.max(0, Number(faceFan) || 0);
  const zhuang = shouldPayDealerFan({ winnerIsDealer, payerIsDealer })
    ? dealerFan(consecutive)
    : 0;
  return {
    baseFan: BASE_FAN,
    dealerFan: zhuang,
    faceFan: face,
    totalFan: BASE_FAN + zhuang + face,
  };
}

function handAmount(totalFan, taiValue, keepExact) {
  return roundAmount(totalFan * Number(taiValue), keepExact);
}

function applyLa(prev, currentAmount, keepExact) {
  if (!prev || !prev.count) {
    return { paid: currentAmount, count: 1, pulled: 0, previousPaid: 0 };
  }
  const pulled = roundUp(prev.lastPaid * LA_MULTIPLIER, keepExact);
  const paid = roundAmount(pulled + currentAmount, keepExact);
  return { paid, count: prev.count + 1, pulled, previousPaid: prev.lastPaid };
}

function nextDealerSeat(dealerSeat) {
  return (Number(dealerSeat) + 3) % 4;
}

function roundLabel(roundWind, roundHand) {
  const w = ["東", "南", "西", "北"];
  const wind = ((Number(roundWind) % 4) + 4) % 4;
  const hand = ((Number(roundHand) % 4) + 4) % 4;
  return `${w[wind]}風${w[hand]}圈`;
}

function advanceRound({ dealerSeat, consecutive, roundWind, roundHand, dealerStays }) {
  const wind = Number(roundWind) || 0;
  const hand = Number(roundHand) || 0;
  if (dealerStays) {
    return {
      dealerSeat,
      consecutive: consecutive + 1,
      roundWind: wind,
      roundHand: hand,
      windCompleted: false,
    };
  }
  const nextSeat = nextDealerSeat(dealerSeat);
  if (wind === 3 && hand === 3) {
    return {
      dealerSeat: nextSeat,
      consecutive: 0,
      roundWind: 0,
      roundHand: 0,
      windCompleted: true,
    };
  }
  const nextHand = (hand + 1) % 4;
  const nextWind = nextHand === 0 ? (wind + 1) % 4 : wind;
  return {
    dealerSeat: nextSeat,
    consecutive: 0,
    roundWind: nextWind,
    roundHand: nextHand,
    windCompleted: nextHand === 0,
  };
}

function canSurrender(row) {
  if (!row || !row.count) return false;
  if (row.count % 3 !== 0) return false;
  return row.count >= (Number(row.skipUntil) || 0);
}

function findLa(laList, winnerId, loserId) {
  return (laList || []).find(
    (row) => row.winnerId === winnerId && row.loserId === loserId
  );
}

function settleWin({
  seats,
  dealerSeat,
  consecutive,
  taiValue,
  keepExact,
  roundWind,
  roundHand,
  winnerSeat,
  winnerSeats,
  isZimo,
  discarderSeat,
  faceFan,
  faceFans,
  laList,
  lastWinnerId,
}) {
  const winSeats = (winnerSeats && winnerSeats.length
    ? winnerSeats
    : [winnerSeat]
  )
    .filter((s, i, arr) => s != null && arr.indexOf(s) === i)
    .slice(0, isZimo ? 1 : 3);

  const winIds = winSeats.map((s) => seats[s]);
  const winIdSet = new Set(winIds);
  const continuingId = lastWinnerId && winIdSet.has(lastWinnerId) ? lastWinnerId : null;

  const kicks = [];
  const payments = [];

  winSeats.forEach((wSeat) => {
    const winnerId = seats[wSeat];
    const winnerIsDealer = wSeat === dealerSeat;
    const thisFace =
      faceFans && faceFans[wSeat] != null ? Number(faceFans[wSeat]) : Number(faceFan) || 0;
    const payerSeats = isZimo
      ? [0, 1, 2, 3].filter((s) => s !== wSeat)
      : [discarderSeat];

    payerSeats.forEach((seat) => {
      if (seat == null || seat === wSeat) return;
      const loserId = seats[seat];
      const breakdown = fanBreakdown({
        faceFan: thisFace,
        consecutive,
        winnerIsDealer,
        payerIsDealer: seat === dealerSeat,
      });
      const basePay = handAmount(breakdown.totalFan, taiValue, keepExact);
      const reverse = findLa(laList, loserId, winnerId);
      if (reverse && reverse.count) {
        const kicked = roundDown(reverse.lastPaid / 2, keepExact);
        const refund = roundAmount(reverse.lastPaid - kicked, keepExact);
        kicks.push({
          pullerId: loserId,
          pulledId: winnerId,
          previousPaid: reverse.lastPaid,
          kicked,
          refund,
        });
      }
      const prev = reverse ? null : findLa(laList, winnerId, loserId);
      const la = applyLa(prev, basePay, keepExact);
      const skipUntil = reverse ? 0 : Number(prev?.skipUntil) || 0;
      const delta = roundAmount(la.paid - la.previousPaid, keepExact);
      payments.push({
        seat,
        loserId,
        winnerId,
        winnerSeat: wSeat,
        breakdown,
        basePay,
        pulled: la.pulled,
        paid: la.paid,
        previousPaid: la.previousPaid,
        delta,
        count: la.count,
        skipUntil,
        kicked: reverse ? true : false,
        askSurrender: canSurrender({ count: la.count, skipUntil }),
      });
    });
  });

  const primaryId = seats[winSeats[0]];
  const settled = new Set(payments.map((p) => `${p.winnerId}:${p.loserId}`));
  kicks.forEach((k) => {
    settled.add(`${k.pullerId}:${k.pulledId}`);
    settled.add(`${k.pulledId}:${k.pullerId}`);
  });
  const kept = (laList || []).filter(
    (row) => winIdSet.has(row.winnerId) && !settled.has(`${row.winnerId}:${row.loserId}`)
  );
  const nextLa = kept.concat(
    payments.map((p) => ({
      winnerId: p.winnerId,
      loserId: p.loserId,
      count: p.count,
      lastPaid: p.paid,
      skipUntil: p.skipUntil || 0,
    }))
  );

  const dealerStays = winSeats.some((s) => s === dealerSeat);
  const next = advanceRound({
    dealerSeat,
    consecutive,
    roundWind,
    roundHand,
    dealerStays,
  });

  return {
    winnerId: primaryId,
    winnerSeat: winSeats[0],
    winnerSeats: winSeats,
    lastWinnerId: continuingId || (winSeats.length === 1 ? primaryId : null),
    lastWinnerIds: winIds,
    isZimo,
    payments,
    kicks,
    keptLa: kept,
    nextLa,
    dealerStays,
    ...next,
  };
}

function settleDraw({
  dealerSeat,
  consecutive,
  roundWind,
  roundHand,
  continueDealerOnDraw,
}) {
  return {
    ...advanceRound({
      dealerSeat,
      consecutive,
      roundWind,
      roundHand,
      dealerStays: !!continueDealerOnDraw,
    }),
    laUnchanged: true,
  };
}

function settleSpecial({
  seats,
  subjectSeat,
  receive,
  perDoor,
  otherSeats,
  di,
  taiValue,
  keepExact,
}) {
  const diNum = Math.max(0, Number(di) || 0);
  const fans = roundAmount(diNum * BASE_FAN, keepExact);
  const each = handAmount(fans, taiValue, keepExact);
  const others = (perDoor
    ? [0, 1, 2, 3].filter((s) => s !== subjectSeat)
    : (otherSeats || []).filter((s) => s !== subjectSeat)
  ).filter((s) => seats[s]);
  const subjectId = seats[subjectSeat];
  const payments = others.map((seat) => {
    const otherId = seats[seat];
    const winnerId = receive ? subjectId : otherId;
    const loserId = receive ? otherId : subjectId;
    return {
      seat,
      loserId,
      winnerId,
      winnerSeat: receive ? subjectSeat : seat,
      breakdown: {
        baseFan: fans,
        dealerFan: 0,
        faceFan: 0,
        totalFan: fans,
        di: diNum,
      },
      basePay: each,
      pulled: 0,
      paid: each,
      previousPaid: 0,
      delta: each,
      count: 0,
      skipUntil: 0,
      kicked: false,
      askSurrender: false,
    };
  });
  return {
    type: "special",
    receive: !!receive,
    perDoor: !!perDoor,
    di: diNum,
    fans,
    each,
    subjectSeat,
    subjectId,
    winnerId: receive ? subjectId : payments[0] && payments[0].winnerId,
    payments,
    kicks: [],
    roundUnchanged: true,
    laUnchanged: true,
  };
}

const Scoring = {
  BASE_FAN,
  LA_MULTIPLIER,
  dealerFan,
  roundAmount,
  roundUp,
  roundDown,
  fanBreakdown,
  handAmount,
  applyLa,
  nextDealerSeat,
  roundLabel,
  advanceRound,
  findLa,
  canSurrender,
  settleWin,
  settleDraw,
  settleSpecial,
};

if (typeof window !== "undefined") window.Scoring = Scoring;
if (typeof module !== "undefined" && module.exports) module.exports = Scoring;

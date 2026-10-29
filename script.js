"use strict";

/* ---------- Biểu diễn ----------
   Bàn cờ: mảng 64 phần tử, chỉ số = hàng*8 + cột, hàng 0 là hạng 8 (phía Đen).
   Quân cờ: chuỗi 2 ký tự, ví dụ "wK" = Vua Trắng, "bP" = Tốt Đen.
   Luật riêng: ban đầu chỉ có 2 Vua. Các quân còn lại nằm trong bộ bài của mỗi bên;
   ai mất Vua trước là thua (Vua có thể bị ăn, không có chiếu/chiếu hết). */

const GLYPH = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const NAME = { Q: "Hậu", R: "Xe", B: "Tượng", N: "Mã", P: "Tốt" };
const TEXT_VS = "︎"; // ép trình duyệt vẽ dạng chữ, không phải emoji
const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const START_HAND = 3;
const MAX_HAND = 5;

const POINTS = { P: 1, N: 2, B: 2, R: 2, Q: 3, K: 0 }; // số sao trên lá bài = điểm bị trừ khi quân bị ăn
const START_SCORE = 23;

const other = (c) => (c === "w" ? "b" : "w");
const colorName = (c) => (c === "w" ? "Trắng" : "Đen");

function initialState() {
  const b = Array(64).fill(null);
  b[4] = "bK";
  b[60] = "wK";
  return { b, turn: "w", ep: -1 };
}

function makeDeck() {
  const cards = [];
  const count = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
  for (const t in count) for (let k = 0; k < count[t]; k++) cards.push(t);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/* ---------- Luật đi quân ---------- */

function isAttacked(s, sq, by) {
  const b = s.b, r = sq >> 3, c = sq & 7;
  const pr = by === "w" ? r + 1 : r - 1;
  if (pr >= 0 && pr < 8) {
    for (const dc of [-1, 1]) {
      if (c + dc >= 0 && c + dc < 8 && b[pr * 8 + c + dc] === by + "P") return true;
    }
  }
  for (const [dr, dc] of KNIGHT) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by + "N") return true;
  }
  for (const [dr, dc] of KING) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by + "K") return true;
  }
  const ray = (dirs, a, bb) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const p = b[rr * 8 + cc];
        if (p) {
          if (p === by + a || p === by + bb) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  return ray(DIAG, "B", "Q") || ray(ORTH, "R", "Q");
}

// Không có luật chiếu: mọi nước đi theo quy tắc quân đều hợp lệ (kể cả để Vua bị ăn)
function pseudoMoves(s) {
  const moves = [], b = s.b, us = s.turn, them = other(us);
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p[0] !== us) continue;
    const t = p[1], r = i >> 3, c = i & 7;
    const add = (to, extra) => moves.push({ from: i, to, piece: p, cap: b[to], ...extra });

    if (t === "P") {
      const d = us === "w" ? -1 : 1, start = us === "w" ? 6 : 1, last = us === "w" ? 0 : 7;
      const r1 = r + d;
      if (r1 < 0 || r1 > 7) continue;
      const push = (to, extra) => {
        if ((to >> 3) === last) for (const pr of "QRBN") add(to, { promo: pr, ...extra });
        else add(to, extra);
      };
      if (!b[r1 * 8 + c]) {
        push(r1 * 8 + c);
        if (r === start && !b[(r + 2 * d) * 8 + c]) add((r + 2 * d) * 8 + c, { dbl: true });
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (cc < 0 || cc > 7) continue;
        const to = r1 * 8 + cc;
        if (b[to] && b[to][0] === them) push(to);
        else if (to === s.ep) add(to, { ep: true, cap: them + "P" });
      }
    } else if (t === "N" || t === "K") {
      for (const [dr, dc] of t === "N" ? KNIGHT : KING) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const to = rr * 8 + cc;
        if (!b[to] || b[to][0] === them) add(to);
      }
    } else {
      const dirs = t === "B" ? DIAG : t === "R" ? ORTH : DIAG.concat(ORTH);
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const to = rr * 8 + cc;
          if (!b[to]) add(to);
          else {
            if (b[to][0] === them) add(to);
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return moves;
}

function applyMove(s, m) {
  const b = s.b.slice();
  b[m.from] = null;
  b[m.to] = m.promo ? s.turn + m.promo : m.piece;
  if (m.ep) b[(m.from >> 3) * 8 + (m.to & 7)] = null;
  return { b, turn: other(s.turn), ep: m.dbl ? (m.from + m.to) / 2 : -1 };
}

// Luật cờ vua: không được đi (hay ra quân) để Vua của mình bị chiếu
const inCheck = (s, color) => {
  const k = s.b.indexOf(color + "K");
  return k >= 0 && isAttacked(s, k, other(color));
};

function legalMoves(s) {
  return pseudoMoves(s).filter((m) => !inCheck(applyMove(s, m), s.turn));
}

// Ra quân hợp lệ: sau khi đặt, Vua mình không bị chiếu (đặt quân chắn đường chiếu cũng được)
const dropIsLegal = (s, color, type, sq) => !inCheck(placePiece(s, color, type, sq), color);

// Bên đang bị chiếu còn cách giải không (đi quân hợp lệ hoặc ra quân chắn)?
function hasEscape(s, color, hand) {
  if (legalMoves({ ...s, turn: color }).length) return true;
  return hand.some((type) => deploySquares(s, color).some((sq) => dropIsLegal(s, color, type, sq)));
}

// Ô được phép ra quân: 2 hàng xuất phát của mình (ô phải còn trống)
function deploySquares(s, color) {
  const rows = color === "w" ? [7, 6] : [0, 1];
  const out = [];
  for (const r of rows) for (let c = 0; c < 8; c++) if (!s.b[r * 8 + c]) out.push(r * 8 + c);
  return out;
}

function placePiece(s, color, type, sq) {
  const b = s.b.slice();
  b[sq] = color + type;
  return { ...s, b };
}

/* ---------- Máy tính ---------- */

// Trọng số "áp sát Vua đối phương" của từng loại quân
const CHASE = { Q: 5, R: 4, N: 5, B: 3, P: 2 };
const CHECK_BONUS = 120;

function evaluate(s) {
  let score = 0;
  const wk = s.b.indexOf("wK"), bk = s.b.indexOf("bK");
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p) continue;
    const r = i >> 3, c = i & 7, t = p[1], us = p[0];
    let v = VALUE[t];
    const centre = 3 - (Math.abs(r - 3.5) + Math.abs(c - 3.5)) / 2; // 0..3
    if (t === "P") v += (us === "w" ? 6 - r : r - 1) * 6 + centre * 4;
    else if (t === "N" || t === "B") v += centre * 10;
    else if (t === "Q") v += centre * 3;
    // Thưởng cho quân càng gần Vua đối phương (máy ưu tiên tấn công)
    const ek = us === "w" ? bk : wk;
    if (ek >= 0 && t !== "K") {
      const dist = Math.abs(r - (ek >> 3)) + Math.abs(c - (ek & 7)); // 0..14
      v += (14 - dist) * CHASE[t];
    }
    score += us === "w" ? v : -v;
  }
  // Chiếu Vua: thưởng cho bên chiếu để máy chủ động tìm đường chiếu hết
  if (bk >= 0 && isAttacked(s, bk, "w")) score += CHECK_BONUS;
  if (wk >= 0 && isAttacked(s, wk, "b")) score -= CHECK_BONUS;
  return score;
}

function orderMoves(moves) {
  const key = (m) =>
    (m.cap ? 10 * VALUE[m.cap[1]] - Math.min(VALUE[m.piece[1]], 900) : 0) + (m.promo ? 800 : 0);
  return moves.sort((a, b) => key(b) - key(a));
}

const TIMEOUT = Symbol("timeout");
let searchNodes = 0;
let searchDeadline = Infinity;

function negamax(s, depth, alpha, beta, ply) {
  if ((++searchNodes & 1023) === 0 && performance.now() > searchDeadline) throw TIMEOUT;
  if (!s.b.includes(s.turn + "K")) return -100000 + ply;
  if (depth === 0) return (s.turn === "w" ? 1 : -1) * evaluate(s);
  const moves = legalMoves(s);
  if (!moves.length) {
    // hết nước: bị chiếu = chiếu hết (thua), không thì tính như thế cờ thường
    return inCheck(s, s.turn) ? -100000 + ply : (s.turn === "w" ? 1 : -1) * evaluate(s);
  }
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    const v = -negamax(applyMove(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Đào sâu dần tới maxDepth; hết thời gian thì dùng kết quả của độ sâu trước đó
function chooseMove(s, maxDepth, timeMs = 900) {
  let moves = orderMoves(legalMoves(s).filter((m) => !m.promo || m.promo === "Q"));
  if (!moves.length) return null;
  let best = [moves[0]];
  searchDeadline = performance.now() + timeMs;
  searchNodes = 0;
  try {
    for (let d = 1; d <= maxDepth; d++) {
      let iter = [], iterScore = -Infinity;
      const scored = [];
      for (const m of moves) {
        const v = -negamax(applyMove(s, m), d - 1, -Infinity, Infinity, 1);
        scored.push([v, m]);
        if (v > iterScore) { iterScore = v; iter = [m]; }
        else if (v === iterScore) iter.push(m);
      }
      best = iter;
      scored.sort((x, y) => y[0] - x[0]);
      moves = scored.map((x) => x[1]); // nước tốt nhất xét trước ở vòng sau
      if (iterScore > 90000) break;     // đã thấy đường thắng ép
    }
  } catch (e) {
    if (e !== TIMEOUT) throw e;
  } finally {
    searchDeadline = Infinity;
  }
  return best[Math.floor(Math.random() * best.length)];
}

// Chọn lá bài + ô để ra quân: ưu tiên quân giá trị cao ở ô an toàn, gần trung tâm
function chooseDeploy(s, color, hand) {
  const them = other(color);
  let best = null, bestScore = 0;
  for (const type of new Set(hand)) {
    for (const sq of deploySquares(s, color)) {
      if (!dropIsLegal(s, color, type, sq)) continue;
      const attacked = isAttacked(s, sq, them);
      const defended = isAttacked(s, sq, color);
      const loss = attacked ? (defended ? VALUE[type] * 0.3 : VALUE[type]) : 0;
      const r = sq >> 3, c = sq & 7;
      const centre = 3 - (Math.abs(r - 3.5) + Math.abs(c - 3.5)) / 2;
      const front = color === "w" ? r === 6 : r === 1; // hàng sát đối phương
      const score = VALUE[type] - loss + centre * 5 + (front ? 8 : 0) + Math.random() * 10;
      if (score > bestScore) { bestScore = score; best = { type, sq }; }
    }
  }
  return best;
}

/* ---------- Trạng thái ván ---------- */

const boardEl = document.getElementById("board");
const statusTextEl = document.getElementById("status-text");
const passBtn = document.getElementById("btn-pass");
const againBtn = document.getElementById("btn-again");
const promoEl = document.getElementById("promo");
const promoChoices = document.getElementById("promo-choices");
const menuEl = document.getElementById("menu");
const gameEl = document.getElementById("game");
const settings = { mode: "ai", side: "w", level: "2" };

let s, hands, decks;
let scores = { w: START_SCORE, b: START_SCORE };
let aiColor = "b";
let flipped = false;
let sel = null;          // ô quân đang chọn để đi
let targets = [];        // các nước đi của quân đang chọn
let cardPick = null;     // chỉ số lá bài đang chọn để ra quân
let dropSquares = [];    // các ô có thể ra quân
let drew = false;        // lượt này có bốc được lá không
let lastMove = null;
let thinking = false;
let runId = 0;          // đổi mỗi khi bắt đầu/thoát ván để hủy các hiệu ứng đang chạy dở
let quietTurns = 0;     // số lượt liên tiếp không ăn quân, không ra quân
let busy = false;       // đang chạy hiệu ứng (bốc bài, ra quân...)
let busyText = "";      // lời dẫn cho đối phương theo dõi khi đang busy
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let gameOver = false;
let resultText = "";
let passStreak = 0;     // số lần bỏ lượt liên tiếp

const aiOn = () => settings.mode === "ai";          // người đấu với máy
const spectating = () => settings.mode === "aivai"; // máy đấu máy, người xem
const isAiColor = (c) => spectating() || (aiOn() && c === aiColor);
const isAiTurn = () => isAiColor(s.turn);

function newGame() {
  runId++;
  busy = false;
  busyText = "";
  quietTurns = 0;
  s = initialState();
  hands = { w: [], b: [] };
  decks = { w: makeDeck(), b: makeDeck() };
  scores = { w: START_SCORE, b: START_SCORE };
  for (let k = 0; k < START_HAND; k++) { draw("w"); draw("b"); }
  lastMove = null;
  thinking = false;
  gameOver = false;
  resultText = "";
  passStreak = 0;
  beginTurn();
}

function draw(color) {
  if (hands[color].length >= MAX_HAND || !decks[color].length) return false;
  hands[color].push(decks[color].pop());
  return true;
}

function clearPicks() {
  sel = null;
  targets = [];
  cardPick = null;
  dropSquares = [];
}

// Mỗi lượt diễn ra lần lượt: dừng nhìn kết quả lượt trước -> bốc bài -> hành động
async function beginTurn() {
  const id = runId;
  busy = true;
  quietTurns++;
  clearPicks();
  const color = s.turn;
  busyText = `Lượt của ${colorName(color)}`;
  render();
  if (lastMove) await sleep(450);
  if (id !== runId) return;

  // Chiếu hết: bị chiếu mà không còn cách giải (tính cả lá bài sắp bốc)
  if (inCheck(s, color)) {
    const topCard = hands[color].length < MAX_HAND && decks[color].length ? [decks[color][decks[color].length - 1]] : [];
    if (!hasEscape(s, color, hands[color].concat(topCard))) {
      const win = other(color);
      gameOver = true;
      busy = false;
      resultText = `Chiếu hết! Vua ${colorName(color)} không còn đường thoát — ${colorName(win)} thắng!`;
      clearPicks();
      render();
      showEnding("capture", win);
      return;
    }
  }

  // Bị chiếu: quân tấn công lao vào Vua nhưng Vua đỡ được
  const kSq = s.b.indexOf(color + "K");
  if (kSq >= 0 && isAttacked(s, kSq, other(color))) {
    const hitters = pseudoMoves({ ...s, turn: other(color) }).filter((m) => m.to === kSq).map((m) => m.from);
    busyText = `${colorName(other(color))} chiếu Vua ${colorName(color)}!`;
    render();
    for (const from of [...new Set(hitters)].slice(0, 2)) {
      await animateCheck(from, kSq);
      if (id !== runId) return;
    }
    await sleep(250);
    if (id !== runId) return;
  }

  drew = draw(color);
  if (drew) {
    busyText = `${colorName(color)} bốc 1 lá bài`;
    render();
    await animateDraw(color);
    await sleep(300);
    if (id !== runId) return;
  }
  busy = false;
  render();
  if (isAiTurn()) aiTurn();
  else showTurnToast();
}

// Quân chiếu tích lực, bắn một đòn vào Vua; Vua giơ khiên đỡ, tia lửa bắn tung tóe
async function animateCheck(from, kingSq) {
  if (typeof Element.prototype.animate !== "function") return;
  const pieceAt = (sq) => boardEl.querySelector(`[data-i="${sq}"] .piece`);
  const atk = pieceAt(from), king = pieceAt(kingSq);
  if (!atk || !king) return;
  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const a = center(atk), k = center(king);
  const ang = Math.atan2(k.y - a.y, k.x - a.x);
  const spawn = (cls, x, y) => {
    const el = document.createElement("div");
    el.className = cls;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    return el;
  };

  // 1. Quân tấn công phát sáng, tích lực
  atk.classList.add("charging");
  await sleep(380);

  // 2. Tia đòn đánh lao thẳng vào Vua
  const bolt = spawn("fx-bolt", 0, 0);
  await bolt.animate(
    [
      { transform: `translate(${a.x}px, ${a.y}px) rotate(${ang}rad)` },
      { transform: `translate(${k.x}px, ${k.y}px) rotate(${ang}rad)` },
    ],
    { duration: 320, easing: "ease-in", fill: "forwards" }
  ).finished;
  bolt.remove();
  atk.classList.remove("charging");

  // 3. Vua đỡ đòn: khiên lóe lên, tia lửa văng ra, Vua lùi nhẹ
  const shield = spawn("fx-shield", k.x, k.y);
  shield.animate(
    [
      { opacity: 0, transform: "scale(0.3)" },
      { opacity: 1, transform: "scale(1)", offset: 0.35 },
      { opacity: 0, transform: "scale(1.4)" },
    ],
    { duration: 600, easing: "ease-out", fill: "forwards" }
  );
  const sparks = [];
  for (let n = 0; n < 16; n++) {
    const sp = spawn("fx-spark", k.x, k.y);
    const dir = ang + Math.PI + (Math.random() - 0.5) * 2.4; // văng ngược về phía đòn đánh
    const dist = 40 + Math.random() * 60;
    sp.style.setProperty("--dx", Math.cos(dir) * dist + "px");
    sp.style.setProperty("--dy", Math.sin(dir) * dist + "px");
    sparks.push(sp);
  }
  const label = spawn("fx-text", k.x, k.y - 46);
  label.textContent = "Đỡ được!";
  label.animate(
    [{ opacity: 0, transform: "translate(-50%, 0)" }, { opacity: 1, transform: "translate(-50%, -14px)", offset: 0.3 }, { opacity: 0, transform: "translate(-50%, -30px)" }],
    { duration: 900, fill: "forwards" }
  );
  const push = 7;
  king.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: `translate(${Math.cos(ang) * push}px, ${Math.sin(ang) * push}px)`, offset: 0.2 },
      { transform: `translate(${-Math.cos(ang) * 3}px, ${-Math.sin(ang) * 3}px)`, offset: 0.6 },
      { transform: "translate(0, 0)" },
    ],
    { duration: 420, composite: "add" }
  );
  await sleep(650);
  [shield, label, ...sparks].forEach((el) => el.remove());
}

const handElOf = (color) =>
  document.getElementById(color === (flipped ? "b" : "w") ? "hand-bottom" : "hand-top");

// Lá bài bay từ bộ bài vào tay; bài của người chơi được lật mặt khi tới nơi
async function animateDraw(color) {
  const handEl = handElOf(color);
  const deck = handEl.querySelector(".deck");
  const cards = handEl.querySelectorAll(".cards .card:not(.deck)");
  const target = cards[cards.length - 1];
  if (!deck || !target || typeof Element.prototype.animate !== "function") return;

  const faceUp = !target.classList.contains("back");
  const type = hands[color][hands[color].length - 1];
  target.style.visibility = "hidden";
  const dr = deck.getBoundingClientRect(), tr = target.getBoundingClientRect();
  const fly = document.createElement("div");
  fly.className = "card fly back";
  Object.assign(fly.style, {
    position: "fixed", left: dr.left + "px", top: dr.top + "px",
    width: tr.width + "px", height: tr.height + "px", margin: "0", zIndex: 20, pointerEvents: "none",
  });
  document.body.appendChild(fly);
  await fly.animate(
    [
      { transform: "translate(0, 0) rotate(-12deg)" },
      { transform: `translate(${tr.left - dr.left}px, ${tr.top - dr.top}px) rotate(0deg)` },
    ],
    { duration: 520, easing: "cubic-bezier(.25,.8,.35,1)", fill: "forwards" }
  ).finished;
  fly.getAnimations().forEach((a) => a.cancel());
  fly.style.left = tr.left + "px";
  fly.style.top = tr.top + "px";
  if (faceUp) {
    await fly.animate([{ transform: "rotateY(0)" }, { transform: "rotateY(90deg)" }], { duration: 160 }).finished;
    fly.className = "card fly " + color;
    fly.innerHTML = cardFace(type, color);
    await fly.animate([{ transform: "rotateY(90deg)" }, { transform: "rotateY(0)" }], { duration: 160 }).finished;
  }
  target.style.visibility = "";
  fly.remove();
}

// Báo cho người chơi biết đã tới lượt mình
function showTurnToast() {
  const el = document.getElementById("turn-toast");
  el.textContent = aiOn() ? "Tới lượt của bạn" : `Tới lượt của ${colorName(s.turn)}`;
  el.classList.remove("show");
  void el.offsetWidth; // khởi động lại hiệu ứng
  el.classList.add("show");
}

function afterMove() {
  const wKing = s.b.includes("wK"), bKing = s.b.includes("bK");
  const wLost = !wKing || scores.w <= 0, bLost = !bKing || scores.b <= 0;
  if (wLost || bLost) {
    document.getElementById("turn-toast").classList.remove("show");
    gameOver = true;
    const win = wLost ? "b" : "w";
    const lose = other(win);
    const kingGone = !s.b.includes(lose + "K");
    resultText = kingGone
      ? `Vua ${colorName(lose)} đã bị bắt — ${colorName(win)} thắng!`
      : `${colorName(lose)} hết điểm (${scores[lose]}) — ${colorName(win)} thắng!`;
    clearPicks();
    render();
    showEnding("capture", win);
    return;
  }
  beginTurn();
}

function doMove(m) {
  passStreak = 0;
  lastMove = m;
  // Quân bị ăn: bên sở hữu bị trừ số điểm tương ứng
  if (m.cap) quietTurns = 0;
  if (m.cap && m.cap[1] !== "K") scores[m.cap[0]] -= POINTS[m.cap[1]];
  s = applyMove(s, m);
  afterMove();
}

function passTurn() {
  s = { ...s, turn: other(s.turn), ep: -1 };
  beginTurn();
}

// Bỏ lượt thật sự; hai bên cùng bỏ lượt liên tiếp thì bên còn nhiều điểm hơn thắng
async function pass() {
  passStreak++;
  if (passStreak < 2) {
    busy = true;
    busyText = `${colorName(s.turn)} bỏ lượt`;
    clearPicks();
    render();
    const id = runId;
    await sleep(800);
    if (id !== runId) return;
    busy = false;
    passTurn();
    return;
  }
  const pts = scores;
  gameOver = true;
  clearPicks();
  const score = `Trắng ${pts.w} : ${pts.b} Đen`;
  resultText = pts.w === pts.b ? `Hai bên cùng bỏ lượt — ${score} — Hòa!`
    : `Hai bên cùng bỏ lượt — ${score} — ${colorName(pts.w > pts.b ? "w" : "b")} thắng!`;
  render();
  showEnding(pts.w === pts.b ? "draw" : "score", pts.w === pts.b ? null : pts.w > pts.b ? "w" : "b");
}

function deploy(color, cardIdx, sq) {
  passStreak = 0;
  quietTurns = 0;
  const type = hands[color][cardIdx];
  s = placePiece(s, color, type, sq);
  hands[color].splice(cardIdx, 1);
  lastMove = { from: -1, to: sq };
  clearPicks();
}

// Mỗi lượt máy chỉ làm một việc: ra quân HOẶC đi quân (hoặc bỏ lượt)
function cardFace(type, color) {
  return `<span class="glyph">${GLYPH[type]}${TEXT_VS}</span><span class="cname">${NAME[type]}</span>` +
    `<span class="stars">${"★".repeat(POINTS[type])}</span>`;
}

// Hiệu ứng: lá bài bay ra đặt xuống ô, rồi hóa thành quân cờ. Xong thì gọi done()
async function deployAnimated(color, cardIdx, sq, done) {
  const id = runId;
  busy = true;
  const type = hands[color][cardIdx];
  busyText = `${colorName(color)} ra quân ${NAME[type]}`;
  clearPicks();
  render();
  const handEl = handElOf(color);
  const src = handEl.querySelectorAll(".cards .card:not(.deck)")[cardIdx];
  const dst = boardEl.querySelector(`[data-i="${sq}"]`);
  const finish = async () => { await sleep(450); if (id !== runId) return; busy = false; done(); };
  if (!src || !dst || !el_animate_ok()) { deploy(color, cardIdx, sq); render(); finish(); return; }

  const sr = src.getBoundingClientRect(), dr = dst.getBoundingClientRect();
  const fly = document.createElement("div");
  fly.className = "card fly " + (src.classList.contains("back") ? "back" : color);
  fly.innerHTML = src.classList.contains("back") ? "" : cardFace(type, color);
  Object.assign(fly.style, {
    position: "fixed", left: sr.left + "px", top: sr.top + "px",
    width: sr.width + "px", height: sr.height + "px", margin: "0", zIndex: 20, pointerEvents: "none",
  });
  document.body.appendChild(fly);
  src.style.visibility = "hidden";

  // Bài úp của máy: lật mặt trước khi bay
  if (src.classList.contains("back")) {
    await fly.animate([{ transform: "rotateY(0)" }, { transform: "rotateY(90deg)" }], { duration: 160 }).finished;
    fly.className = "card fly " + color;
    fly.innerHTML = cardFace(type, color);
    await fly.animate([{ transform: "rotateY(90deg)" }, { transform: "rotateY(0)" }], { duration: 160 }).finished;
  }

  const dx = dr.left + dr.width / 2 - (sr.left + sr.width / 2);
  const dy = dr.top + dr.height / 2 - (sr.top + sr.height / 2);
  const sc = (dr.width / sr.width) * 0.95;
  const end = `translate(${dx}px, ${dy}px) rotate(0deg) scale(${sc})`;
  await fly.animate(
    [
      { transform: "translate(0, 0) rotate(-8deg) scale(1)" },
      { transform: `translate(${dx}px, ${dy - 24}px) rotate(3deg) scale(${sc * 1.15})`, offset: 0.7 },
      { transform: end },
    ],
    { duration: 520, easing: "cubic-bezier(.25,.8,.35,1)", fill: "forwards" }
  ).finished;

  // Lá bài hóa thành quân cờ
  if (id !== runId) { fly.remove(); return; }
  deploy(color, cardIdx, sq);
  render();
  const piece = boardEl.querySelector(`[data-i="${sq}"] .piece`);
  if (piece) piece.classList.add("pop");
  await fly.animate(
    [
      { transform: end, opacity: 1, filter: "brightness(1)" },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${sc * 1.3})`, opacity: 0, filter: "brightness(3) blur(3px)" },
    ],
    { duration: 380, easing: "ease-out", fill: "forwards" }
  ).finished;
  fly.remove();
  finish();
}

function el_animate_ok() {
  return typeof Element.prototype.animate === "function";
}

function aiTurn() {
  const id = runId;
  const me = s.turn, opp = other(me);
  thinking = true;
  render();
  setTimeout(() => {
    if (id !== runId) return;
    const level = parseInt(settings.level, 10);
    const pts = scores;
    // Đối thủ vừa bỏ lượt mà mình đang hơn điểm: bỏ lượt theo để chốt thắng
    // Xem máy đấu máy: lâu không ai ăn quân thì bên không thua kém xin dừng để tính điểm
    const stalled = spectating() && ((quietTurns >= 30 && pts[me] >= pts[opp]) || quietTurns >= 60);
    if ((passStreak === 1 && pts[me] > pts[opp]) || stalled) {
      thinking = false;
      pass();
      return;
    }

    // Mức Dễ thỉnh thoảng đi bừa; còn lại tìm nước tốt nhất (Dễ 2, Vừa 3, Khó 4 nước)
    let m;
    if (level === 1 && Math.random() < 0.25) {
      const all = legalMoves(s).filter((x) => !x.promo || x.promo === "Q");
      m = all.length ? all[Math.floor(Math.random() * all.length)] : null;
    } else {
      m = chooseMove(s, level + 1);
    }

    // Đi quân nếu ăn được quân, chiếu được Vua, hoặc Vua mình đang bị đe dọa
    const ek = s.b.indexOf(opp + "K");
    const givesCheck = m && ek >= 0 && isAttacked(applyMove(s, m), ek, me);
    const kingThreatened = isAttacked(s, s.b.indexOf(me + "K"), opp);
    const attack = m && (m.cap || givesCheck || kingThreatened);

    // Chưa đủ lực lượng tấn công thì ra thêm quân; đủ rồi thì dồn quân đi áp sát Vua
    let d = null;
    if (!attack) {
      const force = s.b.filter((p) => p && p[0] === me && "QRBN".includes(p[1])).length;
      const build = force < 3 || (hands[me].length >= MAX_HAND && Math.random() < 0.5);
      const forced = !m && inCheck(s, me); // chỉ còn cách ra quân để chắn đường chiếu
      if ((build || !m) && (level > 1 || forced || Math.random() < 0.7)) d = chooseDeploy(s, me, hands[me]);
    }
    thinking = false;
    if (d) {
      deployAnimated(me, hands[me].indexOf(d.type), d.sq, passTurn);
    } else if (m) {
      doMove(m);
    } else {
      pass();
    }
  }, 700);
}

/* ---------- Vẽ giao diện ---------- */

// Ô của quân đang chiếu Vua ("check") và của Vua bị chiếu ("guard")
function checkMarks() {
  const marks = {};
  for (const color of ["w", "b"]) {
    const k = s.b.indexOf(color + "K");
    if (k < 0 || !isAttacked(s, k, other(color))) continue;
    marks[k] = "guard";
    for (const m of pseudoMoves({ ...s, turn: other(color) })) {
      if (m.to === k) marks[m.from] = "check";
    }
  }
  return marks;
}

function render() {
  const last = lastMove;
  const marks = gameOver ? {} : checkMarks();
  boardEl.innerHTML = "";
  for (let n = 0; n < 64; n++) {
    const i = flipped ? 63 - n : n;
    const r = i >> 3, c = i & 7;
    const el = document.createElement("div");
    el.className = "sq " + ((r + c) % 2 ? "dark" : "light");
    el.dataset.i = i;
    if (last && (i === last.from || i === last.to)) el.classList.add("last");
    if (i === sel) el.classList.add("selected");
    if (dropSquares.includes(i)) el.classList.add("drop");
    if (targets.some((m) => m.to === i)) {
      el.classList.add("hint");
      if (s.b[i] || targets.some((m) => m.to === i && m.ep)) el.classList.add("capture");
    }
    const p = s.b[i];
    if (p) {
      const span = document.createElement("span");
      span.className = "piece " + p[0];
      span.textContent = GLYPH[p[1]] + TEXT_VS;
      el.appendChild(span);
    }
    if (marks[i]) {
      el.classList.add("mark-" + marks[i]);
      const badge = document.createElement("span");
      badge.className = "badge " + marks[i];
      badge.textContent = marks[i] === "check" ? "Chiếu" : "Hộ giá";
      el.appendChild(badge);
    }
    const bottomRow = flipped ? 0 : 7, leftCol = flipped ? 7 : 0;
    if (c === leftCol) addCoord(el, "rank", 8 - r);
    if (r === bottomRow) addCoord(el, "file", "abcdefgh"[c]);
    el.addEventListener("click", () => onSquare(i));
    boardEl.appendChild(el);
  }

  const bottom = flipped ? "b" : "w";
  renderHand(document.getElementById("hand-bottom"), bottom);
  renderHand(document.getElementById("hand-top"), other(bottom));

  statusTextEl.parentElement.classList.toggle("over", gameOver);
  const canPass = !gameOver && !thinking && !busy && !isAiTurn() && !inCheck(s, s.turn);
  passBtn.classList.toggle("hidden", !canPass);
  againBtn.classList.toggle("hidden", !gameOver && !spectating());

  if (gameOver) {
    statusTextEl.textContent = resultText;
  } else if (busy && busyText) {
    statusTextEl.textContent = busyText;
  } else if (thinking) {
    statusTextEl.textContent = spectating() ? `Máy ${colorName(s.turn)} đang suy nghĩ...` : "Máy đang suy nghĩ...";
  } else {
    statusTextEl.textContent = `Lượt của ${colorName(s.turn)}` +
      (drew ? " · đã bốc 1 lá" : " · không bốc được lá") +
      (inCheck(s, s.turn) ? " · Vua đang bị chiếu, phải giải chiếu!" : "");
  }
}

function renderHand(el, color) {
  const faceUp = spectating() || (aiOn() ? color !== aiColor : color === s.turn && !gameOver);
  const myTurn = color === s.turn && !gameOver && !thinking && !busy && !isAiTurn();
  el.querySelector(".hand-info").innerHTML =
    `${colorName(color)} · <b class="score">★ ${scores[color]} điểm</b> · Trên tay ${hands[color].length}/${MAX_HAND}`;
  const cards = el.querySelector(".cards");
  cards.innerHTML = "";
  const deck = document.createElement("div");
  deck.className = "card back deck" + (decks[color].length ? "" : " empty");
  deck.textContent = decks[color].length;
  cards.appendChild(deck);
  hands[color].forEach((type, idx) => {
    const card = document.createElement("div");
    if (faceUp) {
      card.className = "card " + color + (myTurn ? " playable" : "") + (myTurn && cardPick === idx ? " picked" : "");
      card.innerHTML = cardFace(type, color);
      if (myTurn) card.onclick = () => onCard(idx);
    } else {
      card.className = "card back";
    }
    cards.appendChild(card);
  });
}

function addCoord(el, cls, text) {
  const d = document.createElement("span");
  d.className = "coord " + cls;
  d.textContent = text;
  el.appendChild(d);
}

/* ---------- Màn hình kết thúc ---------- */

const endModal = document.getElementById("end-modal");
const endStage = document.getElementById("end-stage");

// kind: capture (Vua bị ăn) | surrender (Vua đầu hàng) | score (tính điểm) | draw (hòa)
async function showEnding(kind, winner) {
  const id = runId;
  document.getElementById("turn-toast").classList.remove("show");
  await sleep(kind === "capture" ? 700 : 500);
  if (id !== runId) return;

  const kingGlyph = (cls) => `<span class="${cls}">${GLYPH.K}${TEXT_VS}</span>`;
  let revealAfter = 600;
  endStage.innerHTML = "";
  endModal.classList.remove("revealed");
  endModal.classList.remove("hidden");

  if (kind === "capture" || kind === "surrender") {
    // Vua của bên thua rung rồi vỡ ra từng mảnh
    const loser = other(winner);
    const wrap = document.createElement("div");
    wrap.className = "king-wrap " + loser;
    wrap.innerHTML = kingGlyph("kh top") + kingGlyph("kh bottom") + '<div class="flash"></div>';
    for (let k = 0; k < 20; k++) {
      const pt = document.createElement("i");
      const ang = (k / 20) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 70 + Math.random() * 90;
      pt.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      pt.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      pt.style.animationDelay = 0.75 + Math.random() * 0.1 + "s";
      wrap.appendChild(pt);
    }
    endStage.appendChild(wrap);
    revealAfter = 2000;
  } else if (kind === "score") {
    endStage.innerHTML = `<div class="king-wrap crown ${winner}">${kingGlyph("kh win")}</div>`;
    revealAfter = 900;
  } else {
    endStage.innerHTML = `<div class="king-wrap pair">${kingGlyph("kh w")}${kingGlyph("kh b")}</div>`;
    revealAfter = 700;
  }

  document.getElementById("end-title").textContent = winner ? `Phe ${colorName(winner)} thắng!` : "Hòa!";
  const who = aiOn() && winner ? (winner === aiColor ? " (Bạn thua)" : " (Bạn thắng)") : "";
  document.getElementById("end-detail").textContent = resultText + who;
  await sleep(revealAfter);
  endModal.classList.add("revealed");
}

document.getElementById("end-again").onclick = () => {
  endModal.classList.add("hidden");
  newGame();
};
document.getElementById("end-no").onclick = () => endModal.classList.add("hidden");

function showMenu() {
  runId++; // hủy mọi hiệu ứng/lượt máy đang chạy dở
  busy = false;
  thinking = false;
  endModal.classList.add("hidden");
  gameEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
}

/* ---------- Thao tác người chơi ---------- */

function onCard(idx) {
  if (gameOver || thinking || busy || isAiTurn()) return;
  if (cardPick === idx) {
    clearPicks();
  } else {
    clearPicks();
    cardPick = idx;
    const type = hands[s.turn][idx];
    dropSquares = deploySquares(s, s.turn).filter((sq) => dropIsLegal(s, s.turn, type, sq));
  }
  render();
}

function onSquare(i) {
  if (gameOver || thinking || busy || isAiTurn()) return;

  if (cardPick !== null && dropSquares.includes(i)) {
    // ra quân thì kết thúc lượt, không được đi quân
    deployAnimated(s.turn, cardPick, i, passTurn);
    return;
  }
  const move = targets.filter((m) => m.to === i);
  if (sel !== null && move.length) {
    if (move[0].promo) askPromotion(move, s.turn);
    else doMove(move[0]);
    return;
  }
  const p = s.b[i];
  clearPicks();
  if (p && p[0] === s.turn) {
    sel = i;
    targets = legalMoves(s).filter((m) => m.from === i);
  }
  render();
}

function askPromotion(options, color) {
  promoChoices.innerHTML = "";
  for (const m of options) {
    const btn = document.createElement("button");
    btn.className = color;
    btn.textContent = GLYPH[m.promo] + TEXT_VS;
    btn.onclick = () => { promoEl.classList.add("hidden"); doMove(m); };
    promoChoices.appendChild(btn);
  }
  promoEl.classList.remove("hidden");
}

passBtn.onclick = () => { if (!gameOver && !thinking && !busy && !isAiTurn()) pass(); };
againBtn.onclick = showMenu;

/* ---------- Màn hình chọn thiết lập ---------- */

function syncMenu() {
  const ai = settings.mode === "ai";
  document.getElementById("field-side").classList.toggle("hidden", !ai);
  document.getElementById("field-level").classList.toggle("hidden", !ai && settings.mode !== "aivai");
}

document.querySelectorAll(".options").forEach((group) => {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".opt");
    if (!btn) return;
    group.querySelectorAll(".opt").forEach((o) => o.classList.toggle("active", o === btn));
    settings[group.dataset.name] = btn.dataset.value;
    syncMenu();
  });
});

document.getElementById("btn-start").onclick = () => {
  let side = settings.side;
  if (side === "r") side = Math.random() < 0.5 ? "w" : "b";
  aiColor = other(side);
  flipped = aiOn() && side === "b";
  menuEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  newGame();
};

syncMenu();

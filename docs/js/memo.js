// =========================================================
//  memo：任務2の部署コード表（右上の MEMO ボタンで開く画面）
//    ボタンは、師匠が「右上に追加しておいた」と言うのに合わせて出る（台本の { set: { memo: true } }）
//    はじめて開くと、師匠が使い方を教える（任務1の朝比奈の人事部のコードを、タイルで当てはめさせる）
//    画面に部署名が出ると、表に行が増える。「dept:〇〇〇〇」が出ると番号のタイルが届く
//    部署ができた年が分かる文が出ると、部署名の下にその年が書きこまれる（当てはめる手間はない）
//    タイルを押して、入れる欄を押すと入る（まちがった欄だと、はね返る）
//    表は、いつもコードの小さい順（分かっていない行は下）
//    特別プロジェクト室と、今はない部署の番号は、自分で打ちこむ（合っているかは教えない）
//    特別プロジェクト室の番号は、1770 で検索して当たったら（special.clue）確定する
//  台本の書き方は src/scenario.js の m2.memo
// =========================================================

const memoState = () =>
  (state.memo ||= { rows: [], tiles: [], given: {}, placed: {}, notes: {}, years: {}, said: {}, dot: false, next: 1 });
const memoRows = () => [
  ...CH.memo.rows,
  ...(CH.memo.former || []).map(r => ({ ...r, former: true })),
  { ...CH.memo.special, special: true },
];
const memoRow = name => memoRows().find(r => r.name === name);
// MEMO ボタンを出すのは、memo の目標（from 番目）で師匠が「追加しておいた」と言ってから
//   その目標を飛ばして先へ進んだとき（手がかりを先に見つけていたとき）は、そのまま出す
const memoReady = () => {
  if (!CH?.memo || !state || state.over) return false;
  const from = CH.memo.from ?? 0;
  return state.objIdx > from || (state.objIdx === from && !!state.flags?.memo);
};
const isMemoOpen = () => $("memo")?.classList.contains("on");

// ---------------- 画面に出たものを拾う（print のたびに呼ばれる） ----------------
function memoSeen(el) {
  memoButton();
  if (!CH?.memo || !state || el.closest?.("#memo")) return;
  const m = memoState(),
    text = el.textContent;
  let got = false;
  const addRow = r => {
    if (m.rows.includes(r.name)) return;
    m.rows.push(r.name);
    addLog(`MEMO ＋ ${r.name}`);
    got = true;
  };
  for (const r of memoRows()) {
    if (text.includes(r.name)) addRow(r);
    // 番号：「dept:1081」、または表の「1081　経理部」のように、番号のすぐあとに部署名が並んでいるとき
    if (r.code && !r.special && (text.includes(`dept:${r.code}`) || new RegExp(`(^|\\D)${r.code}[ 　]+${r.name}`, "m").test(text)))
      got = memoGive(r) || got;
    if (r.year && !m.years[r.name] && r.when?.some(w => text.includes(w))) {
      m.years[r.name] = true;
      addLog(`MEMO ${r.name} ${r.year}年`);
      addRow(r);
      got = true;
    }
  }
  if (got) {
    state.idle = 0; // 進んだので、行き詰まりの数え直し（logic.js の stuckHint）
    if (isMemoOpen()) renderMemo();
    else m.dot = true;
    memoButton();
  }
}
// 番号のタイルを届ける（1つの部署に1回だけ）
function memoGive(r) {
  const m = memoState(),
    key = `code:${r.name}`;
  if (m.given[key] || m.placed[`${r.name}:code`]) return false;
  m.given[key] = true;
  m.tiles.push({ k: "code", v: r.code, id: m.next++ });
  if (!m.rows.includes(r.name)) m.rows.push(r.name);
  addLog(`MEMO ＋ ${r.code}`);
  return true;
}

// ---------------- MEMO ボタン（右上。SOUND の隣） ----------------
function memoButton() {
  let b = $("memoBtn");
  if (!b) {
    b = document.createElement("button");
    b.id = "memoBtn";
    b.type = "button";
    b.textContent = "MEMO";
    b.setAttribute("aria-label", "部署コード表を開く");
    b.hidden = true;
    $("mute").after(b);
    b.addEventListener("click", e => {
      e.stopPropagation();
      if (isBusy() || !memoReady()) return;
      openMemo();
    });
  }
  const show = memoReady();
  b.hidden = !show;
  b.classList.toggle("new", show && !!state?.memo?.dot);
  if (!show && isMemoOpen()) closeMemo();
}

// ---------------- 画面 ----------------
function memoEl() {
  let el = $("memo");
  if (el) return el;
  el = document.createElement("div");
  el.id = "memo";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "部署コード表");
  el.innerHTML = `
    <div class="memo-box">
      <div class="memo-head">
        <h2>MEMO</h2><span class="memo-sub">部署コード表</span>
        <button type="button" class="memo-close">とじる</button>
      </div>
      <div class="memo-table"></div>
      <div class="memo-tray">
        <div class="memo-label">タイル<span>押してから、入れる欄を押す</span></div>
        <div class="memo-tiles"></div>
      </div>
      <div class="memo-voice"></div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", memoClick);
  el.addEventListener("input", e => {
    const n = e.target.dataset?.note;
    if (!n) return;
    e.target.value = e.target.value.normalize("NFKC").replace(/\D/g, "").slice(0, 4);
    memoState().notes[n] = e.target.value;
    // あの部屋の欄に番号を書きこんだら、その番号で探すように、師匠がひとこと（一度だけ）
    //   材料がそろってから（段階が try になったとき）だけ。それより前に、あてずっぽうで書いたときは何も言わない
    if (n === CH.memo.special.name && memoStage() === "try") memoSay(CH.memo.hints?.try, "hint:try");
  });
  // 書きこみ終えたら（欄から離れたら）、表をコード順に並べ直す
  el.addEventListener("change", e => {
    if (!e.target.dataset?.note) return;
    setTimeout(() => {
      const id = document.activeElement?.id;
      renderMemo();
      if (id) $(id)?.focus({ preventScroll: true });
    }, 0);
  });
  el.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") closeMemo();
    if (e.key === "Enter" && e.target.matches("input")) e.target.blur();
  });
  return el;
}
function openMemo() {
  const m = memoState(),
    first = CH.memo.first;
  m.dot = false;
  m.sel = null;
  $("memoBtn")?.classList.remove("spot");
  // はじめて開いたとき：説明に使う部署（人事部）の行と、番号のタイルを置いておく（任務1で見た番号）
  const r = first && !m.said.first && memoRow(first.name);
  if (r) {
    if (!m.rows.includes(r.name)) m.rows.push(r.name);
    memoGive(r);
  }
  SFX.select();
  memoEl().classList.add("on");
  renderMemo();
  memoButton();
  if (finePointer) memoEl().querySelector(".memo-close").focus({ preventScroll: true });
  if (r) return memoSay(first.say, "first");
  // 開くたびに、いまの段階で何を探せばいいかを、師匠がひとこと（段階が変わってから、はじめて開いたときだけ）
  const st = memoStage();
  if (st && CH.memo.hints?.[st]) memoSay(CH.memo.hints[st], `hint:${st}`);
}

// 推理の段階（MEMO を開いたときの、師匠のひとこと hints のどれを出すか）
//   open … まだ MEMO を開いていない ／ codes … 番号を集めている ／ rule … 番号がそろったので、決まりを外で調べる ／ when … あの部屋ができた年を探す
//   years … まわりの部署ができた年を探す ／ gone … あいだにできて、今はない部署を探す ／ order … できた順に並べて書きこむ
//   try … 書きこんだ番号で、社内を探す ／ null … 番号が分かった
function memoStage() {
  const conf = CH.memo,
    m = memoState();
  if (state.clues.includes(conf.special.clue)) return null;
  if (conf.first && !m.said.first) return "open"; // まだ MEMO を一度も開いていない
  const placed = conf.rows.filter(r => m.placed[`${r.name}:code`]).length;
  if (!state.clues.includes(conf.rule)) return placed < (conf.sortMin ?? 4) ? "codes" : "rule";
  if (!m.years[conf.special.name]) return "when";
  if (!(conf.around || []).every(n => m.years[n])) return "years";
  if (!(conf.former || []).every(r => m.years[r.name])) return "gone";
  if (!/^\d{4}$/.test(m.notes[conf.special.name] || "")) return "order";
  return "try";
}

// 三角数の並び（rule の手がかりが分かったら、表の番号のあいだに「空き番号」を出す）
const triBetween = (lo, hi) => {
  const out = [];
  for (let n = 1; ; n++) {
    const t = (n * (n + 1)) / 2;
    if (t >= hi) break;
    if (t > lo) out.push(t);
  }
  return out;
};
function closeMemo() {
  const el = $("memo");
  if (!el?.classList.contains("on")) return;
  el.classList.remove("on");
  if (state?.memo) state.memo.sel = null;
  SFX.select();
  focusCmd();
}

// 師匠のひとこと（memo の画面の下に、1行ずつ出す。端末のログにも残す）
let memoVoiceRun = 0;
async function memoSay(lines, key) {
  const m = memoState();
  if (!lines?.length) return;
  if (key) {
    if (m.said[key]) return;
    m.said[key] = true;
  }
  const run = ++memoVoiceRun;
  const v = memoEl().querySelector(".memo-voice");
  v.innerHTML = "";
  for (const [i, s] of lines.entries()) {
    if (i) await sleep(900);
    if (run !== memoVoiceRun) return; // 次のひとことが始まったら、前のは打ち切る
    printLine(s);
    v.insertAdjacentHTML("beforeend", `<p><span class="who">師匠</span>${esc(lineParts(s).text)}</p>`);
    pulse(v.lastElementChild, "speak", 900);
    SFX.radio();
  }
}

function renderMemo(landed) {
  const conf = CH.memo,
    m = memoState(),
    el = memoEl();
  const sel = m.tiles.find(t => t.id === m.sel);
  const special = conf.special;
  const confirmed = state.clues.includes(special.clue);
  // 並びは、コードの小さい順。分かっていない行は、見つけた順で下に（特別プロジェクト室は、いちばん下）
  const codeOf = r => {
    if (r.code && !r.special && !r.former && m.placed[`${r.name}:code`]) return +r.code;
    if (r.special && confirmed) return +r.code;
    const n = m.notes[r.name];
    return /^\d{4}$/.test(n || "") ? +n : r.special ? 2e9 : 1e9;
  };
  const list = [...m.rows.filter(n => n !== special.name), special.name]
    .map(memoRow)
    .filter(Boolean)
    .map((r, i) => ({ r, i, c: codeOf(r) }))
    .sort((a, b) => a.c - b.c || a.i - b.i)
    .map(x => x.r);

  // 決まり（三角数）が分かったら、分かっている番号のあいだに、まだ埋まっていない番号を「空き」として出す
  const rule = state.clues.includes(conf.rule);
  const used = new Set(list.map(codeOf).filter(c => c < 1e9));
  let prev = null;
  let html = `<div class="memo-row memo-th"><span>部署名</span><span>コード</span></div>`;
  for (const r of list) {
    const c = codeOf(r);
    if (rule && prev && c < 1e9) {
      const gaps = triBetween(prev, c).filter(t => !used.has(t));
      if (gaps.length) html += `<div class="memo-gap"><span>空き</span>${gaps.join("・")}</div>`;
    }
    if (c < 1e9) prev = c;
    const ck = `${r.name}:code`;
    let codeCell;
    if (r.special && confirmed) codeCell = `<span class="memo-slot confirmed">${r.code}</span>`;
    else if (r.special || r.former)
      codeCell = `<input class="memo-slot note${r.former ? " former" : ""}" id="memo-note-${esc(r.name)}" data-note="${esc(r.name)}" inputmode="numeric" maxlength="4" placeholder="????" autocomplete="off" value="${esc(m.notes[r.name] || "")}" aria-label="${esc(r.name)}のコード">`;
    else if (m.placed[ck]) codeCell = `<span class="memo-slot filled${landed === ck ? " land" : ""}">${r.code}</span>`;
    else
      codeCell = `<button type="button" class="memo-slot${sel ? " target" : ""}" data-slot="${esc(ck)}" aria-label="${esc(r.name)}のコード">????</button>`;
    // 部署名の下：できた年（分かったら）と、今はない部署の行方
    const sub = [m.years[r.name] && `${r.year}年にできた`, r.note].filter(Boolean).join("・");
    const note = sub ? `<small>${esc(sub)}</small>` : "";
    html += `<div class="memo-row${r.special ? " special" : ""}"><span class="memo-name">${esc(r.name)}${note}</span>${codeCell}</div>`;
  }
  el.querySelector(".memo-table").innerHTML = html;

  const order = [...m.tiles].sort((a, b) => +a.v - +b.v);
  el.querySelector(".memo-tiles").innerHTML = order.length
    ? order
        .map(
          t =>
            `<button type="button" class="memo-tile" data-tile="${t.id}" aria-pressed="${m.sel === t.id}">${esc(String(t.v))}</button>`,
        )
        .join("")
    : `<span class="memo-empty">画面に新しい番号が出ると、ここに届く。</span>`;
}

function memoClick(e) {
  const m = memoState();
  if (e.target.closest(".memo-close")) return closeMemo();
  const tile = e.target.closest("[data-tile]");
  if (tile) {
    const id = +tile.dataset.tile;
    m.sel = m.sel === id ? null : id;
    SFX.tick();
    return renderMemo();
  }
  const slot = e.target.closest("button[data-slot]");
  if (slot) return memoPlace(slot);
}
function memoPlace(slot) {
  const m = memoState(),
    conf = CH.memo;
  const t = m.tiles.find(x => x.id === m.sel);
  if (!t) return;
  const [name] = slot.dataset.slot.split(":");
  const r = memoRow(name);
  if (r.code !== t.v) {
    pulse(slot, "shake", 400);
    SFX.tick();
    memoSay(conf.wrongSay, "wrong");
    return;
  }
  m.placed[slot.dataset.slot] = true;
  state.idle = 0;
  m.tiles = m.tiles.filter(x => x.id !== t.id);
  m.sel = null;
  SFX.select();
  addLog(`MEMO ${name} ${t.v}`);
  renderMemo(slot.dataset.slot);
  // はじめの説明の部署を埋めたら、師匠がほめて続きを言う
  const praised = name === conf.first?.name;
  if (praised) memoSay(conf.first.done, "firstDone");
  // 番号が sortMin 個そろったら、間が広がっていくのに師匠が気づく（表は、いつもコード順）
  const codes = conf.rows.filter(x => m.placed[`${x.name}:code`]).length;
  if (codes >= (conf.sortMin ?? 4) && !m.said.sort) {
    m.said["hint:rule"] = true; // 次に開いたとき、同じ話（外で調べろ）をくり返さない
    setTimeout(() => memoSay(conf.sortSay, "sort"), praised ? 2400 : 700);
  }
}

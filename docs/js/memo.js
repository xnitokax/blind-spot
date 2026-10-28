// =========================================================
//  memo：任務2の部署コード表（上の MEMO ボタンで開く画面）
//    画面に部署名が出ると、表に行が増える
//    「dept:〇〇〇〇」が出ると番号のタイル、部署ができた年が分かる文が出ると年のタイルが届く
//    タイルを押して、入れる欄を押すと入る（まちがった欄だと、はね返る）
//    特別プロジェクト室と、今はない部署の番号は、自分で打ちこむ（合っているかは教えない）
//    特別プロジェクト室の番号は、1770 で検索して当たったら（special.clue）確定する
//  台本の書き方は src/scenario.js の m2.memo
// =========================================================

const memoState = () =>
  (state.memo ||= { rows: [], tiles: [], given: {}, placed: {}, notes: {}, sort: "seen", said: {}, dot: false, next: 1 });
const memoRows = () => [
  ...CH.memo.rows,
  ...(CH.memo.former || []).map(r => ({ ...r, former: true })),
  { ...CH.memo.special, special: true },
];
const memoRow = name => memoRows().find(r => r.name === name);
// MEMO ボタンを出すのは、memo の目標（from 番目）が始まってから
const memoReady = () => !!(CH?.memo && state && !state.over && state.objIdx >= (CH.memo.from ?? 0));
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
  const addTile = (k, r, v) => {
    const key = `${k}:${r.name}`;
    if (m.given[key]) return;
    m.given[key] = true;
    m.tiles.push({ k, v, id: m.next++ });
    addLog(`MEMO ＋ ${v}${k === "year" ? "（できた年）" : ""}`);
    addRow(r);
    got = true;
  };
  for (const r of memoRows()) {
    if (text.includes(r.name)) addRow(r);
    if (r.code && !r.special && text.includes(`dept:${r.code}`)) addTile("code", r, r.code);
    if (r.year && r.when?.some(w => text.includes(w))) addTile("year", r, r.year);
  }
  if (got) {
    if (isMemoOpen()) renderMemo();
    else m.dot = true;
    memoButton();
  }
}

// ---------------- MEMO ボタン（BGM の隣） ----------------
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
      <div class="memo-sorts" role="group" aria-label="並べ方">
        <button type="button" data-sort="seen">見つけた順</button>
        <button type="button" data-sort="year">できた順</button>
        <button type="button" data-sort="code">コード順</button>
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
  });
  el.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") closeMemo();
    if (e.key === "Enter" && e.target.matches("input")) e.target.blur();
  });
  return el;
}
function openMemo() {
  const m = memoState();
  m.dot = false;
  m.sel = null;
  SFX.select();
  memoEl().classList.add("on");
  renderMemo();
  memoButton();
  if (finePointer) memoEl().querySelector(".memo-close").focus({ preventScroll: true });
}
function closeMemo() {
  const el = $("memo");
  if (!el?.classList.contains("on")) return;
  el.classList.remove("on");
  if (state?.memo) state.memo.sel = null;
  SFX.select();
  focusCmd();
}

// 師匠のひとこと（memo の画面の下に出す。端末のログにも残す）
function memoSay(lines, key) {
  const m = memoState();
  if (!lines?.length) return;
  if (key) {
    if (m.said[key]) return;
    m.said[key] = true;
  }
  for (const s of lines) printLine(s);
  const v = memoEl().querySelector(".memo-voice");
  v.innerHTML = lines.map(s => `<p><span class="who">師匠</span>${esc(lineParts(s).text)}</p>`).join("");
  pulse(v, "speak", 900);
  SFX.radio();
}

function renderMemo(landed) {
  const conf = CH.memo,
    m = memoState(),
    el = memoEl();
  const sel = m.tiles.find(t => t.id === m.sel);
  const special = conf.special;
  const confirmed = state.clues.includes(special.clue);
  const names = [...m.rows.filter(n => n !== special.name), special.name];
  const list = names.map(memoRow).filter(Boolean);
  const yearOf = r => (m.placed[`${r.name}:year`] ? r.year : 1e9);
  const codeOf = r => {
    if (r.code && !r.special && m.placed[`${r.name}:code`]) return +r.code;
    if (r.special && confirmed) return +r.code;
    const n = m.notes[r.name];
    return /^\d{4}$/.test(n || "") ? +n : 1e9;
  };
  if (m.sort === "year") list.sort((a, b) => yearOf(a) - yearOf(b));
  if (m.sort === "code") list.sort((a, b) => codeOf(a) - codeOf(b));

  let html = `<div class="memo-row memo-th"><span>部署名</span><span>できた年</span><span>コード</span></div>`;
  for (const r of list) {
    const yk = `${r.name}:year`,
      ck = `${r.name}:code`;
    const land = k => (landed === k ? " land" : "");
    const yearCell = !r.year
      ? `<span class="memo-slot none">—</span>`
      : m.placed[yk]
        ? `<span class="memo-slot filled year${land(yk)}">${r.year}</span>`
        : `<button type="button" class="memo-slot${sel?.k === "year" ? " target" : ""}" data-slot="${esc(yk)}" aria-label="${esc(r.name)}のできた年">????</button>`;
    let codeCell;
    if (r.special && confirmed) codeCell = `<span class="memo-slot confirmed">${r.code}</span>`;
    else if (r.special || r.former)
      codeCell = `<input class="memo-slot note${r.former ? " former" : ""}" id="memo-note-${esc(r.name)}" data-note="${esc(r.name)}" inputmode="numeric" maxlength="4" placeholder="????" autocomplete="off" value="${esc(m.notes[r.name] || "")}" aria-label="${esc(r.name)}のコード">`;
    else if (m.placed[ck]) codeCell = `<span class="memo-slot filled${land(ck)}">${r.code}</span>`;
    else
      codeCell = `<button type="button" class="memo-slot${sel?.k === "code" ? " target" : ""}" data-slot="${esc(ck)}" aria-label="${esc(r.name)}のコード">????</button>`;
    const note = r.note ? `<small>${esc(r.note)}</small>` : "";
    html += `<div class="memo-row${r.special ? " special" : ""}"><span class="memo-name">${esc(r.name)}${note}</span>${yearCell}${codeCell}</div>`;
  }
  el.querySelector(".memo-table").innerHTML = html;

  const order = [...m.tiles].sort((a, b) => (a.k === b.k ? +a.v - +b.v : a.k === "code" ? -1 : 1));
  el.querySelector(".memo-tiles").innerHTML = order.length
    ? order
        .map(
          t =>
            `<button type="button" class="memo-tile ${t.k}" data-tile="${t.id}" aria-pressed="${m.sel === t.id}"><span class="k">${t.k === "code" ? "番号" : "年"}</span>${esc(String(t.v))}</button>`,
        )
        .join("")
    : `<span class="memo-empty">画面に新しい番号や年が出ると、ここに届く。</span>`;
  el.querySelectorAll("[data-sort]").forEach(b => b.setAttribute("aria-pressed", b.dataset.sort === m.sort));
}

function memoClick(e) {
  const m = memoState(),
    conf = CH.memo;
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
  const s = e.target.closest("[data-sort]");
  if (s) {
    m.sort = s.dataset.sort;
    SFX.select();
    renderMemo();
    // コード順に並べたら、間が広がっていくのに師匠が気づく（番号が sortMin 個以上そろっていたら）
    const codes = conf.rows.filter(r => m.placed[`${r.name}:code`]).length;
    if (m.sort === "code" && codes >= (conf.sortMin ?? 4)) memoSay(conf.sortSay, "sort");
  }
}
function memoPlace(slot) {
  const m = memoState(),
    conf = CH.memo;
  const t = m.tiles.find(x => x.id === m.sel);
  if (!t) return;
  const [name, kind] = slot.dataset.slot.split(":");
  if (kind !== t.k) return;
  const r = memoRow(name);
  const ok = kind === "year" ? r.year === t.v : r.code === t.v;
  if (!ok) {
    pulse(slot, "shake", 400);
    SFX.tick();
    memoSay(kind === "year" ? conf.wrongYearSay : conf.wrongSay, `wrong:${kind}`);
    return;
  }
  m.placed[slot.dataset.slot] = true;
  m.tiles = m.tiles.filter(x => x.id !== t.id);
  m.sel = null;
  SFX.select();
  addLog(`MEMO ${name} ${t.v}`);
  renderMemo(slot.dataset.slot);
}

// =========================================================
//  memo：任務2の部署コード表（右上の MEMO ボタンで開く画面）
//    師匠が急ピッチで作った、ただのメモ帳（設定メモ.md の「裏設定」）。正しいかどうかは判定しない
//    ボタンは、師匠が「右上に追加しておいた」と言うのに合わせて出る（台本の { set: { memo: true } }）
//    はじめて開くと、師匠が使い方を教える：人事DBで朝比奈を探させて、人事部の番号（dept:1128）を見つけさせる
//      見つけたら「MEMO に追加した。今まで出てきたものも、俺がメモしてた」。そのあと、タイルを表に入れさせる
//    画面に部署名が出ると、表に行が増える。「dept:〇〇〇〇」が出ると番号のタイルが届き、師匠が「MEMO に追加した」と言う
//      （MEMO を開く前に出てきたものは、黙って溜めておく）
//    部署ができた年が分かる文が出ると、部署名の下に書きこまれる（書いてあったことだけ。決めつけない）
//    タイルを押して、欄を押すと入る（どの欄にでも入る。入れた欄をもう一度押すと、タイルに戻る）
//    表は、いつもコードの小さい順（分かっていない行は下）
//    特別プロジェクト室と、今はない部署の番号は、自分で打ちこむ（合っているかは教えない）
//      あの部屋の欄に初めて番号を書くと、外に送っていないのに逆探知が上がる（見張られている伏線。1回だけ。これで負けにはしない）
//    特別プロジェクト室の番号は、1770 で検索して当たったら（special.clue）確定する
//  台本の書き方は src/scenario.js の m2.memo
// =========================================================

const memoState = () =>
  (state.memo ||= {
    rows: [],
    tiles: [],
    given: {},
    placed: {}, // { "人事部:code": "1128" } … その欄に入れたタイルの番号（正しいかどうかは見ない）
    notes: {},
    years: {},
    said: {},
    fresh: [], // MEMO を開いてから届いた番号（コマンドのあとに、師匠が「MEMO に追加した」と言う）
    dot: false,
    next: 1,
  });
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
    text = el.textContent,
    first = CH.memo.first;
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
    const hasCode =
      r.code && !r.special && (text.includes(`dept:${r.code}`) || new RegExp(`(^|\\D)${r.code}[ 　]+${r.name}`, "m").test(text));
    if (hasCode) {
      got = memoGive(r) || got;
      // はじめての説明で探させている番号（朝比奈の人事部）が出た
      if (m.wait && first && r.name === first.name) m.found = true;
    }
    if (r.year && !m.years[r.name] && r.when?.some(w => text.includes(w))) {
      m.years[r.name] = true;
      addLog(`MEMO ${r.name} ${r.year}`);
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
  if (m.given[key]) return false;
  m.given[key] = true;
  m.tiles.push({ k: "code", v: r.code, id: m.next++ });
  if (!m.rows.includes(r.name)) m.rows.push(r.name);
  addLog(`MEMO ＋ ${r.code}`);
  // MEMO を開いて説明を聞いたあとなら、師匠が「MEMO に追加した」と言う（開く前のものは、黙って溜めておく）
  if (m.said.first) m.fresh.push(r.code);
  return true;
}

// コマンドのあと（input.js）：番号が届いていたら、師匠がひとこと
//   はじめての説明で探させていた番号が出たら、そのときだけ長めに（今までのメモの話をして、MEMO を開かせる）
async function memoAnnounce() {
  if (!CH?.memo || !state?.memo || state.over) return;
  const m = state.memo,
    first = CH.memo.first;
  if (m.wait && m.found) {
    m.wait = false;
    m.fresh = [];
    if (first?.got) await speak(first.got, BEAT.small);
    return;
  }
  if (!m.fresh.length) return;
  const codes = m.fresh.splice(0);
  const say = CH.memo.addSay || "[師匠] {codes}。MEMO に追加した。";
  await speak([say.replace("{codes}", codes.join("・"))], BEAT.small);
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
      <div class="memo-trace" aria-label="逆探知"><span>TRACE</span><i><b></b></i><span class="n"></span></div>
      <div class="memo-table"></div>
      <div class="memo-tray">
        <div class="memo-label">タイル<span>押してから、入れる欄を押す（入れた欄を押すと、もどる）</span></div>
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
    if (n !== CH.memo.special.name || !/^\d{4}$/.test(e.target.value)) return;
    // あの部屋の欄に、初めて番号を書いた：外に送っていないのに、逆探知が上がる（1回だけ）
    if (memoWatched()) return;
    // 材料がそろってから書いたときは、その番号で探すように、師匠がひとこと（一度だけ）
    if (memoStage() === "try") memoSay(CH.memo.hints?.try, "hint:try");
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

// 見張られている：あの部屋の欄に初めて番号を書くと、ローカルなのに逆探知が上がる（罰ではなく、誰かに覗かれている演出）
//   何を書いても同じ（正しいかどうかとは関係ない）。外から読まれたログが一瞬出る。これで 100% にはしない
function memoWatched() {
  const conf = CH.memo.watched,
    m = memoState();
  if (!conf || m.said.watched) return false;
  m.said.watched = true;
  const up = Math.max(0, Math.min(conf.trace ?? 5, 99 - state.trace));
  addLog(conf.log || "READ memo.local ← ???", "bad");
  SFX.alert();
  if (up) addTrace(up);
  memoTrace();
  const lines = (conf.say || [])
    .filter(s => up || !s.includes("{up}")) // 上げられなかったとき（99% のとき）は、「上がった」の行は言わない
    .map(s => s.replaceAll("{up}", String(up)).replaceAll("{trace}", `${Math.round(state.trace)}%`));
  setTimeout(() => memoSay(lines), 600);
  return true;
}

function openMemo() {
  const m = memoState(),
    first = CH.memo.first;
  m.dot = false;
  m.sel = null;
  $("memoBtn")?.classList.remove("spot");
  SFX.select();
  memoEl().classList.add("on");
  renderMemo();
  memoButton();
  if (finePointer) memoEl().querySelector(".memo-close").focus({ preventScroll: true });
  // はじめて開いたとき：師匠の声がここにも出ることを教えて（声の欄を光らせる）、人事部の番号を探させる
  if (first && !m.said.first) {
    m.wait = true;
    const v = memoEl().querySelector(".memo-voice");
    v.classList.add("spot");
    memoSay(first.say, "first").then(() => v.classList.remove("spot"));
    return;
  }
  // 開くたびに、いまの段階で何を探せばいいかを、師匠がひとこと（段階が変わってから、はじめて開いたときだけ）
  const st = memoStage();
  if (st && CH.memo.hints?.[st]) memoSay(CH.memo.hints[st], `hint:${st}`);
}

// 推理の段階（MEMO を開いたときの、師匠のひとこと hints のどれを出すか）
//   open … まだ MEMO を開いていない ／ asahina … 人事部の番号を探しに行っている ／ codes … 番号を集めている
//   rule … 番号がそろったので、決まりを外で調べる ／ place … 届いたタイルが残っている ／ when … あの部屋ができた年を探す
//   years … まわりの部署ができた年を探す ／ gone … あいだにできて、今はない部署を探す ／ order … できた順に並べて書きこむ
//   try … 書きこんだ番号で、社内を探す ／ null … 番号が分かった
function memoStage() {
  const conf = CH.memo,
    m = memoState();
  if (state.clues.includes(conf.special.clue)) return null;
  if (conf.first && !m.said.first) return "open";
  if (m.wait) return "asahina";
  const placed = conf.rows.filter(r => m.placed[`${r.name}:code`]).length;
  if (!state.clues.includes(conf.rule)) return placed < (conf.sortMin ?? 4) ? "codes" : "rule";
  if (m.tiles.length) return "place";
  if (!m.years[conf.special.name]) return "when";
  if (!(conf.around || []).every(n => m.years[n])) return "years";
  if (!(conf.former || []).every(r => m.years[r.name])) return "gone";
  if (!/^\d{4}$/.test(m.notes[conf.special.name] || "")) return "order";
  return "try";
}

function closeMemo() {
  const el = $("memo");
  if (!el?.classList.contains("on")) return;
  el.classList.remove("on");
  if (state?.memo) state.memo.sel = null;
  SFX.select();
  focusCmd();
}

// 師匠のひとこと（memo の画面の下に、いつもの画面と同じように1文字ずつ出す。端末のログにも残す）
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
    if (i) await sleep(REDUCED ? 300 : 1150); // 読み終えてから、次のセリフ（いつもの画面と同じ間）
    if (run !== memoVoiceRun) return; // 次のひとことが始まったら、前のは打ち切る
    printLine(s);
    const text = lineParts(s).text;
    v.insertAdjacentHTML("beforeend", `<p><span class="who">師匠</span><span class="t"></span></p>`);
    const t = v.lastElementChild.querySelector(".t");
    SFX.radio();
    if (REDUCED) {
      t.textContent = text;
      continue;
    }
    for (const ch of text) {
      if (run !== memoVoiceRun) return;
      t.textContent += ch;
      await sleep("。、…！？.,".includes(ch) ? 90 : 38);
    }
  }
}

// 右上の TRACE（MEMO を開いていても、逆探知が見えるように）
function memoTrace() {
  const el = $("memo");
  if (!el || !state) return;
  const t = Math.min(100, Math.round(state.trace));
  el.querySelector(".memo-trace b").style.width = `${t}%`;
  el.querySelector(".memo-trace .n").textContent = `${t}%`;
  el.querySelector(".memo-trace").classList.toggle("danger", t >= 70);
}

function renderMemo(landed) {
  const conf = CH.memo,
    m = memoState(),
    el = memoEl();
  memoTrace();
  const sel = m.tiles.find(t => t.id === m.sel);
  const special = conf.special;
  const confirmed = state.clues.includes(special.clue);
  // 並びは、コードの小さい順。分かっていない行は、見つけた順で下に（特別プロジェクト室は、いちばん下）
  const codeOf = r => {
    if (r.code && !r.special && !r.former && m.placed[`${r.name}:code`]) return +m.placed[`${r.name}:code`];
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

  let html = `<div class="memo-row memo-th"><span>部署名</span><span>コード</span></div>`;
  for (const r of list) {
    const ck = `${r.name}:code`;
    let codeCell;
    if (r.special && confirmed) codeCell = `<span class="memo-slot confirmed">${r.code}</span>`;
    else if (r.special || r.former)
      codeCell = `<input class="memo-slot note${r.former ? " former" : ""}" id="memo-note-${esc(r.name)}" data-note="${esc(r.name)}" inputmode="numeric" maxlength="4" placeholder="????" autocomplete="off" value="${esc(m.notes[r.name] || "")}" aria-label="${esc(r.name)}のコード">`;
    else if (m.placed[ck])
      codeCell = `<button type="button" class="memo-slot filled${landed === ck ? " land" : ""}" data-take="${esc(ck)}" aria-label="${esc(r.name)}の番号を、タイルにもどす">${esc(m.placed[ck])}</button>`;
    else
      codeCell = `<button type="button" class="memo-slot${sel ? " target" : ""}" data-slot="${esc(ck)}" aria-label="${esc(r.name)}のコード">????</button>`;
    // 部署名の下：できた年（分かったら。書いてあったことだけ）と、今はない部署の行方
    const sub = [m.years[r.name] && (r.yearNote || `${r.year}年にできた`), r.note].filter(Boolean).join("・");
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
  // 入れた欄を押すと、タイルにもどす（入れ間違えたら、入れ直せる）
  const take = e.target.closest("button[data-take]");
  if (take) {
    const k = take.dataset.take;
    m.tiles.push({ k: "code", v: m.placed[k], id: m.next++ });
    delete m.placed[k];
    SFX.tick();
    renderMemo();
  }
}
// タイルを欄に入れる（どの欄にでも入る。正しいかどうかは、MEMO には分からない）
function memoPlace(slot) {
  const m = memoState(),
    conf = CH.memo;
  const t = m.tiles.find(x => x.id === m.sel);
  if (!t) return;
  const [name] = slot.dataset.slot.split(":");
  m.placed[slot.dataset.slot] = t.v;
  state.idle = 0;
  m.tiles = m.tiles.filter(x => x.id !== t.id);
  m.sel = null;
  SFX.select();
  addLog(`MEMO ${name} ${t.v}`);
  renderMemo(slot.dataset.slot);
  // はじめの説明の部署：師匠は朝比奈の記録で番号を見ているので、ちがう番号なら気づく
  const first = conf.first;
  let talked = false;
  if (first && name === first.name && !m.said.firstDone) {
    const r = memoRow(first.name);
    if (t.v === r.code) memoSay(first.done, "firstDone");
    else memoSay(first.notThis, "firstNot");
    talked = true;
  }
  // 番号が sortMin 個そろったら、間の空き方に師匠が気づく（表は、いつもコード順）
  const codes = conf.rows.filter(x => m.placed[`${x.name}:code`]).length;
  if (codes >= (conf.sortMin ?? 4) && !m.said.sort) {
    m.said["hint:rule"] = true; // 次に開いたとき、同じ話（外で調べろ）をくり返さない
    setTimeout(() => memoSay(conf.sortSay, "sort"), talked ? 4500 : 700);
  }
}

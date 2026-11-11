// =========================================================
//  memo：任務2の部署コード表（右上の MEMO ボタンで開く画面）
//    師匠が急ピッチで作った、ただのメモ帳（設定メモ.md の「裏設定」）。正しいかどうかは判定しない
//    ボタンは、師匠が「右上に追加しておいた」と言うのに合わせて出る（台本の { set: { memo: true } }）
//    はじめて開くと、師匠が使い方を教える：人事DBで朝比奈を探させて、人事部の番号（dept:1128）を見つけさせる
//      見つけたら、師匠が「MEMO を開いて、書きこんでみてくれ」。人事部の欄に打ちこませる
//    画面に部署名が出ると、表に行が増える（新しい行が増えると、MEMO ボタンに点が灯る）
//    番号は、どの行も自分で打ちこむ（合っているかは教えない）
//    部署ができた年が分かる文が出ると、部署名の下に書きこまれる（書いてあったことだけ。決めつけない）
//    表は、書きこみ終えるたびにコードの小さい順に並び直す（書いていない行は下）
//    あの部屋の欄に初めて番号を書くと、外に送っていないのに逆探知が上がる（見張られている伏線。1回だけ。これで負けにはしない）
//    特別プロジェクト室の番号は、1770 で検索して当たったら（special.clue）確定する
//  台本の書き方は src/scenario.js の m2.memo
// =========================================================

const memoState = () =>
  (state.memo ||= {
    rows: [],
    notes: {}, // { "人事部": "1128" } … その行に打ちこんだ番号（正しいかどうかは見ない）
    years: {},
    said: {},
    dot: false,
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
const isCode = s => /^\d{4}$/.test(s || "");

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
    // はじめての説明で探させている番号（朝比奈の人事部「dept:1128」）が出た
    if (m.wait && first && r.name === first.name && text.includes(`dept:${r.code}`)) m.found = true;
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

// コマンドのあと（input.js）：はじめての説明で探させていた番号が出たら、師匠が MEMO を開かせる
async function memoAnnounce() {
  if (!CH?.memo || !state?.memo || state.over) return;
  const m = state.memo,
    first = CH.memo.first;
  if (!(m.wait && m.found)) return;
  m.wait = false;
  state.flags.memoAsk = false;
  if (first?.got) await speak(first.got, BEAT.small);
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
      <div class="memo-voice"></div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => {
    if (e.target.closest(".memo-close")) closeMemo();
  });
  el.addEventListener("input", e => {
    const n = e.target.dataset?.note;
    if (!n) return;
    e.target.value = e.target.value.normalize("NFKC").replace(/\D/g, "").slice(0, 4);
    memoState().notes[n] = e.target.value;
    if (isCode(e.target.value)) memoWrote(n, e.target.value);
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

// 4桁を書きこんだとき（どの行も、正しいかどうかは MEMO には分からない）
function memoWrote(name, v) {
  const m = memoState(),
    conf = CH.memo;
  state.idle = 0;
  addLog(`MEMO ${name} ${v}`);
  // あの部屋の欄に、初めて番号を書いた：外に送っていないのに、逆探知が上がる（1回だけ）
  if (name === conf.special.name) {
    if (memoWatched()) return;
    // 材料がそろってから書いたときは、その番号で探すように、師匠がひとこと（一度だけ）
    if (memoStage() === "try") memoSay(conf.hints?.try, "hint:try");
    return;
  }
  // はじめの説明の部署：師匠は朝比奈の記録で番号を見ているので、ちがう番号なら気づく
  const first = conf.first;
  let talked = false;
  if (first && name === first.name && !m.said.firstDone) {
    if (v === memoRow(first.name).code) memoSay(first.done, "firstDone");
    else memoSay(first.notThis, "firstNot");
    talked = true;
  }
  // 番号が sortMin 個書きこまれたら、間の空き方に師匠が気づく（表は、書くたびにコード順）
  const codes = conf.rows.filter(r => isCode(m.notes[r.name])).length;
  if (codes >= (conf.sortMin ?? 4) && !m.said.sort) {
    m.said["hint:rule"] = true; // 次に開いたとき、同じ話（外で調べろ）をくり返さない
    setTimeout(() => memoSay(conf.sortSay, "sort"), talked ? 4500 : 700);
  }
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
  $("memoBtn")?.classList.remove("spot");
  SFX.select();
  memoEl().classList.add("on");
  renderMemo();
  memoButton();
  if (finePointer) memoEl().querySelector(".memo-close").focus({ preventScroll: true });
  // はじめて開いたとき：師匠の声がここにも出ることを教えて（声の欄を光らせる）、人事部の番号を探させる
  if (first && !m.said.first) {
    m.wait = true;
    state.flags.memoAsk = true; // 師匠に言われて探しているあいだ（人事DBの朝比奈の小ネタは言わない）
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
//   rule … 番号がそろったので、決まりを外で調べる ／ when … あの部屋ができた年を探す
//   years … まわりの部署ができた年を探す ／ gone … あいだにできて、今はない部署を探す ／ order … できた順に並べて書きこむ
//   try … 書きこんだ番号で、社内を探す ／ null … 番号が分かった
function memoStage() {
  const conf = CH.memo,
    m = memoState();
  if (state.clues.includes(conf.special.clue)) return null;
  if (conf.first && !m.said.first) return "open";
  if (m.wait) return "asahina";
  const codes = conf.rows.filter(r => isCode(m.notes[r.name])).length;
  if (!state.clues.includes(conf.rule)) return codes < (conf.sortMin ?? 4) ? "codes" : "rule";
  if (!m.years[conf.special.name]) return "when";
  if (!(conf.around || []).every(n => m.years[n])) return "years";
  if (!(conf.former || []).every(r => m.years[r.name])) return "gone";
  if (!isCode(m.notes[conf.special.name])) return "order";
  return "try";
}

function closeMemo() {
  const el = $("memo");
  if (!el?.classList.contains("on")) return;
  el.classList.remove("on");
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
      v.scrollTop = v.scrollHeight;
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

function renderMemo() {
  const conf = CH.memo,
    m = memoState(),
    el = memoEl();
  memoTrace();
  const special = conf.special;
  const confirmed = state.clues.includes(special.clue);
  // 並びは、書きこんだコードの小さい順。書いていない行は、見つけた順で下に（特別プロジェクト室は、いちばん下）
  const codeOf = r => {
    if (r.special && confirmed) return +r.code;
    const n = m.notes[r.name];
    return isCode(n) ? +n : r.special ? 2e9 : 1e9;
  };
  const list = [...m.rows.filter(n => n !== special.name), special.name]
    .map(memoRow)
    .filter(Boolean)
    .map((r, i) => ({ r, i, c: codeOf(r) }))
    .sort((a, b) => a.c - b.c || a.i - b.i)
    .map(x => x.r);

  let html = `<div class="memo-row memo-th"><span>部署名</span><span>コード</span></div>`;
  for (const r of list) {
    const codeCell =
      r.special && confirmed
        ? `<span class="memo-slot confirmed">${r.code}</span>`
        : `<input class="memo-slot note" id="memo-note-${esc(r.name)}" data-note="${esc(r.name)}" inputmode="numeric" maxlength="4" placeholder="????" autocomplete="off" value="${esc(m.notes[r.name] || "")}" aria-label="${esc(r.name)}のコード">`;
    // 部署名の下：できた年（分かったら。書いてあったことだけ）と、今はない部署の行方
    const sub = [m.years[r.name] && (r.yearNote || `${r.year}年にできた`), r.note].filter(Boolean).join("・");
    const note = sub ? `<small>${esc(sub)}</small>` : "";
    html += `<div class="memo-row${r.special ? " special" : ""}"><span class="memo-name">${esc(r.name)}${note}</span>${codeCell}</div>`;
  }
  el.querySelector(".memo-table").innerHTML = html;
}

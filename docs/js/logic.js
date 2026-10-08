// =========================================================
//  演算
//  手がかりと目標の判定・検索（言葉のゆれ・件数・並べ方）
// =========================================================

// ---------------- 手がかり ----------------
function countClues(ch) {
  if (ch.clueTotal != null) return ch.clueTotal;
  let n = 0;
  for (const node of Object.values(ch.nodes)) {
    if (node.clue) n++;
    n += (node.search?.entries || []).filter(e => e.clue).length;
    n += (node.dir || []).filter(d => d.clue).length;
    n += Object.values(node.actions || {})
      .flatMap(a => a.script || [])
      .filter(x => x?.clue).length;
  }
  return n;
}
// ---------------- 目標（objectives） ----------------
// 任務の中の小さな目標を、上から順に1つずつ進める（書き方は src/scenario.js の先頭を参照）
const mainObjs = () => (CH?.objectives || []).filter(o => !o.side);
const sideObjs = () => (CH?.objectives || []).filter(o => o.side);
const nowObj = () => mainObjs()[state.objIdx] || null;
const objCount = o => (o.clues || []).filter(c => state.clues.includes(c)).length;
// その手がかりが、どの目標のものか（今の目標・済んだ目標・気になること のうち、見えているものだけ）
function objOf(label) {
  return (
    [...mainObjs().slice(0, state.objIdx + 1), ...sideObjs()].find(o =>
      (o.clues || []).includes(label),
    ) || null
  );
}
function objDone(o) {
  const u = o.until || {};
  if (u.opened) return state.opened.has(u.opened);
  if (u.visited) return state.visited.has(u.visited);
  if (u.clue) return state.clues.includes(u.clue);
  return false; // goal は任務完了のときに済ませる
}

function updateClueCount() {
  const o = nowObj();
  const total = CH ? countClues(CH) : 0;
  $("eviCount").textContent =
    CH?.objectives?.length && !state.objShown
      ? ""
      : o?.clues?.length
        ? `${objCount(o)}/${o.clues.length}`
        : total
          ? `${state.clues.length}/${total}`
          : "";
  renderObjectives();
}

// 右の欄：CASE（全体の目標）→ MISSION（任務の目的）→ 済んだ目標 → ▶ 今の目標と、その手がかり → 気になること
function renderObjectives(fresh) {
  const li = (cls, html, clue) =>
    `<li class="${cls}"${clue ? ` data-clue="${esc(clue)}" title="押すと、見つけた場所へ飛ぶ"` : ""}>${html}</li>`;
  const box = $("evi");
  // 見つけた手がかりだけを並べる（まだの分を「？？？」で先に見せることはしない）
  const clueItems = o =>
    (o.clues || [])
      .filter(c => state.clues.includes(c))
      .map(c => li(`o-clue jump${c === fresh ? " new" : ""}`, `◆ ${esc(c)}`, c))
      .join("");
  let html = "";
  if (S.caseGoal && CH?.objective) html += li("o-sec", "CASE") + li("o-case", esc(S.caseGoal));
  if (CH?.objective) html += li("o-sec", "MISSION") + li("o-mission", esc(CH.objective));
  if (!CH?.objectives?.length) {
    // 目標のない任務（エピローグなど）は、手がかりを新しい順に並べるだけ
    if (state.clues.length)
      html +=
        li("o-sec", "EVIDENCE") +
        [...state.clues]
          .reverse()
          .map(c => li(c === fresh ? "new" : "", esc(c)))
          .join("");
    box.innerHTML = html;
    return;
  }
  // 最初の目標のカードがターミナルに出るまでは、右の欄にも目標を出さない
  if (!state.objShown) {
    box.innerHTML = html;
    return;
  }
  const mains = mainObjs();
  html += li("o-sec", "OBJECTIVE");
  mains.slice(0, state.objIdx).forEach(o => {
    html += li(
      "o-done",
      `${o.clues?.length ? `<span class="o-n">${objCount(o)}/${o.clues.length}</span>` : ""}${esc(o.text)}`,
    );
  });
  const o = nowObj();
  if (o) {
    html += li(
      "o-now",
      `${o.clues?.length ? `<span class="o-n">${objCount(o)}/${o.clues.length}</span>` : ""}${esc(o.text)}`,
    );
    html += clueItems(o);
  } else if (state.saveReady) {
    // 調べ終わったら、最後の目標として return を案内する
    html += li("o-now", "「return」で成果を持って帰る");
  }
  // 見つけてはいるが、まだ出ていない目標の手がかり
  const shown = new Set(
    [...mains.slice(0, state.objIdx + 1), ...sideObjs()].flatMap(x => x.clues || []),
  );
  const extra = state.clues.filter(c => !shown.has(c));
  if (extra.length)
    html +=
      li("o-sec", "MEMO") +
      extra.map(c => li(`o-clue jump${c === fresh ? " new" : ""}`, `◆ ${esc(c)}`, c)).join("");
  for (const s of sideObjs()) {
    if (!objCount(s)) continue; // ひとつも見つけていない「気になること」は、まだ出さない
    html +=
      li(
        "o-sec o-side",
        `<span class="o-n">${objCount(s)}/${s.clues.length}</span>？ ${esc(s.text)}`,
      ) + clueItems(s);
  }
  box.innerHTML = html;
}

const eviTipShown = () => {
  if (state.eviTipDone) return true;
  try {
    return localStorage.getItem("uzu-evi-tip") === "1";
  } catch {
    return false;
  }
};

// 目標が済んでいたら「OBJECTIVE CLEAR」→ 次の目標を出す（いくつか続けて済むこともある）
async function checkObjectives() {
  // 初めて手がかりを見つけたら、どこにまとめてあるかを師匠が教える（この端末で一度だけ）
  //   スマホでは手がかりの欄が画面の上にたたまれていて、気づきにくいので
  if (state.clues.length && !eviTipShown()) {
    state.eviTipDone = true;
    try {
      localStorage.setItem("uzu-evi-tip", "1");
    } catch {}
    if (CH.practice) return checkObjectives(); // 練習では、師匠が台本の中でくわしく説明する
    const phone = matchMedia("(max-width: 800px)").matches;
    await speak(
      phone
        ? [
            "[師匠] 見つけた手がかりは、画面の上の欄にまとめておいた。",
            "[師匠] 押すと開く。手がかりを押せば、見つけた場所に飛べるぞ。",
          ]
        : [
            "[師匠] 見つけた手がかりは、右の欄にまとめておいた。",
            "[師匠] 手がかりを押せば、見つけた場所に飛べるぞ。",
          ],
      BEAT.react,
    );
  }
  // 今の目標の手がかりが全部そろったら、師匠が次にやることを案内する（一度だけ）
  const cur = nowObj();
  if (
    cur?.ready &&
    cur.clues?.length &&
    !objDone(cur) &&
    cur.clues.every(c => state.clues.includes(c))
  ) {
    const k = `ready:${cur.text}`;
    if (!state.said.has(k)) {
      state.said.add(k);
      await speak(cur.ready, BEAT.react);
    }
  }
  let cleared = false;
  while (nowObj() && objDone(nowObj())) {
    const o = nowObj();
    state.objIdx++;
    await pause(cleared ? 400 : 700);
    cleared = true;
    SFX.objective();
    const card = print(
      `<div class="obj-card clear"><span class="o-tag">OBJECTIVE CLEAR</span><span class="o-text">${esc(o.text)}</span></div>`,
    );
    addLog(`CLEAR  ${o.text}`);
    updateClueCount();
    // 達成した目標を噛みしめる間（カードがもう一度光ってから、次へ）
    await pause(900);
    card.querySelector(".obj-card").classList.add("landed");
    await pause(1300);
  }
  if (cleared && nowObj()) {
    showObjective(nowObj());
    await pause(1500);
    // 新しい目標の案内（どこを探すか）
    if (nowObj().intro) await speak(nowObj().intro, BEAT.small);
    setGuide(nowObj().next, nowObj().intro);
  }
}
function showObjective(o, tag = "NEXT OBJECTIVE") {
  if (!o) return;
  SFX.select();
  decode(
    print(
      `<div class="obj-card next"><span class="o-tag">${tag}</span><span class="o-text">${esc(o.text)}</span></div>`,
    ),
    400,
  );
}

// 手がかりを記録する。カードが光って現れ、文字が解読されてから、しばらく余韻を残す（呼ぶ側は await する）
async function addClue(label, opt = {}) {
  if (!label || state.clues.includes(label)) return;
  state.clues.push(label);
  updateClueCount();
  renderObjectives(label);
  if (opt.quiet) return;
  // カードの数字は「その目標の手がかり n / N」（目標のない手がかりは任務全体の数）
  const o = objOf(label),
    total = countClues(CH);
  const n = o
    ? `${esc(o.text)}　${objCount(o)} / ${o.clues.length}`
    : total
      ? `${state.clues.length} / ${total}`
      : "";
  await pause(250);
  const card = print(
    `<div class="evi-card" data-clue="${esc(label)}"><span class="evi-tag">EVIDENCE</span><span class="evi-label">${esc(label)}</span>` +
      (n ? `<span class="evi-n">${n}</span>` : "") +
      `</div>`,
    "evidence",
  ).querySelector(".evi-card");
  SFX.evidence();
  await decode(card.querySelector(".evi-label"), 650);
  card.classList.add("landed");
  await pause(1500);
}

// ---------------- 検索 ----------------
// 検索用に文字をそろえる：全角・半角、大文字・小文字、ひらがな・カタカナ、長音（ー）のあるなしを区別しない
// （「ゆーざーID」「ユーザID」でも「ユーザーID」が見つかる）
const fold = s =>
  lower(s)
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/ー/g, "");

function searchText(e) {
  if (!e._text) {
    const box = document.createElement("div");
    box.innerHTML = e.html;
    box.querySelectorAll(".nosearch").forEach(el => el.remove());
    // 空白は取りのぞいて比べる（「朝比奈さつき」と続けて打っても「朝比奈 さつき」が見つかるように）
    e._text = fold(box.textContent + " " + (e.keys || "")).replace(/\s+/g, "");
  }
  return e._text;
}

// 言いかえ（aliases）：「userid」→「ユーザーID」のように、同じ意味の言葉を1つにまとめる
function unalias(conf, s) {
  const k = fold(s).replace(/\s+/g, "");
  for (const [canon, list] of Object.entries(conf.aliases || {})) {
    if ([canon, ...list].some(a => fold(a).replace(/\s+/g, "") === k)) return canon;
  }
  return s;
}

async function search(arg) {
  const node = here();
  if (!node.search) {
    print("search: ここには検索できるものがありません。", "dim");
    return oops("noSearch", [
      "[師匠] ここには、検索できるものがないな。",
      "[師匠] search が使えるのは、日報みたいに検索の案内が出ている場所だけだ。",
    ]);
  }
  const q = arg.trim();
  const conf = node.search,
    limit = conf.limit ?? 3;
  // 師匠のハンドルネームで検索すると、検索はせずに師匠がツッコむ
  if (S.author?.handle && q && fold(q).replace(/\s+/g, "") === fold(S.author.handle)) {
    // 外の検索サイト（fanPage のある検索）では、謎のファンページが見つかる
    if (conf.fanPage) return fanPage();
    return speak(
      ["[師匠] それ俺じゃねーか。", "[師匠] ──おい、なんで俺のハンドルネーム知ってるんだ？"],
      BEAT.small,
    );
  }
  // 全体が言いかえに当たればそれを、当たらなければ言葉ごとに言いかえる
  const terms = fold(unalias(conf, q))
    .split(/\s+/)
    .filter(Boolean)
    .map(t => fold(unalias(conf, t)).replace(/\s+/g, ""))
    .filter(Boolean);
  if (!terms.length)
    return print("使い方：search &lt;言葉&gt;（スペースで区切ると条件を重ねられます）", "dim");

  // need … その flag が立っているときだけ見つかる結果（任務2：権限を上げたあとにだけ見える、隠されたデータ）
  const hits = conf.entries.filter(
    e => (!e.need || state.flags[e.need]) && terms.every(t => searchText(e).includes(t)),
  );
  const shown = hits.slice(0, limit);
  state.minutes += 1;
  updateClock();
  addLog(`QUERY "${q}" @${shortHost(node.host)}`);

  await busy(async () => {
    // 検索中の演出：件数が回っていく
    const total = conf.records ?? 10000,
      frames = 14;
    const line = print("", "dim scan");
    // stream：ログが高速で流れていく（変更ログなど。ハッキングしている手ざわり）
    const flow = conf.stream ? print("", "dim scan flow") : null;
    for (let f = 1; f <= frames; f++) {
      line.textContent = `scanning [${"▮".repeat(f)}${"·".repeat(frames - f)}] ${Math.round((total * f) / frames).toLocaleString()} records`;
      if (flow) flow.textContent = [fakeLogLine(), fakeLogLine(), fakeLogLine()].join("\n");
      SFX.tick();
      await wait(32);
    }
    flow?.remove();
    await showResults(conf, q, terms, hits, shown, limit);
  });
}

// 高速で流れていくログの1行（見た目だけ）
function fakeLogLine() {
  const hh = String(Math.floor(Math.random() * 24)).padStart(2, "0"),
    mm = String(Math.floor(Math.random() * 60)).padStart(2, "0");
  const host = pickOne([
    "auth.sso",
    "ad.accounts",
    "backup.daily",
    "mail.relay",
    "keiri.ledger",
    "gate.log",
    "vpn.edge",
    "cam.lobby",
  ]);
  const act = pickOne([
    "session open",
    "token refresh",
    "write 4096B",
    "policy sync",
    "index rebuild",
    "rotate",
    "read 512B",
    "heartbeat",
  ]);
  return `2026/09/${String(1 + Math.floor(Math.random() * 25)).padStart(2, "0")} ${hh}:${mm}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}  ${host.padEnd(14)}${act}  ${randHex(3)}`;
}

// それらしい件数：記録の数と言葉の長さから決める（短い言葉ほど多くヒットする）。
// 言葉から作った数で揺らすので、同じ言葉なら毎回同じ件数になる
function plausibleTotal(conf, word) {
  let h = 2166136261;
  for (const c of word) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  const r = (h % 1000) / 1000;
  const share = [0, 0.02, 0.004, 0.0009, 0.0002, 0.00006][Math.min([...word].length, 5)];
  return Math.max(1, Math.round((conf.records ?? 10000) * share * (0.4 + r * 1.2)));
}

async function showResults(conf, q, terms, hits, shown, limit) {
  // 見せかけの総件数（totals）：その言葉1つだけで検索したときに、大企業らしい件数を出す
  const joined = terms.join("");
  const key = Object.keys(conf.totals || {}).find(k => fold(k).replace(/\s+/g, "") === joined);
  const exact = (conf.exact || []).some(w => fold(w).replace(/\s+/g, "") === joined);
  let total = hits.length;
  if (key) total = hits.length ? Math.max(hits.length, conf.totals[key]) : 0;
  // fakeTotals：表にない言葉でも、それらしい件数にする
  // （1〜2件しか見つからないときは、その件数のまま。「上位3件を表示」なのに1件しか出ない、を避ける）
  else if (conf.fakeTotals && !exact && (hits.length === 0 || hits.length >= limit))
    total = Math.max(hits.length, plausibleTotal(conf, joined));
  // 何件かはあるが、目ぼしいものは1件もない（一覧は出さず、師匠がひとこと）
  const nothing = !hits.length && total > 0;
  // 見出し：「何を探したか」を大きく、件数は小さく横に
  print(
    `<div class="res-head${total ? "" : " none"}"><span class="res-title">${esc(conf.label)} ─ 「${esc(q)}」</span>` +
      `<span class="res-count">${total.toLocaleString()} 件${hits.length && total > shown.length ? `（上位 ${shown.length} 件を表示）` : ""}</span></div>`,
  );
  if (!total) print(esc(conf.empty || "該当するものはありません。"), "dim");
  // 結果は1件ずつ（解読しながら）出す
  await wait(BEAT.small);
  for (const e of shown) {
    // before：その結果を出す前に流れる演出（初めて見るときだけ。例：消された差分を復元する）
    if (e.before && !state.said.has(e.before)) {
      state.said.add(e.before);
      await play(e.before);
      await wait(BEAT.small);
    }
    // hidden … 意図的に隠されていたデータ（赤い文字で出す）
    const decoding = decode(
      print(
        `<div class="doc${e.hidden ? " hidden-data" : ""}">${e.html}</div>`,
        "node result reveal",
      ),
      e.decodeMs || 380,
    );
    // hold … 出しきってから、読む時間をとる（復元した差分など）
    if (e.hold) {
      await decoding;
      await pause(e.hold);
    } else await wait(450);
  }

  const clues = shown.map(e => e.clue).filter(c => c && !state.clues.includes(c));
  // 手がかりのカードも1枚ずつ
  // goal.quietClue … 結果をじっくり読ませたいので、カードは出さずに手がかりだけ回収する
  const quiet = shown.some(e => e.goal?.quietClue);
  if (clues.length) {
    if (!quiet) await wait(700);
    for (const c of clues) await addClue(c, { quiet });
  }

  // 師匠のひとこと（それぞれ一度だけ）
  const lines = [];
  let next = null,
    nextLines = null; // 師匠が言った「次の一手」と、そのときのセリフ
  const noteScripts = [];
  for (const e of shown) {
    if (e.say && !state.said.has(e)) {
      state.said.add(e);
      lines.push(...e.say);
    }
    if (e.next) {
      next = e.next;
      nextLines = e.say;
    }
  }
  const goal = state.saveReady ? null : shown.find(e => e.goal)?.goal;
  if (!goal) {
    (conf.notes || []).forEach((n, i) => {
      const key = `${state.current}:note${i}`;
      if (state.said.has(key)) return;
      // need … その flag が立っているときだけ ／ not … その flag が立っていないときだけ（同じ検索でも、状況で師匠の反応が変わる）
      if (n.need && !state.flags[n.need]) return;
      if (n.not && state.flags[n.not]) return;
      if ([].concat(n.when).some(w => terms.some(t => t.includes(fold(w))))) {
        state.said.add(key);
        lines.push(...(n.say || []));
        if (n.next) {
          next = n.next;
          nextLines = n.say;
        }
        if (n.script) noteScripts.push(n.script);
      }
    });
  }
  if (nothing && !lines.length) lines.push("[師匠] この中に必要そうなものはなさそうだな。");
  await speak(lines, BEAT.react);
  // notes の script（師匠が話したあとの見せ場）
  for (const sc of noteScripts) await play(sc);
  // after：師匠が話したあとに流れる演出（初めてのときだけ。例：監査に見つかって、足跡を消す）
  for (const e of shown) {
    if (e.after && !state.said.has(e.after)) {
      state.said.add(e.after);
      await wait(BEAT.small);
      await play(e.after);
    }
  }
  setGuide(next, nextLines);
  await checkObjectives();
  if (goal) await runGoal(goal);
}

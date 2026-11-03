// =========================================================
//  mind：任務3の人格モデル（.mind）への尋問
//    千里眼の subjects.mind から、一人ぶんの「頭の中の写し」を取り出して話を聞く
//    写しは、本人と同じところでうそをつく。うそをつくと「緊張度」が跳ねる
//    記録をつきつける（show）と、うそが崩れて本当のことを話す。うそは何段にもできる（崩すたびに言いわけが変わる）
//  台本の書き方は src/scenario.js の先頭（■ 尋問）と、m3 の nodes の mind
// =========================================================

const mindOf = (node = here()) => node?.mind || null;
// 写しごとの状態：stage … いま何段目のうそか（lies の番号。全部崩したら lies.length）
const mindState = id =>
  ((state.minds ||= {})[id] ||= { stage: 0, asked: {}, idle: 0, visits: 0, said: {} });
const mindId = () => state.current;
const mindLie = (m, s) => m.lies?.[s.stage] || null;
// 証拠の短い名前（show で打つ名前）。台本の evidence: { 短い名前: "手がかりの名前" }
const evidenceName = label => Object.entries(CH.evidence || {}).find(([, l]) => l === label)?.[0] || label;
const evidenceHeld = () =>
  Object.entries(CH.evidence || {})
    .filter(([, label]) => state.clues.includes(label))
    .map(([name, label]) => ({ name, label }));

// ---------------- 写しに入る（enterNode から呼ぶ） ----------------
async function mindEnter(id, first) {
  const node = nodeOf(id),
    m = node.mind,
    s = mindState(id);
  s.visits++;
  if (first) {
    // 一人ぶんを取り出す（情報のない演出なので速く）
    const line = print("", "dim scan");
    for (let f = 1; f <= 8; f++) {
      line.textContent = `extract subjects.mind --id ${m.code} [${"▮".repeat(f)}${"·".repeat(8 - f)}]`;
      SFX.tick();
      await wait(30);
    }
    line.textContent = `extract subjects.mind --id ${m.code} ── done`;
  }
  // 名札（ID・名前・一致率など）
  const rows = (m.card || []).map(([k, v]) => `<span>${esc(k)}</span><span>${esc(fill(v))}</span>`).join("");
  const card = print(
    `<div class="mind-card"><div class="mc-top"><span class="mc-id">${esc(m.code)}</span><span class="mc-name">${esc(m.name)}</span>` +
      (m.sync ? `<span class="mc-sync">一致率 ${esc(m.sync)}</span>` : "") +
      `</div>${rows ? `<div class="mc-rows">${rows}</div>` : ""}</div>`,
    "mind-head",
  );
  pulse(card.querySelector(".mind-card"), "landed", 900);
  await wait(BEAT.block);
  if (first) {
    if (m.hello?.length) await play(m.hello);
    // 入ったら、まず「あの夜、どこにいた？」から（自分で打ったように出す）
    if (m.ask) {
      await wait(BEAT.small);
      await autoType(m.ask);
      await mindAnswer(m, s, { lie: true }, { noTip: true });
    }
    // はじめての写しでは、聞き方を教えてから（この任務で一度だけ）、数字が跳ねたことを言う
    if (!state.said.has("mind:howto") && CH.mindSay?.howto?.length) {
      state.said.add("mind:howto");
      await tapWait();
      await speak(CH.mindSay.howto, BEAT.small);
    }
    if (m.ask) await mindSpikeTip();
  } else {
    const done = s.stage >= (m.lies?.length || 0);
    const again = done ? m.done : m.again;
    if (again?.length) await play(again);
  }
  updateNext();
}

// ---------------- 質問する（run から、コマンドでない入力が来たとき） ----------------
async function mindAsk(raw) {
  const m = mindOf(),
    s = mindState(mindId());
  const q = fold(String(raw).normalize("NFKC")).replace(/[\s　、。？?！!「」]/g, "");
  const topics = (m.topics || []).filter(t => topicOpen(t));
  // ボタンの文（q）と同じなら、それ。ちがえば、言葉（when）がいちばん多く当たったもの（長い言葉ほど重く数える）
  let topic = topics.find(t => fold(t.q).replace(/[\s　、。？?！!「」]/g, "") === q);
  if (!topic) {
    let best = 0;
    for (const t of topics) {
      const n = (t.when || []).filter(w => q.includes(fold(w))).reduce((a, w) => a + [...w].length, 0);
      if (n > best) {
        best = n;
        topic = t;
      }
    }
  }
  state.minutes += 1;
  updateClock();
  await busy(async () => {
    await wait(BEAT.small);
    if (!topic) {
      // 通じなかった：その人らしい、はぐらかし（順番に）。2回続いたら、師匠がボタンのことを言う
      const idle = m.idle || ["……質問の意味が、分かりません。"];
      await play([idle[s.idle++ % idle.length]].map(l => (l.startsWith("[") ? l : `[${m.who}] ${l}`)));
      await mindMeter(m.base ?? 20);
      if (s.idle >= 2 && !state.said.has("mind:idle") && CH.mindSay?.idle?.length) {
        state.said.add("mind:idle");
        await speak(CH.mindSay.idle, BEAT.small);
      }
      return;
    }
    s.asked[topic.q] = true;
    await mindAnswer(m, s, topic);
  });
  updateNext();
  await checkObjectives();
}
// その質問を、いま聞けるか（need … その手がかりを持っているとき ／ if … 条件 ／ stage … 何段目のうそからか）
function topicOpen(t) {
  if (t.need && ![].concat(t.need).every(c => state.clues.includes(c))) return false;
  if (t.if != null && !cond(t.if)) return false;
  return true;
}
// 答える：lie … いまのうそ（全部崩したあとは truth）。ほかは say（全部崩したあとは、あれば truth）
async function mindAnswer(m, s, topic, opt = {}) {
  const lie = topic.lie ? mindLie(m, s) : null;
  const done = s.stage >= (m.lies?.length || 0);
  let lines, stress, spike;
  if (lie) {
    lines = lie.say;
    stress = lie.stress ?? 85;
    spike = true;
  } else if (topic.lie) {
    lines = m.truth || topic.say;
    stress = m.calm ?? 30;
  } else {
    lines = (done && topic.truth) || topic.say;
    stress = done && topic.truthStress != null ? topic.truthStress : (topic.stress ?? m.base ?? 20);
    spike = !done && stress >= 70;
  }
  await play(lines || []);
  await mindMeter(stress, spike);
  // 1段目のうそ（アリバイ）は、証言として記録する
  if (lie?.clue) await addClue(lie.clue);
  if (topic.clue) await addClue(topic.clue);
  if (spike && !opt.noTip) await mindSpikeTip();
}

// 緊張度：10目盛りのバー。うそのときは跳ねて、心臓が鳴る
async function mindMeter(v, spike) {
  const el = print(`<span class="mind-meter${spike ? " spike" : ""}">緊張度 <b></b> <i></i></span>`, "mind-m");
  const bar = el.querySelector("b"),
    num = el.querySelector("i");
  const steps = spike ? 10 : 4;
  for (let k = 1; k <= steps; k++) {
    const n = Math.round((v * k) / steps);
    bar.textContent = "▮".repeat(Math.round(n / 10)) + "▯".repeat(10 - Math.round(n / 10));
    num.textContent = String(n);
    if (fast || REDUCED) break;
    await sleep(spike ? 40 : 30);
  }
  bar.textContent = "▮".repeat(Math.round(v / 10)) + "▯".repeat(10 - Math.round(v / 10));
  num.textContent = spike ? `${v}　── 揺れ` : String(v);
  if (spike) {
    SFX.beat();
    pulse(el.querySelector(".mind-meter"), "jolt", 500);
    await wait(500);
  }
}
async function mindSpikeTip() {
  if (state.said.has("mind:spike") || !CH.mindSay?.spike?.length) return;
  state.said.add("mind:spike");
  await tapWait();
  await speak(CH.mindSay.spike, BEAT.react);
}

// ---------------- 証拠をつきつける（show） ----------------
async function mindShow(arg) {
  const m = mindOf();
  const held = evidenceHeld();
  if (!m) {
    print("show: ここには、つきつける相手がいません（人格モデルの中で使う）。", "dim");
    return;
  }
  // 引数なし：持っている証拠の一覧（押すと入力欄に入る）
  if (!arg.trim()) {
    if (!held.length) return print("show: つきつけられる証拠が、まだありません。", "dim");
    const rows = held
      .map(e => `<span class="n pick" data-fill="show ${esc(e.name)}">${esc(e.name)}</span><span>${esc(e.label)}</span>`)
      .join("");
    print(`<div class="dim">つきつける証拠：</div><div class="menu reveal"><div class="ls">${rows}</div></div>`);
    return;
  }
  const a = fold(arg.normalize("NFKC")).replace(/\s+/g, "");
  const ev =
    held.find(e => fold(e.name).replace(/\s+/g, "") === a) ||
    held.find(e => fold(e.name).replace(/\s+/g, "").includes(a) || fold(e.label).replace(/\s+/g, "").includes(a));
  if (!ev) {
    const known = Object.keys(CH.evidence || {}).some(n => fold(n).replace(/\s+/g, "") === a);
    print(known ? `show: ${esc(arg)} ── まだ持っていない証拠です。` : `show: ${esc(arg)} ── そういう証拠はありません（show だけで一覧）。`, "dim");
    return;
  }
  const s = mindState(mindId());
  await busy(async () => {
    print(`<span class="mind-show">▶ つきつける：${esc(ev.label)}</span>`, "mind-s");
    SFX.card?.();
    await wait(BEAT.react);
    const lie = mindLie(m, s);
    // いまのうそを崩す証拠か
    if (lie && (lie.by || []).includes(ev.label)) {
      const missing = (lie.need || []).filter(c => !state.clues.includes(c));
      if (missing.length) {
        // 崩すには、まだ足りない（その証拠だけでは、言い逃れされる）
        await play(lie.weak?.[ev.label] || [`[${m.who}] ……それが、何か。`]);
        await mindMeter(lie.weakStress ?? 72, true);
        if (lie.weakSay?.length && !s.said.weak) {
          s.said.weak = true;
          await speak(lie.weakSay, BEAT.small);
        }
        return;
      }
      await mindBreak(m, s, lie);
      return;
    }
    // その証拠に、決まった反応がある（react: { "手がかりの名前": { say, stress } }）
    const r = m.react?.[ev.label];
    if (r) {
      await play(r.say);
      await mindMeter(r.stress ?? m.base ?? 20, (r.stress ?? 0) >= 70);
      return;
    }
    const shrug = m.shrug || ["……それが、私と何の関係が？"];
    await play([shrug[(s.shrug = (s.shrug || 0) + 1) % shrug.length]].map(l => (l.startsWith("[") ? l : `[${m.who}] ${l}`)));
    await mindMeter(m.base ?? 20);
    if (!state.said.has("mind:shrug") && CH.mindSay?.shrug?.length) {
      state.said.add("mind:shrug");
      await speak(CH.mindSay.shrug, BEAT.small);
    }
  });
  updateNext();
  await checkObjectives();
}

// うそが崩れる：矛盾を見つけて、写しが計算し直す → 本当のこと（broken）→ 次のうそ（あれば）
async function mindBreak(m, s, lie) {
  print("[!] 応答の矛盾を検出 ── 人格モデルを再計算しています", "alert");
  tear(380, 0.8);
  pulse($("term"), "flash-ok", 500);
  await wait(700);
  s.stage++;
  addLog(`MIND ${m.code} うそ ${s.stage}/${m.lies.length}`);
  await play(lie.broken || []);
  const next = mindLie(m, s);
  if (next) {
    // 言いわけが変わる（次のうそ）
    await wait(BEAT.small);
    await play(next.say);
    await mindMeter(next.stress ?? 85, true);
    if (next.clue) await addClue(next.clue);
  } else await mindMeter(m.calm ?? 30);
  if (lie.gives) await addClue(lie.gives);
  // after … 崩れたあとの、師匠のひとこと（証言のカードのあと）
  if (lie.after?.length) await speak(lie.after, BEAT.small);
  if (!next && m.end?.length) await play(m.end);
}

// ---------------- NEXT 欄：質問のボタン（まだ聞いていないものを先に）と、show ----------------
function mindChips(node) {
  const m = node.mind,
    s = mindState(state.current);
  const open = (m.topics || []).filter(topicOpen);
  const fresh = open.filter(t => !s.asked[t.q]),
    old = open.filter(t => s.asked[t.q]);
  return [
    chip("show", "show 証拠…", "go"),
    ...fresh.map(t => chip(t.q, t.q, "ask")),
    ...old.map(t => chip(t.q, t.q, "ask asked")),
  ];
}

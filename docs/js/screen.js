// =========================================================
//  画面表示
//  NEXT 欄・ターミナルへの出力・文字の出し方（師匠のセリフ）・プロンプト・時計・TRACE
// =========================================================

// ---------------- NEXT 欄：次にできることを、入力欄の上に常に出す ----------------
function chip(fill, label, cls = "") {
  return `<span class="chip pick ${cls}" data-fill="${esc(fill)}">${esc(label ?? fill)}</span>`;
}
// 師匠が言った「次の一手」 { at: ノードid, cmd: "search 鷲尾" }（シナリオの next で決める）
//   その場所にいれば cmd を、いなければそこへ行く ssh を、NEXT 欄の先頭に出す
// why … なぜそれをやるのか（行動の理由）。光るボタンのすぐ上に出す
function setGuide(g) {
  if (!g) return;
  state.guide = g;
  updateNext();
}
function guideCmd() {
  const g = state.guide;
  if (!g || state.over) return null;
  if (state.current === g.at) return g.cmd;
  const link = state.links.find(l => l.go === g.at);
  if (link) return `ssh ${link.name}`;
  // 行き先が来た道（ひとつ前の場所）なら back。直接行けなければ、ポータルへ（ポータルが来た道なら back）
  const prev = state.history.at(-1);
  if (prev && (prev === g.at || prev === "portal")) return "back";
  const portal = state.links.find(l => l.go === "portal");
  return portal ? `ssh ${portal.name}` : prev ? "back" : null;
}

function updateNext() {
  const box = $("next");
  $("why").innerHTML = "";
  const mode = state?.mode;
  let chips = [];
  if (mode?.type === "title") {
    // タイトル画面：ハンドル名が決まるまでは handle、決まったら connect を案内する
    // 練習（connect training）は、終えるまでは光るボタンで先頭に、終えたら控えめに後ろへ
    const train =
      trainCmd() &&
      (trained
        ? chip(trainCmd(), `${trainCmd()}（練習）`)
        : `<span class="chip pick guide" data-fill="${esc(trainCmd())}">▶ ${esc(trainCmd())}（練習）</span>`);
    chips = handle
      ? [
          ...(train && !trained ? [train] : []),
          ...(storyCmd() ? [chip(storyCmd(), `${storyCmd()}（仕事）`, "go")] : [chip("connect ", "connect 回線コード…", "go")]),
          ...(savedCode() ? [chip("continue", "continue（続きから）", "go")] : []),
          ...(train && trained ? [train] : []),
          chip("handle ", "handle（呼び名を変える）"),
        ]
      : [chip("handle ", "handle 名前…", "go")];
  } else if (mode?.type === "handleConfirm") {
    chips = [chip("y", "y 決定", "go"), chip("n", "n 入れ直す")];
  } else if (!CH || state.over) {
    box.innerHTML = "";
    return;
  } else if (mode?.type === "user" || mode?.type === "password") {
    chips = [`<span class="chip pick warn" data-cancel>やめる（入力しない）</span>`];
    if (mode.type === "password" && mode.user)
      chips.push(`<span class="chip pick" data-reuser>ユーザーIDを変える</span>`);
  } else if (mode?.type === "confirm") {
    chips = [chip("y", "y 進む", "ow"), chip("n", "n やめる")];
  } else if (mode?.type === "choose") {
    // 台本の { choose }：選べるコマンドを並べる（押すと入力欄に入る）
    chips = mode.options.map(o => chip(o.cmd, o.label ? `${o.cmd}　${o.label}` : o.cmd, "go"));
  } else if (state.current) {
    const node = here();
    // 戻る（back）は、いつも一番左に（毎回右まで探しに行かなくていいように）
    if (state.history.length || state.door) chips.push(chip("back"));
    // 調べ終わったら、どこにいても back のすぐ右に return を出しておく
    if (state.saveReady) chips.push(chip("return", "return", "save"));
    // 師匠が言った「次の一手」：押すと入力欄に入る（実行は Enter か ⏎ ボタン）
    const g = guideCmd();
    if (g) {
      chips.push(
        `<span class="chip pick guide" data-fill="${esc(g)}">▶ ${esc(g)}</span>`,
      );
      // なぜそこが光っているのか（師匠のひとこと）を、NEXT 欄のすぐ上に
      // 行き先へ向かう途中は go（移動の理由）、着いたら why（そこでやることの理由）
      const why =
        state.current === state.guide.at ? state.guide.why : (state.guide.go ?? state.guide.why);
      if (why) $("why").innerHTML = `<span class="why-mark">▸</span><span>${esc(fill(why))}</span>`;
    }
    if (node.search) chips.push(chip("search ", "search 〇〇", "go"));
    for (const t of menuTools(node)) chips.push(chip(t.fill, t.label, "go"));
    for (const d of dirHere(node)) chips.push(chip(d.file ? `open ${d.name}` : `ssh ${d.name}`));
    // ゲームの世界：落ちているものと、その場所でできること（まだやっていないもの）
    for (const name of itemsHere()) chips.push(chip(`pick ${name}`, `pick ${name}`, "go"));
    if (document.body.dataset.zone === "rpg")
      for (const k of Object.keys(node.actions || {}))
        if (!state.said.has(`act:${state.current}:${k}`)) chips.push(chip(k, k, "go"));
    for (const l of state.links)
      chips.push(
        chip(
          `ssh ${l.name}`,
          `ssh ${l.name}${l.oneway ? "（一方通行）" : ""}`,
          l.oneway ? "ow" : "",
        ),
      );
  }
  // 光るボタン（次の一手）と同じコマンドの、ふつうのボタンは並べない（同じものが2つ並ばないように）
  const g = state?.current && !mode && guideCmd();
  if (g) chips = chips.filter(c => c.includes("chip pick guide") || !c.includes(`data-fill="${esc(g)}"`));
  box.innerHTML = chips.length ? `<span class="next-label">NEXT</span>${chips.join("")}` : "";
  box.scrollLeft = 0; // スマホ（横にスクロールする1行）で、先頭の光るボタンが見えるように
  // NEXT 欄の高さが変わると最後の行が隠れるので、いちばん下までスクロールし直す
  scrollDown();
}

// ---------------- 表示 ----------------
function print(html, cls = "") {
  const d = document.createElement("div");
  d.className = "line " + cls;
  d.innerHTML = html;
  out.appendChild(d);
  scrollDown();
  return d;
}
// 演出で行の中身があとから伸びても（照合中… など）、いちばん下についていく。
// ただし、自分で上にスクロールしてログを読んでいるときは、勝手に引き戻さない
//   followBottom を false にするのは「自分で上へ戻したとき」だけ。下まで戻ってきたら、また追いかける
//   （中身が伸びたせいで下から離れて見えても、追いかけるのはやめない）
let followBottom = true,
  lastTop = 0,
  userScrollAt = 0;
const scrollDown = () => {
  const t = $("term");
  t.scrollTop = t.scrollHeight;
  followBottom = true;
  lastTop = t.scrollTop;
  $("toBottom").classList.remove("show");
};
// 自分で動かした（ホイール・指・スクロールバー）ときだけ、さかのぼったとみなす
// 画面の高さが変わったり（スマホのキーボード・上の欄）、演出で中身が入れかわったりして位置がずれただけなら、下につけ直す
const userScrolled = () => (userScrollAt = performance.now());
$("term").addEventListener("wheel", userScrolled, { passive: true });
$("term").addEventListener("touchmove", userScrolled, { passive: true });
$("term").addEventListener("pointerdown", e => {
  if (e.offsetX > e.currentTarget.clientWidth) userScrolled(); // スクロールバーをつかんだ
});
$("term").addEventListener("scroll", () => {
  const t = $("term"),
    dist = t.scrollHeight - t.scrollTop - t.clientHeight,
    byUser = performance.now() - userScrollAt < 1000;
  if (dist < 40) followBottom = true;
  else if (byUser && t.scrollTop < lastTop - 4) followBottom = false;
  else if (followBottom && !byUser) return scrollDown();
  lastTop = t.scrollTop;
  // さかのぼって読んでいるときだけ「↓ 最新へ」を出す
  $("toBottom").classList.toggle("show", !followBottom);
});
$("toBottom").addEventListener("click", e => {
  e.stopPropagation();
  SFX.select();
  // 先に入力欄へ（スクロールさせずに）。スクロールのあとに focus すると、なめらかなスクロールが止まってしまう
  if (finePointer) cmd.focus({ preventScroll: true });
  const t = $("term");
  t.scrollTo({ top: t.scrollHeight, behavior: REDUCED ? "auto" : "smooth" });
  // なめらかなスクロールが途中で止められても、最後は必ずいちばん下へ
  setTimeout(() => {
    if (t.scrollHeight - t.scrollTop - t.clientHeight > 40) t.scrollTop = t.scrollHeight;
  }, 700);
});
// 右の欄の手がかりを押すと、その EVIDENCE のカードが出たところへ飛ぶ
$("evi").addEventListener("click", e => {
  const item = e.target.closest("[data-clue]");
  if (!item) return;
  const card = [...out.querySelectorAll(".evi-card")].find(
    el => el.dataset.clue === item.dataset.clue,
  );
  if (!card) return;
  SFX.select();
  // カードがターミナルの真ん中に来るように（下に固定した入力欄の分も考える）
  const t = $("term"),
    view = t.clientHeight - $("dock").offsetHeight;
  const top =
    card.getBoundingClientRect().top -
    t.getBoundingClientRect().top +
    t.scrollTop -
    (view - card.offsetHeight) / 2;
  // 自分で読みに行ったのと同じ扱い（下へ引き戻さない）
  followBottom = false;
  $("toBottom").classList.add("show");
  t.scrollTo({ top: Math.max(0, top), behavior: REDUCED ? "auto" : "smooth" });
  card.classList.remove("focus");
  void card.offsetWidth;
  card.classList.add("focus");
});
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => {
    if (followBottom) scrollDown();
  });
  ro.observe($("out"));
  ro.observe($("dock"));
  ro.observe($("term")); // スマホで上の欄を開け閉めして、ターミナルの高さが変わったときも
}
function pulse(el, cls, ms = 600) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

// 台本の1行：[師匠] はセリフ、[!] は警告、[*] [+] はシステム。1文字ずつ打ち出す
// 師匠の話し方：「、」「。」の代わりに「, 」「. 」を使う（行末やカッコの前では空白を付けない）
const shishou = s =>
  s
    .replace(/…。/g, "…")
    .replace(/、/g, ", ")
    .replace(/。/g, ". ")
    .replace(/ +(?=[」』）)]|\n|$)/g, "");

function lineParts(s) {
  s = fill(s);
  if (s.startsWith("[師匠]"))
    return { cls: "say", text: shishou(s.replace(/^\[師匠\]\s*/, "")), say: true };
  // 任務の cast に書いた登場人物のセリフ：[王様] おお！ … のように書く（師匠と同じ形で、名前を出す）
  const m = s.match(/^\[([^\]!*+]{1,12})\]\s*/);
  if (m && CH?.cast?.[m[1]]) return { cls: `say cast ${CH.cast[m[1]]}`, text: s.slice(m[0].length), who: m[1] };
  if (s.startsWith("[!")) return { cls: "alert", text: s };
  if (/^\[[*+]\]/.test(s)) return { cls: "sys", text: s };
  return { cls: "", text: s };
}
function printLine(s) {
  const { cls, text, say, who: name } = lineParts(s);
  const label = say ? "師匠" : name;
  return print(label ? `<span class="who">${esc(label)}</span>${esc(text)}` : esc(text), cls);
}
// 師匠がしゃべっている間だけ BGM を少し下げる（しゃべり終わって少ししたら戻す）
let duckTimer = null;
function duckBgm(ms = 2600) {
  SFX.duck(true);
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => SFX.duck(false), ms);
}

// opt.charMs：1文字ごとの間隔を指定する（「…………」をゆっくり出すときなど）
async function typeLine(s, opt = {}) {
  const { cls, text, say, who: name } = lineParts(s);
  const label = say ? "師匠" : name;
  const d = print(
    label ? `<span class="who">${esc(label)}</span><span class="t"></span>` : `<span class="t"></span>`,
    cls,
  );
  const t = d.querySelector(".t");
  if (cls === "alert") SFX.alert();
  if (say) {
    SFX.radio();
    duckBgm();
  }
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    if (fast || REDUCED) break;
    t.textContent += chars[i];
    if (i % 6 === 0) scrollDown();
    // 登場人物のセリフは、昔のゲームのように「ポポポ」と鳴らしながら出す
    if (name && i % 3 === 0 && chars[i].trim()) SFX.tick();
    // 師匠のセリフは、読み切れるように少しゆっくり（「, 」「. 」でも一拍おく）
    //   練習の師匠は、もう少しゆっくり（説明をちゃんと読めるように）
    const slow = tapMode();
    const charMs = say || name ? (slow ? 46 : 33) : slow && !cls ? 30 : 16;
    await sleep(opt.charMs ?? ("。、…！？.,".includes(chars[i]) ? 90 : charMs));
  }
  t.textContent = text;
  scrollDown();
  return d;
}
// beat：話し始める前の「間」。出来事のあとに余韻を残してから、師匠が口を開く
async function speak(lines, beat = 0) {
  if (!lines?.length) return;
  await busy(async () => {
    if (beat) await wait(beat);
    // 師匠のセリフの間は、演出のテンポ（tempo）に関係なく一定（速くしない）
    for (const s of lines) {
      await pause(220);
      await typeLine(s);
      await afterLine(s);
    }
  });
}

// ---------------- 練習：タップで進む ----------------
// 練習の章（チュートリアル）では、セリフは読み切れるよう、ゆっくり自動で流す。
// 図・新しい場所の画面・help などの一覧のように、情報が一気に出たときだけ、
// タップ（クリック・Enter）するまで次へ進まない（読み終えてから、師匠が話し出す）
let tapResolve = null,
  tapHints = 0;
// 練習（practice）と、tap: true の任務（任務1・2）で使う
const tapMode = () => !!(CH?.practice || CH?.tap) && !REDUCED;
// 「▼ タップで次へ」を、出たものの下に1行で出して、タップを待つ（文字は最初の数回だけ。あとは ▼ だけ）
function tapWait() {
  if (!tapMode() || fast || state?.over) return Promise.resolve();
  const label = tapHints++ < 3 ? (finePointer ? " クリックか Enter で次へ" : " タップで次へ") : "";
  const hint = print(`<span class="tap-hint">▼${label}</span>`, "tap-line");
  return new Promise(r => {
    tapResolve = () => {
      hint.remove();
      r();
    };
  });
}
// タップを待っていたら、次へ進める（押したことにして true を返す）
function tapGo() {
  if (!tapResolve) return false;
  const r = tapResolve;
  tapResolve = null;
  SFX.select();
  r();
  return true;
}
// セリフを1行出したあとの間
async function afterLine(s) {
  const p = lineParts(s);
  // 練習と tap の任務は、読み切れるように、セリフとナレーションの間を長めに（[*] [!] のようなシステムの行は、いつもの速さ）
  const slow = tapMode();
  if (p.say || p.who) return pause(slow ? 1150 : 560);
  await wait(slow && !p.cls ? 750 : 420);
}

// ---------------- 間（ま） ----------------
// 全体の「出てくる速さ」はここでまとめて調整する
//   react：出来事のあと、師匠が話し出すまでの余韻
//   block：かたまりを1つずつ出すときの間隔
//   small：見出しと中身の間などの、小さな間
const BEAT = { react: 1400, block: 380, small: 220 };
// parent の中に、かたまりを1つ足して（ふわっと出して）から、pause だけ待つ
async function reveal(parent, html, pause = BEAT.block) {
  const d = document.createElement("div");
  d.className = "reveal";
  d.innerHTML = html;
  parent.appendChild(d);
  scrollDown();
  await wait(pause);
  return d;
}

function shortHost(host) {
  return host.split(/[./]/)[0];
}
function setPrompt(text) {
  $("prompt").textContent = text;
  updateNext();
}
function normalPrompt() {
  // 鍵のかかった扉の前にいるときは、その扉の名前（back で戻る）
  const at = state.door ? nodeOf(state.door) : here();
  setPrompt(`${who()}@${shortHost(at.host)}:~$`);
  cmd.type = "text";
}

function clockText() {
  const [h, m] = (CH?.clock || "00:00").split(":").map(Number);
  const t = h * 60 + m + state.minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function updateClock() {
  $("clock").textContent = CH ? `${CH.date} ${clockText()}` : "";
}
function addLog(text, cls = "") {
  const li = document.createElement("li");
  li.textContent = `${clockText()}  ${text}`;
  if (cls) li.className = cls;
  $("log").prepend(li);
}
function updateTrace(shown = state.trace) {
  const t = Math.min(100, Math.round(shown));
  $("traceNum").textContent = t + "%";
  $("traceBar").style.width = t + "%";
  $("traceBar").style.background =
    t >= 70 ? "var(--alert)" : t >= 40 ? "var(--warn)" : "var(--accent)";
  $("side").classList.toggle("danger", t >= 70);
}
function addTrace(n) {
  state.trace += n;
  updateTrace();
  pulse($("term"), "flash", 1000);
  impact();
  if (state.trace >= 100) {
    state.over = true;
    cmd.disabled = true;
    (async () => {
      await sleep(600);
      SFX.boom();
      print("*** CONNECTION LOST ***", "alert");
      $("wrap").classList.add("glitch");
      setStorm(1);
      await sleep(1200);
      await powerOff();
      showEnding(S.gameOver, { retry: true });
    })();
  }
}
// 演出用：トレースの表示だけを一気に上げる（100% になってもゲームオーバーにしない）
async function raceTrace(to, ms) {
  const from = state.trace,
    steps = Math.max(1, Math.round(ms / 60));
  $("traceBar").parentElement.classList.add("racing");
  for (let i = 1; i <= steps; i++) {
    updateTrace(from + (to - from) * (i / steps) ** 1.5);
    if (i % 3 === 0) SFX.tick();
    await sleep(60);
  }
  $("traceBar").parentElement.classList.remove("racing");
  state.trace = to;
}

// ---------------- スクロールの目盛り（scroll rail） ----------------
// ブラウザのスクロールバーは CSS で消してある。代わりに、プレイヤーが自分でスクロールしているあいだだけ、
// その欄の右端に、点線の目盛りと「▮」（今の位置）を出す。止めて少したつと消える
//   文字が流れて勝手に下へ送られるとき（scrollDown）には出さない（ホイール・スワイプ・キー・つまんだときだけ）
//   「▮」はつかんで動かせる。目盛りを押すと、その位置へ飛ぶ。パソコンでは、欄の右端にマウスを寄せても出る
(() => {
  const rails = new Map(); // 欄 → { rail, mark, timer }
  const scrollable = el => {
    for (; el && el !== document.body; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 2) return el;
    }
    return null;
  };
  const place = (el, r) => {
    const b = el.getBoundingClientRect();
    r.rail.style.top = `${b.top + 10}px`;
    r.rail.style.height = `${Math.max(0, b.height - 20)}px`;
    r.rail.style.left = `${b.right - 15}px`;
    const max = el.scrollHeight - el.clientHeight,
      h = b.height - 20 - 14;
    r.mark.style.top = `${max > 0 ? (el.scrollTop / max) * h : 0}px`;
  };
  const railOf = el => {
    let r = rails.get(el);
    if (r) return r;
    const rail = document.createElement("div");
    rail.className = "srail";
    rail.innerHTML = `<span class="end top">▴</span><span class="mark"></span><span class="end bot">▾</span>`;
    document.body.appendChild(rail);
    r = { rail, mark: rail.querySelector(".mark"), timer: 0, drag: false };
    rails.set(el, r);
    const jump = y => {
      const b = rail.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (y - b.top - 7) / (b.height - 14)));
      el.scrollTop = p * (el.scrollHeight - el.clientHeight);
    };
    rail.addEventListener("pointerdown", e => {
      r.drag = true;
      rail.setPointerCapture(e.pointerId);
      jump(e.clientY);
      show(el);
    });
    rail.addEventListener("pointermove", e => {
      if (!r.drag) return;
      jump(e.clientY);
      show(el);
    });
    const up = () => {
      r.drag = false;
      show(el);
    };
    rail.addEventListener("pointerup", up);
    rail.addEventListener("pointercancel", up);
    rail.addEventListener("pointerenter", () => show(el));
    return r;
  };
  function show(el, ms = 900) {
    if (!el.isConnected || el.scrollHeight <= el.clientHeight + 2) return;
    const r = railOf(el);
    place(el, r);
    r.rail.classList.add("on");
    clearTimeout(r.timer);
    r.timer = setTimeout(function hide() {
      if (r.drag || r.rail.matches(":hover")) return (r.timer = setTimeout(hide, 400));
      r.rail.classList.remove("on");
      // 欄ごと消えていたら（会話の画面を閉じた、など）、目盛りも片付ける
      if (!el.isConnected) {
        r.rail.remove();
        rails.delete(el);
      }
    }, ms);
  }
  const fromEvent = e => {
    const el = scrollable(e.target);
    if (el) show(el);
  };
  addEventListener("wheel", fromEvent, { capture: true, passive: true });
  addEventListener("touchmove", fromEvent, { capture: true, passive: true });
  addEventListener(
    "keydown",
    e => {
      if (!/^(PageUp|PageDown|Home|End|ArrowUp|ArrowDown)$/.test(e.key)) return;
      const t = document.activeElement && scrollable(document.activeElement);
      if (t) show(t);
    },
    { capture: true },
  );
  // パソコン：欄の右端（20px）にマウスを寄せると出る
  addEventListener(
    "pointermove",
    e => {
      if (e.pointerType !== "mouse") return;
      const el = scrollable(e.target);
      if (el && el.getBoundingClientRect().right - e.clientX < 20) show(el, 1200);
    },
    { passive: true },
  );
  // 出ているあいだは、スクロールに合わせて「▮」を動かす
  addEventListener(
    "scroll",
    e => {
      const r = rails.get(e.target);
      if (r && r.rail.classList.contains("on")) place(e.target, r);
    },
    { capture: true, passive: true },
  );
})();

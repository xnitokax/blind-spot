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
  const link = state.links.find(l => l.go === g.at) || state.links.find(l => l.go === "portal");
  return link ? `ssh ${link.name}` : null;
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
          chip("connect ", "connect 回線コード…", "go"),
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
  } else if (state.current) {
    const node = here();
    // 調べ終わったら、どこにいても一番左に return を出しておく
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
    for (const d of node.dir || []) chips.push(chip(`cd ${d.name}`));
    for (const l of state.links)
      chips.push(
        chip(
          `ssh ${l.name}`,
          `ssh ${l.name}${l.oneway ? "（一方通行）" : ""}`,
          l.oneway ? "ow" : "",
        ),
      );
    if (state.history.length) chips.push(chip("back"));
  }
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
  lastTop = 0;
const scrollDown = () => {
  const t = $("term");
  t.scrollTop = t.scrollHeight;
  followBottom = true;
  lastTop = t.scrollTop;
  $("toBottom").classList.remove("show");
};
$("term").addEventListener("scroll", () => {
  const t = $("term"),
    dist = t.scrollHeight - t.scrollTop - t.clientHeight;
  if (dist < 40) followBottom = true;
  else if (t.scrollTop < lastTop - 4) followBottom = false;
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
  if (s.startsWith("[!")) return { cls: "alert", text: s };
  if (/^\[[*+]\]/.test(s)) return { cls: "sys", text: s };
  return { cls: "", text: s };
}
function printLine(s) {
  const { cls, text, say } = lineParts(s);
  return print(say ? `<span class="who">師匠</span>${esc(text)}` : esc(text), cls);
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
  const { cls, text, say } = lineParts(s);
  const d = print(
    say ? `<span class="who">師匠</span><span class="t"></span>` : `<span class="t"></span>`,
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
    // 師匠のセリフは、読み切れるように少しゆっくり（「, 」「. 」でも一拍おく）
    await sleep(opt.charMs ?? ("。、…！？.,".includes(chars[i]) ? 90 : say ? 33 : 16));
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
      await pause(560);
    }
  });
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
  setPrompt(`${who()}@${shortHost(here().host)}:~$`);
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

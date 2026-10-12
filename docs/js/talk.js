// =========================================================
//  トーク
//  師匠との暗号チャット（chat）と、事務所の受付で依頼人と会う場面（meet）
//  任務の前（prologue）と、任務のあと（afterTalk）に流れる。書き方は src/scenario.js の先頭
// =========================================================

const talkEl = $("talk");
let talkSkip = false; // タップで、いまの待ち時間を飛ばす
let talkPick = null; // 選択肢を待っているとき：選んだら呼ぶ

// タップで飛ばせる待ち時間
function talkWait(ms) {
  talkSkip = false;
  return new Promise(r => {
    const t0 = Date.now();
    const tick = () => {
      if (talkSkip || Date.now() - t0 >= ms) {
        talkSkip = false;
        r();
      } else setTimeout(tick, 30);
    };
    tick();
  });
}
// 読む時間：文字数に合わせる（短い行でも、長い行でも、ゆっくり読み切れるように）
const readMs = text => Math.min(6000, Math.max(2000, [...text].length * 110));
// 場面が切りかわる前と、トークの終わりに、下まで読み終えるのを待つ間
const SCENE_END_MS = 3000;

// 依頼人などの「写真」：その場で描いた絵を、粗いドット絵にして出す（px … 一辺のドット数）
//   shadow … 最初の逆光の影 ／ face … 近づいてきたときの顔（{ reveal } で、モザイクから浮かび上がる）
const BLINDS = Array.from(
  { length: 14 },
  (_, i) => `<rect x="40" y="${24 + i * 12}" width="220" height="4" fill="#0e1312" opacity="0.8"/>`,
).join("");
const PORTRAITS = {
  // 真壁 汐里：長い黒髪、黒いコート。夜の事務所の窓（ブラインド）を背に。少し不安そうな顔
  shiori: {
    px: 84,
    shadow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#1c2422"/>
  <rect x="40" y="20" width="220" height="170" fill="#4a5753"/>${BLINDS}
  <path d="M150 60c-60 0-90 46-90 102 0 50-8 92-26 138h232c-18-46-26-88-26-138 0-56-30-102-90-102z" fill="#08090a"/>
  <path d="M52 300c8-52 44-80 98-80s90 28 98 80z" fill="#050606"/>
</svg>`,
    face: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#26302d"/>
  <rect x="40" y="20" width="220" height="170" fill="#3a4643"/>${BLINDS}
  <path d="M150 58c-62 0-92 46-92 104 0 50-8 92-26 138h236c-18-46-26-88-26-138 0-58-30-104-92-104z" fill="#1c1a24"/>
  <path d="M52 300c8-52 44-80 98-80s90 28 98 80z" fill="#14161b"/>
  <path d="M126 224l24 42 24-42-24 12z" fill="#e8e6e2"/>
  <path d="M134 194h32v30l-16 12-16-12z" fill="#e8c2ac"/>
  <ellipse cx="150" cy="150" rx="50" ry="58" fill="#f6d9c7"/>
  <path d="M106 168c8 26 26 40 44 40s36-14 44-40c-10 18-26 28-44 28s-34-10-44-28z" fill="#ecc6b0"/>
  <path d="M96 142c-2-52 24-84 54-84s56 32 54 84c-6-14-12-22-20-28 2 10 0 18-4 24-6-14-16-24-28-30 2 12-2 22-8 28-4-12-12-22-24-26 0 10-4 18-10 24-4-8-8-12-14-14z" fill="#22202b"/>
  <path d="M98 128c-6 30-4 62 6 94-14-10-22-42-20-72z" fill="#22202b"/>
  <path d="M202 128c6 30 4 62-6 94 14-10 22-42 20-72z" fill="#22202b"/>
  <path d="M118 84c10-8 24-13 36-13-10 4-22 11-30 19z" fill="#4c4862"/>
  <path d="M118 129q10-9 22-4" stroke="#3a2e2c" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M182 129q-10-9-22-4" stroke="#3a2e2c" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="129" cy="151" rx="12" ry="15" fill="#2c2440"/>
  <ellipse cx="171" cy="151" rx="12" ry="15" fill="#2c2440"/>
  <ellipse cx="129" cy="156" rx="8" ry="9" fill="#6a58a0"/>
  <ellipse cx="171" cy="156" rx="8" ry="9" fill="#6a58a0"/>
  <circle cx="124" cy="145" r="4.5" fill="#fff"/>
  <circle cx="166" cy="145" r="4.5" fill="#fff"/>
  <circle cx="134" cy="159" r="2" fill="#fff" opacity="0.8"/>
  <circle cx="176" cy="159" r="2" fill="#fff" opacity="0.8"/>
  <path d="M114 142c8-9 21-10 30-2" stroke="#16121c" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M156 140c9-8 22-7 30 2" stroke="#16121c" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="117" cy="175" rx="11" ry="5" fill="#f2a0a0" opacity="0.55"/>
  <ellipse cx="183" cy="175" rx="11" ry="5" fill="#f2a0a0" opacity="0.55"/>
  <path d="M150 170l-2 4h4z" fill="#d9a892"/>
  <path d="M142 187c5-3 11-3 16 0" stroke="#b5675f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`,
  },
};
// 絵（SVG）を、px ドット四方の canvas に描く（CSS で拡大して、ドットのまま見せる）
function drawPixels(canvas, svg, px) {
  return new Promise(done => {
    const img = new Image();
    img.onload = () => {
      canvas.width = canvas.height = px;
      const c = canvas.getContext("2d");
      c.imageSmoothingEnabled = true;
      c.clearRect(0, 0, px, px);
      c.drawImage(img, 0, 0, px, px);
      done();
    };
    img.onerror = () => done();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
// { reveal }：影から顔へ。粗いモザイクから、だんだん細かくなって浮かび上がる
async function revealFace() {
  const canvas = talkEl.querySelector(".tk-photo canvas"),
    p = talkEl._portrait;
  if (!canvas || !p?.face) return;
  for (const px of [6, 10, 16, 26, 42, 60, p.px]) {
    await drawPixels(canvas, p.face, px);
    SFX.tick();
    await sleep(170);
  }
  talkEl.querySelector(".tk-photo").classList.add("lit");
}

// トークの画面を開く（mode：chat か meet）
function talkMode(kind, opt = {}) {
  talkEl.className = `on ${kind}`;
  const head =
    kind === "chat"
      ? `<span class="tk-lock">●</span><span>${esc(fill(opt.title || "uzu://safehouse"))}</span><span class="tk-sub">${esc(fill(opt.sub || "暗号化通信"))}</span>`
      : `<span>${esc(fill(opt.place || ""))}</span><span class="tk-sub">${esc(fill(opt.time || ""))}</span>`;
  // 写真：PORTRAITS の絵はドット絵の canvas に（最初は影）。それ以外は画像のファイル名として出す
  const p = PORTRAITS[opt.portrait];
  talkEl._portrait = p || null;
  const art = p ? `<canvas></canvas>` : opt.portrait ? `<img src="${esc(opt.portrait)}" alt="">` : "";
  talkEl.innerHTML =
    `<div class="tk-head">${head}</div>` +
    (kind === "meet" && art
      ? `<div class="tk-photo">${art}<div class="tk-cap">${esc(fill(opt.who || ""))}</div></div>`
      : "") +
    `<div class="tk-body"></div><div class="tk-foot"></div><div class="tk-tip">タップで先へ</div>`;
  if (p) drawPixels(talkEl.querySelector(".tk-photo canvas"), p.shadow || p.face, p.px);
  SFX.select();
}
function talkAdd(html, cls) {
  const body = talkEl.querySelector(".tk-body");
  const d = document.createElement("div");
  d.className = `tk-line ${cls}`;
  d.innerHTML = html;
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
  return d;
}

// 1行：[師匠] セリフ ／ [自分] 自分のセリフ ／ [*] システム ／ それ以外の [名前] は相手 ／ [] なしは情景（ナレーション）
async function talkLine(s) {
  const m = fill(s).match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  const spk = m?.[1],
    text = m ? m[2] : fill(s);
  const chat = talkEl.classList.contains("chat");
  if (!m) {
    talkAdd(esc(text), "tk-narr");
    return talkWait(readMs(text) * 1.1);
  }
  if (spk === "*") {
    talkAdd(esc(text), "tk-sys");
    SFX.tick();
    return talkWait(1500);
  }
  if (spk === "自分") {
    await talkWait(900);
    talkAdd(`<span class="tk-name">${esc(handle || "あなた")}</span><span class="tk-bubble">${esc(text)}</span>`, "tk-me");
    SFX.enter();
    return talkWait(readMs(text) * 0.8);
  }
  // 会う場面の師匠：吹き出しではなく、受付のイヤホンから聞こえる声（いつもの師匠の表示）
  if (!chat && spk === "師匠") {
    talkAdd(`<span class="who">師匠</span><span>${esc(shishou(text))}</span>`, "tk-voice");
    SFX.radio();
    return talkWait(readMs(text));
  }
  // 相手：チャットでは「入力中…」を出してから届く
  if (chat) {
    const typing = talkAdd(`<span class="tk-name">${esc(spk)}</span><span class="tk-bubble tk-typing">入力中<span>.</span><span>.</span><span>.</span></span>`, "tk-them");
    await talkWait(Math.min(2600, 900 + [...text].length * 45));
    typing.remove();
  }
  talkAdd(`<span class="tk-name">${esc(spk)}</span><span class="tk-bubble">${esc(text)}</span>`, "tk-them");
  SFX.radio();
  return talkWait(readMs(text));
}

// 理解度チェック：{ ask: { q, options: [{ label, ok, reply: [...] }], miss: [...] } }
//   まちがえたら、師匠がヒントを出して（option の reply か、miss）、もう一度選ぶ。罰はない
async function talkAsk(a) {
  if (a.q) await talkLine(`[${a.who || "師匠"}] ${a.q}`);
  const tried = new Set();
  for (;;) {
    const foot = talkEl.querySelector(".tk-foot");
    foot.innerHTML = a.options
      .map(
        (o, i) =>
          `<button type="button" class="tk-opt${tried.has(i) ? " tried" : ""}" data-i="${i}"><span class="tk-n">${i + 1}</span>${esc(fill(o.label))}</button>`,
      )
      .join("");
    talkEl.querySelector(".tk-body").scrollTop = 1e9;
    const i = await new Promise(r => (talkPick = r));
    talkPick = null;
    foot.innerHTML = "";
    const o = a.options[i];
    await talkLine(`[自分] ${o.say || o.label}`);
    for (const l of o.reply || (o.ok ? [] : a.miss || [])) await talkLine(l);
    if (o.ok) return;
    tried.add(i);
  }
}

// トークを流す。終わったら { next: 次の回線コード } を返す
async function runTalk(steps) {
  const res = {};
  talkEl.className = "on chat";
  let shown = false; // 何か出したか（場面を切りかえる前に、読み終える間をおくため）
  for (const s of steps || []) {
    const mode = s?.chat && "chat" || s?.meet && "meet";
    // 場面が切りかわる前に、下まで読み終えるのを待つ
    if (mode && shown) await talkWait(SCENE_END_MS);
    if (typeof s === "string") await talkLine(s);
    else if (s.chat) talkMode("chat", s.chat === true ? {} : s.chat);
    else if (s.meet) talkMode("meet", s.meet);
    else if (s.reveal) await revealFace();
    else if (s.ask) await talkAsk(s.ask);
    else if (s.wait) await talkWait(s.wait);
    else if (s.music !== undefined) SFX.music(!!s.music, typeof s.music === "string" ? { track: s.music } : {});
    else if (s.sound) SFX[s.sound]?.();
    else if (s.next) res.next = s.next;
    if (typeof s === "string" || s.ask) shown = true;
    if (mode) shown = false;
  }
  await talkWait(SCENE_END_MS);
  talkEl.classList.add("leaving");
  await sleep(500);
  talkEl.className = "";
  talkEl.innerHTML = "";
  return res;
}

// タップで、いまの待ち時間を飛ばす。選択肢はボタンか、数字キー
talkEl.addEventListener("click", e => {
  SFX.wake();
  const b = e.target.closest(".tk-opt");
  if (b && talkPick) return talkPick(+b.dataset.i);
  talkSkip = true;
});
document.addEventListener(
  "keydown",
  e => {
    if (!talkEl.classList.contains("on")) return;
    e.stopImmediatePropagation();
    SFX.wake();
    const n = +e.key;
    if (talkPick && n >= 1) {
      const b = talkEl.querySelector(`.tk-opt[data-i="${n - 1}"]`);
      if (b) return talkPick(n - 1);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      talkSkip = true;
    }
  },
  { capture: true },
);

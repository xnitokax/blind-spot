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
// 読む時間：文字数に合わせる（短い「……。」はすぐ、長い文はゆっくり読み切れるように）
const readMs = text => Math.min(7000, Math.max(1500, 600 + [...text].length * 120));
// 場面が切りかわる前と、トークの終わりに、下まで読み終えるのを待つ間
const SCENE_END_MS = 3000;

// 依頼人などの「写真」：その場で描いた絵を、粗いドット絵にして出す（px … 一辺のドット数）
//   shadow … 最初の逆光の影 ／ face … 近づいてきたときの顔（{ reveal } で、モザイクから浮かび上がる）
const PORTRAITS = {
  // 真壁 汐里：長い黒髪、黒いコート。夜の事務所で、左の窓の光が顔の半分に当たる。静かな美人で、幸の薄そうな顔（写実寄り。細いフレームのメガネ・困り眉・目尻が少し下がる・白い肌・うっすら隈）
  shiori: {
    px: 120,
    shadow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs><linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="#46555d"/><stop offset="0.5" stop-color="#20272b"/><stop offset="1" stop-color="#0d1012"/></linearGradient></defs>
    <rect width="300" height="300" fill="url(#bg)"/>
    <g fill="#7d909a" opacity="0.3"><rect x="0" y="24" width="70" height="3"/><rect x="0" y="38" width="70" height="3"/><rect x="0" y="52" width="70" height="3"/><rect x="0" y="66" width="70" height="3"/><rect x="0" y="80" width="70" height="3"/><rect x="0" y="94" width="70" height="3"/><rect x="0" y="108" width="70" height="3"/><rect x="0" y="122" width="70" height="3"/></g>
    <path d="M150 40C92 40 74 90 76 140c2 60-6 110-20 160h190c-14-50-22-100-20-160 2-50-18-100-76-100z" fill="#060708"/>
    <path d="M30 300c10-34 40-52 84-56l38 28 38-28c44 4 74 22 84 56z" fill="#040505"/>
  </svg>`,
    face: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="bg" x1="0" x2="1">
        <stop offset="0" stop-color="#46555d"/>
        <stop offset="0.5" stop-color="#20272b"/>
        <stop offset="1" stop-color="#0d1012"/>
      </linearGradient>
      <linearGradient id="skin" x1="0" x2="1" y1="0" y2="0.15">
        <stop offset="0" stop-color="#f6e6dd"/>
        <stop offset="0.5" stop-color="#e3c8ba"/>
        <stop offset="0.82" stop-color="#ad8c80"/>
        <stop offset="1" stop-color="#6b5049"/>
      </linearGradient>
      <linearGradient id="neck" x1="0" x2="1">
        <stop offset="0" stop-color="#c29e8f"/>
        <stop offset="1" stop-color="#4c3630"/>
      </linearGradient>
      <linearGradient id="hair" x1="0" x2="1">
        <stop offset="0" stop-color="#3f3b44"/>
        <stop offset="0.35" stop-color="#1c181d"/>
        <stop offset="1" stop-color="#09080a"/>
      </linearGradient>
      <linearGradient id="coat" x1="0" x2="1">
        <stop offset="0" stop-color="#2d3238"/>
        <stop offset="1" stop-color="#08090b"/>
      </linearGradient>
      <radialGradient id="blush" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#e8a5a0" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#e8a5a0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="socket" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7a5448" stop-opacity="0.26"/>
        <stop offset="1" stop-color="#7a5448" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="kuma" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7d6070" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#7d6070" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="eyeL"><path d="M110 143Q125 130 142 140Q127 149 110 143Z"/></clipPath>
      <clipPath id="eyeR"><path d="M162 140Q179 130 194 143Q177 149 162 140Z"/></clipPath>
    </defs>
    <!-- 夜の事務所。左の窓（ブラインド）から、街の青い光 -->
    <rect width="300" height="300" fill="url(#bg)"/>
    <g fill="#7d909a" opacity="0.3">
      <rect x="0" y="24" width="70" height="3"/><rect x="0" y="38" width="70" height="3"/><rect x="0" y="52" width="70" height="3"/>
      <rect x="0" y="66" width="70" height="3"/><rect x="0" y="80" width="70" height="3"/><rect x="0" y="94" width="70" height="3"/>
      <rect x="0" y="108" width="70" height="3"/><rect x="0" y="122" width="70" height="3"/>
    </g>
    <!-- うしろ髪（長い黒髪） -->
    <path d="M150 40C92 40 74 90 76 140c2 60-6 110-20 160h190c-14-50-22-100-20-160 2-50-18-100-76-100z" fill="url(#hair)"/>
    <!-- 首（細め）と、コート・白いシャツ -->
    <path d="M135 204c2 22 0 36-5 48h44c-5-12-7-26-5-48-7 9-12 14-17 14s-10-5-17-14z" fill="url(#neck)"/>
    <path d="M30 300c10-34 40-52 84-56l38 28 38-28c44 4 74 22 84 56z" fill="url(#coat)"/>
    <path d="M126 246l26 30 26-30-8-6-18 22-18-22z" fill="#d6d3cd"/>
    <!-- 顔（あごは小さく、やわらかく。左から光、右は影） -->
    <path d="M98 130c0-44 26-68 54-68s54 24 54 68c0 36-12 62-30 78-9 8-16 12-24 12s-15-4-24-12c-18-16-30-42-30-78z" fill="url(#skin)"/>
    <!-- 右頬からあごにかけての影 -->
    <path d="M178 120c8 30 4 60-10 84 14-10 24-32 26-60 1-12-2-20-16-24z" fill="#5f4138" opacity="0.3"/>
    <!-- あごの下の影 -->
    <path d="M130 208c8 8 15 12 22 12s14-4 22-12c-4 10-11 18-22 20-11-2-18-10-22-20z" fill="#4e352e" opacity="0.55"/>
    <!-- 目のくぼみ・目の下の隈・頬（ほんのり） -->
    <ellipse cx="126" cy="140" rx="19" ry="10" fill="url(#socket)"/>
    <ellipse cx="178" cy="140" rx="19" ry="10" fill="url(#socket)"/>
    <ellipse cx="126" cy="152" rx="14" ry="5" fill="url(#kuma)"/>
    <ellipse cx="178" cy="152" rx="14" ry="5" fill="url(#kuma)"/>
    <ellipse cx="118" cy="170" rx="15" ry="8" fill="url(#blush)"/>
    <ellipse cx="186" cy="170" rx="12" ry="7" fill="url(#blush)"/>
    <!-- 眉（細く、内側が上がる。困ったような、幸の薄そうな眉） -->
    <path d="M111 128Q125 124 140 123" stroke="#4a3832" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M164 123Q179 124 193 128" stroke="#2e221e" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- 左目（光が当たる側。目尻が少し下がる） -->
    <path d="M110 143Q125 130 142 140Q127 149 110 143Z" fill="#efe7e3"/>
    <g clip-path="url(#eyeL)">
      <circle cx="127" cy="141.5" r="7" fill="#4b3429"/>
      <circle cx="127" cy="142" r="4.2" fill="#2c1d17"/>
      <circle cx="127" cy="142" r="2.4" fill="#120b09"/>
      <circle cx="124.4" cy="139.4" r="1.7" fill="#fff"/>
      <circle cx="129.6" cy="144.4" r="0.9" fill="#fff" opacity="0.6"/>
    </g>
    <path d="M109 143q15-15 34-3" stroke="#160e0c" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M109 143l-3 2" stroke="#160e0c" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M113 136q12-8 26-2" stroke="#a67c6e" stroke-width="1.1" fill="none" opacity="0.7"/>
    <path d="M114 146q12 4 25-2" stroke="#9a7466" stroke-width="0.9" fill="none" opacity="0.6"/>
    <!-- 右目（影の側） -->
    <path d="M162 140Q179 130 194 143Q177 149 162 140Z" fill="#bfaba3"/>
    <g clip-path="url(#eyeR)">
      <circle cx="177" cy="141.5" r="6.8" fill="#3a271f"/>
      <circle cx="177" cy="142" r="4" fill="#22150f"/>
      <circle cx="177" cy="142" r="2.3" fill="#0d0807"/>
      <circle cx="174.6" cy="139.6" r="1.4" fill="#ece4e0"/>
    </g>
    <path d="M161 140q19-12 34 3" stroke="#110a08" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M195 143l3 2" stroke="#110a08" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M165 134q14-6 26 2" stroke="#6e4d42" stroke-width="1.1" fill="none" opacity="0.7"/>
    <!-- 鼻（小さめ。右側に影、鼻先に光） -->
    <path d="M156 142c1 13 3 22 5 29" stroke="#93695b" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M145 176q8 4 15 0" stroke="#7d5649" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="147.5" cy="177" rx="2.2" ry="1.2" fill="#6a463b" opacity="0.5"/>
    <ellipse cx="158" cy="177" rx="2.2" ry="1.2" fill="#45302a" opacity="0.7"/>
    <path d="M150 168q2-1 4 0" stroke="#fbece4" stroke-width="1.5" fill="none" opacity="0.7"/>
    <!-- 唇（小さく、淡い色。かすかに結んでいる） -->
    <path d="M139.5 197q6.2-3.4 12.5-1.2 6.3-2.2 12.5 1.2-12.5 1.8-25 0z" fill="#b8786f"/>
    <path d="M140.5 198q11.5 7.8 23 0-11.5 2.3-23 0z" fill="#d49e94"/>
    <path d="M139.5 197.6q12.5 2 25 0" stroke="#6b3a33" stroke-width="1" fill="none"/>
    <path d="M146.5 202.8q5.5 1.6 11 0" stroke="#f0c6bc" stroke-width="1.1" fill="none" opacity="0.6"/>
    <!-- メガネ（細いフレームの楕円レンズ。左のレンズに窓の光が映る） -->
    <rect x="105" y="128" width="42" height="26" rx="13" fill="#ffffff" opacity="0.05"/>
    <rect x="158" y="128" width="42" height="26" rx="13" fill="#ffffff" opacity="0.03"/>
    <path d="M110 151l16-20" stroke="#dfe9ee" stroke-width="3" opacity="0.18" stroke-linecap="round"/>
    <path d="M118 153l12-15" stroke="#dfe9ee" stroke-width="1.6" opacity="0.14" stroke-linecap="round"/>
    <g fill="none" stroke-linecap="round">
      <rect x="105" y="128" width="42" height="26" rx="13" stroke="#3a3034" stroke-width="1.5"/>
      <rect x="158" y="128" width="42" height="26" rx="13" stroke="#1d1719" stroke-width="1.5"/>
      <path d="M147 137q5.5-3.5 11 0" stroke="#2b2327" stroke-width="1.8"/>
      <path d="M105 136l-6-1" stroke="#2b2327" stroke-width="1.8"/>
      <path d="M200 136l5-1" stroke="#120e10" stroke-width="1.8"/>
    </g>
    <path d="M108 131q10-3 22-1" stroke="#9fb3bc" stroke-width="0.9" fill="none" opacity="0.5"/>
    <!-- 前髪（左で分けて、右へ流れる）と、顔の横の髪 -->
    <path d="M100 132c-2-50 26-80 56-82 34 0 54 30 48 78-8-24-22-40-40-48-6 14-20 24-42 28-10 4-16 12-22 24z" fill="url(#hair)"/>
    <path d="M100 128c-6 42-2 82 14 112-12-10-26-40-26-80 0-14 4-24 12-32z" fill="url(#hair)"/>
    <path d="M204 124c6 44 0 84-16 114 14-12 28-42 28-82 0-14-4-24-12-32z" fill="#0a090b"/>
    <!-- 頬にかかる、ほつれた髪 -->
    <path d="M101 150c-2 18 0 34 6 48" stroke="#141115" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M203 148c1 16-1 30-6 42" stroke="#0c0a0d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M138 104c-6 6-10 12-12 18" stroke="#1c181d" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <g stroke="#6e6a74" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round">
      <path d="M120 64c-12 12-18 28-20 50"/>
      <path d="M134 56c-12 14-18 30-20 46"/>
      <path d="M92 150c-2 30 2 56 12 80"/>
    </g>
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
  for (const px of [6, 10, 16, 26, 42, 64, 90, p.px]) {
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
    // 長いメッセージほど、打つのに時間がかかる
    await talkWait(Math.min(3200, 700 + [...text].length * 60));
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

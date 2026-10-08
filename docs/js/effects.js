// =========================================================
//  演出
//  画面が裂ける・文字の解読・画面が消える・侵入（breach）・裏で動く処理（ジョブ）
//  任務2の見せ場（台本の1ステップ）・チュートリアルの図と画面を光らせる
// =========================================================

// ---------------- 画面が裂ける（グリッチ） ----------------
// 横の帯ごとに画面がずれ、赤と青の色がずれる（#stage にかけた SVG フィルター #tear を、コマごとに動かす）
//   tear(ms, power) … 一度だけ裂ける（強さは power。だんだん弱まり、ところどころ元に戻るコマを挟んでカクつかせる）
//   setStorm(level) … level（0〜1）が高いほど、ひとりでに何度も裂ける（0 で止まる）
//   impact(power)   … 衝撃：画面が弾かれて、一瞬裂ける（ロック・失敗・警告など）
const TEAR = {
  stage: $("stage"),
  noise: $("tearNoise"),
  map: $("tearMap"),
  r: $("tearR"),
  b: $("tearB"),
};
const tearState = { until: 0, ms: 1, power: 0, storm: 0, raf: 0 };
function tear(ms = 300, power = 1) {
  if (REDUCED) return;
  const now = performance.now(),
    t = tearState;
  // 今の裂け方より強いときだけ、上書きする
  const left = t.until > now ? (t.power * (t.until - now)) / t.ms : 0;
  if (power >= left) Object.assign(t, { until: now + ms, ms, power });
  if (!t.raf) t.raf = requestAnimationFrame(tearFrame);
}
function setStorm(level) {
  tearState.storm = REDUCED ? 0 : Math.max(0, level || 0);
  if (tearState.storm && !tearState.raf) tearState.raf = requestAnimationFrame(tearFrame);
}
function tearFrame(now) {
  const t = tearState;
  // 嵐のときは、ときどき、ひとりでに裂ける
  if (t.storm && now >= t.until && Math.random() < 0.04 + t.storm * 0.16) {
    const ms = 60 + Math.random() * 280 * t.storm;
    Object.assign(t, { until: now + ms, ms, power: 0.2 + Math.random() * t.storm });
    if (Math.random() < 0.45) SFX.glitch();
  }
  let s = now < t.until ? t.power * (0.3 + (0.7 * (t.until - now)) / t.ms) : 0;
  if (s > 0 && Math.random() < 0.22) s *= 0.1; // ところどころ、元に戻るコマを挟む
  if (s < 0.03) TEAR.stage.classList.remove("tearing");
  else {
    TEAR.noise.setAttribute("seed", Math.floor(Math.random() * 999));
    TEAR.noise.setAttribute("baseFrequency", `0 ${(0.006 + Math.random() * 0.07).toFixed(3)}`);
    TEAR.map.setAttribute("scale", (s * (25 + Math.random() * 115)).toFixed(1));
    const d = s * (2 + Math.random() * 7);
    TEAR.r.setAttribute("dx", d.toFixed(1));
    TEAR.b.setAttribute("dx", (-d * (0.6 + Math.random() * 0.6)).toFixed(1));
    TEAR.stage.classList.add("tearing");
  }
  if (now < t.until || t.storm) t.raf = requestAnimationFrame(tearFrame);
  else {
    t.raf = 0;
    TEAR.stage.classList.remove("tearing");
  }
}
function impact(power = 1) {
  pulse($("wrap"), "shake", 560);
  tear(200 + power * 180, power * 0.7);
}

// 文字化けした状態から、左から順に正しい文字に戻っていく（解読の演出）
const GLYPH_A = "!#$%&*+=?@0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GLYPH_W =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const glyphFor = ch =>
  /\s/.test(ch) ? ch : ch.charCodeAt(0) < 0x2000 ? pickOne(GLYPH_A) : pickOne(GLYPH_W);
function textNodes(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeValue.trim() ? 1 : 3),
  });
  const list = [];
  while (w.nextNode()) list.push(w.currentNode);
  return list;
}
async function decode(el, ms = 450) {
  if (REDUCED || fast) return;
  const nodes = textNodes(el);
  const orig = nodes.map(n => [...n.nodeValue]);
  const frames = Math.max(4, Math.round(ms / 30));
  for (let f = 1; f <= frames; f++) {
    if (fast) break;
    const p = f / frames;
    nodes.forEach((n, i) => {
      const o = orig[i],
        k = Math.floor(o.length * p);
      n.nodeValue = o.slice(0, k).join("") + o.slice(k).map(glyphFor).join("");
    });
    await sleep(30);
  }
  nodes.forEach((n, i) => {
    n.nodeValue = orig[i].join("");
  });
}

// 画面が消える（ブラウン管の電源を切ったように）
//   ぴちゅんの瞬間に、BGM はすぐ止まり、画面には強いノイズが走る。揺れ・傾きは止めて、まっすぐ潰れて消える
async function powerOff() {
  killJob();
  SFX.siren(false);
  SFX.music(false, { fast: true });
  SFX.power();
  setStorm(0);
  tear(300, 2);
  $("wrap").classList.remove("glitch", "unstable", "shake", "jolt");
  spot(null);
  $("wrap").classList.add("crt-off");
  document.body.classList.remove("red", "blue");
  delete document.body.dataset.zone; // 画面が消えるときは、色合いも元に戻す
  await sleep(320);
}

// 兄のプログラムの伏線：ときどき「送信エラー」が一瞬だけ出る
function maybeNoise() {
  if (!CH?.noise || state.over || isBusy() || state.mode) return;
  if (CH.noiseStop && state.visited.has(CH.noiseStop)) return;
  state.commands++;
  if (state.commands !== 4 && Math.random() > 0.12) return;
  const pkt = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  const d = print(`[pred-feed] pkt#${pkt} → 送信エラー（destination unreachable）`, "alert noise");
  SFX.static();
  pulse($("term"), "jolt", 180);
  tear(150, 0.45);
  setTimeout(() => d.remove(), 650);
}

// ---------------- 裏で動く処理（ジョブ） ----------------
// 台本の { job: {...} } で始まる（書き方は src/scenario.js の先頭）。師匠が裏で回している権限昇格など。
// プレイヤーは操作を続けられる。ゲージが上がるにつれて、画面が少しずつ壊れていく：
//   文字がちらつく → 色がずれて画面のふちが赤くなる → 画面のあちこちが真っ暗に死んでいく → 監査のログが流れ込み、TRACE がじわじわ上がる
// stopAt のノードへ ssh すると、stop の台本が流れて止まる（台本の { jobKill: true } で KILLED になる）
let jobRun = 0; // ジョブのループの番号（止めるときに1つ進めて、動いているループを終わらせる）
function startJob(j) {
  killJob();
  const id = ++jobRun;
  const job = (state.job = { ...j, id, p: 0, done: new Set(), t0: Date.now() });
  job.panel = print(
    `<div class="fx-panel esc-panel"><div class="fx-head"><span>${esc(j.title || "PRIVILEGE ESCALATION")}</span><span>${esc(j.label || "")}</span></div>` +
      `<div class="esc-bar"></div><div class="esc-log"></div></div>`,
  ).querySelector(".esc-panel");
  $("job").classList.add("on");
  document.body.classList.add("cracking");
  makeDead();
  SFX.alert();
  jobLoop(job, id);
}
async function jobLoop(job, id) {
  const cap = (job.cap ?? 78) / 100,
    barEl = job.panel.querySelector(".esc-bar"),
    log = job.panel.querySelector(".esc-log");
  const once = (k, fn) => {
    if (!job.done.has(k)) {
      job.done.add(k);
      fn();
    }
  };
  while (jobRun === id) {
    const sec = (Date.now() - job.t0) / 1000;
    // はじめは速く上がり、天井（cap）に近づくほど遅くなる。天井の手前でほぼ止まる
    job.p = Math.max(
      0,
      cap * (1 - Math.exp(-sec / (job.pace ?? 9))) + (Math.random() - 0.5) * 0.006,
    );
    const pct = Math.round(job.p * 100);
    const lvl = Math.max(0, Math.min(1, (job.p - 0.26) / (cap - 0.26))); // 壊れ具合（0〜1）
    const stalled = job.p > cap - 0.025;
    barEl.textContent = `${bar(job.p, 30)} ${pct}%${stalled ? "  ── STALLED" : ""}`;
    barEl.classList.toggle("stall", stalled);
    $("job").classList.toggle("hot", lvl > 0.55);
    $("job").innerHTML =
      `<span class="jb-tag">[1] ${stalled ? "STALLED" : "RUNNING"}</span><span class="jb-name">${esc(job.name || "")}</span>` +
      `<span class="jb-bar">${bar(job.p, 14)}</span><span class="jb-p">${pct}%</span>`;
    // 壊れていく画面
    document.body.style.setProperty("--crack", lvl.toFixed(3));
    drawDead(lvl);
    setStorm(lvl * 0.7);
    if (lvl > 0.25 && Math.random() < lvl * 0.45) flickerText();
    if (lvl > 0.5 && Math.random() < lvl * 0.2) addLog(`AUDIT ⇄ ${randIp()}  session check`, "bad");
    if (lvl > 0.4 && state.trace < (job.traceMax ?? 42)) {
      state.trace = Math.min(job.traceMax ?? 42, state.trace + lvl * 0.3);
      updateTrace();
    }
    if (Math.random() < lvl * 0.035) SFX.crack();
    // 警告（[パーセント, 文字]）と、師匠のつぶやき（[パーセント, セリフ]）。それぞれ一度だけ
    for (const [at, w] of job.warn || [])
      if (pct >= at)
        once(`w${at}`, () => {
          log.insertAdjacentHTML(
            "beforeend",
            `<div class="alert glitchline">[!] ${esc(fill(w))}</div>`,
          );
          SFX.alert();
          impact(0.5 + lvl * 0.6);
          scrollDown();
        });
    for (const [at, line] of job.mutter || [])
      if (pct >= at)
        once(`m${at}`, () => {
          duckBgm();
          typeLine(line);
        });
    // 「次の一手」は、画面が壊れ始めてから出す（それまでは、ただ見守る）
    if (pct >= (job.nextAt ?? 0) && job.next) once("next", () => setGuide(job.next));
    await sleep(120);
  }
}
// 裏の処理を、stopAt で止める（stop の台本。途中の { jobKill: true } で KILLED になる）
async function stopJob() {
  const job = state.job;
  if (!job) return;
  jobRun++; // ゲージはそこで止まる（画面は壊れたまま、師匠が話す）
  setStorm(0.2);
  await play(job.stop || []);
  if (state.job) await killJobFx();
}
// KILLED のはんこ → 真っ暗になったところが明るさを取り戻し、画面が元に戻る
async function killJobFx() {
  const job = state.job;
  if (!job) return;
  job.panel.querySelector(".esc-bar").classList.remove("stall");
  job.panel.insertAdjacentHTML("beforeend", `<div class="bp-stamp bad">KILLED</div>`);
  SFX.power();
  tear(520, 1.2);
  killJob({ heal: true });
  scrollDown();
  await pause(450);
  pulse($("fx"), "zone-in", 650);
  pulse($("term"), "flash-ok", 600);
  SFX.granted();
  await pause(700);
}
// 止める（画面の壊れも元に戻す）。heal … ひびがゆっくり消える
function killJob(opt = {}) {
  jobRun++;
  if (state) state.job = null;
  setStorm(0);
  document.body.classList.remove("cracking");
  document.body.style.removeProperty("--crack");
  $("job").classList.remove("on", "hot");
  $("job").innerHTML = "";
  // 死んだマス：heal なら、ゆっくり明るさが戻る
  const dead = $("dead");
  if (opt.heal && dead.children.length) {
    dead.classList.add("heal");
    setTimeout(() => {
      if (dead.classList.contains("heal")) {
        dead.innerHTML = "";
        dead.classList.remove("heal");
      }
    }, 900);
  } else {
    dead.innerHTML = "";
    dead.classList.remove("heal");
  }
}
// 画面が死んでいく：画面を細かいマスに分け、いくつかの点から黒い染みが広がっていく
//   入力欄と NEXT 欄（#dock）の上のマスは死なせない（次の一手が押せなくなるので）
function makeDead() {
  const box = $("dead"),
    W = innerWidth,
    H = innerHeight;
  const cols = W < 600 ? 10 : 18,
    rows = W < 600 ? 16 : 12,
    cw = W / cols,
    ch = H / rows;
  box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  box.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  box.innerHTML = "<i></i>".repeat(cols * rows);
  box.classList.remove("heal");
  const dock = $("dock").getBoundingClientRect();
  const safe = (r, c) =>
    !(
      c * cw < dock.right + 8 &&
      (c + 1) * cw > dock.left - 8 &&
      r * ch < dock.bottom + 8 &&
      (r + 1) * ch > dock.top - 30
    );
  // 死ぬ順番：いくつかの点から、となりのマスへ少しずつ広がる
  const order = [],
    seen = new Set(),
    front = [];
  const add = (r, c) => {
    const k = r * cols + c;
    if (r < 0 || c < 0 || r >= rows || c >= cols || seen.has(k)) return;
    seen.add(k);
    if (safe(r, c)) front.push(k);
  };
  for (let i = 0; i < 4; i++)
    add(Math.floor(Math.random() * rows * 0.75), Math.floor(Math.random() * cols));
  while (front.length) {
    const k = front.splice(Math.floor(Math.random() * front.length), 1)[0];
    order.push(k);
    const r = Math.floor(k / cols),
      c = k % cols;
    add(r - 1, c);
    add(r + 1, c);
    add(r, c - 1);
    add(r, c + 1);
  }
  state.job.dead = { cells: [...box.children], order, n: 0 };
}
function drawDead(lvl) {
  const d = state.job?.dead;
  if (!d) return;
  // 壊れ具合が 0.3 を越えたところから死に始め、天井では画面の半分近くが真っ暗になる
  const want = Math.floor(d.order.length * 0.48 * Math.max(0, Math.min(1, (lvl - 0.3) / 0.7)));
  while (d.n < want) {
    const cell = d.cells[d.order[d.n++]];
    cell.classList.add("dying");
    setTimeout(() => {
      cell.classList.remove("dying");
      cell.classList.add("dead");
    }, 500);
    if (Math.random() < 0.3) SFX.glitch();
  }
}

// 画面の文字が一瞬だけ化けて、すぐ戻る
function flickerText() {
  const nodes = textNodes(out).slice(-140);
  if (!nodes.length) return;
  const n = pickOne(nodes),
    orig = n.nodeValue,
    chars = [...orig];
  for (let k = 0; k < 2 + Math.random() * 6; k++) {
    const j = Math.floor(Math.random() * chars.length);
    chars[j] = glyphFor(chars[j]);
  }
  const broken = chars.join("");
  n.nodeValue = broken;
  setTimeout(
    () => {
      if (n.nodeValue === broken) n.nodeValue = orig;
    },
    120 + Math.random() * 380,
  );
}

// 侵入の演出：守りの壁が崩れていき、手順ごとのバーが埋まって、最後に ACCESS GRANTED のはんこ
//   バーのクラスは .bp-bar（.bar にすると TRACE のメーターの見た目になり、高さ 10px で中身が隠れてしまう）
async function breach(node) {
  const cols = 40,
    rows = 4;
  const panel = print(`<div class="breach-panel">
    <div class="bp-head"><span>BREACH <span class="bp-live">●</span></span><span>${esc(node.host)}</span></div>
    <div class="bp-wall"></div><div class="bp-steps"></div></div>`).querySelector(".breach-panel");
  const wallEl = panel.querySelector(".bp-wall"),
    steps = panel.querySelector(".bp-steps");
  const wall = Array.from({ length: rows }, () => Array(cols).fill("█"));
  const drawWall = () => {
    wallEl.textContent = wall.map(r => r.join("")).join("\n");
  };
  // 壁を少しずつ崩す（残っている █ を、▓ → ░ → 空白 の順に）
  const crumble = n => {
    for (let k = 0; k < n; k++) {
      const r = Math.floor(Math.random() * rows),
        c = Math.floor(Math.random() * cols);
      wall[r][c] = { "█": "▓", "▓": "░", "░": " " }[wall[r][c]] ?? " ";
    }
    drawWall();
  };
  drawWall();
  tear(220, 0.55);
  const per = Math.ceil((cols * rows * 3) / (node.breach.length * 10));
  for (const label of node.breach) {
    const row = document.createElement("div");
    row.className = "bp-step";
    row.innerHTML = `<span class="lab">${esc(label)}</span><span class="bp-bar"></span>`;
    steps.appendChild(row);
    const gauge = row.querySelector(".bp-bar");
    for (let f = 1; f <= 10; f++) {
      gauge.innerHTML = `[${"▮".repeat(f)}${"·".repeat(10 - f)}] <span class="hex">${randHex(2)}</span>`;
      crumble(per);
      SFX.tick();
      scrollDown();
      await wait(34);
    }
    gauge.innerHTML = `[▮▮▮▮▮▮▮▮▮▮]<span class="ok">OK</span>`;
    row.classList.add("done");
    SFX.hop(0);
    tear(110, 0.3);
    scrollDown();
    await wait(110);
  }
  // 残りの壁が、一気に砕け散る
  SFX.crack();
  tear(520, 1.1);
  for (let i = 0; i < 5; i++) {
    crumble(cols * rows);
    await wait(45);
  }
  wallEl.remove(); // 崩れきった壁は消して、はんこだけ残す
  panel.querySelector(".bp-live").remove();
  panel.insertAdjacentHTML("beforeend", `<div class="bp-stamp">ACCESS GRANTED</div>`);
  SFX.granted();
  pulse($("term"), "flash-ok", 600);
  scrollDown();
  await wait(650);
}

// ---------------- 任務2の見せ場の演出（台本の1ステップ） ----------------
// どれも「見て楽しい」ための演出。サクサク進める場面とは逆に、たっぷり時間をかけて派手に見せる
// （待ち時間は pause：任務2のテンポが上がっても短くならない）
const FILE_WORDS = [
  "議事録",
  "見積書",
  "請求書",
  "週報",
  "設計書",
  "提案書",
  "契約書",
  "研修資料",
  "勤怠",
  "稟議",
  "仕様書",
  "予算案",
  "報告書",
  "名簿",
  "写真",
];
const FILE_EXT = [".xlsx", ".docx", ".pdf", ".pptx", ".csv", ".zip", ".jpg"];
const fakeFile = () =>
  `${pickOne(["/share", "/projects", "/home/sales", "/home/hr", "/archive"])}/${pickOne(FILE_WORDS)}_${2019 + Math.floor(Math.random() * 8)}${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}${pickOne(FILE_EXT)}`;
// 流れていく伝票の1行（見た目だけ）
const fakeLedger = () =>
  `伝票 #${80000 + Math.floor(Math.random() * 19999)}  2026/${String(1 + Math.floor(Math.random() * 9)).padStart(2, "0")}/${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}  ${pickOne(["営業本部", "総務部", "人事部", "経理部", "情報システム部", "広報部"])}  ${pickOne(["交通費", "消耗品費", "会議費", "外注費", "保守費", "広告費"])}  ¥${(Math.floor(Math.random() * 9e6) + 1000).toLocaleString().padStart(11)}`;
let lastBuilding = null; // { building } で描いたビル（{ lights: "on" } で明かりを戻す）
let lastMapNodes = null;
// 点描の世界地図に使う、ざっくりした大陸の形（[経度, 緯度] の多角形）
const WORLD = [
  [
    [-168, 66],
    [-140, 70],
    [-100, 72],
    [-80, 70],
    [-62, 60],
    [-55, 50],
    [-66, 44],
    [-75, 35],
    [-81, 25],
    [-97, 26],
    [-97, 19],
    [-88, 16],
    [-83, 9],
    [-78, 8],
    [-92, 15],
    [-105, 22],
    [-112, 30],
    [-117, 33],
    [-124, 40],
    [-124, 48],
    [-133, 57],
    [-150, 60],
    [-165, 60],
  ],
  [
    [-55, 60],
    [-40, 60],
    [-20, 70],
    [-20, 80],
    [-45, 83],
    [-70, 78],
    [-60, 70],
  ],
  [
    [-80, 10],
    [-62, 10],
    [-50, 0],
    [-35, -6],
    [-39, -15],
    [-48, -26],
    [-58, -38],
    [-65, -55],
    [-72, -50],
    [-71, -30],
    [-76, -15],
    [-81, -5],
  ],
  [
    [-10, 36],
    [-9, 44],
    [-2, 49],
    [3, 52],
    [5, 58],
    [5, 62],
    [10, 70],
    [28, 71],
    [40, 67],
    [40, 45],
    [28, 41],
    [20, 40],
    [12, 38],
    [0, 38],
  ],
  [
    [-6, 50],
    [2, 51],
    [0, 55],
    [-3, 58],
    [-6, 56],
  ],
  [
    [-17, 21],
    [-10, 33],
    [10, 37],
    [32, 31],
    [35, 28],
    [43, 12],
    [51, 12],
    [40, -5],
    [40, -15],
    [32, -28],
    [20, -35],
    [13, -25],
    [9, -2],
    [-8, 4],
    [-17, 14],
  ],
  [
    [40, 67],
    [70, 73],
    [110, 77],
    [140, 72],
    [170, 68],
    [180, 66],
    [160, 58],
    [142, 52],
    [135, 43],
    [128, 38],
    [126, 35],
    [122, 30],
    [120, 23],
    [108, 18],
    [105, 10],
    [100, 13],
    [98, 8],
    [92, 20],
    [80, 15],
    [77, 8],
    [72, 20],
    [66, 25],
    [57, 25],
    [48, 30],
    [36, 36],
    [40, 45],
  ],
  [
    [130, 31],
    [135, 34],
    [141, 37],
    [142, 43],
    [145, 44],
    [141, 41],
    [139, 35],
    [133, 33],
  ],
  [
    [95, 5],
    [105, -6],
    [120, -9],
    [130, -8],
    [140, -6],
    [150, -6],
    [140, 0],
    [125, 7],
    [118, 5],
    [110, 2],
    [100, 5],
  ],
  [
    [113, -22],
    [114, -34],
    [130, -32],
    [140, -38],
    [150, -37],
    [153, -28],
    [145, -15],
    [136, -12],
    [130, -12],
    [123, -17],
  ],
]; // { worldmap } の接続で置いた中継点（逆探知のときに再利用する）

// 世界地図を作る（equirectangular。x,y は 0〜1 で位置を指定）。陸地は、ざっくりした帯の中に点を散らして表す
function buildWorldMap(nodes) {
  const W = 1000,
    H = 500;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "wm-svg");
  const el = (tag, attrs) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  // 経緯線
  for (let i = 1; i < 6; i++)
    svg.appendChild(
      el("line", { class: "wm-grat", x1: 0, y1: (H * i) / 6, x2: W, y2: (H * i) / 6 }),
    );
  for (let i = 1; i < 12; i++)
    svg.appendChild(
      el("line", { class: "wm-grat", x1: (W * i) / 12, y1: 0, x2: (W * i) / 12, y2: H }),
    );
  // 陸地：ざっくりした大陸の形（経度・緯度）の内側に、点を規則正しく打つ（点描の世界地図）
  const polys = WORLD.map(poly => poly.map(([lon, lat]) => [(lon + 180) / 360, (90 - lat) / 180]));
  const inside = (x, y, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i],
        [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const cols = 120,
    rows = 60;
  let dots = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) / cols,
        y = (r + 0.5) / rows;
      if (polys.some(p => inside(x, y, p)))
        dots += `M${(x * W).toFixed(1)} ${(y * H).toFixed(1)}h0.01`;
    }
  svg.appendChild(el("path", { class: "wm-land", d: dots }));
  // 中継点の間を、上にふくらむ曲線でつなぐ
  const pt = n => ({ x: n.x * W, y: n.y * H });
  const arcs = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = pt(nodes[i - 1]),
      b = pt(nodes[i]);
    const mx = (a.x + b.x) / 2,
      my = Math.min(a.y, b.y) - Math.hypot(b.x - a.x, b.y - a.y) * 0.22;
    const path = el("path", { class: "wm-arc", d: `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}` });
    svg.appendChild(path);
    arcs.push(path);
  }
  // 中継点（ピン・ラベル・タグ）。ラベルとタグは、光が着くまで隠しておく
  //   lp … ラベルの向き（ne 右上 / nw 左上 / se 右下 / sw 左下）。省略すると、右寄りの点は左上、それ以外は右上
  const pins = [];
  nodes.forEach(n => {
    const P = pt(n);
    const ring = el("circle", { class: "wm-ring", cx: P.x, cy: P.y, r: 3 });
    svg.appendChild(ring);
    const pin = el("circle", { class: "wm-pin", cx: P.x, cy: P.y, r: 5 });
    svg.appendChild(pin);
    const lp = n.lp || (n.x > 0.6 ? "nw" : "ne"),
      left = lp[1] === "w",
      below = lp[0] === "s";
    const g = el("g", { class: "wm-info" });
    const ly = below ? P.y + 20 : P.y - 10;
    const lab = el("text", {
      class: "wm-label",
      x: P.x + (left ? -10 : 10),
      y: ly,
      "text-anchor": left ? "end" : "start",
    });
    lab.textContent = n.name;
    g.appendChild(lab);
    if (n.tag) {
      const tw = n.tag.length * 9 + 12,
        ty = below ? ly + 6 : ly - 34;
      g.appendChild(
        el("rect", {
          class: "wm-tagbg" + (n.tag === "YOU" ? " you" : ""),
          x: left ? P.x - 10 - tw : P.x + 10,
          y: ty,
          width: tw,
          height: 18,
          rx: 2,
        }),
      );
      const tg = el("text", {
        class: "wm-tag",
        x: left ? P.x - 10 - tw / 2 : P.x + 10 + tw / 2,
        y: ty + 13.5,
        "text-anchor": "middle",
      });
      tg.textContent = n.tag;
      g.appendChild(tg);
    }
    svg.appendChild(g);
    pins.push({ pin, ring, lab: g });
  });
  return { svg, arcs, pins, W, H, pt: nodes.map(pt) };
}
// 中継点から中継点へ、光の点が走る（道が後ろから現れる）。red で赤くたどる
async function wmTravel(path, dot, ms, back) {
  const len = path.getTotalLength();
  if (back) {
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = 0;
  } else {
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
  }
  const t0 = performance.now();
  return new Promise(res => {
    const frame = now => {
      let p = Math.min(1, (now - t0) / ms);
      if (fast) p = 1;
      const at = back ? 1 - p : p;
      const pos = path.getPointAtLength(len * at);
      dot.setAttribute("cx", pos.x);
      dot.setAttribute("cy", pos.y);
      if (!back) path.style.strokeDashoffset = len * (1 - p);
      if (p < 1) tick();
      else res();
    };
    // requestAnimationFrame はタブが裏にあると止まってしまう（戻るまで進まない）ので、タイマーで回す
    //（裏ではタイマーもゆっくりになるが、経過時間で位置を決めているので、遅れずに最後まで進む）
    const tick = () => setTimeout(() => frame(performance.now()), 16);
    tick();
  });
}

const bar = (p, w = 24) => `${"█".repeat(Math.round(p * w))}${"░".repeat(w - Math.round(p * w))}`;

async function playFx(s) {
  // { flood: 行数, kind: "file" | "log" } … ファイル（ログ）が画面にあふれ出てくる。だんだん速くなる
  if (s.flood) {
    const box = print(`<div class="flood"></div>`).querySelector(".flood");
    for (let i = 0; i < s.flood; i++) {
      box.textContent +=
        (i ? "\n" : "") +
        (s.kind === "log" ? fakeLogLine() : s.kind === "ledger" ? fakeLedger() : fakeFile());
      box.scrollTop = box.scrollHeight;
      if (i % 3 === 0) SFX.tick();
      await pause(Math.max(8, 60 - i * 1.2));
    }
  }
  // { mark: "文字" } … あふれた中から、目立つ1行を浮かび上がらせる
  if (s.mark) {
    SFX.alert();
    print(`<span class="mark">${esc(fill(s.mark))}</span>`, "markline");
    await pause(500);
  }
  // { scan: { total, cats: [[名前, 数], ...], found } } … AIが分類していき、分類できないものが1つ残る
  if (s.scan) {
    const sc = s.scan;
    const panel =
      print(`<div class="fx-panel scan-panel"><div class="fx-head"><span>AI SCAN</span><span class="sc-n">0 / ${sc.total.toLocaleString()}</span></div>
      <div class="sc-bar"></div><div class="sc-cats">${sc.cats.map(([k]) => `<div><span>${esc(k)}</span><span class="sc-c">0</span></div>`).join("")}</div></div>`).querySelector(
        ".scan-panel",
      );
    const nEl = panel.querySelector(".sc-n"),
      barEl = panel.querySelector(".sc-bar"),
      cEls = [...panel.querySelectorAll(".sc-c")];
    const frames = 36;
    for (let f = 1; f <= frames; f++) {
      const p = f / frames;
      nEl.textContent = `${Math.round(sc.total * p).toLocaleString()} / ${sc.total.toLocaleString()}`;
      barEl.textContent = bar(p, 30);
      sc.cats.forEach(([, n], i) => {
        cEls[i].textContent = Math.round(n * Math.min(1, p * (1 + i * 0.15))).toLocaleString();
      });
      if (f % 2 === 0) SFX.tick();
      await pause(55);
    }
    if (sc.found) {
      await pause(300);
      SFX.alert();
      panel.insertAdjacentHTML(
        "beforeend",
        `<div class="sc-found">${esc(sc.foundLabel || "分類できないもの")}：${esc(fill(sc.found))}</div>`,
      );
      scrollDown();
      await pause(900);
    }
  }
  // { locked: "説明" } … 開こうとして、LOCKED で弾かれる
  if (s.locked) {
    SFX.denied();
    impact();
    print(panelHtml("lock", "LOCKED", esc(fill(s.locked))));
    await pause(300);
    SFX.lock();
    await pause(900);
  }
  // { battle: { lose: true } } … こちらと防壁の押し合い。押したり押し返されたりして、最後は負ける
  if (s.battle) {
    const line = print(
      `<div class="fx-panel battle"><div class="fx-head"><span>YOU</span><span>ICE</span></div><div class="bt-bar"></div><div class="bt-log dim"></div></div>`,
    ).querySelector(".battle");
    const barEl = line.querySelector(".bt-bar"),
      log = line.querySelector(".bt-log");
    let p = 0.5;
    const moves = [0.08, 0.06, -0.1, 0.12, -0.05, 0.09, -0.14, 0.04, -0.12, -0.16, -0.2, -0.3];
    for (const m of moves) {
      for (let k = 0; k < 6; k++) {
        p = Math.max(0, Math.min(1, p + m / 6 + (Math.random() - 0.5) * 0.02));
        barEl.textContent = `${"▮".repeat(Math.round(p * 30))}│${"▯".repeat(30 - Math.round(p * 30))}`;
        log.textContent = `${m > 0 ? "push" : "pull"}  0x${randHex(4).replace(/ /g, "")}  ${(p * 100).toFixed(1)}%`;
        SFX.tick();
        await pause(40);
      }
      if (m < -0.15) {
        pulse($("term"), "jolt", 180);
        tear(160, 0.5);
      }
    }
    barEl.textContent = `│${"▯".repeat(30)}`;
    SFX.denied();
    impact();
    line.classList.add("lost");
    await pause(700);
  }
  // { file: { name, lines: [...] } } … ファイルを開いて中身を見せる
  if (s.file) {
    SFX.card();
    const card = print(
      `<div class="fx-panel file-card"><div class="fx-head"><span>FILE</span><span>${esc(fill(s.file.name))}</span></div>` +
        `<div class="fc-body">${s.file.lines.map(l => esc(fill(l))).join("<br>")}</div></div>`,
    );
    await decode(card, 700);
    await pause(800);
  }
  // { rebuild: true } … 画面がはがれ落ちて、新しく組み直されて戻ってくる（大きな権限を手に入れたとき）
  //   画面が裂けながら一本の光に潰れる → 光の線のまま中身が書きかわる → 線から弾むように組み直される
  if (s.rebuild) {
    const term = $("wrap"); // ターミナルだけでなく、TRACE の欄も含めた画面全体
    SFX.boom();
    SFX.crack();
    setStorm(0.9);
    tear(1000, 1.5);
    term.classList.add("shatter");
    await pause(1000);
    setStorm(0);
    term.classList.replace("shatter", "collapsed");
    SFX.power();
    // 光の線も消えて、真っ暗になる（そのあいだに、裏で中身が書きかわる）
    await pause(120);
    term.classList.add("dark");
    document.body.classList.add("blackout");
    for (let i = 0; i < 8; i++) {
      print(`0x${randHex(2).replace(/ /g, "")}  ${randHex(14)}`, "dim");
      await pause(110);
    }
    await pause(500);
    document.body.classList.remove("blackout");
    term.classList.remove("dark");
    term.classList.replace("collapsed", "reform");
    SFX.warp();
    tear(800, 0.9);
    await pause(1150);
    term.classList.remove("reform");
    pulse($("fx"), "zone-in", 650);
  }
  // { layer: true } … 世界が少し作り変わる（色はそのまま、画面の文字が一度くずれて組み直される）
  if (s.layer) {
    const nodes = textNodes(out).slice(-160);
    const orig = nodes.map(n => n.nodeValue);
    pulse($("fx"), "zone-in", 650);
    SFX.static();
    setStorm(0.45);
    tear(500, 1);
    const end = Date.now() + 1400;
    while (Date.now() < end) {
      for (let i = 0; i < 30; i++) {
        const k = Math.floor(Math.random() * nodes.length),
          n = nodes[k],
          chars = [...n.nodeValue];
        if (!chars.length) continue;
        const j = Math.floor(Math.random() * chars.length);
        chars[j] = glyphFor(chars[j]);
        n.nodeValue = chars.join("");
      }
      if (Math.random() < 0.3) SFX.tick();
      await sleep(45);
    }
    setStorm(0);
    // 下から順に、元の文字へ戻していく
    for (let i = nodes.length - 1; i >= 0; i--) {
      nodes[i].nodeValue = orig[i];
      if (i % 8 === 0) {
        SFX.tick();
        await sleep(12);
      }
    }
    tear(400, 0.7);
    pulse($("fx"), "zone-in", 650);
    SFX.warp();
    await pause(600);
  }
  // { breach: { host, steps: [...] } } … 守りの壁が崩れて ACCESS GRANTED になる演出（システムに入るときと同じもの）
  if (s.breach) await breach({ host: s.breach.host, breach: s.breach.steps });
  // { flag: "名前" } … 状況の印をつける（notes の need / not で、師匠の反応を変える）
  if (s.flag) {
    state.flags[s.flag] = true;
    // その flag で行けるようになった場所を、今いる場所の行き先に足す
    if (state.bodyLinks) {
      state.links = [...state.bodyLinks, ...navLinks(state.bodyLinks)];
      updateNext();
    }
  }
  // { doc: "HTML", hidden, clue, ms } … 文書を1件、解読しながら出す（hidden は赤い文字）。clue があれば手がかりにする
  if (s.doc) {
    await decode(
      print(
        `<div class="doc${s.hidden ? " hidden-data" : ""}">${s.doc}</div>`,
        "node result reveal",
      ),
      s.ms || 1200,
    );
  }
  // { clue: "名前" } … 手がかりを記録する（doc と一緒に書けば、文書を出したあとに記録する）
  if (s.clue) {
    await pause(500);
    await addClue(s.clue);
  }
  // { escalate: { label, warn: [...], ok } } … 権限昇格。ok なら 100% まで行って GRANTED、そうでなければ途中で警告が出て止まる
  if (s.escalate) {
    const e = s.escalate;
    const panel = print(
      `<div class="fx-panel esc-panel"><div class="fx-head"><span>PRIVILEGE ESCALATION</span><span>${esc(e.label || "")}</span></div><div class="esc-bar"></div><div class="esc-log"></div></div>`,
    ).querySelector(".esc-panel");
    const barEl = panel.querySelector(".esc-bar"),
      log = panel.querySelector(".esc-log");
    const warns = e.warn || [];
    const steps = ["kernel token", "session ring", "policy table", "audit hook", "root ACL"];
    for (let f = 1; f <= 40; f++) {
      const p = e.ok ? f / 40 : Math.min(0.72, (f / 40) * 0.9) + (Math.random() - 0.5) * 0.02;
      barEl.textContent = `${bar(p, 30)} ${Math.round(p * 100)}%`;
      const w = warns[Math.floor((f - 10) / 10)];
      if (f >= 10 && f % 10 === 0 && w) {
        log.insertAdjacentHTML("beforeend", `<div class="alert">[!] ${esc(w)}</div>`);
        SFX.alert();
        addTrace(4);
      }
      if (e.ok && f % 8 === 0) {
        log.insertAdjacentHTML(
          "beforeend",
          `<div class="dim">[+] patch ${esc(steps[f / 8 - 1] || "")} ... OK</div>`,
        );
        SFX.hop(f / 8);
      }
      SFX.tick();
      await pause(70);
    }
    if (e.ok) {
      panel.insertAdjacentHTML("beforeend", `<div class="bp-stamp">GRANTED</div>`);
      SFX.granted();
      tear(450, 1);
      pulse($("term"), "flash-ok", 600);
      scrollDown();
      await pause(700);
    } else {
      barEl.classList.add("stall");
      await pause(400);
    }
  }
  // { race: { label, ms } } … 時間切れまでのバーが減っていく（ギリギリで間に合う）
  // ours があると、こっちの作業のバーも並んで伸び、残り beat 秒で先に終わる（ギリギリ間に合った、が見える）
  if (s.race) {
    const r = s.race;
    const line = print(
      `<div class="fx-panel race"><div class="fx-head"><span>${esc(r.label)}</span><span class="rc-t"></span></div><div class="rc-bar"></div>` +
        (r.ours
          ? `<div class="fx-head rc-ours-head"><span>${esc(r.ours)}</span><span class="rc-p"></span></div><div class="rc-ours"></div>`
          : "") +
        `</div>`,
    ).querySelector(".race");
    const t0 = Date.now(),
      total = r.ms || 2400,
      oursMs = total - (r.beat || 0) * 1000;
    const barEl = line.querySelector(".rc-bar"),
      tEl = line.querySelector(".rc-t");
    const oursEl = line.querySelector(".rc-ours"),
      pEl = line.querySelector(".rc-p");
    while (true) {
      const el = Date.now() - t0,
        left = Math.max(0, 1 - el / total);
      barEl.textContent = bar(left, 30);
      tEl.textContent = `${((left * total) / 1000).toFixed(2)}s`;
      SFX.tick();
      if (r.ours) {
        const p = Math.min(1, el / oursMs);
        oursEl.textContent = bar(p, 30);
        pEl.textContent = p >= 1 ? "100% ✔ 確保" : `${Math.floor(p * 100)}%`;
        if (p >= 1) {
          tEl.textContent = `残り ${(r.beat || 0).toFixed(2)}s`;
          break;
        }
      }
      if (left <= 0) break;
      await sleep(50);
    }
    // 間に合った：空になった瞬間に、ギリギリ確保できた合図
    line.classList.add("saved");
    SFX.granted();
  }
  // { worldmap: { head, nodes:[{name,x,y,tag}], mode:"connect"|"trace", note } }
  //   connect … 回線が中継点を1つずつつないで、世界を回る ／ trace … 逆に、赤い光が自分へ向かって遡ってくる
  if (s.worldmap) {
    const m = s.worldmap,
      trace = m.mode === "trace";
    const nodes = m.nodes || lastMapNodes;
    if (nodes) {
      if (!trace) lastMapNodes = nodes;
      const map = buildWorldMap(nodes);
      const panel = print(
        `<div class="fx-panel worldmap${trace ? " trace" : ""}"><div class="fx-head"><span>${esc(fill(m.head || (trace ? "TRACE ── 接続元を逆探知" : "ROUTE")))}</span><span class="wm-n"></span></div></div>`,
      ).querySelector(".worldmap");
      panel.appendChild(map.svg);
      const svgns = "http://www.w3.org/2000/svg";
      const dot = document.createElementNS(svgns, "circle");
      dot.setAttribute("class", "wm-dot" + (trace ? " red" : ""));
      dot.setAttribute("r", "4.5");
      map.svg.appendChild(dot);
      const nEl = panel.querySelector(".wm-n");
      scrollDown();
      if (!trace) {
        // 出発点を点ける
        map.pins[0].pin.classList.add("on");
        map.pins[0].lab.classList.add("on");
        const p0 = map.pt[0];
        dot.setAttribute("cx", p0.x);
        dot.setAttribute("cy", p0.y);
        SFX.hop(0);
        await pause(300);
        for (let i = 1; i < nodes.length; i++) {
          nEl.textContent = `HOP ${i} / ${nodes.length - 1}`;
          await wmTravel(map.arcs[i - 1], dot, m.ms || 650, false);
          map.pins[i].pin.classList.add("on");
          map.pins[i].lab.classList.add("on");
          map.pins[i].ring.classList.add("on");
          SFX.hop(i);
          tear(90, 0.25);
          await pause(260);
        }
        await pause(500);
      } else {
        // 逆探知：全部つながった状態から、赤い光が自分へ遡ってくる
        map.pins.forEach(p => {
          p.pin.classList.add("on");
          p.lab.classList.add("on");
        });
        map.arcs.forEach(a => a.classList.add("red"));
        const last = nodes.length - 1,
          pL = map.pt[last];
        dot.setAttribute("cx", pL.x);
        dot.setAttribute("cy", pL.y);
        map.pins[last].pin.classList.add("hit");
        map.pins[last].lab.classList.add("hit");
        SFX.alert();
        // 自分の1つ手前まで遡る（最後の1ホップは、足跡を消して断ち切る）
        for (let i = last; i >= 2; i--) {
          nEl.textContent = `接続元まで　あと ${i} ホップ`;
          await wmTravel(map.arcs[i - 1], dot, m.ms || 620, true);
          map.pins[i - 1].pin.classList.add("hit");
          map.pins[i - 1].lab.classList.add("hit");
          map.pins[i - 1].ring.classList.add("on", "red");
          SFX.denied();
          tear(160, 0.4);
          await pause(240);
        }
        nEl.textContent = "接続元まで　あと 1 ホップ";
        const note = document.createElement("div");
        note.className = "wm-note blink";
        note.textContent = fill(m.note || "日本まで、あと1ホップ ── 回線を切れ");
        panel.appendChild(note);
        impact(0.8);
        await pause(900);
      }
    }
  }
  // { split: { theirs:[...], mine:[...], ms } } … 画面を2つに割る（自分の端末／師匠の端末）。師匠側が、裏で打っているコマンドを流す
  if (s.split) {
    const sp = s.split;
    const panel = print(
      `<div class="fx-panel split-term"><div class="split-grid">` +
        `<div class="st-pane"><div class="st-head"><span>${esc(fill(sp.mineLabel || "YOU"))}</span><span class="dot">●</span></div><div class="st-body mine"></div></div>` +
        `<div class="st-pane theirs"><div class="st-head"><span>${esc(fill(sp.theirsLabel || "師匠の端末"))}</span><span class="dot">●</span></div><div class="st-body theirs"></div></div>` +
        `</div></div>`,
    ).querySelector(".split-term");
    const mineEl = panel.querySelector(".st-body.mine"),
      theirsEl = panel.querySelector(".st-body.theirs");
    scrollDown();
    for (const l of sp.mine || []) {
      mineEl.insertAdjacentHTML("beforeend", `<div>${fill(l)}</div>`);
      await pause(120);
    }
    // 師匠側：1行ずつ、打っている感じで流す
    const cur = document.createElement("div");
    cur.className = "st-cur";
    theirsEl.appendChild(cur);
    for (const l of sp.theirs || []) {
      const line = fill(l),
        isCmd = line.startsWith("$");
      const row = document.createElement("div");
      if (isCmd) row.innerHTML = `<span class="ps2">師匠@safehouse:~$</span> `;
      theirsEl.insertBefore(row, cur);
      if (isCmd) {
        const body = line.slice(1).trim();
        for (const ch of body) {
          row.insertAdjacentText("beforeend", ch);
          if (ch.trim()) SFX.key();
          if (fast) {
          } else await sleep(22);
        }
        SFX.enter();
      } else {
        row.innerHTML = line
          .replace(/\[OK\]/g, '<span class="ok2">[OK]</span>')
          .replace(/\[!\]/g, '<span class="warn2">[!]</span>');
        SFX.tick();
      }
      theirsEl.scrollTop = theirsEl.scrollHeight;
      scrollDown();
      await pause(sp.ms || 260);
    }
    cur.remove();
    await pause(600);
  }
  // { photo: { name, caption } } … 画像ファイルを開く（モザイク処理された写真。中身は見せない）
  if (s.photo) {
    SFX.card();
    const cells = Array.from({ length: 12 * 7 }, () => {
      const h = 15 + Math.floor(Math.random() * 30),
        l = 18 + Math.floor(Math.random() * 40);
      return `<i style="background:hsl(${h} ${25 + Math.random() * 30}% ${l}%)"></i>`;
    }).join("");
    const card = print(
      `<div class="fx-panel photo-card"><div class="fx-head"><span>IMAGE</span><span>${esc(fill(s.photo.name))}</span></div>` +
        `<div class="ph-wrap"><div class="ph-grid">${cells}</div><div class="ph-stamp">モザイク処理済み</div></div>` +
        (s.photo.caption ? `<div class="ph-cap">${esc(fill(s.photo.caption))}</div>` : "") +
        `</div>`,
    ).querySelector(".photo-card");
    scrollDown();
    await pause(400);
    card.classList.add("shown");
    await pause(1400);
  }
  // { vault: { code: "0412-88" } } … 金庫のダイヤルが回り、1桁ずつ合っていく
  if (s.vault) {
    const code = [...s.vault.code];
    const panel = print(
      `<div class="fx-panel vault"><div class="fx-head"><span>VAULT</span><span>${esc(s.vault.label || "")}</span></div>` +
        `<div class="vt-dial">${code.map(c => (/\d/.test(c) ? `<span class="vt-d">0</span>` : `<span class="vt-sep">${esc(c)}</span>`)).join("")}</div></div>`,
    ).querySelector(".vault");
    const digits = [...panel.querySelectorAll(".vt-d")],
      want = code.filter(c => /\d/.test(c));
    for (let lock = 0; lock < digits.length; lock++) {
      for (let f = 0; f < 10 + lock * 2; f++) {
        for (let k = lock; k < digits.length; k++)
          digits[k].textContent = Math.floor(Math.random() * 10);
        SFX.tick();
        await pause(40);
      }
      digits[lock].textContent = want[lock];
      digits[lock].classList.add("set");
      SFX.lock();
      await pause(120);
    }
    panel.insertAdjacentHTML("beforeend", `<div class="bp-stamp">VAULT OPEN</div>`);
    SFX.granted();
    pulse($("term"), "flash-ok", 600);
    scrollDown();
    await pause(800);
  }
  // { count: { to: 1280000000, label, prefix } } … 大きな数字が、メーターのように一気に回って止まる
  if (s.count) {
    const c = s.count;
    const panel = print(
      `<div class="fx-panel count"><div class="fx-head"><span>${esc(c.label || "")}</span></div><div class="ct-num"></div></div>`,
    ).querySelector(".count");
    const el = panel.querySelector(".ct-num");
    const frames = 40;
    for (let f = 1; f <= frames; f++) {
      const p = 1 - (1 - f / frames) ** 3;
      el.textContent = `${c.prefix || ""}${Math.round(c.to * p).toLocaleString()}`;
      SFX.tick();
      await pause(45);
    }
    el.classList.add("hit");
    SFX.pip();
    await pause(900);
  }
  // { inspect: { find, head, rows: [[項目, 値, 赤くする]], big, sub } } … 画面の小さな文字に印をつけ、拡大して読む
  //   1. find を含む小さな文字に赤い枠がついて点滅する → 2. 拡大パネルに項目が1つずつ出る → 3. 大事な値が大きく叩きつけられる
  if (s.inspect) {
    const x = s.inspect;
    const target =
      x.find &&
      [...out.querySelectorAll("span, p")]
        .reverse()
        .find(el => el.children.length === 0 && el.textContent.includes(x.find));
    if (target) {
      target.classList.add("pin");
      SFX.select();
      tear(160, 0.35);
      await pause(1600);
    }
    SFX.card();
    const panel = print(
      `<div class="fx-panel inspect"><div class="fx-head"><span>INSPECT</span><span>${esc(fill(x.head || ""))}</span></div>` +
        `<div class="in-rows"></div><div class="in-big"></div><div class="in-sub"></div></div>`,
    ).querySelector(".inspect");
    const rowsEl = panel.querySelector(".in-rows");
    for (const [k, v, hot] of x.rows || []) {
      const r = document.createElement("div");
      r.className = `in-row reveal${hot ? " hot" : ""}`;
      r.innerHTML = `<span class="k">${esc(k)}</span><span>${esc(fill(v))}</span>`;
      rowsEl.appendChild(r);
      decode(r, 300);
      SFX.tick();
      scrollDown();
      await pause(hot ? 520 : 300);
    }
    if (x.big) {
      await pause(500);
      const big = panel.querySelector(".in-big");
      for (const ch of x.big) {
        big.textContent += ch;
        if (ch.trim()) SFX.key();
        await pause(70);
      }
      big.classList.add("hit");
      SFX.pip();
      if (x.sub) panel.querySelector(".in-sub").textContent = fill(x.sub);
      scrollDown();
      await pause(1400);
    }
  }
  // { bigtitle: { big, sub, ms } } … 物語の要になる言葉を、画面の真ん中に大きく出す
  if (s.bigtitle) {
    const t = s.bigtitle;
    SFX.card();
    const el = print(
      `<div class="big-title"><div class="bt-main">${esc(fill(t.big))}</div>${t.sub ? `<div class="bt-sub">${esc(fill(t.sub))}</div>` : ""}</div>`,
    ).querySelector(".big-title");
    tear(260, 0.4);
    scrollDown();
    await pause(t.ms || 2600);
  }
  // { jobKill: true } … 裏で動いている処理を止める（KILLED のはんこ → ひびが消えて、画面が元に戻る）
  if (s.jobKill) await killJobFx();
  // { trail: { head, hops: [{ name, sub, note, tag, alert }], end } } … お金や回線の行き先を、1つずつたどっていく
  if (s.trail) {
    const tr = s.trail;
    const panel = print(
      `<div class="fx-panel trail"><div class="fx-head"><span>${esc(fill(tr.head || "TRACE"))}</span><span class="tr-n"></span></div><div class="tr-body"></div></div>`,
    ).querySelector(".trail");
    const body = panel.querySelector(".tr-body"),
      nEl = panel.querySelector(".tr-n");
    for (const [i, h] of tr.hops.entries()) {
      if (i) {
        // 線が伸びていく（光が上から下へ流れる）
        const link = document.createElement("div");
        link.className = "tr-link";
        body.appendChild(link);
        for (let f = 0; f < 8; f++) {
          link.innerHTML = [0, 1, 2]
            .map(r => (r === f % 4 ? `<span class="flow">┃</span>` : "│"))
            .join("\n");
          if (f % 2 === 0) SFX.tick();
          scrollDown();
          await pause(48);
        }
        link.textContent = "│\n│\n▼";
      }
      const row = document.createElement("div");
      row.className = `tr-hop reveal${h.alert ? " alert" : ""}`;
      row.innerHTML =
        `<span class="tr-pin">${i ? "◆" : "◉"}</span>` +
        `<span class="tr-name">${esc(fill(h.name))}${h.tag ? `<span class="tr-tag">${esc(h.tag)}</span>` : ""}${h.sub ? `<span class="tr-sub">${esc(fill(h.sub))}</span>` : ""}</span>` +
        `<span class="tr-note">${esc(fill(h.note || ""))}</span>`;
      body.appendChild(row);
      nEl.textContent = `HOP ${i + 1} / ${tr.hops.length}`;
      decode(row, 380);
      // 行き止まりは音と色で知らせる（画面は揺らさない）
      if (h.alert) {
        SFX.denied();
        tear(160, 0.2);
      } else SFX.hop(i);
      scrollDown();
      await pause(h.alert ? 800 : 560);
    }
    if (tr.end) {
      await pause(250);
      SFX.alert();
      panel.insertAdjacentHTML("beforeend", `<div class="tr-end">${esc(fill(tr.end))}</div>`);
      scrollDown();
      await pause(1000);
    }
  }
  // { cctv: { feeds: [{ id, name, art, blink }], focus, note, ms } } … 社内の監視カメラを乗っ取って、映像を並べる
  //   砂嵐から1つずつ映像になる → 時刻が進み、ノイズの帯が流れる（ライブ）→ focus のカメラだけが寄って、ほかは暗くなる
  if (s.cctv) {
    const c = s.cctv;
    const panel = print(
      `<div class="fx-panel cctv"><div class="fx-head"><span>CCTV ── LIVE</span><span class="cc-n">0 / ${c.feeds.length}</span></div>` +
        `<div class="cc-grid">${c.feeds
          .map(
            (f, i) =>
              `<div class="cc-feed" data-i="${i}"><div class="cc-top"><span>${esc(f.id)}</span><span class="cc-rec">REC</span></div>` +
              `<div class="cc-art"></div><div class="cc-bot"><span>${esc(fill(f.name))}</span><span class="cc-ts"></span></div></div>`,
          )
          .join("")}</div></div>`,
    ).querySelector(".cctv");
    const feeds = c.feeds.map((f, i) => ({
      f,
      el: panel.querySelector(`[data-i="${i}"]`),
      rows: f.art.split("\n"),
      on: false,
      roll: Math.floor(Math.random() * 8),
    }));
    const noisy = (r, k) => [...r].map(ch => (Math.random() < k ? pickOne("░▒▓.:") : ch)).join("");
    let sec = Math.floor(Math.random() * 60);
    const draw = () => {
      const ts = `${clockText()}:${String(sec % 60).padStart(2, "0")}`;
      for (const x of feeds) {
        x.el.querySelector(".cc-ts").textContent = ts;
        if (!x.on) {
          x.el.querySelector(".cc-art").textContent = x.rows
            .map(r => noisy(r.replace(/\S/g, " ").padEnd(r.length, " "), 0.7))
            .join("\n");
          continue;
        }
        x.roll = (x.roll + 1) % (x.rows.length + 4);
        const blink = x.f.blink || "";
        x.el.querySelector(".cc-art").textContent = x.rows
          .map((r, j) => {
            if (blink)
              r = [...r]
                .map(ch => (blink.includes(ch) && Math.random() < 0.3 ? pickOne([...blink]) : ch))
                .join("");
            return j === x.roll ? noisy(r, 0.45) : r;
          })
          .join("\n");
      }
    };
    for (const [i, x] of feeds.entries()) {
      for (let k = 0; k < 5; k++) {
        draw();
        SFX.tick();
        await pause(55);
      }
      x.on = true;
      draw();
      panel.querySelector(".cc-n").textContent = `${i + 1} / ${feeds.length}`;
      SFX.hop(i);
      tear(120, 0.35);
      scrollDown();
      await pause(220);
    }
    // ここから先は、映像が動き続ける（時刻が進み、ノイズの帯が流れる）
    let running = true;
    const liveLoop = (async () => {
      while (running) {
        sec++;
        draw();
        await sleep(100);
      }
    })();
    feeds.forEach(x => x.el.insertAdjacentHTML("afterbegin", `<span class="cc-chk"></span>`));
    await pause(c.ms || 1200);
    // 左上から順に、1台ずつ照合していく（□ CHECK → ✔ OK）。最後の focus のカメラで止まり、しばらく照合したあと「ブー」
    const target = feeds.find(x => x.f.id === c.focus);
    const L = { check: "□ CHECK", ok: "✔ OK", hit: "✖ 記録なし", ...c.labels };
    for (const x of feeds) {
      const chk = x.el.querySelector(".cc-chk");
      x.el.classList.add("check");
      chk.textContent = L.check;
      SFX.select();
      if (x !== target) {
        await pause(750);
        x.el.classList.replace("check", "ok");
        chk.textContent = L.ok;
        SFX.tick();
        await pause(250);
        continue;
      }
      // 怪しいカメラ：照合が長引く → ブー
      for (let k = 0; k < 8; k++) {
        SFX.tick();
        await pause(220);
      }
      x.el.classList.replace("check", "ng");
      chk.textContent = L.hit;
      SFX.buzz();
      tear(180, 0.25);
      panel.classList.add("focus");
      x.el.classList.add("zoom");
      if (c.note) {
        panel.insertAdjacentHTML("beforeend", `<div class="cc-note">${esc(fill(c.note))}</div>`);
        scrollDown();
      }
      await pause(c.focusMs || 2600);
    }
    running = false;
    await liveLoop;
  }
  // { building: { floors, cols, keep: [上から何階目, 左から何番目], label, cap } } … ビルの窓の明かりが、上の階から順に落ちていく（keep の窓だけ残る）
  // { lights: "on" } … 消した明かりを、下の階から戻す
  if (s.building) {
    const b = s.building,
      F = b.floors || 10,
      C = b.cols || 8,
      keep = b.keep || [0, C - 2];
    const grid = Array.from({ length: F }, () =>
      Array.from({ length: C }, () => Math.random() < 0.85),
    );
    grid[keep[0]][keep[1]] = true;
    const panel = print(
      `<div class="fx-panel building"><div class="fx-head"><span>${esc(fill(b.label || "BUILDING CONTROL"))}</span><span class="bd-n">ONLINE</span></div>` +
        `<div class="bd-body"><div class="bd-grid"></div></div>${b.cap ? `<div class="bd-cap">${esc(fill(b.cap))}</div>` : ""}</div>`,
    ).querySelector(".building");
    const g = panel.querySelector(".bd-grid"),
      n = panel.querySelector(".bd-n");
    const draw = () => {
      g.innerHTML = grid
        .map(
          (row, r) =>
            `<span class="fl">${String(F - r).padStart(2, "0")}F </span>` +
            row
              .map(
                (on, c) =>
                  `<span class="w${on ? "" : " off"}${on && r === keep[0] && c === keep[1] ? " keep" : ""}">▮</span>`,
              )
              .join(" "),
        )
        .join("\n");
    };
    draw();
    scrollDown();
    await pause(900);
    for (let r = 0; r < F; r++) {
      grid[r] = grid[r].map((on, c) => (r === keep[0] && c === keep[1] ? on : false));
      draw();
      n.textContent = `${F - r}F OFF`;
      SFX.clunk();
      if (r % 3 === 0) tear(90, 0.25);
      await pause(170);
    }
    n.textContent = "ALL OFF";
    lastBuilding = { grid, draw, n };
    await pause(900);
  }
  if (s.lights === "on" && lastBuilding) {
    const { grid, draw, n } = lastBuilding;
    for (let r = grid.length - 1; r >= 0; r--) {
      grid[r] = grid[r].map(() => Math.random() < 0.85);
      draw();
      SFX.tick();
      await pause(70);
    }
    n.textContent = "RESTORED";
    SFX.granted();
    await pause(500);
  }
  // { shred: 行数 } … ログの行が、文字ごとにバラバラに崩れて消えていく（足跡を消す）
  if (s.shred) {
    const box = print(`<div class="shred"></div>`).querySelector(".shred");
    const lines = Array.from({ length: s.shred }, () => fakeLogLine());
    box.textContent = lines.join("\n");
    await pause(400);
    const chars = lines.map(l => [...l]);
    for (let round = 0; round < 18; round++) {
      for (const row of chars)
        for (let k = 0; k < 6; k++) {
          const j = Math.floor(Math.random() * row.length);
          row[j] = pickOne([" ", " ", "·", "░"]);
        }
      box.textContent = chars.map(r => r.join("")).join("\n");
      if (round % 2 === 0) SFX.tick();
      await pause(55);
    }
    box.textContent = "";
    box.remove();
    SFX.static();
  }
}

// 文字で描いた図（{ art }）：1行ずつ、カチカチと描いていく
async function drawArt(text) {
  const pre = print(`<pre class="log art"></pre>`).querySelector("pre");
  const lines = text.replace(/^\n/, "").split("\n");
  for (const [i, l] of lines.entries()) {
    pre.textContent += (i ? "\n" : "") + fill(l);
    SFX.tick();
    scrollDown();
    await wait(70);
  }
  await wait(500);
}

// 画面の部分を光らせる（{ spot }）。スマホでは右の欄が上にたたまれているので、その中を光らせるときは開く
const SPOTS = {
  screen: "#term",
  host: null,
  input: "#form",
  sound: "#bgm, #mute",
  next: "#next",
  why: "#why",
  trace: ".trace-label, #side > .bar",
  log: "#side > h2:not(.evi-head), #log",
  case: ".evi-head, #evi",
};
const isPhone = () => matchMedia("(max-width: 800px)").matches;
function spot(names) {
  document.querySelectorAll(".spot").forEach(el => el.classList.remove("spot"));
  const side = $("side");
  let inSide = false;
  for (const n of [].concat(names || [])) {
    // host … いちばん新しい「▶ ssh://」の行
    const els =
      n === "host"
        ? [...out.querySelectorAll(".node-head .host")].slice(-1)
        : document.querySelectorAll(SPOTS[n] || "_");
    els.forEach(el => el.classList.add("spot"));
    if (["trace", "log", "case"].includes(n)) inSide = true;
  }
  // 開いた欄は、光らせ終わったら閉じる（自分で開いていたときは、そのまま）
  if (inSide && isPhone() && !side.classList.contains("open")) {
    side.classList.add("open");
    side.dataset.spotOpen = "1";
  } else if (!inSide && side.dataset.spotOpen) {
    side.classList.remove("open");
    delete side.dataset.spotOpen;
  }
  if (names) SFX.select();
}

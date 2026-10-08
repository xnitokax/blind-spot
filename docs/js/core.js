// =========================================================
//  共通の土台
//  画面の部品・設定・小さな道具・シナリオの読み込み・入力のロック
//  ほかのすべてのファイルが使うので、sound.js の次に読み込む
// =========================================================

const $ = id => document.getElementById(id);
const out = $("out"),
  cmd = $("cmd");
const params = new URLSearchParams(location.search);
const DEV = params.has("dev");
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
let S, CH, state;
// プレイヤーのハンドル名（最初に師匠に聞かれて決める。ブラウザに覚えておく）
// シナリオの文章に {handle} と書くと、この名前に置きかわる
let handle = "";
try {
  handle = localStorage.getItem("uzu-handle") || "";
} catch {}
// 練習（チュートリアル）を終えたか。終えるまでは、タイトル画面で師匠が練習を勧める
let trained = false;
try {
  trained = localStorage.getItem("uzu-trained") === "1";
} catch {}
// 練習の回線コード（タイトル画面で案内する文字。小文字で見せる）
const trainCmd = () => (S.training ? `connect ${S.training.toLowerCase()}` : "");
const who = () => handle || "guest";
const fill = s => String(s).replaceAll("{handle}", who());
const titlePrompt = () => `${who()}@safehouse:~$`;
let fast = false; // 演出の早送り中

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 早送りできる待ち時間。任務ごとのテンポ（tempo）を掛ける
const wait = ms => sleep(fast ? Math.min(ms, 30) : ms * curTempo());
// テンポに関係なく一定の待ち時間（師匠のセリフの間など。早送りはできる）
const pause = ms => sleep(fast ? Math.min(ms, 30) : ms);
// tempo：数字ならずっとその速さ。{ from, to, over } なら、打ったコマンドの数に合わせて from → to へだんだん速くなる
// （任務2は、最初は普通の速さで始まり、実行を重ねるほど演出が速くなって、駆け抜ける感じになる）
function curTempo() {
  const t = CH?.tempo;
  if (t == null) return 1;
  if (typeof t === "number") return t;
  const p = Math.min(1, (state?.cmdLog?.length ?? 0) / t.over);
  return t.from + (t.to - t.from) * p;
}
const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const lower = s => String(s).normalize("NFKC").toLowerCase();
const pickOne = s => s[Math.floor(Math.random() * s.length)];
const randHex = n =>
  Array.from({ length: n }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join(" ");
const randIp = () =>
  `${pickOne([185, 193, 45, 104, 203])}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

function loadScript(src) {
  return new Promise((ok, ng) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => ng(new Error(src + " を読み込めません"));
    document.head.appendChild(s);
  });
}

async function loadScenario() {
  if (DEV) {
    await loadScript("../src/scenario.js");
    return SCENARIO;
  }
  if (!window.SCENARIO_DATA)
    throw new Error("scenario.data.js がありません（tools/build.html でビルドしてください）");
  return window.SCENARIO_DATA;
}

// 体験版：公開データには練習と任務1だけが入っている。続きの章（scenario.more.js）は、
// タイトル画面で connect nitoka と打つと読み込まれる。一度開いたら、次からは最初から読み込む
let moreOpen = false;
try {
  moreOpen = localStorage.getItem("uzu-more") === "1";
} catch {}
async function loadMore() {
  if (!S.demo || S.moreLoaded) return false;
  await loadScript("scenario.more.js");
  S.chapters.push(...(window.SCENARIO_MORE || []));
  S.moreLoaded = true;
  return true;
}

// 回線コードで任務を開く：開発モードは平文比較、公開データは復号
async function openChapter(code) {
  const c = NZ.norm(code);
  if (!c) return null;
  if (DEV) {
    const hit = Object.entries(S.chapters).find(([, ch]) => NZ.norm(ch.code) === c);
    return hit ? { id: hit[0], ...hit[1] } : null;
  }
  for (const box of S.chapters) {
    const text = await NZ.unlock(box, c);
    if (text !== null) return JSON.parse(text);
  }
  return null;
}

// 鍵付きノード：開けたら中身を合わせたノードを返す
// account … ユーザーID がある鍵で、どのアカウントでログインしようとしているか
//   owner は lock.pass（boxes）、ほかのアカウントは user.pass（ビルド後は user.boxes）で照合する
async function tryUnlock(node, input, account) {
  const v = NZ.norm(input),
    lock = node.lock,
    u = lock.user;
  const isOwner = !u || account === u.owner;
  if ("pass" in lock) {
    const ok = isOwner ? [].concat(lock.pass) : [].concat(u.pass?.[account] || []);
    return ok.map(NZ.norm).includes(v) ? node : null;
  }
  const boxes = isOwner ? lock.boxes : [u.boxes?.[account]].filter(Boolean);
  for (const box of boxes) {
    const text = await NZ.unlock(box, v);
    if (text !== null) return { ...node, ...JSON.parse(text) };
  }
  return null;
}

const nodeOf = id => state.opened.get(id) || CH.nodes[id];
const here = () => nodeOf(state.current);

// ---------------- 入力のロック ----------------
// 演出の途中はコマンドを受け付けない（入れ子で呼んでもよい）
let busyDepth = 0;
const isBusy = () => busyDepth > 0;
function focusCmd() {
  if (finePointer) cmd.focus();
}
async function busy(fn) {
  busyDepth++;
  cmd.disabled = true;
  $("dock").classList.add("busy");
  try {
    return await fn();
  } finally {
    if (--busyDepth <= 0) {
      busyDepth = 0;
      fast = false;
      $("dock").classList.remove("busy");
      if (!state.over) {
        cmd.disabled = false;
        focusCmd();
      }
    }
  }
}

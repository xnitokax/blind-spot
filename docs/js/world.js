// =========================================================
//  移動
//  場所（ノード）の表示・ssh での移動・鍵と認証の画面
// =========================================================

// ---------------- ノード ----------------
// 接続先の名前：data-name があればそれ、なければリンク文字列の先頭語の「.」より前
// （tools/build.html の重複チェックも同じ決め方）
function linkName(a) {
  if (a.dataset.name) return a.dataset.name;
  return a.textContent
    .trim()
    .split(/[\s　]/)[0]
    .split(".")[0];
}

// 本文 HTML をターミナル用に変換し、接続先の一覧を取り出す
function parseNode(html) {
  const box = document.createElement("div");
  box.innerHTML = html;
  // data-need="flag" の行き先は、その flag が立つまで出さない（例：剣を持ってくるまで、城門は開かない）
  box.querySelectorAll("[data-need]").forEach(a => {
    if (!state.flags[a.dataset.need]) (a.closest("li") || a).remove();
  });
  const links = [];
  box.querySelectorAll("a[data-go]").forEach(a => {
    const text = a.textContent.trim();
    const desc = text.includes("──") ? text.split("──")[1].trim() : text;
    links.push({
      name: linkName(a),
      go: a.dataset.go,
      oneway: a.hasAttribute("data-oneway"),
      desc,
    });
  });
  box.querySelectorAll("ul.links").forEach(ul => ul.remove());
  box.querySelectorAll("a[data-go]").forEach(a => {
    const span = document.createElement("span");
    const name = esc(linkName(a));
    span.innerHTML = `<span class="tlink">${esc(a.textContent)}</span> <span class="tag pick" data-fill="ssh ${name}">[${name}]</span>`;
    a.replaceWith(span);
  });
  return { html: box.innerHTML, links };
}

// 今いる場所でできること（フォルダ・検索・接続先）を、本文と間を空けた1つのかたまりにまとめて出す
// フォルダ・検索・接続先を1つの表にまとめる（左に打つもの、右に説明。列がそろう）
function printMenu(force = false) {
  const node = here(),
    rows = [];
  // compact（任務2）：一覧は出さない（行き先は NEXT 欄のボタンで足りる）。ls と打ったときだけ、名前を1行で出す
  if (CH.compact) {
    if (!force) return true;
    const names = [
      ...(node.dir || []).map(
        d => `<span class="n pick" data-fill="cd ${esc(d.name)}">${esc(d.name)}/</span>`,
      ),
      ...state.links.map(
        l => `<span class="n pick" data-fill="ssh ${esc(l.name)}">${esc(l.name)}</span>`,
      ),
    ];
    if (names.length)
      print(`<div class="menu compact reveal">${names.join(`<span class="dim"> · </span>`)}</div>`);
    return names.length > 0;
  }
  for (const d of node.dir || []) {
    rows.push(
      `<span class="n pick" data-fill="cd ${esc(d.name)}">${esc(d.name)}/</span><span>${esc(d.desc || "")}</span>`,
    );
  }
  if (node.search) {
    rows.push(
      `<span class="n pick" data-fill="search ">search 〇〇</span><span>${esc(node.search.label)}から「〇〇」を探す</span>`,
    );
  }
  for (const name of itemsHere()) {
    rows.push(
      `<span class="n pick" data-fill="pick ${esc(name)}">pick ${esc(name)}</span><span>${esc(node.items[name].desc || "落ちている")}</span>`,
    );
  }
  for (const l of state.links) {
    rows.push(
      `<span class="n pick${l.oneway ? " ow" : ""}" data-fill="ssh ${esc(l.name)}">${esc(l.name)}</span><span${l.oneway ? ' class="ow"' : ""}>${esc(l.desc)}${l.oneway ? "　【一方通行】" : ""}</span>`,
    );
  }
  if (!rows.length) return false;
  print(`<div class="menu reveal"><div class="ls">${rows.join("")}</div></div>`);
  return true;
}
const printLinks = () => printMenu();

// 今いる場所に、まだ拾っていないもの（items）の名前
function itemsHere() {
  const items = here()?.items || {};
  return Object.keys(items).filter(name => !state.said.has(`pick:${state.current}:${name}`));
}

// flag が変わったら、今いる場所の行き先を数え直す（data-need の行き先が出たり消えたりする）
function refreshLinks() {
  const node = here();
  if (!node) return;
  const { links } = parseNode(fill(node.body || ""));
  state.bodyLinks = links;
  state.links = [...links, ...navLinks(links)];
  updateNext();
}

// 画面をさかのぼった古い一覧は押せないようにする
function disablePicks() {
  out.querySelectorAll(".pick").forEach(el => el.classList.remove("pick"));
}

// 移動したときの表示：アドレス → 場所の名前 → 本文 → （間）→ 行き先の一覧、の順に1つずつ出す
// opt.say … 初めて来たときの師匠のセリフ。本文に <!--say--> があれば、その位置で話す（話したら opt.said = true）
// nav：任務の中の主なシステムには、どこからでも直接移動できる（ポータルに戻らなくていい。任務2はテンポ重視）
//   ノードに need があると、その flag が立つまでは出ない（例：口座「SRG」が分かってから、海外の銀行へ行ける）
function navLinks(links) {
  const extra = [];
  for (const id of CH.nav || []) {
    const n = CH.nodes[id];
    if (!n || id === state.current || links.some(l => l.go === id)) continue;
    if (n.need && !state.flags[n.need]) continue;
    extra.push({ name: n.host.split(/[./]/)[0], go: id, oneway: false, desc: fill(n.title) });
  }
  return extra;
}
async function showNode(opt = {}) {
  disablePicks();
  const node = here();
  // {login} … 鍵を開けたときのアカウント名（ほかのアカウントで入ると、その人の名前になる）
  const login = state.loginAs?.[state.current] || node.login || "";
  let { html, links } = parseNode(
    (node.body || "").replaceAll("{handle}", esc(who())).replaceAll("{login}", esc(login)),
  );
  state.bodyLinks = links;
  state.links = [...links, ...navLinks(links)];
  // compact（任務2）：本文の説明（日本語）は出さない。情報は師匠のセリフから拾う
  if (CH.compact && !node.keepBody) html = "";
  const head = print(`<span class="host">▶ ssh://${esc(node.host)}</span>`, "node-head");
  await wait(BEAT.small);
  head.insertAdjacentHTML("beforeend", `\n<b class="reveal">${esc(fill(node.title))}</b>`);
  scrollDown();
  await wait(BEAT.block);
  const [html1, html2] = html.split("<!--say-->");
  if (html1.trim()) await decode(print(html1, "node reveal"));
  if (html2 !== undefined) {
    if (opt.say?.length) {
      await speak(opt.say, BEAT.react);
      opt.said = true;
    }
    await wait(BEAT.block);
    if (html2.trim()) await decode(print(html2, "node reveal"));
  }
  await wait(BEAT.block);
  printMenu();
  normalPrompt();
}

async function enterNode(id, opt = {}) {
  const node = nodeOf(id);
  if (state.current && !opt.isBack) state.history.push(state.current);
  if (opt.oneway) state.history = [];
  state.current = id;
  updateClock();

  const first = !state.visited.has(id);
  if (opt.oneway) addLog(`ONE-WAY → ${node.host}`, "ow");
  else if (first) addLog(`→ ${node.host}`);
  state.visited.add(id);
  // bgm：この場所に来たら、ボーナスタイムの曲の盛り上がりを上げる（0〜3。ループの終わりで切りかわる）
  if (node.bgm != null) SFX.musicLevel(node.bgm);
  // track：この場所に来たら、曲を切りかえる（チュートリアルのゲームの世界の、王城・ダンジョン・魔王城など）
  if (node.track) SFX.music(true, { track: node.track });
  // clockStart：ここから時間を測り始める（台本の {elapsed} に、ここから何分たったかが入る）
  if (node.clockStart && !state.clock0) state.clock0 = Date.now();

  await busy(async () => {
    const view = { say: first ? node.say : null };
    await showNode(view);
    if (first) {
      if (node.clue) {
        await wait(600);
        await addClue(node.clue);
      }
      if (!view.said) await speak(node.say, BEAT.react);
      // scene：初めて来たときに流れる見せ場（台本）。終わってから「次の一手」を出す
      if (node.scene) await play(node.scene);
      setGuide(node.next);
    }
    // arrive：来るたびに、条件に合う出来事を上から順に流す（それぞれ一度だけ。例：パンツを持って戻ると、平手打ち）
    for (const [i, ev] of (node.arrive || []).entries()) {
      const k = `arrive:${id}:${i}`;
      if (state.halt || state.said.has(k) || !cond(ev.if)) continue;
      state.said.add(k);
      await play(ev.script || []);
    }
    if (await followWarp()) return;
    await checkObjectives();
    if (node.goal) await runGoal(node.goal);
  });
}

// エンドを迎えたら（台本の { ending } のあと）、流れていた台本を打ち切って、決められた場所へ飛ぶ
async function followWarp() {
  if (!state.warp) return false;
  const to = state.warp;
  state.warp = null;
  state.halt = false;
  await connect(to, { oneway: true });
  return true;
}

// ゾーン（画面の色合い）を切りかえる。入った瞬間に光の帯が走る
function setZone(zone) {
  const now = document.body.dataset.zone || "";
  if ((zone || "") === now) return;
  if (zone) document.body.dataset.zone = zone;
  else delete document.body.dataset.zone;
  // 右の欄は、ゾーンによって中身が変わる（ゲームの世界では、ステータスともちもの）
  renderObjectives();
  if (zone) {
    pulse($("fx"), "zone-in", 650);
    SFX.titleLine();
    tear(320, 0.6);
  } // 空気が流れるような「スゥッ」と、一瞬の裂け
}

// 転移（演出つき）。鍵付きなら先にパスワードを聞く
async function connect(id, opt = {}) {
  const node = nodeOf(id);
  await busy(async () => {
    // 裏で動いている処理（師匠の権限昇格など）が、この行き先で止まるなら、先に止める（「なるほどな」）
    if (state.job && state.job.stopAt === id) await stopJob();
    const line = print(`Connecting to ${esc(node.host)} `, "dim");
    for (let i = 0; i < 8; i++) {
      await wait(50);
      line.innerHTML += "▓";
      SFX.tick();
      scrollDown();
    }
    line.innerHTML += ` <span class="sys">${10 + Math.floor(Math.random() * 60)}ms</span>`;
    state.minutes += 2 + Math.floor(Math.random() * 4);
    updateClock();
    // ゾーン：システムに入ると、画面の色合いが変わる
    setZone(node.zone);
    // entry：初めて入るときの、そのシステム専用の見せ場（金庫のダイヤルなど）。なければ breach（守りの壁が崩れる）
    if (!state.visited.has(id)) {
      if (node.entry) await play(node.entry);
      else if (node.breach) await breach(node);
    }
  });

  if (node.lock && !state.opened.has(id)) {
    const lock = node.lock,
      len = lockLen(lock);
    disablePicks();
    await busy(() => showLockScreen(node, lock, len));
    // 「この鍵を開ける」目標の手がかりがもうそろっているなら、「分からないな」という師匠の嘆きは言わない
    const o = nowObj();
    const ready =
      o?.until?.opened === id && o.clues?.length && o.clues.every(c => state.clues.includes(c));
    if (!ready && !state.said.has("lock:" + id)) {
      state.said.add("lock:" + id);
      await speak(lock.say, BEAT.react);
    }
    if (lock.user) askUser(id, opt);
    else askPass(id, opt);
    return;
  }
  await enterNode(id, opt);
}

// ---------------- 認証（ユーザーID → パスワード） ----------------
// ---------------- 状態パネル ----------------
// 大事な状態の変化（ロック・解除・失敗・一方通行・発見）を、真ん中のパネル＋演出で見せる
const PADLOCK = `<svg class="icon padlock" viewBox="0 0 24 28" aria-hidden="true">
  <path class="shackle" d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="3" y="12" width="18" height="14" rx="2.5" fill="currentColor"/>
  <rect x="11" y="16.5" width="2" height="5" rx="1" fill="#000"/>
</svg>`;
const ICONS = {
  lock: PADLOCK,
  unlock: PADLOCK,
  deny: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  warn: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 23 21.5H1Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18.3" r="1.4" fill="currentColor"/></svg>`,
  found: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6.5A1.5 1.5 0 0 1 3.5 5H9l2 2.5h9.5A1.5 1.5 0 0 1 22 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5Z" fill="currentColor"/></svg>`,
};
function panelHtml(kind, title, sub) {
  return (
    `<div class="spanel ${kind}"><div class="lockpanel">${ICONS[kind]}<span class="lock-title">${esc(title)}</span></div>` +
    (sub ? `<div class="lock-sub">${sub}</div>` : "") +
    `</div>`
  );
}
async function showLockScreen(node, lock, len) {
  const lines = s => esc(s || "").replace(/\n/g, "<br>");
  const fields = [];
  if (lock.user)
    fields.push(
      `<span class="dim">${esc(lock.user.prompt || "ユーザーID")}</span><span>${lines(lock.user.hint)}</span>`,
    );
  // ユーザーID がある鍵では、パスワードの文字数は ID が通ってから出す（アカウントごとに違うので）
  if (len && !lock.user)
    fields.push(
      `<span class="dim">パスワード</span><span><span class="warn slots">${"_".repeat(len)}</span>（${len}文字）</span>`,
    );
  // LOCKED が出て、掛け金が「ガチャッ」と閉まるのを見せてから、案内を読む順番に1つずつ出す
  SFX.alert();
  impact();
  const auth = print(`<div class="auth"></div>`).querySelector(".auth");
  await reveal(auth, panelHtml("lock", "LOCKED", `ACCESS RESTRICTED ── ${esc(node.host)}`), 520);
  SFX.lock();
  await wait(900);
  await reveal(auth, `<div class="auth-need">認証が必要です。</div>`, 550);
  await reveal(auth, `<div class="auth-hint">${lines(lock.hint)}</div>`, 450);
  if (fields.length) await reveal(auth, `<div class="auth-fields">${fields.join("")}</div>`, 400);
  await reveal(
    auth,
    `<div class="auth-notes">※ ${lock.prompt ? "間違えると" : "パスワードを間違えると"}トレースが上昇します<br>※ 何も入力せずに Enter で戻れます</div>`,
    BEAT.small,
  );
}
// パスワードの文字数（showLength のときだけ見せる。公開データではビルド時に len を入れておく）
// ユーザーID がある鍵では、アカウントごとに文字数が違う（owner 以外は user.lens）
function lockLen(lock, account) {
  if (!lock.showLength) return 0;
  const u = lock.user;
  if (u && account && account !== u.owner)
    return u.lens?.[account] ?? (u.pass?.[account] ? [...u.pass[account]].length : 0);
  return lock.len ?? [...[].concat(lock.pass)[0]].length;
}

function askUser(id, opt) {
  const u = nodeOf(id).lock.user;
  state.mode = { type: "user", id, opt, label: u.prompt || "user" };
  cmd.type = "text";
  setPrompt(`${state.mode.label}:`);
  focusCmd();
}
function askPass(id, opt, user) {
  const lock = nodeOf(id).lock;
  state.mode = { type: "password", id, opt, user, label: lock.prompt || "password" };
  cmd.type = "text"; // パスワードも隠さずに見せる（推理しながら打つので、打った文字が見えたほうがいい）
  passPrompt();
  focusCmd();
}
// 文字数を見せる鍵では、打った文字数を [5/17] のように出す
function passPrompt() {
  const m = state.mode,
    len = lockLen(nodeOf(m.id).lock, m.user);
  setPrompt(len ? `${m.label} [${[...cmd.value].length}/${len}]:` : `${m.label}:`);
}
// ユーザーID を確かめる（大文字小文字・全角半角・空白は区別しない）
function checkUser(lock, raw) {
  const u = lock.user,
    v = NZ.norm(raw);
  const key = Object.keys(u.ids).find(k => NZ.norm(k) === v);
  if (!key) return { error: "そのユーザーIDは登録されていません。", unknown: true };
  const account = u.ids[key];
  if (u.disabled?.[account]) return { error: u.disabled[account] };
  return { account };
}

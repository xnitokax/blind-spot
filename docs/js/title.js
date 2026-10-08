// =========================================================
//  タイトル画面
//  呼び名（handle）・回線コード（connect）・小ネタ
// =========================================================

// ---------------- タイトル画面（ハンドル名と回線コード） ----------------
// 初めての人には、師匠が handle コマンドの使い方を教える（コマンド入力のチュートリアルを兼ねる）
async function titleCommand(raw) {
  print(`<span class="ps">${esc($("prompt").textContent)}</span> ${esc(raw)}`, "echo");
  const [name, ...rest] = raw.trim().split(/\s+/);
  if (!name) return;
  const c = name.toLowerCase(),
    arg = rest.join(" ");
  if (c === "handle") {
    if (!arg) return speak(["[師匠] 名前も一緒に打て。例えば handle anonymous"]);
    const h = arg.normalize("NFKC").trim();
    if ([...h].length > 16 || /\s/.test(h))
      return speak(["[師匠] 呼び名は16文字まで、空白なしだ。"]);
    state.mode = { type: "handleConfirm", name: h, autoCode: state.mode.autoCode };
    setPrompt("決定する？ [y/n]");
    return speak([`[師匠] 「${h}」……それでいいんだな？`]);
  }
  if (!handle)
    return speak([
      "[師匠] まずは呼び名だ。handle と打って、その後ろに名前。例えば handle anonymous",
    ]);
  if (c === "help") {
    const rows = [
      ["connect <回線コード>", "師匠から受け取った回線につなぐ"],
      ...(trainCmd() ? [[trainCmd(), "師匠の練習用サーバーで、操作を練習する（何回でも）"]] : []),
      ["handle <名前>", "呼び名を変える"],
    ]
      .map(([k, d]) => `<span class="n">${esc(k)}</span><span>${esc(d)}</span>`)
      .join("");
    return print(`<div class="ls">${rows}</div>`);
  }
  if (c === "connect" && !arg) return print("使い方：connect &lt;回線コード&gt;", "dim");
  const code = c === "connect" ? arg : raw.trim(); // コードだけ打っても通す
  if (NZ.norm(code) === NZ.norm(EXAMPLE_CODE)) return idiotLine();
  if (S.author && NZ.norm(code) === NZ.norm(S.author.handle)) return authorLine();
  if (NZ.norm(code) === "uzu") return uzuLine();
  if (["師匠", "ししょう", "shishou", "shisho"].includes(NZ.norm(code))) return mentorLine();
  return connectLine(code);
}

// 小ネタ：connect <製作者のハンドル> と打つと、師匠の回線につながって、師匠（＝製作者）のプロフィールが出る
// サインの筆記体（Google Fonts。<head> で読み込んでいる）
const SIGN_FONT = "Yellowtail";
let authorCount = 0;
async function authorLine() {
  const a = S.author;
  authorCount++;
  await busy(() => fakeRoute(`${a.handle}.uzu`));
  await speak(
    authorCount === 1
      ? [
          "[師匠] ……おい。そこは俺の回線だ。",
          "[師匠] まて、なんで{handle}が俺のハンドルネームを知っている。",
        ]
      : ["[師匠] ……また来たのか。{handle}、よく変なやつって言われるだろ。"],
    1000,
  );
  // プロフィールのカード（https:// で始まる中身はリンクにする）
  const val = v =>
    /^https:\/\//.test(v)
      ? `<a class="pf-link" href="${esc(v)}" target="_blank" rel="noopener">${esc(v.replace(/^https:\/\//, ""))}</a>`
      : esc(v);
  await busy(async () => {
    SFX.card();
    // サインのフォントを読み込んでから書き始める（読み込めなければ、ふつうの筆記体で書く）
    await Promise.race([document.fonts?.load(`48px "${SIGN_FONT}"`), sleep(1500)]).catch(() => {});
    const card = print(
      `<div class="profile"><div class="pf-head">PROFILE ── ${esc(a.handle)}</div>` +
        (a.role ? `<div class="pf-role">${esc(a.role)}</div>` : "") +
        (a.message
          ? `<div class="pf-msg">${a.message.map(m => esc(shishou(fill(m)))).join("<br>")}</div>`
          : "") +
        (a.sign ? `<div class="pf-sign"></div>` : "") +
        (a.profile?.length
          ? `<div class="pf-fields">${a.profile.map(([k, v]) => `<span class="dim">${esc(k)}</span><span>${val(v)}</span>`).join("")}</div>`
          : "") +
        `</div>`,
    );
    await decode(card, 600);
    if (a.sign) {
      await wait(500);
      // サイン：線が一筆ずつ書かれていき、最後にオレンジの色が入る
      card.querySelector(".pf-sign").innerHTML =
        `<svg viewBox="0 0 240 72" aria-label="${esc(a.sign)}">` +
        `<text x="228" y="54" text-anchor="end" font-family="'${SIGN_FONT}', cursive">${esc(a.sign)}</text></svg>`;
      // 書いている間は無音。出きった瞬間に「キラッ」（光が強くなるのと同時）
      await wait(1250);
      SFX.sparkle();
      await wait(1000);
    }
    await wait(500);
  });
  // 体験版：ここまで来た人には、続きの回線（任務2以降）を開ける
  if (S.demo && !S.moreLoaded) {
    const opened = await busy(() => loadMore()).catch(() => false);
    if (opened) {
      moreOpen = true;
      try {
        localStorage.setItem("uzu-more", "1");
      } catch {}
      SFX.granted();
      print("[+] 追加の回線を受信しました（任務2以降）", "sys");
      await speak(
        [
          "[師匠] ……ここまで嗅ぎつけたなら、仕方ない。続きの回線も開けといてやる。",
          "[師匠] コードは教えないぞ。本当に、どうしても欲しけりゃ、そのプロフィールの先を自分で漁れ。",
          "[師匠] ……まァ、すすめはしない。その先は、答えまで丸見えだ。",
          "[師匠] 続きは、uzu で俺から受け取るのが筋ってもんだ。",
        ],
        BEAT.react,
      );
      return;
    }
  }
  await speak(
    authorCount === 1
      ? [
          "[師匠] ……まァ、バレちまったもんは仕方ない。これが俺だ。",
          "[師匠] 気が済んだら仕事に戻れ。俺から受け取ったコードを打て。",
        ]
      : ["[師匠] 用が済んだら、仕事に戻れ。"],
    BEAT.react,
  );
}

// 小ネタ：外の検索サイト（Seek）で師匠のハンドルネームを調べると、謎のファンページが見つかる
// （connect nitoka と同じカードに、誰かが書いた賛辞。師匠は他人事のふりをする）
async function fanPage() {
  const a = S.author;
  await busy(async () => {
    print(
      `<div class="res-head"><span class="res-title">Seek ─ 「${esc(a.handle)}」</span><span class="res-count">1 件</span></div>`,
    );
    await wait(BEAT.small);
    SFX.card();
    await Promise.race([document.fonts?.load(`48px "${SIGN_FONT}"`), sleep(1500)]).catch(() => {});
    const card = print(
      `<div class="profile"><div class="pf-head">FAN PAGE ── ${esc(a.handle)}</div>` +
        `<div class="pf-msg">${(a.fan || []).map(m => esc(fill(m))).join("<br>")}</div>` +
        (a.sign ? `<div class="pf-sign"></div>` : "") +
        `</div>`,
    );
    await decode(card, 600);
    if (a.sign) {
      await wait(500);
      card.querySelector(".pf-sign").innerHTML =
        `<svg viewBox="0 0 240 72" aria-label="${esc(a.sign)}">` +
        `<text x="228" y="54" text-anchor="end" font-family="'${SIGN_FONT}', cursive">${esc(a.sign)}</text></svg>`;
      await wait(1250);
      SFX.sparkle();
      await wait(800);
    }
  });
  await speak(
    [
      "[師匠] ……これは、なんだろうな？",
      "[師匠] どうせ、どっかの誰かの黒歴史だろ。",
      "[師匠] ……見なかったことにしろ。",
    ],
    BEAT.react,
  );
}

// 本物っぽい接続の演出だけを見せる（小ネタ用）
// opt.hops：たどる中継点（最後が行き先）、opt.loop：出発点に戻ってきた（接続完了の代わりに警告を出す）
async function fakeRoute(dest, opt = {}) {
  const hops = opt.hops || ["uzu://safehouse", "tor-entry.anon", dest];
  const line = print("", "dim");
  for (let i = 0; i < 10; i++) {
    line.textContent = `回線コードを照合中... ${randHex(6)}`;
    SFX.tick();
    await wait(60);
  }
  line.textContent = "回線コードを照合中... done";
  for (const [i, hop] of hops.entries()) {
    const last = i === hops.length - 1;
    const l = print(`  ${last ? "└" : "├"}─ ${esc(hop)} `, "dim");
    for (let k = 0; k < 6; k++) {
      await wait(32);
      l.innerHTML += "▓";
    }
    l.innerHTML += ` <span class="sys">${20 + Math.floor(Math.random() * 180)}ms OK</span>`;
    SFX.hop(i);
    await wait(110);
  }
  if (opt.loop) {
    // 出発点に戻ってきた：エラーとして接続を止める
    await wait(250);
    SFX.denied();
    impact();
    print("[ERROR] 回線がループしています", "alert");
    await wait(350);
    print("[ERROR] 接続を停止しました。", "alert");
  } else {
    print(`[+] 接続完了：${esc(dest)}`, "sys");
  }
  await wait(900);
}

// 小ネタ：connect 師匠 と打つと、ふつうに「回線コードが違います」と出たあと、師匠が過去を少しだけ語る
let mentorCount = 0;
async function mentorLine() {
  mentorCount++;
  // まずは、本物の間違ったコードとまったく同じ見た目で失敗する
  await busy(async () => {
    const line = print("", "dim");
    for (let i = 0; i < 12; i++) {
      line.textContent = `回線コードを照合中... ${randHex(6)}`;
      SFX.tick();
      await wait(60);
    }
    line.textContent = "回線コードを照合中... done";
  });
  SFX.denied();
  impact();
  print("回線コードが違います。師匠に確認してください。", "alert");
  await busy(async () => {
    await wait(1200);
    if (mentorCount > 1) {
      await play(["[師匠] ……しつこいぞ。昔話は一度で十分だ。"]);
      return;
    }
    await play([
      "[師匠] ……なんで俺のことを調べようとしてる。",
      "[師匠] というか、「師匠」がハンドルネームだと思ったのか？",
      "[師匠] それは、お前が勝手にそう呼び始めただけだろう。",
      { wait: 900 },
      "[師匠] 三年前のあの日から、助けられたお前は俺のことを「師匠」としか呼べない──",
      { wait: 1100 },
      { slow: "[師匠] …………", ms: 380 },
      "[師匠] もういい。仕事に戻れ。俺から受け取ったコードを打て。",
    ]);
  });
}

// 小ネタ：connect uzu と打つと、回線がぐるっと一周して、出発点の uzu://safehouse に戻ってくる
let uzuCount = 0;
async function uzuLine() {
  uzuCount++;
  await busy(() =>
    fakeRoute("uzu://safehouse", {
      hops: ["uzu://safehouse", "tor-entry.anon", "tor-exit-jp.anon", "uzu://safehouse"],
      loop: true,
    }),
  );
  await speak(
    uzuCount === 1
      ? [
          "[師匠] ……おい。回線がぐるっと回って、お前の足元に戻ってきたぞ。",
          "[師匠] uzu は、お前が今いる場所だ。報告なら、あっちで直接しろ。",
        ]
      : ["[師匠] ……だから、そこはお前の足元だって言ってるだろ。"],
    1200,
  );
}

// 師匠の例の「connect IDIOT」を、そのまま打った人へのつっこみ
// 本物と同じように「つながった」ところまで見せてから、師匠があきれる
const EXAMPLE_CODE = "IDIOT";
let idiotCount = 0;
async function idiotLine() {
  idiotCount++;
  await busy(() => fakeRoute(`idiot.${who()}`)); // 接続先は「idiot.（打った人のハンドル名）」
  // 2回目からは、師匠のあきれ方が変わる
  await speak(
    idiotCount === 1
      ? [
          "[師匠] ……おい。",
          "[師匠] 本当にそのまま打つやつがあるか。例だよ、例。",
          "[師匠] 俺から受け取ったコードを打て。",
        ]
      : ["[師匠] ……わざとだろ、お前。", "[師匠] 遊んでないで、俺から受け取ったコードを打て。"],
    1200,
  );
}

async function confirmHandle(raw) {
  const m = state.mode,
    v = raw.trim();
  print(`<span class="ps">決定する？ [y/n]</span> ${esc(raw)}`, "echo");
  if (/^(y|yes|はい)$/i.test(v)) {
    handle = m.name;
    try {
      localStorage.setItem("uzu-handle", handle);
    } catch {}
    SFX.granted();
    state.mode = { type: "title" };
    setPrompt(titlePrompt());
    // uzu から渡されたリンク（?line=）で来たときは、そのまま本番の回線へ。そうでなければ、まず練習を勧める
    if (m.autoCode || !trainCmd()) {
      await speak([
        `[師匠] よし、${handle}。覚えた。`,
        `[師匠] 次は回線だ。俺が渡したコードを、connect のあとに打て。connect ${EXAMPLE_CODE} のようにな。`,
      ]);
      if (m.autoCode) await autoConnect(m.autoCode);
      return;
    }
    // 練習の案内は uzu 側で師匠がするので、ここでは肩慣らしを軽く勧めるだけ
    await speak([
      `[師匠] よし、${handle}。覚えた。`,
      `[師匠] 肩慣らしに、${trainCmd()} で練習していった方がいいぞ。`,
    ]);
    return;
  }
  if (/^(n|no|いいえ)$/i.test(v)) {
    state.mode = { type: "title", autoCode: m.autoCode };
    setPrompt(titlePrompt());
    return speak(["[師匠] なら、もう一度だ。handle のあとに名前を打て。"]);
  }
  print("y か n で答えてください。", "dim");
}

// uzu から渡されたリンク（?line=）のときは、connect コマンドが自動で打たれる
async function autoConnect(code) {
  await wait(400);
  cmd.value = "";
  for (const ch of `connect ${code}`) {
    cmd.value += ch;
    SFX.key();
    await wait(45);
  }
  await wait(250);
  const raw = cmd.value;
  cmd.value = "";
  SFX.enter();
  await titleCommand(raw);
}

// 回線コードを照合して、任務を始める
async function connectLine(code) {
  {
    const ch = await busy(async () => {
      const line = print("", "dim");
      let done = false;
      const anim = (async () => {
        while (!done) {
          line.textContent = `回線コードを照合中... ${randHex(6)}`;
          SFX.tick();
          await sleep(60);
        }
      })();
      const [found] = await Promise.all([openChapter(code), sleep(700)]);
      done = true;
      await anim;
      line.textContent = "回線コードを照合中... done";
      return found;
    });
    if (!ch) {
      SFX.denied();
      impact();
      return print("回線コードが違います。師匠に確認してください。", "alert");
    }
    state.mode = null;
    return startChapter(ch);
  }
}

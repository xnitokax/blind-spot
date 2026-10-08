// =========================================================
//  エンジン（シナリオは src/scenario.js 側で編集 → tools/build.html でビルド）
//  ?dev を付けて開くと、ビルドせずに src/scenario.js を直接読み込む
//  ?line=回線コード を付けて開くと、その任務から始まる（uzu から渡すリンク用）
//
//  流れ：回線コードを入力 → 回線をつなぐ演出 → 任務 → 任務完了 → uzu に戻って報告
//  操作はターミナルのコマンド。ssh（接続）、back（戻る）、search（検索）、cd（フォルダ移動）
//  演出中は画面を素早く3回クリック（または Enter）すると早送りできる
//
//  ファイルの分け方（index.html で、この順に読み込む。上のファイルの名前は、下のファイルから使える）
//    sound.js     効果音と BGM
//    core.js      共通の土台（設定・道具・シナリオの読み込み・入力のロック）
//    screen.js    画面表示（NEXT 欄・出力・師匠のセリフ・TRACE）
//    effects.js   演出（画面が裂ける・侵入・ジョブ・任務2の見せ場）
//    logic.js     演算（手がかりと目標・検索）
//    world.js     移動（場所の表示・ssh・鍵と認証）
//    story.js     進行（任務の開始・台本・任務完了・エンディング）
//    commands.js  コマンド（ssh / back / search など）
//    title.js     タイトル画面
//    input.js     入力（キーボード・クリック）
//    main.js      起動（このファイル）
// =========================================================

// ---------------- 起動 ----------------
function freshState() {
  return {
    current: null,
    history: [],
    visited: new Set(),
    opened: new Map(),
    links: [],
    said: new Set(),
    clues: [],
    cmdLog: [],
    trace: 0,
    minutes: 0,
    commands: 0,
    flags: {},
    objIdx: 0,
    objShown: false,
    saveReady: null,
    over: false,
    mode: null,
    skip: false,
    endReady: false,
    retry: false,
    idMiss: 0,
    passMiss: 0,
    bag: [], // もちもの（pick で拾ったもの）
    halt: false, // エンドを迎えたら true。流れている台本を、そこで打ち切る
    warp: null, // エンドのあとに飛ぶ場所
  };
}

// 待機中、3.5〜8.5秒に一度、タイトルに一瞬ノイズを走らせる（タイトルが画面から消えたら止まる）
let titleNoiseTimer = null;
function titleNoise(el) {
  clearTimeout(titleNoiseTimer);
  if (!el || REDUCED) return;
  titleNoiseTimer = setTimeout(
    () => {
      if (!document.body.contains(el)) return;
      el.classList.remove("noise");
      void el.offsetWidth;
      el.classList.add("noise");
      setTimeout(() => el.classList.remove("noise"), 340);
      titleNoise(el);
    },
    3500 + Math.random() * 5000,
  );
}

// タイトル画面：回線コードを待つ
async function boot(autoCode) {
  CH = null;
  state = freshState();
  resetScreen();
  await busy(async () => {
    // タイトルの登場：光の線が伸びる → 線から文字が開く → 線が下線になる → 光が横切る → 副題（動きは CSS、音はここで合わせる）
    const t = esc(S.title);
    const styled = t.replace("//", `<span class="tl-sep">//</span>`); // 「//」だけ控えめな色に
    const logo = print(
      `<div class="title-logo" data-text="${t}"><span class="tl-text">${styled}</span>` +
        `<span class="tl-shine" aria-hidden="true">${t}</span><span class="tl-noise"></span><span class="tl-line"></span></div>` +
        `<div class="subtitle">ANON-NET TERMINAL</div>`,
    );
    SFX.titleLine(); // 0秒：光の線が伸びる。空気が流れるような「スゥッ」
    await wait(450);
    SFX.titleOpen(); // 0.45秒：文字が開く。温かい低音の和音がふくらむ
    await wait(1900); // 2.35秒：副題まで出そろう
    titleNoise(logo.querySelector(".title-logo"));
    for (const l of [
      "[ ok ] kernel modules",
      "[ ok ] tor client  3 guards",
      "[ ok ] relay  uzu://safehouse … online",
    ]) {
      await wait(140);
      print(esc(l), "dim");
      SFX.tick();
    }
    await wait(300);
    // 初めての人：師匠がハンドル名の決め方（＝コマンドの打ち方）を教える
    if (!handle) {
      await speak([
        "[師匠] ……繋がったな。聞こえるか。",
        "[師匠] 始める前に、お前の呼び名を決めておく。本名は使うなよ。",
        "[師匠] handle と打って、その後ろに名前だ。例えば handle anonymous",
      ]);
    } else {
      await speak([
        `[師匠] おかえり、${handle}。`,
        "[師匠] 回線コードは、connect のあとに打て。",
        ...(!trained && trainCmd() ? [`[師匠] 練習がまだなら、${trainCmd()} だ。`] : []),
      ]);
    }
  });
  if (DEV) {
    const rows = Object.values(S.chapters)
      .map(
        ch =>
          `<span class="n pick" data-fill="connect ${esc(ch.code)}">${esc(ch.code)}</span><span>${esc(ch.label)}</span>`,
      )
      .join("");
    print(`<span class="warn">[開発モード] 回線コード一覧</span><div class="ls">${rows}</div>`);
  }
  // ハンドル名がまだなら、決まってから自動で接続する
  state.mode = { type: "title", autoCode: handle ? null : autoCode };
  setPrompt(titlePrompt());
  focusCmd();
  if (autoCode && handle) busy(() => autoConnect(autoCode));
}

// シナリオを読み込んでから、「CLICK TO CONNECT」を出す。押したら起動の演出（と音）を始める
async function startGame() {
  try {
    S = await loadScenario();
    if (moreOpen) await loadMore().catch(() => {});
  } catch (err) {
    print(`シナリオを読み込めませんでした：${esc(err.message)}`, "alert");
    return;
  }
  $("gameTitle").textContent = S.title;
  document.title = S.title;
  showGate(() => boot(params.get("line")));
}

function showGate(start) {
  const g = $("gate");
  g.innerHTML = `<div class="gate-inner">
    <div class="gate-title">${esc(S.title)}</div>
    <div class="gate-cta">▶ CLICK TO CONNECT</div>
    <div class="gate-note">クリック / タップ / Enter で接続（音が出ます）</div>
  </div>`;
  g.className = "on";
  const go = e => {
    if (e.type === "keydown") {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
    }
    g.removeEventListener("click", go);
    document.removeEventListener("keydown", go);
    SFX.wake();
    SFX.select();
    g.classList.add("leaving");
    setTimeout(() => {
      g.className = "";
      g.innerHTML = "";
      start();
    }, 450);
  };
  g.addEventListener("click", go);
  document.addEventListener("keydown", go);
}

startGame();

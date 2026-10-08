// =========================================================
//  入力
//  キーボード・クリック・タップ・音のボタン
// =========================================================

// ---------------- 入力 ----------------
const hist = [];
let histPos = 0;

$("form").onsubmit = async e => {
  e.preventDefault();
  SFX.wake();
  if (isBusy()) {
    if (skipTap()) fast = true;
    return;
  }
  if (state.over) return;
  const raw = cmd.value;
  cmd.value = "";
  $("run").classList.remove("ready");
  SFX.enter();
  const plain = !state.mode;
  // ボーナスタイムの曲が流れているときは、打った瞬間にリズムに合わせて「ビシュッ」
  if (plain && raw.trim()) SFX.beat();
  if (plain && raw.trim()) hist.push(raw);
  histPos = hist.length;
  // コマンドの処理（演出を含む）が終わるまで、次の入力は受け付けない
  await busy(() => run(raw));
  if (plain) maybeNoise();
};

// パスワード入力中は、打った文字数を [5/17] のように出す
cmd.addEventListener("input", e => {
  if (state?.mode?.type === "password") passPrompt();
  if (!cmd.value) $("run").classList.remove("ready");
  // 日本語入力（変換中）は keydown では文字キーとして来ないので、入力のたびにここで鳴らす
  if (
    e.isComposing ||
    e.inputType === "insertCompositionText" ||
    e.inputType === "deleteCompositionText"
  )
    SFX.key();
});
// 変換を確定したときも鳴らす
cmd.addEventListener("compositionend", () => SFX.key());

cmd.addEventListener("keydown", e => {
  const inGame = CH && !state.mode;
  // 普通のキー入力（日本語の変換中は input のほうで鳴らすので、ここでは鳴らさない）
  if (!e.isComposing && e.key !== "Process" && (e.key.length === 1 || e.key === "Backspace"))
    SFX.key();
  if (e.key === "Escape" && ["user", "password"].includes(state.mode?.type)) {
    e.preventDefault();
    cancelAuth();
  } else if (e.key === "Tab") {
    e.preventDefault();
    if (inGame) complete();
  } else if (e.key === "ArrowUp" && inGame && histPos > 0) {
    e.preventDefault();
    cmd.value = hist[--histPos];
  } else if (e.key === "ArrowDown" && inGame) {
    e.preventDefault();
    histPos = Math.min(hist.length, histPos + 1);
    cmd.value = hist[histPos] ?? "";
  }
});

// 最初のクリック・タップ・キー入力で音を有効にする（その操作自体の音より先に呼ぶため、capture で受け取る）
document.addEventListener("pointerdown", () => SFX.wake(), { capture: true });
document.addEventListener("keydown", () => SFX.wake(), { capture: true });

// 音のオン・オフ（SOUND は全部、BGM は音楽だけ）と「♪ 師匠のプレイリスト」の表示
function updateSoundUi() {
  $("mute").textContent = SFX.muted ? "SOUND OFF" : "SOUND ON";
  $("bgm").textContent = SFX.bgmOn ? "BGM ON" : "BGM OFF";
  $("bgm").classList.toggle("off", !SFX.bgmOn || SFX.muted);
  $("np").classList.toggle("on", SFX.bgmPlaying);
}
SFX.onBgmChange = updateSoundUi;
$("mute").addEventListener("click", () => {
  SFX.toggle();
  updateSoundUi();
  if (!SFX.muted) SFX.select();
});
$("bgm").addEventListener("click", () => {
  SFX.toggleBgm();
  updateSoundUi();
  SFX.select();
});
updateSoundUi();

// スマホ：TRACE 欄をタップでアクセスログと手がかりを開閉
$("side").addEventListener("click", e => e.currentTarget.classList.toggle("open"));

// NEXT のボタンにカーソルを合わせたら、ボタンが変わるごとに1回だけ鳴らす（演出中は押せないので鳴らさない）
let hovered = null;
$("next").addEventListener("mouseover", e => {
  const chipEl = e.target.closest(".chip");
  if (chipEl === hovered) return;
  hovered = chipEl;
  if (chipEl && !isBusy()) SFX.hover();
});
$("next").addEventListener("mouseleave", () => {
  hovered = null;
});

// 名前をタップ → 入力欄にコマンドを入れる（実行は Enter か ⏎ ボタン）
// 「search 」のように続きを打つものは、スマホでもキーボードを出す
// 演出中に素早く3回クリック → 早送り
$("term").addEventListener("click", e => {
  SFX.wake();
  if (e.target.closest("#run")) return;
  if (isBusy()) {
    if (skipTap()) fast = true;
    return;
  }
  const pick = e.target.closest(".pick");
  if (pick) {
    if ("cancel" in pick.dataset || "reuser" in pick.dataset) SFX.select();
    if ("cancel" in pick.dataset) return cancelAuth();
    if ("reuser" in pick.dataset && state.mode?.type === "password") {
      print("ユーザーIDを入力し直します。", "dim");
      cmd.value = "";
      return askUser(state.mode.id, state.mode.opt);
    }
    if (["user", "password"].includes(state.mode?.type)) return;
    // ボタン（光る「次の一手」も）は、入力欄に入れるところまで。実行は自分で Enter か ⏎ ボタン
    // 続きを打たなくていいコマンドなら、⏎ ボタンを光らせて「あとは押すだけ」と見せる
    cmd.value = pick.dataset.fill;
    $("run").classList.toggle("ready", !cmd.value.endsWith(" "));
    SFX.select();
    if (finePointer || cmd.value.endsWith(" ")) cmd.focus();
    else cmd.blur();
    return;
  }
  if (!getSelection().toString()) cmd.focus();
});

// 見ている目：瞳がマウス（指）を追いかける
function lookAt(x, y) {
  document.querySelectorAll(".eye i").forEach(p => {
    const r = p.parentElement.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2),
      dy = y - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    p.style.transform = `translate(${(dx / d) * Math.min(48, d / 6)}px, ${(dy / d) * Math.min(16, d / 12)}px)`;
  });
}
document.addEventListener("pointermove", e => lookAt(e.clientX, e.clientY));
document.addEventListener("touchstart", e => lookAt(e.touches[0].clientX, e.touches[0].clientY), {
  passive: true,
});

// =========================================================
//  進行
//  任務の開始・台本の再生・任務完了・エンディング
// =========================================================

// ---------------- 任務の開始 ----------------
function resetScreen() {
  fast = false;
  killJob();
  SFX.siren(false);
  SFX.music(false, { fast: true });
  document.body.classList.remove("red", "blue");
  delete document.body.dataset.zone;
  spot(null);
  $("overlay").className = "";
  $("wrap").classList.remove("glitch", "unstable", "crt-off");
  $("form").style.visibility = "";
  cmd.disabled = isBusy();
  cmd.type = "text";
  cmd.classList.remove("ghost");
  out.innerHTML = "";
  $("log").innerHTML = "";
  $("evi").innerHTML = "";
  updateTrace();
  updateClock();
  updateClueCount();
  updateNext();
}

async function startChapter(ch) {
  CH = ch;
  state = freshState();
  resetScreen();

  // 師匠が回線をつなぐ（移動の演出）
  await busy(async () => {
    await typeLine("[師匠] 回線をつなぐ。しっかり掴まってろ。");
    await wait(500);
    const route = CH.route || ["uzu://safehouse", "tor-entry.anon", "tor-exit.anon"];
    for (const [i, hop] of route.entries()) {
      const l = print(`  ${i === route.length - 1 ? "└" : "├"}─ ${esc(hop)} `, "dim");
      for (let k = 0; k < 6; k++) {
        await wait(32);
        l.innerHTML += "▓";
      }
      l.innerHTML += ` <span class="sys">${20 + Math.floor(Math.random() * 180)}ms OK</span>`;
      SFX.hop(i);
      await wait(110);
    }
    SFX.warp();
    pulse($("wrap"), "warp", 800);
    await wait(600);
    print(`[+] 接続完了：${esc(route.at(-1))}`, "sys");
    addLog(`LINE OPEN  ${CH.label}`);

    // 任務開始のカード
    await wait(300);
    SFX.card();
    const card = print(`<div class="mission">
      <div class="m-label">${esc(CH.cardLabel || (CH.objective ? "MISSION" : "LOG"))}</div>
      <div class="m-title">${esc(CH.label)}</div>
      ${CH.objective ? `<div class="m-obj">目的：${esc(CH.objective)}</div>` : ""}
      ${CH.objective && S.case ? `<div class="m-case">${S.case.map(([k, v]) => `${esc(k)}：${esc(v)}`).join("　／　")}</div>` : ""}
      <div class="m-meta">${esc(CH.date)} ${esc(CH.clock || "")}</div>
    </div>`);
    await decode(card, 700);
    // カードを読む時間を取ってから、師匠が話し出す
    await wait(1300);
  });
  // 導入の台本（{ music: true } で師匠が音楽を流し始める）
  await busy(async () => {
    await play(CH.intro || []);
    // 導入で師匠が言った「次の一手」（最初の場所に着いたら NEXT 欄に出る）
    if (CH.next) state.guide = CH.next;
    // 最初の目標
    if (nowObj()) {
      await wait(BEAT.small);
      showObjective(nowObj(), "OBJECTIVE");
      // カードと同時に、右の欄にも目標が現れる
      state.objShown = true;
      updateClueCount();
      $("evi").querySelector(".o-now")?.classList.add("new");
      await wait(900);
    }
  });
  await enterNode(CH.start);
}

// 演出の台本を再生する（書き方は src/scenario.js の先頭を参照）
async function play(steps) {
  for (const s of steps) {
    // エンドを迎えたら（{ ending }）、流れている台本はそこで打ち切る
    if (state.halt) return;
    if (typeof s === "string") {
      await typeLine(s);
      // セリフ（[師匠] や登場人物）は読めるように、テンポに関係なく間をおく
      const p = lineParts(s);
      await (p.say || p.who ? pause(560) : wait(420));
      continue;
    }
    // ── チュートリアルのゲームの世界（王城・ダンジョン・魔王城）──
    // { if: 条件, then: [台本], else: [台本] } … 条件の書き方は logic.js の cond
    if ("if" in s) {
      await play((cond(s.if) ? s.then : s.else) || []);
      continue;
    }
    // { run: "名前" } … 任務の scripts に書いた台本を流す（何度も使う場面）
    if (s.run) {
      await play(CH.scripts?.[s.run] || []);
      continue;
    }
    // { choose: { prompt, options: [{ cmd, label, alias, if, script }] } } … コマンドを選ぶ窓を出して、選ぶまで待つ
    if (s.choose) {
      await chooseStep(s.choose);
      continue;
    }
    // { turns: { count, prompt, menu: [...], each: [台本], timeout: [台本] } } … ターン制。count 回まで menu から選ぶ
    if (s.turns) {
      await turnsStep(s.turns);
      continue;
    }
    // { give: "もの" } / { take: "もの" } … もちものに足す／取り上げる
    if (s.give) giveItem(s.give, s.flagAs);
    if (s.take) takeItem(s.take);
    // { set: { 名前: 値 } } / { add: { 名前: 数 } } / { unflag: "名前" }
    if (s.set) Object.assign(state.flags, s.set);
    if (s.add) for (const [k, n] of Object.entries(s.add)) state.flags[k] = (state.flags[k] || 0) + n;
    if (s.unflag) state.flags[s.unflag] = false;
    if (s.set || s.add || s.unflag) {
      refreshLinks();
      renderObjectives();
    }
    // { ending: { id, title } } … エンド。この端末に記録して、エンドのカードを出し、任務の endWarp の場所へ飛ぶ
    if (s.ending) {
      await endingStep(s.ending);
      return;
    }
    // ── チュートリアル用 ──
    // { pc: [台本], phone: [台本] } … パソコンとスマホで、言うことを変える
    if (s.pc || s.phone) {
      await play((isPhone() ? s.phone : s.pc) || []);
      continue;
    }
    // { spot: "next" など } … 画面のその部分を光らせて、どこの話かを見せる（null で消す）
    //   前の説明を読み終わる間をおいてから切りかえ、3回点滅しきってから師匠が話す
    if ("spot" in s) {
      if (document.querySelector(".spot")) await pause(1000);
      spot(s.spot);
      if (s.spot) await pause(1500);
    }
    // { guide: { at, cmd, why } } … 説明の途中で「次の一手」を出す
    if (s.guide) setGuide(s.guide);
    // { art: "文字の図" } … 文字で描いた図を、1行ずつ出す
    if (s.art) await drawArt(s.art);
    // { menu: true } … 今いる場所の行き先の一覧を、もう一度出す（ls と同じ）
    if (s.menu) {
      printMenu(true);
      await wait(BEAT.react);
    }
    if (s.wait) await wait(s.wait);
    // { pause: ミリ秒 } … テンポ（だんだん速くなる任務）に関係なく、決まった時間だけ待つ
    if (s.pause) await pause(s.pause);
    if ("glitch" in s) {
      $("wrap").classList.toggle("unstable", s.glitch);
      setStorm(s.glitch ? 0.6 : 0);
    }
    // { tear: ミリ秒, power } … 画面が一度だけ裂ける ／ { storm: 0〜1 } … 裂け続ける（0 で止まる） ／ { impact: 強さ } … 衝撃
    if (s.tear) tear(s.tear, s.power ?? 1);
    if ("storm" in s) setStorm(s.storm);
    if (s.impact) impact(s.impact);
    // { job: {...} } … 裏で動く処理を始める（プレイヤーは操作を続けられる。書き方は src/scenario.js の先頭）
    if (s.job) startJob(s.job);
    if ("mode" in s) {
      document.body.classList.remove("red", "blue");
      if (s.mode) document.body.classList.add(s.mode);
      SFX.siren(s.mode === "red");
      // 警報で音楽がテープのように止まり、師匠が回線を奪い返すと戻ってくる
      if (s.mode === "red") {
        SFX.music(false, { tape: true });
        tear(600, 1.2);
      }
      if (s.mode === "blue") SFX.music(true);
      if (s.mode === "blue") SFX.granted();
    }
    if (s.sound) SFX[s.sound]?.();
    // { flash: true } … 画面が一瞬赤く光って警告音（監査に見つかった、など）
    if (s.flash) {
      SFX.alert();
      pulse($("term"), "flash", 1000);
    }
    // { auto: "コマンド" } … 今のプロンプトに、コマンドが自動で打たれる（打っているのはプレイヤー、という体）
    // as … 打つ人のプロンプト（例：師匠の端末から打たれる）
    if (s.auto) await autoType(fill(s.auto), s.as && fill(s.as));
    // 任務2の見せ場の演出（ファイルがあふれる・AIスキャン・攻防・画面がはがれる など）
    await playFx(s);
    // { music: true } … 落ち着いた曲（calm）。{ music: "run" } … ボーナスタイムの、前へ進む曲。false で止める
    if ("music" in s)
      SFX.music(!!s.music, { track: typeof s.music === "string" ? s.music : "calm" });
    // { slow: "セリフ", ms: 1文字の間隔 } … ゆっくり1文字ずつ出す
    if (s.slow) {
      await typeLine(s.slow, { charMs: s.ms || 350 });
      await wait(700);
    }
    if ("trace" in s) await raceTrace(s.trace, s.ms || 2000);
    if (s.hex) {
      for (let i = 0; i < s.hex; i++) {
        print(`0x${(0x7f3a00 + i * 16).toString(16)}  ${randHex(16)}`, "dim");
        SFX.tick();
        await wait(28);
      }
    }
    if (s.spam) {
      // 逆探知が回線をたどってくる
      for (let i = 0; i < s.spam; i++) {
        addLog(`TRACE ← ${randIp()}  hop ${i + 1}`, "bad");
        SFX.tick();
        await wait(90);
      }
    }
    if (s.ghost) {
      // 入力欄を乗っ取られ、勝手にコマンドが打たれる
      setPrompt("root@???:~#");
      $("form").style.visibility = "";
      cmd.classList.add("ghost");
      for (const ch of s.ghost) {
        cmd.value += ch;
        SFX.key();
        await wait(95);
      }
      await wait(400);
      print(`<span class="alert">root@???:~#</span> ${esc(cmd.value)}`, "echo");
      cmd.value = "";
      cmd.classList.remove("ghost");
      $("form").style.visibility = "hidden";
      await wait(400);
    }
    if (s.predict) {
      print(`<div class="sec-head">PREDICTION LOG ── 対象：${esc(who())}</div>`);
      for (const p of s.predict) {
        await wait(750);
        const ok = !p.node || state.visited.has(p.node);
        SFX.tick();
        decode(
          print(
            `<div class="pred"><span class="${ok ? "sys" : "dim"}">${ok ? "✔ 一致" : "… 未到達"}</span><span>${esc(fill(p.text))}</span><span class="p">${esc(p.p || "")}</span></div>`,
          ),
          300,
        );
      }
    }
    if (s.replay) {
      // この任務でプレイヤーが実際に打ったコマンドを、「予測済み」として流す
      print(`<div class="sec-head">COMMAND LOG ── ${esc(who())}</div>`);
      for (const c of state.cmdLog) {
        await wait(260);
        SFX.tick();
        print(
          `<div class="rep"><span class="dim">${esc(c.t)}</span><span class="alert">予測済</span><span>$ ${esc(c.c)}</span></div>`,
        );
      }
    }
    if (s.eye) {
      SFX.boom();
      print(
        `<div class="eye-wrap"><div class="eye"><i></i></div><div class="eye-cap">${esc(s.eye === true ? "見ている" : s.eye)}</div></div>`,
      );
      await wait(1800);
    }
    if (s.news) {
      for (const n of s.news) {
        await wait(900);
        SFX.enter();
        decode(
          print(
            `<div class="news"><div class="meta">${esc(n.meta || "Seek ニュース")}</div>${esc(n.text || n)}</div>`,
            "node",
          ),
          350,
        );
      }
    }
    if (s.corrupt) {
      // 画面の文字がどんどん崩れていく
      const nodes = textNodes(out);
      const end = Date.now() + s.corrupt;
      let k = 0;
      while (Date.now() < end && nodes.length) {
        const rate = 20 + Math.floor(80 * (1 - (end - Date.now()) / s.corrupt));
        for (let i = 0; i < rate; i++) {
          const n = pickOne(nodes),
            chars = [...n.nodeValue];
          const j = Math.floor(Math.random() * chars.length);
          chars[j] = glyphFor(chars[j]);
          n.nodeValue = chars.join("");
        }
        if (k++ % 4 === 0) SFX.static();
        await sleep(45);
      }
    }
  }
}

// ---------------- 選ぶ・ターン制・エンド（チュートリアルのゲームの世界） ----------------
// { choose }：昔の RPG のようなコマンドの窓を出して、プレイヤーが選ぶまで待つ
//   番号（1, 2, …）・コマンド名・label・alias のどれで打っても選べる。NEXT 欄にも並ぶ
//   台本は演出中（入力できない状態）で流れているので、選ぶ間だけ入力欄を使えるようにする
async function chooseStep(c) {
  const options = c.options.filter(o => cond(o.if));
  if (!options.length) return;
  fast = false; // 選ぶところは早送りしない
  const rows = options
    .map(
      (o, i) =>
        `<span class="n pick" data-fill="${esc(o.cmd)}">${i + 1}. ${esc(o.cmd)}</span><span>${esc(fill(o.label || ""))}</span>`,
    )
    .join("");
  print(
    `<div class="menu rpg-menu reveal">${c.prompt ? `<div class="rm-head">${esc(fill(c.prompt))}</div>` : ""}<div class="ls">${rows}</div></div>`,
  );
  const picked = await new Promise(resolve => {
    state.mode = { type: "choose", options, resolve };
    setPrompt(fill(c.ask || "コマンド？"));
    cmd.disabled = false;
    $("dock").classList.remove("busy");
    focusCmd();
  });
  state.mode = null;
  cmd.disabled = true;
  $("dock").classList.add("busy");
  normalPrompt();
  disablePicks();
  await play(picked.script || []);
}
// 選んでいる間に打たれた文字（commands.js の run から呼ばれる）
function chooseInput(raw) {
  const m = state.mode,
    v = raw.trim();
  print(`<span class="ps">${esc($("prompt").textContent)}</span> ${esc(raw)}`, "echo");
  const n = Number(v);
  const o =
    Number.isInteger(n) && n >= 1 && n <= m.options.length
      ? m.options[n - 1]
      : m.options.find(
          o =>
            fold(o.cmd) === fold(v) ||
            (o.label && fold(o.label) === fold(v)) ||
            (o.alias || []).some(a => fold(a) === fold(v)),
        );
  if (!o) return print("その コマンドは えらべない。", "dim");
  SFX.select();
  m.resolve(o);
}

// { turns }：count ターンのあいだ、毎ターン menu から選ぶ。エンドを迎えずに終わったら timeout の台本
//   いまのターン数は flag の turn に入る（台本の {turn} にも入る）
async function turnsStep(t) {
  for (let i = 1; i <= t.count; i++) {
    if (state.halt) return;
    state.flags.turn = i;
    await play(t.each || []);
    if (state.halt) return;
    await chooseStep({ prompt: t.prompt, options: t.menu, ask: t.ask });
  }
  if (!state.halt) await play(t.timeout || []);
}

// { ending }：エンドのカード（見つけたエンドの数と、一覧。まだのものは ？？？）を出して、endWarp の場所へ飛ぶ
//   見たエンドは、この端末に記録する（logic.js の recordEnding）。flag の「end:id」も立てる
async function endingStep(e) {
  const seen = recordEnding(e.id);
  const list = CH.endings || [];
  const found = list.filter(x => seen[x.id]).length;
  state.flags[`end:${e.id}`] = true;
  await pause(e.wait ?? 1200);
  SFX.card();
  const card = print(
    `<div class="ending-card"><div class="ec-tag">END</div><div class="ec-title">${esc(fill(e.title))}</div>` +
      `<div class="ec-n">見つけたエンド　${found} / ${list.length}</div>` +
      `<ul>${list.map(x => `<li class="${seen[x.id] ? (x.id === e.id ? "now" : "") : "dim"}">${seen[x.id] ? esc(x.title) : "？？？"}</li>`).join("")}</ul>` +
      `<div class="ec-note">（この端末での記録）</div></div>`,
  );
  await decode(card.querySelector(".ec-title"), 700);
  await pause(e.hold ?? 4000);
  state.warp = e.warp || CH.endWarp || null;
  state.halt = true;
}

// 「任務完了まで」の目標を済ませる（show のときは OBJECTIVE CLEAR のカードも出す）
async function clearGoalObjective(show) {
  const o = nowObj();
  if (!o?.until?.goal) return;
  state.objIdx++;
  updateClueCount();
  if (!show) return;
  SFX.objective();
  print(
    `<div class="obj-card clear"><span class="o-tag">OBJECTIVE CLEAR</span><span class="o-text">${esc(o.text)}</span></div>`,
  );
  addLog(`CLEAR  ${o.text}`);
  await wait(1400);
}

async function runGoal(goal) {
  if (state.saveReady) return; // save 待ちのあいだに同じ結果をもう一度見ても、やり直さない
  killJob();
  // 練習を終えたら覚えておく（タイトル画面で、もう練習を勧めない）
  if (CH.practice) {
    trained = true;
    try {
      localStorage.setItem("uzu-trained", "1");
    } catch {}
  }
  if (goal.save) return readyToSave(goal);
  state.over = true;
  updateNext();
  const cut = goal.end === "cut";
  await busy(async () => {
    $("form").style.visibility = "hidden";
    // 見つけたものを眺める余韻を残してから、任務の締めくくりが始まる
    await wait(BEAT.react);
    await play(goal.script || []);
    await wait(900);
    // 「任務完了まで」の目標は、師匠の締めのあとで済ませる（ぷつっと切れる結末では出さない）
    await clearGoalObjective(!cut);
    if (!cut) {
      await typeLine("[*] 回線を切断しました。");
      await wait(700);
    }
  });
  if (cut) {
    // 何の前触れもなく、真っ暗になる（音も全部止まる）
    SFX.siren(false);
    SFX.music(false, { fast: true });
    document.body.classList.remove("red", "blue");
    $("wrap").classList.remove("glitch", "unstable");
    setStorm(0);
  } else {
    await powerOff();
  }
  await showEnding(`${goal.report || ""}\n\n── ${goal.tag || "COMPLETE"}`, {
    cut,
    clues: !cut,
    todo: goal.todo,
  });
}

// save 型の任務完了：師匠が締めたあとも探索を続けられ、「return」と打つと終わる
async function readyToSave(goal) {
  state.saveReady = goal;
  await busy(async () => {
    await wait(BEAT.react);
    // linger … 結果を読む時間。プレイヤーが何か触る（キー・クリック・タップ）か、その時間がたつまで師匠は黙っている
    if (goal.linger) {
      await lingerFor(goal.linger);
      fast = false;
    }
    await play(goal.script || []);
    await wait(600);
    await clearGoalObjective(true);
  });
  addLog("SAVE READY");
  updateClueCount();
  updateNext();
}

// プレイヤーが何か触る（キー・クリック・タップ）か、ms たつまで待つ
function lingerFor(ms) {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", done, true);
      document.removeEventListener("keydown", done, true);
      resolve();
    };
    const timer = setTimeout(done, ms);
    document.addEventListener("pointerdown", done, true);
    document.addEventListener("keydown", done, true);
  });
}

// 自動で打たれるコマンド（速め）
async function autoType(text, as) {
  const d = print(
    `<span class="ps">${esc(as || $("prompt").textContent)}</span> <span class="t"></span>`,
    "echo auto",
  );
  const t = d.querySelector(".t");
  for (const ch of text) {
    if (fast || REDUCED) break;
    t.textContent += ch;
    if (ch.trim()) SFX.key();
    await sleep(14);
  }
  t.textContent = text;
  SFX.enter();
  await wait(160);
}

async function saveAndEnd() {
  const goal = state.saveReady;
  state.saveReady = null;
  state.over = true;
  updateNext();
  await busy(async () => {
    $("form").style.visibility = "hidden";
    await wait(300);
    const msg = goal.commit || "どう？楽しめた？";
    const files = Math.max(1, state.clues.length);
    const obj = 6 + files * 2,
      kb = (1.2 + files * 0.37).toFixed(2);
    const hash = () => Math.random().toString(16).slice(2, 9);
    const before = hash(),
      after = hash();
    const emit = async (lines, ms = 45) => {
      for (const l of lines) {
        print(esc(l), "dim");
        SFX.tick();
        await wait(ms);
      }
    };
    await autoType("git add evidence/");
    await autoType(`git commit -m "${msg}"`);
    await emit([
      `[main ${after}] ${msg}`,
      ` ${files} file${files > 1 ? "s" : ""} changed, ${files * 37 + 12} insertions(+)`,
    ]);
    await wait(200);
    await autoType("git push");
    await emit([
      `Enumerating objects: ${obj}, done.`,
      `Counting objects: 100% (${obj}/${obj}), done.`,
      `Writing objects: 100% (${obj}/${obj}), ${kb} KiB | ${kb} MiB/s, done.`,
      "To uzu://safehouse/case-makabe.git",
      `   ${before}..${after}  main -> main`,
    ]);
    await wait(900);
    await typeLine("[*] 回線を切断しました。");
    await wait(700);
  });
  await powerOff();
  await showEnding(`${goal.report || ""}\n\n── ${goal.tag || "COMPLETE"}`, {
    clues: true,
    todo: goal.todo,
  });
}

// 暗転 → 文章を1文字ずつ表示 → 回収した手がかり → 見出し
async function showEnding(text, opt = {}) {
  state.over = true;
  state.mode = null;
  state.retry = !!opt.retry;
  cmd.disabled = true;

  const lines = fill(text).trim().split("\n");
  const tag = lines.at(-1).startsWith("──") ? lines.pop().replace(/^──\s*/, "") : "";
  const body = lines.join("\n").trim();

  const ov = $("overlay");
  ov.className = "on" + (opt.cut ? " cut visible" : "");
  ov.innerHTML = `<div class="inner"><div class="text"></div><div class="clues"></div><div class="todo"></div><div class="endtag"></div><div class="hint">クリック / Enter で${opt.retry ? "この任務をやり直す" : "タイトルに戻る"}</div></div>`;
  ov.scrollTop = 0;
  await sleep(50);
  ov.classList.add("visible");
  await sleep(opt.cut ? 3000 : 1400);
  $("wrap").classList.remove("glitch", "unstable");
  setStorm(0);

  const el = ov.querySelector(".text");
  // 文章や手がかりが画面の下にあふれたら、出たところまで自動で下へスクロールする（最後の MISSION COMPLETE まで見えるように）
  //   なめらかに動かす（ブラウザの smooth スクロールは、タブが裏にあると止まることがあるので、自前で少しずつ動かす）
  const follow = () => {
    const from = ov.scrollTop,
      to = ov.scrollHeight - ov.clientHeight,
      t0 = performance.now();
    if (to <= from + 1) return;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 450);
      ov.scrollTop = from + (to - from) * (1 - (1 - p) ** 3);
      if (p < 1) setTimeout(step, 16);
    };
    step();
  };
  state.skip = false;
  for (const ch of body) {
    if (state.skip) break;
    el.textContent += ch;
    if (ch === "\n") follow();
    if (ch.trim() && Math.random() < 0.3) SFX.tick();
    await sleep(ch === "\n" ? 240 : "。』」".includes(ch) ? 200 : "、…".includes(ch) ? 100 : 34);
  }
  el.textContent = body;
  follow();
  ov.classList.add("typed");

  if (opt.clues && CH && countClues(CH)) {
    const box = ov.querySelector(".clues");
    box.innerHTML = `<div class="clue-head">EVIDENCE<span>回収した手がかり　${state.clues.length} / ${countClues(CH)}</span></div><ul></ul>`;
    for (const c of state.clues) {
      if (!state.skip) await sleep(260);
      const li = document.createElement("li");
      li.textContent = c;
      box.querySelector("ul").appendChild(li);
      follow();
      SFX.tick();
    }
  }
  // 次にやること（uzu に戻って報告する、など）を、別枠で目立たせる
  if (opt.todo) {
    if (!state.skip) await sleep(500);
    const todo = ov.querySelector(".todo");
    todo.innerHTML = `<span class="todo-tag">NEXT</span><span>${esc(fill(opt.todo))}</span>`;
    todo.classList.add("show");
    follow();
    SFX.select();
  }
  await sleep(700);
  const t = ov.querySelector(".endtag");
  t.textContent = tag;
  if (/GAME OVER/.test(tag)) t.classList.add("bad");
  t.classList.add("show");
  follow();
  SFX.card();
  await sleep(1500);
  ov.querySelector(".hint").classList.add("show");
  follow();
  state.endReady = true;
}

function overlayInput() {
  // 文章が出ている途中は、素早く3回押したときだけ最後まで飛ばす
  if (!state.endReady) {
    if (skipTap()) state.skip = true;
    return;
  }
  $("overlay").className = "";
  if (state.retry) busy(() => startChapter(CH));
  else boot();
}
$("overlay").addEventListener("click", overlayInput);
document.addEventListener("keydown", e => {
  // 押しっぱなしの連打（キーリピート）は数えない
  if ($("overlay").classList.contains("on") && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    if (!e.repeat) overlayInput();
    return;
  }
  if (isBusy() && state?.mode?.type !== "choose" && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    if (!e.repeat && skipTap()) fast = true;
  }
});

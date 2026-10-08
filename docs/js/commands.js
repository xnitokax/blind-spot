// =========================================================
//  コマンド
//  ssh / back / search などの処理・打ち間違いの助け舟・場所ごとの特別なコマンド
// =========================================================

// ---------------- 打ち間違いの助け舟 ----------------
// 想定されるミスをしたら、師匠がさりげなくヒントを出す（種類ごとに、任務の中で一度だけ）
// 間違えたのはプレイヤーなので、責めずに「気づくきっかけ」だけを渡す
async function oops(kind, lines) {
  if (!lines?.length || state.over) return false;
  const key = `oops:${kind}`;
  if (state.said.has(key)) return false;
  state.said.add(key);
  await speak(lines, BEAT.small);
  return true;
}
// 日本語（全角の英数字・記号は半角にそろえてから見る）が入っているか
const hasJa = s => /[^\x00-\x7f]/.test(String(s).normalize("NFKC"));

// 鍵の打ち間違い：ユーザーID（lock.oops の idJa / idSpace / idMiss）
async function userOops(lock, raw, r) {
  const o = lock.oops || {};
  if (hasJa(raw)) return oops("idJa", o.idJa);
  if (/\s/.test(raw.trim())) return oops("idSpace", o.idSpace);
  if (r.unknown && ++state.idMiss >= 2) return oops("idMiss", o.idMiss);
}
// パスワード（passJa ／ near：惜しい答え ／ passMiss：2回目の失敗から）
async function passOops(id, lock, raw) {
  const o = lock.oops || {};
  if (hasJa(raw)) return oops("passJa", o.passJa);
  for (const [i, n] of (o.near || []).entries()) {
    // 開発モードは平文（pass）、公開データはハッシュ（hashes）で比べる
    const hit = n.pass
      ? n.pass.some(p => NZ.norm(p) === NZ.norm(raw))
      : n.hashes.includes(await NZ.hash(id, raw));
    if (hit) return oops(`near${i}`, n.say);
  }
  if (++state.passMiss >= 2) return oops("passMiss", o.passMiss);
}
// コマンドの打ち間違い（どの任務でも同じ）
async function cmdOops(raw, cname) {
  const node = here();
  const link = state.links.find(l => l.name.toLowerCase() === cname);
  if (link)
    return oops("needSsh", [
      "[師匠] 移動するなら、頭に ssh を付けるんだ。",
      `[師匠] 「ssh ${link.name}」って具合にな。`,
    ]);
  // 場所の名前だが、今いるところからは行けない
  if (CH?.nodes?.[cname])
    return oops("needSsh", [
      "[師匠] 移動するなら、頭に ssh を付けるんだ。",
      `[師匠] ${cname} なら、行ける場所まで back で戻ってから「ssh ${cname}」だな。`,
    ]);
  if (node?.search && !/\s/.test(raw.trim()))
    return oops("needSearch", [
      "[師匠] ここで調べものをするなら、頭に search だ。",
      `[師匠] 「search ${raw.trim()}」って具合にな。`,
    ]);
  return oops("lost", [
    "[師匠] 迷ったら help と打ってみな。使えるコマンドが全部出る。",
    "[師匠] 下の NEXT のボタンを押すのも手だぞ。",
  ]);
}

// ---------------- コマンド ----------------
const COMMANDS = {
  help() {
    const node = here();
    const rows = [
      ["ssh <名前>", "接続先へ移動する（例：ssh portal）"],
      ["back", "ひとつ前の場所へ戻る"],
      ["search <言葉>", "検索できる場所で検索する（スペース区切りで条件を重ねる）"],
      ["cd <フォルダ名>", "ファイルサーバーでフォルダを移動する"],
      ["ls", "今いる場所の接続先をもう一度表示"],
      ["return", "調べ終わったら、成果を持って帰る（任務を終える）"],
      ["help", "この一覧"],
    ]
      .map(([c, d]) => `<span class="n">${esc(c)}</span><span>${esc(d)}</span>`)
      .join("");
    print(
      `<div class="ls">${rows}</div><span class="dim">Tab で補完 ／ ↑↓ で履歴 ／ 演出中はクリックで早送り${node.search ? " ／ ここでは search が使えます" : ""}${node.dir ? " ／ ここでは cd が使えます" : ""}</span>`,
    );
  },
  async ssh(arg) {
    if (!arg) return print("使い方：ssh &lt;名前&gt;", "dim");
    const link = state.links.find(l => l.name.toLowerCase() === arg.toLowerCase());
    if (!link) {
      print(`ssh: 接続先が見つかりません: ${esc(arg)}`, "alert");
      // 説明の言葉（「人事」など）で打ったときは、左の名前で打つことを教える
      const byDesc = state.links.find(
        l => !hasJa(l.name) && l.desc && fold(l.desc).includes(fold(arg)),
      );
      if (byDesc)
        return oops("sshDesc", [
          "[師匠] 行き先は、一覧の左にある名前で打つんだ。",
          `[師匠] それなら「ssh ${byDesc.name}」だな。`,
        ]);
      return oops("sshMiss", [
        "[師匠] その行き先は、ここからは見えないな。",
        "[師匠] ls で、今いる場所から行ける先をもう一度出せるぞ。",
      ]);
    }
    if (link.oneway) {
      disablePicks();
      SFX.alert();
      impact();
      // ONE-WAY が点く → 間 → 「進みますか？」 → 選択肢
      const box = print(`<div class="auth"></div>`).querySelector(".auth");
      await busy(async () => {
        await reveal(box, panelHtml("warn", "ONE-WAY", "この先は戻れません"), 1100);
        await reveal(box, `<div class="auth-need">進みますか？</div>`, 400);
        await reveal(
          box,
          `<div class="auth-choice"><span class="n pick ow" data-fill="y">y 進む</span><span class="n pick" data-fill="n">n やめる</span></div>`,
          BEAT.small,
        );
      });
      state.mode = { type: "confirm", id: link.go };
      setPrompt("続けますか？ [y/N]");
      return;
    }
    return connect(link.go);
  },
  async cd(arg) {
    const node = here();
    if (!node.dir) return COMMANDS.ssh(arg);
    if (!arg) return print("使い方：cd &lt;フォルダ名&gt;", "dim");
    const a = NZ.norm(arg);
    const byAlias = node.dir.find(d => d.go && (d.alias || []).some(x => NZ.norm(x) === a));
    if (byAlias) {
      addLog(`cd ${arg}`);
      SFX.granted();
      print(panelHtml("found", "FOUND", `${esc(node.host)}/${esc(arg.toUpperCase())}`));
      await wait(1500);
      return connect(byAlias.go);
    }
    const d = node.dir.find(d => NZ.norm(d.name) === a);
    if (!d) return print(`cd: ${esc(arg)}: そのようなフォルダはありません。`, "alert");
    // フォルダの場所を見出しに、中身は左の線で囲んだ一覧に（空のときは黄色）
    const files = (d.text || "ファイルがありません。").split("\n").map(esc);
    const empty = !d.text || /ファイルがありません/.test(d.text);
    const view = print(
      `<div class="dirview"><div class="dir-path">▸ ${esc(node.host)}/${esc(d.name)}</div></div>`,
    ).querySelector(".dirview");
    await wait(BEAT.small);
    await reveal(
      view,
      `<div class="dir-files${empty ? " dir-empty" : ""}">${files.join("<br>")}</div>`,
      400,
    );
    if (d.clue) {
      await wait(400);
      await addClue(d.clue);
    }
    if (d.say && !state.said.has(d)) {
      state.said.add(d);
      await speak(d.say, BEAT.react);
    }
    setGuide(d.next, d.say);
    await checkObjectives();
  },
  search,
  // 調べ終わったら、成果を持って帰る（git commit / push が流れて完了画面へ）
  async return() {
    if (state.saveReady) return saveAndEnd();
    // 師匠のいないエピローグでは、帰る場所もない
    if (!CH.objectives?.length) return print("return: 帰る場所がありません。", "dim");
    // 調べ終わる前に打つと、師匠に止められる
    await speak(["[師匠] まだ帰ってくるな。", "[師匠] 成果もなにもないだろ。"], BEAT.small);
  },
  back() {
    if (!state.history.length) return print("back: これ以上戻れません。", "dim");
    return connect(state.history.pop(), { isBack: true });
  },
  ls() {
    if (!printMenu(true)) print("接続先はありません。", "dim");
  },
  // 隠しコマンド（help には出さない）
  reboot: () => boot(),
};
COMMANDS.exit = COMMANDS.back;

// 認証をやめて、元いた場所に戻る
function cancelAuth() {
  if (!["user", "password"].includes(state.mode?.type)) return;
  const label = state.mode.label;
  state.mode = null;
  disablePicks();
  print(`<span class="ps">${esc(label)}:</span> <span class="dim">（入力しない）</span>`, "echo");
  print("認証をやめました。", "dim");
  SFX.enter();
  printLinks();
  normalPrompt();
  cmd.value = "";
  focusCmd();
}

async function run(raw) {
  const mode = state.mode;
  if (mode?.type === "title") return titleCommand(raw);
  if (mode?.type === "handleConfirm") return confirmHandle(raw);
  // 何も入力しない／back と打つと、認証をやめて戻る（トレースは上がらない）
  const quit = !raw.trim() || /^(back|exit|cancel)$/i.test(raw.trim());
  if (mode?.type === "user") {
    if (quit) return cancelAuth();
    const lock = nodeOf(mode.id).lock;
    print(`<span class="ps">${esc(mode.label)}:</span> ${esc(raw)}`, "echo");
    const r = checkUser(lock, raw);
    if (r.error) {
      SFX.denied();
      print(esc(r.error), "alert");
      state.mode = null;
      await userOops(lock, raw, r);
      return askUser(mode.id, mode.opt);
    }
    SFX.enter();
    // ユーザーID が通ってから、そのアカウントのパスワード欄（文字数）を見せる
    state.mode = null;
    await busy(async () => {
      const len = lockLen(lock, r.account);
      if (len) {
        await wait(BEAT.small);
        const f = print(`<div class="auth"></div>`).querySelector(".auth");
        await reveal(
          f,
          `<div class="auth-fields"><span class="dim">パスワード</span><span><span class="warn slots">${"_".repeat(len)}</span>（${len}文字）</span></div>`,
          300,
        );
      }
      // 師匠のひとこと：手がかりがそろっていれば「行けそうか」、まだなら「長いな」（それぞれ一度だけ）
      const say = lock.passSay;
      if (say) {
        const o = nowObj();
        const ready =
          r.account === lock.user.owner &&
          (!o?.clues?.length || o.clues.every(c => state.clues.includes(c)));
        const key = `passSay:${mode.id}:${ready ? "ready" : "else"}`;
        if (!state.said.has(key)) {
          state.said.add(key);
          await speak(ready ? say.ready : say.else, BEAT.small);
        }
      }
    });
    return askPass(mode.id, mode.opt, r.account);
  }
  if (mode?.type === "password") {
    if (quit) return cancelAuth();
    state.mode = null;
    const node = nodeOf(mode.id);
    const shown = esc(raw); // パスワードも伏せ字にしない
    print(`<span class="ps">${esc(mode.label)}:</span> ${shown}`, "echo");
    // 照合中の演出（復号が終わるまで、鍵がくるくる回る）
    const opened = await busy(async () => {
      const line = print("", "dim");
      let done = false;
      const anim = (async () => {
        while (!done) {
          line.textContent = `decrypting ${randHex(10)}`;
          SFX.tick();
          await sleep(50);
        }
      })();
      // ユーザーID がある鍵では、そのアカウントのパスワードとだけ照合する
      const [result] = await Promise.all([tryUnlock(node, raw, mode.user), sleep(900)]);
      done = true;
      await anim;
      line.remove();
      return result;
    });
    if (opened) {
      state.opened.set(mode.id, opened);
      if (mode.user) (state.loginAs ??= {})[mode.id] = node.lock.user.names?.[mode.user];
      SFX.granted();
      pulse($("term"), "flash-ok", 600);
      print(panelHtml("unlock", "UNLOCKED", `ACCESS GRANTED ── ${esc(node.host)}`));
      addLog(`AUTH OK  ${node.host}`);
      // 南京錠が開くのを見届けてから（目標が済んだら、それも見せてから）、中へ入る
      await wait(1600);
      await busy(() => checkObjectives());
      return enterNode(mode.id, mode.opt);
    }
    SFX.denied();
    print(panelHtml("deny", "DENIED", "ACCESS DENIED ── 認証に失敗しました"));
    addLog(`AUTH FAIL  ${node.host}`, "bad");
    addTrace(node.lock.penalty ?? 10);
    if (!state.over) await passOops(mode.id, node.lock, raw);
    // 入力画面のまま、続けてもう一度打てる（接続が切られたときを除く）
    if (!state.over) askPass(mode.id, mode.opt, mode.user);
    return;
  }
  if (mode?.type === "confirm") {
    state.mode = null;
    print(`<span class="ps">続けますか？ [y/N]</span> ${esc(raw)}`, "echo");
    if (/^y(es)?$/i.test(raw.trim())) return connect(mode.id, { oneway: true });
    print("中止しました。", "dim");
    printLinks();
    return normalPrompt();
  }

  print(`<span class="ps">${esc($("prompt").textContent)}</span> ${esc(raw)}`, "echo");
  const [name, ...args] = raw.trim().split(/\s+/);
  if (!name) return;
  state.cmdLog.push({ t: clockText(), c: raw.trim() });
  // 「次の一手」を打ったら、案内は消す（結果を見て、師匠がまた次を言う）
  const g = state.guide;
  if (
    g &&
    state.current === g.at &&
    fold(raw).replace(/\s+/g, "") === fold(g.cmd).replace(/\s+/g, "")
  )
    state.guide = null;
  // 使い終わったボタンは、すぐに NEXT 欄から消す（結果に「次の一手」がないと、古いボタンが残ってしまうので）
  if (state.guide !== g) updateNext();
  // actions：その場所でだけ使える特別なコマンド（任務2の見せ場。押すと、たっぷり時間をかけた演出が流れる）
  const acts = here()?.actions;
  const act =
    acts &&
    Object.entries(acts).find(
      ([k]) => fold(k).replace(/\s+/g, "") === fold(raw).replace(/\s+/g, ""),
    );
  if (act) return runAction(act[0], act[1]);
  // コマンド名は、全角で打っても大文字でも通す
  const cname = name.normalize("NFKC").toLowerCase();
  const fn = COMMANDS[cname];
  if (!fn) {
    print(`${esc(name)}: コマンドが見つかりません（help で一覧）`, "alert");
    return cmdOops(raw, cname);
  }
  const at = state.current;
  await fn(args.join(" "));
  await reactTo(at, fn === COMMANDS.back ? "back" : cname);
}

// react：その場所でそのコマンドを打ったあとに、師匠が反応する（チュートリアル用。一度だけ）
//   back のように場所が変わるコマンドでも、打った場所（at）の react を見る
async function reactTo(at, key) {
  const r = at && nodeOf(at)?.react?.[key];
  const k = `react:${at}:${key}`;
  if (!r || state.over || state.said.has(k)) return;
  state.said.add(k);
  await busy(async () => {
    await wait(BEAT.small);
    await play(r.script || []);
  });
  setGuide(r.next);
}

// actions の実行：{ script: [台本], next: 次の一手 }。一度やったら、もう一度は流さない
async function runAction(key, a) {
  const done = `act:${state.current}:${key}`;
  if (state.said.has(done)) return print(`${esc(key)}: もう済んでいる。`, "dim");
  state.said.add(done);
  await busy(() => play(a.script || []));
  setGuide(a.next);
  await checkObjectives();
}

// Tab 補完：1語目はコマンド、ssh の後は接続先、cd の後はフォルダ
function complete() {
  const v = cmd.value;
  const node = here();
  const m = v.match(/^\s*(\S+)\s+(\S*)$/);
  let pool, prefix, head;
  if (m && /^ssh$/i.test(m[1])) pool = state.links.map(l => l.name);
  else if (m && /^cd$/i.test(m[1]))
    pool = node.dir ? node.dir.map(d => d.name) : state.links.map(l => l.name);
  else if (!m && /^\s*\S*$/.test(v))
    pool = [
      "ssh",
      "back",
      "help",
      "ls",
      ...(node.search ? ["search"] : []),
      ...(node.dir ? ["cd"] : []),
      ...(state.saveReady ? ["return"] : []),
    ];
  else return;
  if (m) {
    prefix = m[2];
    head = v.slice(0, v.length - prefix.length);
  } else {
    prefix = v.trim();
    head = "";
  }
  const hits = pool.filter(p => p.toLowerCase().startsWith(prefix.toLowerCase()));
  if (hits.length === 1) cmd.value = head + hits[0] + (m ? "" : " ");
  else if (hits.length > 1) print(hits.map(esc).join("    "), "dim");
}

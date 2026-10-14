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

// 鍵の打ち間違い：ユーザーID（lock.oops の idJa / idSpace / idMiss / idDenied）
async function userOops(lock, raw, r) {
  const o = lock.oops || {};
  if (hasJa(raw)) return oops("idJa", o.idJa);
  // 登録はあるが、ここには入れない人の ID（人事DB なら、人事部ではない社員）
  if (o.idDenied?.ids.includes(r.account)) return oops("idDenied", o.idDenied.say);
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

// 場所の stay：{ if, to, warn, force } … 条件（if）のあいだ、to 以外へ移動しようとすると止められる
//   1回目は warn（その場にとどまる）。2回目からは force の台本のあと、むりやり to へ送られる（練習：師匠に castle へ行けと言われたあと）
async function holdHere(go) {
  const r = here()?.stay;
  if (!r || go === r.to || state.visited.has(r.to) || !cond(r.if)) return false;
  const k = `stay:${state.current}`;
  state.flags[k] = (state.flags[k] || 0) + 1;
  if (state.flags[k] === 1) {
    await speak(r.warn || [], BEAT.small);
    return true;
  }
  await busy(() => play(r.force || []));
  await connect(r.to);
  return true;
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
      // ゲームの世界（rpg）では、ものを拾える
      ...(document.body.dataset.zone === "rpg" ? [["pick <もの>", "落ちているものを拾う"]] : []),
      ["return", "調べ終わったら、成果を持って帰る（任務を終える）"],
      ["help", "この一覧"],
    ]
      .map(([c, d]) => `<span class="n">${esc(c)}</span><span>${esc(d)}</span>`)
      .join("");
    // tools：その場所でだけ使える道具（任務2の stat / trace など）
    const tools = (node.tools || [])
      .map(t => `<span class="n">${esc(t.usage || t.cmd)}</span><span>${esc(t.desc || "")}</span>`)
      .join("");
    print(
      `<div class="ls">${rows}</div>` +
        (tools ? `<div class="dim">── ここで使えるコマンド ──</div><div class="ls">${tools}</div>` : "") +
        `<span class="dim">Tab で補完 ／ ↑↓ で履歴 ／ 演出中は素早く3回クリックで早送り${node.search ? " ／ ここでは search が使えます" : ""}${node.dir ? " ／ ここでは cd が使えます" : ""}</span>`,
    );
  },
  async ssh(arg) {
    if (!arg) return print("使い方：ssh &lt;名前&gt;", "dim");
    // 鍵のかかった扉の前：その扉の名前なら、もう一度ログインを試す。ほかへは、back で戻ってから
    if (state.door) {
      const d = nodeOf(state.door);
      if (shortHost(d.host).toLowerCase() === arg.toLowerCase()) {
        const id = state.door;
        state.door = null;
        return connect(id);
      }
      return print(`ssh: いまは ${esc(shortHost(d.host))} の扉の前です。`, "alert");
    }
    const link = state.links.find(l => l.name.toLowerCase() === arg.toLowerCase());
    // 来た道（ひとつ前の場所）の名前を打ったときは、back と同じように戻る（一覧には出していない）
    const prev = state.history.at(-1);
    const backLink =
      !link && (state.allLinks || []).find(l => l.go === prev && l.name.toLowerCase() === arg.toLowerCase());
    if (backLink) {
      if (await holdHere(backLink.go)) return;
      await COMMANDS.back();
      return oops("sshBack", ["[師匠] 来た道を戻るなら、back でいい。"]);
    }
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
    if (await holdHere(link.go)) return;
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
    const byAlias = dirHere(node).find(d => d.go && (d.alias || []).some(x => NZ.norm(x) === a));
    if (byAlias) {
      addLog(`cd ${arg}`);
      SFX.granted();
      print(panelHtml("found", "FOUND", `${esc(node.host)}/${esc(arg.toUpperCase())}`));
      await wait(1500);
      return connect(byAlias.go);
    }
    const d = dirHere(node).find(d => NZ.norm(d.name) === a);
    if (!d) return print(`cd: ${esc(arg)}: そのようなフォルダはありません。`, "alert");
    if (d.file) return print(`cd: ${esc(d.name)}: フォルダではありません（open ${esc(d.name)} で開けます）`, "alert");
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
      await busy(() => tapWait()); // フォルダの中身を読んでから、師匠が話す（tap の任務）
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
  async back() {
    // 鍵のかかった扉の前から戻る（扉の手前の場所を、もう一度出す）
    if (state.door) {
      state.door = null;
      await busy(() => showNode());
      return;
    }
    if (!state.history.length) return print("back: これ以上戻れません。", "dim");
    if (await holdHere(state.history.at(-1))) return;
    return connect(state.history.pop(), { isBack: true });
  },
  ls() {
    if (!printMenu(true)) print("接続先はありません。", "dim");
  },
  // 落ちているもの（ノードの items）を拾う。拾うと、もちものに入り、そのものの台本が流れる
  async pick(arg) {
    const items = here().items || {};
    if (!arg) return print("使い方：pick &lt;もの&gt;", "dim");
    const name = itemsHere().find(
      n => fold(n) === fold(arg) || (items[n].alias || []).some(a => fold(a) === fold(arg)),
    );
    if (!name) return print(`${esc(arg)} は ここには ない。`, "dim");
    const item = items[name];
    state.said.add(`pick:${state.current}:${name}`);
    SFX.evidence();
    giveItem(name, item.flag);
    print(`${esc(who())}は ${esc(name)}を てにいれた！`, "sys");
    await busy(() => play(item.script || []));
    if (await busy(() => followWarp())) return;
    updateNext();
  },
  // 隠しコマンド（help には出さない）
  reboot: () => boot(),
};
COMMANDS.exit = COMMANDS.back;

// 認証をやめて、元いた場所に戻る
function cancelAuth() {
  if (!["user", "password"].includes(state.mode?.type)) return;
  const label = state.mode.label,
    door = state.mode.id;
  state.mode = null;
  disablePicks();
  print(`<span class="ps">${esc(label)}:</span> <span class="dim">（入力しない）</span>`, "echo");
  print("認証をやめました。", "dim");
  SFX.enter();
  // 鍵のかかった扉の前にとどまる。ほかへ行くには、back で戻る（来た道は back、の決まりどおり）
  state.door = door;
  state.links = [];
  updateNext();
  normalPrompt();
  cmd.value = "";
  focusCmd();
}

async function run(raw) {
  const mode = state.mode;
  if (mode?.type === "title") return titleCommand(raw);
  if (mode?.type === "handleConfirm") return confirmHandle(raw);
  // 台本の { choose } で、選ぶのを待っているとき
  if (mode?.type === "choose") return chooseInput(raw);
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
  //   alias … 同じ演出になる、別の打ち方（「cd ??????」でも「open ??????」でも開く）
  //   別の打ち方で、もう済んだ演出に当たったときは、ふつうのコマンドとして動かす（cd ならフォルダに入る）
  const acts = here()?.actions;
  const same = (a, b) => cmdKey(a) === cmdKey(b);
  //   need … その flag が立つまでは使えない（任務2：名前のないフォルダを search で見つけるまで、open ?????? は効かない）
  const act =
    acts &&
    Object.entries(acts).find(
      ([k, a]) => (!a.need || state.flags[a.need]) && [k, ...(a.alias || [])].some(x => same(x, raw)),
    );
  const actDone = act && state.said.has(`act:${state.current}:${act[0]}`);
  if (act && !(actDone && !same(act[0], raw))) return runAction(act[0], act[1]);
  // コマンド名は、全角で打っても大文字でも通す
  const cname = name.normalize("NFKC").toLowerCase();
  // tools：その場所の道具を、演出のない引数で使ったとき（違う伝票番号で stat を打った、など）
  const tool = (here()?.tools || []).find(t => cmdKey(raw).startsWith(cmdKey(t.cmd)));
  if (tool && !COMMANDS[cname]) return useTool(tool, raw);
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
    // 練習：出てきた一覧（help など）を読んでから、師匠が話す（タップするまで待つ）
    await tapWait();
    await play(r.script || []);
  });
  if (await busy(() => followWarp())) return;
  setGuide(r.next);
}

// コマンドを比べるための形（全角・大文字・空白を無視。「??????」のような ? の数のちがいも無視する）
const cmdKey = s => fold(s).replace(/\s+/g, "").replace(/[?？]+/g, "?");

// tools の実行：{ cmd, usage, desc, miss, say }
//   miss … 引数がちがったときの返事（{arg} に打った引数が入る）。打ちかたが足りないときは usage を出す
//   say  … そのときの師匠のひとこと（一度だけ。間違えたときの誘導）
async function useTool(tool, raw) {
  const arg = raw.trim().split(/\s+/).slice(tool.cmd.split(/\s+/).length).join(" ");
  // pages … 引数ごとに、決まった画面を出す道具（任務2：map 12、power 12、gate 12-E など。何度でも見られる）
  if (tool.pages) return toolPage(tool, arg);
  if (!arg) return print(`使い方：${esc(tool.usage || tool.cmd)}`, "dim");
  // rec … 監視カメラの録画を、時間を区切って抜き出す道具（任務2）
  if (tool.rec) return camRec(tool.rec, arg);
  await busy(async () => {
    SFX.tick();
    await wait(BEAT.small);
    print(esc(fill(String(tool.miss || "{arg}: 何も見つかりません。").replaceAll("{arg}", arg))), "dim");
  });
  if (tool.say) await oops(`tool:${state.current}:${tool.cmd}`, tool.say);
}

// actions の実行：{ script: [台本], next: 次の一手 }。一度やったら、もう一度は流さない
async function runAction(key, a) {
  const done = `act:${state.current}:${key}`;
  if (state.said.has(done)) return print(`${esc(key)}: もう済んでいる。`, "dim");
  state.said.add(done);
  await busy(() => play(a.script || []));
  if (await busy(() => followWarp())) return;
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
    pool = node.dir ? dirHere(node).map(d => d.name) : state.links.map(l => l.name);
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

// cam --rec <開始>-<終了> [--sort]：決めた時間のあいだに、カメラごとに何秒ぶん録画が残っているかを出す（任務2）
//   rec.cams … [{ id, gaps: [["01:30:00", "02:00:00"], ...] }]（録画が止まっていた時間）
//   rec.max … 一度に抜き出せる長さ（分）。rec.target … 止められていたカメラ。rec.found … 並び替えて見つけたときの師匠のセリフ
//   --sort を付けると、録画の短い順に並べる（止まっていたカメラが、いちばん上に来る）
async function camRec(rec, arg) {
  const m = arg.match(/(\d{1,2}):?(\d{2})\s*[-~〜～]\s*(\d{1,2}):?(\d{2})/);
  if (!m) return print(`使い方：cam --rec 01:00-01:30（時刻は 24 時間で。--sort で、録画の短い順に並べる）`, "dim");
  const from = (+m[1] * 60 + +m[2]) * 60,
    to = (+m[3] * 60 + +m[4]) * 60;
  if (to <= from) return print("cam: 終わりの時刻は、始まりより後にしてください。", "alert");
  if (to - from > (rec.max || 60) * 60)
    return print(`cam: 一度に抜き出せるのは ${rec.max || 60} 分までです。`, "alert");
  const sec = t => t.split(":").reduce((a, b) => a * 60 + +b, 0);
  const rows = rec.cams.map(c => {
    let lost = 0;
    for (const [a, b] of c.gaps || []) lost += Math.max(0, Math.min(to, sec(b)) - Math.max(from, sec(a)));
    return { id: c.id, kept: to - from - lost };
  });
  const sorted = /--sort/.test(arg);
  if (sorted) rows.sort((a, b) => a.kept - b.kept);
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const span = `${m[1].padStart(2, "0")}:${m[2]}-${m[3].padStart(2, "0")}:${m[4]}`;
  await busy(async () => {
    SFX.tick();
    await wait(BEAT.small);
    const box = print(
      `<pre class="log">${esc(rec.date || "")} ${span}\n録画の残り時間（${sorted ? "短い順" : "カメラ番号順"}）\n</pre>`,
    ).querySelector("pre");
    for (const r of rows) {
      box.insertAdjacentHTML(
        "beforeend",
        `${r.kept < to - from ? '<span class="warn">' : ""}${esc(r.id.padEnd(12))} ${mmss(r.kept)} / ${mmss(to - from)}${r.kept < to - from ? "</span>" : ""}\n`,
      );
      SFX.tick();
      scrollDown();
      await wait(60);
    }
  });
  // 並び替えて、止められていたカメラがいちばん上に来たら、師匠がひとこと（一度だけ）
  if (sorted && rows[0]?.id === rec.target && rows[0].kept < to - from && rec.found)
    await oops(`camrec:${state.current}`, rec.found);
}

// 道具の画面（tools の pages）：map 12 ／ power 12 ／ gate 12-E のように、引数ごとに決まった画面を出す（何度でも見られる）
//   tool.index … 引数なしで打ったときに出す画面（一覧）
//   tool.pages … [{ keys: ["12", "12f"], html, say, clue, flag }]（say と clue は、その画面を初めて見たときだけ）
//   tool.miss … 当てはまる画面がないときの返事（{arg} が打った言葉になる）
const pageKey = s =>
  String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/^(b?\d+)(f|階)$/, "$1");
async function toolPage(tool, arg) {
  const page = arg
    ? tool.pages.find(p => [].concat(p.keys).some(k => pageKey(k) === pageKey(arg)))
    : tool.index && { html: tool.index, keys: [] };
  if (!page) {
    if (!arg) return print(`使い方：${esc(tool.usage || tool.cmd)}`, "dim");
    return print(esc(fill(String(tool.miss || "{arg}: 見つかりません。").replaceAll("{arg}", arg))), "dim");
  }
  const key = `page:${state.current}:${tool.cmd}:${[].concat(page.keys)[0] ?? ""}`;
  const first = !state.said.has(key);
  state.said.add(key);
  await busy(async () => {
    SFX.tick();
    await wait(BEAT.small);
    print(`<div class="doc tool-page">${fill(page.html)}</div>`, "node result reveal");
    scrollDown();
    await wait(450);
    if (!first) return;
    if (page.flag) state.flags[page.flag] = true;
    if (page.clue) await addClue(page.clue);
    if (page.say?.length) {
      await tapWait();
      await speak(page.say, BEAT.react);
    }
  });
  if (first && (page.clue || page.flag)) await checkObjectives();
}

// =========================================================
//  効果音と BGM（演出・音）
//  Web Audio でその場で合成する。音声ファイルは使わない
//  ほかのファイルからは SFX.〇〇() で呼ぶ
// =========================================================

// ---------------- 効果音（Web Audio でその場で合成する。音声ファイルは使わない） ----------------
// 方針：ピコピコした矩形波は使わない。サイン波・フィルターをかけたノイズ・低音で、映画の UI のような質感にする
const SFX = (() => {
  let ctx = null,
    out = null,
    echo = null,
    noiseBuf = null,
    siren = null;
  let muted = false,
    bgmOn = true,
    bgmWant = false,
    bgm = null;
  // ブラウザは、ページを一度も触っていない間は音を出させない（その間の音は一時停止して溜まる）。
  // 溜まった音が最初のクリックでまとめて鳴らないよう、触るまでの効果音は鳴らさずに捨てる
  let touched = false;
  const canPlay = c => touched || c.state === "running";
  try {
    muted = localStorage.getItem("uzu-muted") === "1";
    bgmOn = localStorage.getItem("uzu-bgm") !== "0";
  } catch {}

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      // 全体：音量 → コンプレッサー（大きな音をまとめる）→ スピーカー
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.ratio.value = 8; // 大きくしても音が割れないように押さえる
      out = ctx.createGain();
      out.gain.value = 2.7; // 全体の音量（効果音はここで決まる）
      out.connect(comp).connect(ctx.destination);
      // エコー：音が空間に残る感じ
      const delay = ctx.createDelay(1),
        fb = ctx.createGain(),
        lp = ctx.createBiquadFilter(),
        wet = ctx.createGain();
      delay.delayTime.value = 0.28;
      fb.gain.value = 0.38;
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      wet.gain.value = 0.5;
      echo = ctx.createGain();
      echo.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      lp.connect(wet);
      wet.connect(out);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function env(g, t, vol, dur, attack = 0.004) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function route(node, o) {
    node.connect(out);
    if (o.echo) {
      const s = ctx.createGain();
      s.gain.value = o.echo;
      node.connect(s).connect(echo);
    }
  }
  // 音程のある音（既定はサイン波。filter を付けるとこもった音になる）
  function tone(freq, dur, o = {}) {
    if (muted) return;
    const c = ac();
    if (!c || !canPlay(c)) return;
    const t = c.currentTime + (o.at || 0);
    const osc = c.createOscillator(),
      g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    env(g, t, o.vol ?? 0.1, dur, o.attack);
    let last = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.filter;
      last = last.connect(f);
    }
    last.connect(g);
    route(g, o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  // ノイズ（フィルターで「ザッ」「ゴォ」「カチ」などに変える。sweep で周波数を動かす）
  function hiss(dur, o = {}) {
    if (muted) return;
    const c = ac();
    if (!c || !canPlay(c)) return;
    const t = c.currentTime + (o.at || 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.filter || "bandpass";
    f.frequency.setValueAtTime(o.freq || 2000, t);
    f.Q.value = o.q ?? 1;
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    const g = c.createGain();
    env(g, t, o.vol ?? 0.1, dur, o.attack);
    src.connect(f).connect(g);
    route(g, o);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  const api = {
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem("uzu-muted", muted ? "1" : "0");
      } catch {}
      if (muted) this.siren(false);
      else ac();
      applyBgm();
      return muted;
    },
    // 最初にクリック・タップ・キー入力をしたときに呼ぶ。ここから先の音は鳴らす
    wake() {
      touched = true;
      if (!muted) ac();
    },
    // キー入力：乾いたクリックに、少しだけ芯のある音を重ねる
    key: () => {
      hiss(0.014, { vol: 0.075, freq: 4800, q: 1.2 });
      tone(1900 + Math.random() * 300, 0.012, { vol: 0.02 });
    },
    // 師匠の無線：行の頭で一度だけ「ザッ」
    radio: () => {
      hiss(0.1, { vol: 0.07, freq: 1700, q: 2.5 });
      tone(2800, 0.035, { vol: 0.012 });
    },
    tick: () => tone(3400, 0.008, { vol: 0.02 }),
    // Enter：低い「トン」と、軽いクリック
    enter: () => {
      tone(160, 0.1, { vol: 0.18 });
      hiss(0.025, { vol: 0.06, freq: 3000 });
    },
    // 名前やボタンを選んだとき：近未来の画面のような、ガラスをはじいた澄んだ短い音
    select: () => {
      tone(180, 0.035, { vol: 0.05 }); // 低い「トッ」で輪郭をつける
      hiss(0.01, { vol: 0.03, filter: "highpass", freq: 8000 }); // 空気感のある細いノイズ
      tone(2637, 0.08, { vol: 0.03, echo: 0.3 }); // 高い音（ミ）
      tone(3951, 0.06, { vol: 0.018, at: 0.014, echo: 0.3 }); // 少しずらして5度上（シ）を重ねる
    },
    // ボタンにカーソルを合わせたとき：選んだときの音と同じ系統の、小さく短い「チッ」
    hover: () => {
      hiss(0.006, { vol: 0.015, filter: "highpass", freq: 9000 });
      tone(3951, 0.025, { vol: 0.01 });
    },
    // 中継点を通過：ソナーのような短いピン
    hop: i => tone(1320 + i * 40, 0.14, { vol: 0.05, echo: 0.5 }),
    // 転移：低い地鳴りと、こもった音が開いていくノイズ
    warp: () => {
      tone(42, 1.4, { vol: 0.3, slide: 30, attack: 0.05 });
      hiss(1.1, {
        vol: 0.12,
        filter: "lowpass",
        freq: 180,
        sweep: 5500,
        q: 0.7,
        attack: 0.6,
        echo: 0.3,
      });
    },
    // 任務開始のカード・結末の見出し：重い一撃と、高い残響
    card: () => {
      tone(55, 1.8, { vol: 0.38, slide: 36 });
      hiss(0.5, { vol: 0.14, filter: "lowpass", freq: 900, sweep: 120 });
      tone(1760, 1.4, { vol: 0.012, echo: 0.7, attack: 0.02 });
    },
    granted: () => {
      tone(90, 0.3, { vol: 0.15 });
      tone(440, 0.6, { vol: 0.045, echo: 0.4 });
      tone(660, 0.7, { vol: 0.04, at: 0.09, echo: 0.4 });
    },
    denied: () => {
      tone(68, 0.55, { type: "sawtooth", filter: 420, vol: 0.2 });
      tone(71.5, 0.55, { type: "sawtooth", filter: 420, vol: 0.16 });
      hiss(0.16, { vol: 0.1, filter: "lowpass", freq: 700 });
    },
    alert: () => {
      tone(1000, 0.14, { vol: 0.04, echo: 0.3 });
      tone(1000, 0.14, { vol: 0.04, at: 0.2, echo: 0.3 });
    },
    // サインが出きった瞬間の「キラッ」：高く澄んだ音を3つすばやく重ね、ほんの少し残響を残す
    sparkle: () => {
      [2637, 3520, 4699].forEach((f, i) =>
        tone(f, 0.35, { vol: 0.025, at: i * 0.045, echo: 0.45, attack: 0.003 }),
      );
      hiss(0.12, { vol: 0.02, filter: "highpass", freq: 7000, attack: 0.005 });
    },
    // タイトル：光の線が伸びるとき。音程のない、空気が流れるような「スゥッ」
    titleLine: () => {
      hiss(0.55, { vol: 0.07, freq: 300, sweep: 1400, q: 2.2, attack: 0.3, echo: 0.25 });
    },
    // タイトル：文字が開くとき。温かい低音の和音がふくらんで残る（「ドン」の一撃はなし）
    titleOpen: () => {
      tone(110, 1.8, { vol: 0.045, attack: 0.35, echo: 0.3 });
      tone(165, 1.6, { vol: 0.022, at: 0.08, attack: 0.45, echo: 0.3 });
    },
    // 南京錠が閉まる「ガチャッ」：低い衝撃と、金属の小さな響き
    lock: () => {
      tone(95, 0.1, { vol: 0.22 });
      hiss(0.045, { vol: 0.12, filter: "lowpass", freq: 1600 });
      tone(1650, 0.05, { vol: 0.03, at: 0.01, echo: 0.3 });
      tone(2470, 0.04, { vol: 0.015, at: 0.02 });
    },
    // 手がかり：澄んだベルのような音
    evidence: () => {
      tone(110, 0.25, { vol: 0.1 });
      tone(1318, 1.1, { vol: 0.035, echo: 0.6, attack: 0.005 });
      tone(1975, 1.0, { vol: 0.02, at: 0.07, echo: 0.6 });
    },
    // 目標の達成：低い一打のあと、澄んだ音が3つ上がっていく（ラ → ミ → ラ）
    objective: () => {
      tone(82, 0.5, { vol: 0.16, slide: 60 });
      [880, 1318, 1760].forEach((f, i) =>
        tone(f, 0.9, { vol: 0.03, at: 0.06 + i * 0.09, echo: 0.5, attack: 0.004 }),
      );
      hiss(0.3, { vol: 0.03, filter: "highpass", freq: 6000, sweep: 9000, attack: 0.02 });
    },
    static: () => hiss(0.18, { vol: 0.09, freq: 1200, q: 0.6 }),
    // 画面が裂けた瞬間の「ジッ」：毎回少しずつ違う高さの、短いノイズ
    glitch: () => {
      hiss(0.05 + Math.random() * 0.09, { vol: 0.06, freq: 700 + Math.random() * 3200, q: 5 });
      tone(90 + Math.random() * 260, 0.06, { type: "sawtooth", filter: 1400, vol: 0.035 });
    },
    // 画面にひびが走る：ガラスが軋むような高いノイズと、低い「ミシッ」
    crack: () => {
      hiss(0.22, { vol: 0.09, filter: "highpass", freq: 4200, sweep: 1600, q: 0.8 });
      tone(62, 0.35, { vol: 0.18, slide: 38 });
    },
    // 「ぴっ」：大事な値が表示されたときの、軽く短い電子音
    pip: () => {
      tone(1760, 0.07, { vol: 0.045, attack: 0.002 });
      tone(2637, 0.05, { vol: 0.02, at: 0.06, attack: 0.002 });
    },
    // ブザー「ブー」：照合に引っかかった（低く濁った音を、少しのあいだ鳴らす）
    buzz: () => {
      tone(110, 0.75, { type: "sawtooth", filter: 900, vol: 0.16, attack: 0.01 });
      tone(116.5, 0.75, { type: "sawtooth", filter: 900, vol: 0.12, attack: 0.01 });
      hiss(0.12, { vol: 0.06, filter: "lowpass", freq: 600 });
    },
    // 照明が落ちる「ガコン」
    clunk: () => {
      tone(58, 0.22, { vol: 0.2, slide: 40 });
      hiss(0.06, { vol: 0.07, filter: "lowpass", freq: 900 });
    },
    // 画面が消える「ぴちゅん」：高い音が一瞬で落ち、短い残響だけ残る
    power: () => {
      tone(2600, 0.08, { vol: 0.06, slide: 700, attack: 0.002 });
      tone(1400, 0.16, { vol: 0.035, at: 0.07, slide: 160, echo: 0.35 });
      hiss(0.03, { vol: 0.05, filter: "highpass", freq: 5000 });
    },
    boom: () => {
      tone(48, 2.2, { vol: 0.45, slide: 26 });
      hiss(1.4, { vol: 0.2, filter: "lowpass", freq: 1400, sweep: 90, echo: 0.3 });
    },
    // 警報：こもったうねり
    siren(on) {
      if (siren) {
        try {
          siren.stop();
        } catch {}
        siren = null;
      }
      if (!on || muted) return;
      const c = ac();
      if (!c) return;
      const osc = c.createOscillator(),
        lfo = c.createOscillator(),
        depth = c.createGain(),
        f = c.createBiquadFilter(),
        g = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 440;
      lfo.frequency.value = 0.55;
      depth.gain.value = 110;
      f.type = "lowpass";
      f.frequency.value = 900;
      lfo.connect(depth).connect(osc.frequency);
      g.gain.value = 0.035;
      osc.connect(f).connect(g).connect(out);
      osc.start();
      lfo.start();
      siren = {
        stop() {
          osc.stop();
          lfo.stop();
        },
      };
    },
    // BGM：師匠が流している音楽。on / off は「流したい」という希望で、音を消している間は鳴らさない
    // track を指定すると曲を切りかえる（今の曲はフェードアウトし、新しい曲がこもった音から開いて始まる）
    music(on, opt = {}) {
      if (opt.track && opt.track !== track) {
        track = opt.track;
        runLevel = 0;
        if (bgm) stopBgm({});
      }
      bgmWant = on;
      applyBgm(opt);
    },
    // ボーナスタイムの曲の盛り上がり（0〜3）。上がるだけで、下がらない。切りかわるのは、今のループ（8小節）の終わり
    musicLevel(n) {
      runLevel = Math.max(runLevel, n);
      if (bgm) bgm.want = runLevel;
    },
    // コマンドを実行した瞬間の「ビシュッ」：ボーナスタイムの曲に合わせて、次の16分ちょうどに鳴る
    beat() {
      if (bgm && track === "run") bgm.zap = true;
    },
    get bgmOn() {
      return bgmOn;
    },
    get bgmPlaying() {
      return !!bgm;
    },
    toggleBgm() {
      bgmOn = !bgmOn;
      try {
        localStorage.setItem("uzu-bgm", bgmOn ? "1" : "0");
      } catch {}
      applyBgm();
      return bgmOn;
    },
    // 師匠がしゃべる間は、少しだけ音量を下げる
    duck(on) {
      if (!bgm) return;
      const t = ctx.currentTime;
      bgm.bus.gain.cancelScheduledValues(t);
      bgm.bus.gain.setTargetAtTime(on ? BGM_VOL * 0.45 : BGM_VOL, t, 0.15);
    },
    onBgmChange: null,
  };

  // ---------------- BGM の演奏 ----------------
  // 作業に集中できる、落ち着いたロー・ファイ寄りの曲。長く聞いても疲れないように：
  //   ・テンポはゆっくり（88）。ドラムは柔らかく小さく、少しだけハネさせる
  //   ・和音は Am9 → Fmaj7 → Dm9 → Em7 を2小節ずつ。こもった柔らかい音で、ゆっくり息をするように揺れる
  //   ・メロディは毎回その場で作る（前の音の近くの音を選ぶので、フレーズに聞こえる）。同じくり返しにならない
  //   ・最初の4小節はドラムなし。32小節（約1分半）ごとに、ドラムが抜けて静かになる区間がある
  function applyBgm(opt = {}) {
    const play = bgmWant && bgmOn && !muted;
    if (play && !bgm) startBgm();
    else if (!play && bgm) stopBgm(opt);
    api.onBgmChange?.();
  }

  // BGM_VOL は全体の音量に対する BGM の割合（効果音より控えめに、後ろで小さく流れる程度）
  const BGM_VOL = 0.021;
  // 曲（track）：calm … 作業用の落ち着いた曲（任務1・3）／run … ボーナスタイムの、前へ進む曲（任務2）
  //              daily … 練習の曲。日常的で、ちょっとかっこいい（チュートリアル）
  const TRACKS = {
    calm: { bpm: 88, play: (n, t) => playCalm(n, t) },
    run: { bpm: 128, play: (n, t) => playRun(n, t) },
    daily: { bpm: 90, play: (n, t) => playDaily(n, t) },
  };
  let track = "calm",
    runLevel = 0;
  const CHORDS = [
    {
      root: 55.0,
      pad: [261.63, 329.63, 392.0, 493.88],
      mel: [440.0, 493.88, 523.25, 659.25, 783.99],
    }, // Am9
    { root: 43.65, pad: [220.0, 261.63, 329.63, 392.0], mel: [440.0, 523.25, 659.25, 783.99] }, // Fmaj7
    { root: 73.42, pad: [174.61, 220.0, 261.63, 329.63], mel: [440.0, 523.25, 587.33, 659.25] }, // Dm9
    { root: 82.41, pad: [196.0, 246.94, 293.66, 392.0], mel: [392.0, 493.88, 587.33, 659.25] }, // Em7
  ];

  function startBgm() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const T = TRACKS[track],
      STEP = 60 / T.bpm / 4; // 16分音符1つの長さ（曲ごとのテンポ）
    // ラジオのつまみを回したように、こもった音から開いていく
    const bus = c.createGain(),
      lp = c.createBiquadFilter();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(BGM_VOL, t + 3);
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(14000, t + 5);
    bus.connect(lp).connect(out);
    // BGM 専用の残響（BGM の音量・フェード・テープ停止がそのまま効くよう、bus に戻す）
    const bgmEcho = c.createGain(),
      delay = c.createDelay(1),
      fb = c.createGain(),
      elp = c.createBiquadFilter();
    delay.delayTime.value = STEP * 3;
    fb.gain.value = 0.38;
    elp.type = "lowpass";
    elp.frequency.value = 1600;
    bgmEcho.connect(delay);
    delay.connect(elp);
    elp.connect(fb);
    fb.connect(delay);
    elp.connect(bus);
    bgm = {
      bus,
      lp,
      echo: bgmEcho,
      step: 0,
      next: t + 0.1,
      timer: null,
      mel: 2,
      rest: 0,
      T,
      stepLen: STEP,
      level: runLevel,
      want: runLevel,
      zap: false,
      chorusStart: null,
    };
    bgm.timer = setInterval(scheduleBgm, 25);
    scheduleBgm();
  }
  function stopBgm(opt = {}) {
    const b = bgm;
    bgm = null;
    const t = ctx.currentTime;
    clearInterval(b.timer);
    if (opt.tape) {
      // テープが止まるように、音がしぼんで途切れる
      b.lp.frequency.cancelScheduledValues(t);
      b.lp.frequency.setValueAtTime(b.lp.frequency.value, t);
      b.lp.frequency.exponentialRampToValueAtTime(80, t + 0.5);
      b.bus.gain.cancelScheduledValues(t);
      b.bus.gain.setValueAtTime(b.bus.gain.value || BGM_VOL, t);
      b.bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    } else {
      b.bus.gain.cancelScheduledValues(t);
      b.bus.gain.setValueAtTime(b.bus.gain.value || BGM_VOL, t);
      b.bus.gain.exponentialRampToValueAtTime(0.0001, t + (opt.fast ? 0.05 : 1.5));
    }
    setTimeout(() => {
      try {
        b.bus.disconnect();
      } catch {}
    }, 2000);
  }
  // 少し先の分まで、音符を予約しておく（タブが裏に回ってタイマーが遅れても途切れにくいよう多めに）
  function scheduleBgm() {
    if (!bgm) return;
    // まだ音を出せない間は曲を先に進めない（触った時点から、曲の頭が自然に始まる）
    if (!canPlay(ctx)) {
      bgm.next = ctx.currentTime + 0.1;
      return;
    }
    const ahead = document.hidden ? 1.5 : 0.15;
    while (bgm.next < ctx.currentTime + ahead) {
      // 「実行」の音は次の16分ちょうどに、盛り上がりの切りかえはループ（8小節＝128 ステップ）の頭でだけ
      if (bgm.zap) {
        bgm.zap = false;
        zap(bgm.bus, bgm.next);
      }
      if (bgm.step % 128 === 0) bgm.level = bgm.want;
      bgm.T.play(bgm.step, bgm.next);
      bgm.next += bgm.stepLen;
      bgm.step++;
    }
  }
  function playCalm(n, t) {
    const STEP = bgm.stepLen,
      SWING = STEP * 0.18; // 裏の16分を少し遅らせて、機械っぽさを消す
    const s = n % 16,
      bar = Math.floor(n / 16),
      ch = CHORDS[Math.floor(bar / 2) % 4],
      bus = bgm.bus;
    const tt = s % 2 ? t + SWING : t; // 裏拍だけ少し遅らせる
    const calm = bar < 4 || bar % 32 >= 28; // 最初の4小節と、32小節ごとの静かな区間
    // 和音とベースは2小節ごとに、長く伸ばす
    if (s === 0 && bar % 2 === 0) {
      pad(bus, t, ch.pad, STEP * 32);
      sub(bus, t, ch.root, STEP * 31);
    }
    if (!calm) {
      if (s === 0 || s === 10) kick(bus, t, s === 0 ? 1 : 0.7);
      if (s === 4 || s === 12) rim(bus, t);
    }
    if (bar >= 2 && !calm) shaker(bus, tt, s % 4 === 2 ? 1 : 0.45 + Math.random() * 0.3);
    // メロディ：8分の位置で、ときどきポロンと鳴らす（静かな区間は少し多め）
    if (s % 2 === 0 && bar >= 2 && Math.random() < (calm ? 0.22 : 0.13)) {
      if (bgm.rest > 0) {
        bgm.rest--;
        return;
      }
      const pool = ch.mel;
      const moves = [-1, -1, 0, 1, 1, 2];
      bgm.mel = Math.max(
        0,
        Math.min(pool.length - 1, bgm.mel + moves[Math.floor(Math.random() * moves.length)]),
      );
      keys(bus, tt, pool[bgm.mel]);
      if (Math.random() < 0.3) bgm.rest = 2; // フレーズの切れ目で少し休む
    }
  }
  // ---------------- ボーナスタイムの曲（run）：ミニマル・ラン（サビつき） ----------------
  // 任務2用。暗くクールで、ベースが16分で転がり続ける、走る曲。遊びが進むほど盛り上がる（SFX.musicLevel）：
  //   ・テンポ 128。D マイナー。和音は Dm → B♭ → C → A を2小節ずつ
  //   ・盛り上がり 0：ベース・ドラム・手拍子（「ポッ」はときどき）／1：「ポッ」のフレーズ全部・アルペジオ／2：メロディ
  //   ・3 はサビ：ループの終わりの「ため」（スネアの連打）のあと「ドーン」と入る。2 の音は全部残し、
  //     和音が1小節ごと（Dm → B♭ → F → C）に変わり、ドラムが強くなり、8分で刻む高めのメロディ
  //   ・盛り上がりの切りかえは、いつもループ（8小節）の終わり。コマンドを打つと、リズムに合わせて「ビシュッ」（zap）
  const RUN = [
    { root: 73.42, pad: [293.66, 349.23, 440.0], arp: [293.66, 349.23, 440.0, 587.33] }, // Dm
    { root: 58.27, pad: [233.08, 293.66, 349.23], arp: [233.08, 293.66, 349.23, 466.16] }, // B♭
    { root: 65.41, pad: [261.63, 329.63, 392.0], arp: [261.63, 329.63, 392.0, 523.25] }, // C
    { root: 55.0, pad: [220.0, 277.18, 329.63], arp: [220.0, 277.18, 329.63, 440.0] }, // A
  ];
  const CHORUS = [
    { root: 73.42, pad: [293.66, 349.23, 440.0], arp: [293.66, 349.23, 440.0, 587.33] }, // Dm
    { root: 58.27, pad: [233.08, 293.66, 349.23], arp: [233.08, 293.66, 349.23, 466.16] }, // B♭
    { root: 43.65, pad: [261.63, 349.23, 440.0], arp: [261.63, 349.23, 440.0, 523.25] }, // F
    { root: 65.41, pad: [261.63, 329.63, 392.0], arp: [261.63, 329.63, 392.0, 523.25] }, // C
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
  // 「ポッ」のフレーズ（BLIPS の何番目か。-1 は休み）
  const SEQ = [0, -1, 3, -1, 1, -1, 4, 2, -1, 0, -1, 3, -1, 5, 2, -1];
  const BLIPS = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
  // メロディ（盛り上がり 2）：和音ごとに2小節で1フレーズ（[16分の位置 0〜31, 長さ（16分いくつ）, 周波数]）
  const LEAD = [
    [
      [0, 6, 587.33],
      [6, 2, 523.25],
      [8, 8, 440.0],
      [16, 6, 523.25],
      [22, 2, 587.33],
      [24, 8, 659.25],
    ],
    [
      [0, 6, 587.33],
      [6, 2, 523.25],
      [8, 8, 466.16],
      [16, 8, 440.0],
      [24, 8, 349.23],
    ],
    [
      [0, 6, 523.25],
      [6, 2, 587.33],
      [8, 8, 659.25],
      [16, 6, 587.33],
      [22, 2, 523.25],
      [24, 8, 392.0],
    ],
    [
      [0, 8, 554.37],
      [8, 8, 440.0],
      [16, 8, 329.63],
      [24, 8, 440.0],
    ],
  ];
  // サビのメロディ：1小節ずつ、8小節で1まわり。8分で細かく刻み、3拍目の前で少し食う。後半は上へのぼる
  const HOOK = [
    [
      [0, 2, 587.33],
      [2, 2, 698.46],
      [4, 2, 880.0],
      [6, 3, 783.99],
      [10, 2, 698.46],
      [12, 2, 659.25],
      [14, 2, 698.46],
    ], // Dm
    [
      [0, 2, 698.46],
      [2, 2, 698.46],
      [4, 2, 659.25],
      [6, 3, 587.33],
      [10, 2, 523.25],
      [12, 2, 587.33],
      [14, 2, 466.16],
    ], // B♭
    [
      [0, 2, 523.25],
      [2, 2, 587.33],
      [4, 2, 698.46],
      [6, 3, 880.0],
      [10, 2, 783.99],
      [12, 2, 698.46],
      [14, 2, 783.99],
    ], // F（のぼる）
    [
      [0, 3, 659.25],
      [3, 3, 783.99],
      [6, 2, 659.25],
      [8, 2, 523.25],
      [10, 2, 587.33],
      [12, 4, 659.25],
    ], // C
    [
      [0, 2, 587.33],
      [2, 2, 698.46],
      [4, 2, 880.0],
      [6, 3, 783.99],
      [10, 2, 698.46],
      [12, 2, 659.25],
      [14, 2, 698.46],
    ],
    [
      [0, 2, 698.46],
      [2, 2, 698.46],
      [4, 2, 659.25],
      [6, 3, 587.33],
      [10, 2, 523.25],
      [12, 2, 587.33],
      [14, 2, 466.16],
    ],
    [
      [0, 2, 523.25],
      [2, 2, 698.46],
      [4, 2, 880.0],
      [6, 3, 1046.5],
      [10, 2, 880.0],
      [12, 2, 783.99],
      [14, 2, 880.0],
    ], // F：いちばん高い ド まで
    [
      [0, 2, 659.25],
      [2, 2, 783.99],
      [4, 2, 880.0],
      [6, 2, 783.99],
      [8, 2, 659.25],
      [10, 2, 587.33],
      [12, 4, 659.25],
    ], // C：次の頭の レ へ
  ];
  function playRun(n, t) {
    const b = bgm,
      s = n % 16,
      bar = Math.floor(n / 16),
      bus = b.bus,
      ST = b.stepLen,
      L = b.level;
    // サビ（3）：盛り上がりはループの頭でだけ切りかわるので、サビもループの頭から始まる
    if (L >= 3) {
      if (b.chorusStart == null) b.chorusStart = bar;
      return playChorus(t, bar - b.chorusStart, s);
    }
    b.chorusStart = null;
    // サビに上がる予約があるときは、ループの最後の1小節が「ため」（強いスネアの連打）になる
    const inBuild = b.want >= 3 && bar % 8 === 7;
    const step2 = Math.floor(bar / 2) % 4,
      ch = RUN[step2];
    const build = bar % 8 === 7 || inBuild,
      intro = bar < 2;
    const pos = (bar % 2) * 16 + s;
    // ── 0：ベース・ドラム・手拍子
    if (s === 0 && bar % 2 === 0) pad(bus, t, ch.pad, ST * 32, L >= 1 ? 1150 : 700);
    if (!(build && s >= 8))
      rollBass(bus, t, ch.root * [1, 1, 2, 1][s % 4], ST * 0.9, s % 4 === 0 ? 0.6 : 1);
    if (L >= 2 && !(build && s >= 8) && s % 2 === 0) pumpBass(bus, t, ch.root, ST * 1.6, 0.45);
    if (!intro && !(build && s >= 12) && s % 4 === 0) kick(bus, t, 0.9);
    if (!intro) {
      hat(bus, t, s % 4 === 2 ? 1.6 : 0.6);
      if (s === 4 || s === 12) clap3(bus, t);
    }
    if (build && s === 0) riser(bus, t, ST * 16);
    // 「ため」：スネアがだんだん細かく、強くなる（サビの直前は16分）
    if (inBuild) {
      if (s < 8 ? s % 4 === 0 : s < 12 ? s % 2 === 0 : true) snare(bus, t, 0.35 + s * 0.05);
    } else if (build && s >= 8 && s % 2 === 0) snare(bus, t, 0.4 + (s - 8) * 0.08);
    // ── 1：「ポッ」のフレーズ全部・裏拍で開くハイハット・アルペジオ（0 では「ポッ」がときどきだけ）
    const k = SEQ[s];
    if (k >= 0 && (L >= 1 || Math.random() < 0.35)) blip(bus, t, BLIPS[k]);
    if (L >= 1 && !intro && s % 4 === 2) openHat(bus, t);
    if (L >= 1 && !(build && s >= 8)) arp(bus, t, ch.arp[ARP[s]], ST * 0.9, 0.8);
    // ── 2：メロディ
    if (L >= 2 && !build)
      for (const [at, len, f] of LEAD[step2]) if (at === pos) neonLead(bus, t, f, ST * len);
  }
  // サビ：2 の音（転がるベース・「ポッ」・アルペジオ）は全部残し、その上に盛り上げる音を足す
  function playChorus(t, cbar, s) {
    const bus = bgm.bus,
      ST = bgm.stepLen,
      ch = CHORUS[cbar % 4];
    const last = cbar % 8 === 7;
    // 入った瞬間：「ドーン」と「シャーン」。あとは4小節ごとに「シャーン」
    if (cbar === 0 && s === 0) {
      boom(bus, t);
      crash(bus, t);
    } else if (s === 0 && cbar % 4 === 0) crash(bus, t);
    // 和音（1小節ごと、いちばん明るく開いたパッド）
    if (s === 0) pad(bus, t, ch.pad, ST * 16, 1400);
    if (!(last && s >= 8))
      rollBass(bus, t, ch.root * [1, 1, 2, 1][s % 4], ST * 0.9, s % 4 === 0 ? 0.6 : 1);
    if (!(last && s >= 8) && s % 2 === 0) pumpBass(bus, t, ch.root, ST * 1.6, 0.55);
    // ドラムは強く：4つ打ち、手拍子＋スネア、裏で開くハイハット、16分のハイハット
    if (s % 4 === 0 && !(last && s >= 12)) kick(bus, t, 1);
    if (s === 4 || s === 12) {
      clap3(bus, t, 1.1);
      snare(bus, t, 0.55);
    }
    if (s % 4 === 2) openHat(bus, t);
    hat(bus, t, s % 2 ? 0.8 : 1.3);
    if (last && s >= 8) snare(bus, t, 0.4 + (s - 8) * 0.07); // 8小節目の後半はスネアが詰まって、次の頭へ
    const k = SEQ[s];
    if (k >= 0) blip(bus, t, BLIPS[k]);
    if (!(last && s >= 8)) arp(bus, t, ch.arp[ARP[s]], ST * 0.9, 0.9);
    // 裏で「タッ」と刻む和音（ノリを足す）
    if ([2, 6, 10, 13].includes(s)) chordStab(bus, t, ch.pad, ST * 1.2);
    for (const [at, len, f] of HOOK[cbar % 8]) if (at === s) neonLead(bus, t, f, ST * len);
  }
  // ---------------- 練習の曲（daily）：ローファイ・グルーヴ ----------------
  // チュートリアル用。日常の、ちょっとかっこいい曲。柔らかく、低めに：
  //   ・テンポ 90。裏の16分を大きくハネさせる（ゆったり歩くノリ）
  //   ・和音は Dm9 → G13 → Cmaj9 → Am9 を1小節ずつ。エレピの丸い音で、1拍目と、3拍目の少し前に弾く
  //   ・ベースは丸い低音で、短いフレーズをくり返す（小節の終わりに、次の和音へ半音下から寄っていく）
  //   ・練習は短いので、最初から盛り上がった「サビ」をループする：
  //     ドラムは1拍目から入りっぱなし（もたったキックと、こもったスネア）。静かになる区間はない
  //   ・5小節目から、8小節ごとの後半に、ビブラフォン風のメロディが返事をするように入る
  const DAILY = [
    { root: 73.42, ep: [174.61, 220.0, 261.63, 329.63] }, // Dm9
    { root: 49.0, ep: [174.61, 220.0, 246.94, 329.63] }, // G13
    { root: 65.41, ep: [164.81, 196.0, 246.94, 293.66] }, // Cmaj9
    { root: 55.0, ep: [196.0, 246.94, 261.63, 329.63] }, // Am9
  ];
  // ベース：[16分の位置, 根音の何倍か（"up" は次の和音の半音下）, 長さ（16分いくつ）]
  const DAILY_BASS = [
    [0, 1, 5],
    [6, 1, 2],
    [10, 1.5, 3],
    [14, "up", 2],
  ];
  // メロディ（後半4小節）：[何小節目 0〜3, 16分の位置, 周波数]
  const DAILY_MEL = [
    [0, 2, 440.0],
    [0, 4, 523.25],
    [0, 6, 587.33],
    [0, 10, 523.25],
    [0, 12, 440.0],
    [1, 3, 493.88],
    [1, 8, 440.0],
    [1, 14, 392.0],
    [2, 2, 659.25],
    [2, 4, 587.33],
    [2, 6, 493.88],
    [2, 10, 392.0],
    [3, 4, 440.0],
    [3, 7, 523.25],
    [3, 12, 440.0],
  ];
  function playDaily(n, t) {
    const ST = bgm.stepLen,
      s = n % 16,
      bar = Math.floor(n / 16),
      bus = bgm.bus;
    const ch = DAILY[bar % 4],
      nx = DAILY[(bar + 1) % 4];
    const tt = s % 2 ? t + ST * 0.28 : t; // 裏の16分を遅らせて、ハネさせる
    // エレピの和音：1拍目に長く、3拍目の少し前（裏）に短く
    if (s === 0) ep(bus, t, ch.ep, ST * 10, 1);
    if (s === 11) ep(bus, tt, ch.ep, ST * 4, 0.55);
    for (const [at, k, len] of DAILY_BASS)
      if (at === s) roundBass(bus, tt, k === "up" ? nx.root * 0.9439 : ch.root * k, ST * len);
    if (s === 0 || s === 10) kick(bus, t, s === 0 ? 0.8 : 0.6);
    if (s === 7) kick(bus, tt, 0.4);
    if (s === 4 || s === 12) softSnare(bus, t + ST * 0.06); // スネアは少しだけ後ろにもたらせる
    if (s % 2 === 0) hat(bus, t, s % 4 === 2 ? 1.1 : 0.6);
    else if (Math.random() < 0.25) hat(bus, tt, 0.35);
    if (bar % 8 >= 4)
      for (const [mb, at, f] of DAILY_MEL) if (mb === (bar % 8) - 4 && at === s) vibe(bus, tt, f);
  }
  // エレピ：丸い正弦波に、弾いた瞬間だけ鳴る1オクターブ上を重ねる（ローズのような柔らかい音）
  function ep(bus, t, notes, dur, v) {
    const g = voice(
      bus,
      t,
      dur + 0.8,
      0.026 * v,
      g => {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 1500;
        f.connect(g);
        for (const note of notes) {
          const d = 1 + (Math.random() - 0.5) * 0.004;
          const o = ctx.createOscillator();
          o.frequency.value = note * d;
          o.connect(f);
          const o2 = ctx.createOscillator();
          o2.frequency.value = note * 2 * d;
          const g2 = ctx.createGain();
          g2.gain.setValueAtTime(0.4, t);
          g2.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
          o2.connect(g2).connect(f);
          o.start(t);
          o2.start(t);
          o.stop(t + dur + 0.85);
          o2.stop(t + dur + 0.85);
        }
      },
      0.01,
    );
    send(g, 0.25);
  }
  // 丸いベース：正弦波に、小さいスピーカーでも聞こえるよう1オクターブ上の三角波をうっすら
  function roundBass(bus, t, freq, dur) {
    voice(
      bus,
      t,
      dur,
      0.22,
      g => {
        const o = ctx.createOscillator();
        o.frequency.value = freq;
        o.connect(g);
        const o2 = ctx.createOscillator();
        o2.type = "triangle";
        o2.frequency.value = freq * 2;
        const g2 = ctx.createGain();
        g2.gain.value = 0.3;
        o2.connect(g2).connect(g);
        o.start(t);
        o2.start(t);
        o.stop(t + dur + 0.05);
        o2.stop(t + dur + 0.05);
      },
      0.012,
    );
  }
  // こもったスネア：ノイズを低めに絞った「パスッ」
  function softSnare(bus, t) {
    const g = voice(
      bus,
      t,
      0.2,
      0.05,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1100;
        f.Q.value = 0.7;
        src.connect(f).connect(g);
        src.start(t, Math.random());
        src.stop(t + 0.22);
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(130, t + 0.08);
        const og = ctx.createGain();
        og.gain.value = 0.5;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + 0.1);
      },
      0.004,
    );
    send(g, 0.3);
  }
  // ビブラフォン風：正弦波に、ゆっくり揺れる音量（トレモロ）と、叩いた瞬間の小さな金属音
  function vibe(bus, t, freq) {
    const g = voice(
      bus,
      t,
      1.6,
      0.035,
      g => {
        const trem = ctx.createGain();
        trem.gain.value = 1;
        trem.connect(g);
        const lfo = ctx.createOscillator(),
          depth = ctx.createGain();
        lfo.frequency.value = 5;
        depth.gain.value = 0.25;
        lfo.connect(depth).connect(trem.gain);
        const o = ctx.createOscillator();
        o.frequency.value = freq;
        o.connect(trem);
        const o2 = ctx.createOscillator();
        o2.frequency.value = freq * 4;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.12, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        o2.connect(g2).connect(trem);
        o.start(t);
        o2.start(t);
        lfo.start(t);
        o.stop(t + 1.65);
        o2.stop(t + 1.65);
        lfo.stop(t + 1.65);
      },
      0.004,
    );
    send(g, 0.4);
  }
  // 残響へ送る（BGM 専用の残響。音量・フェードがそのまま効く）
  function send(g, amount) {
    const s = ctx.createGain();
    s.gain.value = amount;
    g.connect(s).connect(bgm.echo);
  }
  // 「実行」の音：リズムに合わせて鳴る「ビシュッ」と、強めのキック
  function zap(bus, t) {
    const g = voice(
      bus,
      t,
      0.35,
      0.153,
      g => {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(220, t + 0.25);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 2400;
        o.connect(f).connect(g);
        o.start(t);
        o.stop(t + 0.36);
      },
      0.003,
    );
    send(g, 0.5);
    kick(bus, t, 1.53);
  }
  // 転がるベース：16分で刻む、短くこもったノコギリ波
  function rollBass(bus, t, freq, dur, v) {
    voice(
      bus,
      t,
      dur,
      0.13 * v,
      g => {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = 3;
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(250, t + dur);
        f.connect(g);
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      },
      0.003,
    );
  }
  // 「ポッ」：短い正弦波の粒。残響多め
  function blip(bus, t, freq) {
    const g = voice(
      bus,
      t,
      0.22,
      0.035,
      g => {
        const o = ctx.createOscillator();
        o.frequency.value = freq;
        o.connect(g);
        o.start(t);
        o.stop(t + 0.25);
      },
      0.003,
    );
    send(g, 0.5);
  }
  // 「ため」の、だんだん高くなる「サーッ」
  function riser(bus, t, dur) {
    voice(
      bus,
      t,
      dur,
      0.05,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.Q.value = 1.5;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(4000, t + dur);
        src.connect(f).connect(g);
        src.start(t);
        src.stop(t + dur + 0.05);
      },
      dur * 0.9,
    );
  }
  // 裏拍で「タッ」と刻む、エレピ風の短い和音
  function chordStab(bus, t, notes, dur) {
    const g = voice(
      bus,
      t,
      dur,
      0.03,
      g => {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = 1;
        f.frequency.setValueAtTime(2400, t);
        f.frequency.exponentialRampToValueAtTime(700, t + dur);
        f.connect(g);
        for (const note of notes) {
          const o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.value = note;
          o.connect(f);
          o.start(t);
          o.stop(t + dur + 0.05);
          const o2 = ctx.createOscillator();
          o2.frequency.value = note * 2;
          const g2 = ctx.createGain();
          g2.gain.setValueAtTime(0.3, t);
          g2.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
          o2.connect(g2).connect(f);
          o2.start(t);
          o2.stop(t + dur + 0.05);
        }
      },
      0.003,
    );
    send(g, 0.3);
  }
  // サビに入る瞬間の「ドーン」：深いキックと、低いうなり
  function boom(bus, t) {
    voice(
      bus,
      t,
      1.4,
      0.7,
      g => {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(32, t + 1.2);
        o.connect(g);
        o.start(t);
        o.stop(t + 1.45);
      },
      0.003,
    );
    const g = voice(
      bus,
      t,
      1.2,
      0.05,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.setValueAtTime(2500, t);
        f.frequency.exponentialRampToValueAtTime(150, t + 1.2);
        src.connect(f).connect(g);
        src.start(t, Math.random());
        src.stop(t + 1.25);
      },
      0.003,
    );
    send(g, 0.4);
  }
  // シンバルのような「シャーン」：やわらかいノイズが長く残る
  function crash(bus, t) {
    const g = voice(
      bus,
      t,
      1.6,
      0.03,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.setValueAtTime(5000, t);
        f.frequency.exponentialRampToValueAtTime(2500, t + 1.6);
        src.connect(f).connect(g);
        src.start(t, Math.random());
        src.stop(t + 1.65);
      },
      0.005,
    );
    send(g, 0.3);
  }
  // 弾むベース：こもったノコギリ波に、低い正弦波を重ねる
  function pumpBass(bus, t, freq, dur, v) {
    voice(
      bus,
      t,
      dur,
      0.15 * v,
      g => {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = 3;
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(200, t + dur);
        f.connect(g);
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.connect(f);
        const o2 = ctx.createOscillator();
        o2.frequency.value = freq;
        o2.connect(g);
        o.start(t);
        o2.start(t);
        o.stop(t + dur + 0.05);
        o2.stop(t + dur + 0.05);
      },
      0.004,
    );
  }
  // ハイハット：ごく小さな「チッ」（v で強さ）
  function hat(bus, t, v = 1) {
    voice(
      bus,
      t,
      0.035,
      0.011 * v,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 7800;
        src.connect(f).connect(g);
        src.start(t, Math.random());
        src.stop(t + 0.05);
      },
      0.002,
    );
  }
  // オープンハイハット：少し長く「シーッ」と残る（裏拍で、ノリを足す）
  function openHat(bus, t) {
    voice(
      bus,
      t,
      0.14,
      0.009,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 6500;
        src.connect(f).connect(g);
        src.start(t, Math.random());
        src.stop(t + 0.16);
      },
      0.004,
    );
  }
  // 手拍子：少しずつずらした3つの「パン」を重ねる
  function clap3(bus, t, v = 1) {
    for (const d of [0, 0.012, 0.024]) {
      const g = voice(
        bus,
        t + d,
        0.12,
        0.07 * v,
        g => {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          const f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = 1300;
          f.Q.value = 1.2;
          src.connect(f).connect(g);
          src.start(t + d, Math.random());
          src.stop(t + d + 0.14);
        },
        0.002,
      );
      if (d === 0.024) send(g, 0.3);
    }
  }
  // スネア：ノイズの「パシッ」に、短い胴鳴り
  function snare(bus, t, v = 1) {
    const g = voice(
      bus,
      t,
      0.18,
      0.09 * v,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1500;
        f.Q.value = 0.8;
        src.connect(f).connect(g);
        src.start(t, Math.random());
        src.stop(t + 0.2);
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        const og = ctx.createGain();
        og.gain.value = 0.4;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + 0.1);
      },
      0.003,
    );
    send(g, 0.25);
  }
  // アルペジオ（プラック）：フィルターが一瞬開いてすぐ閉じる、粒の立った音。残響を少し
  function arp(bus, t, freq, dur, v) {
    const g = voice(
      bus,
      t,
      dur,
      0.026 * v,
      g => {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = 4;
        f.frequency.setValueAtTime(2600, t);
        f.frequency.exponentialRampToValueAtTime(500, t + dur * 0.8);
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.connect(f).connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      },
      0.003,
    );
    const sendG = ctx.createGain();
    sendG.gain.value = 0.35;
    g.connect(sendG).connect(bgm.echo);
  }
  // メロディ（リード）：2本のノコギリ波を少しずらし、ゆっくりビブラートをかけた、ネオンのように伸びる音
  function neonLead(bus, t, freq, dur) {
    const g = voice(
      bus,
      t,
      dur * 1.05,
      0.035,
      g => {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 2400;
        f.Q.value = 1;
        f.connect(g);
        const vib = ctx.createOscillator(),
          depth = ctx.createGain();
        vib.frequency.value = 5.2;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(0.25, dur * 0.6));
        vib.connect(depth);
        for (const d of [0.997, 1.003]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = freq * d;
          depth.connect(o.frequency);
          o.connect(f);
          o.start(t);
          o.stop(t + dur * 1.05 + 0.05);
        }
        vib.start(t);
        vib.stop(t + dur * 1.05 + 0.05);
      },
      0.02,
    );
    const sendG = ctx.createGain();
    sendG.gain.value = 0.45;
    g.connect(sendG).connect(bgm.echo);
  }

  function voice(bus, t, dur, vol, build, attack = 0.005) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    build(g);
    return g;
  }
  // キック：短く柔らかい「トッ」
  function kick(bus, t, v) {
    voice(bus, t, 0.3, 0.55 * v, g => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(115, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.32);
    });
  }
  // リムショット：残響つきの小さな「コッ」
  function rim(bus, t) {
    const g = voice(bus, t, 0.06, 0.1, g => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 2600;
      f.Q.value = 5;
      src.connect(f).connect(g);
      src.start(t, Math.random());
      src.stop(t + 0.08);
      const o = ctx.createOscillator();
      o.frequency.value = 1700;
      const og = ctx.createGain();
      og.gain.value = 0.3;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 0.03);
    });
    const s = ctx.createGain();
    s.gain.value = 0.35;
    g.connect(s).connect(bgm.echo);
  }
  // シェイカー：ごく小さな「シャッ」
  function shaker(bus, t, v) {
    voice(
      bus,
      t,
      0.05,
      0.012 * v,
      g => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 6500;
        src.connect(f).connect(g);
        src.start(t, Math.random());
        src.stop(t + 0.07);
      },
      0.012,
    );
  }
  // ベース：刻まずに低く伸ばす（小さいスピーカーでも聞こえるよう、1オクターブ上を少し重ねる）
  function sub(bus, t, freq, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    o.connect(g);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o2.connect(g2).connect(g);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }
  // 和音：こもった柔らかい音で、ゆっくり息をするように明るさが揺れる（bright でいちばん開いたときの明るさ）
  function pad(bus, t, notes, dur, bright = 900) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + Math.min(1.4, dur * 0.4));
    g.gain.setValueAtTime(0.035, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6); // 次の和音と重なりながら消える
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.5;
    f.frequency.setValueAtTime(bright * 0.5, t);
    f.frequency.linearRampToValueAtTime(bright, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(bright * 0.55, t + dur);
    f.connect(g).connect(bus);
    for (const note of notes) {
      for (const d of [0.997, 1.003]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = note * d;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1.7);
      }
    }
  }
  // メロディ：エレピやベルのような柔らかい音（1オクターブ上をうっすら重ねる）。残響多め
  function keys(bus, t, freq) {
    const g = voice(
      bus,
      t,
      1.4,
      0.06,
      g => {
        const o = ctx.createOscillator();
        o.frequency.value = freq;
        o.connect(g);
        const o2 = ctx.createOscillator();
        o2.frequency.value = freq * 2;
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.35, t);
        g2.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        o2.connect(g2).connect(g);
        o.start(t);
        o2.start(t);
        o.stop(t + 1.45);
        o2.stop(t + 1.45);
      },
      0.008,
    );
    const s = ctx.createGain();
    s.gain.value = 0.55;
    g.connect(s).connect(bgm.echo);
  }

  return api;
})();

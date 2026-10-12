// =========================================================
//  トーク
//  師匠との暗号チャット（chat）と、事務所の受付で依頼人と会う場面（meet）
//  任務の前（prologue）と、任務のあと（afterTalk）に流れる。書き方は src/scenario.js の先頭
// =========================================================

const talkEl = $("talk");
let talkSkip = false; // タップで、いまの待ち時間を飛ばす
let talkPick = null; // 選択肢を待っているとき：選んだら呼ぶ

// タップで飛ばせる待ち時間
function talkWait(ms) {
  talkSkip = false;
  return new Promise(r => {
    const t0 = Date.now();
    const tick = () => {
      if (talkSkip || Date.now() - t0 >= ms) {
        talkSkip = false;
        r();
      } else setTimeout(tick, 30);
    };
    tick();
  });
}
// 読む時間：文字数に合わせる（短い「……。」はすぐ、長い文はゆっくり読み切れるように）
const readMs = text => Math.min(5600, Math.max(1200, 500 + [...text].length * 95));
// 場面が切りかわる前と、トークの終わりに、下まで読み終えるのを待つ間
const SCENE_END_MS = 2400;

// 依頼人などの「写真」：その場で描いた絵を、粗いドット絵にして出す（px … 一辺のドット数）
//   shadow … 最初の逆光の影 ／ face … 近づいてきたときの顔（{ reveal } で、モザイクから浮かび上がる）
const PORTRAITS = {
  // 真壁 汐里：長い黒髪、黒いコート。夜の事務所で、左の窓の光が顔の半分に当たる。静かな美人で、幸の薄そうな顔（写実寄り。困り眉・目尻が少し下がる・白い肌・うっすら隈）
  shiori: {
    px: 120,
    shadow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs><linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="#46555d"/><stop offset="0.5" stop-color="#20272b"/><stop offset="1" stop-color="#0d1012"/></linearGradient></defs>
    <rect width="300" height="300" fill="url(#bg)"/>
    <g fill="#7d909a" opacity="0.3"><rect x="0" y="24" width="70" height="3"/><rect x="0" y="38" width="70" height="3"/><rect x="0" y="52" width="70" height="3"/><rect x="0" y="66" width="70" height="3"/><rect x="0" y="80" width="70" height="3"/><rect x="0" y="94" width="70" height="3"/><rect x="0" y="108" width="70" height="3"/><rect x="0" y="122" width="70" height="3"/></g>
    <path d="M150 40C92 40 74 90 76 140c2 60-6 110-20 160h190c-14-50-22-100-20-160 2-50-18-100-76-100z" fill="#060708"/>
    <path d="M30 300c10-34 40-52 84-56l38 28 38-28c44 4 74 22 84 56z" fill="#040505"/>
  </svg>`,
    face: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="bg" x1="0" x2="1">
        <stop offset="0" stop-color="#46555d"/>
        <stop offset="0.5" stop-color="#20272b"/>
        <stop offset="1" stop-color="#0d1012"/>
      </linearGradient>
      <linearGradient id="skin" x1="0" x2="1" y1="0" y2="0.15">
        <stop offset="0" stop-color="#f6e6dd"/>
        <stop offset="0.5" stop-color="#e3c8ba"/>
        <stop offset="0.82" stop-color="#ad8c80"/>
        <stop offset="1" stop-color="#6b5049"/>
      </linearGradient>
      <linearGradient id="neck" x1="0" x2="1">
        <stop offset="0" stop-color="#c29e8f"/>
        <stop offset="1" stop-color="#4c3630"/>
      </linearGradient>
      <linearGradient id="hair" x1="0" x2="1">
        <stop offset="0" stop-color="#3f3b44"/>
        <stop offset="0.35" stop-color="#1c181d"/>
        <stop offset="1" stop-color="#09080a"/>
      </linearGradient>
      <linearGradient id="coat" x1="0" x2="1">
        <stop offset="0" stop-color="#2d3238"/>
        <stop offset="1" stop-color="#08090b"/>
      </linearGradient>
      <radialGradient id="blush" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#e8a5a0" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#e8a5a0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="socket" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7a5448" stop-opacity="0.26"/>
        <stop offset="1" stop-color="#7a5448" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="kuma" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7d6070" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#7d6070" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="eyeL"><path d="M110 143Q125 130 142 140Q127 149 110 143Z"/></clipPath>
      <clipPath id="eyeR"><path d="M162 140Q179 130 194 143Q177 149 162 140Z"/></clipPath>
    </defs>
    <!-- 夜の事務所。左の窓（ブラインド）から、街の青い光 -->
    <rect width="300" height="300" fill="url(#bg)"/>
    <g fill="#7d909a" opacity="0.3">
      <rect x="0" y="24" width="70" height="3"/><rect x="0" y="38" width="70" height="3"/><rect x="0" y="52" width="70" height="3"/>
      <rect x="0" y="66" width="70" height="3"/><rect x="0" y="80" width="70" height="3"/><rect x="0" y="94" width="70" height="3"/>
      <rect x="0" y="108" width="70" height="3"/><rect x="0" y="122" width="70" height="3"/>
    </g>
    <!-- うしろ髪（長い黒髪） -->
    <path d="M150 40C92 40 74 90 76 140c2 60-6 110-20 160h190c-14-50-22-100-20-160 2-50-18-100-76-100z" fill="url(#hair)"/>
    <!-- 首（細め）と、コート・白いシャツ -->
    <path d="M135 204c2 22 0 36-5 48h44c-5-12-7-26-5-48-7 9-12 14-17 14s-10-5-17-14z" fill="url(#neck)"/>
    <path d="M30 300c10-34 40-52 84-56l38 28 38-28c44 4 74 22 84 56z" fill="url(#coat)"/>
    <path d="M126 246l26 30 26-30-8-6-18 22-18-22z" fill="#d6d3cd"/>
    <!-- 顔（あごは小さく、やわらかく。左から光、右は影） -->
    <path d="M98 130c0-44 26-68 54-68s54 24 54 68c0 36-12 62-30 78-9 8-16 12-24 12s-15-4-24-12c-18-16-30-42-30-78z" fill="url(#skin)"/>
    <!-- 右頬からあごにかけての影 -->
    <path d="M178 120c8 30 4 60-10 84 14-10 24-32 26-60 1-12-2-20-16-24z" fill="#5f4138" opacity="0.3"/>
    <!-- あごの下の影 -->
    <path d="M130 208c8 8 15 12 22 12s14-4 22-12c-4 10-11 18-22 20-11-2-18-10-22-20z" fill="#4e352e" opacity="0.55"/>
    <!-- 目のくぼみ・目の下の隈・頬（ほんのり） -->
    <ellipse cx="126" cy="140" rx="19" ry="10" fill="url(#socket)"/>
    <ellipse cx="178" cy="140" rx="19" ry="10" fill="url(#socket)"/>
    <ellipse cx="126" cy="152" rx="14" ry="5" fill="url(#kuma)"/>
    <ellipse cx="178" cy="152" rx="14" ry="5" fill="url(#kuma)"/>
    <ellipse cx="118" cy="170" rx="15" ry="8" fill="url(#blush)"/>
    <ellipse cx="186" cy="170" rx="12" ry="7" fill="url(#blush)"/>
    <!-- 眉（細く、内側が上がる。困ったような、幸の薄そうな眉） -->
    <path d="M111 128Q125 124 140 123" stroke="#4a3832" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M164 123Q179 124 193 128" stroke="#2e221e" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- 左目（光が当たる側。目尻が少し下がる） -->
    <path d="M110 143Q125 130 142 140Q127 149 110 143Z" fill="#efe7e3"/>
    <g clip-path="url(#eyeL)">
      <circle cx="127" cy="141.5" r="7" fill="#4b3429"/>
      <circle cx="127" cy="142" r="4.2" fill="#2c1d17"/>
      <circle cx="127" cy="142" r="2.4" fill="#120b09"/>
      <circle cx="124.4" cy="139.4" r="1.7" fill="#fff"/>
      <circle cx="129.6" cy="144.4" r="0.9" fill="#fff" opacity="0.6"/>
    </g>
    <path d="M109 143q15-15 34-3" stroke="#160e0c" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M109 143l-3 2" stroke="#160e0c" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M113 136q12-8 26-2" stroke="#a67c6e" stroke-width="1.1" fill="none" opacity="0.7"/>
    <path d="M114 146q12 4 25-2" stroke="#9a7466" stroke-width="0.9" fill="none" opacity="0.6"/>
    <!-- 右目（影の側） -->
    <path d="M162 140Q179 130 194 143Q177 149 162 140Z" fill="#bfaba3"/>
    <g clip-path="url(#eyeR)">
      <circle cx="177" cy="141.5" r="6.8" fill="#3a271f"/>
      <circle cx="177" cy="142" r="4" fill="#22150f"/>
      <circle cx="177" cy="142" r="2.3" fill="#0d0807"/>
      <circle cx="174.6" cy="139.6" r="1.4" fill="#ece4e0"/>
    </g>
    <path d="M161 140q19-12 34 3" stroke="#110a08" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <path d="M195 143l3 2" stroke="#110a08" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M165 134q14-6 26 2" stroke="#6e4d42" stroke-width="1.1" fill="none" opacity="0.7"/>
    <!-- 鼻（小さめ。右側に影、鼻先に光） -->
    <path d="M156 142c1 13 3 22 5 29" stroke="#93695b" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M145 176q8 4 15 0" stroke="#7d5649" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="147.5" cy="177" rx="2.2" ry="1.2" fill="#6a463b" opacity="0.5"/>
    <ellipse cx="158" cy="177" rx="2.2" ry="1.2" fill="#45302a" opacity="0.7"/>
    <path d="M150 168q2-1 4 0" stroke="#fbece4" stroke-width="1.5" fill="none" opacity="0.7"/>
    <!-- 唇（小さく、淡い色。かすかに結んでいる） -->
    <path d="M139.5 197q6.2-3.4 12.5-1.2 6.3-2.2 12.5 1.2-12.5 1.8-25 0z" fill="#b8786f"/>
    <path d="M140.5 198q11.5 7.8 23 0-11.5 2.3-23 0z" fill="#d49e94"/>
    <path d="M139.5 197.6q12.5 2 25 0" stroke="#6b3a33" stroke-width="1" fill="none"/>
    <path d="M146.5 202.8q5.5 1.6 11 0" stroke="#f0c6bc" stroke-width="1.1" fill="none" opacity="0.6"/>
    <!-- 前髪（左で分けて、右へ流れる）と、顔の横の髪 -->
    <path d="M100 132c-2-50 26-80 56-82 34 0 54 30 48 78-8-24-22-40-40-48-6 14-20 24-42 28-10 4-16 12-22 24z" fill="url(#hair)"/>
    <path d="M100 128c-6 42-2 82 14 112-12-10-26-40-26-80 0-14 4-24 12-32z" fill="url(#hair)"/>
    <path d="M204 124c6 44 0 84-16 114 14-12 28-42 28-82 0-14-4-24-12-32z" fill="#0a090b"/>
    <!-- 頬にかかる、ほつれた髪 -->
    <path d="M101 150c-2 18 0 34 6 48" stroke="#141115" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M203 148c1 16-1 30-6 42" stroke="#0c0a0d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M138 104c-6 6-10 12-12 18" stroke="#1c181d" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <g stroke="#6e6a74" stroke-width="1.3" fill="none" opacity="0.5" stroke-linecap="round">
      <path d="M120 64c-12 12-18 28-20 50"/>
      <path d="M134 56c-12 14-18 30-20 46"/>
      <path d="M92 150c-2 30 2 56 12 80"/>
    </g>
  </svg>`,
  },
  // 魔王（練習のゲームの世界）：アニメ調の、大人の小悪魔。ピンクの長い髪、小さな角、細い赤フレームのメガネ（片手でくいっと上げる）、
  //   コウモリの羽、ハートのしっぽ、胸元の開いた黒いビスチェ、ミニスカート、長い手袋、ニーハイブーツ。全身の立ち絵（150×225 ドット）
  maou: {
    px: 150,
    tall: 1.5,
    name: "魔王",
    face: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450">
    <defs>
      <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#2c1238"/>
        <stop offset="1" stop-color="#110718"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.4" r="0.55">
        <stop offset="0" stop-color="#7a1c4a" stop-opacity="0.7"/>
        <stop offset="1" stop-color="#7a1c4a" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="iris" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#4a0624"/>
        <stop offset="0.55" stop-color="#c4185a"/>
        <stop offset="1" stop-color="#ff7aa8"/>
      </linearGradient>
      <linearGradient id="hair" x1="0" x2="1">
        <stop offset="0" stop-color="#f06bb0"/>
        <stop offset="1" stop-color="#c63f88"/>
      </linearGradient>
    </defs>
    <g stroke-linejoin="round" stroke-linecap="round">
    <!-- 背景：魔王城の闇と、うしろの赤い光 -->
    <rect width="300" height="450" fill="url(#bg)" stroke="none"/>
    <rect width="300" height="450" fill="url(#glow)" stroke="none"/>
    <rect y="438" width="300" height="12" fill="#1e0b24" stroke="none"/>
  
    <!-- コウモリの羽 -->
    <path d="M124 150C98 110 62 88 22 94c16 10 22 24 20 38-12-6-24-4-32 4 16 6 24 18 24 32-10-4-20 0-24 8 30-6 66-2 108 12z" fill="#4a1a56" stroke="#1c0a22" stroke-width="2"/>
    <path d="M176 150c26-40 62-62 102-56-16 10-22 24-20 38 12-6 24-4 32 4-16 6-24 18-24 32 10-4 20 0 24 8-30-6-66-2-108 12z" fill="#4a1a56" stroke="#1c0a22" stroke-width="2"/>
    <path d="M120 156C96 124 66 108 34 110M180 156c24-32 54-48 86-46" stroke="#6e2a7e" stroke-width="2" fill="none"/>
  
    <!-- うしろ髪（腰まで） -->
    <path d="M150 30c-38 0-56 26-56 62 0 48-8 108-22 168 16 8 34 6 46-4-4-38-4-84 0-126h64c4 42 4 88 0 126 12 10 30 12 46 4-14-60-22-120-22-168 0-36-18-62-56-62z" fill="#c63f88" stroke="#2b1020" stroke-width="2"/>
    <path d="M100 150c-4 40-12 80-22 108M200 150c4 40 12 80 22 108" stroke="#a02e6c" stroke-width="2" fill="none"/>
  
    <!-- しっぽ（先がハート） -->
    <path d="M182 236c34 8 56 34 60 70 2 18-4 30-12 38" stroke="#2b1020" stroke-width="7" fill="none"/>
    <path d="M182 236c34 8 56 34 60 70 2 18-4 30-12 38" stroke="#5a1f66" stroke-width="4" fill="none"/>
    <path d="M230 340c-10-2-16 6-14 14l12 14 12-14c2-8-4-16-10-14z" fill="#e0285a" stroke="#2b1020" stroke-width="2"/>
  
    <!-- 脚（太もも）：左に体重をかけて、右ひざを少し内に -->
    <path d="M116 250c-2 30 2 56 10 82h22c-2-26 0-50 4-74z" fill="#ffe3d6" stroke="#2b1020" stroke-width="2"/>
    <path d="M150 258c4 24 8 48 10 72h22c4-28 4-54 2-82z" fill="#ffe3d6" stroke="#2b1020" stroke-width="2"/>
    <path d="M138 262c0 22 2 44 6 66M166 262c2 22 4 44 4 66" stroke="#f2b9a8" stroke-width="4" fill="none"/>
    <!-- ニーハイブーツ（赤い縁、細いヒール） -->
    <path d="M124 318c-2 40-4 78-6 106-4 6-10 10-14 14h34l2-8c2-36 6-74 8-112z" fill="#241626" stroke="#2b1020" stroke-width="2"/>
    <path d="M160 318c4 38 8 76 10 106l2 14h30c-6-4-10-8-14-14-2-30-4-68-4-106z" fill="#241626" stroke="#2b1020" stroke-width="2"/>
    <path d="M124 318h24M160 318h24" stroke="#e0285a" stroke-width="3"/>
    <path d="M130 330c-2 30-4 60-6 92M166 330c2 30 4 60 6 92" stroke="#4a2e52" stroke-width="2" fill="none"/>
  
    <!-- ミニスカート（黒、赤いすそ、プリーツ） -->
    <path d="M120 220h62l18 50H104z" fill="#241626" stroke="#2b1020" stroke-width="2"/>
    <path d="M104 270h96" stroke="#e0285a" stroke-width="3"/>
    <path d="M132 224l-8 44M150 224v44M168 224l8 44" stroke="#3e2448" stroke-width="2"/>
  
    <!-- 胴（肌） -->
    <path d="M110 126c14-10 66-10 80 0 6 26 0 54-10 78-4 8-4 14 0 22h-56c4-8 4-14 0-22-12-24-18-52-14-78z" fill="#ffe3d6" stroke="#2b1020" stroke-width="2"/>
    <!-- 鎖骨・胸の丸み（線で、ほのめかす程度） -->
    <path d="M130 126q8 4 16 2M154 128q8 2 16-2" stroke="#e6a593" stroke-width="1.6" fill="none"/>
    <path d="M120 150q14-16 30-2M180 150q-14-16-30-2" stroke="#e6a593" stroke-width="2" fill="none"/>
    <path d="M150 150v8" stroke="#d98f7c" stroke-width="2"/>
    <!-- 黒いビスチェ（ハートの形の襟ぐり、赤い縁取り、編み上げ） -->
    <path d="M116 154c6-12 22-14 32-2l2 4 2-4c10-12 26-10 32 2 2 22-4 46-10 64l-2 10h-44l-2-10c-6-18-12-42-10-64z" fill="#241626" stroke="#2b1020" stroke-width="2"/>
    <path d="M116 154c6-12 22-14 32-2l2 4 2-4c10-12 26-10 32 2" stroke="#e0285a" stroke-width="2.6" fill="none"/>
    <path d="M144 172l12 8M156 172l-12 8M144 188l12 8M156 188l-12 8M144 204l12 8M156 204l-12 8" stroke="#e0285a" stroke-width="1.6"/>
    <path d="M124 170c0 20 4 38 10 52" stroke="#4a2e52" stroke-width="3" fill="none"/>
  
    <!-- 右腕（腰に手を当てる。ひじから先は黒い長手袋） -->
    <path d="M186 124c14 6 22 22 26 40 4 12 2 22-4 28-8 12-16 22-24 34l-8-8c8-10 14-22 18-32-4-16-10-34-16-48z" fill="#ffe3d6" stroke="#2b1020" stroke-width="2"/>
    <path d="M210 168c2 10 0 18-4 24-8 12-16 22-24 34l-8-8c8-10 14-22 18-32l-2-12z" fill="#241626" stroke="#2b1020" stroke-width="2"/>
    <path d="M190 168h22" stroke="#e0285a" stroke-width="2.4"/>
  
    <!-- 首・チョーカー -->
    <path d="M138 98v24q12 8 24 0V98z" fill="#ffe3d6" stroke="#2b1020" stroke-width="2"/>
    <path d="M138 104q12 10 24 0v8q-12 8-24 0z" fill="#f2b9a8" stroke="none"/>
    <path d="M138 112q12 6 24 0v6q-12 6-24 0z" fill="#1a0a1c" stroke="#2b1020" stroke-width="1.4"/>
    <circle cx="150" cy="119" r="2.8" fill="#e0285a" stroke="none"/>
  
    <!-- 顔 -->
    <path d="M122 62c0-20 12-30 28-30s28 10 28 30c0 20-4 32-12 40-6 6-11 8-16 8s-10-2-16-8c-8-8-12-20-12-40z" fill="#ffe3d6" stroke="#2b1020" stroke-width="2"/>
    <!-- 前髪の影 -->
    <path d="M124 66c8-6 18-8 26-4 8-4 18-2 26 4-4-12-14-18-26-18s-22 6-26 18z" fill="#f2b9a8" stroke="none"/>
    <!-- 眉（細く、余裕のある弧） -->
    <path d="M128 63q8-5 16-2M156 61q8-3 16 2" stroke="#a02e6c" stroke-width="2" fill="none"/>
    <!-- 目（アニメ調：大きな瞳、太いまつげ、ハイライト2つ） -->
    <path d="M127 75c2-7 9-10 17-6 2 5 1 11-3 14-6 1-11-2-14-8z" fill="#ffffff" stroke="none"/>
    <path d="M173 75c-2-7-9-10-17-6-2 5-1 11 3 14 6 1 11-2 14-8z" fill="#ffffff" stroke="none"/>
    <ellipse cx="137" cy="76" rx="5.6" ry="7.4" fill="url(#iris)" stroke="none"/>
    <ellipse cx="163" cy="76" rx="5.6" ry="7.4" fill="url(#iris)" stroke="none"/>
    <ellipse cx="137" cy="76" rx="2.4" ry="3.6" fill="#2a0414" stroke="none"/>
    <ellipse cx="163" cy="76" rx="2.4" ry="3.6" fill="#2a0414" stroke="none"/>
    <circle cx="134.8" cy="72.6" r="2" fill="#ffffff" stroke="none"/>
    <circle cx="160.8" cy="72.6" r="2" fill="#ffffff" stroke="none"/>
    <circle cx="139" cy="80" r="1" fill="#ffffff" stroke="none"/>
    <circle cx="165" cy="80" r="1" fill="#ffffff" stroke="none"/>
    <path d="M126 73c4-6 12-9 20-4M174 73c-4-6-12-9-20-4" stroke="#2b1020" stroke-width="3" fill="none"/>
    <path d="M126 73l-4-2M174 73l4-2" stroke="#2b1020" stroke-width="2" fill="none"/>
    <path d="M131 84q6 2 11 0M158 84q5 2 11 0" stroke="#c97a8c" stroke-width="1.2" fill="none"/>
    <!-- ほっぺ（斜線）・鼻・口（からかう笑みと、八重歯） -->
    <path d="M127 88l3-3M131 88l3-3M135 88l3-3M162 88l3-3M166 88l3-3M170 88l3-3" stroke="#ff8fb0" stroke-width="1.4"/>
    <path d="M150 85l1.4 3.6" stroke="#d98f7c" stroke-width="1.4"/>
    <path d="M143 96q7 4 15-2" stroke="#7a1030" stroke-width="2" fill="none"/>
    <path d="M155 95l1.6 3 1.6-3.6z" fill="#ffffff" stroke="#7a1030" stroke-width="0.6"/>
  
    <!-- 前髪（とがった毛束）・顔の横の髪・天使の輪 -->
    <path d="M120 74c-6-30 8-48 30-48s36 18 30 48c-4-10-8-16-14-20 2 8 0 14-4 18-2-10-6-16-12-20 0 8-4 14-10 18 0-8-4-14-10-16 0 8-4 14-10 20z" fill="url(#hair)" stroke="#2b1020" stroke-width="2"/>
    <path d="M122 66c-8 28-8 58-2 88-10-18-12-52-6-80z" fill="#e05aa0" stroke="#2b1020" stroke-width="2"/>
    <path d="M178 66c8 28 8 58 2 88 10-18 12-52 6-80z" fill="#c63f88" stroke="#2b1020" stroke-width="2"/>
    <path d="M130 40q20-10 40 0" stroke="#ffc0e0" stroke-width="3.2" fill="none"/>
    <!-- 角（内にくるっと） -->
    <path d="M130 36c-8-8-10-20-4-28 2 10 6 16 14 20z" fill="#2a1030" stroke="#12060f" stroke-width="1.6"/>
    <path d="M170 36c8-8 10-20 4-28-2 10-6 16-14 20z" fill="#2a1030" stroke="#12060f" stroke-width="1.6"/>
  
    <!-- メガネ（細い赤フレーム） -->
    <g fill="none" stroke="#c0123c" stroke-width="1.8">
      <rect x="125" y="67" width="23" height="17" rx="6"/>
      <rect x="152" y="67" width="23" height="17" rx="6"/>
      <path d="M148 72q2-2 4 0M125 72l-5-1M175 72l5-1"/>
    </g>
    <path d="M128 81l8-11" stroke="#ffffff" stroke-width="1.6" opacity="0.5" fill="none"/>
  
    <!-- 左腕（メガネをくいっと上げる。ひじから先は黒い長手袋） -->
    <path d="M114 124c-12 6-18 24-20 46-1 8 3 14 9 14 4-18 10-36 20-50z" fill="#ffe3d6" stroke="#2b1020" stroke-width="2"/>
    <path d="M94 176c4-30 10-60 18-86l10 3c-6 28-12 58-16 87z" fill="#241626" stroke="#2b1020" stroke-width="2"/>
    <path d="M96 170l12 4" stroke="#e0285a" stroke-width="2.4"/>
    <!-- 手（黒い手袋の指先で、フレームに触れている） -->
    <path d="M111 80c1-6 7-9 12-6 3 2 2 7-1 9-4 2-9 1-11-3z" fill="#241626" stroke="#2b1020" stroke-width="1.6"/>
    <path d="M121 75l4 0" stroke="#3e2448" stroke-width="1.4"/>
    </g>
  </svg>`,
  },
};
// 絵（SVG）を、px ドット四方の canvas に描く（CSS で拡大して、ドットのまま見せる）
function drawPixels(canvas, svg, px, h = px) {
  return new Promise(done => {
    const img = new Image();
    img.onload = () => {
      canvas.width = px;
      canvas.height = h;
      const c = canvas.getContext("2d");
      c.imageSmoothingEnabled = true;
      c.clearRect(0, 0, px, h);
      c.drawImage(img, 0, 0, px, h);
      done();
    };
    img.onerror = () => done();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
// { reveal }：影から顔へ。粗いモザイクから、だんだん細かくなって浮かび上がる
async function revealFace() {
  const canvas = talkEl.querySelector(".tk-photo canvas"),
    p = talkEl._portrait;
  if (!canvas || !p?.face) return;
  for (const px of [6, 10, 16, 26, 42, 64, 90, p.px]) {
    await drawPixels(canvas, p.face, px);
    SFX.tick();
    await sleep(170);
  }
  talkEl.querySelector(".tk-photo").classList.add("lit");
}

// トークの画面を開く（mode：chat か meet）
function talkMode(kind, opt = {}) {
  talkEl.className = `on ${kind}`;
  const head =
    kind === "chat"
      ? `<span class="tk-lock">●</span><span>${esc(fill(opt.title || "uzu://safehouse"))}</span><span class="tk-sub">${esc(fill(opt.sub || "暗号化通信"))}</span>`
      : `<span>${esc(fill(opt.place || ""))}</span><span class="tk-sub">${esc(fill(opt.time || ""))}</span>`;
  // 写真：PORTRAITS の絵はドット絵の canvas に（最初は影）。それ以外は画像のファイル名として出す
  const p = PORTRAITS[opt.portrait];
  talkEl._portrait = p || null;
  const art = p ? `<canvas></canvas>` : opt.portrait ? `<img src="${esc(opt.portrait)}" alt="">` : "";
  talkEl.innerHTML =
    `<div class="tk-head">${head}</div>` +
    (kind === "meet" && art
      ? `<div class="tk-photo">${art}<div class="tk-cap">${esc(fill(opt.who || ""))}</div></div>`
      : "") +
    `<div class="tk-body"></div><div class="tk-foot"></div><div class="tk-tip">タップで先へ</div>`;
  if (p) drawPixels(talkEl.querySelector(".tk-photo canvas"), p.shadow || p.face, p.px);
  SFX.select();
}
function talkAdd(html, cls) {
  const body = talkEl.querySelector(".tk-body");
  const d = document.createElement("div");
  d.className = `tk-line ${cls}`;
  d.innerHTML = html;
  body.appendChild(d);
  body.scrollTop = body.scrollHeight;
  return d;
}

// 1行：[師匠] セリフ ／ [自分] 自分のセリフ ／ [*] システム ／ それ以外の [名前] は相手 ／ [] なしは情景（ナレーション）
async function talkLine(s) {
  const m = fill(s).match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  const spk = m?.[1],
    text = m ? m[2] : fill(s);
  const chat = talkEl.classList.contains("chat");
  if (!m) {
    talkAdd(esc(text), "tk-narr");
    return talkWait(readMs(text) * 1.1);
  }
  if (spk === "*") {
    talkAdd(esc(text), "tk-sys");
    SFX.tick();
    return talkWait(1200);
  }
  if (spk === "自分") {
    await talkWait(600);
    talkAdd(`<span class="tk-name">${esc(handle || "あなた")}</span><span class="tk-bubble">${esc(text)}</span>`, "tk-me");
    SFX.enter();
    return talkWait(readMs(text) * 0.8);
  }
  // 会う場面の師匠：吹き出しではなく、受付のイヤホンから聞こえる声（いつもの師匠の表示）
  if (!chat && spk === "師匠") {
    talkAdd(`<span class="who">師匠</span><span>${esc(shishou(text))}</span>`, "tk-voice");
    SFX.radio();
    return talkWait(readMs(text));
  }
  // 相手：チャットでは「入力中…」を出してから届く
  if (chat) {
    const typing = talkAdd(`<span class="tk-name">${esc(spk)}</span><span class="tk-bubble tk-typing">入力中<span>.</span><span>.</span><span>.</span></span>`, "tk-them");
    // 長いメッセージほど、打つのに時間がかかる
    await talkWait(Math.min(1300, 400 + [...text].length * 18));
    typing.remove();
  }
  talkAdd(`<span class="tk-name">${esc(spk)}</span><span class="tk-bubble">${esc(text)}</span>`, "tk-them");
  SFX.radio();
  return talkWait(readMs(text));
}

// 理解度チェック：{ ask: { q, options: [{ label, ok, reply: [...] }], miss: [...] } }
//   まちがえたら、師匠がヒントを出して（option の reply か、miss）、もう一度選ぶ。罰はない
async function talkAsk(a) {
  if (a.q) await talkLine(`[${a.who || "師匠"}] ${a.q}`);
  const tried = new Set();
  for (;;) {
    const foot = talkEl.querySelector(".tk-foot");
    foot.innerHTML = a.options
      .map(
        (o, i) =>
          `<button type="button" class="tk-opt${tried.has(i) ? " tried" : ""}" data-i="${i}"><span class="tk-n">${i + 1}</span>${esc(fill(o.label))}</button>`,
      )
      .join("");
    talkEl.querySelector(".tk-body").scrollTop = 1e9;
    const i = await new Promise(r => (talkPick = r));
    talkPick = null;
    foot.innerHTML = "";
    const o = a.options[i];
    await talkLine(`[自分] ${o.say || o.label}`);
    for (const l of o.reply || (o.ok ? [] : a.miss || [])) await talkLine(l);
    if (o.ok) return;
    tried.add(i);
  }
}

// トークを流す。終わったら { next: 次の回線コード } を返す
async function runTalk(steps) {
  const res = {};
  talkEl.className = "on chat";
  // 会話パートの BGM：探偵事務所の受付の曲（右上の BGM の設定には従う。会話の画面にはボタンを出さない）
  SFX.music(true, { track: "office" });
  let shown = false; // 何か出したか（場面を切りかえる前に、読み終える間をおくため）
  for (const s of steps || []) {
    const mode = s?.chat && "chat" || s?.meet && "meet";
    // 場面が切りかわる前に、下まで読み終えるのを待つ
    if (mode && shown) await talkWait(SCENE_END_MS);
    if (typeof s === "string") await talkLine(s);
    else if (s.chat) talkMode("chat", s.chat === true ? {} : s.chat);
    else if (s.meet) talkMode("meet", s.meet);
    else if (s.reveal) await revealFace();
    else if (s.ask) await talkAsk(s.ask);
    else if (s.wait) await talkWait(s.wait);
    else if (s.music !== undefined) SFX.music(!!s.music, typeof s.music === "string" ? { track: s.music } : {});
    else if (s.sound) SFX[s.sound]?.();
    else if (s.next) res.next = s.next;
    if (typeof s === "string" || s.ask) shown = true;
    if (mode) shown = false;
  }
  await talkWait(SCENE_END_MS);
  // 会話が終わったら、曲はゆっくり消す（次の任務では、いつもの曲に戻る）
  SFX.music(false, { track: "calm" });
  talkEl.classList.add("leaving");
  await sleep(500);
  talkEl.className = "";
  talkEl.innerHTML = "";
  return res;
}

// タップで、いまの待ち時間を飛ばす。選択肢はボタンか、数字キー
talkEl.addEventListener("click", e => {
  SFX.wake();
  const b = e.target.closest(".tk-opt");
  if (b && talkPick) return talkPick(+b.dataset.i);
  talkSkip = true;
});
document.addEventListener(
  "keydown",
  e => {
    if (!talkEl.classList.contains("on")) return;
    e.stopImmediatePropagation();
    SFX.wake();
    const n = +e.key;
    if (talkPick && n >= 1) {
      const b = talkEl.querySelector(`.tk-opt[data-i="${n - 1}"]`);
      if (b) return talkPick(n - 1);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      talkSkip = true;
    }
  },
  { capture: true },
);

// { sprite: "名前" }：練習のゲームの世界で、登場人物のドット絵を、RPG の窓に出す（粗いドットから、だんだん細かく）
async function drawSprite(name) {
  const p = PORTRAITS[name];
  if (!p) return;
  const box = print(
    `<div class="rpg-sprite reveal"><canvas></canvas>${p.name ? `<div class="rs-name">${esc(p.name)}</div>` : ""}</div>`,
  );
  const canvas = box.querySelector("canvas");
  // tall … 縦の長さの、横に対する倍率（全身の立ち絵は 1.5）
  const tall = p.tall || 1;
  for (const px of [8, 16, 32, 64, 100, p.px]) {
    await drawPixels(canvas, p.face, px, Math.round(px * tall));
    SFX.tick();
    await sleep(140);
  }
  scrollDown();
  await wait(500);
}

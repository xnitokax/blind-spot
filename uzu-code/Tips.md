# UZU Code で作品を作る人向けのTips

UZU Code で複数人用の作品を作り、検査する中で得た学びをまとめました。UZU公式のドキュメントではなく、個人の経験です。2026-11-20 時点の公式ドキュメントと、CLI 0.7.16 を前提にしています。公式ドキュメント（docs.code.uzu-app.com）に既にあることは載せていません。 読む前提: UZU Code の公式ドキュメントを一度読んだ人向けです。「締切（`deadlines`、`at`）」「`actions` と `serverActions`」「`ctx.random`」「緊急一時停止」などの用語は、公式の意味で使います。画面の大きさはCSSピクセルです。 印の意味: [実測]＝実際の作品で測った、[Web]＝Web標準の公式ページに書かれている、[未確認]＝確かめていない。

## 公式ドキュメントが触れていない、プラットフォームの挙動

**1. 複数の締切の処理順や、起きる時刻に頼らない。** 公式は、締切の `at` がゲーム内時刻であることと、緊急一時停止中は締切が進まないことを述べています。起きるのが遅れた場合や、2つの締切が同時に期限を迎えた場合の動きは、書かれていません。使ったCLI（0.7.16）では、期限の来た締切が登録順に走りました。そのため、フェーズの終わりが先に走り、終わる前の通知（リマインダー）が捨てられました。対策は2つです。(a) 期限の来た締切の処理を1つのhandlerにまとめ、`at` の時刻が早い順に走らせ、1つ走らせるたびに状態を読み直す。(b) 各締切のhandlerが、走った自分の `at` を消す。これは、規則が不明なため採った安全策で、公式の要件ではありません。遅延と同時期限の規則は、プラットフォームに確認してください。[実測。そのCLIのみ。アプリ側のホストでは未実行]

**2. サーバーロジックは、プラットフォームと同じ経路で動かして確かめる。** 公式は `serverActionLogicPath`（マニフェストが指すサーバーロジックのファイル）を説明しますが、どうまとめて読み込むかは書いていません。サーバーロジックの入口が `.svelte` を含む部品（UIの部品）を取り込み、4作品が起動時に落ちました。対策は、サーバーロジックの入口から、UIの取り込みを消すことです。さらに、そのファイルを読み込むだけの1秒のテストを足してください。試した方法は、esbuildでSvelteのプラグインなしにまとめて読み込みました。`uzu dev` と完全に同じかは[未確認]なので、作品を渡す前に `uzu dev` でも起動してください。CIが赤くなった原因の過半は、この「サーバーロジックが落ちる」型でした。

**3. `actions` の中で乱数を引かない。仮の値を置き、サーバーで引く。** 公式は、`ctx.random` が `setup`、`update`、`serverActions`、`deadlines` にあり、クライアントが先に走らせる `actions` にはない、と述べています。アクションの結果で乱数を引きたいとき（順番のシャッフルや犯人）は、アクションでは `order: null` のような仮の値だけを置き、引くのは `serverActions` で行います（こちらを勧めます）。もう1つの方法は、値が無い間だけ `at` が「現在時刻」になる締切を作り、その締切のhandlerで引くものです。期限が今なので、すぐサーバー側で走ります。これは、UZUアプリ本体では[未確認]の、補助的な方法です。試して退けた方法もあります。クライアントでシード付きの乱数を先読みに使う方法です。クライアントとサーバーが同じ値を出すという前提を確かめられず、また、シードが全プレイヤーに配られる状態に入ってしまうため、やめました。

**4. 全員を待つフェーズは、誰かの端末が落ちても、プラットフォームは助けてくれない。** 公式の中断理由には `waiting` がありますが、「今のサーバーは出さない」と書かれています（apiページ）。つまり、全員の操作を待つフェーズでは、ゲームは自動では止まらず、誰がいないかも分かりません。フェーズごとに次の2つを別々に試してください。(a) 何も操作しない席が1つあるとき。(b) 1席のアプリを閉じて開き直したとき（アプリごとの再起動。WebViewの再読み込みでも試せます）。試した作品では、(b)で、フェーズの効果音が鳴り直しました（最初の描画で「フェーズに入った」処理がもう一度走りました）。アプリ本体で同じ動きになるかは[未確認]です。

## スマホのWebViewとCSS

**5. 使えるCSSの最低条件は iOS 16 になる（iOS 16 で動かなければ使えない）。** 公式は、最低条件を iOS 16（Safari 16）、Android 8 WebView、Windows 10 1809 のWebView2、macOS 13 とし、container queries と AVIF は使えると述べています。それ以外はCan I useで確かめるよう書かれています。確かめた結果です。

| 機能 | Safari / iOS Safari | 出典 |
| :---- | :---- | :---- |
| `:has()`、`dvh/svh/lvh` | 15.4（16で使える） | WebKitブログ Safari 15.4 |
| `scrollbar-width`、`scrollbar-gutter` | 18.2（iOS 16では使えない） | WebKitブログ 18.2、caniuse |
| `text-wrap: pretty` | WebKitが発表した2025年4月時点では安定版に無い（Technology Preview 216）。今の安定版の状況は未確認 | WebKitブログ |
| `word-break: auto-phrase` | なし（Chrome/Edge 119以降のみ、日本語のみ、`lang="ja"`が要る） | web-features、Chromeブログ |

結論は2つです。新しいプロパティを使うなら、iOS 16向けの代替が要ります。同じ文章でも、WKWebViewとAndroidのWebViewで折り返しが変わります。[Web]

**6. `::-webkit-scrollbar` に大きさを指定すると、スマホの重ね表示のバー（スクロール中だけ出て、幅を取らないバー）が、常時表示で幅を取るバーに変わり、幅を取る。** Chromeのページに書かれています。[Web] バーのスタイルは `(hover: hover) and (pointer: fine)` の中だけに当ててください。iOSは常に細い重ね表示のバーを描きます（WebKitブログ 18.2）。iOS 16では `scrollbar-width: none` が効かないので、iOSでバーを隠せるのは `::-webkit-scrollbar { display: none }` だけですが、試していません。Androidでは、自動スクロールのたびに重ね表示のバーが数秒出続けました。自動スクロール中だけ `scrollbar-width: none` にすると直りました。[実測。ChromiumのPixel設定のエミュレーション。実機ではない]

**7. 語の途中で折り返してよいなら、ルビを確かめる。** `*` に `text-wrap` や `word-break` を指定すると、`<rt>` にも効き、読みが数行に折れます。文章の入れ物に指定してください。`text-wrap: pretty`（最後の行に1〜2文字だけ残さない）はiOS 16に無く（項目5）、そこでは通常の折り返しになり、最後の行が短く残ることがあります。[Chromiumでルビを実測。iOSでのprettyは未確認]

**8. 要素の箱ではなく、文字そのものの範囲を測る。** 話者名の行（アイコンと名前）の幅を、その要素の大きさから読んだところ、伸びたgrid項目では301px、`justify-self: end` の要素では41pxでした。この幅を使って、ある行の上の間隔を決めていたため、同じ行の上の間隔が、一方のプレイヤーの画面では37px、もう一方の画面では20pxになりました。測るのは、文字が占める範囲（`Range.getBoundingClientRect`）にします。同じ行を、2人のプレイヤーの画面で並べて比べてください。[実測]

**9. 書体の字高はOSごとに違う。`line-height: 1` と `overflow: hidden` の組み合わせは切れる。** Yu Gothic UI は、高さ16pxの要素の中に18pxの文字を描き、名前4つ×8画面で2pxの切れが出ました。ほかに、盤面の端でラベルが切れ、手元の環境では通り、Github CI環境でははみ出した例もありました。直し方は、その名前の要素に `padding-bottom: 0.15em` を足し、同じ要素の下側の外側の余白（またはそれを含む列の下の余白）から同じ値を引くことです。合計の高さが変わらず、まわりの配置が動きません。実機確認を丁寧にするか書体を同梱するのがいいかと思います。Google FontへのFetchを公式サンプルはしていますが認証要件では禁止されています。このあたりは運営の意見も知りたいですね。

**10. `<html>` に `lang="ja"` を付ける。** 付けないと、Androidで漢字が中国語の字形で描かれることがあります。日本語のゴシックが入っていない環境で描いた画面は、中国語の字形の書体に落ちました。[描いた画面で確認。実機の結果は記録なし]

**11. 削除**

## 検査・テスト・測定

**12. 走らなかった検査は、走らなかったと大きく言う。** 画面を描く検査が飛ばされた（ブラウザがない）のに、黙って成功（終了コード0）で終わり、フェーズIDの誤りで画面が1枚も描かれなくても通りました。作品を意図的に壊すテストで、CIが止めたのは半数に届きませんでした。残りは、画面が描けない場合をエラーにすることで直しました。飛ばされた検査は、「走らなかった」と原因を表示します。**現在の挙動は、ブラウザがなくても終了コード0のままです。** ブラウザのない砂場（AIチャット）のエージェントが、直せないことで止まらないためです。

**13. 動きはフレームを録画して測る。UIのeffectは単体テストでは動かない。** 一覧が動く画面で、行を進める操作の約2割で、開始時に7〜26px動きました。直したあとは2pxを超えるものがゼロでした。原因は3つで、どれも一般的です。(a) 全項目に同じ距離を当て、同じ更新で起きたレイアウト変更が、CSSのtransitionに打ち消された。(b) 消えていく要素が、フェードの間もレイアウトに残り、一覧が1フレームで76px戻った。(c) 画面を切り替えるとき、古い画面の後始末が、新しい画面が主ボタンの設定（画面間で1つだけ共有する場所）を書いたあとに走り、全員の主ボタンが消えた。直し方は、共有の場所に「今の持ち主（その画面）」を覚えさせ、後始末は、自分が持ち主のときだけ消すようにすることです（持ち主の数を数える方法でも同じです）。開発用ハーネスでコマ単位に録画して、3つとも見つかりました。[実測]

**14. `public/` のメタデータを消す。** 作品と一緒に出ていきます。画像、音、動画、SVGに、GPS位置、ホームフォルダのパス、メールアドレス、カメラの所有者や製造番号、作者や作成時刻がないか確かめてください。道具は、画像が `exiftool -all=`、音と動画が `ffmpeg -i in -map_metadata -1 -c copy out` です。ファイルの種類は拡張子ではなく、先頭のバイトで判定したほうが確実です。

## AIチャットとClaude Codeの実行環境で作品を作る（各1回、2026-11-17と11-20。古くなります）

出典: 同じ6手順のスクリプトを、各チャットに1回ずつ貼った結果です。

**15. AIチャットの実行環境（砂場）は、環境ごとに違う。「その砂場」を前提に作らない。** ここでの「砂場」は、AIチャットがシェルやnpmを動かせる実行環境のことです。

| 環境 | Node / npm | npm登録所 | GitHubのアーカイブをnpmで入れる | Chromium |
| :---- | :---- | :---- | :---- | :---- |
| ChatGPT Workers | 24.22.1 / 11.9.0 | 通る | 通る | なし |
| ChatGPT Chat High | 22.16.0 / 10.9.2 | 届かない（`EAI_AGAIN`） | 届かない | なし |
| Muse | 24.22.1 / 10.9.4 | 通る | 通る | なし |
| Chat Sonnet | 22.23.4 / 10.9.9 | 通る | アーカイブは403。リリース資産への `curl` は200 | なし |
| Claude Code（2026-11-20） | 22.23.5 / 10.9.9 | 通る | アーカイブは403（`curl` でも403）。リリース資産は200 | あり（既に入っていて起動できた。既にゴリゴリに使っていた環境だったからかも） |
| Codex（2026-11-20に1回） | 24.22.1 / 11.9.0 | 未取得（npmのログ先が書き込み不可でエラー） | 未取得（同上）。`curl` では、アーカイブもリリース資産も200 | なし（Playwrightが求める版のブラウザがない） |
| Gemini Hydrogen | シェル実行ツールなし |  |  |  |

結論は次のとおりです。ネットワークのない環境では、依存をzipの中に入れる。Work、Claude Code以外の環境ではPlaywrightがは描けないので「画面は見ていない」と素直に申告させる。ChatGPTのブラウザは管理者ポリシーでページ移動を禁じる（使ったプロンプトにそう書いてある）ので、ビルド済みのページは、HTMLを `about:blank` に流し込む形でしか描けない。別のチャット（Chat instant）は最初の `npm i` でタイムアウトし、結果が出ませんでした。たぶん無理です。

**16. npm 10 と 11 のlockfileは互換ではない。** npm 11 が書き直したlockは、npm 10 の `npm ci` で `Missing: @emnapi/core@2.0.0-beta.2 from lock file` と失敗し、npm 10 で書いたlockは両方で通りました。lockなしの npm 10 の `npm install` は落ちました（`Cannot read properties of null (reading 'edgesOut')`）。もっともらしい原因は、npm 11 が、省略可能な依存（optional dependency）のうちwasm用のものの項目を落とすことです。npmのリポジトリに、lockfileの省略可能なパッケージに関する似たissueがあります（npm/cli #4828、#9358。題名しか読んでいません）。使う人が持つ一番古いnpmでlockを作ってください。[実測、各1回。原因は未確認]

**17. 砂場で `npm ci` する前に、登録所を試す。** 登録所に届かない条件で、npm 11 の `ci` が14分ハングし、`timeout` のTERMも効かず、`node_modules` が291ファイルまで減りました。先に `timeout -k 5 30 npm view <パッケージ> version` を実行してください。[実測、1回]

18. 削除

**19. ChatGPTで画像素材を作るなら、Work（作業用の実行環境）のほうが向いていた。** チャット（gpt-6-thinking、2026-11-15）では、画像生成ツールの記録の `prompt` 欄が毎回空で、ChatGPT自身が「`prompt` 引数は非推奨で、指示は会話の文脈から自動で組み立てられる」と説明しました。「小さな札1つ」を頼んでも、4回とも複数の部品が1枚に混ざり、透明のはずの背景が不透明に近い画像もありました。Work（2026-11-20）では、`prompt` に承認した文面をそのまま入れ、`transparent_background: true` を付けられました。結果は2172×724pxのRGBA PNG（ちょうど3:1）で、上下端は完全に透明でした。「指示文を見せる→承認を待つ→1回に1枚生成する」を、複数枚続けても保てたと、目視で確認しました（Workは要件を満たした）。どちらの環境でも、画像モデルに届く最終入力は取れないので、承認した文面との一致までは証明できません。

どちらの環境でも、生成された画像は、取り込む前に機械で関門を通すと失敗を拾えました（別の実行で作った仕組み。六つの失敗画像は拒否され、良い画像は通ることを、その時に確かめました）。関門は三つです。①透明で出てくること（描かれた市松模様や白背景は拒否）。②1つの物体であること（別々に描かれた領域を数える）。③形が置く箱の比率から15%以内であること（背景と立ち絵は10%）。あわせて、1部品につき1回の生成にして、生成器の上限（OpenAIの3:1。5:1以上の細長い帯は作れなかった）を守り、使った指示文を一字一句保存します。切り抜き用に全体絵を作らせると、解像度が落ちて失敗しました。あと切り抜き自体精度は低いです。エージェントが指示文を書き換えて、立ち絵が「2人の画面」になった例もあるので、保存した文面と注文書の文面が一致するかを検査に入れましたが、Chat環境では徒労でした。

---

## 付録: 公式に書いてあり、実際に重要だったこと

公式にある内容ですが、開発中にAIが踏んだミスです。

- **音は `playSound` / `playBgm` で鳴らし、形式は mp3 / m4a。ogg は iOS・macOS で鳴らない**（environment、certification）。鳴らない音は気づかれずに飛ばされるため、検査でoggをエラーにしました。BGMは1曲しか流せないので、複数の環境音は自前で重ねる工夫が要りました。
- **安全領域は `env()` ではなく `--uzu-safe-area-inset-*`、`--uzu-hud-inset-*` を使う**（safe-area）。`env()` はWebViewで0になり、幅や高さを `100vw`/`100vh` で決めた箱が画面からはみ出しました。lintで禁止にしました。
- **`actions` はオンラインでは2回走る。副作用と乱数を書かない**（patterns）。AIは先読みでシード付きの乱数を使う方法を実装しましたが、やめさせました。乱数は `serverActions` で引きます。
- **`Date.now()` と `Math.random()` を使わず、時刻は `ctx.time`/`ctx.after()` から取る**（api、patterns）。決定的でないと、先読みとサーバーで値がずれます。ソースを読むテストで見張りました。
- **ファイルは相対パス、名前は ASCII、外部通信なし**（certification）。外部通信が禁止のため、書体もCDNに頼れず、作品に同梱する形になりました。
- **マニフェスト: `icon` のファイルが無いと、`publish` は検証で止まる**（manifest）。公開できない状態の作品（id未設定、iconファイルなし）が検査を通ったため、manifestの必須項目とiconファイルの有無を検査に入れました。
- **基準サイズ 780×360、844×390、1194×834 の3つで確かめる**（certification）。この3つ以外だけで確認しても要件を満たした証明にならない、と公式にあります。
- **公式デザインガイドの型は、「型の画像＋プロンプト＋世界観」を画像生成AIに渡す前提で、使うかどうかは任意**（guides/design、guides/design/reading）。型に書かれた名札の数字は、名札①の幅78だと名札②の始点x187に届かず（84+78+10=172）、幅93なら合います。93を採りました。型・見本画像の再利用条件は、ページに記載がありません（未確認）。掲載は、今は読み合わせ画面だけです。
- **緊急一時停止中は、シナリオのコードが一切走らず、締切も進まない**（api）。停止を状態に持ち込まないほうがよい、と公式にあります。締切まわりのテストでは、停止の扱いを別に確かめる必要があります。

---

## 付録: 実行環境を確かめるスクリプト

項目15の表を作ったときの手順を、1本のスクリプトにしました。AIチャットやCodexなどの実行環境にbashで貼って1回だけ実行し、出力を全文貼り返すと便利です。一時フォルダの中だけで動き、トークンなどは出しません。npm登録所とGitHubに接続します。npm登録所とGitHubへの到達、Chromiumの有無、npmの版を調べます。

```sh
#!/usr/bin/env bash
# Probe an AI sandbox: what can it run? One run, writes only to a temp folder, prints no secrets.
# Usage: bash env-probe.sh   (paste the whole output back)
set +e
D=$(mktemp -d) && cd "$D" || exit 1
# npm may fail to write its cache/logs in a sandbox; keep both inside the temp folder
export npm_config_cache="$D/.npm" npm_config_logs_dir="$D/.npm-logs"
echo "== env"
uname -m; grep PRETTY /etc/os-release; node -v; npm -v
ldd --version 2>&1 | head -1
echo "proxy vars set: $(env | grep -ci '^\(http\|https\|no\)_proxy=')"
echo "== 1 registry"
timeout -k 5 40 npm i is-odd --no-audit --no-fund 2>&1 | tail -2
echo "== 2 github archive via npm"
timeout -k 5 40 npm i https://github.com/lodash/lodash/archive/refs/tags/4.17.21.tar.gz --no-audit --no-fund 2>&1 | tail -2
echo "== 3 curl release asset"
timeout 30 curl -sIL -o /dev/null -w "%{http_code}\n" https://github.com/cli/cli/releases/download/v2.40.0/gh_2.40.0_checksums.txt
echo "== 4 curl github archive"
timeout 30 curl -sIL -o /dev/null -w "%{http_code}\n" https://github.com/lodash/lodash/archive/refs/tags/4.17.21.tar.gz
echo "== 5 playwright package"
timeout -k 5 60 npm i playwright --no-audit --no-fund 2>&1 | tail -2
echo "== 6 chromium launch"
timeout 60 node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.setContent('<h1>ok</h1>');console.log('launch OK');await b.close()})().catch(e=>console.log('NG',e.message.split('\n')[0]))"
echo "== 7 write / time"
echo x > t.txt && echo "write OK"; df -h . | tail -1
echo "== done"
```

---

## 参考リンク

公式ドキュメント（UZU Code）

- 全体: [https://docs.code.uzu-app.com/](https://docs.code.uzu-app.com/)
- API（締切、緊急一時停止、`ctx.random`、`actions`、`playSound`/`playBgm`）: [https://docs.code.uzu-app.com/reference/api](https://docs.code.uzu-app.com/reference/api)
- 環境（最低動作環境、音と動画の形式、フォント形式）: [https://docs.code.uzu-app.com/reference/environment](https://docs.code.uzu-app.com/reference/environment)
- 審査基準・基準サイズ（certification）: [https://docs.code.uzu-app.com/certification](https://docs.code.uzu-app.com/certification)
- 実装パターン（`actions` の2回実行、乱数、soloとonline、`serverActions`）: [https://docs.code.uzu-app.com/guides/patterns](https://docs.code.uzu-app.com/guides/patterns)
- 安全領域（`--uzu-*`、`clamp()` の注意）: [https://docs.code.uzu-app.com/guides/safe-area](https://docs.code.uzu-app.com/guides/safe-area)
- デザインガイド（型の考え方）: [https://docs.code.uzu-app.com/guides/design/](https://docs.code.uzu-app.com/guides/design/)
- 読み合わせ画面の型（配置の数字、プロンプト）: [https://docs.code.uzu-app.com/guides/design/reading](https://docs.code.uzu-app.com/guides/design/reading)
- 開発ツール（`uzu dev`、`--host`）: [https://docs.code.uzu-app.com/guides/dev-tools](https://docs.code.uzu-app.com/guides/dev-tools)
- マニフェスト: [https://docs.code.uzu-app.com/reference/manifest](https://docs.code.uzu-app.com/reference/manifest)
- 変更履歴: [https://docs.code.uzu-app.com/changelog](https://docs.code.uzu-app.com/changelog)

Web標準・ブラウザ（項目5〜7）

- Chrome「スクロールバーのスタイル」: [https://developer.chrome.com/docs/css-ui/scrollbar-styling](https://developer.chrome.com/docs/css-ui/scrollbar-styling)
- Chrome「CSSの4つの国際化機能」（`auto-phrase`）: [https://developer.chrome.com/blog/css-i18n-features](https://developer.chrome.com/blog/css-i18n-features)
- web-features `word-break: auto-phrase`: [https://web-platform-dx.github.io/web-features-explorer/features/word-break-auto-phrase](https://web-platform-dx.github.io/web-features-explorer/features/word-break-auto-phrase)
- web-features `scrollbar-width`: [https://web-platform-dx.github.io/web-features-explorer/features/scrollbar-width](https://web-platform-dx.github.io/web-features-explorer/features/scrollbar-width)
- caniuse `scrollbar-width`: [https://caniuse.com/mdn-css_properties_scrollbar-width](https://caniuse.com/mdn-css_properties_scrollbar-width)
- WebKit「Safari 15.4の新機能」（`:has()`、`dvh`）: [https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)
- WebKit「Safari 18.2の機能」（`scrollbar-width`、`scrollbar-gutter`）: [https://webkit.org/blog/16301/webkit-features-in-safari-18-2/](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)
- WebKit「text-wrap: pretty」: [https://webkit.org/blog/16547/better-typography-with-text-wrap-pretty/](https://webkit.org/blog/16547/better-typography-with-text-wrap-pretty/)

npm（項目16）。

- [https://github.com/npm/cli/issues/4828](https://github.com/npm/cli/issues/4828)
- [https://github.com/npm/cli/issues/9358](https://github.com/npm/cli/issues/9358)

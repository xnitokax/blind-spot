// =========================================================
//  ウズ（コードモード）とのつなぎ
//  ゲーム本体（public/js の各ファイル）には手を入れず、ここで SDK を初期化して、アプリに合図を送るだけ。
//  1人用なので、サーバーのロジック（run）は使わない。init() だけで、SafeArea・振動などのブリッジが使える。
// =========================================================
import { init, firstFrameReady, gameReady, gameEnded, haptic, isHosted } from '@uzuhq/code-sdk';

// SDK の初期化。ウズの中なら、HUD を避ける余白の CSS 変数（--uzu-content-inset-*）がここで入る
init();

// 最初の絵を出したら、アプリに知らせる（呼ばないと、アプリのスプラッシュ画面が消えない）
//   ゲーム本体は、読み込まれた時点でタイトル画面（入口）を描いている。描画が画面に出るのを 1 フレーム待ってから知らせる
//   そのあと、フォントと画像の読み込みが終わったら「操作を受け付けられる」と知らせる（必ずこの順番）
const loaded = new Promise<void>(res => {
  if (document.readyState === 'complete') res();
  else window.addEventListener('load', () => res(), { once: true });
});
requestAnimationFrame(() =>
  requestAnimationFrame(async () => {
    firstFrameReady();
    await loaded;
    gameReady();
  }),
);

// ゲーム本体から呼べるように、窓口を 1 つだけ置いておく（今は使っていない。エンディングで gameEnded を呼ぶ予定）
(window as unknown as { UZU: unknown }).UZU = { isHosted, gameEnded, haptic };

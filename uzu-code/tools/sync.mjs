// ゲーム本体（../docs）を public/ に写す。npm run dev / build の前に自動で動く（package.json の predev / prebuild）
//   public/ の写しは git に入れない（docs/ が正。写しが古くなって食い違わないように、毎回写し直す）
//   uzu.css だけは、ウズ用の上書きなので public/ に置いたまま（写さない・消さない）
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, "..", "..", "docs");
const pub = join(here, "..", "public");
const items = ["css", "img", "js", "nz-crypto.js", "scenario.data.js", "scenario.more.js"];

for (const name of items) {
  rmSync(join(pub, name), { recursive: true, force: true });
  cpSync(join(docs, name), join(pub, name), { recursive: true });
}
console.log(`synced ${items.length} items from docs/ to public/`);

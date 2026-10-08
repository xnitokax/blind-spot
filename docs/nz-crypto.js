// =========================================================
//  暗号化（ゲーム本体とビルドツールで共用）
//    パスワードから PBKDF2 で鍵を作り、本文を AES-GCM で暗号化する
//    → 正しいパスワードを入れない限り、データを見ても本文は読めない
//    任務ごとのデータは「回線コード」で、鍵付きの場所はそのパスワードで暗号化する
// =========================================================
const NZ = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const PBKDF2_ITERATIONS = 150000;

  const b64 = u8 => {
    let s = "";
    u8.forEach(b => (s += String.fromCharCode(b)));
    return btoa(s);
  };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, [
      "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  return {
    // 入力のゆれをそろえる（全角→半角、大文字→小文字、空白を除く）
    // 「！」を全角で打っても「!」として扱われる
    norm: s => String(s).normalize("NFKC").toLowerCase().replace(/\s+/g, ""),

    async lock(text, pass) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(pass, salt);
      const ct = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)),
      );
      return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
    },

    // 惜しい答え（打ち間違いの助け舟）を、読めない形で残すためのハッシュ（場所の名前を塩にする）
    async hash(salt, s) {
      const d = new Uint8Array(
        await crypto.subtle.digest("SHA-256", enc.encode(`${salt}:${NZ.norm(s)}`)),
      );
      return b64(d);
    },

    // パスワードが違えば復号に失敗して null（AES-GCM の改ざん検知がそのまま正誤判定になる）
    async unlock(box, pass) {
      try {
        const key = await deriveKey(pass, unb64(box.salt));
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: unb64(box.iv) },
          key,
          unb64(box.ct),
        );
        return dec.decode(pt);
      } catch {
        return null;
      }
    },
  };
})();

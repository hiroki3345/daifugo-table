# 大富豪卓を GitHub Pages で公開する

画面は GitHub Pages、招待ルームと対戦の同期は Cloudflare Workers と D1 で動きます。公開済みの ChatGPT Sites に依存せず、新しく作った部屋の招待リンクで遊べます。Cloudflare は Workers Free プランの範囲で利用できます。

## 1. 対戦サーバーを設定する

Node.js を用意し、このリポジトリのルートで次のコマンドを実行します。

```sh
npx wrangler login
npx wrangler d1 create daifugo-rooms
```

`wrangler.jsonc` の `database_id` を作成時に表示された値に置き換え、`PAGES_ORIGIN` を自分の GitHub Pages のオリジン（例 `https://your-user.github.io`。リポジトリ名や末尾のスラッシュは不要）に設定します。

```sh
npx wrangler d1 migrations apply daifugo-rooms --remote
npx wrangler deploy
```

デプロイ時に表示される `https://…workers.dev` を、`config.js` の空文字に設定します。`/api/table` は付けず、URLだけを入れます。

## 2. GitHub Pages を公開する

1. GitHub に新規の公開リポジトリ（例 `daifugo-table`）を作り、このフォルダの中身を `main` に入れます。
2. リポジトリの **Settings → Pages → Build and deployment** で **Deploy from a branch → main → /docs** を選び、**Save** を押します。
3. 公開された GitHub Pages のURLで「部屋を作成する」を押し、発行された部屋のURLを友達に共有します。

公開用の JavaScript は `game.js` に同梱済みです。

GitHub Pages 版には新しい部屋を作成してください。既存の ChatGPT Sites 上の部屋データは引き継ぎません。

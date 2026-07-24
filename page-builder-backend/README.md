# page-builder バックエンド

Google ログイン + プロジェクトのサーバー保存(Canvaのイメージ)を実現するための
Cloudflare Pages Functions バックエンドです。`public/index.html` に今のエディタ本体、
`functions/` にAPIが入っています。

## 構成

- `public/index.html` — エディタ本体(現状はローカルのZIP書き出し/読み込みのみ。クラウド保存への接続は未実装 — 次のステップで対応します)
- `functions/api/auth/*` — Googleログイン(login → callback → セッションCookie発行)
- `functions/api/projects/*` — プロジェクトのCRUD(D1でメタデータ、R2で本体JSON管理)
- `schema.sql` — D1のテーブル定義
- `wrangler.toml` — ローカル開発用の設定

## 手順

### 1. GitHubリポジトリを作る
このフォルダの中身をそのままリポジトリにpushしてください。

```
git init
git add .
git commit -m "init"
git remote add origin <あなたのリポジトリURL>
git push -u origin main
```

### 2. Cloudflareで D1 と R2 を作成
Cloudflareダッシュボード、またはwrangler CLIで:

```
npx wrangler d1 create page-builder-db
npx wrangler d1 execute page-builder-db --remote --file=./schema.sql
npx wrangler r2 bucket create page-builder-projects
```

`d1 create` で表示される `database_id` を控えておきます(`wrangler.toml` はローカル開発用なので、
本番用のIDは次のステップでダッシュボードに設定します)。

### 3. Cloudflare Pages プロジェクトを作成してGitHubと連携
ダッシュボード → Workers & Pages → Create → Pages → GitHubリポジトリを接続。
ビルド設定は「フレームワークなし」でOKです(ビルドコマンド不要、出力ディレクトリは `public`)。
これで以後、GitHubにpushするたびに自動でデプロイされます。

### 4. Bindingを設定
Pagesプロジェクト → Settings → Functions → Bindings で:
- D1 database binding: 変数名 `DB` → 手順2で作った `page-builder-db`
- R2 bucket binding: 変数名 `PROJECTS_BUCKET` → 手順2で作った `page-builder-projects`

### 5. Google OAuthの認証情報を作成
Google Cloud Console → APIとサービス → 認証情報 → OAuthクライアントID(ウェブアプリケーション)。
承認済みのリダイレクトURIに以下を追加:

```
https://<あなたのプロジェクト>.pages.dev/api/auth/callback
```

独自ドメインを使う場合はそちらのURLも追加してください。

### 6. 環境変数(シークレット)を設定
Pagesプロジェクト → Settings → Environment variables で以下を追加(Secretとして):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET` — ランダムな長い文字列(例: `openssl rand -hex 32` で生成)

### 7. 再デプロイ
Binding・環境変数の変更を反映するため、Pagesダッシュボードから「Retry deployment」するか、
何か1行変更してpushしてください。

以上で `https://<プロジェクト>.pages.dev/api/auth/login` にアクセスすると
Googleログインが開始できるはずです。

## まだ未対応

- `public/index.html` 側からこのAPIを呼ぶ処理(ログインボタン、クラウド保存/読み込みボタン、
  プロジェクト一覧画面)はまだ組み込んでいません。バックエンドの動作を確認できたら、
  次にフロントエンドを繋ぎ込みます。
- 本番トラフィックが増えてきたら、Google IDトークンの検証をtokeninfoエンドポイント呼び出しから
  JWKSを使った自前検証に切り替えるとより高速です(今の実装でも動作・セキュリティ上は問題ありません)。

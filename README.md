# get-chatwork-unread

Chatworkの未読ルームを横断して会話コンテキストをMarkdownに出力するNode.js CLIです。将来的なGoogle Drive連携に向け、Google OAuth 2.0のrefresh tokenを取得する補助コマンドも含みます。

## 必要環境

- Node.js 18以上
- npm
- Chatwork APIトークン
- Google OAuthを使う場合は、Google Cloud Consoleで作成した「デスクトップアプリ」OAuthクライアント

## セットアップ

```bash
npm ci
```

ローカルの`.env`に必要な認証情報を設定します。`.env`はGit管理されません。

```ini
CHATWORK_API_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`は、Google OAuth認証を使う場合だけ必要です。

## Chatwork未読コンテキストの生成

```bash
npm run chatwork
```

`GET /v2/rooms`で未読があるルームを調べ、各ルームの最新メッセージから「未読数 + 5件」（最大100件）を取得します。結果は`output/chatwork-unread.md`へ毎回上書き出力されます。

このコマンドは読み取り専用のChatwork API呼び出しのみを行い、メッセージの既読・未読状態を変更しません。

## Google OAuth 2.0の初回認証

Google Drive連携を実装する前に、Codex Cloudへ登録するrefresh tokenを取得できます。

```bash
npm run google:auth
```

1. ターミナルに表示された認可URLを、コマンドを実行した同じローカルPCのブラウザで開きます。
2. テストユーザーとして登録したGoogle Workspaceアカウントで認可します。
3. ブラウザに完了画面が表示されたら、ターミナルへ戻ります。
4. 表示された`GOOGLE_REFRESH_TOKEN=...`の値を、Codex CloudのSecret `GOOGLE_REFRESH_TOKEN`として登録します。

このフローはGoogleのデスクトップアプリ向けループバックIPリダイレクトを使用し、権限は`https://www.googleapis.com/auth/drive.file`に限定しています。refresh tokenはファイルへ保存せず、認証完了時に端末へ一度だけ表示します。

## テスト

```bash
npm test
```

## セキュリティ

- `.env`、`node_modules/`、`output/`はGit管理しません。
- APIトークン、Client Secret、refresh tokenをソースコードやコミットへ含めないでください。
- Google OAuth認可URLはローカルPC上のブラウザで開いてください。クラウド環境上での初回認証は想定していません。

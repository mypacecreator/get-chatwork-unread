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

## Chatwork未読コンテキストをGoogle Driveへ同期

`GOOGLE_DRIVE_FILE_ID`で指定した既存の`chatwork-unread.md`を、生成したMarkdownで上書きします。

```bash
npm run chatwork:sync
```

必要な`.env`またはCodex Cloud Secretは次のとおりです。

```ini
CHATWORK_API_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FILE_ID=...
```

同期はChatwork取得、`output/chatwork-unread.md`の生成、Google Driveの既存ファイル更新の順で実行されます。`files.create`は使用せず、更新前後にFile IDとMIME type（`text/markdown`）を検証するため、新規ファイルの作成や別ファイルへの更新は行いません。

## Google OAuth 2.0の初回認証

Google Drive連携を実装する前に、Codex Cloudへ登録するrefresh tokenを取得できます。

```bash
npm run google:auth
```

1. `.env`に既存の対象ファイルのIDを設定します。

   ```ini
   GOOGLE_DRIVE_FILE_ID=...
   ```

2. ターミナルに表示された認可URLを、コマンドを実行した同じローカルPCのブラウザで開きます。
3. テストユーザーとして登録したGoogle Workspaceアカウントで認可します。
4. Google Pickerが表示されたら、既存の`chatwork-unread.md`を選択します。
5. ブラウザに完了画面が表示されたら、ターミナルへ戻ります。表示された`GOOGLE_REFRESH_TOKEN=...`の値を、Codex CloudのSecret `GOOGLE_REFRESH_TOKEN`として登録します。
6. スクリプトは選択後に`GOOGLE_DRIVE_FILE_ID`へ読み取り専用でアクセスし、File ID・ファイル名・MIME type・サイズ・更新日時を表示します。PickerがFile IDをコールバックで返す場合は、設定値との一致も表示します。

このフローはGoogleのデスクトップアプリ向けループバックIPリダイレクトとOne Picker（`trigger_onepick=true`）を使用し、権限は`https://www.googleapis.com/auth/drive.file`に限定しています。refresh tokenはファイルへ保存せず、認証完了時に端末へ一度だけ表示します。

## テスト

```bash
npm test
```

## セキュリティ

- `.env`、`node_modules/`、`output/`はGit管理しません。
- APIトークン、Client Secret、refresh tokenをソースコードやコミットへ含めないでください。
- Google OAuth認可URLはローカルPC上のブラウザで開いてください。クラウド環境上での初回認証は想定していません。

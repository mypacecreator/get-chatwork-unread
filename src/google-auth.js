import 'dotenv/config';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { google } from 'googleapis';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CALLBACK_PATH = '/oauth2callback';
const AUTH_TIMEOUT_MS = 10 * 60 * 1000;

export function getGoogleCredentials(environment = process.env) {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = environment;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を .env に設定してください。');
  }
  return { clientId, clientSecret };
}

export function createAuthorizationUrl(oauth2Client, state) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_FILE_SCOPE],
    state,
    // Google Picker for desktop and mobile authorization flows.
    trigger_onepick: true,
  });
}

function listenForAuthorizationCode(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('認証の待機時間（10分）が過ぎました。もう一度実行してください。'));
    }, AUTH_TIMEOUT_MS);

    server.once('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`ローカル認証サーバーを起動できませんでした: ${error.message}`));
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        clearTimeout(timeout);
        reject(new Error('ローカル認証サーバーのポートを取得できませんでした。'));
        return;
      }
      resolve(address.port);
    });
  });
}

function receiveAuthorizationCode(server, expectedState) {
  return new Promise((resolve, reject) => {
    server.on('request', (request, response) => {
      const callbackUrl = new URL(request.url, 'http://127.0.0.1');
      if (callbackUrl.pathname !== CALLBACK_PATH) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const oauthError = callbackUrl.searchParams.get('error');
      const code = callbackUrl.searchParams.get('code');
      const state = callbackUrl.searchParams.get('state');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<p>認証が完了しました。このウィンドウを閉じてターミナルへ戻ってください。</p>');

      if (oauthError) {
        reject(new Error(`Google OAuth認可が完了しませんでした: ${oauthError}`));
      } else if (state !== expectedState) {
        reject(new Error('Google OAuthのstate検証に失敗しました。もう一度実行してください。'));
      } else if (!code) {
        reject(new Error('Google OAuthのコールバックに認可コードがありません。'));
      } else {
        // One Picker does not guarantee that the selected ID is returned in the
        // OAuth callback. Preserve it when it is provided, otherwise verify the
        // explicitly configured ID after exchanging the authorization code.
        resolve({
          code,
          selectedFileId: callbackUrl.searchParams.get('file_id') ?? callbackUrl.searchParams.get('fileId'),
        });
      }
    });
  });
}

async function verifyConfiguredFile(oauth2Client, selectedFileId, configuredFileId) {
  const fileId = selectedFileId ?? configuredFileId;
  if (!fileId) {
    console.log('GOOGLE_DRIVE_FILE_IDが未設定のため、選択済みファイルの照合はスキップしました。');
    return;
  }

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const { data: file } = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,modifiedTime',
  });

  console.log('\n選択済みファイルへの読み取りアクセスを確認しました。');
  console.log(`File ID: ${file.id}`);
  console.log(`ファイル名: ${file.name}`);
  console.log(`MIME type: ${file.mimeType}`);
  if (file.size) console.log(`サイズ: ${file.size} bytes`);
  if (file.modifiedTime) console.log(`更新日時: ${file.modifiedTime}`);
  if (selectedFileId && configuredFileId) {
    console.log(selectedFileId === configuredFileId
      ? 'Pickerで返されたFile IDはGOOGLE_DRIVE_FILE_IDと一致しています。'
      : '注意: Pickerで返されたFile IDとGOOGLE_DRIVE_FILE_IDが一致しません。');
  }
}

export async function runAuthorization(environment = process.env) {
  const { clientId, clientSecret } = getGoogleCredentials(environment);
  const server = createServer();
  try {
    const state = randomBytes(32).toString('base64url');
    const codePromise = receiveAuthorizationCode(server, state);
    const port = await listenForAuthorizationCode(server);
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authorizationUrl = createAuthorizationUrl(oauth2Client, state);

    console.log('次のURLをローカルのブラウザで開き、Google Workspaceアカウントで認可してください。');
    console.log('Google Pickerが表示されたら、既存のchatwork-unread.mdを選択してください。');
    console.log(authorizationUrl);
    const { code, selectedFileId } = await codePromise;
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('refresh tokenを取得できませんでした。認可画面で同意を完了し、もう一度実行してください。');
    }

    console.log('\n以下をCodex CloudのSecret GOOGLE_REFRESH_TOKEN に登録してください。');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('refresh tokenはファイルへ保存していません。');

    await verifyConfiguredFile(oauth2Client, selectedFileId, environment.GOOGLE_DRIVE_FILE_ID);
  } finally {
    server.close();
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  runAuthorization().catch((error) => {
    console.error(`エラー: ${error.message}`);
    process.exitCode = 1;
  });
}

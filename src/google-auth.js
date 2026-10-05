import 'dotenv/config';
import { createServer } from 'node:http';
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

export function createAuthorizationUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_FILE_SCOPE],
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

function receiveAuthorizationCode(server) {
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
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<p>認証が完了しました。このウィンドウを閉じてターミナルへ戻ってください。</p>');

      if (oauthError) {
        reject(new Error(`Google OAuth認可が完了しませんでした: ${oauthError}`));
      } else if (!code) {
        reject(new Error('Google OAuthのコールバックに認可コードがありません。'));
      } else {
        resolve(code);
      }
    });
  });
}

export async function runAuthorization(environment = process.env) {
  const { clientId, clientSecret } = getGoogleCredentials(environment);
  const server = createServer();
  try {
    const codePromise = receiveAuthorizationCode(server);
    const port = await listenForAuthorizationCode(server);
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authorizationUrl = createAuthorizationUrl(oauth2Client);

    console.log('次のURLをローカルのブラウザで開き、Google Workspaceアカウントで認可してください。');
    console.log(authorizationUrl);
    const code = await codePromise;
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('refresh tokenを取得できませんでした。認可画面で同意を完了し、もう一度実行してください。');
    }

    console.log('\n以下をCodex CloudのSecret GOOGLE_REFRESH_TOKEN に登録してください。');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('refresh tokenはファイルへ保存していません。');
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

import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { google } from 'googleapis';
import { generateUnreadContext } from './chatwork.js';

const MARKDOWN_MIME_TYPE = 'text/markdown';

export function getGoogleDriveCredentials(environment = process.env) {
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_FILE_ID',
  ];
  const missing = required.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(`Google Drive同期に必要な環境変数が設定されていません: ${missing.join(', ')}`);
  }
  return {
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    refreshToken: environment.GOOGLE_REFRESH_TOKEN,
    fileId: environment.GOOGLE_DRIVE_FILE_ID,
  };
}

export async function updateExistingMarkdownFile(drive, fileId, body) {
  const { data: existingFile } = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType',
  });
  if (existingFile.id !== fileId) {
    throw new Error('Google Driveから返されたFile IDが指定値と一致しません。更新を中止しました。');
  }
  if (existingFile.mimeType !== MARKDOWN_MIME_TYPE) {
    throw new Error(`対象ファイルのMIME typeが${MARKDOWN_MIME_TYPE}ではありません: ${existingFile.mimeType}`);
  }

  const { data: updatedFile } = await drive.files.update({
    fileId,
    media: {
      mimeType: MARKDOWN_MIME_TYPE,
      body,
    },
    fields: 'id,name,mimeType,size,modifiedTime',
  });
  if (updatedFile.id !== fileId) {
    throw new Error('Google Drive更新後のFile IDが指定値と一致しません。');
  }
  if (updatedFile.mimeType !== MARKDOWN_MIME_TYPE) {
    throw new Error(`Google Drive更新後のMIME typeが${MARKDOWN_MIME_TYPE}ではありません: ${updatedFile.mimeType}`);
  }
  return updatedFile;
}

export async function syncChatworkUnreadContext(environment = process.env) {
  if (!environment.CHATWORK_API_TOKEN) {
    throw new Error('CHATWORK_API_TOKEN が設定されていません。');
  }
  const { clientId, clientSecret, refreshToken, fileId } = getGoogleDriveCredentials(environment);
  const { outputPath, unreadRoomCount } = await generateUnreadContext(environment.CHATWORK_API_TOKEN);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const updatedFile = await updateExistingMarkdownFile(drive, fileId, createReadStream(outputPath));
  return { unreadRoomCount, outputPath, updatedFile };
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  syncChatworkUnreadContext()
    .then(({ unreadRoomCount, outputPath, updatedFile }) => {
      console.log(`未読${unreadRoomCount}ルームのMarkdownを生成しました: ${outputPath}`);
      console.log('Google Driveの既存ファイルを更新しました。');
      console.log(`File ID: ${updatedFile.id}`);
      console.log(`ファイル名: ${updatedFile.name}`);
      console.log(`MIME type: ${updatedFile.mimeType}`);
      console.log(`サイズ: ${updatedFile.size ?? '不明'} bytes`);
      console.log(`更新日時: ${updatedFile.modifiedTime ?? '不明'}`);
    })
    .catch((error) => {
      console.error(`エラー: ${error.message}`);
      process.exitCode = 1;
    });
}

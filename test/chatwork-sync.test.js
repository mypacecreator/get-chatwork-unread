import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { getGoogleDriveCredentials, updateExistingMarkdownFile } from '../src/chatwork-sync.js';

test('Google Drive同期に必要な認証情報がない場合は失敗する', () => {
  assert.throws(() => getGoogleDriveCredentials({}), /GOOGLE_CLIENT_ID/);
});

test('既存のMarkdownファイルだけをfiles.updateで更新する', async () => {
  const calls = [];
  const drive = {
    files: {
      get: async (options) => {
        calls.push(['get', options]);
        return { data: { id: 'file-123', name: 'chatwork-unread.md', mimeType: 'text/markdown' } };
      },
      update: async (options) => {
        calls.push(['update', options]);
        return {
          data: {
            id: 'file-123', name: 'chatwork-unread.md', mimeType: 'text/markdown', size: '42', modifiedTime: '2026-10-05T00:00:00Z',
          },
        };
      },
    },
  };

  const result = await updateExistingMarkdownFile(drive, 'file-123', Readable.from('# generated markdown'));
  assert.equal(result.id, 'file-123');
  assert.deepEqual(calls.map(([method]) => method), ['get', 'update']);
  assert.equal(calls[1][1].fileId, 'file-123');
  assert.equal(calls[1][1].media.mimeType, 'text/markdown');
});

test('対象がMarkdown以外の場合は更新しない', async () => {
  let updated = false;
  const drive = {
    files: {
      get: async () => ({ data: { id: 'file-123', name: 'other.txt', mimeType: 'text/plain' } }),
      update: async () => { updated = true; },
    },
  };
  await assert.rejects(
    updateExistingMarkdownFile(drive, 'file-123', Readable.from('content')),
    /MIME type/,
  );
  assert.equal(updated, false);
});

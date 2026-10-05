import test from 'node:test';
import assert from 'node:assert/strict';
import { formatChatworkBody, formatTokyoTime, renderMarkdown, selectRecentMessages } from '../src/chatwork.js';

test('Chatwork記法を読みやすいMarkdownに整形する', () => {
  const body = '[To:123]山田さん\n[info]\n[title]確認お願いします[/title]\n本文\n[/info]\n[quote aid=1]\n引用\n[/quote]\n[hr]';
  assert.equal(formatChatworkBody(body), 'To: 山田さん\n\n**確認お願いします**\n本文\n\n> 引用\n\n---');
});

test('最新側から未読数+5件を時系列順に選択する', () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({ send_time: index + 1 }));
  assert.deepEqual(selectRecentMessages(messages, 3).map((message) => message.send_time), [5, 6, 7, 8, 9, 10, 11, 12]);
});

test('日本時間で日時を表示する', () => {
  assert.equal(formatTokyoTime(0), '1970-01-01 09:00');
});

test('未読ゼロでもMarkdownを生成する', () => {
  const markdown = renderMarkdown([], new Date('2026-10-05T00:00:00Z'));
  assert.match(markdown, /未読ルーム数: 0/);
  assert.match(markdown, /現在、Chatworkに未読メッセージはありません。/);
});

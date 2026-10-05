import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE_URL = 'https://api.chatwork.com/v2';
const OUTPUT_PATH = resolve('output/chatwork-unread.md');

export function formatChatworkBody(body = '') {
  let formatted = String(body).replace(/\r\n?/g, '\n');

  formatted = formatted.replace(/\[To:\d+\]\s*/g, 'To: ');
  formatted = formatted.replace(/\[title\]([\s\S]*?)\[\/title\]/gi, '**$1**');
  formatted = formatted.replace(/\[info\]|\[\/info\]/gi, '');
  formatted = formatted.replace(/\[hr\]/gi, '\n\n---\n\n');
  formatted = formatted.replace(/\[quote(?:\s+[^\]]*)?\]([\s\S]*?)\[\/quote\]/gi, (_, quote) => {
    return quote
      .trim()
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
  });

  return formatted.replace(/\n{3,}/g, '\n\n').trim();
}

export function formatTokyoTime(unixSeconds) {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(Number(unixSeconds) * 1000));
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}`;
}

export function selectRecentMessages(messages, unreadCount) {
  const limit = Math.min(100, Number(unreadCount) + 5);
  return [...messages]
    .sort((a, b) => Number(a.send_time) - Number(b.send_time))
    .slice(-limit);
}

function senderName(message) {
  return message.account?.name || message.account_name || `アカウント ${message.account_id ?? '不明'}`;
}

export function renderMarkdown(unreadRooms, generatedAt = new Date()) {
  const unreadTotal = unreadRooms.reduce((total, room) => total + Number(room.unread_num), 0);
  const timestamp = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(generatedAt).replace(/\//g, '-').replace(',', '');

  const lines = [
    '# Chatwork 未読コンテキスト',
    '',
    `取得日時: ${timestamp}`,
    `未読ルーム数: ${unreadRooms.length}`,
    `未読メッセージ数: ${unreadTotal}`,
  ];

  if (unreadRooms.length === 0) {
    return [...lines, '', '現在、Chatworkに未読メッセージはありません。', ''].join('\n');
  }

  for (const room of unreadRooms) {
    const messages = room.contextMessages;
    lines.push(
      '', '---', '', `## ${room.name}`, '',
      `未読メッセージ数: ${room.unread_num}`,
      `コンテキストとして取得したメッセージ数: ${messages.length}`,
      '',
      `以下は未読内容を把握するために取得した直近${messages.length}件の会話です。`,
      '未読メッセージと直前の既読メッセージが含まれている可能性があります。',
    );
    for (const message of messages) {
      lines.push('', `### ${senderName(message)}｜${formatTokyoTime(message.send_time)}`, '', formatChatworkBody(message.body));
    }
  }
  return [...lines, ''].join('\n');
}

async function chatworkRequest(path, token) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: { 'X-ChatWorkToken': token } });
  } catch (error) {
    throw new Error(`Chatwork APIへの接続に失敗しました (${path}): ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`Chatwork APIがエラーを返しました (${path}): HTTP ${response.status}`);
  }
  return response.json();
}

export async function generateUnreadContext(token) {
  if (!token) {
    throw new Error('CHATWORK_API_TOKEN が設定されていません。.env に設定してください。');
  }
  const rooms = await chatworkRequest('/rooms', token);
  const unreadRooms = rooms.filter((room) => Number(room.unread_num) > 0);
  const enrichedRooms = await Promise.all(unreadRooms.map(async (room) => {
    const messages = await chatworkRequest(`/rooms/${room.room_id}/messages?force=1`, token);
    return { ...room, contextMessages: selectRecentMessages(messages, room.unread_num) };
  }));
  const markdown = renderMarkdown(enrichedRooms);
  try {
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, markdown, 'utf8');
  } catch (error) {
    throw new Error(`Markdownファイルの書き込みに失敗しました: ${error.message}`);
  }
  return { outputPath: OUTPUT_PATH, unreadRoomCount: enrichedRooms.length };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  generateUnreadContext(process.env.CHATWORK_API_TOKEN)
    .then(({ outputPath, unreadRoomCount }) => {
      console.log(`未読${unreadRoomCount}ルームのコンテキストを生成しました: ${outputPath}`);
    })
    .catch((error) => {
      console.error(`エラー: ${error.message}`);
      process.exitCode = 1;
    });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { google } from 'googleapis';
import { createAuthorizationUrl, getGoogleCredentials } from '../src/google-auth.js';

test('Google OAuth認証URLはDrive file scopeとoffline accessを要求する', () => {
  const client = new google.auth.OAuth2('client-id', 'client-secret', 'http://127.0.0.1:1234/oauth2callback');
  const url = new URL(createAuthorizationUrl(client, 'test-state'));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.has('include_granted_scopes'), false);
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.deepEqual(url.searchParams.get('scope').split(' '), ['https://www.googleapis.com/auth/drive.file']);
  assert.equal(url.searchParams.get('state'), 'test-state');
  assert.equal(url.searchParams.get('trigger_onepick'), 'true');
});

test('Google OAuthのクライアント情報がない場合は明確に失敗する', () => {
  assert.throws(() => getGoogleCredentials({}), /GOOGLE_CLIENT_ID/);
});

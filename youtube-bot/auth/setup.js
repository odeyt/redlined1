/**
 * ONE-TIME YouTube OAuth setup.
 * Run: node auth/setup.js
 * Paste the code shown in the browser → copy the refresh_token → add to .env
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { google } = require('googleapis');
const readline   = require('readline');

const oauth2 = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
});

console.log('\n=== YouTube One-Time Auth Setup ===');
console.log('1. Open this URL in your browser:\n');
console.log('   ' + authUrl);
console.log('\n2. Sign in with your YouTube account and click Allow.');
console.log('3. Copy the code shown and paste it below.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the code here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2.getToken(code.trim());
    console.log('\n✅ Success! Add this line to your .env file:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nYou only need to do this once.');
  } catch (err) {
    console.error('Auth failed:', err.message);
  }
});

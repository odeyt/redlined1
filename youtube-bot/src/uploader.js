'use strict';

const { google }  = require('googleapis');
const fs          = require('fs');
const log         = require('./logger');

function getOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return oauth2;
}

/**
 * Upload the final video to YouTube.
 * Returns the YouTube video ID.
 */
async function uploadToYouTube(videoPath, script) {
  log.info(`Uploading to YouTube: "${script.title}"`);

  const auth    = getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title:       script.title,
        description: script.description,
        tags:        script.tags || [],
        categoryId:  process.env.VIDEO_CATEGORY_ID || '28', // 28 = Science & Technology
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus:           'public',
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  log.info(`Uploaded! https://www.youtube.com/watch?v=${videoId}`);
  return videoId;
}

/**
 * Set the video thumbnail (requires a thumbnail image file).
 * Optional — skipped if no thumbnail image exists.
 */
async function setThumbnail(videoId, thumbnailPath) {
  if (!fs.existsSync(thumbnailPath)) return;
  const auth    = getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });
  await youtube.thumbnails.set({
    videoId,
    media: { body: fs.createReadStream(thumbnailPath) },
  });
  log.info(`Thumbnail set for ${videoId}`);
}

module.exports = { uploadToYouTube, setThumbnail };

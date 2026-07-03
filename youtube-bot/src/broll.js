'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const log   = require('./logger');

const PEXELS_BASE = 'https://api.pexels.com/videos';

/**
 * Search Pexels for a video matching the query and download it.
 * Returns the local file path.
 */
async function fetchBroll(query, outputDir, index) {
  log.info(`Fetching B-roll for: "${query}"`);

  const search = await axios.get(`${PEXELS_BASE}/search`, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
    params: { query, per_page: 5, orientation: 'landscape', size: 'medium' },
  });

  const videos = search.data.videos;
  if (!videos || videos.length === 0) throw new Error(`No Pexels results for: ${query}`);

  // Pick a random result from top 5 for variety
  const video = videos[Math.floor(Math.random() * videos.length)];

  // Prefer HD (1280x720 or 1920x1080) mp4 file
  const file = video.video_files
    .filter(f => f.file_type === 'video/mp4')
    .sort((a, b) => (b.width || 0) - (a.width || 0))
    .find(f => f.width >= 1280) || video.video_files[0];

  if (!file?.link) throw new Error(`No downloadable file for Pexels video id=${video.id}`);

  const dest = path.join(outputDir, `broll_${index}.mp4`);
  await downloadFile(file.link, dest);
  log.info(`B-roll saved: ${dest} (${file.width}x${file.height})`);
  return dest;
}

async function downloadFile(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

module.exports = { fetchBroll };

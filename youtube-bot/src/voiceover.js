'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const log   = require('./logger');

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

/**
 * Generate a voiceover MP3 for the full script narration.
 * Returns the local file path and duration in seconds.
 */
async function generateVoiceover(scenes, outputDir) {
  const fullText = scenes.map(s => s.narration).join('\n\n');
  log.info(`Generating voiceover — ${fullText.split(/\s+/).length} words`);

  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const dest    = path.join(outputDir, 'voiceover.mp3');

  const response = await axios.post(
    `${ELEVEN_BASE}/text-to-speech/${voiceId}`,
    {
      text: fullText,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'stream',
    }
  );

  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

  const durationSec = await getMp3Duration(dest);
  log.info(`Voiceover saved: ${dest} (${durationSec.toFixed(1)}s)`);
  return { path: dest, duration: durationSec };
}

/**
 * Get MP3 duration in seconds by reading the file size and estimating bitrate.
 * Uses ffprobe if available, falls back to estimate.
 */
async function getMp3Duration(filePath) {
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8' }
    );
    return parseFloat(out.trim());
  } catch {
    // Fallback: 128kbps estimate
    const stat = fs.statSync(filePath);
    return (stat.size * 8) / 128_000;
  }
}

/**
 * Generate per-scene timing from actual voiceover duration.
 * Distributes duration proportionally based on each scene's word count.
 */
function calcSceneTimings(scenes, totalDuration) {
  const wordCounts = scenes.map(s => s.narration.split(/\s+/).filter(Boolean).length);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);
  return scenes.map((scene, i) => ({
    ...scene,
    duration: Math.max(5, Math.round((wordCounts[i] / totalWords) * totalDuration)),
  }));
}

module.exports = { generateVoiceover, calcSceneTimings };

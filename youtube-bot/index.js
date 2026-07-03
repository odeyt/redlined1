'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const cron    = require('node-cron');
const fs      = require('fs');
const path    = require('path');
const log     = require('./src/logger');
const topics  = require('./config/topics');
const { generateScript }     = require('./src/scriptWriter');
const { fetchBroll }         = require('./src/broll');
const { recordFlow }         = require('./src/screenRecorder');
const { generateVoiceover, calcSceneTimings } = require('./src/voiceover');
const { assembleVideo }      = require('./src/assembler');
const { uploadToYouTube }    = require('./src/uploader');

const STATE_FILE = path.join(__dirname, 'state.json');

// ── State helpers ────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { topicIndex: 0, published: [] }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ── Output directory for this run ────────────────────────────────

function makeRunDir(topicId) {
  const dir = path.join(__dirname, 'output', `${topicId}_${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Main pipeline ────────────────────────────────────────────────

async function runPipeline() {
  const state = loadState();
  const topic = topics[state.topicIndex % topics.length];
  const runDir = makeRunDir(topic.id);

  log.info(`=== Starting pipeline for topic: ${topic.id} ===`);
  log.info(`Run directory: ${runDir}`);

  let videoId = null;

  try {
    // ── Step 1: Generate script with Claude ──────────────────────
    log.info('Step 1/6 — Generating script...');
    const script = await generateScript(topic);
    fs.writeFileSync(path.join(runDir, 'script.json'), JSON.stringify(script, null, 2));

    // ── Step 2: Generate voiceover first (determines total duration) ──
    log.info('Step 2/6 — Generating voiceover...');
    const voiceover = await generateVoiceover(script.scenes, runDir);

    // ── Step 3: Re-map scene durations to actual voiceover timing ──
    const timedScenes = calcSceneTimings(script.scenes, voiceover.duration);

    // ── Step 4: Get video clip for each scene ────────────────────
    log.info('Step 3/6 — Collecting scene clips...');
    let brollIndex = 0;

    for (const scene of timedScenes) {
      if (scene.type === 'screen') {
        // Record live Redlined1 screen flow
        const flowKeys = buildFlowKeys(topic, scene);
        scene.clipPath = await recordFlow(flowKeys, runDir, scene.index);
      } else {
        // Fetch B-roll from Pexels
        const query = scene.pexelsQuery || topic.pexelsQueries[brollIndex % topic.pexelsQueries.length];
        scene.clipPath = await fetchBroll(query, runDir, scene.index);
        brollIndex++;
      }
    }

    // ── Step 5: Assemble final video ─────────────────────────────
    log.info('Step 4/6 — Assembling video...');
    const finalVideo = await assembleVideo(timedScenes, voiceover, runDir);

    // ── Step 6: Upload to YouTube ─────────────────────────────────
    log.info('Step 5/6 — Uploading to YouTube...');
    videoId = await uploadToYouTube(finalVideo, script);

    // ── Done ──────────────────────────────────────────────────────
    log.info(`Step 6/6 — Done! https://www.youtube.com/watch?v=${videoId}`);

    state.topicIndex = (state.topicIndex + 1) % topics.length;
    state.published.push({
      topicId:   topic.id,
      videoId,
      title:     script.title,
      publishedAt: new Date().toISOString(),
    });
    saveState(state);

    // Clean up run directory to save disk space
    cleanupRunDir(runDir, finalVideo);

  } catch (err) {
    log.error(`Pipeline failed for topic ${topic.id}: ${err.message}`);
    log.error(err.stack);
    // Advance topic index anyway so next run tries a different topic
    state.topicIndex = (state.topicIndex + 1) % topics.length;
    saveState(state);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Determine which Playwright flows to run for a screen scene.
 * Always includes login first.
 */
function buildFlowKeys(topic, scene) {
  const keys = ['login'];
  if (scene.screenFlow) {
    keys.push(scene.screenFlow);
  } else if (topic.screenFlows && topic.screenFlows.length > 0) {
    // Fallback: use the topic's defined flows (skip login if already first)
    for (const k of topic.screenFlows) {
      if (k !== 'login') keys.push(k);
    }
  }
  return keys;
}

function cleanupRunDir(runDir, keepFile) {
  try {
    const files = fs.readdirSync(runDir);
    for (const f of files) {
      const fp = path.join(runDir, f);
      if (fp !== keepFile) fs.unlinkSync(fp);
    }
  } catch { /* best effort */ }
}

// ── Entry point ──────────────────────────────────────────────────

const runOnce = process.argv.includes('--once');

if (runOnce) {
  log.info('Running once (--once flag)...');
  runPipeline().then(() => process.exit(0)).catch(err => { log.error(err.message); process.exit(1); });
} else {
  const schedule = process.env.CRON_SCHEDULE || '0 9 * * *'; // default: 9am daily
  log.info(`Scheduler started. Next run: ${schedule}`);
  log.info('(Use --once to run immediately without waiting)');
  cron.schedule(schedule, () => {
    log.info('Cron triggered — starting pipeline...');
    runPipeline();
  });
}

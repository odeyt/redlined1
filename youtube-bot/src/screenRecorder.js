'use strict';

const { chromium } = require('playwright');
const path  = require('path');
const flows = require('../config/flows');
const log   = require('./logger');

/**
 * Record a Playwright screen flow and return the path to the .webm video file.
 * @param {string[]} flowKeys  - keys from config/flows.js to run in sequence
 * @param {string}   outputDir - directory to save the recording
 * @param {number}   index     - scene index (for unique filename)
 */
async function recordFlow(flowKeys, outputDir, index) {
  log.info(`Recording screen flow: [${flowKeys.join(', ')}]`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: outputDir, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();

  try {
    for (const key of flowKeys) {
      const fn = flows[key];
      if (!fn) { log.warn(`Unknown flow key: ${key} — skipping`); continue; }
      await fn(page, process.env);
    }
    // Pause at end so viewer can absorb the last screen
    await page.waitForTimeout(2000);
  } catch (err) {
    log.warn(`Screen flow error (continuing): ${err.message}`);
  } finally {
    await context.close();
    await browser.close();
  }

  // Playwright saves the video with a generated name — find it
  const recorded = await page.video()?.path();
  if (!recorded) throw new Error('Playwright did not produce a video file');

  // Rename to a predictable path
  const dest = path.join(outputDir, `screen_${index}.webm`);
  const fs = require('fs');
  fs.renameSync(recorded, dest);
  log.info(`Screen recording saved: ${dest}`);
  return dest;
}

module.exports = { recordFlow };

'use strict';

const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const fs     = require('fs');
const log    = require('./logger');

const W = 1920, H = 1080;
const FONT_PATH = 'C\\:/Windows/Fonts/ariblk.ttf'; // FFmpeg needs escaped colon on Windows

/**
 * Build the final MP4 from scene clips + voiceover.
 * Pipeline:
 *   1. Generate intro card
 *   2. For each scene: trim/loop clip to target duration, scale to 1080p
 *   3. Concatenate all scene clips
 *   4. Mix in voiceover
 *   5. Burn subtitles
 *   6. Append outro card
 *   7. Write final output.mp4
 */
async function assembleVideo(scenes, voiceover, outputDir) {
  log.info('Assembling video...');

  const introDur  = 3;
  const outroDur  = 5;
  const introFile = path.join(outputDir, 'intro.mp4');
  const outroFile = path.join(outputDir, 'outro.mp4');
  const srtFile   = path.join(outputDir, 'captions.srt');
  const concatList= path.join(outputDir, 'concat.txt');
  const finalOut  = path.join(outputDir, 'final.mp4');

  // 1. Generate intro card
  await generateTextCard(introFile, process.env.CHANNEL_NAME || 'Redlined1', introDur, '#cc0000', '#ffffff');

  // 2. Generate outro card
  const ctaText = `Try free at ${process.env.CHANNEL_WEBSITE || 'redlined1.com'}`;
  await generateTextCard(outroFile, ctaText, outroDur, '#111111', '#ffffff');

  // 3. Process each scene clip to exact duration + 1080p
  const processedClips = [];
  for (const scene of scenes) {
    const dest = path.join(outputDir, `proc_${scene.index}.mp4`);
    await processClip(scene.clipPath, dest, scene.duration);
    processedClips.push(dest);
    log.info(`  Scene ${scene.index} processed → ${scene.duration}s`);
  }

  // 4. Build concat list: intro + scenes + outro
  const allClips = [introFile, ...processedClips, outroFile];
  const listContent = allClips.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatList, listContent, 'utf8');

  // 5. Concatenate clips (video only, no audio)
  const silentConcat = path.join(outputDir, 'concat_silent.mp4');
  await runFFmpeg(cmd =>
    cmd.input(concatList)
       .inputOptions(['-f', 'concat', '-safe', '0'])
       .videoCodec('libx264')
       .outputOptions(['-pix_fmt', 'yuv420p', '-an', '-y'])
       .output(silentConcat)
  );

  // 6. Generate SRT captions from scene timing
  generateSRT(scenes, srtFile, introDur);

  // 7. Mix voiceover + burn captions into final output
  const subtitleFilter = `subtitles='${srtFile.replace(/\\/g, '/').replace(':', '\\:')}':force_style='FontSize=28,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Bold=1,Outline=2'`;
  await runFFmpeg(cmd =>
    cmd.input(silentConcat)
       .input(voiceover.path)
       .videoCodec('libx264')
       .audioCodec('aac')
       .outputOptions([
         '-vf', subtitleFilter,
         '-shortest',
         '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart',
         '-y',
       ])
       .output(finalOut)
  );

  // 8. Cleanup temp files
  [silentConcat, concatList, ...processedClips, introFile, outroFile].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  log.info(`Final video: ${finalOut}`);
  return finalOut;
}

/**
 * Trim/loop a clip to an exact duration and scale to 1920x1080.
 * webm and mp4 both supported.
 */
function processClip(inputPath, outputPath, durationSec) {
  return runFFmpeg(cmd =>
    cmd.input(inputPath)
       .inputOptions(['-stream_loop', '-1']) // loop if clip is shorter than duration
       .videoCodec('libx264')
       .outputOptions([
         '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
         '-t', String(durationSec),
         '-pix_fmt', 'yuv420p',
         '-an',
         '-y',
       ])
       .output(outputPath)
  );
}

/**
 * Generate a solid-colour text card (for intro/outro).
 */
function generateTextCard(outputPath, text, durationSec, bgColor, textColor) {
  const escaped = text.replace(/'/g, "\\'").replace(/:/g, '\\:');
  const filter  = [
    `color=c=${bgColor}:size=${W}x${H}:duration=${durationSec}`,
    `drawtext=text='${escaped}':fontsize=72:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2:box=0`,
  ].join(',');

  return runFFmpeg(cmd =>
    cmd.input(`color=c=${bgColor}:size=${W}x${H}:duration=${durationSec}`)
       .inputOptions(['-f', 'lavfi'])
       .videoCodec('libx264')
       .outputOptions(['-vf', `drawtext=text='${escaped}':fontsize=72:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2`, '-pix_fmt', 'yuv420p', '-an', '-y'])
       .duration(durationSec)
       .output(outputPath)
  );
}

/**
 * Generate SRT subtitle file from scene narrations and timings.
 */
function generateSRT(scenes, srtPath, introDur) {
  let offset = introDur; // account for intro
  let index  = 1;
  const lines = [];

  for (const scene of scenes) {
    const words    = scene.narration.split(/\s+/).filter(Boolean);
    const wps      = words.length / scene.duration;
    const chunkSize = Math.max(6, Math.ceil(words.length / Math.ceil(scene.duration / 4)));
    let wordIdx    = 0;

    while (wordIdx < words.length) {
      const chunk = words.slice(wordIdx, wordIdx + chunkSize).join(' ');
      const start = offset + (wordIdx / wps);
      const end   = Math.min(offset + scene.duration, start + (chunkSize / wps));
      lines.push(`${index}\n${toSRT(start)} --> ${toSRT(end)}\n${chunk}\n`);
      wordIdx += chunkSize;
      index++;
    }
    offset += scene.duration;
  }

  fs.writeFileSync(srtPath, lines.join('\n'), 'utf8');
}

function toSRT(secs) {
  const h  = Math.floor(secs / 3600);
  const m  = Math.floor((secs % 3600) / 60);
  const s  = Math.floor(secs % 60);
  const ms = Math.round((secs - Math.floor(secs)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}
function pad(n, len = 2) { return String(n).padStart(len, '0'); }

function runFFmpeg(configureFn) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    configureFn(cmd);
    cmd.on('end', resolve).on('error', reject).run();
  });
}

module.exports = { assembleVideo };

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const log = require('./logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ~150 words per minute at a natural voiceover pace
const WORDS_PER_SECOND = 2.4;

/**
 * Ask Claude to write a full video script and scene breakdown.
 * Returns structured JSON the rest of the pipeline consumes.
 */
async function generateScript(topic) {
  log.info(`Generating script for topic: ${topic.id}`);

  const prompt = `You are a YouTube video scriptwriter specialising in B2B SaaS demos for auto repair shops.

Write a compelling, energetic 3-minute faceless YouTube video script for the topic below.
Output ONLY valid JSON — no markdown fences, no extra text.

TOPIC:
- ID: ${topic.id}
- Hook: ${topic.hook}
- Angle: ${topic.angle}
- CTA: ${topic.cta}
- Website: ${process.env.CHANNEL_WEBSITE || 'https://redlined1.com'}

OUTPUT JSON SCHEMA:
{
  "title": "SEO-optimised YouTube title (max 70 chars, include year 2025)",
  "description": "Full YouTube description (3–5 paragraphs, include timestamps, end with website link and subscribe CTA)",
  "tags": ["array", "of", "10–15", "SEO", "tags"],
  "thumbnailText": "Bold 4–6 word text for thumbnail overlay",
  "scenes": [
    {
      "index": 0,
      "type": "broll | screen",
      "narration": "Exact words the voiceover says during this scene",
      "pexelsQuery": "Search query for Pexels video (only if type=broll)",
      "screenFlow": "Flow key name (only if type=screen, must be one of: login, create_repair_order, create_estimate, convert_to_invoice, create_parts_order, multi_currency_invoice, full_dashboard_tour, vehicle_management, qa_signoff, vin_decode)",
      "notes": "Optional director note"
    }
  ]
}

RULES:
- First scene: hook (broll) — grab attention in 5 seconds
- Mix broll and screen scenes. Screen scenes should show real Redlined1 workflows.
- Each narration block: 40–80 words (≈15–35 seconds of speech)
- Total narration across all scenes: ~420–480 words (3 minutes at natural pace)
- Last scene: clear CTA with website URL
- Tone: confident, direct, slightly punchy — not salesy or corporate
- Never mention competitor names as victims — frame positively ("unlike traditional software…")
- End description with: "🔗 Try Redlined1 free: ${process.env.CHANNEL_WEBSITE || 'https://redlined1.com'}"`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  let script;
  try {
    script = JSON.parse(raw);
  } catch {
    // Claude sometimes wraps in ```json ``` — strip it
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    script = JSON.parse(cleaned);
  }

  // Annotate each scene with estimated duration from word count
  script.scenes = script.scenes.map((scene, i) => {
    const words = (scene.narration || '').split(/\s+/).filter(Boolean).length;
    const duration = Math.max(8, Math.round(words / WORDS_PER_SECOND));
    return { ...scene, index: i, estimatedDuration: duration };
  });

  log.info(`Script ready — ${script.scenes.length} scenes, title: "${script.title}"`);
  return script;
}

module.exports = { generateScript };

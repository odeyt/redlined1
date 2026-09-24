'use client';

import { useState } from 'react';
import { trackEvent } from '@/lib/analytics/track';

/**
 * The approved RedlineD1 demo video: Vehicle Intake.
 *
 * Same video the homepage hero links to (pinned in
 * lib/__tests__/shopAuditFunnel.test.ts). It shows intake only — not the
 * status board — so it is labelled for exactly that and sits under the
 * "check the vehicle in" step, not in the hero.
 *
 * Click-to-load. The YouTube player is roughly a megabyte of script, so until
 * someone asks for it the page carries only the thumbnail. The embed uses
 * youtube-nocookie.com so no YouTube cookie is set before the visitor plays.
 */
export const INTAKE_VIDEO_ID = 'CBdgrO1ONms';

export function IntakeVideo() {
  const [playing, setPlaying] = useState(false);

  function play() {
    trackEvent('video_play', { page: 'shop_owner_demo', video: 'vehicle_intake' });
    setPlaying(true);
  }

  return (
    <figure className="sod-video">
      <div className="sod-video-frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${INTAKE_VIDEO_ID}?autoplay=1&rel=0`}
            title="RedlineD1 Vehicle Intake demo"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" className="sod-video-poster" onClick={play} aria-label="Play the Vehicle Intake demo video">
            {/* A remote thumbnail, not a next/image: YouTube serves it already
                sized, and no remote host is configured for the optimiser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${INTAKE_VIDEO_ID}/hqdefault.jpg`}
              alt=""
              width={480}
              height={360}
              loading="lazy"
              decoding="async"
            />
            <span className="sod-video-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
            </span>
          </button>
        )}
      </div>
      <figcaption>Vehicle Intake demo — checking a vehicle in with RedlineD1.</figcaption>
    </figure>
  );
}

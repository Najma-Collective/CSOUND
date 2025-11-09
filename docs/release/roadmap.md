# Release Roadmap & Content Operations

## Cadence
- **Bi-weekly feature drops (every other Tuesday):** consolidate new biome sketches, fauna behaviors, and minor interaction refinements.
- **Monthly stability release (first Thursday):** focus on regression fixes, audio balancing, and performance tuning for production.
- **Quarterly world expansion (last week of the quarter):** introduce new biomes, major narrative beats, and platform integrations.

## Pre-Release Checklist
1. **Curate Flora/Fauna Variants**
   - Validate palette cohesion, scale, and motion curves for new organisms.
   - Confirm spawn tables and rarity weights in `EntityFactory` keep biome density within design bounds.
   - Capture short clips or stills for release notes and marketing sync.
2. **Review Telemetry Signals**
   - Inspect anonymized interaction funnels (flora blooms vs. fauna drags) for feature prioritization.
   - Compare current session counts against historical baselines to detect engagement regressions.
   - Verify `CSOUND_TELEMETRY_ENDPOINT` targets the correct environment (staging or production) prior to deploy.
3. **Verify Audio Headroom**
   - Run analyser snapshot utilities to confirm peak levels stay below -3 dBFS with limiter engaged.
   - Audit motif layering envelopes for new content to avoid masking existing soundscapes.
   - Re-listen on reference headphones and laptop speakers to check perceived loudness consistency.

## Post-Release Follow-Up
- Tag telemetry markers for any emergent interaction clusters for the next roadmap planning session.
- Rotate in fresh flora/fauna concept art to keep the backlog ready for upcoming releases.
- File audio feedback tickets for any clipping or tonal balance issues observed during smoke tests.

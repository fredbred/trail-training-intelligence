# Synthetic Trail Data Pipeline Report

This is a shortened public-safe example. It is not generated from a real athlete account.

## Executive Summary

- Period analyzed: 2026-01-06 to 2026-01-15.
- Activities: 5.
- Total volume: 5.8 h.
- Total distance: 44.3 km.
- Total ascent: 1,930 m.
- Long runs: 1.
- Significant ascent sessions: 2.

## Data Quality

- 4 activities include GPS-capable outdoor data.
- 1 indoor cross-training session has no distance stream.
- Heart-rate data is present for all synthetic activities.
- No raw exports are included in this repository.

## Training Signals

- The largest synthetic week combines one long trail run and two shorter runs.
- Trail specificity is represented through ascent per hour and ascent per km.
- Estimated load uses duration weighted by average heart-rate ratio where heart rate is available.

## Limits

- Synthetic data cannot validate parser compatibility with a real watch export.
- The estimated load metric is trend support only, not a physiological diagnosis.

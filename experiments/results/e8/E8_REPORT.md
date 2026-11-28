# E8 - Perceptual-hash robustness (pilot)

Generated (UTC): `2026-11-28T14:15:35.940653+00:00`

Command: `python.exe experiments\e8_fingerprint.py --n-images 80 --seed 1234 --offline-manifest experiments\results\e8\e8_fingerprint.json --out experiments\results\e8`

Runtime: data acquisition 0.4s, evaluation 14.8s.

> **Scope.** Pilot on 80 public web photographs (Picsum/Unsplash). This is **not** Copydays, INRIA Holidays, Oxford5k, DiffusionDB or GenImage, and it does **not** evaluate PDQ, CLIP or DINOv2. Results do not establish AIGC-specific robustness. See Scope and Limitations.

## 1. Dataset

- Source: Picsum Photos (https://picsum.photos), photographs from Unsplash.
- Replayed **80** cached images from the prior manifest; no network download was attempted (failed: 0).
- Cached source images are local inputs and are not tracked in the repository; a fresh checkout needs a local cache or network access for acquisition.
- Seeds: 1000..1079 (contiguous, n=80), size 512x512 RGB JPEG.
- Global distinct-identity pairs: 3157.

## 2. Splits

Identity-level random split (`numpy.random.default_rng(1234)`), 40/20/40. Each identity appears in exactly one split.

| Split | Identities | Role |
|---|---:|---|
| Calibration | 32 | Reserved; used only as extra impostors for threshold estimation, never for evaluation |
| Validation | 16 | Threshold selection (target FPR = 1%) |
| Test | 32 | Held-out evaluation only |

## 3. Protocol

- Hashes: 64-bit pHash, dHash, aHash, wHash, plus an unweighted ensemble of normalised Hamming distances.
- Positive pairs: original vs transformed, 448 on validation and 896 on test (28 transformations per identity, 512x512 originals).
- Negative pairs: distinct identities only. Validation threshold negatives = 1127 (calibration+validation); test FPR negatives = 494 (test identities only). Cap 5000 not reached.
- Match rule: `distance <= tau`. Threshold picked on validation at FPR closest to 1% (ties: lower FPR, then lower tau).
- TPR overall pools all transformation pairs; per-transformation TPR uses 32 test identities each.

## 4. Thresholds selected on validation

| Method | tau | Validation FPR | Validation TPR | val pos | val neg |
|---|---:|---:|---:|---:|---:|
| pHash | 20 | 0.35% | 79.5% | 448 | 1127 |
| dHash | 18 | 0.98% | 76.8% | 448 | 1127 |
| aHash | 4 | 0.80% | 67.0% | 448 | 1127 |
| wHash | 4 | 0.80% | 61.8% | 448 | 1127 |
| Ensemble | 0.2578 | 0.98% | 76.8% | 448 | 1127 |

## 5. Test results at the validation-selected threshold

Positive pairs: 896; negative pairs: 494. CIs are 95% Wilson.

| Method | TPR@1%FPR (95% CI) | Test FPR (95% CI) | EER | AUC |
|---|---|---|---:|---:|
| pHash | 78.3% [75.5, 80.9] (702/896) | 2.02% [1.10, 3.69] (10/494) | 12.2% | 0.9351 |
| dHash | 78.6% [75.8, 81.1] (704/896) | 2.23% [1.25, 3.94] (11/494) | 12.7% | 0.9374 |
| aHash | 67.9% [64.7, 70.8] (608/896) | 0.20% [0.04, 1.14] (1/494) | 14.0% | 0.9283 |
| wHash | 61.4% [58.2, 64.5] (550/896) | 0.20% [0.04, 1.14] (1/494) | 18.8% | 0.9117 |
| Ensemble | 76.8% [73.9, 79.4] (688/896) | 1.01% [0.43, 2.35] (5/494) | 10.7% | 0.9586 |

Geometric-only subset (resize, crop, rotate, flip, border; 416 pairs):

| Method | Geometric TPR |
|---|---:|
| pHash | 57.0% (237/416) |
| dHash | 58.2% (242/416) |
| aHash | 37.5% (156/416) |
| wHash | 28.6% (119/416) |
| Ensemble | 54.6% (227/416) |

## 6. Per-transformation TPR (test)

Cells show TPR and true-positives/denominator.

| Transformation | n | pHash | dHash | aHash | wHash | Ensemble |
|---|---:|---:|---:|---:|---:|---:|
| jpeg_q90 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| jpeg_q70 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| jpeg_q50 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| jpeg_q30 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| resize_0.5x | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| resize_0.75x | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| resize_1.5x | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| crop_5pct | 32 | 100.0 (32/32) | 100.0 (32/32) | 68.8 (22/32) | 34.4 (11/32) | 100.0 (32/32) |
| crop_10pct | 32 | 65.6 (21/32) | 75.0 (24/32) | 37.5 (12/32) | 18.8 (6/32) | 81.2 (26/32) |
| crop_20pct | 32 | 12.5 (4/32) | 34.4 (11/32) | 18.8 (6/32) | 9.4 (3/32) | 21.9 (7/32) |
| rotate_p5 | 32 | 71.9 (23/32) | 53.1 (17/32) | 15.6 (5/32) | 0.0 (0/32) | 53.1 (17/32) |
| rotate_m5 | 32 | 65.6 (21/32) | 46.9 (15/32) | 12.5 (4/32) | 0.0 (0/32) | 56.2 (18/32) |
| rotate_p15 | 32 | 3.1 (1/32) | 0.0 (0/32) | 0.0 (0/32) | 0.0 (0/32) | 0.0 (0/32) |
| rotate_m15 | 32 | 3.1 (1/32) | 3.1 (1/32) | 0.0 (0/32) | 0.0 (0/32) | 0.0 (0/32) |
| flip_h | 32 | 0.0 (0/32) | 12.5 (4/32) | 15.6 (5/32) | 6.2 (2/32) | 9.4 (3/32) |
| border_5pct | 32 | 84.4 (27/32) | 75.0 (24/32) | 15.6 (5/32) | 3.1 (1/32) | 65.6 (21/32) |
| border_10pct | 32 | 34.4 (11/32) | 56.2 (18/32) | 3.1 (1/32) | 0.0 (0/32) | 21.9 (7/32) |
| brightness_p20 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| brightness_m20 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| contrast_p20 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 75.0 (24/32) | 100.0 (32/32) |
| contrast_m20 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 71.9 (23/32) | 100.0 (32/32) |
| noise_s2 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| noise_s5 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| noise_s10 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| blur_3x3 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| blur_5x5 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| combo_jpeg50_resize75_noise5 | 32 | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) | 100.0 (32/32) |
| combo_crop10_rotate5_blur3 | 32 | 53.1 (17/32) | 43.8 (14/32) | 12.5 (4/32) | 0.0 (0/32) | 40.6 (13/32) |

## 7. Hardest transformations (ensemble TPR)

- `rotate_m15`: 0.0% (0/32)
- `rotate_p15`: 0.0% (0/32)
- `flip_h`: 9.4% (3/32)

## 8. Errors

None. All transformations and hashes completed for every validation/test identity.

## 9. Consistency checks

- `splits_disjoint`: `True`
- `split_sizes_sum_to_downloaded`: `True`
- `test_positive_pairs`: `896`
- `test_positive_pairs_expected`: `896`
- `per_transform_denominators_equal`: `True`
- `per_transform_sum_equals_overall`: `True`
- `threshold_selected_on_test`: `False`
- `duplicate_content_groups`: `[[1011, 1027], [1035, 1075], [1054, 1078]]`

## 10. Pre-registered hypotheses (exploratory mapping)

- **H5** (pHash TPR@1%FPR under geometric transformations < 50%): observed pHash geometric TPR = 57.0% (237/416); not supported.
- **H6** (hybrid ensemble improves TPR by >= 20 pp over pHash): classical-only ensemble gain = -1.6 pp. The pre-registered pHash+PDQ+DINOv2 ensemble was not built, so H6 is **not tested**; this number is exploratory only.

## 11. Scope and limitations

- **Dataset.** 80 public web photographs from Picsum (Unsplash). These are **not** Copydays, INRIA Holidays, Oxford5k, DiffusionDB or GenImage; there are no AIGC positives and no distribution shift test.
- **Methods.** Only classical 64-bit pHash, dHash, aHash, wHash and a mean-distance ensemble. **No PDQ, CLIP or DINOv2.** The pre-registered hybrid ensemble is not evaluated.
- **Pilot only.** One split, one seed, 32 test identities, 32 pairs per transformation. Wilson intervals are reported; per-transformation intervals are wide (small n) and overlapping.
- **Negative pairs** for test FPR come only from the 32 test identities (494 pairs), so the realised FPR at a 1% target is coarse; the validation threshold itself uses 1127 impostor pairs.
- **Transformations** are synthetic and fixed; rotation uses white fill, border adds a white frame, and combinations use one fixed order. No adversarial / bit-flip arm was run.
- **Conclusion scope.** These results do **not** establish AIGC-specific robustness, nor robustness on standard near-duplicate retrieval benchmarks. They are a pilot calibration for the full E8.

## 12. Files

- `e8_fingerprint.json` - full configuration, counts, metrics, CIs, seeds.
- `e8_per_transform.csv` - per-method, per-transformation TPR table.
- `e8_operating_points.png` - test operating points (optional plot).
- `images/` - 80 normalized original images.

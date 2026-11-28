#!/usr/bin/env python3
"""E8 - perceptual-hash robustness benchmark (pilot).

Downloads a small set of public web photographs (Picsum, sourced from
Unsplash), computes four 64-bit classical perceptual hashes from scratch
(pHash, dHash, aHash, wHash) plus a mean-distance ensemble, selects a
1%-FPR threshold on a validation split, and evaluates TPR/FPR/EER/AUC on a
held-out test split under 28 image transformations.

Scope warning: this is a pilot on 80 web photos. It is NOT a
Copydays / INRIA Holidays / Oxford5k / DiffusionDB / GenImage benchmark,
and it does not evaluate PDQ, CLIP or DINOv2. Results do not establish
AIGC-specific robustness.

Usage:
    python experiments/e8_fingerprint.py --n-images 80 --seed 1234
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import shutil
import sys
import time
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageOps
from scipy.fft import dct
from scipy.stats import rankdata

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "experiments" / "results" / "e8"
PICSUM_URL = "https://picsum.photos/seed/{seed}/{size}/{size}"
USER_AGENT = "Mozilla/5.0 (compatible; MetaTradeR-E8/1.0; research pilot)"
HASH_SIZE = 8
HASH_BITS = HASH_SIZE * HASH_SIZE
METHODS = ("phash", "dhash", "ahash", "whash")
SCORERS = METHODS + ("ensemble",)
METHOD_LABELS = {
    "phash": "pHash",
    "dhash": "dHash",
    "ahash": "aHash",
    "whash": "wHash",
    "ensemble": "Ensemble",
}
Z95 = 1.959963984540054


def log(msg: str) -> None:
    print(f"[e8] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Statistics helpers
# ---------------------------------------------------------------------------

def wilson_ci(k: int, n: int, z: float = Z95):
    """95% Wilson score interval for a binomial proportion."""
    if n <= 0:
        return (None, None)
    p = k / n
    denom = 1.0 + z * z / n
    centre = (p + z * z / (2.0 * n)) / denom
    half = z * math.sqrt(max(0.0, p * (1.0 - p) / n + z * z / (4.0 * n * n))) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def proportion(k: int, n: int) -> dict:
    lo, hi = wilson_ci(k, n)
    return {
        "numerator": int(k),
        "denominator": int(n),
        "rate": (k / n) if n else None,
        "ci95_wilson": [lo, hi],
    }


def select_threshold(pos_d: np.ndarray, neg_d: np.ndarray, target: float = 0.01):
    """Pick tau minimising |FPR - target| on the supplied (validation) data.

    Match rule is ``distance <= tau``.  Candidate thresholds are the observed
    negative distances plus one point below the minimum.  Ties are broken
    towards lower FPR (fewer false accusations) and then lower tau.
    """
    neg_sorted = np.sort(np.asarray(neg_d, dtype=np.float64))
    pos_sorted = np.sort(np.asarray(pos_d, dtype=np.float64))
    if neg_sorted.size == 0:
        raise ValueError("cannot select a threshold without negative pairs")
    cands = np.unique(neg_sorted)
    cands = np.concatenate([[cands[0] - 1e-9], cands])
    fpr = np.searchsorted(neg_sorted, cands, side="right") / neg_sorted.size
    tpr = np.searchsorted(pos_sorted, cands, side="right") / max(1, pos_sorted.size)
    diff = np.abs(fpr - target)
    order = np.lexsort((cands, fpr, diff))
    i = int(order[0])
    return float(cands[i]), float(fpr[i]), float(tpr[i])


def eer_and_threshold(pos_d: np.ndarray, neg_d: np.ndarray):
    """Equal error rate by threshold sweep with linear interpolation."""
    pos = np.sort(np.asarray(pos_d, dtype=np.float64))
    neg = np.sort(np.asarray(neg_d, dtype=np.float64))
    if pos.size == 0 or neg.size == 0:
        return None, None
    ts = np.unique(np.concatenate([pos, neg]))
    fpr = np.searchsorted(neg, ts, side="right") / neg.size
    tpr = np.searchsorted(pos, ts, side="right") / pos.size
    fnr = 1.0 - tpr
    diff = fpr - fnr
    for i in range(len(ts)):
        if diff[i] == 0.0:
            return float(fpr[i]), float(ts[i])
        if i > 0 and diff[i - 1] * diff[i] < 0.0:
            t = diff[i - 1] / (diff[i - 1] - diff[i])
            eer = fpr[i - 1] + t * (fpr[i] - fpr[i - 1])
            tau = ts[i - 1] + t * (ts[i] - ts[i - 1])
            return float(eer), float(tau)
    j = int(np.argmin(np.abs(diff)))
    return float(0.5 * (fpr[j] + fnr[j])), float(ts[j])


def rank_auc(pos_d: np.ndarray, neg_d: np.ndarray):
    """Rank-based AUC for distances (lower distance = more similar)."""
    pos = np.asarray(pos_d, dtype=np.float64)
    neg = np.asarray(neg_d, dtype=np.float64)
    n1, n2 = pos.size, neg.size
    if n1 == 0 or n2 == 0:
        return None
    scores = np.concatenate([-pos, -neg])
    ranks = rankdata(scores, method="average")
    r1 = float(np.sum(ranks[:n1]))
    return float((r1 - n1 * (n1 + 1) / 2.0) / (n1 * n2))


def roc_points(pos_d: np.ndarray, neg_d: np.ndarray, max_points: int = 200):
    """ROC sweep over observed distances, deterministically downsampled."""
    pos = np.sort(np.asarray(pos_d, dtype=np.float64))
    neg = np.sort(np.asarray(neg_d, dtype=np.float64))
    if pos.size == 0 or neg.size == 0:
        return {"threshold": [], "fpr": [], "tpr": []}
    ts = np.unique(np.concatenate([pos, neg]))
    fpr = np.searchsorted(neg, ts, side="right") / neg.size
    tpr = np.searchsorted(pos, ts, side="right") / pos.size
    if ts.size > max_points:
        idx = np.unique(np.round(np.linspace(0, ts.size - 1, max_points)).astype(int))
        ts, fpr, tpr = ts[idx], fpr[idx], tpr[idx]
    return {
        "threshold": [float(x) for x in ts],
        "fpr": [float(x) for x in fpr],
        "tpr": [float(x) for x in tpr],
    }


# ---------------------------------------------------------------------------
# Perceptual hashes (from scratch, numpy/PIL/scipy only)
# ---------------------------------------------------------------------------

def phash_bits(gray: Image.Image) -> np.ndarray:
    """32x32 grayscale DCT; 8x8 low-frequency block; DC excluded."""
    small = np.asarray(
        gray.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float64
    )
    coeff = dct(dct(small, axis=0, norm="ortho"), axis=1, norm="ortho")
    flat = coeff[:HASH_SIZE, :HASH_SIZE].reshape(-1)
    med = float(np.median(flat[1:]))
    bits = np.zeros(HASH_BITS, dtype=bool)
    bits[1:] = flat[1:] > med  # DC bit fixed to 0, 63 effective bits
    return bits


def dhash_bits(gray: Image.Image) -> np.ndarray:
    """9x8 resize; horizontal gradient gives 8x8 = 64 bits."""
    small = np.asarray(
        gray.resize((HASH_SIZE + 1, HASH_SIZE), Image.Resampling.LANCZOS),
        dtype=np.float64,
    )
    return (small[:, :-1] > small[:, 1:]).reshape(-1).astype(bool)


def ahash_bits(gray: Image.Image) -> np.ndarray:
    """8x8 resize; bit = pixel above the mean."""
    small = np.asarray(
        gray.resize((HASH_SIZE, HASH_SIZE), Image.Resampling.LANCZOS),
        dtype=np.float64,
    )
    return (small > small.mean()).reshape(-1).astype(bool)


def whash_bits(gray: Image.Image) -> np.ndarray:
    """32x32 DCT; 8x8 block thresholded at its own mean."""
    small = np.asarray(
        gray.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float64
    )
    coeff = dct(dct(small, axis=0, norm="ortho"), axis=1, norm="ortho")
    block = coeff[:HASH_SIZE, :HASH_SIZE]
    return (block > block.mean()).reshape(-1).astype(bool)


def compute_hashes(img: Image.Image) -> dict:
    gray = img.convert("L")
    return {
        "phash": phash_bits(gray),
        "dhash": dhash_bits(gray),
        "ahash": ahash_bits(gray),
        "whash": whash_bits(gray),
    }


def hamming(a: np.ndarray, b: np.ndarray) -> int:
    return int(np.count_nonzero(a != b))


# ---------------------------------------------------------------------------
# Transformations
# ---------------------------------------------------------------------------

def _array_to_image(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(arr, 0.0, 255.0).astype(np.uint8), mode="RGB")


def _apply_step(img: Image.Image, step: dict, rng: np.random.Generator) -> Image.Image:
    kind = step["kind"]
    p = step.get("params", {})
    out = img
    if kind == "jpeg":
        buf = io.BytesIO()
        out.save(buf, format="JPEG", quality=int(p["quality"]))
        buf.seek(0)
        with Image.open(buf) as tmp:
            out = tmp.convert("RGB")
    elif kind == "resize":
        factor = float(p["factor"])
        w, h = out.size
        out = out.resize(
            (max(1, round(w * factor)), max(1, round(h * factor))),
            Image.Resampling.LANCZOS,
        )
    elif kind == "crop":
        frac = float(p["fraction"])
        w, h = out.size
        dx, dy = int(round(w * frac)), int(round(h * frac))
        out = out.crop((dx, dy, w - dx, h - dy))
    elif kind == "rotate":
        out = out.rotate(
            float(p["degrees"]),
            resample=Image.Resampling.BICUBIC,
            expand=True,
            fillcolor=(255, 255, 255),
        )
    elif kind == "flip":
        out = ImageOps.mirror(out)
    elif kind == "border":
        frac = float(p["fraction"])
        w, h = out.size
        px = max(1, int(round(min(w, h) * frac)))
        out = ImageOps.expand(out, border=px, fill=(255, 255, 255))
    elif kind == "brightness":
        arr = np.asarray(out, dtype=np.float64) * float(p["factor"])
        out = _array_to_image(arr)
    elif kind == "contrast":
        arr = (np.asarray(out, dtype=np.float64) - 128.0) * float(p["factor"]) + 128.0
        out = _array_to_image(arr)
    elif kind == "noise":
        arr = np.asarray(out, dtype=np.float64)
        arr = arr + rng.normal(0.0, float(p["sigma"]), arr.shape)
        out = _array_to_image(arr)
    elif kind == "blur":
        import cv2  # local import: only needed for this branch

        arr = np.asarray(out, dtype=np.uint8)
        k = int(p["kernel"])
        out = Image.fromarray(cv2.GaussianBlur(arr, (k, k), 0), mode="RGB")
    else:
        raise ValueError(f"unknown transform kind: {kind!r}")
    return out


def apply_transform(img: Image.Image, steps: list, rng: np.random.Generator) -> Image.Image:
    out = img
    for step in steps:
        out = _apply_step(out, step, rng)
    return out


def _spec(name, family, geometric, steps):
    return {"name": name, "family": family, "geometric": geometric, "steps": steps}


def build_transforms() -> list:
    specs = []
    for q in (90, 70, 50, 30):
        specs.append(_spec(
            f"jpeg_q{q}", "jpeg", False,
            [{"kind": "jpeg", "params": {"quality": q}}],
        ))
    for factor in (0.5, 0.75, 1.5):
        tag = f"{factor:g}".replace(".", "")
        specs.append(_spec(
            f"resize_{factor:g}x", "resize", True,
            [{"kind": "resize", "params": {"factor": factor}}],
        ))
    for pct in (5, 10, 20):
        specs.append(_spec(
            f"crop_{pct}pct", "crop", True,
            [{"kind": "crop", "params": {"fraction": pct / 100.0}}],
        ))
    for angle in (5, -5, 15, -15):
        tag = f"p{angle}" if angle > 0 else f"m{abs(angle)}"
        specs.append(_spec(
            f"rotate_{tag}", "rotate", True,
            [{"kind": "rotate", "params": {"degrees": angle}}],
        ))
    specs.append(_spec("flip_h", "flip", True, [{"kind": "flip", "params": {}}]))
    for pct in (5, 10):
        specs.append(_spec(
            f"border_{pct}pct", "border", True,
            [{"kind": "border", "params": {"fraction": pct / 100.0}}],
        ))
    for sign, tag in ((1.2, "p20"), (0.8, "m20")):
        specs.append(_spec(
            f"brightness_{tag}", "brightness", False,
            [{"kind": "brightness", "params": {"factor": sign}}],
        ))
    for sign, tag in ((1.2, "p20"), (0.8, "m20")):
        specs.append(_spec(
            f"contrast_{tag}", "contrast", False,
            [{"kind": "contrast", "params": {"factor": sign}}],
        ))
    for sigma in (2, 5, 10):
        specs.append(_spec(
            f"noise_s{sigma}", "noise", False,
            [{"kind": "noise", "params": {"sigma": sigma}}],
        ))
    for k in (3, 5):
        specs.append(_spec(
            f"blur_{k}x{k}", "blur", False,
            [{"kind": "blur", "params": {"kernel": k}}],
        ))
    specs.append(_spec(
        "combo_jpeg50_resize75_noise5", "combo", False,
        [
            {"kind": "jpeg", "params": {"quality": 50}},
            {"kind": "resize", "params": {"factor": 0.75}},
            {"kind": "noise", "params": {"sigma": 5}},
        ],
    ))
    specs.append(_spec(
        "combo_crop10_rotate5_blur3", "combo", False,
        [
            {"kind": "crop", "params": {"fraction": 0.10}},
            {"kind": "rotate", "params": {"degrees": 5}},
            {"kind": "blur", "params": {"kernel": 3}},
        ],
    ))
    return specs


# ---------------------------------------------------------------------------
# Dataset download
# ---------------------------------------------------------------------------

def _fetch_one(seed: int, dest: Path, size: int, retries: int) -> dict:
    url = PICSUM_URL.format(seed=seed, size=size)
    errors = []
    for attempt in range(retries + 1):
        try:
            resp = requests.get(
                url,
                timeout=30,
                headers={"User-Agent": USER_AGENT},
                allow_redirects=True,
            )
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code}")
            if len(resp.content) < 1024:
                raise RuntimeError(f"body too small ({len(resp.content)} bytes)")
            with Image.open(io.BytesIO(resp.content)) as im:
                im.load()
                src_w, src_h = im.size
                src_format = im.format
                rgb = ImageOps.exif_transpose(im).convert("RGB")
            reencoded = not (src_format == "JPEG" and (src_w, src_h) == (size, size))
            if (src_w, src_h) != (size, size):
                rgb = rgb.resize((size, size), Image.Resampling.LANCZOS)
            path = dest / f"seed_{seed}.jpg"
            if reencoded:
                rgb.save(path, format="JPEG", quality=95)
            else:
                path.write_bytes(resp.content)
            return {
                "seed": seed,
                "ok": True,
                "path": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
                "url": url,
                "sha256_original_bytes": hashlib.sha256(resp.content).hexdigest(),
                "bytes_downloaded": len(resp.content),
                "src_size": [src_w, src_h],
                "src_format": src_format,
                "reencoded": reencoded,
                "attempts": attempt + 1,
            }
        except Exception as exc:  # recorded, never silently ignored
            errors.append(f"{type(exc).__name__}: {exc}")
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    return {
        "seed": seed,
        "ok": False,
        "url": url,
        "error": " | ".join(errors),
        "attempts": retries + 1,
    }


def download_dataset(seeds, dest: Path, size: int, retries: int, jobs: int):
    dest.mkdir(parents=True, exist_ok=True)
    results = {}
    with ThreadPoolExecutor(max_workers=max(1, jobs)) as pool:
        futures = {
            pool.submit(_fetch_one, seed, dest, size, retries): seed for seed in seeds
        }
        done = 0
        for fut in as_completed(futures):
            res = fut.result()
            results[res["seed"]] = res
            done += 1
            if not res["ok"]:
                log(f"download failed seed={res['seed']}: {res.get('error')}")
            if done % 20 == 0 or done == len(seeds):
                log(f"downloads finished: {done}/{len(seeds)}")
    return [results[s] for s in seeds]


def load_rgb512(path: Path) -> Image.Image:
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert("RGB")
        im.load()
        if im.size != (512, 512):
            im = im.resize((512, 512), Image.Resampling.LANCZOS)
        return im.copy()


def reuse_cached_dataset(seeds, dest: Path, size: int, manifest_path: Path):
    """Replay a previously downloaded dataset after validating its local cache."""
    manifest_path = manifest_path.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    dataset = manifest.get("dataset", {})
    if manifest.get("status") != "ok":
        raise ValueError(f"cached dataset manifest is not successful: {manifest_path}")
    if dataset.get("seeds") != seeds or dataset.get("image_size") != [size, size]:
        raise ValueError("cached dataset manifest does not match requested seeds and image size")

    records = {record.get("seed"): record for record in dataset.get("records", [])}
    dest.mkdir(parents=True, exist_ok=True)
    replayed = []
    root = REPO_ROOT.resolve()
    for seed in seeds:
        record = records.get(seed)
        if record is None:
            raise ValueError(f"cached dataset manifest has no record for seed {seed}")
        source = (root / record["path"]).resolve()
        try:
            source.relative_to(root)
        except ValueError as exc:
            raise ValueError(f"cached image path escapes repository for seed {seed}") from exc
        if not source.is_file():
            raise FileNotFoundError(f"cached image missing for seed {seed}: {source}")

        payload = source.read_bytes()
        cached_hash = hashlib.sha256(payload).hexdigest()
        if not record.get("reencoded", False) and cached_hash != record.get("sha256_original_bytes"):
            raise ValueError(f"cached image hash mismatch for seed {seed}")
        with Image.open(io.BytesIO(payload)) as image:
            image.load()
            normalized = ImageOps.exif_transpose(image)
            if normalized.size != (size, size):
                raise ValueError(f"cached image has unexpected dimensions for seed {seed}")

        target = dest / f"seed_{seed}.jpg"
        if source != target.resolve():
            shutil.copyfile(source, target)
        replayed.append({
            **record,
            "ok": True,
            "path": str(target.relative_to(root)).replace("\\", "/"),
            "cached_sha256": cached_hash,
            "cache_manifest": str(manifest_path.relative_to(root)).replace("\\", "/"),
        })
    return replayed


# ---------------------------------------------------------------------------
# Evaluation helpers
# ---------------------------------------------------------------------------

def distances_for_pairs(hashes: dict, pairs: list) -> dict:
    out = {m: np.zeros(len(pairs), dtype=np.int32) for m in METHODS}
    for idx, (ka, kb) in enumerate(pairs):
        ha, hb = hashes[ka], hashes[kb]
        for m in METHODS:
            out[m][idx] = hamming(ha[m], hb[m])
    out["ensemble"] = np.mean(
        [out[m].astype(np.float64) / float(HASH_BITS) for m in METHODS], axis=0
    )
    return out


def distinct_pairs(ids, sha_by_id):
    pairs = []
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if sha_by_id[a] == sha_by_id[b]:
                continue
            pairs.append((("orig", a), ("orig", b)))
    return pairs


def cap_pairs(pairs, cap: int, rng: np.random.Generator):
    if len(pairs) <= cap:
        return pairs, False
    idx = np.sort(rng.choice(len(pairs), size=cap, replace=False))
    return [pairs[i] for i in idx], True


def per_transform_metrics(pos_d, meta, tau, names, error_counts):
    out = {}
    for name in names:
        idx = np.array([i for i, (_, t) in enumerate(meta) if t == name], dtype=int)
        d = pos_d[idx]
        tp = int(np.count_nonzero(d <= tau))
        n = int(d.size)
        lo, hi = wilson_ci(tp, n)
        out[name] = {
            "n": n,
            "true_positives": tp,
            "tpr": (tp / n) if n else None,
            "ci95_wilson": [lo, hi],
            "n_transform_errors": int(error_counts.get(name, 0)),
        }
    return out


def jsonable(obj):
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def package_version(name: str) -> str:
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return "unknown"


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run(args) -> dict:
    t0 = time.perf_counter()
    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = REPO_ROOT / out_dir
    images_dir = out_dir / "images"
    out_dir.mkdir(parents=True, exist_ok=True)
    transforms = build_transforms()
    tnames = [t["name"] for t in transforms]

    seeds = list(range(args.seed_start, args.seed_start + args.n_images))
    acquisition_mode = "cached_local_replay" if args.offline_manifest else "live_download"
    if args.offline_manifest:
        log(f"replaying cached images for {len(seeds)} seeds from {args.offline_manifest}")
    else:
        log(f"downloading {len(seeds)} images (seeds {seeds[0]}..{seeds[-1]})")
    dl0 = time.perf_counter()
    records = (
        reuse_cached_dataset(seeds, images_dir, 512, Path(args.offline_manifest))
        if args.offline_manifest
        else download_dataset(seeds, images_dir, 512, 2, args.jobs)
    )
    download_seconds = time.perf_counter() - dl0
    ok = [r for r in records if r["ok"]]
    failed = [r for r in records if not r["ok"]]
    log(f"dataset: {len(ok)} available, {len(failed)} failed, acquisition {download_seconds:.1f}s")

    if len(ok) < args.min_images:
        failure = {
            "experiment": "E8",
            "status": "FAILED_DATASET",
            "reason": (
                f"only {len(ok)} of {len(seeds)} images available; "
                f"minimum required is {args.min_images}"
            ),
            "dataset": {
                "requested": len(seeds),
                "available": len(ok),
                "acquisition_mode": acquisition_mode,
                "failed": jsonable(failed),
            },
            "generated_utc": datetime.now(timezone.utc).isoformat(),
        }
        (out_dir / "e8_fingerprint.json").write_text(
            json.dumps(jsonable(failure), indent=2), encoding="utf-8"
        )
        log(failure["reason"])
        raise SystemExit(1)

    ids = sorted(r["seed"] for r in ok)
    sha_by_id = {r["seed"]: r["sha256_original_bytes"] for r in ok}
    images = {seed: load_rgb512(REPO_ROOT / r["path"]) for seed, r in
              ((r["seed"], r) for r in ok)}

    # Duplicate content check (identical bytes would be fake negatives).
    sha_groups = {}
    for seed in ids:
        sha_groups.setdefault(sha_by_id[seed], []).append(seed)
    dup_groups = [v for v in sha_groups.values() if len(v) > 1]

    # Identity-level split: 40% calibration / 20% validation / 40% test.
    split_rng = np.random.default_rng(args.seed)
    perm = split_rng.permutation(len(ids))
    n_total = len(ids)
    n_cal = int(round(0.4 * n_total))
    n_val = int(round(0.2 * n_total))
    cal_ids = sorted(ids[i] for i in perm[:n_cal])
    val_ids = sorted(ids[i] for i in perm[n_cal:n_cal + n_val])
    test_ids = sorted(ids[i] for i in perm[n_cal + n_val:])
    assert len(set(cal_ids) | set(val_ids) | set(test_ids)) == n_total
    log(f"splits: calibration={len(cal_ids)} validation={len(val_ids)} "
        f"test={len(test_ids)}")

    # Original hashes for every available identity.
    orig_hashes = {}
    for seed in ids:
        orig_hashes[("orig", seed)] = compute_hashes(images[seed])
    hashes = dict(orig_hashes)

    # Transformed hashes for validation + test identities.
    test_id_set = set(test_ids)
    error_records = []
    error_counts = {}  # transform -> errors on test identities only
    for seed in sorted(set(val_ids) | set(test_ids)):
        for spec in transforms:
            rng = np.random.default_rng(
                [args.seed, seed, zlib.crc32(spec["name"].encode("utf-8"))]
            )
            try:
                timg = apply_transform(images[seed], spec["steps"], rng)
                hashes[("tf", seed, spec["name"])] = compute_hashes(timg)
            except Exception as exc:
                error_records.append({
                    "identity_seed": seed,
                    "transform": spec["name"],
                    "stage": "transform_or_hash",
                    "error": f"{type(exc).__name__}: {exc}",
                })
                if seed in test_id_set:
                    error_counts[spec["name"]] = error_counts.get(spec["name"], 0) + 1
    if error_records:
        log(f"transform/hash errors: {len(error_records)} (recorded in JSON)")
    else:
        log("transform/hash errors: none")

    # Pairs.
    val_meta = []
    val_pairs = []
    for seed in val_ids:
        for name in tnames:
            key = ("tf", seed, name)
            if key in hashes:
                val_meta.append((seed, name))
                val_pairs.append((("orig", seed), key))
    test_meta = []
    test_pairs = []
    for seed in test_ids:
        for name in tnames:
            key = ("tf", seed, name)
            if key in hashes:
                test_meta.append((seed, name))
                test_pairs.append((("orig", seed), key))

    global_pairs_all = distinct_pairs(ids, sha_by_id)
    val_neg_pairs = distinct_pairs(sorted(cal_ids + val_ids), sha_by_id)
    val_neg_pairs_only = distinct_pairs(val_ids, sha_by_id)
    test_neg_pairs = distinct_pairs(test_ids, sha_by_id)
    neg_rng = np.random.default_rng(args.seed + 1)
    test_neg_pairs, test_neg_capped = cap_pairs(test_neg_pairs, args.max_neg_pairs, neg_rng)
    val_neg_pairs, val_neg_capped = cap_pairs(val_neg_pairs, args.max_neg_pairs, neg_rng)
    val_neg_pairs_only, _ = cap_pairs(val_neg_pairs_only, args.max_neg_pairs, neg_rng)

    log(f"pairs: val_pos={len(val_pairs)} val_neg={len(val_neg_pairs)} "
        f"test_pos={len(test_pairs)} test_neg={len(test_neg_pairs)}")

    val_d = distances_for_pairs(hashes, val_pairs)
    test_d = distances_for_pairs(hashes, test_pairs)
    val_neg_d = distances_for_pairs(hashes, val_neg_pairs)
    val_neg_only_d = distances_for_pairs(hashes, val_neg_pairs_only)
    test_neg_d = distances_for_pairs(hashes, test_neg_pairs)

    geometric_names = {t["name"] for t in transforms if t["geometric"]}
    geo_idx = np.array(
        [i for i, (_, t) in enumerate(test_meta) if t in geometric_names], dtype=int
    )

    methods_out = {}
    for m in SCORERS:
        vpos = val_d[m]
        vneg = val_neg_d[m]
        tau, vfpr, vtpr = select_threshold(vpos, vneg, args.target_fpr)
        tp = int(np.count_nonzero(test_d[m] <= tau))
        npos = int(test_d[m].size)
        fp = int(np.count_nonzero(test_neg_d[m] <= tau))
        nneg = int(test_neg_d[m].size)
        eer, eer_tau = eer_and_threshold(test_d[m], test_neg_d[m])
        auc = rank_auc(test_d[m], test_neg_d[m])
        pt = per_transform_metrics(
            test_d[m], test_meta, tau, tnames, error_counts
        )
        roc = roc_points(test_d[m], test_neg_d[m])

        geo_d = test_d[m][geo_idx] if geo_idx.size else np.array([])
        geo_tp = int(np.count_nonzero(geo_d <= tau))
        geo_n = int(geo_d.size)

        # Sensitivity: threshold chosen with validation-split negatives only.
        tau_alt, vfpr_alt, vtpr_alt = select_threshold(
            vpos, val_neg_only_d[m], args.target_fpr
        )
        alt_tp = int(np.count_nonzero(test_d[m] <= tau_alt))
        alt_fp = int(np.count_nonzero(test_neg_d[m] <= tau_alt))

        methods_out[m] = {
            "threshold": tau,
            "validation": {
                "target_fpr": args.target_fpr,
                "achieved_fpr": proportion(
                    int(round(vfpr * vneg.size)), vneg.size
                ),
                "tpr": proportion(int(round(vtpr * vpos.size)), vpos.size),
                "n_positive_pairs": int(vpos.size),
                "n_negative_pairs": int(vneg.size),
                "negative_scope": "distinct-identity pairs within calibration+validation",
            },
            "test": {
                "tpr_overall": proportion(tp, npos),
                "fpr": proportion(fp, nneg),
                "eer": eer,
                "eer_threshold": eer_tau,
                "auc": auc,
                "geometric_tpr": proportion(geo_tp, geo_n),
                "per_transform": pt,
                "roc_curve": roc,
            },
            "threshold_sensitivity_validation_only_negatives": {
                "threshold": tau_alt,
                "validation_fpr": proportion(int(round(vfpr_alt * val_neg_only_d[m].size)),
                                             val_neg_only_d[m].size),
                "validation_tpr": proportion(int(round(vtpr_alt * vpos.size)), vpos.size),
                "test_tpr": proportion(alt_tp, npos),
                "test_fpr": proportion(alt_fp, nneg),
            },
        }

    checks = {
        "splits_disjoint": not (set(cal_ids) & set(val_ids)
                                or set(cal_ids) & set(test_ids)
                                or set(val_ids) & set(test_ids)),
        "split_sizes_sum_to_downloaded": (
            len(cal_ids) + len(val_ids) + len(test_ids) == n_total
        ),
        "test_positive_pairs": len(test_pairs),
        "test_positive_pairs_expected": len(test_ids) * len(tnames),
        "per_transform_denominators_equal": len({
            v["n"] for v in methods_out["phash"]["test"]["per_transform"].values()
        }) == 1,
        "per_transform_sum_equals_overall": all(
            sum(v["n"] for v in methods_out[m]["test"]["per_transform"].values())
            == methods_out[m]["test"]["tpr_overall"]["denominator"]
            for m in SCORERS
        ),
        "threshold_selected_on_test": False,
        "duplicate_content_groups": dup_groups,
    }
    if not all([
        checks["splits_disjoint"],
        checks["split_sizes_sum_to_downloaded"],
        checks["per_transform_denominators_equal"],
        checks["per_transform_sum_equals_overall"],
    ]):
        raise RuntimeError(f"internal consistency check failed: {checks}")

    eval_seconds = time.perf_counter() - t0 - download_seconds
    result = {
        "experiment": "E8",
        "title": "Perceptual-hash robustness benchmark (pilot)",
        "status": "ok",
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "command": " ".join([Path(sys.executable).name] + sys.argv),
        "runtime_seconds": {
            "download": round(download_seconds, 3),
            "evaluation": round(eval_seconds, 3),
            "total_before_outputs": round(time.perf_counter() - t0, 3),
        },
        "environment": {
            "python": sys.version.split()[0],
            "numpy": np.__version__,
            "pillow": package_version("pillow"),
            "scipy": package_version("scipy"),
            "opencv": package_version("opencv-python"),
            "matplotlib": package_version("matplotlib"),
            "requests": package_version("requests"),
            "platform": sys.platform,
        },
        "config": {
            "n_images_requested": args.n_images,
            "seed": args.seed,
            "seed_start": args.seed_start,
            "out_dir": str(out_dir),
            "target_fpr": args.target_fpr,
            "max_negative_pairs": args.max_neg_pairs,
            "hash_bits": HASH_BITS,
            "hash_specs": {
                "phash": (
                    "32x32 grayscale DCT-II (ortho); top-left 8x8; median of 63 "
                    "non-DC coefficients; DC bit fixed to 0"
                ),
                "dhash": "resize 9x8 grayscale; horizontal gradient (8x8 bits)",
                "ahash": "resize 8x8 grayscale; threshold = mean pixel value",
                "whash": "32x32 grayscale DCT-II; top-left 8x8; threshold = mean coefficient",
                "ensemble": (
                    "unweighted mean of the four per-hash Hamming distances "
                    "divided by 64"
                ),
            },
            "matching_rule": "distance <= threshold",
            "transforms": transforms,
            "rotation_convention": "PIL rotate; positive = counter-clockwise, expand=True, white fill",
        },
        "dataset": {
            "source": "Picsum Photos (https://picsum.photos), photographs from Unsplash",
            "requested": len(seeds),
            "downloaded": len(ok) if acquisition_mode == "live_download" else 0,
            "reused": len(ok) if acquisition_mode == "cached_local_replay" else 0,
            "available": len(ok),
            "acquisition_mode": acquisition_mode,
            "failed_count": len(failed),
            "seeds": ids,
            "failed": failed,
            "image_size": [512, 512],
            "note": (
                "Pilot convenience sample of web photographs, not a benchmark "
                "dataset; no AIGC images."
            ),
            "records": [{k: v for k, v in r.items() if k != "ok"} for r in ok],
        },
        "splits": {
            "method": "identity-level random split, numpy default_rng(seed)",
            "fractions": {"calibration": 0.4, "validation": 0.2, "test": 0.4},
            "calibration": cal_ids,
            "validation": val_ids,
            "test": test_ids,
            "counts": {
                "calibration": len(cal_ids),
                "validation": len(val_ids),
                "test": len(test_ids),
            },
        },
        "pairs": {
            "global_distinct_identity_pairs": len(global_pairs_all),
            "validation_positives": len(val_pairs),
            "validation_negatives": len(val_neg_pairs),
            "validation_negatives_only": len(val_neg_pairs_only),
            "test_positives": len(test_pairs),
            "test_negatives": len(test_neg_pairs),
            "test_negatives_capped": bool(test_neg_capped),
            "validation_negatives_capped": bool(val_neg_capped),
        },
        "methods": methods_out,
        "transform_errors": error_records,
        "checks": checks,
    }
    return result


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

def write_csv(result: dict, path: Path) -> None:
    rows = []
    for m in SCORERS:
        r = result["methods"][m]
        tau = r["threshold"]
        overall = r["test"]["tpr_overall"]
        rows.append({
            "method": m,
            "transformation": "ALL",
            "threshold": f"{tau:.6f}",
            "n_positive_pairs": overall["denominator"],
            "true_positives": overall["numerator"],
            "tpr": f"{overall['rate']:.6f}" if overall["rate"] is not None else "",
            "ci95_low": f"{overall['ci95_wilson'][0]:.6f}",
            "ci95_high": f"{overall['ci95_wilson'][1]:.6f}",
            "n_transform_errors": "",
        })
        for t in [s["name"] for s in result["config"]["transforms"]]:
            e = r["test"]["per_transform"][t]
            rows.append({
                "method": m,
                "transformation": t,
                "threshold": f"{tau:.6f}",
                "n_positive_pairs": e["n"],
                "true_positives": e["true_positives"],
                "tpr": f"{e['tpr']:.6f}" if e["tpr"] is not None else "",
                "ci95_low": f"{e['ci95_wilson'][0]:.6f}" if e["ci95_wilson"][0] is not None else "",
                "ci95_high": f"{e['ci95_wilson'][1]:.6f}" if e["ci95_wilson"][1] is not None else "",
                "n_transform_errors": e["n_transform_errors"],
            })
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            "method", "transformation", "threshold", "n_positive_pairs",
            "true_positives", "tpr", "ci95_low", "ci95_high", "n_transform_errors",
        ])
        writer.writeheader()
        writer.writerows(rows)


def write_plot(result: dict, path: Path) -> bool:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6.2, 5.2))
    for m in SCORERS:
        curve = result["methods"][m]["test"]["roc_curve"]
        ax.plot(curve["fpr"], curve["tpr"], linewidth=1.4,
                label=f"{METHOD_LABELS[m]} (AUC={result['methods'][m]['test']['auc']:.3f})")
        tpr = result["methods"][m]["test"]["tpr_overall"]["rate"]
        fpr = result["methods"][m]["test"]["fpr"]["rate"]
        ax.scatter([fpr], [tpr], s=28, zorder=3)
    ax.plot([0, 1], [0, 1], linestyle=":", color="grey", linewidth=1)
    ax.set_xlabel("False positive rate (test)")
    ax.set_ylabel("True positive rate (test, pooled transforms)")
    ax.set_title("E8 pilot: ROC at validation-selected 1% FPR (dots)")
    ax.set_xlim(-0.002, 0.15)
    ax.set_ylim(0, 1.02)
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8, loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return True


def fmt_pct(k: int, n: int, digits: int = 1) -> str:
    if n == 0:
        return "n/a"
    return f"{100.0 * k / n:.{digits}f}%"


def fmt_ci(prop: dict, digits: int = 1) -> str:
    lo, hi = prop["ci95_wilson"]
    if prop["rate"] is None or lo is None:
        return "n/a"
    return (f"{100.0 * prop['rate']:.{digits}f}% "
            f"[{100.0 * lo:.{digits}f}, {100.0 * hi:.{digits}f}]")


def build_report(result: dict) -> str:
    ds = result["dataset"]
    sp = result["splits"]
    pr = result["pairs"]
    methods = result["methods"]
    tnames = [t["name"] for t in result["config"]["transforms"]]
    lines = []
    add = lines.append

    add("# E8 - Perceptual-hash robustness (pilot)")
    add("")
    add(f"Generated (UTC): `{result['generated_utc']}`")
    add("")
    add(f"Command: `{result['command']}`")
    add("")
    add(f"Runtime: data acquisition {result['runtime_seconds']['download']:.1f}s, "
        f"evaluation {result['runtime_seconds']['evaluation']:.1f}s.")
    add("")
    add("> **Scope.** Pilot on "
        f"{ds['available']} public web photographs (Picsum/Unsplash). "
        "This is **not** Copydays, INRIA Holidays, Oxford5k, DiffusionDB or "
        "GenImage, and it does **not** evaluate PDQ, CLIP or DINOv2. Results "
        "do not establish AIGC-specific robustness. See Scope and Limitations.")
    add("")
    add("## 1. Dataset")
    add("")
    add(f"- Source: {ds['source']}.")
    if ds["acquisition_mode"] == "cached_local_replay":
        add(f"- Replayed **{ds['reused']}** cached images from the prior manifest; "
            f"no network download was attempted (failed: {ds['failed_count']}).")
        add("- Cached source images are local inputs and are not tracked in the repository; "
            "a fresh checkout needs a local cache or network access for acquisition.")
    else:
        add(f"- Requested {ds['requested']} seeds; downloaded **{ds['downloaded']}** "
            f"(failed: {ds['failed_count']}).")
    add(f"- Seeds: {ds['seeds'][0]}..{ds['seeds'][-1]} (contiguous, "
        f"n={len(ds['seeds'])}), size 512x512 RGB JPEG.")
    add(f"- Global distinct-identity pairs: {pr['global_distinct_identity_pairs']}.")
    add("")
    add("## 2. Splits")
    add("")
    add("Identity-level random split (`numpy.random.default_rng(1234)`), "
        "40/20/40. Each identity appears in exactly one split.")
    add("")
    add("| Split | Identities | Role |")
    add("|---|---:|---|")
    add(f"| Calibration | {sp['counts']['calibration']} | Reserved; used only as "
        "extra impostors for threshold estimation, never for evaluation |")
    add(f"| Validation | {sp['counts']['validation']} | Threshold selection "
        f"(target FPR = {100 * result['config']['target_fpr']:.0f}%) |")
    add(f"| Test | {sp['counts']['test']} | Held-out evaluation only |")
    add("")
    add("## 3. Protocol")
    add("")
    add(f"- Hashes: 64-bit pHash, dHash, aHash, wHash, plus an unweighted "
        f"ensemble of normalised Hamming distances.")
    add(f"- Positive pairs: original vs transformed, {pr['validation_positives']} "
        f"on validation and {pr['test_positives']} on test "
        f"({len(tnames)} transformations per identity, 512x512 originals).")
    add(f"- Negative pairs: distinct identities only. Validation threshold "
        f"negatives = {pr['validation_negatives']} (calibration+validation); "
        f"test FPR negatives = {pr['test_negatives']} (test identities only). "
        f"Cap {result['config']['max_negative_pairs']} not reached.")
    add("- Match rule: `distance <= tau`. Threshold picked on validation at "
        "FPR closest to 1% (ties: lower FPR, then lower tau).")
    add("- TPR overall pools all transformation pairs; per-transformation TPR "
        f"uses {sp['counts']['test']} test identities each.")
    add("")
    add("## 4. Thresholds selected on validation")
    add("")
    add("| Method | tau | Validation FPR | Validation TPR | val pos | val neg |")
    add("|---|---:|---:|---:|---:|---:|")
    for m in SCORERS:
        r = methods[m]
        add(f"| {METHOD_LABELS[m]} | {r['threshold']:.4g} | "
            f"{fmt_pct(r['validation']['achieved_fpr']['numerator'], r['validation']['achieved_fpr']['denominator'], 2)} "
            f"| {fmt_pct(r['validation']['tpr']['numerator'], r['validation']['tpr']['denominator'])} "
            f"| {r['validation']['n_positive_pairs']} "
            f"| {r['validation']['n_negative_pairs']} |")
    add("")
    add("## 5. Test results at the validation-selected threshold")
    add("")
    add(f"Positive pairs: {pr['test_positives']}; negative pairs: "
        f"{pr['test_negatives']}. CIs are 95% Wilson.")
    add("")
    add("| Method | TPR@1%FPR (95% CI) | Test FPR (95% CI) | EER | AUC |")
    add("|---|---|---|---:|---:|")
    for m in SCORERS:
        t = methods[m]["test"]
        add(f"| {METHOD_LABELS[m]} | {fmt_ci(t['tpr_overall'])} "
            f"({t['tpr_overall']['numerator']}/{t['tpr_overall']['denominator']}) "
            f"| {fmt_ci(t['fpr'], 2)} "
            f"({t['fpr']['numerator']}/{t['fpr']['denominator']}) "
            f"| {100 * t['eer']:.1f}% | {t['auc']:.4f} |")
    add("")
    add(f"Geometric-only subset (resize, crop, rotate, flip, border; "
        f"{methods['phash']['test']['geometric_tpr']['denominator']} pairs):")
    add("")
    add("| Method | Geometric TPR |")
    add("|---|---:|")
    for m in SCORERS:
        g = methods[m]["test"]["geometric_tpr"]
        add(f"| {METHOD_LABELS[m]} | {fmt_pct(g['numerator'], g['denominator'])} "
            f"({g['numerator']}/{g['denominator']}) |")
    add("")
    add("## 6. Per-transformation TPR (test)")
    add("")
    add("Cells show TPR and true-positives/denominator.")
    add("")
    header = "| Transformation | n | " + " | ".join(
        METHOD_LABELS[m] for m in SCORERS
    ) + " |"
    add(header)
    add("|---|---:|" + "---:|" * len(SCORERS))
    for t in tnames:
        n = methods["phash"]["test"]["per_transform"][t]["n"]
        cells = []
        for m in SCORERS:
            e = methods[m]["test"]["per_transform"][t]
            cells.append(f"{100 * e['tpr']:.1f} ({e['true_positives']}/{e['n']})"
                         if e["tpr"] is not None else "n/a")
        add(f"| {t} | {n} | " + " | ".join(cells) + " |")
    add("")
    add("## 7. Hardest transformations (ensemble TPR)")
    add("")
    ranked = sorted(
        ((t, methods["ensemble"]["test"]["per_transform"][t]) for t in tnames),
        key=lambda kv: (kv[1]["tpr"] if kv[1]["tpr"] is not None else 2.0, kv[0]),
    )
    for t, e in ranked[:3]:
        add(f"- `{t}`: {fmt_pct(e['true_positives'], e['n'])} "
            f"({e['true_positives']}/{e['n']})")
    add("")
    add("## 8. Errors")
    add("")
    if not result["transform_errors"]:
        add("None. All transformations and hashes completed for every "
            "validation/test identity.")
    else:
        add(f"{len(result['transform_errors'])} recorded errors:")
        add("")
        add("| Identity seed | Transformation | Stage | Error |")
        add("|---:|---|---|---|")
        for e in result["transform_errors"]:
            add(f"| {e['identity_seed']} | {e['transform']} | {e['stage']} "
                f"| {e['error']} |")
    add("")
    add("## 9. Consistency checks")
    add("")
    for k, v in result["checks"].items():
        add(f"- `{k}`: `{v}`")
    add("")
    add("## 10. Pre-registered hypotheses (exploratory mapping)")
    add("")
    ph = methods["phash"]
    en = methods["ensemble"]
    geo = ph["test"]["geometric_tpr"]
    add(f"- **H5** (pHash TPR@1%FPR under geometric transformations < 50%): "
        f"observed pHash geometric TPR = "
        f"{fmt_pct(geo['numerator'], geo['denominator'])} "
        f"({geo['numerator']}/{geo['denominator']}); "
        f"{'consistent with H5' if (geo['rate'] or 0) < 0.5 else 'not supported'}.")
    gain = (en["test"]["tpr_overall"]["rate"] or 0) - (
        ph["test"]["tpr_overall"]["rate"] or 0
    )
    add(f"- **H6** (hybrid ensemble improves TPR by >= 20 pp over pHash): "
        f"classical-only ensemble gain = {100 * gain:+.1f} pp. The "
        f"pre-registered pHash+PDQ+DINOv2 ensemble was not built, so H6 is "
        f"**not tested**; this number is exploratory only.")
    add("")
    add("## 11. Scope and limitations")
    add("")
    add("- **Dataset.** 80 public web photographs from Picsum (Unsplash). "
        "These are **not** Copydays, INRIA Holidays, Oxford5k, DiffusionDB or "
        "GenImage; there are no AIGC positives and no distribution shift test.")
    add("- **Methods.** Only classical 64-bit pHash, dHash, aHash, wHash and a "
        "mean-distance ensemble. **No PDQ, CLIP or DINOv2.** The pre-registered "
        "hybrid ensemble is not evaluated.")
    add("- **Pilot only.** One split, one seed, "
        f"{sp['counts']['test']} test identities, "
        f"{sp['counts']['test']} pairs per transformation. Wilson intervals "
        "are reported; per-transformation intervals are wide (small n) and "
        "overlapping.")
    add("- **Negative pairs** for test FPR come only from the "
        f"{sp['counts']['test']} test identities "
        f"({pr['test_negatives']} pairs), so the realised FPR at a 1% target "
        f"is coarse; the validation threshold itself uses "
        f"{pr['validation_negatives']} impostor pairs.")
    add("- **Transformations** are synthetic and fixed; rotation uses white "
        "fill, border adds a white frame, and combinations use one fixed order. "
        "No adversarial / bit-flip arm was run.")
    add("- **Conclusion scope.** These results do **not** establish "
        "AIGC-specific robustness, nor robustness on standard near-duplicate "
        "retrieval benchmarks. They are a pilot calibration for the full E8.")
    add("")
    add("## 12. Files")
    add("")
    add("- `e8_fingerprint.json` - full configuration, counts, metrics, CIs, seeds.")
    add("- `e8_per_transform.csv` - per-method, per-transformation TPR table.")
    add("- `e8_operating_points.png` - test operating points (optional plot).")
    add(f"- `images/` - {ds['available']} normalized original images.")
    add("")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="E8 pilot: perceptual-hash robustness benchmark."
    )
    parser.add_argument("--n-images", type=int, default=80,
                        help="number of Picsum seeds to request (default 80)")
    parser.add_argument("--seed", type=int, default=1234,
                        help="split/evaluation seed (default 1234)")
    parser.add_argument("--seed-start", type=int, default=1000,
                        help="first Picsum seed (default 1000)")
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT),
                        help="output directory (default experiments/results/e8)")
    parser.add_argument("--offline-manifest", type=str, default=None,
                        help="replay a cached dataset from a successful E8 manifest")
    parser.add_argument("--min-images", type=int, default=60,
                        help="abort if fewer images download (default 60)")
    parser.add_argument("--jobs", type=int, default=6,
                        help="parallel download workers (default 6)")
    parser.add_argument("--max-neg-pairs", type=int, default=5000,
                        help="cap on negative pairs per split (default 5000)")
    parser.add_argument("--target-fpr", type=float, default=0.01,
                        help="validation FPR target (default 0.01)")
    parser.add_argument("--no-plot", action="store_true",
                        help="skip the operating-point PNG")
    args = parser.parse_args(argv)

    if args.n_images < args.min_images:
        log(f"n-images ({args.n_images}) < min-images ({args.min_images}); "
            "dataset gate will fail by design")

    result = run(args)
    out_dir = Path(result["config"]["out_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / "e8_fingerprint.json"
    csv_path = out_dir / "e8_per_transform.csv"
    png_path = out_dir / "e8_operating_points.png"
    report_path = out_dir / "E8_REPORT.md"

    json_path.write_text(
        json.dumps(jsonable(result), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_csv(result, csv_path)
    if not args.no_plot:
        write_plot(result, png_path)
    report_path.write_text(build_report(result), encoding="utf-8")

    total = result["runtime_seconds"]["total_before_outputs"]
    log(f"wrote {json_path}")
    log(f"wrote {csv_path}")
    if not args.no_plot:
        log(f"wrote {png_path}")
    log(f"wrote {report_path}")
    for m in SCORERS:
        t = result["methods"][m]["test"]
        p = t["tpr_overall"]
        log(f"{METHOD_LABELS[m]}: TPR={100 * p['rate']:.1f}% "
            f"({p['numerator']}/{p['denominator']}), "
            f"FPR={100 * t['fpr']['rate']:.2f}%, AUC={t['auc']:.4f}, "
            f"EER={100 * t['eer']:.1f}%")
    log(f"total runtime (pre-outputs): {total:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())

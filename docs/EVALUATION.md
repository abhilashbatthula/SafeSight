# Model and application evaluation

## Inference claims

The shipped default is DEMO. `make_fixtures.py` produces two original schematic illustrations and fixed annotations (CC0); RGB-pixel SHA-256 matching permits only those exact sample pixels. Arbitrary uploads return a useful unavailable-REAL-model failure. Metadata changes alone cannot turn arbitrary content into a matching fixture. REAL never falls back to DEMO.

REAL is implemented via Ultralytics YOLO on a configurable local PPE-trained path. Startup requires documented version/license/provenance and person/helmet/vest labels. Generic COCO weights are rejected. CPU is the default. No model weights, held-out images or real accuracy measurements were supplied. See THIRD_PARTY.md for investigated model candidates and provenance limitations. Model confidence is not an accuracy metric.

## Person/equipment association

Boxes are xyxy pixel coordinates in EXIF-normalized source image space. Confident persons (≥0.5) receive image-local Person N references. A helmet or explicit no-helmet box center must fall within one person's upper 40%; vest/no-vest centers within 20–80%. Confidence must be ≥0.5. More than one candidate is ambiguous and remains unassigned. Contradictory positive/negative evidence remains unknown. Missing explicit negative evidence is unknown, never inferred absence. Cropped persons cannot produce missing-PPE conclusions. Positive detections do not establish certified compliance. Occlusion cannot be reliably detected from boxes, so human review is mandatory for suspected absence. No confident persons means no compliance conclusion.

Automated matching checks cover positive association, explicit negative evidence, missing equipment, no person, low confidence, crop, ambiguous overlap and contradictory labels. They verify the conservative business method, not real model accuracy.

## Enabling and evaluating REAL

Create a separate Python 3.12/3.13 virtual environment if PyTorch lacks Python 3.14 wheels. Install `requirements-real.txt`; pin the resolved CPU Torch stack in your environment. Do not load untrusted `.pt` pickle files. Obtain the licensed PPE-trained weights from their author, record revision, SHA-256, model/dataset license and exact label map.

```bash
python3.13 -m venv .venv-real
.venv-real/bin/pip install -r services/inference/requirements-real.txt
# Configure INFERENCE_MODE=REAL, MODEL_PATH (absolute), MODEL_VERSION,
# MODEL_LICENSE, MODEL_PROVENANCE in .env; use this interpreter for inference.
```

`INFERENCE_PYTHON` can select `.venv-real/bin/python` for `pnpm dev`. No weights are automatically downloaded by SafeSight. The investigated model author's opt-in download procedure is linked in THIRD_PARTY.md; only adopt it after checking the model and dataset terms. The model card's absence-based vest inference is not used by this application.

For a properly licensed local dataset YAML with site-separated train/val/test splits:

```bash
.venv-real/bin/yolo detect train model=/absolute/path/to/ppe-trained.pt data=/absolute/path/to/ppe.yaml epochs=50 imgsz=640 device=cpu
.venv-real/bin/yolo detect val model=/absolute/path/to/best.pt data=/absolute/path/to/ppe.yaml split=test device=cpu
```

Hold out independent facilities/cameras, deduplicate source images, and annotate person, helmet, vest plus explicit negatives if supported. Report per-class precision/recall/AP, association mistakes, false suspected violations, unknown coverage, CPU latency, and error distributions by crop/occlusion/lighting/distance. Evaluate human-corrected review outcomes separately from raw model results. A test set must not contain the shipped schematic fixtures or training images. No deployment accuracy threshold is invented here.

## Application verification

Actual commands and pass counts are recorded in BUILD_STATUS.md. Backend integration tests create an isolated facility/account/zone set, exercise the live application and clean up their rows. Browser tests use explicit seed accounts and leave labeled demo inspection history. Do not run those tests against a non-development database.

Not yet measurable without external inputs: REAL PPE accuracy/inference on representative held-out photographs, configured Cloudinary private upload/delivery/deletion, physical phone QR scanning and the user's Windows/firewall/LAN reachability.

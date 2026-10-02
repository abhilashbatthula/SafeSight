# Third-party components and model candidates

shadcn/ui button, badge, card, input, textarea and table are the actual new-york-v4 registry components retrieved from https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui on 2026-10-02, adapted only for local cn/Slot imports and formatting. MIT license: https://github.com/shadcn-ui/ui/blob/main/LICENSE.md. Copyright (c) 2023 shadcn. The code is checked into the repository.

All npm dependencies are pinned and their resolved transitive dependencies recorded in pnpm-lock.yaml. Python demo dependencies are pinned in requirements.lock. The opt-in Ultralytics integration is AGPL-3.0 or requires an appropriate commercial license; review the model and dataset terms before deployment.

Investigated https://huggingface.co/melihuzunoglu/ppe-detection: the author advertises PPE-trained YOLOv11 best.pt with Human, Helmet, No-Helmet and Vest labels and AGPL-3.0. The card says Roboflow but does not identify a reproducible dataset revision/license chain or independent held-out evaluation set. No weights have been supplied or auto-downloaded. The integration accepts such weights when their provenance and license are configured. Absence-based no-vest logic advertised in the card is deliberately not used; SafeSight reports unknown unless explicit evidence exists.

Also inspected https://huggingface.co/badmuriss/ppe-detection-yolov8s. Its documented four classes lack person detections, so it fails the required person/helmet/vest label validation as a single SafeSight model. Do not substitute it silently or add a generic COCO detector and call that PPE validation.

Fixtures: services/inference/make_fixtures.py creates two original schematic illustrations and annotations. SafeSight original fixtures are dedicated to the public domain under CC0-1.0. They contain no real workers, photos or third-party dataset images. Fixture confidence 1.0 describes fixed annotations, not measured AI accuracy.

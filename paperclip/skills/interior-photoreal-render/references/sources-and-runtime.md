# Sources and optional runtime

Audited 2026-11-16. These references informed decisions; third-party code is not vendored into Atelier.

- construction-agent-skills `b7d91997aefb405e5acfb3d4263a91e9c2699c8c`, CC BY 4.0. `interior-render-iteration` is guidance only: change one group at a time and preserve approved versions.
- open-ai-image-agent `1805c81580ab48113a9295676300587bb3cfb5a2`. Its interior skill requires MuAPI; Atelier does not depend on it. Reused concepts: preserve/change map, request receipts, polling and explicit visualization labels.
- ArchForge `044d8787acd3284f9842c4f32c058698646e1333`, GPL-2.0. It is an optional external ComfyUI node requiring torch, torchvision, OpenCV, NumPy, SDXL checkpoint, Canny/Depth ControlNets and an upscale model. Integrate only over the ComfyUI HTTP boundary unless GPL distribution obligations are deliberately accepted.
- sketch-to-render-benchmark `f1813796d2deb0b70e426883f48004154fbc36e8` has no repository license file at audit time; treat as research only. It reports Canny favoring edge fidelity and Depth favoring volume/perspective; uncontrolled SDXL can invent geometry.

## Server configuration

- `COMFYUI_URL`: optional base URL, for example `http://127.0.0.1:8188`.
- `COMFYUI_WORKFLOW_PATH`: API-format workflow JSON reviewed by the operator.
- Model files remain in the external ComfyUI installation. Never download or execute third-party installers automatically.

Without these settings, Cycles remains fully usable and the UI must report AI enhancement as not connected.

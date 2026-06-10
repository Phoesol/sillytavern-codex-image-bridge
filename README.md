# Codex Image Bridge

SillyTavern third-party extension that watches assistant replies, writes fixed JSON job files for Codex automation, then attaches result images to the same chat message.

## Install

Import this URL from SillyTavern's third-party extension installer:

```text
https://github.com/Phoesol/sillytavern-codex-image-bridge
```

This browser extension is only one half of the workflow. Image generation still requires the local Codex backend files under `D:\Ai\Skills\silly-codex` or an equivalent compatible runner.

Job files are written through SillyTavern's `/api/files/upload` endpoint into:

```text
data/default-user/user/files
```

Job file pattern:

```text
codex-image-bridge-job-<jobId>.json
```

Codex automation should generate images into:

```text
data/default-user/user/images/codex-image-bridge
```

Then write:

```text
codex-image-bridge-result-<jobId>.json
```

The extension polls `/user/files/<resultFile>` and inserts returned `user/images/codex-image-bridge/...` URLs into `message.extra.media`. Since 1.7.0 it also accepts streaming result files: `status: "processing"` or `"partial"` with an `images` array inserts only newly seen image URLs, then keeps polling until `status: "succeeded"` or `"failed"`.

Generated images are also indexed in:

```text
data/default-user/user/files/codex-image-bridge-cache.json
```

The settings panel includes an image cache manager with refresh, search, preview, pagination, multi-select, select all, deselect all, download selected, and delete selected. Deleting selected images removes files from `user/images/codex-image-bridge`, updates the cache index, and removes matching images from the currently loaded chat.

The extension also adds a floating Codex button on the chat screen. The compact panel can toggle generation, switch image size, adjust image count and result polling, re-check pending results, refresh cache, and preview recent cached images.

Fast mode is enabled by default for Codex automation. It emits lighter jobs: 512x512, 3 images, 2 recent context messages, 2 visual memory items, up to 2 identity-only character reference images, a 2200-character reply cap, and a short low-detail prompt template. Character reference images are used only for face shape, facial proportions, eyes, mouth/smile, age impression, body type, posture tendency, hairstyle, and stable temperament; clothing, accessories, props, background, lighting, and exact pose come from the current story unless explicitly requested. Disable fast mode from the settings panel or floating panel when quality matters more than latency.

The extension also maintains:

```text
data/default-user/user/files/codex-image-bridge-characters.json
data/default-user/user/files/codex-image-bridge-memory.json
data/default-user/user/files/codex-image-bridge-state.json
```

`codex-image-bridge-characters.json` stores character profiles and reference image URLs. `codex-image-bridge-memory.json` stores only the configured number of recent compact visual memories, so image jobs do not grow indefinitely.

`codex-image-bridge-state.json` is a lightweight activity signal for Codex heartbeat automation. It records whether the extension is enabled, the current active-until time, recent chat/character context, and the latest queued job. A one-minute heartbeat should read this file first and stop immediately when the bridge is disabled, inactive, or has no pending job.

Optional SillyTavern world info:

```text
D:\Ai\1st\SillyTavern\codex-image-bridge\Codex Image Bridge 世界书.json
D:\Ai\1st\SillyTavern\data\default-user\worlds\Codex Image Bridge 世界书.json
```

When enabled, the world info asks the LLM to emit compact `<codex-image>` storyboard tags and `<codex-ui>` plain-text media specs. The extension extracts those tags into the job payload, can hide the raw tags from chat, and asks automation to render `<codex-ui>` blocks as screenshot images. The LLM should not emit raw HTML, CSS, JavaScript, or full page source for Codex Image Bridge.

Optional regex presets are in:

```text
D:\Ai\Skills\silly-codex\S8正则\regex-codex-image-bridge-01发送前清理标签.json
D:\Ai\Skills\silly-codex\S8正则\regex-codex-image-bridge-02发送前气泡对白.json
```

Tavern Helper / 气泡音 compatibility files inspected from:

```text
D:\Ai\Skills\silly-codex\气泡音
```

The extension treats 气泡音 HTML as a display wrapper. It extracts `<xmp id="dcSource">`, converts `@bubble:角色|情绪|台词` lines into clean dialogue for image prompts, and adds a structured `bubbleDialogue` array to each job. 气泡音 remains responsible for chat display; Codex Image Bridge uses only the semantic text layer for image generation. Legacy `[IMG_GEN]...[/IMG_GEN]` blocks are also accepted as image directives and stripped from the prompt text.

Codex can process jobs in two ways:

- Heartbeat: the `sillytavern-heartbeat` automation reads `AUTOMATION_PROMPT.md` and checks on a schedule.
- One-shot: when the user says `开始sillytavern生图`, Codex reads `ONE_SHOT_PROMPT.md`, processes one newest pending job for the current chat, writes the result file, and stops. `开始sillytavern生图全部` drains current-chat pending jobs from old to new.

## Release Policy

- Each functional update increments the minor version by 0.1.
- Every 10 minor updates become one major version.
- Published versions are pushed to GitHub.

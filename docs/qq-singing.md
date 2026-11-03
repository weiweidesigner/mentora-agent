# QQ 点歌与本地歌声转换

The general Agent selects the new `singing` skill for an explicit singing request. All other requests keep their existing reasoning loop. The skill queries the real worker catalog, renders an actual catalog song, and returns a signed audio receipt; QQ validates it before uploading a SILK voice message. Conversation text, a file path, or a fabricated final-answer field cannot stand in for a successful conversion.

## Local runtime

The Apple Silicon worker is isolated from Breeze at `~/.local/share/mentora-singing`, using Python 3.10 and `scripts/singing-requirements.txt` (installed versions are recorded in `scripts/singing-macos.lock.txt`). Seed-VC is an external checkout pinned by `singing.lock.json`; do not install its packages into the web server or Breeze environment. Its upstream source license is GPL-3.0; model sources and licenses remain upstream. No model weights or user song files are committed here.

`singing_service.py` listens only on 127.0.0.1:8769. The existing SSH deployment key establishes an authenticated reverse tunnel on the server's 127.0.0.1:18769. Worker authorization uses `SINGING_TOKEN_FILE`; the web server receives the same secret as `QQ_SINGING_TOKEN` and sets `QQ_SINGING_ENDPOINT=http://127.0.0.1:18769`. Add `QQ_SINGING_ENDPOINT`, `QQ_SINGING_TOKEN` and the configured `VEYA_DAY_DATA_DIR` to `AICHART_TOOL_ENV_KEYS` so the existing Harness tool-environment bridge forwards them into CLI workers; its default scrub otherwise removes token variables. Restart the web service after private environment changes. Secrets stay in private files/environment, never the persona prompt or registry.

Worker environment: `SINGING_DATA_DIR`, `SEED_VC_CHECKOUT`, `SINGING_TOKEN_FILE`, `PYTORCH_ENABLE_MPS_FALLBACK=1`; ensure `ffmpeg` is on PATH. The worker loads the f0-conditioned 44.1 kHz singing conversion model, keeps the official inference modules in one Metal worker thread, and defaults to 30 diffusion steps. On MPS, the pitch result is normalized to float32 and BigVGAN runs on CPU because its long grouped transposed convolutions exceed the MPS backend limit; the singing transformer remains on MPS. There is no application duration cap: convert the whole registered source and verify the output covers its duration. Do not truncate to catalog `seconds`, which is descriptive metadata. Existing excerpts need reimport from originals; increasing metadata alone cannot restore missing audio. Platform delivery errors and runtime deadlines are reported as such, never replaced by a silent excerpt. Voice conversion preserves the source pitch unless an administrator sets an intentional semitone change. Prepared accompaniment should remain in the same key.

`GET /health` reports load/busy state without private paths. Authenticated `GET /songs` gives catalog IDs and voice IDs. Authenticated `POST /render` accepts only those IDs, never user-supplied URLs or paths. It returns a real converted SILK recording. Conversion failures never produce substitute TTS. Successful audio is cached using source/reference metadata and model revision.

## Curated catalog

`SINGING_DATA_DIR/catalog.json` contains `songs` and `voices`. Each song has `id`, `title`, optional `aliases`, `vocal` (relative vocal stem), optional `backing` (relative accompaniment), `seconds` and `source` provenance. Each voice has `id`, `label`, `reference` and optional `semitones`. All referenced files must stay inside the private data directory.

The initial test catalog is **小星星（英文清唱）**, a 20-second excerpt of Derrick Coetzee's 2012 a cappella recording, dedicated to CC0: https://commons.wikimedia.org/wiki/File:Twinkle_Twinkle_Little_Star_-_sung_with_full_lyrics.ogg . The fixed adult companion reference was generated locally with Breeze. The catalog title explicitly identifies the English a cappella version; it is not a Chinese performance or an arbitrary song-name service.

The expanded private catalog also includes 20-second excerpts of 友谊地久天长 (English a cappella), 奇异恩典 (English with accompaniment), 阿里郎 (English Adaptation-2), plus the user's existing local recordings of 突然的自我 (Live), 梨花香 (旺仔小乔 version) and 却有晴 (Live). Local originals and their stems remain outside the repository; importing a private file does not grant redistribution rights.

The Japanese Vocaloid entry **FREELY TOMORROW** uses Mitchie M's CC BY 3.0 recording, originally voiced by Hatsune Miku: https://commons.wikimedia.org/wiki/File:Freely_Tomorrow.ogg . The audio excerpt is separated and voice-converted; no character artwork is included. An optional catalog `attribution` is passed through the authenticated catalog, signed into the current-turn receipt, and sent as a QQ text credit before the audio. Credit delivery failure prevents sending the corresponding audio. Use `--attribution` when importing a recording whose license requires this notice.

To add local stems, run using the isolated worker Python:

```sh
python scripts/register_singing_song.py --root /path/to/mentora-singing --id my-song --title '歌曲名' --vocal-file /path/to/vocals.wav --backing-file /path/to/backing.wav --alias '别名' --source '素材来源与使用说明'
```

Omit `--seconds` to import the entire recording; it is only for an explicitly requested excerpt. New uploads start at zero by default. To replace an existing legacy excerpt, `scripts/rebuild_singing_catalog.py --root <private-data-dir> --manifest <private-manifest.json>` reimports explicitly mapped local originals and warms their full-song caches. The manifest lists `songs` with existing catalog `id` and local `input` (mixed recording) or `vocalFile`. A journal beside the manifest records progress and resumes completed entries without recomputing them. Failed conversions restore the previous entry. Run with no other catalog imports active. The rebuild sends no QQ messages.

For a locally supplied full recording, replace the stem arguments with `--input /path/to/song.wav`. The helper extracts a short clip and uses Demucs (`htdemucs`, CPU) to prepare vocal/accompaniment stems once. It never searches, purchases or downloads songs. Missing catalog songs are reported honestly; they are not substituted with a different song.

## Delivery integrity

The current QQ turn gets a random delivery key. A successful tool writes audio under the existing private `qq-voice` directory and signs the receipt with the service key. The host captures only completed tool observations, verifies the signature, current turn key, file digest, engine, duration and freshness, then attaches the verified audio to the internal answer. The channel sends the song directly through the existing voice media API, without running the assistant's text through Breeze. The media URL has the existing 15-minute expiry. Song generation alone does not send a QQ message; the ordinary inbound-request delivery flow does.

Tests cover forged/replayed/expired receipts, modified audio, unknown catalog IDs, and actual QQ delivery dispatch without TTS narration. Runtime validation additionally requires a real local conversion, an Agent tool call and the platform's media upload accepting the generated resource; a mock test is not evidence of sound quality or runtime speed.

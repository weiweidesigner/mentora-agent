---
name: singing
description: QQ 点歌与歌声转换。查询真实本地曲库，使用固定角色参考音色运行 Seed-VC，生成可由 QQ 通道发送的短歌声。只在用户明确点歌、想听唱歌时使用。
---

# Singing

Preserve the general Agent reasoning loop. This capability creates audio; it does not send messages or access arbitrary URLs/files.

1. Query the current catalog: `python3 app/skill_runner.py execute --script singing_render.py -- --operation catalog --output outputs/data/singing-catalog.json`.
2. Select an actual catalog ID matching the user's requested song. If the user asks for any song, choose an available song and identify it accurately. Never substitute a different song for a named missing song or invent lyrics/audio.
3. Render: `python3 app/skill_runner.py execute --script singing_render.py -- --operation render --song-id <catalog-id> --voice-id companion --delivery-key <current-QQ-turn-key> --output outputs/data/singing-result.json`.
4. The current QQ request supplies the delivery key. Never reuse a key or receipt from history. Rendering requires a real configured worker and a catalog entry.
5. A successful result includes a signed `qqSong` receipt. The QQ channel validates the real audio and sends it after the Agent finishes. Reply naturally in one short sentence; do not print the receipt, internal paths, or claim successful delivery before channel execution. A failed tool call is not a completed song.

The worker uses an existing sung vocal track as the melody carrier, converts its timbre to the configured reference voice with Seed-VC's f0-conditioned SVC model, and optionally mixes its prepared accompaniment. This is song conversion, not TTS narration, arbitrary lyrics-to-music generation, or unrestricted song-name search. Catalog clips are at most 30 seconds. On missing songs, service failure or loading, explain the actual limitation. Do not improvise placeholder audio or start normal speech synthesis as a substitute for singing.

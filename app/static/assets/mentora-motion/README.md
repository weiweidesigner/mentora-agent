# Mentora motion assets

Source: https://github.com/NativeDog1/dsh-boot-animation at 24c711296cb4af2618fef4f65e81346a660fc67b.
Background derives from media/deepseek-brand-intro.mp4; opening derives from media/deepseek-cyberpunk-intro.mp4. Original brand regions were removed/recomposed, the garment motif was replaced with the user-provided Mentora vector, audio removed, and the background made into a forward/reverse loop. The garment mark is a fixed-camera composite, not deformable fabric tracking. The upstream license is retained in LICENSE.txt; upstream did not separately identify original video creators or a distinct media license. This provenance record does not expand the upstream grant.

Visible opening branding is native HTML/CSS, separate from the video. No preview UI or example chat content is included in the app.

opening-audio.mp4 preserves the branded video from opening.mp4 and restores the source cyberpunk intro audio (24 dB gain, peak limiter, 128 kbps AAC). The background remains audio-free. The opening first requests audible autoplay; browser rejection falls back to muted playback with a user-gesture audio activation only while the opening is active.

background-hq.mp4 is regenerated from the original 1280x720 source, before the prior compression pass: moderate unsharp (0.65), Lanczos resampling to 2560x1440, CRF 17. It improves edge contrast/encoding quality, not genuine new source detail. The upstream boot-animation-app repository e107bb8e9f8894b91b9b6d2831a004507bc84091 confirms its own 1440p exports are likewise resampled 720p. The new poster uses the same processed video.

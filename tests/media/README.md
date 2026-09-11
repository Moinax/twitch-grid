# Playback fixture

`playback.ts` contains 20 seconds of a solid purple frame without audio, encoded as H.264 in MPEG-TS. Browser tests serve it through a local HLS playlist. It contains no third-party media.

Regenerate from the repository root with:

```sh
ffmpeg -f lavfi -i color=c=0x6441a5:s=160x90:r=10 -t 20 -an -c:v libx264 -pix_fmt yuv420p -g 10 -f mpegts tests/media/playback.ts
```

#!/usr/bin/env bash
# Encodes rendered frames + soundtrack into the final video.
# Frames are 1920x816 (2.39:1); they are letterboxed into 1920x1080.
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -hide_banner -loglevel warning \
  -framerate 30 -i frames/%04d.png \
  -i output/soundtrack.wav \
  -vf "pad=1920:1080:0:132:black,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -tune film -movflags +faststart \
  -c:a aac -b:a 256k -shortest \
  output/spirit_clash.mp4
echo "wrote output/spirit_clash.mp4"

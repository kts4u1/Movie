#!/usr/bin/env bash
# Encodes the 2D film (frames2d/*.png at 24 fps + output/aurora_blade.wav).
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -hide_banner -loglevel warning \
  -framerate 24 -i frames2d/%04d.png \
  -i output/aurora_blade.wav \
  -vf "format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -tune animation -movflags +faststart \
  -c:a aac -b:a 256k -shortest \
  output/aurora_blade.mp4
echo "wrote output/aurora_blade.mp4"

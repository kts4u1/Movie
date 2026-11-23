#!/usr/bin/env bash
# Encodes AURORA BLADE (frames30/*.png at 24 fps + output/aurora_blade_30s.wav), 30 s.
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -hide_banner -loglevel warning \
  -framerate 24 -i frames30/%04d.png \
  -i output/aurora_blade_30s.wav \
  -vf "format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -tune film -movflags +faststart \
  -c:a aac -b:a 256k -shortest \
  output/aurora_blade_30s.mp4
echo "wrote output/aurora_blade_30s.mp4"

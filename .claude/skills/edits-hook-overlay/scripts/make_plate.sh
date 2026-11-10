#!/usr/bin/env bash
# The black/white plate the Edits hook template is built on: 1080x1920, 30 fps,
# solid black for the first half, solid white for the second, silent stereo track.
#   make_plate.sh OUT.mp4 [half_seconds=3]
set -euo pipefail
out="${1:?usage: make_plate.sh OUT.mp4 [half_seconds]}"; half="${2:-3}"
"${FFMPEG:-ffmpeg}" -v error -y \
  -f lavfi -i "color=black:s=1080x1920:r=30:d=${half}" \
  -f lavfi -i "color=white:s=1080x1920:r=30:d=${half}" \
  -f lavfi -i "anullsrc=r=48000:cl=stereo" \
  -filter_complex "[0][1]concat=n=2:v=1:a=0,format=yuv420p[v]" -map "[v]" -map 2 \
  -t "$(echo "$half * 2" | bc)" -c:v libx264 -crf 10 -x264-params keyint=15 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -shortest "$out"
echo "wrote $out"

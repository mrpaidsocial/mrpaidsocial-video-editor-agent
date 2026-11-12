#!/bin/zsh
# preview.sh <ver> [end-seconds]: build -> HyperFrames render (looks quality, a keyframe every second)
# -> ../renders/preview-<ver>[-0-<end>].mp4 + a lighter -web copy for the review canvas. No audio master: a stand-in
# camera layer is silent and only the placed SFX play. Edit day renders the real cut through the pipeline's render step.
# zsh passes "${VAR:+--flag $VAR}" as ONE argument; use the --flag=value form for optional flags.
# TAG=r2 zsh preview.sh pre -> preview-pre-r2.mp4: once a preview is published it is never overwritten; re-render to a new name.
set -e
setopt pipefail   # a failed build must stop here, not hide behind `| tail`
COMP="$(cd "$(dirname "$0")" && pwd)"; PROJ="$(dirname "$COMP")"
VER="${1:-pre}"; END="$2"; FF="${FFMPEG:-ffmpeg}"; cd "$COMP"
node build.mjs --ver "$VER" | tail -2
mkdir -p "$PROJ/renders"
OUT="$PROJ/renders/preview-$VER${END:+-0-$END}${TAG:+-$TAG}.mp4"; LOG="$PROJ/renders/preview-$VER${TAG:+-$TAG}.log"
npx hyperframes render . -o "$OUT" --quality looks --keyframe-interval 1 ${END:+--end=$END} > "$LOG" 2>&1 || { tail -20 "$LOG"; exit 1; }
tail -2 "$LOG"
"$FF" -hide_banner -loglevel error -y -i "$OUT" -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${OUT%.mp4}-web.mp4"
ls -la "$OUT" "${OUT%.mp4}-web.mp4"
echo "PREVIEW_OK $OUT"

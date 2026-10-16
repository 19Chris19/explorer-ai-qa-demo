#!/bin/sh
set -eu
if [ "$#" -ne 2 ]; then
  echo 'Usage: sh encode-aperture.sh <capture-directory> <asset-directory>' >&2
  exit 2
fi
capture=$1
destination=$2
mkdir -p "$destination"
ffmpeg -v error -y -framerate 24 -i "$capture/frames/frame-%04d.png" \
  -vf 'palettegen=stats_mode=diff:max_colors=128:reserve_transparent=1' \
  -frames:v 1 "$capture/palette.png"
ffmpeg -v error -y -framerate 24 -i "$capture/frames/frame-%04d.png" \
  -i "$capture/palette.png" -lavfi 'paletteuse=dither=none:diff_mode=rectangle' \
  -gifflags +offsetting+transdiff -loop -1 "$destination/hero-aperture.gif"
cp "$capture/frames/frame-0000.png" "$destination/hero-aperture-static.png"
ffprobe -v error -show_entries stream=width,height,nb_frames,duration \
  -show_entries format=size,duration -of json "$destination/hero-aperture.gif"

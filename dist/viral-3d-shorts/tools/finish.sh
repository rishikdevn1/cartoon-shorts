#!/bin/bash
# tools/finish.sh "<Title>" [frames_dir=frames] [mix=work/mix.wav] [subs=work/subs.ass]
# One linear loudness gain to about -14 LUFS + a -1 dBFS limiter, burn subtitles, encode H.264, QA.
set -e
TITLE="$1"; FR="${2:-frames}"; MIX="${3:-work/mix.wav}"; SUBS="${4:-work/subs.ass}"; mkdir -p out
I=$(ffmpeg -nostats -i "$MIX" -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
G=$(python3 -c "print(-14-($I))")
ffmpeg -v error -y -i "$MIX" -af "volume=${G}dB,alimiter=limit=0.891:level=false:attack=3:release=60,aformat=sample_rates=48000:channel_layouts=stereo" -c:a pcm_s16le work/master.wav
VF="null"; [ -f "$SUBS" ] && VF="ass=$SUBS"
ffmpeg -v error -y -framerate 30 -i "$FR/f%04d.jpg" -i work/master.wav -vf "$VF" -c:v libx264 -crf 17 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart -metadata title="$TITLE" out/video.mp4
ffprobe -v error -show_entries format=duration:stream=width,height -of compact out/video.mp4
ffmpeg -nostats -i out/video.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tail -2
ffmpeg -nostats -i out/video.mp4 -vf "freezedetect=n=0.002:d=0.4,blackdetect=d=0.1:pix_th=0.05" -f null - 2>&1 | grep -E "freeze_|black_" || echo "QA: no freezes >= 0.4 s, no black frames"

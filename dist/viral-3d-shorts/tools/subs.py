# python3 tools/subs.py voice.mp3 work/phrases.json work/subs.ass [W H] [max_words]
# Chunky white sans-serif captions, thick black outline, 1-3 words at a time, in the lower third.
# Word times come from syllable weights spread over the speech segments inside each phrase (no ASR needed).
import sys, json, re, subprocess, numpy as np
voice, phrases, out = sys.argv[1:4]
W = int(sys.argv[4]) if len(sys.argv) > 4 else 1080; H = int(sys.argv[5]) if len(sys.argv) > 5 else 1920
MAXW = int(sys.argv[6]) if len(sys.argv) > 6 else 3
d = json.load(open(phrases))
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', voice, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, np.float32); w = 160
sp = 20 * np.log10(np.sqrt(np.convolve(x ** 2, np.ones(w) / w, 'valid')[::w]) + 1e-9) > -38
def syl(t):
    t = t.lower(); n = len(re.findall(r'[aeiouy]+', t))
    if t.endswith('e') and n > 1 and not t.endswith('le'): n -= 1
    return max(1, n)
def speech_in(a, b):
    segs = []; i = int(a * 100); i1 = int(b * 100)
    while i < i1:
        if sp[min(i, len(sp) - 1)]:
            j = i
            while j < i1 and sp[min(j, len(sp) - 1)]: j += 1
            segs.append([i / 100, j / 100]); i = j
        else: i += 1
    m = []
    for s in segs:
        if m and s[0] - m[-1][1] < 0.12: m[-1][1] = s[1]
        else: m.append(s)
    return m or [[a, b]]
ts = lambda t: f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'
words = []
for p in d['phrases']:
    toks = p['text'].split(); wts = [syl(re.sub(r'[^A-Za-z]', '', t) or 'a') + 0.35 for t in toks]
    segs = speech_in(p['start'], p['end']); tot = sum(b - a for a, b in segs)
    def real(u):
        for a, b in segs:
            if u <= b - a: return a + u
            u -= b - a
        return segs[-1][1]
    c = 0; chunk = []
    for i, (t, wv) in enumerate(zip(toks, wts)):
        if not chunk: chunk_start = real(c / sum(wts) * tot) - 0.03
        chunk.append(t.replace('"', '')); c += wv
        if len(chunk) >= MAXW or i == len(toks) - 1 or re.search(r'[,.?!]$', t):
            words.append([chunk_start, ' '.join(chunk), real(c / sum(wts) * tot)]); chunk = []
ev = []
for i, (st, txt, en) in enumerate(words):
    nxt = words[i + 1][0] if i + 1 < len(words) else d['duration']
    ev.append(f"Dialogue: 0,{ts(st)},{ts(max(min(nxt, en + 0.25), st + 0.15))},W,,0,0,0,,{{\\pos({W // 2},{int(H * 0.72)})\\fscx112\\fscy112\\t(0,90,\\fscx100\\fscy100)}}{txt}")
fs = int(W * 0.1)
open(out, 'w').write(f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: W,Inter ExtraBold,{fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,1,0,1,{max(6, fs // 12)},4,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + '\n'.join(ev) + '\n')
print(len(ev), 'caption chunks ->', out)

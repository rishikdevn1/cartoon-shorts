# Level lock: music bed at exactly 50% of the voice's gated RMS (-6 dB), SFX at <=50% with peaks capped at 0.7x voice peak.
import sys, subprocess, numpy as np, wave
SR = 48000
def load(p):
    raw = subprocess.run(['ffmpeg','-v','error','-i',p,'-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)
def grms(x):
    b = int(0.4*SR); n = len(x)//b; r = np.sqrt((x[:n*b].reshape(n,b)**2).mean(1)+1e-12)
    g = r[r > 10**(-40/20)*r.max()]; g = g[g > 10**(-10/20)*np.sqrt((g**2).mean())]
    return np.sqrt((g**2).mean())
def limit(x, cap, rel=0.08):
    a = np.abs(x); need = np.minimum(1, cap/np.maximum(a,1e-12))
    # smooth gain: instant attack, exponential release (block-wise for speed)
    b = 240; n = len(x)//b + 1; gb = np.ones(n)
    for i in range(n): gb[i] = need[i*b:(i+1)*b].min() if i*b < len(x) else 1
    k = np.exp(-b/SR/rel); g = np.ones(n); cur = 1.0
    for i in range(n): cur = min(gb[i], cur*k + (1-k)); g[i] = cur
    # look-back one block so the attack lands before the peak
    g = np.minimum(g, np.r_[g[1:], 1]); gs = np.repeat(g, b)[:len(x)]
    return x*gs
v, m, s = (load(p) for p in sys.argv[1:4])
L = len(v); m = np.pad(m,(0,max(0,L-len(m))))[:L]; s = np.pad(s,(0,max(0,L-len(s))))[:L]
rv, pv = grms(v), np.abs(v).max()
m *= 0.5*rv/grms(m)
s *= 0.5*rv/grms(s); s = limit(s, 0.7*pv)
mix = v + m + s
db = lambda a,b: 20*np.log10(a/b)
print(f'voice gated RMS {20*np.log10(rv):.2f} dBFS, peak {20*np.log10(pv):.2f}')
print(f'music vs voice: {db(grms(m),rv):+.2f} dB   sfx vs voice: {db(grms(s),rv):+.2f} dB   sfx peak/voice peak: {np.abs(s).max()/pv:.2f}')
y = np.clip(mix/ max(1, np.abs(mix).max()/0.98), -1, 1)
with wave.open('work/mix.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y*32767).astype('<i2').tobytes())
print('work/mix.wav written')

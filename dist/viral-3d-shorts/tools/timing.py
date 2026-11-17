# python3 tools/timing.py voice.mp3 script.txt  ->  work/phrases.json
# Aligns script sentences/phrases to the speech segments of the voiceover (silence detection + DP). No ASR needed.
import os; os.makedirs('work', exist_ok=True)
import sys,re,json,subprocess,numpy as np
voice,script=sys.argv[1],sys.argv[2]
raw=subprocess.run(['ffmpeg','-v','error','-i',voice,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout
x=np.frombuffer(raw,np.float32); SR=16000; dur=len(x)/SR
w=160; r=np.sqrt(np.convolve(x**2,np.ones(w)/w,'valid')[::w]); db=20*np.log10(r+1e-9)  # 10ms frames
sp=db>-38
# speech segments, merge gaps <0.18s
segs=[];i=0;n=len(sp)
while i<n:
    if sp[i]:
        j=i
        while j<n and sp[j]: j+=1
        segs.append([i/100,j/100]); i=j
    else: i+=1
m=[]
for s in segs:
    if m and s[0]-m[-1][1]<0.18: m[-1][1]=s[1]
    else: m.append(s)
segs=[s for s in m if s[1]-s[0]>0.08]
txt=open(script).read().strip()
parts=[p.strip() for p in re.split(r'(?<=[.?!])\s+|(?<=[.?!]")\s+',txt.replace('\n',' ')) if p.strip()]
def syl(w):
    w=w.lower(); v=re.findall(r'[aeiouy]+',w); c=len(v)
    if w.endswith('e') and c>1 and not w.endswith('le'): c-=1
    return max(1,c)
nums={'two':1,'thousand':2,'sixty':2,'seventies':3,'hundred':2,'three':1}
P=[sum(nums.get(t,syl(t)) for t in re.findall(r"[A-Za-z']+",p)) for p in parts]
S=len(segs);K=len(parts)
# DP: assign consecutive segment groups to phrases; groups contiguous; each phrase >=1 seg
segd=[b-a for a,b in segs]
rate=sum(segd)/sum(P)
INF=1e18
dp=np.full((K+1,S+1),INF);bk=np.zeros((K+1,S+1),int);dp[0][0]=0
for k in range(1,K+1):
    for s in range(1,S+1):
        for t in range(max(0,s-6),s):
            if dp[k-1][t]>=INF: continue
            d=segs[s-1][1]-segs[t][0]; e=P[k-1]*rate
            gaps=[segs[q+1][0]-segs[q][1] for q in range(t,s-1)]
            c=((d-e)/max(e,.3))**2+sum(max(0,g-0.3)*4 for g in gaps)
            if dp[k-1][t]+c<dp[k][s]: dp[k][s]=dp[k-1][t]+c;bk[k][s]=t
out=[];s=S
for k in range(K,0,-1):
    t=bk[k][s]; out.append({'text':parts[k-1],'start':round(segs[t][0],3),'end':round(segs[s-1][1],3)}); s=t
out.reverse()
fin=[]
for o in out:
    sub=[p.strip() for p in re.split(r'(?<=,)\s+',o['text']) if p.strip()]
    if len(sub)==1: fin.append(o); continue
    ps=[sum(nums.get(t,syl(t)) for t in re.findall(r"[A-Za-z']+",p)) for p in sub]
    # gaps inside sentence span
    inner=[(a,b) for a,b in zip([g[1] for g in segs],[g[0] for g in segs[1:]]) if a>o['start'] and b<o['end']]
    T=o['end']-o['start']; c=0; prev=o['start']
    for i,p in enumerate(sub):
        c+=ps[i]
        if i==len(sub)-1: end=o['end']
        else:
            est=o['start']+T*c/sum(ps)
            near=[g for g in inner if abs((g[0]+g[1])/2-est)<0.7]
            end=min(near,key=lambda g:abs((g[0]+g[1])/2-est))[0] if near else est
        st=prev
        if i>0:
            nx=[g for g in inner if abs(g[0]-prev)<1e-6]
            st=nx[0][1] if nx else prev
        fin.append({'text':p,'start':round(st,3),'end':round(end,3)}); prev=end
out=fin
json.dump({'duration':dur,'frames':round(dur*30),'phrases':out},open('work/phrases.json','w'),indent=1)
for o in out: print(f"{o['start']:6.2f} {o['end']:6.2f}  f{round(o['start']*30):4d}  {o['text']}")
print('segs',S,'phrases',K,'dur',dur)

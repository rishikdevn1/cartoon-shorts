# python3 tools/audit_sheet.py <frames_dir> <out.jpg> [fps=30] [every_seconds=2]
# Contact sheet of one still every N seconds (default 2 s) for the mandatory pre-render visual audit.
import sys, glob, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]; fps = int(sys.argv[3]) if len(sys.argv) > 3 else 30; every = float(sys.argv[4]) if len(sys.argv) > 4 else 2
fs = sorted(glob.glob(d + '/f*.jpg')); pick = [f for f in fs if int(os.path.basename(f)[1:5]) % int(fps * every) == 0]
cols = 6; tw = 270; th = int(tw * Image.open(pick[0]).height / Image.open(pick[0]).width)
S = Image.new('RGB', (cols * tw, ((len(pick) + cols - 1) // cols) * (th + 22)), 'black'); dr = ImageDraw.Draw(S)
for i, f in enumerate(pick):
    x, y = (i % cols) * tw, (i // cols) * (th + 22); S.paste(Image.open(f).resize((tw, th)), (x, y + 22))
    n = int(os.path.basename(f)[1:5]); dr.text((x + 4, y + 4), f'{os.path.basename(f)}  {n / fps:.1f}s', fill='white')
S.save(out, quality=88); print(len(pick), 'frames ->', out)

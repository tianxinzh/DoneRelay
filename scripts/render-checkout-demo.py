#!/usr/bin/env python3
"""Render the approved illustrated checkout scenario, not live account footage.
Requires Pillow, ffmpeg, and locally installed Inter/DejaVu fonts. No credentials.
"""
from __future__ import annotations
import argparse
import functools
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, SCALE = 1440, 900, 2
FPS, SECONDS = 10, 26
C = {
    'bg': '#0C1118', 'panel': '#111B27', 'panel2': '#152331',
    'line': '#283747', 'white': '#F1F6FB', 'muted': '#A9B9CC',
    'dim': '#758BA3', 'mint': '#65E3BD', 'mint_bg': '#193C36',
    'blue': '#87BDFF', 'blue_bg': '#17334E', 'amber': '#F4C57B',
    'amber_bg': '#382D22', 'chat': '#101B29', 'bubble': '#1B2B3C',
}
FONTS = {}


def font_path(family: str, bold: bool = False) -> str:
    env = os.getenv('DONERELAY_FONT_MONO' if family == 'mono' else
                    'DONERELAY_FONT_BOLD' if bold else 'DONERELAY_FONT_REGULAR')
    if env and Path(env).is_file():
        return env
    names = (['DejaVu Sans Mono'] if family == 'mono' else
             ['Inter:style=Bold', 'DejaVu Sans:style=Bold'] if bold else
             ['Inter', 'DejaVu Sans'])
    if shutil.which('fc-match'):
        for name in names:
            result = subprocess.run(['fc-match', '-f', '%{file}', name],
                                    capture_output=True, text=True, check=True).stdout
            if Path(result).is_file():
                return result
    for name in (['DejaVuSansMono.ttf'] if family == 'mono' else
                 ['DejaVuSans-Bold.ttf'] if bold else ['DejaVuSans.ttf']):
        try:
            return str(ImageFont.truetype(name, 20).path)
        except OSError:
            pass
    raise RuntimeError('Install Inter/DejaVu fonts or set DONERELAY_FONT_* paths.')


@functools.lru_cache(maxsize=80)
def font(size: int, bold: bool = False, mono: bool = False):
    key = 'mono' if mono else 'bold' if bold else 'regular'
    return ImageFont.truetype(FONTS[key], size * SCALE)


def box(v):
    return tuple(round(x * SCALE) for x in v)


def text(im, xy, value, size=20, color=None, bold=False, mono=False, anchor=None):
    d = ImageDraw.Draw(im)
    d.text(box(xy), value, font=font(size, bold, mono), fill=color or C['white'], anchor=anchor)


def rr(im, xy, radius=14, fill=None, outline=None, width=1):
    ImageDraw.Draw(im).rounded_rectangle(box(xy), radius=radius*SCALE, fill=fill,
                                        outline=outline, width=width*SCALE)


def line(im, xy, fill, width=1):
    ImageDraw.Draw(im).line(box(xy), fill=fill, width=width*SCALE)


def ellipse(im, xy, fill, outline=None, width=1):
    ImageDraw.Draw(im).ellipse(box(xy), fill=fill, outline=outline, width=width*SCALE)


def check(im, x, y, color=None, size=10):
    d = ImageDraw.Draw(im)
    d.line(box((x, y+size*.5, x+size*.35, y+size*.85, x+size, y)),
           fill=color or C['mint'], width=3*SCALE, joint='curve')


def pill(im, x, y, label, size=14, color=None, fill=None, pad=12):
    f = font(size, True)
    width = ImageDraw.Draw(im).textlength(label, font=f)/SCALE + pad*2
    rr(im, (x,y,x+width,y+30),15, fill=fill or C['panel2'])
    text(im,(x+pad,y+6),label,size,color or C['muted'],True)
    return width


def ease(x):
    x=max(0,min(1,x))
    return 1-(1-x)**3


def arrow(im, x1, y, x2, color, t=None, left=False):
    d=ImageDraw.Draw(im)
    d.line(box((x1,y,x2,y)), fill=C['line'], width=2*SCALE)
    end=x1 if left else x2
    sign=-1 if left else 1
    d.line(box((end-sign*7,y-5,end,y,end-sign*7,y+5)), fill=color,width=2*SCALE)
    if t is not None:
        pos=(t%1)
        if left: pos=1-pos
        x=x1+(x2-x1)*pos
        ellipse(im,(x-4,y-4,x+4,y+4),color)


def cursor(im,x,y,click=0):
    d=ImageDraw.Draw(im)
    pts=[(x,y),(x+3,y+30),(x+11,y+22),(x+18,y+34),(x+24,y+30),(x+17,y+18),(x+28,y+17)]
    d.polygon([box(p) for p in pts],fill=C['white'],outline=C['bg'],width=2*SCALE)
    if click>0:
        r=10+click*16
        d.ellipse(box((x-r,y-r,x+r,y+r)),outline=C['mint'],width=2*SCALE)


TASK = 'Fix empty-cart checkout crash'
COMMIT = '8f2c91a'
REQUEST = 'C7A4E29F8B13'
COMMAND = f'npm run deploy:staging -- --commit {COMMIT}'


def base_image():
    im=Image.new('RGB',(W*SCALE,H*SCALE),C['bg'])
    glow=Image.new('RGBA',im.size,(0,0,0,0))
    ImageDraw.Draw(glow).ellipse(box((820,100,1530,900)),fill=(30,83,87,48))
    glow=glow.filter(ImageFilter.GaussianBlur(100*SCALE))
    im=Image.alpha_composite(im.convert('RGBA'),glow).convert('RGB')
    rr(im,(48,30,87,69),11,C['mint_bg'])
    line(im,(57,44,76,44,71,39),C['mint'],2)
    line(im,(76,55,57,55,62,60),C['mint'],2)
    text(im,(99,33),'DoneRelay',28,bold=True)
    pill(im,1094,36,'CHECKOUT FIX · ILLUSTRATED DEMO',11,C['muted'],C['panel2'])
    text(im,(48,93),'Leave the keyboard.',43,bold=True)
    text(im,(490,93),'Keep the work moving.',43,C['mint'],True)
    text(im,(50,156),'A checkout bug. A staging deploy. Your approval from Telegram.',22,C['muted'])
    rr(im,(48,224,818,784),20,C['panel'],C['line'])
    rr(im,(48,224,818,275),20,C['panel2'])
    ImageDraw.Draw(im).rectangle(box((49,249,817,275)),fill=C['panel2'])
    for x,col in [(69,'#FF7B79'),(87,'#E8BF6C'),(105,'#62C4A2')]:
        ellipse(im,(x,244,x+9,253),col)
    text(im,(135,237),'CODEX · checkout-api',15,C['muted'],True)
    line(im,(49,275,817,275),C['line'])
    text(im,(72,292),TASK,27,bold=True)
    rr(im,(72,338,794,421),12,C['panel2'])
    text(im,(90,351),'YOU · BEFORE STEPPING AWAY',11,C['blue'],True)
    text(im,(90,371),'Fix the checkout crash. Run tests.',18,C['white'])
    text(im,(90,395),'Ask me before deploying to staging.',18,C['white'])
    rr(im,(976,211,1394,793),32,'#070C12','#3B4C5E',2)
    rr(im,(987,223,1383,781),25,C['chat'])
    rr(im,(1120,222,1250,234),6,'#070C12')
    ellipse(im,(1006,249,1046,289),C['blue_bg'])
    ImageDraw.Draw(im).polygon([box(p) for p in [(1013,268),(1037,258),(1029,280),(1024,271)]],fill=C['blue'])
    text(im,(1060,245),'DoneRelay',21,bold=True)
    text(im,(1060,273),'Telegram · private chat',13,C['muted'])
    line(im,(999,306,1371,306),C['line'])
    text(im,(996,189),'ON YOUR PHONE',12,C['muted'],True)
    text(im,(48,872),'Illustrated example · not a live agent or account recording',14,C['muted'])
    text(im,(1085,872),'github.com/tianxinzh/DoneRelay',14,C['muted'])
    return im


def stepper(im,stage):
    labels=['Fix + test','Approve on phone','Deploy + notify']
    for i,(x,label) in enumerate(zip([270,568,898],labels)):
        active=stage==i
        col=C['mint'] if i<stage else C['white'] if active else C['dim']
        ellipse(im,(x,816,x+25,841),C['mint_bg'] if i<=stage else C['panel2'])
        if i<stage: check(im,x+7,824,size=11)
        else: text(im,(x+8,821),str(i+1),13,col,True)
        text(im,(x+37,817),label,18,col,active)
        if i<2: line(im,(x+222,829,x+273,829),C['line'])


def terminal(im,title,color=None):
    rr(im,(72,444,794,702),12,'#0C1621',C['line'])
    text(im,(91,459),title,12,color or C['dim'],True)


def progress(im,label,color,detail):
    ellipse(im,(76,725,84,733),color)
    text(im,(97,716),label,18,color,True)
    text(im,(97,746),detail,14,C['muted'])


def phone_request(im,t,approved):
    off=round(10*(1-ease((t-8.0)/.4)))
    y=323+off
    rr(im,(1004,y,1366,y+339),13,C['bubble'])
    text(im,(1021,y+15),'APPROVAL REQUEST',12,C['blue'],True)
    text(im,(1021,y+41),'Checkout fix is ready.',23,bold=True)
    text(im,(1021,y+77),'Empty-cart crash fixed.',17,C['muted'])
    text(im,(1021,y+102),'6 regression tests passed.',17,C['muted'])
    text(im,(1021,y+142),f'Deploy {COMMIT} to staging?',19,C['white'],True)
    rr(im,(1020,y+174,1350,y+234),8,'#142130')
    text(im,(1032,y+184),'npm run deploy:staging',15,C['white'],mono=True)
    text(im,(1032,y+207),f'-- --commit {COMMIT}',15,C['white'],mono=True)
    text(im,(1021,y+249),'Production stays unchanged.',15,C['muted'])
    text(im,(1021,y+274),f'Request {REQUEST}',12,C['dim'],mono=True)
    if approved:
        rr(im,(1020,y+297,1350,y+329),8,C['mint_bg'])
        check(im,1121,y+307,size=11)
        text(im,(1142,y+303),'Approved',15,C['mint'],True)
    else:
        rr(im,(1020,y+297,1180,y+329),8,C['mint_bg'])
        rr(im,(1190,y+297,1350,y+329),8,C['panel2'],C['line'])
        check(im,1051,y+307,size=11)
        text(im,(1072,y+303),'Approve',15,C['mint'],True)
        text(im,(1252,y+303),'Deny',15,C['muted'],True)
    if approved:
        rr(im,(1116,677,1366,719),11,C['blue_bg'])
        text(im,(1132,690),'You approved this request.',14,C['blue'])
        text(im,(1046,741),'One request. One operation.',15,C['muted'])
    else:
        text(im,(1031,693),'Only your bound account can reply.',14,C['dim'])
        text(im,(1072,727),'No reply ≠ approval.',15,C['muted'])


def phone_done(im,t):
    rr(im,(1004,323,1366,438),13,C['bubble'])
    text(im,(1021,338),'EARLIER · CHECKOUT FIX',12,C['blue'],True)
    text(im,(1021,365),f'{COMMIT} → staging',21,bold=True)
    check(im,1023,406,size=11)
    text(im,(1044,399),'Approved · this operation only',15,C['mint'])
    rr(im,(1116,452,1366,490),11,C['blue_bg'])
    text(im,(1132,463),'You approved this request.',14,C['blue'])
    y=509+round(8*(1-ease((t-20.5)/.4)))
    rr(im,(1004,y,1366,y+224),13,C['mint_bg'])
    check(im,1023,y+19,size=12)
    text(im,(1046,y+13),'TASK COMPLETE',12,C['mint'],True)
    text(im,(1021,y+45),'Checkout fix is on staging.',21,C['white'],True)
    text(im,(1021,y+83),'6 regression tests passed.',17,C['white'])
    text(im,(1021,y+117),'Smoke check: empty cart → 400',16,C['white'])
    text(im,(1021,y+150),'No server crash. Production unchanged.',14,C['muted'])
    line(im,(1021,y+180,1349,y+180),'#2D574D')
    text(im,(1021,y+195),f'checkout-api / staging · {COMMIT}',13,C['mint'],mono=False)


def render(t,base):
    im=base.copy()
    fixed=t>=3.0
    tested=t>=5.8
    asking=t>=7.0
    phone=t>=8.0
    approved=t>=14.6
    resume=t>=16.2
    done=t>=20.5
    stepper(im,2 if resume else 1 if asking else 0)
    status='COMPLETE' if done else 'DEPLOYING' if resume else 'RESUMING' if approved else 'WAITING FOR YOU' if asking else 'TESTING' if fixed else 'INVESTIGATING'
    color=C['mint'] if approved else C['amber'] if asking else C['blue']
    fill=C['mint_bg'] if approved else C['amber_bg'] if asking else C['blue_bg']
    status_width=ImageDraw.Draw(im).textlength(status,font=font(12,True))/SCALE+24
    pill(im,794-status_width,234,status,12,color,fill)
    if not fixed:
        terminal(im,'REPRODUCE / tests/checkout.test.js')
        text(im,(91,491),'$ npm test -- checkout.test.js',18,C['muted'],mono=True)
        if t>=.65:
            text(im,(91,531),'FAIL  empty cart returns a validation error',17,'#FF9C9C',mono=True)
        if t>=1.1:
            text(im,(91,566),'Expected: HTTP 400',18,C['white'],mono=True)
            text(im,(91,596),'Received: HTTP 500',18,'#FF9C9C',mono=True)
        if t>=1.7:
            text(im,(91,643),'TypeError: cannot read properties of undefined',16,C['muted'],mono=True)
        progress(im,'Reproducing the bug…',C['blue'],'An empty cart crashes the checkout endpoint.')
    elif not tested:
        terminal(im,'PATCH / src/checkout.js',C['mint'])
        text(im,(91,497),'Guard the empty-cart path before checkout.',19,C['white'])
        rr(im,(90,537,776,644),8,'#132B29')
        text(im,(106,550),'+ if (cart.items.length === 0) {',17,C['mint'],mono=True)
        text(im,(106,579),'+   return badRequest("Cart is empty");',17,C['mint'],mono=True)
        text(im,(106,608),'+ }',17,C['mint'],mono=True)
        text(im,(91,667),'Added regression coverage for empty carts.',16,C['muted'])
        progress(im,'Fix applied. Running regression tests…',C['blue'],'Existing checkout behavior must still pass.')
    elif not asking:
        terminal(im,'VERIFY / tests/checkout.test.js',C['mint'])
        text(im,(91,497),'PASS  tests/checkout.test.js',19,C['mint'],mono=True)
        for i,s in enumerate(['Empty cart returns HTTP 400','Normal checkout still succeeds','6 tests passed · 0 failed']):
            check(im,94,545+i*41,size=12)
            text(im,(119,537+i*41),s,20,C['white'],bold=i==2)
        text(im,(91,672),f'Commit {COMMIT} ready for staging.',16,C['muted'],mono=True)
        progress(im,'Checkout fixed. All 6 tests pass.',C['mint'],'Next step needs the approval you requested.')
    elif not resume:
        terminal(im,'PASS / 6 CHECKOUT REGRESSION TESTS',C['mint'])
        text(im,(91,491),'Empty cart → HTTP 400 instead of a server crash.',19,C['white'])
        rr(im,(90,532,776,657),10,C['mint_bg'] if approved else C['amber_bg'])
        text(im,(108,547),'APPROVED · THIS OPERATION ONLY' if approved else 'WAITING FOR YOUR APPROVAL',12,
             C['mint'] if approved else C['amber'],True)
        text(im,(108,578),COMMAND,17,C['white'],mono=True)
        text(im,(108,612),'checkout-api / staging · production unchanged',17,C['muted'])
        text(im,(91,675),f'REQUEST {REQUEST}',13,C['dim'],mono=True)
        if approved:
            progress(im,'Approval received from your phone.',C['mint'],'Checking native permissions before continuing.')
        else:
            progress(im,'Waiting for you. The deploy has not started.',C['amber'],'The agent stays at this step until you decide.')
    elif not done:
        terminal(im,'DEPLOY / STAGING ONLY',C['mint'])
        text(im,(91,495),'$ '+COMMAND,17,C['white'],mono=True)
        rows=[('Building checkout-api…',16.7,C['muted']),
              (f'Deployed {COMMIT} to staging',17.5,C['mint']),
              ('Smoke check: POST /checkout (empty cart)',18.3,C['muted']),
              ('HTTP 400  {"error":"Cart is empty"}',19.0,C['mint'])]
        for i,(s,start,col) in enumerate(rows):
            if t>=start: text(im,(91,543+i*34),s,17,col,mono=True)
        progress(im,'Continuing the approved staging deploy…',C['mint'],'Only this commit and this environment were approved.')
    else:
        terminal(im,'DONE / CHECKOUT FIX',C['mint'])
        for i,(s,col) in enumerate([
            ('Empty-cart crash fixed.',C['white']),
            ('6 regression tests passed.',C['white']),
            (f'{COMMIT} deployed to staging.',C['white']),
            ('Smoke check: empty cart → HTTP 400.',C['white']),
            ('Production unchanged.',C['mint'])]):
            check(im,95,501+i*39,size=13)
            text(im,(120,492+i*39),s,20,col,bold=i==4)
        progress(im,'Finished. Completion report sent to Telegram.',C['mint'],'You approved from your phone — no trip back to the keyboard.')
    if asking:
        arrow(im,840,478,957,C['amber'],(t-7)/1.2 if not approved else None)
        text(im,(860,493),'request',13,C['muted'])
    if approved:
        arrow(im,840,556,957,C['mint'],(t-14.6)/1.2 if not resume else None,left=True)
        text(im,(857,571),'approve',13,C['mint'])
    if done:
        arrow(im,840,634,957,C['blue'],(t-20.5)/1.2 if t<22.7 else None)
        text(im,(864,649),'notify',13,C['blue'])
    if done:
        phone_done(im,t)
    elif phone:
        phone_request(im,t,approved)
        if 13.4<=t<15.0:
            p=ease((t-13.4)/.7)
            x=1336+(1110-1336)*p
            y=741+(638-741)*p
            cursor(im,x,y,max(0,1-abs(t-14.5)/.3) if t>=14.25 else 0)
    else:
        ellipse(im,(1154,430,1216,492),C['panel2'])
        d=ImageDraw.Draw(im)
        d.arc(box((1172,446,1198,474)),180,360,fill=C['dim'],width=2*SCALE)
        line(im,(1172,459,1172,474,1198,474,1198,459),C['dim'],2)
        ellipse(im,(1182,479,1188,485),C['dim'])
        text(im,(1078,519),'Away from keyboard.',21,C['muted'])
        text(im,(1072,552),'Your agent is working.',20,C['dim'])
        if asking: text(im,(1102,612),'New request arriving…',16,C['blue'])
    return im.resize((W,H),Image.Resampling.LANCZOS)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir',type=Path,default=Path.cwd())
    parser.add_argument('--preview',action='store_true',help='Render keyframes only')
    args=parser.parse_args()
    out=args.output_dir.resolve(); out.mkdir(parents=True,exist_ok=True)
    FONTS.update(regular=font_path('sans'),bold=font_path('sans',True),mono=font_path('mono'))
    base=base_image()
    for i,t in enumerate([2.0,4.5,6.4,7.5,10.0,14.7,18.5,22.5]):
        render(t,base).save(out/f'keyframe-{i+1}.png')
    render(22.5,base).save(out/'donerelay-checkout-demo-poster.png',optimize=True)
    if args.preview: return
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg: raise RuntimeError('ffmpeg must be installed to encode GIF/MP4.')
    with tempfile.TemporaryDirectory(prefix='donerelay-checkout-frames-') as tmp:
        directory=Path(tmp)
        for n in range(FPS*SECONDS):
            render(n/FPS,base).save(directory/f'{n:04d}.png',compress_level=2)
            if n%40==0: print(f'Rendered {n}/{FPS*SECONDS} frames',flush=True)
        images=str(directory/'%04d.png')
        common=[ffmpeg,'-hide_banner','-loglevel','error','-y','-threads','2','-framerate',str(FPS),'-i',images]
        subprocess.run(common+['-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'donerelay-checkout-demo.mp4')],check=True)
        subprocess.run(common+['-filter_complex_threads','2','-filter_complex',
            '[0:v]split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle',
            '-loop','0',str(out/'donerelay-checkout-demo.gif')],check=True)
    with Image.open(out/'donerelay-checkout-demo.gif') as gif:
        total=0
        for n in range(gif.n_frames):
            gif.seek(n); total+=gif.info.get('duration',0)
        print(f'GIF verified: {gif.size}, {gif.n_frames} frames, {total/1000:.1f}s, loop={gif.info.get("loop")}',flush=True)
    for name in ['donerelay-checkout-demo.gif','donerelay-checkout-demo.mp4','donerelay-checkout-demo-poster.png']:
        p=out/name
        print(f'{name}: {p.stat().st_size:,} bytes',flush=True)

if __name__=='__main__':
    main()

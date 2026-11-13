# Stabled 30-second walkthrough. Drawn at 300x150, upscaled 4x to 1200x600.
import sys,math,subprocess,os,random
from PIL import Image,ImageDraw,ImageFont
W,H,S,FPS=300,150,4,30
FONT=ImageFont.truetype(''+os.path.dirname(os.path.abspath(__file__))+'/../../dist/assets/press-start-2p.ttf',8)
BIG=ImageFont.truetype(''+os.path.dirname(os.path.abspath(__file__))+'/../../dist/assets/press-start-2p.ttf',16)
BG=(11,16,26);GRID=(17,25,40);LINE=(37,57,82);MID=(54,83,124);BLUE=(54,120,255);SKY=(121,165,255);PALE=(181,213,255)
WHITE=(231,242,255);SUB=(127,156,200);DEEP=(18,43,90);NAVY=(22,53,111);INK=(6,18,56);PINK=(255,150,170);GREEN=(110,231,170);RED=(255,120,130)
LOGO=Image.open(os.path.dirname(os.path.abspath(__file__))+'/../../dist/assets/stabled-mark.png').resize((32,32),Image.NEAREST).convert('RGBA')
clamp=lambda x,a=0,b=1:max(a,min(b,x))
def seg(t,a,b):return clamp((t-a)/(b-a))
ease=lambda x:x*x*(3-2*x)
def out(x):return 1-(1-x)**3
class F:
    def __init__(s):
        s.im=Image.new('RGB',(W,H),BG);s.d=ImageDraw.Draw(s.im);s.d.fontmode='1'
        for x in range(0,W,15):s.d.line([(x,0),(x,119)],fill=GRID)
        for y in range(0,120,15):s.d.line([(0,y),(W,y)],fill=GRID)
    def r(s,x,y,w,h,fill=None,outline=None):
        if w<1 or h<1:return
        s.d.rectangle([round(x),round(y),round(x+w-1),round(y+h-1)],fill=fill,outline=outline)
    def t(s,x,y,text,fill=WHITE,font=FONT,anchor='la'):s.d.text((round(x),round(y)),text,fill=fill,font=font,anchor=anchor)
    def paste(s,im,x,y):s.im.paste(im,(round(x),round(y)),im)
PONY=["..KK......KK..",".KWWK....KWWK.",".KWWWKKKKWWWK.","KWWWWWWWWWWWWK","KWWKWWWWWWKWWK","KWWKWWWWWWKWWK","KWPPWWKKWWPPWK","KWWWWWWWWWWWWK",".KWWWWWWWWWWK.","..KWWKKKKWWK..","..KKK....KKK.."]
def sprite(f,cx,cy,k=1):
    col={'W':WHITE,'K':INK,'P':PINK}
    x0=cx-7*k;y0=cy-5.5*k
    for j,row in enumerate(PONY):
        for i,c in enumerate(row):
            if c!='.':f.r(x0+i*k,y0+j*k,k,k,fill=col[c])
def disc(f,cx,cy,r,fill,ring,edge=INK):
    cx,cy=round(cx),round(cy)
    for y in range(-r-1,r+2):
        for x in range(-r-1,r+2):
            d=math.hypot(x,y)
            if d<=r-2.5:c=fill
            elif d<=r-.5:c=ring
            elif d<=r+.6:c=edge
            else:continue
            f.im.putpixel((clamp(cx+x,0,W-1),clamp(cy+y,0,H-1)),c)
def memecoin(f,cx,cy,r=15):disc(f,cx,cy,r,NAVY,SKY);sprite(f,cx,cy+.5)
def dollar(f,cx,cy,r=15):
    disc(f,cx,cy,r,(226,236,255),(150,180,235));f.t(cx+1,cy+1,'$',fill=DEEP,font=BIG,anchor='mm')
def caption(f,n,title,sub,t):
    f.r(0,120,W,30,fill=(8,12,20));f.d.line([(0,120),(W,120)],fill=LINE)
    f.r(8,126,20,11,fill=BLUE);f.t(10,128,'%02d'%n)
    f.t(34,128,title)
    shown=sub[:int(len(sub)*seg(t,.25,1.1))]
    f.t(8,140,shown,fill=SUB)
    for i in range(5):
        x=250+i*9
        f.r(x,129,6,4,fill=BLUE if i==n-1 else LINE)
    f.r(250,136,round(42*clamp(t/6)),1,fill=SKY)
def belt(f,t,y=98):
    f.r(0,y,W,8,fill=(20,30,48));f.d.line([(0,y),(W,y)],fill=MID);f.d.line([(0,y+7),(W,y+7)],fill=LINE)
    off=int(t*30)%10
    for x in range(-10,W,10):f.r(x+off,y+3,3,2,fill=MID)
    for x in (50,150,250):f.r(x-3,y+8,6,12,fill=(16,24,38))
def press(f,head,label=True):
    f.r(112,10,76,22,fill=NAVY,outline=SKY);f.r(118,14,64,13,fill=(198,212,235));f.t(150,21,'STABLED',fill=INK,anchor='mm')
    f.r(116,32,6,66,fill=NAVY,outline=MID);f.r(178,32,6,66,fill=NAVY,outline=MID)
    for y in (40,56,72,88):f.r(118,y,2,3,fill=SKY);f.r(180,y,2,3,fill=MID)
    f.r(147,32,6,head,fill=MID);f.r(130,32+head,40,6,fill=BLUE);f.r(134,38+head,32,3,fill=SKY)
def card(f,cx,cy):
    f.r(cx-13,cy-9,26,18,fill=(12,23,40),outline=SKY);f.r(cx-10,cy-6,9,9,fill=NAVY);f.r(cx-8,cy-4,5,5,fill=WHITE);f.r(cx+2,cy-5,8,2,fill=SUB);f.r(cx+2,cy-1,6,2,fill=MID);f.r(cx-10,cy+5,20,2,fill=MID)
def spark(f,cx,cy,p):
    for a in range(8):
        d=6+p*16;x=cx+math.cos(a*math.pi/4)*d;y=cy+math.sin(a*math.pi/4)*d*.6
        f.r(x,y,2,2,fill=PALE if a%2 else WHITE)
def typed(text,t,a,b):return text[:int(len(text)*seg(t,a,b)+.001)]
def s1(t):
    f=F();pop=out(seg(t,0,.5));y0=16+round((1-pop)*10)
    f.r(62,y0,176,92,fill=(12,23,40),outline=MID);f.d.line([(62,y0+12),(237,y0+12)],fill=MID)
    for i,c in enumerate((SKY,MID,MID)):f.r(68+i*7,y0+4,4,4,fill=c)
    f.t(232,y0+3,'NEW COIN',fill=SUB,anchor='ra')
    f.r(72,y0+22,44,44,fill=NAVY,outline=SKY)
    k=seg(t,.7,1.1)
    if k>0:sprite(f,94,y0+44+round(math.sin(t*3)*1.2),k=1 if k<.5 else (3 if k<1 else 2))
    else:f.t(94,y0+44,'+',fill=SKY,font=BIG,anchor='mm')
    f.t(72,y0+72,'PFP',fill=SUB)
    for i,(lab,val,a,b) in enumerate((('NAME','PIXEL BLOB',1.3,2.5),('TICKER','BLOB',2.8,3.4))):
        y=y0+20+i*24;f.t(126,y,lab,fill=SUB);f.r(126,y+10,102,11,fill=BG,outline=LINE)
        v=typed(val,t,a,b);f.t(129,y+12,v)
        if a-.3<t<b+.3 and int(t*4)%2==0:f.r(129+len(v)*8,y+12,5,7,fill=SKY)
    q=seg(t,3.7,4.0)
    f.t(126,y0+68,'QUOTE',fill=SUB)
    if q>0:f.r(170,y0+66,34,11,fill=BLUE);f.t(187,y0+72,'USDC',anchor='mm')
    if t>4.4:
        on=int(t*3)%2==0 or t>5.2
        f.r(172,y0+80,56,10,fill=BLUE if on else NAVY);f.t(200,y0+85,'LAUNCH',anchor='mm')
        if t>5.2:f.r(170,y0+78,60,14,outline=WHITE)
    caption(f,1,'MAKE A MEME','A PFP, A NAME AND A TICKER.',t);return f
def s2(t):
    f=F();belt(f,t)
    head=round(ease(seg(t,2.0,2.4))*44-ease(seg(t,2.8,3.4))*44)
    stamped=t>=2.4
    if not stamped:
        x=30+ease(seg(t,0,1.9))*120;card(f,x,88)
    else:
        x=150+ease(seg(t,3.5,5.6))*100;bob=0 if t<3.5 else round(abs(math.sin(t*5))*2)
        memecoin(f,x,82-bob)
    press(f,head)
    if 2.4<=t<3.0:spark(f,150,84,seg(t,2.4,3.0))
    if 2.35<=t<2.5:f.r(0,0,W,120,fill=None,outline=WHITE)
    if t>4.0:
        f.r(206,30,84,26,fill=(12,23,40),outline=MID);f.t(212,35,'WALLET',fill=SUB);f.t(212,45,'SIGNED',fill=GREEN);f.r(272,44,3,3,fill=GREEN);f.r(275,41,3,3,fill=GREEN);f.r(278,38,3,3,fill=GREEN);f.r(269,41,3,3,fill=GREEN)
    else:
        f.r(8,30,100,26,fill=(12,23,40),outline=MID);f.t(16,35,'YOU APPROVE',fill=SUB);f.t(16,45,'ONE LAUNCH',fill=WHITE)
    caption(f,2,'STAMP IT','YOUR WALLET SIGNS. PUMP MINTS.',t);return f
def s3(t):
    f=F();a=ease(seg(t,0,1.4));xl=40+a*62;xr=260-a*62
    bob=math.sin(t*2.4)*2
    if a>=1:
        off=int(t*14)%8
        for x in range(120,180,8):
            xx=x+off
            if xx<180:f.r(xx,61,4,2,fill=SKY)
    memecoin(f,xl,62+bob);dollar(f,xr,62-bob)
    f.t(xl,84,'BLOB',fill=SUB,anchor='ma');f.t(xr,84,'USDC',fill=SUB,anchor='ma')
    p=out(seg(t,1.8,2.2))
    if p>0:
        f.r(100,10+round((1-p)*-6),100,16,fill=NAVY,outline=SKY);f.t(150,18+round((1-p)*-6),'BLOB / USDC',anchor='mm')
    if t>3.0:
        f.r(58,98,184,14,fill=(12,23,40),outline=LINE)
        f.t(150,105,typed('PRICED IN DOLLARS',t,3.0,3.9),fill=PALE,anchor='mm')
    caption(f,3,'PAIR WITH USDC','ONE QUOTE FROM THE FIRST TRADE.',t);return f
random.seed(7)
CANDLES=[];p=20.0
for i in range(22):
    o=p;p=max(8,p+random.uniform(-3.5,6.2)+i*.12);c=p
    CANDLES.append((o,c,max(o,c)+random.uniform(.5,3),min(o,c)-random.uniform(.5,3)))
PMAX=max(c[2] for c in CANDLES)+2
def chart(f,n,x0=22,y0=22,w=196,h=84):
    f.r(x0,y0,w,h,fill=(10,18,31),outline=MID)
    for i in range(1,4):
        yy=y0+i*h//4
        for x in range(x0+3,x0+w-2,6):f.r(x,yy,2,1,fill=LINE)
    Y=lambda v:y0+h-4-(v-4)/(PMAX-4)*(h-10)
    for i in range(min(len(CANDLES),int(n)+1)):
        o,c,hi,lo=CANDLES[i];grow=1 if i<int(n) else n-int(n)
        c2=o+(c-o)*grow;hi2=max(o,c2,o+(hi-o)*grow);lo2=min(o,c2,o+(lo-o)*grow)
        x=x0+8+i*8.4;col=SKY if c2>=o else RED
        f.r(x+2,Y(hi2),1,max(1,Y(lo2)-Y(hi2)),fill=col)
        top=min(Y(o),Y(c2));f.r(x,top,5,max(1,abs(Y(o)-Y(c2))),fill=col)
    return CANDLES[min(len(CANDLES)-1,int(n))][1]
def meter(f,p,x=232,y=22,h=84):
    f.r(x,y,46,h,fill=(10,18,31),outline=MID);f.t(x+23,y+5,'CURVE',fill=SUB,anchor='ma')
    f.r(x+15,y+17,16,h-34,fill=BG,outline=LINE);fill=round((h-36)*p)
    for yy in range(fill):
        if yy%3!=2:f.r(x+16,y+h-18-yy,14,1,fill=BLUE if p<1 else GREEN)
    f.t(x+23,y+h-13,'%d%%'%round(p*100),fill=WHITE if p<1 else GREEN,anchor='ma')
def s4(t):
    f=F();n=seg(t,.4,5.4)*21.999;price=chart(f,n);meter(f,ease(seg(t,.4,5.6))*.96)
    f.t(22,10,'BLOB / USDC',fill=WHITE);f.t(218,10,'$0.0000%02d'%round(price),fill=PALE,anchor='ra')
    f.t(26,26,'PUMP CURVE',fill=SUB)
    caption(f,4,'TRADE ON PUMP','BUYS FILL THE BONDING CURVE.',t);return f
def s5(t):
    f=F()
    if t<2.6:
        chart(f,21.999);meter(f,1 if t>.3 else .96)
        f.t(22,10,'BLOB / USDC',fill=WHITE)
        if t>.3 and (int(t*5)%2==0 or t>1.2):
            f.r(54,46,132,32,fill=NAVY,outline=GREEN);f.t(120,53,'CURVE COMPLETE',fill=GREEN,anchor='ma');f.t(120,65,'> PUMPSWAP POOL',fill=WHITE,anchor='ma')
    else:
        k=out(seg(t,2.6,3.2));big=LOGO.resize((64,64),Image.NEAREST)
        f.paste(big,118,8-round((1-k)*14))
        if t>3.1:f.t(150,84,typed('STABLED',t,3.1,3.7),font=BIG,anchor='mm')
        if t>3.9:f.t(150,101,typed('MEME COINS. USDC PAIRS.',t,3.9,4.8),fill=PALE,anchor='mm')
        if t>3.0:
            memecoin(f,62,44+math.sin(t*2.4)*2);dollar(f,238,44-math.sin(t*2.4)*2)
    caption(f,5,'GRADUATE','THE POOL OPENS ON PUMPSWAP.' if t<2.6 else 'LAUNCH ON PUMP. PRICE IN USDC.',t if t<2.6 else t-2.6);return f
SCENES=[s1,s2,s3,s4,s5]
def frame(i,t):
    im=SCENES[i](t).im
    if t<.2:im=Image.blend(Image.new('RGB',(W,H),BG),im,t/.2)
    if t>5.85:im=Image.blend(Image.new('RGB',(W,H),BG),im,max(0,(6-t)/.15))
    return im.resize((W*S,H*S),Image.NEAREST)
if __name__=='__main__':
    mode,outdir=sys.argv[1],sys.argv[2]
    if mode=='stills':
        for i,t in ((0,3.3),(0,5.5),(1,2.5),(1,4.8),(2,4.5),(3,4.6),(4,1.5),(4,5.6)):frame(i,t).save(f'{outdir}/still_{i+1}_{t}.png')
    else:
        for i in range(5):
            tmp=f'{outdir}/scene{i}.tmp.mp4'
            p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W*S}x{H*S}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','slow','-crf','20','-tune','animation','-pix_fmt','yuv420p','-g','30',tmp],stdin=subprocess.PIPE)
            for n in range(6*FPS):p.stdin.write(frame(i,n/FPS).tobytes())
            p.stdin.close();assert p.wait()==0;os.rename(tmp,f'{outdir}/scene{i}.mp4')
# Usage: python3 render-walkthrough.py render OUT_DIR, then
#   printf "file scene%d.mp4\n" 0 1 2 3 4 > OUT_DIR/list.txt
#   ffmpeg -f concat -i OUT_DIR/list.txt -c copy -movflags +faststart stabled-walkthrough.mp4

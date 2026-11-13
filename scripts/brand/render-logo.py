# Original Stabled mark: a pixel horseshoe on a stepped tile.
from PIL import Image
import math,sys
N=32
OUT=(6,18,56,255);BLUE=(31,91,255,255);DEEP=(18,58,190,255);LIGHT=(140,190,255,255);WHITE=(255,255,255,255);SHADE=(205,222,255,255)
def tile(x,y):
    # stepped (pixel-rounded) square, returns 0 none,1 outline,2 fill
    def inside(x,y,m):
        if x<m or y<m or x>N-1-m or y>N-1-m:return False
        dx=min(x-m,N-1-m-x);dy=min(y-m,N-1-m-y)
        return dx+dy>=4
    if inside(x,y,3):return 2
    if inside(x,y,1) or (inside(x,y,2)):return 1
    return 0
def shoe(x,y):
    cx,cy=15.5,15.0
    dx,dy=x-cx,y-cy
    r=math.hypot(dx,dy)
    if y<cy:  # straight legs above centre
        if 5.2<=abs(dx)<=9.6 and y>=7:return 1
        # heel caps
        if y in(7,8) and 4.2<=abs(dx)<=10.6:return 1
        return 0
    return 1 if 5.2<=r<=9.6 else 0
NAILS=[(8,11),(23,11),(8,16),(23,16),(11,21),(20,21),(15,23),(16,23)]
def render(scale,bg=True):
    im=Image.new('RGBA',(N,N),(0,0,0,0));p=im.load()
    for y in range(N):
        for x in range(N):
            t=tile(x,y) if bg else 0
            if t==1:p[x,y]=OUT
            elif t==2:
                p[x,y]=BLUE
                if x+y>=N+9:p[x,y]=DEEP
            if shoe(x,y) and (not bg or t==2):
                p[x,y]=WHITE if x<=17 else SHADE
    for x,y in NAILS:
        p[x,y]=BLUE if bg else (0,0,0,0)
    if bg:
        for x,y in[(5,6),(6,5),(7,5),(5,7)]:p[x,y]=LIGHT
    return im.resize((N*scale,N*scale),Image.NEAREST)
d=sys.argv[1]
render(16).save(d+'/stabled-mark.png',optimize=True)   # 512
render(6).save(d+'/stabled-mark-192.png',optimize=True)
render(1).save(d+'/stabled-mark-32.png',optimize=True)

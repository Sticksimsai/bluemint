# Stabled mark: the project's pixel coin with a dollar sign.
# Usage: python3 render-logo.py OUT_DIR
from PIL import Image
import math,sys
N=32
OUT=(6,18,56,255);BLUE=(10,82,255,255);DEEP=(6,44,190,255);LIGHT=(140,190,255,255);WHITE=(255,255,255,255)
GLYPH=[".....XX.....",".....XX.....","..XXXXXXXX..",".XXXXXXXXXX.",".XXX....XXX.",".XXX........",".XXX........",".XXXXXXXXX..","..XXXXXXXXX.","........XXX.","........XXX.",".XXX....XXX.",".XXXXXXXXXX.","..XXXXXXXX..",".....XX.....",".....XX....."]
def render(scale):
    im=Image.new('RGBA',(N,N),(0,0,0,0));p=im.load();c=15.5
    for y in range(N):
        for x in range(N):
            d=math.hypot(x-c,y-c)
            if d<=15.2:p[x,y]=OUT
            if d<=13.2:
                p[x,y]=BLUE
                if d>=11.2 and (x-c)+(y-c)>=11:p[x,y]=DEEP
    for x,y in[(8,6),(9,6),(7,7),(8,7),(6,9)]:p[x,y]=LIGHT
    for j,row in enumerate(GLYPH):
        for i,ch in enumerate(row):
            if ch=='X':p[10+i,8+j]=WHITE
    return im.resize((N*scale,N*scale),Image.NEAREST)
render(16).save(sys.argv[1]+'/stabled-mark.png',optimize=True)

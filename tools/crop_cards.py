from PIL import Image,ImageDraw;import numpy as np
xs=np.concatenate([np.arange(240+323*i,500+323*i) for i in range(6)])
def bottom(a,lo,hi):
  g=np.abs(np.diff(a[:,xs],axis=0)).mean(1)
  return lo+int(g[lo:hi].argmax())
out=[]
for n in range(3894,3918):
  im=Image.open(f'assets/IMG_{n}.PNG').convert('RGB');a=np.asarray(im.convert('L')).astype(float)
  if n==3896: rows=[(1029,6)]
  elif n==3894: rows=[(bottom(a,820,880),6)]
  elif n==3917: rows=[(bottom(a,1190,1240),4)]
  else:
    g=np.abs(np.diff(a[:,xs],axis=0)).mean(1)
    p=930+int(g[930:1030].argmax()) if False else None
    seg=g[930:1030];ok=np.where(seg>0.75*seg.max())[0];rows=[(930+int(ok[0])+77,6)]
  for b,k in rows:
    for i in range(k):
      x=226+323*i
      out.append(((n,i),im.crop((x,b-472,x+292,b+2))))
print(len(out))
for j,(k,c) in enumerate(out): c.save(f'cards/c{j:03d}.png')
sh=Image.new('RGB',(12*150,((len(out)+11)//12)*250),'black');d=ImageDraw.Draw(sh)
for j,(k,c) in enumerate(out):
  x,y=(j%12)*150,(j//12)*250;sh.paste(c.resize((146,236)),(x,y));d.text((x+100,y+2),str(j),fill='red')
sh.save('cardsheet.jpg',quality=85)

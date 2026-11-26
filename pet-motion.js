/* Pixel Pals motion study. The original atlas stays intact; canvas layers form
   a small 2D puppet. These are interaction sketches, not biological behaviour. */
(() => {
  'use strict';
  const SIZE = 112;
  const PETS = [
    {id:'gold',name:'黃狗',crop:[145,14,540,510],coat:'#dc9138'},
    {id:'black',name:'黑狗',crop:[765,14,535,510],coat:'#51433f'},
    {id:'tabby',name:'橘貓',crop:[145,535,550,530],coat:'#d68a31'},
    {id:'calico',name:'三花貓',crop:[765,535,555,530],coat:'#f4e3c6'}
  ];
  const ACTIONS = [
    {id:'idle',name:'待機',hint:'輕輕呼吸，眨一下眼睛。'},
    {id:'run',name:'奔跑',hint:'交替擺腿，尾巴跟著跑步節奏晃動。'},
    {id:'eat',name:'吃飯',hint:'低頭吃飯，嘴邊有小小碎屑。'},
    {id:'drink',name:'喝水',hint:'低頭喝水，碗裡泛起一圈圈波紋。'},
    {id:'happy',name:'喜悅',hint:'開心跳起，眼睛瞇成小月牙。'},
    {id:'sad',name:'難過',hint:'低低垂頭，慢慢晃動，落下一滴眼淚。'},
    {id:'angry',name:'生氣',hint:'皺眉、跺腳，再冒出小小的怒氣符號。'},
    {id:'love',name:'愛心',hint:'親暱地歪頭，愛心慢慢飄上來。'}
  ];
  const atlas = new Image();
  const ready = new Promise((resolve,reject) => {atlas.onload=resolve;atlas.onerror=()=>reject(Error('角色圖載入失敗'));});
  atlas.src = window.PIXEL_PALS_ATLAS || 'assets/pixel-pals-atlas.png?v=20261126';
  const cache = new Map();
  const head = [[.36,0],[1,0],[1,.66],[.68,.69],[.43,.6],[.36,.36]];
  const tail = [[0,0],[.36,0],[.36,.4],[.31,.57],[.16,.67],[0,.72]];
  function inside(x,y,p) {let s=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if(((p[i][1]>y)!=(p[j][1]>y))&&(x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0]))s=!s;return s;}
  function layers(pet) {
    if(cache.has(pet.id))return cache.get(pet.id);
    const src=document.createElement('canvas');src.width=src.height=SIZE;
    const sx=src.getContext('2d',{willReadFrequently:true});sx.imageSmoothingEnabled=false;sx.drawImage(atlas,...pet.crop,0,0,SIZE,SIZE);
    const names=['body','tail','head','leg0','leg1','leg2','leg3'];
    const data=sx.getImageData(0,0,SIZE,SIZE),parts=Object.fromEntries(names.map(n=>[n,sx.createImageData(SIZE,SIZE)]));
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++) {
      const i=(y*SIZE+x)*4;if(!data.data[i+3])continue;
      const u=x/SIZE,v=y/SIZE;
      let key=inside(u,v,head)?'head':inside(u,v,tail)?'tail':v>.73?'leg'+(u<.28?0:u<.43?1:u<.63?2:3):'body';
      parts[key].data.set(data.data.subarray(i,i+4),i);
    }
    const result={};for(const n of names){const c=document.createElement('canvas');c.width=c.height=SIZE;c.getContext('2d').putImageData(parts[n],0,0);result[n]=c;}
    cache.set(pet.id,result);return result;
  }
  const TAU=Math.PI*2;
  function heart(ctx,x,y,s,color) {
    ctx.fillStyle=color;const rows=['01100110','11111111','11111111','01111110','00111100','00011000'];
    rows.forEach((row,j)=>[...row].forEach((v,i)=>{if(v==='1')ctx.fillRect(Math.round(x+i*s),Math.round(y+j*s),s,s);}));
  }
  function stroke(ctx,pts,color,width=3){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='square';ctx.lineJoin='miter';ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();}
  class Animator {
    constructor(canvas,pet='gold',action='idle') {this.canvas=canvas;this.ctx=canvas.getContext('2d');this.pet=pet;this.action=action;this.time=0;this.speed=1;this.playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.direction=1;this.frame=null;this.last=0;this.tick=this.tick.bind(this);this.frame=requestAnimationFrame(this.tick);}
    set(pet,action){this.pet=pet;this.action=action;this.time=0;this.updateLabel();}
    updateLabel(){this.canvas.setAttribute('aria-label',`${PETS.find(p=>p.id===this.pet).name}：${ACTIONS.find(a=>a.id===this.action).name}動作預覽`);}
    destroy(){cancelAnimationFrame(this.frame);}
    tick(now){if(this.last&&this.playing)this.time+=Math.min((now-this.last)/1000,.05)*this.speed;this.last=now;this.render(this.time);this.frame=requestAnimationFrame(this.tick);}
    render(t){
      const c=this.ctx,W=this.canvas.width,H=this.canvas.height;
      c.clearRect(0,0,W,H);c.save();c.scale(W/640,H/400);c.imageSmoothingEnabled=false;
      c.fillStyle='#e8f0e7';c.fillRect(0,0,640,400);c.fillStyle='#d9e5d4';c.fillRect(0,329,640,71);
      c.fillStyle='#c1d1bc';for(let i=0;i<10;i++)c.fillRect(((i*83-(this.action==='run'?t*160:0))%720+720)%720-40,350+(i%3)*12,20+(i%3)*7,3);
      const pet=PETS.find(p=>p.id===this.pet),p=layers(pet),a=this.action,f=Math.sin(t*TAU*2.7),slow=Math.sin(t*TAU*.7);
      let x=167,y=44,sy=1,tilt=0,hr=0,dy=0;
      if(a==='run'){x+=Math.sin(t*4)*8;y-=Math.abs(f)*13;tilt=.025*f;}
      if(a==='happy'){y-=Math.max(0,Math.sin(t*TAU*1.6))*39;sy=1-.025*Math.cos(t*TAU*1.6);hr=.06*slow;}
      if(a==='sad'){y+=8;hr=.13+.03*slow;sy=.96;}
      if(a==='angry'){x+=Math.sin(t*35)*2;y-=Math.max(0,Math.sin(t*TAU*2))*5;hr=-.06;}
      if(a==='love'){hr=Math.sin(t*2)*.1;y+=slow*2;}
      if(a==='idle'){y+=Math.sin(t*2)*1.4;sy=1+.006*Math.sin(t*2);}
      if(a==='eat'||a==='drink'){y+=18;sy=.94;hr=.68+.045*Math.sin(t*TAU*(a==='eat'?2.4:3));dy=8;}
      c.fillStyle='rgba(47,78,45,.12)';c.beginPath();c.ellipse(310,330,114-(a==='happy'?Math.max(0,Math.sin(t*TAU*1.6))*14:0),12,0,0,TAU);c.fill();
      if(a==='run')for(let i=0;i<4;i++){c.fillStyle='rgba(113,138,99,.3)';c.fillRect(140-((t*130+i*25)%90),315+i*4,14-i*2,4);}
      c.save();if(this.direction===-1){c.translate(640,0);c.scale(-1,1);}c.translate(x,y);c.scale(2.6,2.6*sy);c.rotate(tilt);
      const layer=(name,px,py,r=0,ox=0,oy=0)=>{c.save();c.translate(px+ox,py+oy);c.rotate(r);c.drawImage(p[name],-px,-py);c.restore();};
      const legRot=a==='run'?.44*f:a==='angry'?.09*Math.sin(t*13):0;
      layer('leg1',39,81,-legRot);layer('leg3',80,81,legRot);
      layer('tail',26,62,(a==='happy'||a==='love'?.25:.08)*Math.sin(t*(a==='sad'?1.5:8)));
      c.fillStyle=pet.coat;c.fillRect(47,56,20,22); // neck beneath the turning head
      layer('body',56,72);
      layer('leg0',23,82,legRot);layer('leg2',58,82,-legRot);
      c.save();c.translate(59,65+dy);c.rotate(hr);c.drawImage(p.head,-59,-65);
      const eye=(ex,ey,w,h,kind)=>{
        c.fillStyle=pet.coat;c.beginPath();c.ellipse(ex,ey,w,h,0,0,TAU);c.fill();
        if(kind==='smile')stroke(c,[[ex-w*.65,ey+1],[ex-2,ey-2],[ex+2,ey-2],[ex+w*.65,ey+1]],'#35251e',1.8);
        else stroke(c,[[ex-w*.7,ey],[ex+w*.7,ey]],'#35251e',1.8);
      };
      const blink=a==='idle'&&t%4.2>3.95;
      if(a==='happy'||a==='love'||blink){eye(68,43,9,10,blink?'blink':'smile');eye(93,35,7,8,blink?'blink':'smile');}
      if(a==='angry'){stroke(c,[[60,29],[76,35]],'#35251e',2.3);stroke(c,[[87,29],[99,24]],'#35251e',2.3);}
      if(a==='sad'){
        stroke(c,[[60,31],[74,27]],'#594033',1.7);stroke(c,[[88,23],[99,27]],'#594033',1.7);
        const q=(t*1.2)%1;c.fillStyle='#6caed5';c.fillRect(75,49+q*12,2,4);c.fillRect(74,52+q*12,4,3);
      }
      c.restore();c.restore();
      const mouthX=this.direction===1?440:200;
      if(a==='eat'||a==='drink'){
        const bx=mouthX-17;c.fillStyle=a==='drink'?'#649bb9':'#ad7751';c.fillRect(bx,324,76,9);c.fillRect(bx+7,333,62,17);c.fillStyle='#e9debe';c.fillRect(bx+4,321,68,5);
        if(a==='eat'){
          c.fillStyle='#714e33';for(let i=0;i<8;i++)c.fillRect(bx+9+i*7,317-(i%2)*3,5,5);
          c.fillStyle='#bd905c';for(let i=0;i<3;i++)c.fillRect(mouthX+((t*21+i*13)%23),294+((t*70+i*10)%25),4,4);
        }else{
          c.strokeStyle='#86c8e4';c.lineWidth=2;for(let i=0;i<2;i++){const q=(t*2+i*.5)%1;c.beginPath();c.ellipse(bx+38,323,5+q*23,2,0,0,TAU);c.stroke();}
          c.fillStyle='#7bb9d5';c.fillRect(mouthX+8,304+Math.sin(t*19)*3,3,5);
        }
      }
      if(a==='love')for(let i=0;i<4;i++){const q=(t*.36+i*.25)%1;c.globalAlpha=Math.min(1,q*6)*(1-q);heart(c,220+i*50,150-q*105,2+(i%2),'#d97086');}c.globalAlpha=1;
      if(a==='happy')for(let i=0;i<5;i++){const q=t*3+i;c.fillStyle=i%2?'#d9a451':'#6e9c6a';const xx=160+i*72,yy=96+Math.sin(q)*15;c.fillRect(xx,yy,4,15);c.fillRect(xx-5,yy+5,14,4);}
      if(a==='angry'){const xx=470,yy=78;stroke(c,[[xx,yy],[xx+11,yy],[xx+11,yy+11]],'#b9594e',4);stroke(c,[[xx+20,yy+11],[xx+20,yy+20],[xx+11,yy+20]],'#b9594e',4);}
      c.restore();
    }
  }
  window.PixelPals={ready,PETS,ACTIONS,Animator};
})();

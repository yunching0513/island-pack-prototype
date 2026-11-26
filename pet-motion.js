/* Pixel Pals: a continuous inverse warp of the intact character texture.
   No disjoint body-part masks; expressions never paint over the original face. */
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
    {id:'idle',name:'待機',hint:'輕輕呼吸，身體微微起伏。'},
    {id:'run',name:'奔跑',hint:'交替擺腿，尾巴跟著跑步節奏晃動。'},
    {id:'eat',name:'吃飯',hint:'低頭吃飯，嘴邊有小小碎屑。'},
    {id:'drink',name:'喝水',hint:'低頭喝水，碗裡泛起一圈圈波紋。'},
    {id:'happy',name:'喜悅',hint:'開心跳起，身邊亮起小星星。'},
    {id:'sad',name:'難過',hint:'低低垂頭，慢慢晃動，落下一滴眼淚。'},
    {id:'angry',name:'生氣',hint:'氣呼呼地跺腳，冒出小小的怒氣符號。'},
    {id:'love',name:'愛心',hint:'親暱地歪頭，愛心慢慢飄上來。'}
  ];
  const atlas = new Image();
  const ready = new Promise((resolve,reject) => {atlas.onload=resolve;atlas.onerror=()=>reject(Error('角色圖載入失敗'));});
  atlas.src = window.PIXEL_PALS_ATLAS || 'assets/pixel-pals-atlas.png?v=20261126';
  const cache = new Map();
  const PAD = 16, POSE_SIZE = SIZE + PAD * 2;
  const smooth = v => {v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
  function texture(pet) {
    if(cache.has(pet.id))return cache.get(pet.id);
    const cv=document.createElement('canvas');cv.width=cv.height=SIZE;
    const c=cv.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;
    c.drawImage(atlas,...pet.crop,0,0,SIZE,SIZE);
    const pixels=c.getImageData(0,0,SIZE,SIZE).data;cache.set(pet.id,pixels);return pixels;
  }
  // One smooth displacement field across the whole animal. Inverse sampling
  // fills every output pixel, so moving joints cannot expose polygon seams.
  function motionAt(a,t) {
    const angle=a==='eat'||a==='drink'?.24+.025*Math.sin(t*15):a==='sad'?.055:a==='love'?.035*Math.sin(t*2):0;
    return {a,co:Math.cos(angle),si:Math.sin(angle),stride:Math.sin(t*Math.PI*5.4),wag:Math.sin(t*(a==='sad'?1.5:8))*(a==='love'||a==='happy'?2:1)};
  }
  function displacement(x,y,a,t,m=motionAt(a,t)) {
    const head=smooth((80-y)/45)*smooth((x-30)/24);
    const tail=smooth((40-x)/24)*smooth((77-y)/38);
    const feet=smooth((y-72)/35),{stride,co,si}=m,hx=x-62,hy=y-67;
    const dx=head*(hx*(co-1)-hy*si)+tail*m.wag;
    const dy=head*(hx*si+hy*(co-1))+(a==='run'?feet*4*stride*Math.sin((x-10)*.095):0);
    return [dx+(a==='run'?feet*2*stride:0),dy];
  }
  class Pose {
    constructor(){this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=POSE_SIZE;this.ctx=this.canvas.getContext('2d');this.image=this.ctx.createImageData(POSE_SIZE,POSE_SIZE);}
    render(pet,a,t){
      // Pixel animation uses 30 poses/sec; paused and reduced-motion views reuse
      // the same pose instead of resampling nine textures every display tick.
      const frame=Math.floor(t*30),key=pet.id+'|'+a+'|'+frame;
      if(this.key===key)return this.canvas;this.key=key;t=frame/30;
      const src=texture(pet),out=this.image.data,m=motionAt(a,t);out.fill(0);
      for(let y=0;y<POSE_SIZE;y++)for(let x=0;x<POSE_SIZE;x++){
        const tx=x-PAD,ty=y-PAD;let sx=tx,sy=ty;
        for(let k=0;k<4;k++){const d=displacement(sx,sy,a,t,m);sx=tx-d[0];sy=ty-d[1];}
        const ix=Math.round(sx),iy=Math.round(sy);if(ix<0||iy<0||ix>=SIZE||iy>=SIZE)continue;
        const i=(iy*SIZE+ix)*4,j=(y*POSE_SIZE+x)*4;
        out[j]=src[i];out[j+1]=src[i+1];out[j+2]=src[i+2];out[j+3]=src[i+3];
      }
      this.ctx.putImageData(this.image,0,0);return this.canvas;
    }
  }
  const TAU=Math.PI*2;
  function heart(ctx,x,y,s,color) {
    ctx.fillStyle=color;const rows=['01100110','11111111','11111111','01111110','00111100','00011000'];
    rows.forEach((row,j)=>[...row].forEach((v,i)=>{if(v==='1')ctx.fillRect(Math.round(x+i*s),Math.round(y+j*s),s,s);}));
  }
  function stroke(ctx,pts,color,width=3){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='square';ctx.lineJoin='miter';ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();}
  class Animator {
    constructor(canvas,pet='gold',action='idle') {this.canvas=canvas;this.ctx=canvas.getContext('2d');this.pose=new Pose();this.pet=pet;this.action=action;this.time=0;this.speed=1;this.playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.direction=1;this.frame=null;this.last=0;this.tick=this.tick.bind(this);this.frame=requestAnimationFrame(this.tick);}
    set(pet,action){this.pet=pet;this.action=action;this.time=0;this.updateLabel();}
    updateLabel(){this.canvas.setAttribute('aria-label',`${PETS.find(p=>p.id===this.pet).name}：${ACTIONS.find(a=>a.id===this.action).name}動作預覽`);}
    destroy(){cancelAnimationFrame(this.frame);}
    tick(now){if(this.last&&this.playing)this.time+=Math.min((now-this.last)/1000,.05)*this.speed;this.last=now;this.render(this.time);this.frame=requestAnimationFrame(this.tick);}
    render(t){
      const c=this.ctx,W=this.canvas.width,H=this.canvas.height;
      c.clearRect(0,0,W,H);c.save();c.scale(W/640,H/400);c.imageSmoothingEnabled=false;
      c.fillStyle='#e8f0e7';c.fillRect(0,0,640,400);c.fillStyle='#d9e5d4';c.fillRect(0,329,640,71);
      c.fillStyle='#c1d1bc';for(let i=0;i<10;i++)c.fillRect(((i*83-(this.action==='run'?t*160:0))%720+720)%720-40,350+(i%3)*12,20+(i%3)*7,3);
      const pet=PETS.find(p=>p.id===this.pet),a=this.action,f=Math.sin(t*TAU*2.7),slow=Math.sin(t*TAU*.7);
      let x=167,y=44,sy=1,tilt=0;
      if(a==='run'){x+=Math.sin(t*4)*8;y-=Math.abs(f)*13;tilt=.025*f;}
      if(a==='happy'){y-=Math.max(0,Math.sin(t*TAU*1.6))*39;sy=1-.025*Math.cos(t*TAU*1.6);}
      if(a==='sad'){y+=8;sy=.96;}
      if(a==='angry'){x+=Math.sin(t*35)*2;y-=Math.max(0,Math.sin(t*TAU*2))*5;}
      if(a==='love'){y+=slow*2;}
      if(a==='idle'){y+=Math.sin(t*2)*1.4;sy=1+.006*Math.sin(t*2);}
      if(a==='eat'||a==='drink'){y+=18;sy=.94;tilt=.025*Math.sin(t*15);}
      c.fillStyle='rgba(47,78,45,.12)';c.beginPath();c.ellipse(310,330,114-(a==='happy'?Math.max(0,Math.sin(t*TAU*1.6))*14:0),12,0,0,TAU);c.fill();
      if(a==='run')for(let i=0;i<4;i++){c.fillStyle='rgba(113,138,99,.3)';c.fillRect(140-((t*130+i*25)%90),315+i*4,14-i*2,4);}
      c.save();if(this.direction===-1){c.translate(640,0);c.scale(-1,1);}c.translate(x,y);c.scale(2.6,2.6*sy);c.rotate(tilt);
      c.drawImage(this.pose.render(pet,a,t),-PAD,-PAD);
      c.restore();
      // Effects stay in stage space; the original eyes and face stay intact.
      if(a==='sad'){
        const q=(t*1.2)%1,ex=this.direction===1?430:210;
        c.fillStyle='#6caed5';c.fillRect(ex,225+q*70,5,8);c.fillRect(ex-2,230+q*70,9,6);
      }
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
  window.PixelPals={ready,PETS,ACTIONS,Animator,displacement};
})();

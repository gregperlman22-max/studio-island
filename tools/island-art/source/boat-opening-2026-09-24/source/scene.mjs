export const STAGE={width:1671,height:941,duration:6.5};
export const FRONT=[[0,991],[56,945],[125,947],[170,994],[256,977],[333,1003],[430,1007],[574,991],[733,974],[895,940],[1005,910],[1087,869],[1165,803],[1233,750],[1254,1254],[0,1254]];
export function state(t,reduced=false){const p=reduced?1:Math.min(1,Math.max(0,t/5.5));const e=1-(1-p)**3;return {p,x:10+200*e,y:210+50*e,s:.585-.085*e,roll:reduced?0:Math.sin(t*1.8)*.007*(1-.65*e),bob:reduced?0:Math.sin(t*2.1)*2.2*(1-.7*e)};}
export function draw(ctx,images,t,{reduced=false,showFriend=true}={}){
 const W=ctx.canvas.width,H=ctx.canvas.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#b8dedc';ctx.fillRect(0,0,W,H);
 // Portrait follows the boat within the same painting; no separate background is morphed.
 const b=state(t,reduced),portrait=H/W>1;
 const scale=portrait?H/STAGE.height:Math.min(W/STAGE.width,H/STAGE.height);
 const cameraX=b.x+600*b.s+60;
 const ox=portrait?W/2-cameraX*scale:(W-STAGE.width*scale)/2,oy=portrait?0:(H-STAGE.height*scale)/2;
 ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.drawImage(images.environment,0,0,1671,941);
 ctx.save();ctx.translate(b.x,b.y+b.bob);ctx.scale(b.s,b.s);ctx.translate(620,1100);ctx.rotate(b.roll);ctx.translate(-620,-1100);
 // Restrained code-drawn wake is a preview effect, not an accepted water asset.
 if(!reduced&&b.p<1){ctx.save();ctx.strokeStyle=`rgba(222,253,251,${.18*(1-b.p)})`;ctx.lineWidth=5;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(30-i*48,1165+i*14,95+i*28,17,0,.15,Math.PI*1.2);ctx.stroke();}ctx.restore();}
 ctx.drawImage(images.boat,0,0,1254,1254);
 const pc=.32;ctx.drawImage(images.captain,275-670*pc,1090-1290*pc,images.captain.width*pc,images.captain.height*pc);
 if(showFriend){const f=.34;ctx.drawImage(images.friend,625-650*f,1080-1183*f,images.friend.width*f,images.friend.height*f);}
 // Original boat drawn again through a near-hull mask; source artwork stays unmodified.
 ctx.save();ctx.beginPath();FRONT.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.drawImage(images.boat,0,0,1254,1254);ctx.restore();ctx.restore();ctx.restore();
}

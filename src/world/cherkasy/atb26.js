// OWNER: cherkasy. АТБ at Ostafiia Dashkovycha 26, issue #28, OSM 157528369.
// Three-storey tiled street block with three wide window bays, cornice and raised centre parapet;
// charcoal shop frontage and illuminated red lettering. The photographed three-storey front overrides
// OSM's conflicting four-storey tag.
// References: Google Street View June 2015 (upper shell, formerly Silpo); Google Maps June 2026
// entrance photos (dark framing, red ATB lettering); the player's report of the black refurbishment.
// The rear window rhythm and the extent of the new cladding are approximations.
// ATB26_SKIP; buildAtb26({root,map,solids,zips,heightAt}) -> {footprints,clear,update} | null.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, area2, inPoly } from './geo.js';
import { edgeFaces, pt, panel, fbox, wall, win, decal, mats, finish } from './bldkit.js';
import { hipRoof } from './civic.js';

export const ATB26_SKIP = new Set([157528369]);
const TOP = 12.6, SHOP = 4.1;
const tileTex = () => canvasTex(128, 128, (g,w,h) => {
  g.fillStyle='#eee9dc';g.fillRect(0,0,w,h);
  g.strokeStyle='#c2bdb2';g.lineWidth=1;
  for(let i=0;i<=128;i+=16){g.beginPath();g.moveTo(i,0);g.lineTo(i,h);g.moveTo(0,i);g.lineTo(w,i);g.stroke();}
});
const logoTex = () => canvasTex(1024,256,(g,w,h)=>{
  g.fillStyle='#25272a';g.fillRect(0,0,w,h);
  g.textAlign='center';g.textBaseline='middle';g.font='italic 900 214px Arial';
  g.strokeStyle='#f5f0e5';g.lineWidth=6;g.strokeText('АТБ',w/2,h/2+4,730);
  g.fillStyle='#ee242d';g.fillText('АТБ',w/2,h/2+4,730);
},{repeat:false});

export function buildAtb26({root,map,solids:S,zips:Z,heightAt}) {
  const b=map.buildings.find(q=>ATB26_SKIP.has(q.id));if(!b)return null;
  const ring=ringPts(b.p),faces=edgeFaces(ring),front=faces.find(f=>f.nz>.9&&f.L>25);
  const base=Math.min(...ring.map(([x,z])=>heightAt(x,z)))-.35;
  const p=pt(front,front.L/2,0,1.8),floor=heightAt(p[0],p[2])+.22,Y=h=>floor+h;
  const B={wall:new MB(),det:new MB(),glass:new MB(),lit:new MB(),sign:new MB()},D=B.det;
  for(const f of faces){
    const street=f===front||f.nx>.9&&f.L>40,holes=[];
    const n=f===front?3:Math.max(1,Math.floor(f.L/4.4)),pitch=f.L/n;
    for(let row=0;row<2;row++)for(let i=0;i<n;i++){
      const s=pitch*(i+.5),w=f===front?6.5:Math.min(2.25,pitch-1);
      if(f.L<4)continue;
      holes.push({s0:s-w/2,s1:s+w/2,y0:Y(5.05+row*3.35),y1:Y(7.65+row*3.35),cols:f===front?4:2,rows:1,rev:'#ebe7de',glass:'#d3d8d7',sill:'#b9b6ac',lit:(i+row)%4===1});
    }
    if(f===front){
      for(const [a,b,door] of [[1.5,10,false],[11.3,18.9,true],[20.2,f.L-1.5,false]])holes.push({s0:a,s1:b,y0:Y(door?.01:.45),y1:Y(3.35),cols:door?4:5,rows:1,dep:.25,rev:'#2b2d30',glass:'#b6c1c3',lit:true});
    }else if(street){
      for(let s=4;s<f.L-2;s+=5.5)holes.push({s0:s-1.6,s1:s+1.6,y0:Y(.7),y1:Y(3.3),cols:2,rev:'#32353a',glass:'#a3acb0',lit:true});
    }else if(f.L>10){holes.push({s0:f.L*.5-.65,s1:f.L*.5+.65,y0:Y(.01),y1:Y(2.4),cols:1,rev:'#777872',glass:'#586365'});}
    B.wall.setColor('#ffffff');wall(B.wall,f,Y(SHOP),Y(TOP),holes,[1.6,1.6]);
    D.setColor(street?'#292c30':'#929187');wall(D,f,base,Y(SHOP),holes);
    for(const q of holes)win(B,f,q);
    // The original broad white inter-window panels, cornice and small dentils survive above the shop.
    if(f===front){for(let i=0;i<3;i++){const s=pitch*(i+.5);D.setColor('#dbddd6');fbox(D,f,s-3.25,s+3.25,Y(7.65),Y(8.36),0,.045,'f');}}
    D.setColor('#ece9df');fbox(D,f,-.08,f.L+.08,Y(TOP-.35),Y(TOP+.05),-.2,.2,'ftu');
    if(street)for(let s=.3;s<f.L;s+=.85)fbox(D,f,s,s+.22,Y(TOP-.6),Y(TOP-.35),0,.16,'flrtu');
    D.setColor('#42464b');fbox(D,f,0,f.L,Y(SHOP-.08),Y(SHOP+.03),0,.15,'ftu');
    const a=pt(f,0,0),e=pt(f,f.L,0);Z.edge(a[0],a[2],e[0],e[2],Y(TOP),f.nx,f.nz);
  }
  D.setColor('#909499');D.fill(ring,[],Y(TOP-.15),true);
  // Low hipped metal roofs over the three wings, leaving the open service courtyard untouched.
  D.setColor('#777e85');
  hipRoof(D,-36.1,163.6,-5.9,179.6,Y(TOP-.1),2.4);
  hipRoof(D,-35.9,144.9,-23.5,163.6,Y(TOP-.1),1.9);
  hipRoof(D,-15.9,124,-5.5,163.6,Y(TOP-.1),1.7);
  if(front){
    const f=front,L=f.L;
    D.setColor('#eeeae0');fbox(D,f,L/2-5.2,L/2+5.2,Y(TOP),Y(TOP+1.35),-.35,0,'flrtb');
    fbox(D,f,L/2-5.35,L/2+5.35,Y(TOP+1.3),Y(TOP+1.48),-.43,.06,'flrtu');
    // Dark fascia with a restrained illuminated sign; warm shop panes carry the evening scene.
    D.setColor('#24272b');fbox(D,f,.15,L-.15,Y(3.4),Y(4.7),-.03,.28,'flrtu');
    decal(B.sign,f,L/2-4.8,L/2+4.8,Y(3.5),Y(5.9),.3,[0,0,1,1]);
    D.setColor('#383c41');fbox(D,f,10.4,19.8,Y(3.25),Y(3.4),0,1.4,'flrtu');
    const poly=[[10.4,0],[19.8,0],[19.8,1.4],[10.4,1.4]].map(([s,o])=>{const q=pt(f,s,0,o);return[q[0],q[2]];});
    S.prism((area2(poly)<0?poly.reverse():poly).flat(),Y(3.25),Y(3.4),0,0,'awning',1);
    // A shallow paved apron follows the existing sidewalk, so no tall invisible step blocks the door.
    D.setColor('#a5a39d');
    for(let s=0;s<L;s+=2){const s1=Math.min(L,s+2),q0=pt(f,s,0,.15),q1=pt(f,s1,0,.15),q2=pt(f,s1,0,2.1),q3=pt(f,s,0,2.1);for(const q of [q0,q1,q2,q3])q[1]=heightAt(q[0],q[2])+.24;
      const ids=[q0,q1,q2,q3].map(q=>D.vert(...q,0,1,0));D.quad(ids[0],ids[1],ids[2],ids[3]);}
  }
  S.prism((area2(ring)<0?ring.slice().reverse():ring).flat(),base,Y(TOP),0,0,'wall');
  const sign=logoTex(),M=mats({wall:new THREE.MeshStandardMaterial({map:tileTex(),vertexColors:true,roughness:.85}),sign:new THREE.MeshStandardMaterial({map:sign,emissiveMap:sign,emissive:0xffffff,emissiveIntensity:.1,roughness:.45})});
  const st=finish(root,'atb26',B,M,['wall','det']);
  console.log(`[cherkasy] ATB26: ${st.verts} vertices, ${st.meshes} meshes`);
  return {footprints:[{poly:ring,h:Y(TOP+1.5)-base,kind:b.k,name:'АТБ'}],clear:(x,z)=>inPoly(ring,x,z)||(x>-37&&x<-4&&z>179&&z<182),update(){M.lit.emissiveIntensity=.7*nightK.value;M.sign.emissiveIntensity=.1+.85*nightK.value;}};
}

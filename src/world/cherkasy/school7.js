// OWNER: cherkasy. School No 7, Dobrovolchykh Batalioniv 13 (issue #29): the old two-storey U and newer
// three-storey pale-brick classroom block, gym, forecourt, and Odeska pedestrian bridge on OSM way 160513325.
// References: school7.ck.ua/history, ratelist.top/310000 facade photo, Procherk's 31 August 2025 bridge repair photos.
// SCHOOL7_SKIP replaces the two OSM schools. buildSchool7({root,map,solids,zips,heightAt}) ->
// {footprints,clear,update,bridge}. No terrain change: the bridge samples the finished rail cutting and road levels.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { OVERHANG } from '../collision.js';
import { FRAME_OF } from './frame.js';
import { inPoly, ringPts, rng } from './geo.js';
import { canvasTex } from './sculpt.js';
import { edgeFace, ringFaces, wall, win, rect, fbox, fsolid, quad, finish, UP } from './blockkit.js';
import { frame, sboxer, along, crossing, barTex } from './bridgekit.js';

export const SCHOOL7_SKIP = new Set([158065243, 158065244]);
export const SCHOOL7_BRIDGE_LL = [[49.4550059, 32.0193783], [49.4549888, 32.0210682]];
const STAIRS_LL = [[49.4551241, 32.0193781], [49.4548785, 32.0193772], [49.4549882, 32.0213345]];
function brickTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b2aba0'; g.fillRect(0, 0, w, h);
    const r = rng(703);
    for (let j = 0; j < 20; j++) for (let i = -1; i < 6; i++) {
      const v = Math.round(199 + r() * 22); g.fillStyle = `rgb(${v},${v - 5},${v - 18})`;
      g.fillRect(i * w / 6 + (j % 2) * w / 12 + 1, j * h / 20 + 1, w / 6 - 2, h / 20 - 2);
    }
  });
}

export function buildSchool7({ root, map, solids: S, heightAt }) {
  const schools = map.buildings.filter(b => SCHOOL7_SKIP.has(b.id));
  if (schools.length !== 2) return null;
  const B = { brick: new MB(), det: new MB(), glass: new MB(), lit: new MB(), rail: new MB() }, D = B.det, r = rng(1707);
  const footprints = [], clearPolys = [];
  for (const school of schools) {
    const parts = school.id === 158065243 ? school.parts : [{p: school.p, lv: 2}];
    for (const part of parts) {
      const poly = ringPts(part.p), inside = (x,z) => inPoly(poly,x,z), floors = part.lv;
      const hs = poly.map(p => heightAt(...p)), base = Math.min(...hs) - 0.4, floor = Math.max(...hs) + 0.35;
      const fh = school.id === 158065244 ? 4.1 : 3.2, top = floor + floors * fh + 0.3;
      for (const f of ringFaces(poly, inside)) {
        const newer = school.id === 158065243, front = newer && floors === 3 && f.nx < -0.9 && f.L > 50;
        const n = Math.max(1, Math.floor(f.L / (front ? 4.8 : 3.7))), sp = f.L / n;
        for (let k=0;k<floors;k++) for(let j=0;j<n;j++) {
          if (f.L < 3) continue;
          const s = (j+.5)*sp, door = front && k===0 && Math.abs(s-f.L/2)<5;
          const q = {s0:s-Math.min(front?1.5:1.1,sp*.34),s1:s+Math.min(front?1.5:1.1,sp*.34),y0:floor+k*fh+(door?0:.85),y1:floor+k*fh+2.65,
            dep:.22,cols:2,rows:2,rowAt:[.78],frame:'#efede6',glass:r()<.35?'#9aa5a8':'#546c78',lit:r()<.18};
          if(door) Object.assign(q,{door:'#47392f',leaf:1.9});
          f.holes.push(q);
        }
        B.brick.setColor('#ffffff'); wall(B.brick,f,floor,top,[1.5,1.5]);
        for(const q of f.holes) win(B,f,q);
        D.setColor('#777771'); fbox(D,f,0,f.L,base,floor,0,.07,17);
        D.setColor('#9b9b92'); fbox(D,f,-.08,f.L+.08,top,top+.12,-.25,.15,29);
        if(newer && floors===3) {
          B.brick.setColor('#eee4c8');
          for(let j=0;j<=n;j++) fbox(B.brick,f,Math.max(0,j*sp-.17),Math.min(f.L,j*sp+.17),floor,top+.18,0,.13,29,[1.5,1.5]);
        }
        if(front) {
          const mid=f.L/2;
          D.setColor('#c6a037'); fbox(D,f,mid-7,mid-3.5,floor,floor+1.1,0,1.15,29); fbox(D,f,mid+3.5,mid+7,floor,floor+1.1,0,1.15,29);
          D.setColor('#b6644d'); for(const s of [mid-7,mid-3.5,mid+3.5,mid+7]) fbox(D,f,s-.23,s+.23,floor,floor+3.1,0,1.3,29);
          D.setColor('#d0cbc0'); fbox(D,f,mid-7.3,mid+7.3,floor+2.95,floor+3.2,0,1.5); fsolid(S,f,mid-7.3,mid+7.3,0,1.5,floor+2.95,floor+3.2,'awning',OVERHANG);
          D.setColor('#8b8880'); for(let k=0;k<3;k++) fbox(D,f,mid-3.3,mid+3.3,floor-.45,floor-k*.15,0,1.7+k*.32,29);
        }
      }
      D.setColor('#666966'); const shape = new THREE.Shape(poly.map(([x,z])=>new THREE.Vector2(x,z)));
      const holes=[]; const tris=THREE.ShapeUtils.triangulateShape(shape.getPoints(),holes); const pts=shape.getPoints();
      for(const [a,b,c] of tris) { const ids=[a,c,b].map(i=>D.vert(pts[i].x,top,pts[i].y,0,1,0)); D.tri(...ids); }
      S.prism(part.p,base,top,0,0,'wall'); clearPolys.push(poly);
      footprints.push({poly,h:top-base,kind:'public',name:'Школа №7'});
    }
  }
  // Sample the paving every two metres: one large quad sinks below this undulating DEM.
  function drape(poly,color) {
    D.setColor(color); const [a,b,c,d]=poly;
    const point=(u,v)=>{const x=(1-v)*(a[0]+(b[0]-a[0])*u)+v*(d[0]+(c[0]-d[0])*u),z=(1-v)*(a[1]+(b[1]-a[1])*u)+v*(d[1]+(c[1]-d[1])*u);return [x,heightAt(x,z)+.24,z];};
    const nu=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2),nv=Math.ceil(Math.hypot(d[0]-a[0],d[1]-a[1])/2);
    for(let i=0;i<nu;i++)for(let j=0;j<nv;j++)quad(D,point(i/nu,j/nv),point((i+1)/nu,j/nv),point((i+1)/nu,(j+1)/nv),point(i/nu,(j+1)/nv),UP);
  }
  const court=[[-976,-2622],[-942,-2623],[-941,-2581],[-976,-2581]];
  drape(court,'#83837b');clearPolys.push(court);
  function stripe(A,C,w=.12) {
    const f=frame(A,C),n=Math.ceil(f.L/2);D.setColor('#eee9cf');
    for(let i=0;i<n;i++){const p=[f.at(f.L*i/n,-w/2),f.at(f.L*(i+1)/n,-w/2),f.at(f.L*(i+1)/n,w/2),f.at(f.L*i/n,w/2)];quad(D,...p.map(([x,z])=>[x,heightAt(x,z)+.27,z]),UP);}
  }
  function courtLines(f,L,W) {
    for(const o of [-W/2,W/2])stripe(f.at(0,o),f.at(L,o));
    for(const t of [0,L/2,L])stripe(f.at(t,-W/2),f.at(t,W/2));
    for(let i=0;i<32;i++)stripe(f.at(L/2+2.5*Math.cos(i*Math.PI/16),2.5*Math.sin(i*Math.PI/16)),f.at(L/2+2.5*Math.cos((i+1)*Math.PI/16),2.5*Math.sin((i+1)*Math.PI/16)));
  }
  // OSM915918457: grass soccer; OSM915918458: asphalt basketball (not another lawn).
  const soccer=frame([-985,-2562],[-952,-2562]), SL=soccer.L;
  courtLines(soccer,SL,17);
  for(const t of [0,SL]) {
    const y=heightAt(...soccer.at(t,0));D.setColor('#e5e4d7');
    const p=(o,h)=>{const [x,z]=soccer.at(t,o);return[x,y+h,z];};
    for(const o of [-2,2]){D.tube(p(o,0),p(o,2),.06,6);const [x,,z]=p(o,0);S.cyl(x,z,y,y+2,.06,.06,'pole');}
    D.tube(p(-2,2),p(2,2),.06,6);
    const inward=t===0?5:-5;stripe(soccer.at(t+inward,-4),soccer.at(t+inward,4));for(const o of [-4,4])stripe(soccer.at(t,o),soccer.at(t+inward,o));
  }
  const basket=[[-890.4,-2646.7],[-920.5,-2645.5],[-921.9,-2681.8],[-891.9,-2683]];
  drape(basket,'#777b77');clearPolys.push(basket);
  const bf=frame([-905.9,-2678],[-904.8,-2650]);courtLines(bf,bf.L,15);
  for(const t of [1,bf.L-1]) {
    const [x,z]=bf.at(t,0),y=heightAt(x,z);D.setColor('#697d70');D.cyl(x,y,z,.085,.085,3.9,6);S.cyl(x,z,y,y+3.9,.085,.085,'pole');
    D.setColor('#e2dfd0');D.box(x-.85,y+3,z-.06,x+.85,y+4,z+.06);
    D.setColor('#b66639');for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;D.tube([x+.24*Math.cos(a),y+3.05,z+.45+.24*Math.sin(a)],[x+.24*Math.cos(b),y+3.05,z+.45+.24*Math.sin(b)],.02,4);}
  }
  // Keep only the nearby road surfaces clear, preserving gardens and the forest beyond their verges.
  const roads=(map.roads??[]).filter(q=>q.k==='m' && q.p.some((v,i)=>i%2===0 && v>-1450&&v<-900 && q.p[i+1]>-3200&&q.p[i+1]<-2450)).map(q=>({p:ringPts(q.p),w:q.w/2+1.5}));

  const geo=FRAME_OF(map), ends=SCHOOL7_BRIDGE_LL.map(q=>geo.toXZ(...q)), F=frame(...ends), sb=sboxer(F), stairs=STAIRS_LL.map(q=>geo.toXZ(...q));
  // Seven metres above the stair feet also provides six metres below the beam over both carriageways.
  let deck=Math.max(...stairs.map(p=>heightAt(...p)))+7.2;
  for(const road of map.roads??[]) if(road.k==='m') for(let j=2;j<road.p.length;j+=2) {
    const c=crossing(ends,road.p.slice(j-2,j),road.p.slice(j,j+2));
    if(c) {const p=F.at(c.s,0);deck=Math.max(deck,heightAt(...p)+6.2);}
  }
  const width=3.0;
  function span(A,C,ya,yb,steps=0) {
    if(steps>20) {
      const f=frame(A,C),counts=[Math.floor(steps/3),Math.floor(steps/3),steps-2*Math.floor(steps/3)],run=(f.L-2)/steps;
      let t=0,n=0;
      for(let k=0;k<3;k++){
        const end=t+counts[k]*run,lo=ya+(yb-ya)*n/steps; n+=counts[k];const hi=ya+(yb-ya)*n/steps;
        span(f.at(t,0),f.at(end,0),lo,hi,counts[k]); t=end;
        if(k<2){span(f.at(t,0),f.at(t+1,0),hi,hi);t+=1;}
      }
      return;
    }
    const f=frame(A,C), box=sboxer(f), grade=t=>ya+(yb-ya)*t/f.L;
    const ns=steps||1;
    for(let i=0;i<ns;i++) {
      const a=f.L*i/ns,b=f.L*(i+1)/ns,h=steps?grade(b):null;
      D.setColor('#a09e92'); box(D,a,b,-width/2,width/2,t=>(h??grade(t))-.35,t=>h??grade(t));
      const bx=(yb-ya)/f.L*f.ux,bz=(yb-ya)/f.L*f.uz;
      S.prism([f.at(a,-width/2),f.at(b,-width/2),f.at(b,width/2),f.at(a,width/2)],Math.min(grade(a),grade(b))-.45,ya-bx*A[0]-bz*A[1],bx,bz,'bridge',OVERHANG);
    }
    D.setColor('#cbb34b');
    for(const o of [-width/2,width/2]) {
      box(D,0,f.L,o-.05,o+.05,t=>grade(t)+1.03,t=>grade(t)+1.12);
      box(D,0,f.L,o-.035,o+.035,t=>grade(t)+.18,t=>grade(t)+.24);
      for(let t=0;t<=f.L;t+=1.5) box(D,t-.035,t+.035,o-.035,o+.035,()=>grade(t)+.2,()=>grade(t)+1.08);
      const p=(t,y)=>{const q=f.at(t,o);return [q[0],grade(t)+y,q[1]];};
      B.rail.setColor('#cbb34b'); quad(B.rail,p(0,.23),p(f.L,.23),p(f.L,1.04),p(0,1.04),[f.nx,0,f.nz],[[0,0],[f.L/.15,0],[f.L/.15,1],[0,1]]);
      S.prism([f.at(0,o-.06),f.at(f.L,o-.06),f.at(f.L,o+.06),f.at(0,o+.06)],Math.min(ya,yb),ya+1.12-(yb-ya)/f.L*(f.ux*A[0]+f.uz*A[1]),(yb-ya)/f.L*f.ux,(yb-ya)/f.L*f.uz,'railing',OVERHANG);
    }
  }
  span(...ends,deck,deck);
  span(stairs[0],ends[0],heightAt(...stairs[0])+.1,deck,43);
  span(stairs[1],ends[0],heightAt(...stairs[1])+.1,deck,43);
  span(stairs[2],ends[1],heightAt(...stairs[2])+.1,deck,47);
  // Piers only in clear ground: do not put a support in either carriageway or the railway.
  const obstacles=[...(map.roads??[]).filter(q=>q.k==='m').map(q=>({p:ringPts(q.p),w:q.w/2+2})),...(map.rails??[]).map(q=>({p:ringPts(q.p),w:4}))];
  for(let t=0;t<=F.L;t+=15) {
    const p=F.at(t,0); if(obstacles.some(q=>along(q.p,...p).d<q.w)) continue;
    const g=heightAt(...p); D.setColor('#9b998b'); sb(D,t-.38,t+.38,-1.15,1.15,()=>g-.3,()=>deck-.35);
    S.prism([F.at(t-.38,-1.15),F.at(t+.38,-1.15),F.at(t+.38,1.15),F.at(t-.38,1.15)],g-.3,deck-.35,0,0,'pillar');
  }
  const M={rail:new THREE.MeshStandardMaterial({vertexColors:true,alphaMap:barTex(),alphaTest:.5,side:THREE.DoubleSide,roughness:.8}),brick:new THREE.MeshStandardMaterial({map:brickTexture(),vertexColors:true,roughness:.9}),det:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8}),glass:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.2,metalness:.25}),lit:new THREE.MeshStandardMaterial({vertexColors:true,emissive:0xffdbaa,emissiveIntensity:0})};
  D.setColor('#6b7070');
  for(const t of [2,F.L/2,F.L-2]) {
    const [x,z]=F.at(t,1.32); D.cyl(x,deck,z,.065,.05,4.5,6);
    const [a,b]=F.at(t,-.1); D.tube([x,deck+4.45,z],[a,deck+4.65,b],.045,5);
    B.lit.setColor('#e9dfb4'); B.lit.box(a-.3,deck+4.52,b-.13,a+.3,deck+4.62,b+.13);
  }
  const stats=finish(root,'school7',B,M,['brick','det']);
  console.log(`[cherkasy] School 7 and Odeska footbridge: ${stats.verts} verts, ${stats.meshes} meshes`);
  return { footprints, bridge:{ends,deck,width}, clear(x,z) {return clearPolys.some(p=>inPoly(p,x,z) || along([...p,p[0]],x,z).d<4) || (x>-1450 && x<-900 && z>-3200 && z<-2450 && roads.some(q=>along(q.p,x,z).d<q.w)) || along(ends,x,z).d<2;},update(){M.lit.emissiveIntensity=nightK.value*.8;} };
}

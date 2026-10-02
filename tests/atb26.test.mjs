// The refurbished ATB keeps its courtyard open and replaces only the requested OSM building.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildAtb26,ATB26_SKIP} from '../src/world/cherkasy/atb26.js';
import {createCollisionWorld} from '../src/world/collision.js';
const ctx=new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true});
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>ctx,style:{}})};
const map={buildings:JSON.parse(fs.readFileSync(new URL('../public/assets/cherkasy/map_buildings.json',import.meta.url)))};
const root=new THREE.Group(),solids=createCollisionWorld({terrain:()=>30});
const site=buildAtb26({root,map,solids,heightAt:()=>30,zips:{edge(){}}});
assert.deepEqual([...ATB26_SKIP],[157528369]);
assert.equal(site.footprints.length,1);
assert.ok(site.clear(-25,175));assert.ok(!site.clear(-20,150),'courtyard remains open');
assert.ok(solids.groundHeight(-25,175,46)>42,'building collision present');
assert.equal(solids.groundHeight(-20,150,46),30,'no invisible courtyard wall');
let vertices=0;root.traverse(m=>{if(m.isMesh){const p=m.geometry.attributes.position.array;vertices+=p.length/3;assert.ok(p.every(Number.isFinite));}});
assert.ok(vertices<18000,`${vertices} vertices`);site.update();
console.log(`atb26: all ok (${vertices} vertices)`);

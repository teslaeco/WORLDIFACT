import * as T from 'three';

// Adapted from Terraforming-Planet/Polar-Sun-Moon-Analysis
// web/src/CleanRealisticEarthGlobe.tsx @ c91d59eafb87cf9657f8bf78a5e431fb35665849 (MIT).
// The simulator reuses the same official NASA GIBS imagery products used by Terra Observation.
export const TERRA_EARTH_SOURCE_COMMIT='c91d59eafb87cf9657f8bf78a5e431fb35665849';
export const TERRA_EARTH_SOURCE_URL='https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/';
export const NASA_GIBS_WMS='https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
export const NASA_BLUE_MARBLE='BlueMarble_ShadedRelief_Bathymetry';
export const NASA_VIIRS_TRUE_COLOR='VIIRS_SNPP_CorrectedReflectance_TrueColor';

function completeUtcDay(){
 const date=new Date(Date.now()-24*60*60*1000);
 return date.toISOString().slice(0,10);
}
function gibsMapUrl(layer,time){
 const params=new URLSearchParams({
  SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.1.1',LAYERS:layer,STYLES:'',FORMAT:'image/jpeg',
  TRANSPARENT:'false',SRS:'EPSG:4326',BBOX:'-180,-90,180,90',WIDTH:'2048',HEIGHT:'1024'
 });
 if(time)params.set('TIME',time);
 return `${NASA_GIBS_WMS}?${params.toString()}`;
}
function texture(url,onReady,onError){
 const loader=new T.TextureLoader();loader.setCrossOrigin('anonymous');
 loader.load(url,tex=>{tex.colorSpace=T.SRGBColorSpace;tex.wrapS=T.RepeatWrapping;tex.needsUpdate=true;onReady(tex);},undefined,onError);
}

export function makeTerraObservationEarth(){
 const group=new T.Group();group.name='Terra_Observation_Earth_NASA_GIBS';
 group.position.set(20,-270,-90);
 const material=new T.MeshBasicMaterial({color:0xffffff});
 const globe=new T.Mesh(new T.SphereGeometry(221,72,48),material);
 globe.name='Terra_Earth_official_imagery_backdrop';group.add(globe);
 const atmosphere=new T.Mesh(
  new T.SphereGeometry(225,64,40),
  new T.MeshBasicMaterial({color:0x63bfff,transparent:true,opacity:.09,side:T.BackSide,depthWrite:false})
 );
 atmosphere.name='Terra_Earth_atmosphere';group.add(atmosphere);
 const day=completeUtcDay();
 const fallback=()=>texture(gibsMapUrl(NASA_BLUE_MARBLE),tex=>{
  material.map=tex;material.needsUpdate=true;
  group.userData.imagery={status:'REAL BASE / VISUAL BACKDROP',layer:NASA_BLUE_MARBLE,date:null};
 },()=>{
  material.map=null;material.color.setHex(0x245a85);material.needsUpdate=true;
  group.userData.imagery={status:'BLOCKED',layer:null,date:null};
 });
 texture(gibsMapUrl(NASA_VIIRS_TRUE_COLOR,day),tex=>{
  material.map=tex;material.needsUpdate=true;
  group.userData.imagery={status:'REAL / DATED NASA GIBS VISUAL',layer:NASA_VIIRS_TRUE_COLOR,date:day};
 },fallback);
 group.userData.source={
  project:'Terra Observation',url:TERRA_EARTH_SOURCE_URL,commit:TERRA_EARTH_SOURCE_COMMIT,
  imagery:'NASA GIBS',observationEvidence:false,
  note:'EVA visual backdrop reused from Terra Observation imagery logic. Verify source/date in Terra for scientific observation.'
 };
 return group;
}

// SPDX-License-Identifier: Apache-2.0
// Original game modes and vehicle tuning. No third-party game assets.
export const MODES = Object.freeze({
  supercar: Object.freeze({id:'supercar',title:'VELOCITY II',subtitle:'The Supercar Tour',kind:'circuit',laps:3,courseMeters:2200,defaultTrack:'alpine',rivals:5,traffic:true,combat:false}),
  coast: Object.freeze({id:'coast',title:'COAST RUN',subtitle:'The Endless Summer',kind:'checkpoint',laps:1,courseMeters:5200,defaultTrack:'coast',rivals:6,traffic:true,combat:false}),
  wasteland: Object.freeze({id:'wasteland',title:'OUTLAND ROAD',subtitle:'Road Wars',kind:'combat',laps:2,courseMeters:2500,defaultTrack:'desert',rivals:7,traffic:true,combat:true})
});
export const TRACKS = Object.freeze({
  alpine: Object.freeze({id:'alpine',name:'Alpine Pass',sky:'#739bb6',horizon:'#b5c9c7',mountain:'#667e88',mountain2:'#9cabae',ground:'#527256',grass:'#527256',grass2:'#42634d',road:'#555b63',road2:'#60656b',rumble:'#dce1df',stripe:'#d7cf87',curve:1.2,hills:1.3}),
  canyon: Object.freeze({id:'canyon',name:'Redrock Canyon',sky:'#d4a17d',horizon:'#ffd5a0',mountain:'#a85d4b',mountain2:'#cb896a',ground:'#a96746',grass:'#a96746',grass2:'#9b5b3f',road:'#515257',road2:'#5e6064',rumble:'#f7d4b3',stripe:'#f9e1a2',curve:1.5,hills:.85}),
  coast: Object.freeze({id:'coast',name:'Sunset Boulevard',sky:'#4962a2',horizon:'#f4a887',mountain:'#40375e',mountain2:'#5b5274',ground:'#477a6a',grass:'#477a6a',grass2:'#35695d',road:'#555963',road2:'#616471',rumble:'#eecfba',stripe:'#fff2a8',curve:1.0,hills:.65}),
  desert: Object.freeze({id:'desert',name:'Wasteland Highway',sky:'#8a6556',horizon:'#edab6c',mountain:'#5c443c',mountain2:'#88634c',ground:'#83614a',grass:'#83614a',grass2:'#75513f',road:'#3f4147',road2:'#4b4b50',rumble:'#c68b69',stripe:'#eac67f',curve:1.0,hills:.5})
});
export const CARS = Object.freeze({
  comet: Object.freeze({id:'comet',name:'COMET V12',speed:90,acceleration:18,handling:1.0,color:'#ff5c55'}),
  vector: Object.freeze({id:'vector',name:'VECTOR GT',speed:84,acceleration:22,handling:1.2,color:'#37d9f1'}),
  phantom: Object.freeze({id:'phantom',name:'PHANTOM R',speed:97,acceleration:15,handling:.88,color:'#edda9a'}),
  bruiser: Object.freeze({id:'bruiser',name:'BRUISER 6×6',speed:76,acceleration:17,handling:.75,color:'#ffb54e'})
});
export function modeSettings(mode, track, car) {
  if(!Object.hasOwn(MODES,mode)) throw new RangeError('Unknown race mode');
  const m=MODES[mode], t=track||m.defaultTrack, c=car||(m.combat?'bruiser':'comet');
  if(!Object.hasOwn(TRACKS,t)||!Object.hasOwn(CARS,c)) throw new RangeError('Unknown track or vehicle');
  return Object.freeze({mode:m,track:TRACKS[t],car:CARS[c]});
}

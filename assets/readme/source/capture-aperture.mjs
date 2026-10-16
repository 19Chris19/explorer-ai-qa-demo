// Run through ego-browser nodejs, inside an authorized existing preview space.
const fs=await import('node:fs/promises');
const path=await import('node:path');
const {pathToFileURL}=await import('node:url');
const {spaceId,directory}=globalThis.readmeCapture??{};
if(!Number.isInteger(spaceId)||!directory)throw new Error('Set globalThis.readmeCapture with spaceId and directory');
const task=await taskSpace(spaceId);
const tabs=await task.tabs();
const existing=tabs.find(tab=>tab.url.endsWith('/aperture-journey.html'));
if(!existing)throw new Error('Open the local aperture preview in this authorized space first');
const page=existing.label?task.page(existing.label):await task.adopt(existing.page);
await page.goto(pathToFileURL(path.join(directory,'aperture-journey.html')).href);
await page.waitForFunction(()=>window.previewReady);
await fs.mkdir(path.join(directory,'frames'),{recursive:true});
// Explicit time sampling makes exports independent of UI load and display refresh rate.
const fps=24,count=144;
for(let start=0;start<count;start+=16){
 const frames=await page.evaluate(({start,end,fps})=>{
  const original=document.querySelector('canvas');
  const output=document.createElement('canvas');output.width=900;output.height=593;
  const paint=output.getContext('2d');const frames=[];
  for(let index=start;index<end;index++){
   freezeAt(Math.min(index/fps,4.8));paint.drawImage(original,0,0,900,593);
   frames.push({index,png:output.toDataURL('image/png').split(',')[1]});
  }
  return frames;
 },{start,end:Math.min(count,start+16),fps});
 for(const frame of frames)await fs.writeFile(path.join(directory,'frames',`frame-${String(frame.index).padStart(4,'0')}.png`),Buffer.from(frame.png,'base64'));
}
await page.evaluate(()=>freezeAt(0));
console.log({frames:count,fps,width:900,height:593,duration:count/fps,directory});

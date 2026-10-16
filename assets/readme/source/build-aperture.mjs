import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source=dirname(fileURLToPath(import.meta.url));
const root=resolve(source,'../../..');
if(!process.argv[2])throw new Error('Usage: node build-aperture.mjs <output-directory>');
const output=resolve(process.argv[2]);
const screenshot=await readFile(resolve(source,'../screenshots/welcome-desktop.png'));
const logo=await readFile(resolve(root,'public/site/logo.png'));
const template=await readFile(resolve(source,'aperture-journey.template.html'),'utf8');
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'aperture-journey.html'),template
 .replace('SCREENSHOT_DATA',`data:image/png;base64,${screenshot.toString('base64')}`)
 .replace('LOGO_DATA',`data:image/png;base64,${logo.toString('base64')}`));
console.log(resolve(output,'aperture-journey.html'));

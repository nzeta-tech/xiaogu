import {createHash,randomUUID} from "node:crypto";
import {createReadStream} from "node:fs";
import {mkdir,stat,rename,rm} from "node:fs/promises";
import path from "node:path";

export async function mediaFingerprint(file){
  const hash=createHash("sha256");
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest("hex");
}

// Job-local, content-addressed clips are published only after a successful render.
export async function cachedVideoShot(dir,identity,render){
  await mkdir(dir,{recursive:true,mode:0o700});
  const key=createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const file=path.join(dir,`shot-${key}.mp4`);
  try{if((await stat(file)).size>0)return file;}catch(error){if(error.code!=="ENOENT")throw error;}
  const temporary=path.join(dir,`shot-${key}-${randomUUID()}.mp4`);
  try{
    await render(temporary);
    if((await stat(temporary)).size===0)throw new Error("Empty rendered shot");
    await rename(temporary,file);
    return file;
  }finally{await rm(temporary,{force:true});}
}

/** Opt-in destructive rehearsal on task-owned LOOPBACK fixtures only. Never loads .env. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const root=resolve(process.env.BUFFALO_RELEASE_FIXTURE ?? '.tmp/phase5');
assert(root.startsWith(resolve('.tmp')+'/'),'TASK_FIXTURE_REQUIRED');
const c=JSON.parse(readFileSync(root+'/stack-private.json','utf8'));
assert.equal(c.task,'jaothui-buffalo-write-integrity-phase5');
for(const key of ['databaseUrl','storageUrl','restUrl','gatewayUrl']) assert.equal(new URL(c[key]).hostname,'127.0.0.1');
assert(new URL(c.databaseUrl).pathname.includes('integrity'));
const sql=(text)=>{
  const label=spawnSync('docker',['inspect','--format','{{ index .Config.Labels "oracle.task" }}',c.prefix+'-pg'],{encoding:'utf8'});
  assert.equal(label.stdout.trim(),c.task);
  const run=spawnSync('docker',['exec','-i',c.prefix+'-pg','psql','-U','postgres','-d','jaothui_integrity_p5','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',timeout:45000});
  if(run.status!==0) throw Error('ISOLATED_SQL_FAILED: '+run.stderr.slice(0,1200));
  return run.stdout;
};
const checks=[];
const check=(name,ok)=>{assert(ok,name);checks.push({name,state:'PASS'});};
const client=(role)=>createClient(c.gatewayUrl,c.tokens.anon,{global:{headers:{Authorization:'Bearer '+c.tokens[role]}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const admin=createClient(c.gatewayUrl,c.tokens.service_role,{auth:{persistSession:false,autoRefreshToken:false}});
const db=new PrismaClient({datasources:{db:{url:c.databaseUrl}}});
const digest=b=>createHash('sha256').update(b).digest('hex');
const get=async(bucket,key)=>{const r=await admin.storage.from(bucket).download(key);if(r.error)return null;return Buffer.from(await r.data.arrayBuffer());};
const put=async(bucket,key,bytes)=>{const r=await admin.storage.from(bucket).upload(key,bytes,{contentType:'application/octet-stream',upsert:false});assert(!r.error,r.error?.message);};
const rest=async(role,table,method,body,query='')=>{
  const r=await fetch(c.gatewayUrl+'/rest/v1/'+table+query,{method,headers:{apikey:c.tokens.anon,Authorization:'Bearer '+c.tokens[role],'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.text()};
};
const id=randomUUID(), serial=String(Date.now()).slice(-9), chip='999005'+serial;
const bytes=Buffer.from('original-'+id), changed=Buffer.from('unauthorized-'+id);
const source={microchip:chip,name:'Synthetic policy cow',certNo:null,birthday:new Date('2024-06-30T00:00:00Z'),sex:'Male',origin:'thai',height:145,color:'Black',createdAt:'1700000000000',updatedAt:'1700000000000',detail:'policy-fixture',dna:'',rarity:'Normal',tokenId:1999000001n};
try {
  await db.pedigree.create({data:source});
  const inventory=await db.microchip.create({data:{microchip:chip}});
  const reward=await db.reward.create({data:{id:'p5-'+id,microchip:chip,eventName:'Synthetic',rewardName:'Original'}});
  const baseline=await client('anon').storage.from('slipstorage').upload('operations/'+ 'a'.repeat(64)+'/'+id+'/legacy.txt',bytes);
  check('legacy permissive anonymous protected upload reproduced only in isolated baseline',!baseline.error);
  const sqlText=readFileSync('release/buffalo-integrity/cutover.sql','utf8');
  sql(sqlText);
  for(const role of ['anon','authenticated']) {
    for(const bucket of ['slipstorage','test']) {
      const keys=['buffalo/1999'+serial+(role==='anon'?'1':'2')+'.jpg','json/1999'+serial+(role==='anon'?'1':'2')+'.json','operations/'+'b'.repeat(64)+'/'+id+'/source-'+role+'.jpg'];
      for(const key of keys) {
        await put(bucket,key,bytes);
        const s=client(role).storage.from(bucket),fresh=key.replace(/(\.[a-z]+)$/,'-new$1');
        await s.upload(fresh,changed);check(`${role} ${bucket}/${key} insert denied`,await get(bucket,fresh)===null);
        await s.update(key,changed);check(`${role} ${bucket}/${key} update unchanged`,digest(await get(bucket,key))===digest(bytes));
        await s.upload(key,changed,{upsert:true});check(`${role} ${bucket}/${key} upsert unchanged`,digest(await get(bucket,key))===digest(bytes));
        await s.remove([key]);check(`${role} ${bucket}/${key} delete unchanged even if API returns200`,digest(await get(bucket,key))===digest(bytes));
        const target='avatar/out-'+id+'-'+key.split('/').at(-1);
        await s.move(key,target);check(`${role} move out of protected source denied`,digest(await get(bucket,key))===digest(bytes)&&await get(bucket,target)===null);
        const outside='avatar/in-'+role+'-'+id+'-'+key.split('/').at(-1);await put(bucket,outside,bytes);
        const into=key.replace(/(\.[a-z]+)$/,'-moved$1');
        await s.move(outside,into);check(`${role} move into protected destination denied`,digest(await get(bucket,outside))===digest(bytes)&&await get(bucket,into)===null);
      }
    }
    for(const [table,where,patch,insert] of [
      ['Pedigree','?microchip=eq.'+chip,{name:'Tampered'},{...source,microchip:(role==='anon'?'999006':'999007')+serial,tokenId:'1999000002'}],
      ['Microchip','?id=eq.'+inventory.id,{sold:true},{microchip:chip+'1'}],
      ['Reward','?id=eq.'+reward.id,{rewardName:'Tampered'},{id:'bad-'+id,microchip:chip,eventName:'bad',rewardName:'bad'}],
    ]) {
      const payload=JSON.parse(JSON.stringify(insert,(_k,v)=>typeof v==='bigint'?v.toString():v));
      check(`${role} ${table} insert denied`,(await rest(role,table,'POST',payload)).status>=400);
      await rest(role,table,'PATCH',patch,where);await rest(role,table,'DELETE',undefined,where);
      const read=await rest(role,table,'GET',undefined,where);check(`${role} ${table} public SELECT remains`,read.status===200&&JSON.parse(read.body).length===1);
    }
    check(`${role} table rows unchanged`,(await db.pedigree.findUniqueOrThrow({where:{microchip:chip}})).name===source.name&&!(await db.microchip.findUniqueOrThrow({where:{id:inventory.id}})).sold&&(await db.reward.findUniqueOrThrow({where:{id:reward.id}})).rewardName==='Original');
    const privateRead=await fetch(c.gatewayUrl+'/rest/v1/operation?select=id',{headers:{apikey:c.tokens.anon,Authorization:'Bearer '+c.tokens[role],'Accept-Profile':'buffalo_integrity'}});
    check(`${role} private ledger inaccessible`,privateRead.status>=400);await privateRead.text();
    for(const folder of ['avatar','reward','dna','slips']) {
      const key=folder+'/'+role+'-'+id+'.jpg';const s=client(role).storage.from('slipstorage');
      const a=await s.upload(key,bytes);const b=await s.update(key,changed);
      check(`${role} unaffected ${folder} upload/update retained`,!a.error&&!b.error&&digest(await get('slipstorage',key))===digest(changed));
    }
  }
  const writer=client('buffalo_integrity_writer').storage.from('slipstorage');
  const owned='operations/'+'c'.repeat(64)+'/'+id+'/source.jpg';
  check('scoped writer creates immutable operation object',!(await writer.upload(owned,bytes)).error);
  await writer.update(owned,changed);check('scoped writer cannot overwrite immutable operation object',digest(await get('slipstorage',owned))===digest(bytes));
  const alias='buffalo/1888'+serial+'.jpg';
  check('scoped writer creates compatibility alias',!(await writer.upload(alias,bytes)).error);
  check('scoped writer updates own compatibility alias',!(await writer.update(alias,changed)).error);
  for(const bucket of ['slipstorage','test','cards']) for(const key of ['avatar/denied-'+id+'.jpg','json/1777'+serial+'.json']) {
    if(bucket==='slipstorage'&&key.startsWith('json/'))continue;
    await client('buffalo_integrity_writer').storage.from(bucket).upload(key,bytes);
    check('writer denied unrelated '+bucket+'/'+key,await get(bucket,key)===null);
  }
  const publicRead=await fetch(c.gatewayUrl+'/storage/v1/object/public/slipstorage/'+alias);
  check('ordinary public alias HTTP read matches latest bytes',publicRead.status===200&&digest(Buffer.from(await publicRead.arrayBuffer()))===digest(changed));
  const nextChip=chip+'-server';await db.pedigree.update({where:{microchip:chip},data:{microchip:nextChip}});
  check('authorized Prisma update and Reward FK cascade retained',(await db.reward.findUniqueOrThrow({where:{id:reward.id}})).microchip===nextChip);
  const catalog=await db.$queryRawUnsafe(`SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relname IN('Pedigree','Reward','Microchip')`);
  check('scoped three tables RLS enabled',catalog.length===3&&catalog.every(x=>x.relrowsecurity));
  // Rollback removes writer authority, never removes protective policies or historical rows.
  sql(readFileSync('release/buffalo-integrity/rollback.sql','utf8'));
  await writer.update(alias,bytes);check('compatible rollback actually disables scoped writer despite PUBLIC policies',digest(await get('slipstorage',alias))===digest(changed));
  const denied=await client('anon').storage.from('slipstorage').upload('json/1666'+serial+'.json',bytes);
  check('rollback does not reopen anonymous writes',!!denied.error);
  check('rollback preserves published DB row',(await db.pedigree.findUniqueOrThrow({where:{microchip:nextChip}})).name===source.name);
  const proof={at:new Date().toISOString(),environment:'LOCAL_ONLY official PG15.1/StorageAPI1.81.0/PostgREST14.18',checks,passed:checks.length,productionWrites:0,fixtureId:id,rollbackApplied:true,sqlHash:digest(Buffer.from(sqlText))};
  writeFileSync(root+'/release-policy-proof.json',JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,proof:root+'/release-policy-proof.json',productionWrites:0}));
} finally {await db.$disconnect();}

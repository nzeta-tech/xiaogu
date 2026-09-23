import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { spokenVideoCompletion } from "./video-completion.ts";

const url=process.env.VIDEO_COMPLETION_TEST_DATABASE_URL;
test("three-round released video charges once; missing reports cannot publish",{skip:!url},async()=>{
  assert.ok(["localhost","127.0.0.1"].includes(new URL(url).hostname));
  const client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:10000});
  await client.connect();
  try{
    // All objects live in a unique transaction-local test schema and are rolled back.
    await client.query("begin");
    const schema=`video_completion_test_${randomUUID().replaceAll("-","")}`;
    await client.query(`create schema ${schema}`);
    await client.query(`set local search_path to ${schema}`);
    await client.query("create table usage_logs(user_id uuid,action_type text,quota_cost integer,metadata jsonb)");
    await client.query("create table digital_human_video_jobs(id uuid primary key,user_id uuid,status text,quota_cost integer)");
    const migration=await readFile(new URL("../../../migrations/084_paid_application_access.sql",import.meta.url),"utf8");
    const start=migration.indexOf("create unique index if not exists usage_logs_digital_video_once");
    assert.ok(start>0);
    await client.query(migration.slice(start));
    const job=randomUUID(),user=randomUUID();
    await client.query("insert into digital_human_video_jobs values($1,$2,'processing',10)",[job,user]);
    const deliver=async(result)=>{
      const decision=spokenVideoCompletion(result);
      await client.query("update digital_human_video_jobs set status=$2 where id=$1",[job,decision.completed?"completed":"failed"]);
    };
    const count=async()=>Number((await client.query("select count(*) as n from usage_logs")).rows[0].n);
    await deliver({status:"completed",videoUrl:"https://example.com/bad.mp4",qualityReview:[1,2,3].map(attempt=>({attempt,pass:false,issues:["脸部变形"]}))});
    assert.equal(await count(),1);
    await deliver({status:"completed",videoUrl:"https://example.com/no-report.mp4"});
    assert.equal(await count(),1);
    const good={status:"completed",videoUrl:"https://example.com/good.mp4",qualityReview:[{attempt:1,pass:true,issues:[]}]};
    await deliver(good);await deliver(good);
    assert.equal(await count(),1);
    assert.equal((await client.query("select quota_cost from usage_logs")).rows[0].quota_cost,10);
  }finally{await client.query("rollback").catch(()=>{});await client.end();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('./workspace-visibility.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
for(const mode of ['production','development','test']) {
  test(`released spoken application visible in ${mode}; deferred applications stay hidden`,()=>{
    const exports={};vm.runInNewContext(code,{exports,process:{env:{NODE_ENV:mode}}});
    assert.equal(exports.hiddenWorkspaceCardSlugs.has('digital-human-video'),false);
    assert.equal(exports.hiddenWorkspaceCardSlugs.has('write-copy'),true);
  });
}

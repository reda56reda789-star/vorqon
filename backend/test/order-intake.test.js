const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { installStubs } = require('./stub');
const { ORDERING_ENABLED, rejectNewOrders } = require('../src/middleware/orderIntake');

test('sales are hard-paused, before either new-order handler can touch a database', async () => {
  let writes = 0, reads = 0, authCalls = 0;
  const db = { order: { findMany: async () => { reads++; return []; }, findFirst: async () => null } };
  const restore = installStubs(new Map([
    [r => r.endsWith('/utils/db'), db],
    [r => r.endsWith('/middleware/auth'), { authenticate: (req,res,next) => { authCalls++;req.user={id:'test-customer',role:'customer'};next(); } }],
    [r => r.endsWith('/middleware/rbac'), { requireRole: () => (req,res,next)=>next() }],
    [r => r.endsWith('/services/orders'), { createOrderWithSplit: async () => { writes++; throw new Error('An order must never be created'); } }],
  ]));
  let router;
  try { delete require.cache[require.resolve('../src/routes/orders')]; router = require('../src/routes/orders'); }
  finally { restore(); }
  const app=express(); app.use(express.json());
  app.use((req,res,next)=>{req.lang='en';next()});app.use('/api/orders',router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  const base=`http://127.0.0.1:${server.address().port}/api/orders`;
  try {
    assert.equal(ORDERING_ENABLED,false);
    for(const route of ['/guest','/checkout','/guest/','/checkout/?lang=ar']) {
      const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:{name:'Test',phone:'01000000000',city:'Test',address:'Test'},items:[{productId:'11111111-1111-4111-8111-111111111111',quantity:1}]})});
      assert.equal(r.status,503,route);assert.equal((await r.json()).code,'ORDERING_PAUSED');assert.equal(r.headers.get('cache-control'),'no-store');
    }
    assert.equal(authCalls,0,'The pause must run before authentication');assert.equal(reads,0);
    const status=await fetch(base+'/availability');assert.equal(status.status,200);assert.equal((await status.json()).orderingEnabled,false);
    const history=await fetch(base);assert.equal(history.status,200);assert.deepEqual((await history.json()).orders,[]);assert.equal(reads,1);
    assert.equal(writes,0);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('the pause is localized and read operations pass through',()=>{
  let advanced=0;
  for(const method of ['GET','HEAD','OPTIONS','PATCH']) rejectNewOrders({method},{},()=>advanced++);
  assert.equal(advanced,4);
  const res={set(){return this},status(n){this.code=n;return this},json(data){this.data=data;return this}};
  rejectNewOrders({method:'POST',lang:'ar'},res,()=>advanced++);
  assert.equal(res.code,503);assert.match(res.data.error,/متوقف/);assert.equal(advanced,4);
});

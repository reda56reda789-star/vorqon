// Shared stub-harness plumbing for the backend route tests.
//
// The backend's node_modules are not installed in this environment, so
// the harnesses intercept Module._load and hand the route under test
// fake versions of its dependencies (express, the Prisma client in
// utils/db, auth middleware, third-party packages). Everything else
// (utils/i18n, services with no external deps) loads for real.
//
// Usage:
//   const { installStubs, fakeExpress, invoke } = require('./stub');
//   const restore = installStubs(new Map([
//     [(req) => req === 'express', fakeExpress()],
//     [(req) => req.endsWith('/utils/db'), fakePrisma],
//   ]));
//   const router = require('../src/routes/cart');
//   restore();
//   const res = await invoke(router, 'POST', '/items', { __user: {...}, body: {...} });
const Module = require('module');

function installStubs(matchers) {
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    for (const [matches, exportsObj] of matchers) {
      if (matches(request, parent)) return exportsObj;
    }
    return original.apply(this, arguments);
  };
  return () => { Module._load = original; };
}

// Minimal express stand-in: records routes + middleware so a harness
// can invoke a handler chain directly with fake req/res objects.
function fakeExpress() {
  function Router() {
    const routes = [];
    const middlewares = [];
    const router = { routes, middlewares };
    for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
      router[method] = (path, ...handlers) => {
        routes.push({ method: method.toUpperCase(), path, handlers });
        return router;
      };
    }
    router.use = (...handlers) => { middlewares.push(...handlers); return router; };
    return router;
  }
  const express = () => { throw new Error('express() app is not supported by the harness'); };
  express.Router = Router;
  express.json = () => (req, res, next) => next();
  express.urlencoded = () => (req, res, next) => next();
  express.static = () => (req, res, next) => next();
  return express;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    finished: false,
    _notify: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.finished = true; if (this._notify) this._notify(); return this; },
    send(payload) { this.body = payload; this.finished = true; if (this._notify) this._notify(); return this; },
  };
}

// Run router-level middleware + the matched route's handlers in order.
// Middleware in this codebase calls next() without awaiting it, so
// completion is detected via the response being written (res.json /
// res.send) or the chain running out — not via the outermost next()
// resolving. Errors passed to next(err) or thrown are rethrown.
async function invoke(router, method, path, req = {}) {
  const route = router.routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`route not found: ${method} ${path}`);
  const res = fakeRes();
  const chain = [...router.middlewares, ...route.handlers];
  let index = 0;
  let active = 0; // handler invocations currently in flight
  let exhausted = false; // chain ran out of handlers
  const completed = new Promise((resolve, reject) => {
    const maybeDone = () => {
      if (active === 0 && (res.finished || exhausted)) resolve();
    };
    res._notify = maybeDone;
    async function next(err) {
      if (err) { reject(err); return; }
      const handler = chain[index++];
      if (!handler) { exhausted = true; maybeDone(); return; }
      active++;
      try {
        await handler(req, res, next);
      } catch (e) {
        reject(e);
        return;
      }
      active--;
      if (index >= chain.length) exhausted = true;
      maybeDone();
    }
    next().catch(reject);
  });
  await completed;
  return res;
}

// Auth middleware stand-ins: authenticate adopts req.__user (set by the
// test) as the signed-in user; requireRole lets everything through.
const fakeAuth = {
  authenticate: (req, res, next) => {
    req.user = req.__user || { id: 'user-1', role: 'customer', email: 'user@example.com' };
    next();
  },
  signTokens: () => ({ access: 'test-access', refresh: 'test-refresh' }),
  verifyRefreshToken: (token) => {
    if (token === 'good-refresh') return { sub: 'user-9', type: 'refresh' };
    throw new Error('invalid refresh token');
  },
};

const fakeRbac = {
  requireRole: () => (req, res, next) => next(),
};

module.exports = { installStubs, fakeExpress, fakeRes, invoke, fakeAuth, fakeRbac };

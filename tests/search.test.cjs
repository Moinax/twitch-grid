const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const originalFetch = global.fetch;
const originalEnv = { id: process.env.TWITCH_SEARCH_CLIENT_ID, secret: process.env.TWITCH_SEARCH_CLIENT_SECRET };
let handler, calls;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status,headers});
const fixture = { broadcaster_login:'altair', display_name:'Altair', thumbnail_url:'https://example.com/avatar.png', is_live:true, game_name:'Art', private_field:'omit-me' };
beforeEach(() => {
  process.env.TWITCH_SEARCH_CLIENT_ID = 'server-client'; process.env.TWITCH_SEARCH_CLIENT_SECRET = 'server-secret';
  delete require.cache[require.resolve('../api/search.js')]; handler = require('../api/search.js'); calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({url,options});
    if (url.endsWith('/oauth2/token')) return json({access_token:'private-token',expires_in:3600});
    if (url.includes('/users?')) return json({data:[]});
    return json({data:[fixture]});
  };
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const [key,value] of Object.entries({TWITCH_SEARCH_CLIENT_ID:originalEnv.id,TWITCH_SEARCH_CLIENT_SECRET:originalEnv.secret})) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
async function request(q='altair', method='GET', ip='127.0.0.1') {
  const res = {headers:{},setHeader(key,value){this.headers[key]=value;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
  await handler({method,url:'/api/search?q='+encodeURIComponent(q),headers:{'x-forwarded-for':ip}},res);
  return res;
}
test('guest search returns channel cards, never credentials or unrelated Twitch fields', async () => {
  const res = await request(); assert.equal(res.statusCode,200); assert.equal(res.body.data[0].display_name,'Altair');
  assert.equal(res.body.data[0].private_field,undefined);
  assert.doesNotMatch(JSON.stringify(res),/server-secret|private-token/);
  const auth = calls.find(c=>c.url.endsWith('/oauth2/token'));
  assert.equal(auth.options.method,'POST'); assert.equal(auth.options.body.get('client_secret'),'server-secret');
  assert.equal(calls.find(c=>c.url.includes('/search/channels')).options.headers.Authorization,'Bearer private-token');
});
test('cached searches and concurrent requests share work and reuse the app token', async () => {
  await Promise.all([request('altair'),request('ALTAIR')]); await request('altair');
  assert.equal(calls.filter(c=>c.url.includes('/search/channels')).length,1);
  await request('another');
  assert.equal(calls.filter(c=>c.url.endsWith('/oauth2/token')).length,1);
});
test('exact usernames remain searchable when Twitch omits inactive channels', async () => {
  global.fetch = async url => url.endsWith('/oauth2/token') ? json({access_token:'private-token',expires_in:3600}) : url.includes('/users?') ? json({data:[{login:'altair',display_name:'Altair',profile_image_url:'https://example.com/a.png'}]}) : json({data:[]});
  const res = await request(); assert.equal(res.body.data[0].broadcaster_login,'altair'); assert.equal(res.body.data[0].is_live,null);
});
test('invalid queries and unsupported methods do not call Twitch', async () => {
  for (const query of ['', 'a', 'x'.repeat(101), 'test\nname']) assert.equal((await request(query)).statusCode,400);
  const res=await request('altair','POST'); assert.equal(res.statusCode,405); assert.equal(res.headers.Allow,'GET');
  assert.equal(calls.length,0);
});
test('missing credentials return a non-cacheable error', async () => {
  delete process.env.TWITCH_SEARCH_CLIENT_SECRET;
  const res=await request(); assert.equal(res.statusCode,503); assert.equal(res.headers['Cache-Control'],'no-store'); assert.equal(calls.length,0);
});
test('revoked app tokens are renewed once', async () => {
  let tokens=0, searches=0;
  global.fetch=async url => {
    if(url.endsWith('/oauth2/token')) return json({access_token:'token'+(++tokens),expires_in:3600});
    if(url.includes('/users?')) return json({data:[]});
    return ++searches === 1 ? json({},401) : json({data:[fixture]});
  };
  assert.equal((await request()).statusCode,200); assert.equal(tokens,2); assert.equal(searches,2);
});
test('upstream failures are sanitized and can be retried', async () => {
  global.fetch=async()=>json({message:'server-secret private-token'},500);
  const failed=await request(); assert.equal(failed.statusCode,503); assert.doesNotMatch(JSON.stringify(failed),/server-secret|private-token/);
  global.fetch=async url=>url.endsWith('/oauth2/token')?json({access_token:'new-token',expires_in:3600}):json({data:[]});
  assert.equal((await request()).statusCode,200);
});
test('Twitch rate limits are respected', async () => {
  global.fetch=async url=>url.endsWith('/oauth2/token')?json({access_token:'private-token',expires_in:3600}):json({},429,{'Ratelimit-Reset':String(Math.ceil(Date.now()/1000)+60)});
  const res=await request(); assert.equal(res.statusCode,429); assert.equal(res.headers['Retry-After'],'60');
  assert.equal((await request('other')).statusCode,429);
});
test('repeated uncached searches from one client are bounded', async () => {
  for(let i=0;i<60;i++) assert.equal((await request('query'+i)).statusCode,200);
  assert.equal((await request('limit')).statusCode,429);
});

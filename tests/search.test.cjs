const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const originalFetch = global.fetch;
const originalEnv = { id: process.env.TWITCH_SEARCH_CLIENT_ID, secret: process.env.TWITCH_SEARCH_CLIENT_SECRET };
let handler, calls;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status,headers});
const fixture = { broadcaster_login:'altair', display_name:'Altair', thumbnail_url:'https://example.com/avatar.png', is_live:true, game_name:'Art', title:'Drawing <dragons>', private_field:'omit-me' };
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
  const params = q instanceof URLSearchParams ? q.toString() : 'q='+encodeURIComponent(q);
  await handler({method,url:'/api/search?'+params,headers:{'x-forwarded-for':ip}},res);
  return res;
}
test('guest search returns channel cards, never credentials or unrelated Twitch fields', async () => {
  const res = await request(); assert.equal(res.statusCode,200); assert.equal(res.body.data[0].display_name,'Altair');
  assert.equal(res.body.data[0].private_field,undefined);
  assert.equal(res.body.data[0].title,'Drawing <dragons>');
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
  const res = await request(); assert.equal(res.body.data[0].broadcaster_login,'altair'); assert.equal(res.body.data[0].is_live,false);
});
test('exact username fallback checks live streams instead of assuming offline', async () => {
  global.fetch = async url => {
    if (url.endsWith('/oauth2/token')) return json({access_token:'private-token',expires_in:3600});
    if (url.includes('/users?')) return json({data:[{login:'altair',display_name:'Altair'}]});
    if (url.includes('/streams?')) return json({data:[{user_login:'altair',game_name:'Art',title:'Drawing dragons',viewer_count:42}]});
    return json({data:[]});
  };
  const res = await request();
  assert.equal(res.body.data[0].is_live,true);
  assert.equal(res.body.data[0].viewer_count,42);
});
test('favorite lookup batches usernames and returns verified public statuses', async () => {
  global.fetch = async url => {
    calls.push({url});
    if (url.endsWith('/oauth2/token')) return json({access_token:'private-token',expires_in:3600});
    if (url.includes('/users?')) return json({data:[{login:'altair',display_name:'Altair',email:'private@example.com'}, {login:'live',display_name:'Live'}]});
    return json({data:[{user_login:'live',game_name:'Art',title:'Drawing dragons',viewer_count:42,private_field:'omit-me'}]});
  };
  const res = await request(new URLSearchParams([['login','live'],['login','Altair']]));
  assert.equal(res.statusCode,200);
  assert.equal(res.body.data[0].is_live,false);
  assert.equal(res.body.data[1].is_live,true);
  assert.equal(res.body.data[1].viewer_count,42);
  assert.equal(res.body.data[1].title,'Drawing dragons');
  assert.equal(res.body.data[0].title,'');
  assert.doesNotMatch(JSON.stringify(res),/server-secret|private-token|private@example|omit-me/);
  const streams = new URL(calls.find(c => c.url.includes('/streams?')).url);
  assert.deepEqual(streams.searchParams.getAll('user_login'),['altair','live']);
  assert.equal(streams.searchParams.get('first'),'100');
  await request(new URLSearchParams([['login','altair'],['login','live'],['login','live']]));
  assert.equal(calls.length,3);
});
test('favorite lookup rejects empty, invalid, oversized and mixed queries', async () => {
  for (const query of [new URLSearchParams({login:''}),new URLSearchParams({login:'a/b'}),
    new URLSearchParams({login:'altair',q:'altair'}),new URLSearchParams(Array.from({length:101},(_,i)=>['login','user'+i]))]) {
    assert.equal((await request(query)).statusCode,400);
  }
  assert.equal(calls.length,0);
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

test('collaboration lookup resolves unique participants and live statuses, caches only public data', async () => {
  global.fetch = async (url, options) => {
    calls.push({url,options});
    if (url.endsWith('/oauth2/token')) return json({access_token:'private-token',expires_in:3600});
    const endpoint = new URL(url);
    if (endpoint.pathname.endsWith('/shared_chat/session')) {
      assert.equal(endpoint.searchParams.get('broadcaster_id'),'1');
      return json({data:[{participants:[{broadcaster_id:'1'},{broadcaster_id:'2'},{broadcaster_id:'2'},{broadcaster_id:'3'}]}]});
    }
    if (endpoint.pathname.endsWith('/users')) {
      if (endpoint.searchParams.has('login')) return json({data:[{id:'1',login:'altair'}]});
      assert.deepEqual(endpoint.searchParams.getAll('id'),['1','2','3']);
      return json({data:[{id:'1',login:'altair',display_name:'Altair'},{id:'2',login:'partner',display_name:'Partner',profile_image_url:'https://example.com/avatar.png',email:'private@example.com'},{id:'3',login:'offline',display_name:'Offline'}]});
    }
    assert.deepEqual(endpoint.searchParams.getAll('user_id'),['1','2','3']);
    return json({data:[{user_login:'altair',title:'Art',viewer_count:100},{user_login:'partner',title:'Painting',game_name:'Art',viewer_count:12}]});
  };
  const res = await request(new URLSearchParams({collaboration:'Altair'}));
  assert.equal(res.statusCode,200);
  assert.equal(res.body.data.length,3);
  assert.equal(res.body.data[1].display_name,'Partner');
  assert.equal(res.body.data[1].is_live,true);
  assert.equal(res.body.data[1].title,'Painting');
  assert.equal(res.body.data[2].is_live,false);
  assert.doesNotMatch(JSON.stringify(res),/server-secret|private-token|private@example/);
  await request(new URLSearchParams({collaboration:'altair'}));
  assert.equal(calls.length,5);
});
test('collaboration lookup returns no participants for unknown channels or absent sessions', async () => {
  assert.deepEqual((await request(new URLSearchParams({collaboration:'missing'}))).body,{data:[]});
  global.fetch = async url => json({data:url.includes('/users?')?[{id:'1',login:'altair'}]:[]});
  assert.deepEqual((await request(new URLSearchParams({collaboration:'altair'}))).body,{data:[]});
});
test('collaboration queries reject invalid logins, duplicates and mixed search modes', async () => {
  for (const params of [new URLSearchParams({collaboration:''}),new URLSearchParams({collaboration:'a/b'}),
    new URLSearchParams({collaboration:'altair',q:'altair'}),new URLSearchParams({collaboration:'altair',login:'altair'}),
    new URLSearchParams([['collaboration','altair'],['collaboration','partner']])]) {
    assert.equal((await request(params)).statusCode,400);
  }
  assert.equal(calls.length,0);
});

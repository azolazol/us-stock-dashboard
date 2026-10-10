(() => {
  'use strict';
  // Raw main data avoids requiring a Pages rebuild for each scheduled collection.
  const DATA_URL = 'https://raw.githubusercontent.com/azolazol/us-stock-dashboard/main/data/markets.json';
  const labels = {kr: ['한국주식', 'KOREA MARKET'], crypto: ['크립토', 'CRYPTO MARKET']};
  const expected = {kr: ['코스피', '코스닥', '원/달러'], crypto: ['비트코인', '이더리움', '리플', '솔라나']};
  const $ = id => document.getElementById(id);
  let market = 'us', payload = null, coin = 'all', busy = false, lastError = false;
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR', {timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) : '기준 시각 없음';
  const el = (tag, cls, text) => { const node = document.createElement(tag); if(cls) node.className=cls; if(text != null) node.textContent=text; return node; };
  function safeLink(url) { try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
  function render() {
    if(market === 'us') return;
    const data = payload?.markets?.[market];
    $('quoteGrid').replaceChildren();
    (data?.quotes?.length ? data.quotes : expected[market].map(name => ({name}))).forEach(q => {
      const card = el('article','quote-card');
      const valid = typeof q.price === 'number' && Number.isFinite(q.price);
      const unit = q.symbol?.startsWith('^') ? ' pt' : q.currency==='KRW' ? ' 원' : '';
      card.append(el('p','quote-label',q.name),el('p','quote-value',valid ? q.price.toLocaleString('ko-KR',{maximumFractionDigits:q.currency==='KRW' && market==='crypto'?0:2}) + unit : '—'));
      const change=typeof q.change_pct==='number' && Number.isFinite(q.change_pct)?q.change_pct:null;
      card.append(el('p','quote-change '+(change>0?'quote-up':change<0?'quote-down':''), change===null?'시세 확인 대기':`${change>=0?'+':''}${change.toFixed(2)}% · 전일 대비`));
      card.append(el('p','quote-time', valid ? `${q.source} · ${date(q.as_of)} KST${q.stale?' · 갱신 실패, 이전 시세':''}` : '데이터를 아직 받지 못했습니다'));
      $('quoteGrid').append(card);
    });
    const old = !data?.news_updated_at || Date.now()-Date.parse(data.news_updated_at)>3*3600000;
    const status=$('marketStatus');
    status.classList.toggle('market-warning',lastError || old || !!data?.errors?.length);
    status.textContent = !data ? (busy?'뉴스 데이터를 불러오는 중입니다…':'아직 수집된 데이터가 없습니다. 자동 수집 실행 상태를 확인해 주세요.') : `뉴스 수집 ${date(data.news_updated_at)} KST · 2시간 간격 자동 수집 (실행 지연 가능)${old?' · 최신 갱신이 지연되고 있습니다':''}${data.errors?.length?' · 일부 데이터 갱신 실패, 마지막 성공 자료 표시':''}${lastError?' · 연결 실패, 이전 자료 표시':''}`;
    const query=$('marketSearch').value.trim().toLowerCase();
    const items=(data?.news || []).filter(n=>(!query || `${n.title} ${n.source}`.toLowerCase().includes(query)) && (market!=='crypto'||coin==='all'||n.category===coin));
    $('marketNews').replaceChildren();
    if(!items.length) $('marketNews').append(el('p','market-empty',busy&&!payload?'뉴스를 불러오는 중입니다…':data?.news?.length?'조건에 맞는 뉴스가 없습니다.':'수집된 뉴스가 아직 없습니다. 잠시 후 새로고침해 주세요.'));
    items.forEach(n=>{
      const card=el('article','news-card'); const meta=el('div','market-meta');meta.append(el('span','',n.source||'뉴스'),el('time','',date(n.published_at)+' KST'));
      const heading=el('h3'),href=safeLink(n.link);const title=el(href?'a':'span','',n.title);if(href){title.href=href;title.target='_blank';title.rel='noopener noreferrer';}heading.append(title);card.append(meta,heading);
      if(href){const link=el('a','source-link','기사 읽기 ↗');link.href=href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);} $('marketNews').append(card);
    });
  }
  async function refresh(){
    if(busy) return;busy=true;lastError=false;$('marketRefresh').disabled=true;render();
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    try{const r=await fetch(DATA_URL+'?t='+Math.floor(Date.now()/60000),{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(data.schema_version!==1||!data.markets)throw Error('Invalid data');payload=data;}
    catch(e){lastError=true;console.warn('Market data unavailable:',e.message);}
    finally{clearTimeout(timer);busy=false;$('marketRefresh').disabled=false;render();}
  }
  function select(next){
    market=['us','kr','crypto'].includes(next)?next:'us';
    document.querySelectorAll('[data-market]').forEach(b=>{const active=b.dataset.market===market;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    $('usPanel').classList.toggle('hidden',market!=='us');$('usTicker').classList.toggle('hidden',market!=='us');$('marketPanel').classList.toggle('hidden',market==='us');
    if(market==='us')return;
    $('marketPanel').setAttribute('aria-labelledby','tab-'+market);$('marketTitle').textContent=labels[market][0];$('marketEyebrow').textContent=labels[market][1];$('coinFilters').classList.toggle('hidden',market!=='crypto');render();if(!payload)refresh();
  }
  document.querySelectorAll('[data-market]').forEach((b,i,list)=>{b.addEventListener('click',()=>{location.hash=b.dataset.market;select(b.dataset.market);});b.addEventListener('keydown',e=>{let idx;if(e.key==='ArrowRight')idx=(i+1)%list.length;else if(e.key==='ArrowLeft')idx=(i+list.length-1)%list.length;else if(e.key==='Home')idx=0;else if(e.key==='End')idx=list.length-1;else return;e.preventDefault();list[idx].focus();list[idx].click();});});
  document.querySelectorAll('[data-coin]').forEach(b=>b.addEventListener('click',()=>{coin=b.dataset.coin;document.querySelectorAll('[data-coin]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
  $('marketSearch').addEventListener('input',render);$('marketRefresh').addEventListener('click',refresh);window.addEventListener('hashchange',()=>select(location.hash.slice(1)));
  select(location.hash.slice(1));setInterval(()=>{if(market!=='us'&&!document.hidden)refresh();},5*60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&market!=='us')refresh();});
})();

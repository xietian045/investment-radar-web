'use strict';
// This is a public browser key. Database access is controlled by Supabase RLS.
const SUPABASE_URL = 'https://hfigdvpdeihiwakftjhv.supabase.co';
const PUBLIC_KEY = 'sb_publishable_2ZtZVFA4VqZs4tHSWOFs0A_7S5svq50';
const PAGE_SIZE = 100;
const fields = 'id,title,summary,country,category,source_name,source_url,published_at';
const ui = Object.fromEntries(['search','country','refresh','count','status','events','more'].map(id => [id, document.getElementById(id)]));
let records = [], offset = 0, total = null, busy = false, canLoadMore = false;
const names = {US:'美国',CN:'中国',HK:'中国香港',JP:'日本',GB:'英国',UK:'英国',EU:'欧盟',DE:'德国',FR:'法国',KR:'韩国',SG:'新加坡',IN:'印度',CA:'加拿大',AU:'澳大利亚'};
function countryName(code) { return names[code] ? `${names[code]} · ${code}` : code || '未标注'; }
function text(value) { return value == null ? '' : String(value); }
function element(tag, className, value) { const node = document.createElement(tag); node.className = className; node.textContent = value; return node; }
function safeUrl(value) { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }
function dateLabel(value) { if (!value) return '日期未标注'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '日期未标注' : new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date); }
function render() {
  const keyword = ui.search.value.trim().toLocaleLowerCase();
  const country = ui.country.value;
  const visible = records.filter(row => (!country || row.country === country) && (!keyword || [row.title,row.summary,row.category,row.source_name,row.country,countryName(row.country)].some(value => text(value).toLocaleLowerCase().includes(keyword))));
  ui.events.replaceChildren();
  ui.count.textContent = `显示 ${visible.length} 条 · 已加载 ${records.length}${total == null ? '' : ` / ${total}`} 条`;
  for (const row of visible) {
    const card = element('article','card','');
    const meta = element('div','meta','');
    meta.append(element('span','tag',countryName(row.country)));
    if (row.category) meta.append(element('span','',text(row.category)));
    const time = element('time','',dateLabel(row.published_at));
    if (row.published_at && !Number.isNaN(new Date(row.published_at).getTime())) time.dateTime = new Date(row.published_at).toISOString();
    meta.append(time);
    card.append(meta,element('h3','',text(row.title) || '未命名公告'));
    if (row.summary && row.summary !== row.title) card.append(element('p','summary',text(row.summary)));
    const bottom = element('div','card-bottom','');
    bottom.append(element('span','source',text(row.source_name) || '来源未标注'));
    const url = safeUrl(row.source_url);
    if (url) { const link = element('a','','查看原文 ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label',`查看原文：${text(row.title)}`); bottom.append(link); }
    else bottom.append(element('span','source','原文链接不可用'));
    card.append(bottom); ui.events.append(card);
  }
  if (!visible.length) ui.events.append(element('p','empty', records.length ? '没有符合条件的公告。试试其他关键词或国家。' : '暂无可显示的公告。'));
  ui.more.hidden = !canLoadMore;
}
function updateCountries() {
  const current = ui.country.value;
  ui.country.replaceChildren(new Option('全部国家 / 地区',''));
  [...new Set(records.map(row => row.country).filter(Boolean))].sort().forEach(code => ui.country.add(new Option(countryName(code),code)));
  if ([...ui.country.options].some(option => option.value === current)) ui.country.value = current;
}
async function load(reset = false) {
  if (busy) return;
  busy = true; ui.refresh.disabled = true; ui.more.disabled = true;
  ui.status.className = 'status'; ui.status.textContent = '正在读取公告…';
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),20000);
  try {
    const start = reset ? 0 : offset;
    const url = new URL(`${SUPABASE_URL}/rest/v1/events`);
    url.search = new URLSearchParams({select:fields,order:'published_at.desc.nullslast,id.desc',limit:String(PAGE_SIZE),offset:String(start)});
    const response = await fetch(url,{headers:{apikey:PUBLIC_KEY,Prefer:'count=exact'},signal:controller.signal,cache:'no-store'});
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '读取被拒绝，请检查公开 key 和 events 的匿名 SELECT 权限。' : `公告接口暂时不可用（HTTP ${response.status}）。`);
    const data = await response.json(); if (!Array.isArray(data)) throw new Error('公告接口返回格式不正确。');
    const countPart = response.headers.get('content-range')?.split('/')[1];
    total = countPart && /^\d+$/.test(countPart) ? Number(countPart) : null;
    records = reset ? data : [...records,...data]; offset = start + data.length;
    canLoadMore = total == null ? data.length === PAGE_SIZE : offset < total;
    updateCountries(); render();
    ui.status.textContent = records.length ? `已从公开接口读取公告 · 更新于 ${dateLabel(new Date().toISOString())}` : '接口连接成功，当前没有可读取的公告。';
  } catch (error) {
    ui.status.className = 'status error';
    ui.status.textContent = (error.name === 'AbortError' ? '连接超时。' : error instanceof TypeError ? '无法连接公告接口，请检查网络后重试。' : error.message) + (records.length ? ' 当前保留上次加载的公告。' : '') + ' 点击「刷新公告」重试。';
  } finally { clearTimeout(timer); busy = false; ui.refresh.disabled = false; ui.more.disabled = false; }
}
ui.search.addEventListener('input',render);
ui.country.addEventListener('change',render);
ui.refresh.addEventListener('click',() => load(true));
ui.more.addEventListener('click',() => load());
load(true);

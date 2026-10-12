'use strict';
const fundingUI = Object.fromEntries(['funding-search','funding-period','funding-country','funding-sector','funding-round','funding-investor','funding-watch-only','funding-clear','funding-export','funding-retry','funding-status','funding-count','funding-cards','funding-sectors','funding-stat-events','funding-stat-companies','funding-stat-investors','watch-notice'].map(id => [id,document.getElementById(id)]));
const WATCH_KEY = 'investment-radar.funding-watch.v1';
const sectorRoles = {AI:['产品运营','开发者生态','技术内容','商务拓展'],企业软件:['企业销售','客户成功','解决方案','产品营销'],智能硬件:['项目运营','供应链','产品管理','行业销售']};
let fundingEntries = [], fundingBusy = false, watchStorageOK = true;
function fText(value) { return value == null ? '' : String(value); }
function fElement(tag, className, value) { const node = document.createElement(tag); node.className = className; node.textContent = value; return node; }
function fUrl(value) { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }
function readWatchlist() {
  try { const values = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); if (!Array.isArray(values)) throw new Error('Invalid watchlist'); return new Set(values.filter(value => typeof value === 'string' && value.length < 256).slice(0,5000)); }
  catch { watchStorageOK = false; return new Set(); }
}
let watchlist = readWatchlist();
function watchNotice(message = '') { fundingUI['watch-notice'].textContent = message || (watchStorageOK ? '观察名单保存在当前浏览器，不跨设备同步；清除网站数据会移除名单。' : '当前浏览器无法保存名单，加入操作仅在本次页面打开期间有效。'); }
function toggleWatch(id) {
  const removing = watchlist.has(id);
  if (removing) watchlist.delete(id); else watchlist.add(id);
  try { localStorage.setItem(WATCH_KEY,JSON.stringify([...watchlist])); watchStorageOK = true; }
  catch { watchStorageOK = false; }
  watchNotice(watchStorageOK ? (removing ? '已从观察名单移除。' : '已加入观察名单，可勾选「仅看观察名单」回查。') : '当前页面名单已更新，但浏览器无法保存，刷新后可能丢失。');
  renderFunding();
}
function validDay(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(value + 'T00:00:00Z'); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value; }
function beijingToday(now = new Date()) { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now); const values = Object.fromEntries(parts.map(part => [part.type,part.value])); return `${values.year}-${values.month}-${values.day}`; }
function cutoffDay(today,days) { const timestamp = Date.parse(today + 'T00:00:00Z'); return new Date(timestamp - (days - 1) * 86400000).toISOString().slice(0,10); }
function validateFundingData(data) {
  if (data?.version !== 1 || !validDay(data.updated_on) || typeof data.coverage !== 'string' || !Array.isArray(data.entries) || data.entries.length > 1000) throw new Error('Invalid funding data');
  const ids = new Set(), sources = new Set();
  for (const row of data.entries) {
    if (!row || !validDay(row.announced_on) || !validDay(row.checked_on) || !['CN','US'].includes(row.country) || !Object.hasOwn(sectorRoles,row.sector) || !['A','B','C','OTHER'].includes(row.round_group)) throw new Error('Invalid funding record');
    for (const key of ['id','company','subsector','round','amount','valuation','deal_status','summary','research_focus','source_name','source_title','hiring_status','investor_note']) if (typeof row[key] !== 'string' || !row[key].trim() || row[key].length > 3000) throw new Error('Invalid funding text');
    if (!fUrl(row.source_url) || !fUrl(row.company_url) || (row.careers_url && !fUrl(row.careers_url))) throw new Error('Invalid funding URL');
    if (!Array.isArray(row.investors) || row.investors.length > 50 || row.investors.some(investor => !investor || typeof investor.name !== 'string' || !investor.name.trim() || typeof investor.role !== 'string')) throw new Error('Invalid investors');
    if (!Array.isArray(row.verified_roles) || row.verified_roles.some(role => typeof role !== 'string')) throw new Error('Invalid roles');
    if (row.hiring_checked_on && !validDay(row.hiring_checked_on)) throw new Error('Invalid hiring date');
    if (row.verified_roles.length && (!row.careers_url || !row.hiring_checked_on)) throw new Error('Missing hiring evidence');
    if (ids.has(row.id) || sources.has(fUrl(row.source_url))) throw new Error('Duplicate financing');
    ids.add(row.id); sources.add(fUrl(row.source_url));
  }
  return data.entries;
}
function fundingFilters() { return {keyword:fundingUI['funding-search'].value.trim().toLocaleLowerCase(),period:fundingUI['funding-period'].value,country:fundingUI['funding-country'].value,sector:fundingUI['funding-sector'].value,round:fundingUI['funding-round'].value,investor:fundingUI['funding-investor'].value,watchOnly:fundingUI['funding-watch-only'].checked}; }
function selectFunding(entries,filters,today = beijingToday()) {
  const cutoff = filters.period === 'all' ? '' : cutoffDay(today,Number(filters.period) || 90);
  return entries.filter(row => {
    const search = [row.company,row.sector,row.subsector,row.summary,row.round,row.research_focus,row.country === 'CN' ? '中国' : '美国',...row.investors.map(investor => investor.name)].join(' ').toLocaleLowerCase();
    return row.announced_on <= today && (!cutoff || row.announced_on >= cutoff)
      && (!filters.keyword || search.includes(filters.keyword)) && (!filters.country || row.country === filters.country)
      && (!filters.sector || row.sector === filters.sector)
      && (!filters.round || (filters.round === 'ABC' ? ['A','B','C'].includes(row.round_group) : row.round_group === filters.round))
      && (!filters.investor || row.investors.some(investor => investor.name === filters.investor))
      && (!filters.watchOnly || watchlist.has(row.id));
  }).sort((a,b) => b.announced_on.localeCompare(a.announced_on) || a.company.localeCompare(b.company));
}
function fundingLink(label,value) { const url = fUrl(value); if (!url) return null; const link = fElement('a','',label); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
function fundingFact(list,label,value) { list.append(fElement('dt','',label),fElement('dd','',value)); }
function updateInvestorOptions() {
  const selected = fundingUI['funding-investor'].value;
  fundingUI['funding-investor'].replaceChildren(new Option('全部已收录机构',''));
  [...new Set(fundingEntries.flatMap(row => row.investors.map(investor => investor.name)))].sort((a,b) => a.localeCompare(b,'zh-CN')).forEach(name => fundingUI['funding-investor'].add(new Option(name,name)));
  if ([...fundingUI['funding-investor'].options].some(option => option.value === selected)) fundingUI['funding-investor'].value = selected;
}
function renderFunding() {
  const focusedWatch = document.activeElement?.dataset?.watchId;
  const entries = selectFunding(fundingEntries,fundingFilters());
  fundingUI['funding-count'].textContent = `显示 ${entries.length} 条 · 共收录 ${fundingEntries.length} 条`;
  fundingUI['funding-stat-events'].textContent = String(entries.length);
  fundingUI['funding-stat-companies'].textContent = String(new Set(entries.map(row => row.company)).size);
  fundingUI['funding-stat-investors'].textContent = String(new Set(entries.flatMap(row => row.investors.map(investor => investor.name))).size);
  fundingUI['funding-export'].disabled = !entries.length;
  fundingUI['funding-sectors'].replaceChildren();
  for (const sector of Object.keys(sectorRoles)) {
    const count = entries.filter(row => row.sector === sector).length;
    const button = fElement('button','sector-button',''); button.type = 'button';
    button.append(fElement('span','',sector),fElement('strong','',`${count} 条`));
    button.setAttribute('aria-pressed',String(fundingUI['funding-sector'].value === sector));
    button.addEventListener('click',() => { fundingUI['funding-sector'].value = sector; renderFunding(); fundingUI['funding-sector'].focus(); });
    fundingUI['funding-sectors'].append(button);
  }
  fundingUI['funding-cards'].replaceChildren();
  for (const row of entries) {
    const card = fElement('article','card funding-card','');
    const meta = fElement('div','meta','');
    meta.append(fElement('span','tag',row.country === 'CN' ? '中国 · CN' : '美国 · US'),fElement('span','',row.sector));
    const time = fElement('time','',row.announced_on); time.dateTime = row.announced_on; meta.append(time);
    const saved = watchlist.has(row.id), watch = fElement('button','watch-button',saved ? '已在观察名单' : '加入观察名单');
    watch.type = 'button'; watch.dataset.watchId = row.id; watch.setAttribute('aria-pressed',String(saved)); watch.setAttribute('aria-label',`${saved ? '移出' : '加入'}观察名单：${row.company}`); watch.addEventListener('click',() => toggleWatch(row.id)); meta.append(watch);
    card.append(meta,fElement('h3','',row.company),fElement('p','funding-subsector',row.subsector));
    const facts = fElement('dl','funding-facts',''); fundingFact(facts,'融资轮次',row.round); fundingFact(facts,'本轮金额',row.amount); fundingFact(facts,'估值',row.valuation); fundingFact(facts,'披露状态',row.deal_status); card.append(facts);
    card.append(fElement('p','summary',row.summary));
    const investors = fElement('div','investor-chips','');
    investors.append(fElement('span','funding-label','披露投资方'));
    row.investors.forEach(investor => { const button = fElement('button','investor-chip',investor.name); button.type = 'button'; button.title = investor.role; button.setAttribute('aria-label',`筛选投资方 ${investor.name}（${investor.role}）`); button.addEventListener('click',() => { fundingUI['funding-investor'].value = investor.name; renderFunding(); fundingUI['funding-investor'].focus(); }); investors.append(button); });
    card.append(investors,fElement('p','funding-note',row.investor_note));
    const details = fElement('details','pilot-analysis',''); details.append(fElement('summary','','公司研究与岗位线索'));
    details.append(fElement('h4','','观察重点（研究提示）'),fElement('p','',row.research_focus));
    details.append(fElement('h4','','岗位方向（参考，非招聘事实）'),fElement('p','',sectorRoles[row.sector].join(' / ')));
    details.append(fElement('h4','','招聘核验'),fElement('p','',row.hiring_status + (row.hiring_checked_on ? ` · 核对于 ${row.hiring_checked_on}` : '')));
    if (row.verified_roles.length) details.append(fElement('p','',`核对页面列示：${row.verified_roles.join(' / ')}。岗位可能变化，请回原站确认。`));
    if (row.careers_url) details.append(fundingLink('查看招聘入口 ↗',row.careers_url));
    details.append(fElement('p','funding-note',`来源核对于 ${row.checked_on}；公司披露未经过本工具独立财务审计。`)); card.append(details);
    const bottom = fElement('div','card-bottom funding-links',''); bottom.append(fundingLink('融资公告 ↗',row.source_url),fundingLink('公司官网 ↗',row.company_url),fElement('span','source',row.source_name)); card.append(bottom); fundingUI['funding-cards'].append(card);
  }
  if (!entries.length) fundingUI['funding-cards'].append(fElement('p','empty',fundingEntries.length ? '当前筛选没有匹配融资。可清除筛选或选择「全部已收录」。观察名单也受时间和其他筛选条件影响。' : '暂无已加载融资信息，请重试加载。'));
  if (focusedWatch) {
    const remaining = [...fundingUI['funding-cards'].querySelectorAll('.watch-button')].find(button => button.dataset.watchId === focusedWatch);
    (remaining || fundingUI['funding-watch-only']).focus();
  }
}
function csvCell(value) { let cell = fText(value).replace(/[\r\n\t]/g,' '); if (/^[\u0000-\u0020]*[=+@-]/.test(cell)) cell = "'" + cell; return '"' + cell.replace(/"/g,'""') + '"'; }
function fundingCSV(entries) {
  const columns = ['公司','国家','赛道','细分方向','公告日期','轮次','本轮金额（原始口径）','估值（非融资额）','披露状态','投资方与角色','业务摘要','观察重点（研究提示）','招聘状态','招聘核对日期','公司官网','招聘入口','融资来源','核对日期'];
  const rows = entries.map(row => [row.company,row.country,row.sector,row.subsector,row.announced_on,row.round,row.amount,row.valuation,row.deal_status,row.investors.map(investor => `${investor.name}（${investor.role}）`).join('；'),row.summary,row.research_focus,row.hiring_status,row.hiring_checked_on || '',row.company_url,row.careers_url || '',row.source_url,row.checked_on]);
  return '\uFEFF' + [columns,...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
function exportFunding() {
  const rows = selectFunding(fundingEntries,fundingFilters()); if (!rows.length) return;
  const url = URL.createObjectURL(new Blob([fundingCSV(rows)],{type:'text/csv;charset=utf-8;'}));
  const link = document.createElement('a'); link.href = url; link.download = `investment-radar-funding-${beijingToday()}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),10000);
}
async function loadFunding() {
  if (fundingBusy) return;
  fundingBusy = true; fundingUI['funding-retry'].disabled = true; fundingUI['funding-status'].textContent = '正在加载融资信息…';
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),15000);
  try {
    const response = await fetch('./funding-data.json?v=20261012-funding1',{signal:controller.signal,cache:'no-store'});
    if (!response.ok) throw new Error('Funding unavailable');
    const data = await response.json(); fundingEntries = validateFundingData(data); updateInvestorOptions(); renderFunding();
    fundingUI['funding-status'].textContent = `人工核实样本 · 最近整理 ${data.updated_on} · ${data.coverage}`;
    fundingUI['funding-retry'].hidden = true;
  } catch {
    fundingUI['funding-status'].textContent = '融资数据暂时无法加载，请检查 funding-data.json 已上传至仓库根目录，然后点击重试。' + (fundingEntries.length ? ' 当前保留已加载记录。' : '');
    fundingUI['funding-retry'].hidden = false;
  } finally { clearTimeout(timer); fundingBusy = false; fundingUI['funding-retry'].disabled = false; }
}
fundingUI['funding-search'].addEventListener('input',renderFunding);
for (const id of ['funding-period','funding-country','funding-sector','funding-round','funding-investor','funding-watch-only']) fundingUI[id].addEventListener('change',renderFunding);
fundingUI['funding-clear'].addEventListener('click',() => { for (const id of ['funding-search','funding-country','funding-sector','funding-round','funding-investor']) fundingUI[id].value = ''; fundingUI['funding-period'].value = '90'; fundingUI['funding-watch-only'].checked = false; renderFunding(); });
fundingUI['funding-export'].addEventListener('click',exportFunding);
fundingUI['funding-retry'].addEventListener('click',loadFunding);
window.addEventListener('storage',event => { if (event.key === WATCH_KEY || event.key === null) { watchlist = readWatchlist(); watchNotice(); renderFunding(); } });
watchNotice();
loadFunding();

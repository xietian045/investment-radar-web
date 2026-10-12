'use strict';
const fundingUI = Object.fromEntries(['funding-search','funding-period','funding-country','funding-sector','funding-round','funding-investor','funding-watch-only','funding-clear','funding-export','funding-retry','funding-status','funding-count','funding-cards','funding-sectors','funding-stat-events','funding-stat-companies','funding-stat-investors','watch-notice','research-status','industry-research-cards'].map(id => [id,document.getElementById(id)]));
const WATCH_KEY = 'investment-radar.funding-watch.v1';
const sectorRoles = {AI:['模型与工程','开发者生态','产品运营','商务拓展'],机器人:['运动控制','嵌入式工程','机器人应用','供应链'],商业航空航天:['飞行器工程','测试与适航','项目交付','供应链'],新能源:['材料与电化学','工艺与制造','系统集成','项目开发'],电力:['电力电子','电网控制','项目工程','运维'], '3D打印':['材料与工艺','设备控制','应用工程','行业销售'],IP新消费:['IP设计与内容','授权管理','产品开发','用户与渠道运营'],企业软件:['企业销售','客户成功','解决方案','产品营销'],智能硬件:['项目运营','供应链','产品管理','行业销售']};
function fundingSectors(row) { return [...new Set([row.sector,...(row.sector_tags || [])])]; }
let fundingEntries = [], fundingBusy = false, watchStorageOK = true;
let companyResearch = new Map(), industryInsights = [], researchBusy = false;
async function readPublicJSON(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),20000);
    try {
      const response = await fetch(url,{signal:controller.signal,cache:'no-store'});
      if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.kind = 'connection'; throw error; }
      try { return await response.json(); }
      catch { const error = new Error('Invalid JSON response'); error.kind = 'content'; throw error; }
    } catch (error) {
      if (attempt === 1) { if (!error.kind) error.kind = 'connection'; throw error; }
    } finally { clearTimeout(timer); }
    await new Promise(resolve => setTimeout(resolve,700));
  }
}
function loadingReason(error,stage) {
  if (stage === 'display') return '页面展示暂时出现问题';
  if (stage === 'validate' || error.kind === 'content') return '信息内容未能通过检查';
  return error.name === 'AbortError' ? '连接超时' : '网络连接或文件读取失败';
}
function validateCompanyResearch(data) {
  if (data?.version !== 1 || !validDay(data.updated_on) || typeof data.method !== 'string' || !Array.isArray(data.profiles) || data.profiles.length > 1000 || !Array.isArray(data.industry_insights) || data.industry_insights.length > 10) throw new Error('Invalid research data');
  const result = new Map();
  const string = value => typeof value === 'string' && value.trim() && value.length <= 5000;
  const strings = values => Array.isArray(values) && values.length <= 12 && values.every(string);
  for (const profile of data.profiles) {
    if (!profile || !string(profile.id) || result.has(profile.id) || !validDay(profile.checked_on)) throw new Error('Invalid research identity');
    const business = profile.business, hiring = profile.hiring, forecast = profile.forecast;
    if (!business || !['overview','customers','workflow_example','monetization'].every(key => string(business[key])) || !strings(business.products)) throw new Error('Invalid business profile');
    if (!Array.isArray(business.sources) || !business.sources.length || business.sources.length > 10 || business.sources.some(source => !string(source.label) || !fUrl(source.url))) throw new Error('Missing business sources');
    if (!hiring || !['岗位要求已核验','仅招聘方向介绍','具体岗位证据不足'].includes(hiring.evidence_level) || !string(hiring.coverage) || !string(hiring.limits) || !Array.isArray(hiring.jobs) || hiring.jobs.length > 10) throw new Error('Invalid hiring evidence');
    if ((hiring.evidence_level === '岗位要求已核验') !== Boolean(hiring.jobs.length)) throw new Error('Inconsistent hiring evidence');
    for (const job of hiring.jobs) if (!job || !string(job.title) || !fUrl(job.url) || !validDay(job.checked_on) || !strings(job.requirements) || !job.requirements.length || !string(job.responsibility) || !string(job.signal)) throw new Error('Invalid verified job');
    if (!forecast || !['horizon','basis','base','upside','downside','opportunity','invalidation'].every(key => string(forecast[key])) || !strings(forecast.talent) || !strings(forecast.checkpoints) || !forecast.checkpoints.length) throw new Error('Invalid forecast boundaries');
    result.set(profile.id,profile);
  }
  for (const insight of data.industry_insights) if (!insight || !['theme','direction','opportunity','validation'].every(key => string(insight[key])) || !strings(insight.talent) || !strings(insight.companies) || insight.companies.some(id => !result.has(id))) throw new Error('Invalid industry evidence');
  return result;
}
function profileSearchText(profile) {
  if (!profile) return '';
  const {business,hiring,forecast} = profile;
  return [business.overview,...business.products,business.customers,business.workflow_example,business.monetization,hiring.evidence_level,hiring.coverage,...hiring.jobs.flatMap(job => [job.title,...job.requirements,job.responsibility,job.signal]),forecast.base,forecast.upside,forecast.downside,...forecast.talent,forecast.opportunity,...forecast.checkpoints,forecast.invalidation].join(' ');
}
function researchParagraph(section,title,value) { section.append(fElement('h4','',title),fElement('p','',value)); }
function researchList(section,title,values) { section.append(fElement('h4','',title)); const list = fElement('ul','research-list',''); values.forEach(value => list.append(fElement('li','',value))); section.append(list); }
function renderBusinessOverview(card,profile) {
  const section = fElement('section','business-overview','');
  researchParagraph(section,'主营业务概况',profile.business.overview);
  researchParagraph(section,'交付什么',profile.business.products.join(' / '));
  researchParagraph(section,'谁会使用',profile.business.customers);
  const sources = fElement('div','research-sources','');
  profile.business.sources.forEach(source => sources.append(fundingLink(source.label + ' ↗',source.url)));
  section.append(sources); card.append(section);
}
function renderCompanyResearch(card,row,profile) {
  const business = fElement('details','pilot-analysis company-detail','');
  business.append(fElement('summary','','业务流程与收费方式'));
  researchParagraph(business,'使用流程示例',profile.business.workflow_example);
  researchParagraph(business,'商业模式与披露边界',profile.business.monetization);
  card.append(business);
  const details = fElement('details','pilot-analysis company-detail','');
  details.append(fElement('summary','','招聘要求与未来发展情景'));
  details.append(fElement('p','evidence-label',`${profile.hiring.evidence_level} · 资料核对于 ${profile.checked_on}`));
  details.append(fElement('p','',profile.hiring.coverage));
  for (const job of profile.hiring.jobs) {
    const section = fElement('section','job-evidence','');
    section.append(fElement('h4','',job.title));
    section.append(fundingLink(`岗位原文 · 核对于 ${job.checked_on} ↗`,job.url));
    researchList(section,'实际要求摘要',job.requirements);
    researchParagraph(section,'岗位职责',job.responsibility);
    researchParagraph(section,'业务信号（推断）',job.signal);
    details.append(section);
  }
  if (profile.hiring.evidence_level === '仅招聘方向介绍') details.append(fundingLink('公司招聘方向介绍 ↗',profile.business.sources[0].url));
  if (row.careers_url) details.append(fundingLink('招聘入口 ↗',row.careers_url));
  researchParagraph(details,'招聘证据的限制',profile.hiring.limits);
  details.append(fElement('h4','forecast-heading',profile.forecast.horizon));
  details.append(fElement('p','analysis-meta',`推断依据：${profile.forecast.basis}`));
  for (const [label,key] of [['基准情景','base'],['乐观情景','upside'],['风险情景','downside']]) researchParagraph(details,label,profile.forecast[key]);
  researchList(details,'未来人才需求方向（推断）',profile.forecast.talent);
  researchParagraph(details,'可研究的投资环节及条件',profile.forecast.opportunity);
  researchList(details,'后续验证指标',profile.forecast.checkpoints);
  researchParagraph(details,'什么情况会让判断失效',profile.forecast.invalidation);
  details.append(fElement('p','funding-note','以上为基于资料时点的条件研究，不是业绩承诺；招聘可能是替补或储备。未核验具体投资准入、财务状况和实时估值。'));
  card.append(details);
}
function renderIndustryResearch() {
  fundingUI['industry-research-cards'].replaceChildren();
  for (const insight of industryInsights) {
    const card = fElement('article','industry-research-card','');
    card.append(fElement('h3','',insight.theme));
    researchParagraph(card,'方向假设',insight.direction);
    researchList(card,'人才需求方向',insight.talent);
    researchParagraph(card,'投资观察',insight.opportunity);
    researchParagraph(card,'成立条件与失效信号',insight.validation);
    const sources = fElement('div','research-sources','');
    for (const id of insight.companies) {
      const profile = companyResearch.get(id), row = fundingEntries.find(entry => entry.id === id);
      if (profile && row) sources.append(fundingLink(row.company + ' 依据 ↗',profile.hiring.jobs[0]?.url || profile.business.sources[0].url));
    }
    card.append(sources); fundingUI['industry-research-cards'].append(card);
  }
  if (!industryInsights.length) fundingUI['industry-research-cards'].append(fElement('p','funding-note','行业研究暂未加载，融资列表仍可使用。'));
}
async function loadCompanyResearch() {
  if (researchBusy) return;
  researchBusy = true;
  let stage = 'connection';
  try {
    fundingUI['research-status'].textContent = '正在加载公司业务与招聘研究，连接较慢时会自动重试…';
    const data = await readPublicJSON('./company-research.json?v=20261012-sectors1');
    stage = 'validate';
    const validated = validateCompanyResearch(data);
    companyResearch = validated; industryInsights = data.industry_insights;
    stage = 'display';
    const verified = [...companyResearch.values()].filter(profile => profile.hiring.evidence_level === '岗位要求已核验').length;
    const directional = [...companyResearch.values()].filter(profile => profile.hiring.evidence_level === '仅招聘方向介绍').length;
    fundingUI['research-status'].textContent = `公司研究 · ${companyResearch.size} 家主营概况 · ${verified} 家有已核验岗位要求 · ${directional} 家仅有招聘方向介绍 · 整理于 ${data.updated_on}。发展情景是条件推断，不保证结果。`;
    renderFunding();
  } catch (error) {
    console.error('Company research load failed',stage,error.name,error.message);
    fundingUI['research-status'].textContent = `公司研究暂时无法加载：${loadingReason(error,stage)}。请点击「重试加载」；已加载内容会保留。`;
    fundingUI['funding-retry'].hidden = false;
  } finally { researchBusy = false; }
}
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
    if (!fUrl(row.source_url) || (row.company_url && !fUrl(row.company_url)) || (row.careers_url && !fUrl(row.careers_url))) throw new Error('Invalid funding URL');
    if (row.amount_scope && !['single','combined','cumulative','undisclosed'].includes(row.amount_scope)) throw new Error('Invalid amount scope');
    if (row.sector_tags !== undefined && (!Array.isArray(row.sector_tags) || row.sector_tags.length > Object.keys(sectorRoles).length || row.sector_tags.some(sector => !Object.hasOwn(sectorRoles,sector)) || new Set(row.sector_tags).size !== row.sector_tags.length)) throw new Error('Invalid sector tags');
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
    const search = [row.company,...fundingSectors(row),row.subsector,row.summary,row.round,row.research_focus,row.country === 'CN' ? '中国' : '美国',...row.investors.map(investor => investor.name),profileSearchText(companyResearch.get(row.id))].join(' ').toLocaleLowerCase();
    return row.announced_on <= today && (!cutoff || row.announced_on >= cutoff)
      && (!filters.keyword || search.includes(filters.keyword)) && (!filters.country || row.country === filters.country)
      && (!filters.sector || fundingSectors(row).includes(filters.sector))
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
  renderIndustryResearch();
  const focusedWatch = document.activeElement?.dataset?.watchId;
  const entries = selectFunding(fundingEntries,fundingFilters());
  fundingUI['funding-count'].textContent = `显示 ${entries.length} 条 · 共收录 ${fundingEntries.length} 条`;
  fundingUI['funding-stat-events'].textContent = String(entries.length);
  fundingUI['funding-stat-companies'].textContent = String(new Set(entries.map(row => row.company)).size);
  fundingUI['funding-stat-investors'].textContent = String(new Set(entries.flatMap(row => row.investors.map(investor => investor.name))).size);
  fundingUI['funding-export'].disabled = !entries.length;
  fundingUI['funding-sectors'].replaceChildren();
  for (const sector of Object.keys(sectorRoles)) {
    const count = entries.filter(row => fundingSectors(row).includes(sector)).length;
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
    meta.append(fElement('span','tag',row.country === 'CN' ? '中国 · CN' : '美国 · US'),fElement('span','',fundingSectors(row).join(' · ')));
    const time = fElement('time','',row.announced_on); time.dateTime = row.announced_on; meta.append(time);
    const saved = watchlist.has(row.id), watch = fElement('button','watch-button',saved ? '已在观察名单' : '加入观察名单');
    watch.type = 'button'; watch.dataset.watchId = row.id; watch.setAttribute('aria-pressed',String(saved)); watch.setAttribute('aria-label',`${saved ? '移出' : '加入'}观察名单：${row.company}`); watch.addEventListener('click',() => toggleWatch(row.id)); meta.append(watch);
    card.append(meta,fElement('h3','',row.company),fElement('p','funding-subsector',row.subsector));
    const profile = companyResearch.get(row.id);
    if (profile) renderBusinessOverview(card,profile);
    const facts = fElement('dl','funding-facts',''); fundingFact(facts,'融资轮次',row.round); fundingFact(facts,row.amount_scope === 'combined' ? '多轮合计金额' : row.amount_scope === 'cumulative' ? '累计融资金额' : '本轮金额',row.amount); fundingFact(facts,'估值',row.valuation); fundingFact(facts,'披露状态',row.deal_status); card.append(facts);
    card.append(fElement('p','summary',row.summary));
    const investors = fElement('div','investor-chips','');
    investors.append(fElement('span','funding-label','披露投资方'));
    row.investors.forEach(investor => { const button = fElement('button','investor-chip',investor.name); button.type = 'button'; button.title = investor.role; button.setAttribute('aria-label',`筛选投资方 ${investor.name}（${investor.role}）`); button.addEventListener('click',() => { fundingUI['funding-investor'].value = investor.name; renderFunding(); fundingUI['funding-investor'].focus(); }); investors.append(button); });
    card.append(investors,fElement('p','funding-note',row.investor_note));
    if (profile) renderCompanyResearch(card,row,profile);
    else {
    const details = fElement('details','pilot-analysis',''); details.append(fElement('summary','','公司研究与岗位线索'));
    details.append(fElement('h4','','观察重点（研究提示）'),fElement('p','',row.research_focus));
    details.append(fElement('h4','','岗位方向（参考，非招聘事实）'),fElement('p','',sectorRoles[row.sector].join(' / ')));
    details.append(fElement('h4','','招聘核验'),fElement('p','',row.hiring_status + (row.hiring_checked_on ? ` · 核对于 ${row.hiring_checked_on}` : '')));
    if (row.verified_roles.length) details.append(fElement('p','',`核对页面列示：${row.verified_roles.join(' / ')}。岗位可能变化，请回原站确认。`));
    if (row.careers_url) details.append(fundingLink('查看招聘入口 ↗',row.careers_url));
    details.append(fElement('p','funding-note',`来源核对于 ${row.checked_on}；公司披露未经过本工具独立财务审计。`)); card.append(details);
    }
    const bottom = fElement('div','card-bottom funding-links',''); bottom.append(fundingLink('融资披露 ↗',row.source_url));
    if (row.company_url) bottom.append(fundingLink('公司官网 ↗',row.company_url));
    else bottom.append(fElement('span','funding-note','公司官网尚未核验'));
    bottom.append(fElement('span','source',row.source_name)); card.append(bottom); fundingUI['funding-cards'].append(card);
  }
  if (!entries.length) fundingUI['funding-cards'].append(fElement('p','empty',fundingEntries.length ? '当前筛选暂无已收录融资。可清除筛选或选择「全部已收录」；新赛道会在信息核对后逐步补充，暂无条目不代表没有融资活动。' : '暂无已加载融资信息，请重试加载。'));
  if (focusedWatch) {
    const remaining = [...fundingUI['funding-cards'].querySelectorAll('.watch-button')].find(button => button.dataset.watchId === focusedWatch);
    (remaining || fundingUI['funding-watch-only']).focus();
  }
}
function csvCell(value) { let cell = fText(value).replace(/[\r\n\t]/g,' '); if (/^[\u0000-\u0020]*[=+@-]/.test(cell)) cell = "'" + cell; return '"' + cell.replace(/"/g,'""') + '"'; }
function fundingCSV(entries) {
  const columns = ['公司','国家','赛道','细分方向','公告日期','轮次','融资金额（原始口径，合计见说明）','估值（非融资额）','披露状态','投资方与角色','业务摘要','观察重点（研究提示）','招聘证据等级','招聘核对日期','公司官网','招聘入口','融资来源','核对日期','主营业务','产品','目标使用方','收费与披露边界','招聘要求摘要','岗位来源','预测依据与期限','基准情景（推断）','乐观情景（推断）','风险情景（推断）','人才方向（推断）','投资观察与条件','验证指标','失效信号'];
  const rows = entries.map(row => {
    const profile = companyResearch.get(row.id);
    return [row.company,row.country,fundingSectors(row).join(' / '),row.subsector,row.announced_on,row.round,row.amount,row.valuation,row.deal_status,row.investors.map(investor => `${investor.name}（${investor.role}）`).join('；'),row.summary,row.research_focus,profile?.hiring.evidence_level || row.hiring_status,profile?.checked_on || row.hiring_checked_on || '',row.company_url,row.careers_url || '',row.source_url,row.checked_on,profile?.business.overview || '',profile?.business.products.join(' / ') || '',profile?.business.customers || '',profile?.business.monetization || '',profile?.hiring.jobs.map(job => `${job.title}：${job.requirements.join(' / ')}`).join('；') || '',profile?.hiring.jobs.map(job => job.url).join('；') || '',profile ? `${profile.forecast.horizon}；${profile.forecast.basis}` : '',profile?.forecast.base || '',profile?.forecast.upside || '',profile?.forecast.downside || '',profile?.forecast.talent.join(' / ') || '',profile?.forecast.opportunity || '',profile?.forecast.checkpoints.join(' / ') || '',profile?.forecast.invalidation || ''];
  });
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
  let stage = 'connection';
  try {
    const data = await readPublicJSON('./funding-data.json?v=20261012-sectors1');
    stage = 'validate';
    fundingEntries = validateFundingData(data);
    stage = 'display';
    updateInvestorOptions(); renderFunding();
    fundingUI['funding-status'].textContent = `人工核实样本 · 最近整理 ${data.updated_on} · 当前列表经核验后人工发布；自动发现的线索不直接上线。非全市场统计。`;
    fundingUI['funding-retry'].hidden = false;
  } catch (error) {
    console.error('Funding load failed',stage,error.name,error.message);
    fundingUI['funding-status'].textContent = `融资信息暂时无法加载：${loadingReason(error,stage)}。请点击「重试加载」。` + (fundingEntries.length ? ' 当前保留已加载记录。' : '');
    fundingUI['funding-retry'].hidden = false;
  } finally { fundingBusy = false; fundingUI['funding-retry'].disabled = false; }
}
fundingUI['funding-search'].addEventListener('input',renderFunding);
for (const id of ['funding-period','funding-country','funding-sector','funding-round','funding-investor','funding-watch-only']) fundingUI[id].addEventListener('change',renderFunding);
fundingUI['funding-clear'].addEventListener('click',() => { for (const id of ['funding-search','funding-country','funding-sector','funding-round','funding-investor']) fundingUI[id].value = ''; fundingUI['funding-period'].value = '90'; fundingUI['funding-watch-only'].checked = false; renderFunding(); });
fundingUI['funding-export'].addEventListener('click',exportFunding);
fundingUI['funding-retry'].addEventListener('click',() => { loadFunding(); loadCompanyResearch(); });
window.addEventListener('storage',event => { if (event.key === WATCH_KEY || event.key === null) { watchlist = readWatchlist(); watchNotice(); renderFunding(); } });
watchNotice();
loadFunding();
loadCompanyResearch();

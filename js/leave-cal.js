// Leave & Holiday Calendar as a dashboard page (Kate, 17 Nov 2026: "parang standalone pa rin, wala yung main side bar navi").
// It used to be a Team Home page (hub/leavecal.html); hub/leavecal now sends people here. The page itself (its filters, planner, tables, exports) is
// the same code, drawn into a shadow root so its styles and ids cannot clash with the dashboard's and the dashboard's cannot reach in. The dashboard
// supplies the main sidebar and the fixed top bar; this page keeps its own filter bar (Branch, Staff, Department, Year, View) under that bar.
// Reads leave_calendar() (migrations/leave_calendar.sql), Level 4 and 5 only; the data refuses everyone else. Needs from dashboard.js: sb.
// The page's script is generated from the Team Home page by a one-off copy, so changes after 17 Nov 2026 are made here.

const LVC_CSS = "*,*::before,*::after{box-sizing:border-box}\n.lvc{max-width:1400px;margin:0 auto;padding:10px 28px 48px;background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;font-size:16px;line-height:1.6;-webkit-text-size-adjust:100%}\n@media(max-width:760px){.lvc{padding:10px 10px 48px}}\na{color:inherit}button{font:inherit;color:inherit}.hide{display:none!important}\n:host{display:block;--warn:#8A5A0C;--warn-bg:#FAEEDA;--radius:12px;--mark:#FDE9A8}\n.lvc[data-dark]{--warn:#EEF3C7;--warn-bg:rgba(238,243,199,.12);--mark:rgba(238,243,199,.28)}\n:host{--hl:#FDE9A8;--hol:#1A1A1A;--hol-fg:#FBF7F0;--ok:#0F8A72;--wk:transparent;\n  --c-SAA:#548235;--c-KCA:#2F5597;--c-MC:#ED7D31;--c-AQ:#7030A0;--c-X:#8A847C;--amber:#D9A400;--red:#C0392B;--green:#2E8B57;--blk:#9A948C;--t-VL:#2F7DC0;--t-SL:#2E8B57;--t-ABS:#C0392B;--t-EL:#E08A1E}\n.lvc[data-dark]{--hl:rgba(242,193,78,.22);--hol:#99F6E4;--hol-fg:#2D2E37;--ok:#99F6E4}\n.wrap{max-width:1400px}\n\n.topbar{position:sticky;top:var(--kbh,76px);z-index:19;background:var(--bg);margin:0 -2px;padding:0 2px}\n.lc-rule{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0 0;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted2)}\n.lc-rule b{font-weight:700;color:var(--text)}\n.lc-rule .rl{display:flex;gap:8px;flex-wrap:wrap}\n@media (max-width:760px){.lc-rule{padding:6px 0;min-height:44px}.lc-rule .rl{display:none}.mast-acts{flex-wrap:nowrap;min-width:0;width:100%;justify-content:flex-start}.filters-wrap,#filtersBtn{display:none}.tglr{min-height:44px;padding:0 14px;font-size:12.5px;letter-spacing:.02em;text-transform:none;color:var(--text)}#fSheetBtn{display:inline-flex;align-items:center;gap:7px;max-width:100%;min-width:0}#fSheetSum{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.topbar{border-bottom:1px solid var(--border)}}\n.side{top:calc(var(--tb,160px) + 10px)}\n.filters{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 32px;padding:8px 0}\n.f-row{display:flex;align-items:baseline;gap:12px;min-width:0}\n.f-lbl{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--muted2);flex-shrink:0}\n.chipset{display:flex;flex-wrap:wrap;align-items:baseline}\n.gchip{border:0;background:none;padding:6px 0;font-size:14px;color:var(--muted2);cursor:pointer;white-space:nowrap;border-bottom:1px solid transparent;line-height:1.3}\n.gchip:hover{color:var(--text)}\n.gchip[aria-pressed=\"true\"]{color:var(--text);font-weight:600;border-bottom-color:var(--text)}\n.sep{color:var(--muted2);opacity:.4;font-size:14px;padding:0 8px;user-select:none}\n.gseg{display:inline-flex;align-self:center;border:1px solid var(--border);border-radius:999px;padding:2px;gap:2px}\n.gseg .gchip{padding:3px 12px;border:0;border-radius:999px;font-size:13px}\n.gseg .gchip[aria-pressed=\"true\"]{background:var(--text);color:var(--bg)}\n.note{margin:14px 0;padding:10px 14px;border-radius:10px;background:var(--warn-bg);color:var(--warn);font-size:13px;line-height:1.5}\n.note b{font-weight:700}\n.why{margin:0 0 16px;padding:12px 16px;border:1px solid var(--border);border-left:3px solid var(--text);border-radius:10px;background:var(--surface);font-size:13.5px}\n.why .wk{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted2);font-weight:700;margin-bottom:4px}\n.why p{margin:3px 0;color:var(--muted)}\n.why p b{color:var(--text)}\n.why .try{margin-top:8px;padding-top:8px;border-top:1px solid var(--border2)}\nh2{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted2);margin:26px 0 10px;font-weight:700}\n.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}\n.tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;min-width:0}\n.tile .k{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted2);font-weight:700}\n.tile .v{font-size:26px;font-weight:600;line-height:1.2;margin-top:4px}\n.tile .s{font-size:12.5px;color:var(--muted);margin-top:2px}\n.layers{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px}\n.lay{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:6px 14px;font-size:13px;color:var(--muted);cursor:pointer}\n.lay[aria-pressed=\"true\"]{color:var(--text);border-color:var(--text)}\n.lay[aria-pressed=\"false\"] .sw{opacity:.35}\n.lay small{color:var(--muted2);font-size:12px}\n.sw{width:14px;height:14px;border-radius:4px;display:inline-block;flex-shrink:0}\n.sw.hol{background:var(--hol)}\n.sw.app{background:var(--green)}\n.sw.req{border:2px solid var(--amber);background:transparent}\n.sw.inf{border:2px dotted var(--muted2);background:transparent}\n.sw.plan{border:2px solid var(--muted2);background:var(--surface2)}\n.chip.plan{background:transparent;border:1px solid var(--border);border-left-width:3px}\n.badge.plan{border-style:solid}\n.badge.app{border-color:var(--green);color:var(--green);font-weight:600}\n.pill{display:inline-block;min-width:22px;padding:1px 6px;border-radius:999px;font-size:12px;font-weight:600;text-align:center}\n.pill.sl{background:var(--hl);color:var(--text)}\n.pill.ab{background:var(--red);color:#fff}\n.sickT td.m{text-align:center;padding:6px 2px;min-width:30px}\n.sickT th.m{text-align:center;padding:6px 2px}\n.sickT{border-collapse:separate;border-spacing:0}\n.sickT th{position:sticky;top:var(--tb,160px);z-index:6;background:var(--surface);border-bottom:1px solid var(--text)}\n.sickT td{border-bottom:1px solid var(--border2)}\n.tw.fix{overflow:visible}\n.stf{display:flex;align-items:center;gap:8px;white-space:nowrap}\n.stf-ph{height:30px;width:auto;max-width:30px;object-fit:contain;display:block}\n.stf-ini{height:30px;width:26px;border-radius:6px;background:var(--surface2);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}\n.sickT td.pos{color:var(--muted);font-size:12.5px;white-space:nowrap}\n.sickT th:first-child,.sickT td:first-child,.sickT th:nth-child(2),.sickT td:nth-child(2),.sickT th:nth-child(3),.sickT td:nth-child(3){width:1%;white-space:nowrap}\n.sickT td.sch{color:var(--muted);font-size:12.5px;white-space:nowrap;padding-right:14px}\n.sickT td:first-child,.sickT th:first-child{padding-right:18px}\n.sickT td:nth-child(2),.sickT th:nth-child(2){padding-right:14px}\n@media (max-width:760px){.tw.fix{overflow-x:auto}}\n.main{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;align-items:start}\n.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;box-shadow:var(--shadow)}\n.side{position:sticky;top:170px}\n.side h3{margin:0 0 2px;font-size:16px}\n.side .d{font-size:12.5px;color:var(--muted);margin-bottom:10px}\n.item{padding:9px 0;border-top:1px solid var(--border2);font-size:13.5px}\n.item:first-of-type{border-top:0}\n.item b{font-weight:600}\n.item .m{color:var(--muted);font-size:12.5px}\n.badge{display:inline-block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:1px 8px;border-radius:999px;border:1px solid var(--border);color:var(--muted);margin-left:6px;white-space:nowrap}\n.badge.req{border-color:var(--amber);color:var(--warn)}\n.badge.inf{border-style:dotted}\n.badge.hol{background:var(--hol);color:var(--hol-fg);border-color:var(--hol)}\n.badge.off{border-color:var(--red);color:var(--red);font-weight:600}\n.badge.on{border-color:var(--green);color:var(--green);font-weight:600}\n.badge.tbc{border-style:dashed}\ntd .badge{margin-left:0}\n.wkmark{font-size:20px;font-weight:700;text-align:center;width:90px}\n.wkmark.ok{color:var(--green)}\n.wkmark.x{color:var(--red)}\n.wkmark.q{color:var(--muted2);font-weight:400}\n.wkmark.pt{color:var(--amber)}\n.badge.part{border-color:var(--amber);color:var(--warn);font-weight:600}\n.dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;background:var(--c-X)}\n.empty{color:var(--muted2);font-size:13px;padding:6px 0}\n.year{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px 16px}\n.mo{min-width:0}\n.mo h4{margin:0 0 4px;font-size:13px;font-weight:600;cursor:pointer}\n.mo h4:hover{text-decoration:underline}\n.g7{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}\n.wd{font-size:9.5px;color:var(--muted2);text-align:center;letter-spacing:.04em}\n.dc{position:relative;height:28px;border-radius:6px;font-size:11.5px;line-height:1.2;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:3px;cursor:pointer;border:1px solid transparent;background:transparent;min-width:0;overflow:hidden}\n.dc.wk{background:var(--wk)}\n.dc:hover{border-color:var(--muted2)}\n.dc.today{border-color:var(--text);font-weight:700}\n.dc.sel{outline:2px solid var(--text);outline-offset:-1px}\n.dc.hol{background:var(--hol);color:var(--hol-fg);font-weight:700}\n.dc.out{visibility:hidden}\n.dots{position:absolute;left:0;right:0;bottom:2px;display:flex;gap:2px;justify-content:center;flex-wrap:nowrap;height:6px;overflow:hidden}\n.dots i{width:6px;height:6px;border-radius:50%;display:block}\n.dots i.req{background:transparent !important;border:1.5px solid currentColor}\n.dots i.inf{opacity:.4}\n.dots em{font-style:normal;font-size:8px;color:var(--muted);line-height:6px}\n.mhead{display:flex;align-items:center;gap:10px;margin-bottom:10px}\n.mhead h3{margin:0;font-size:18px;flex:1}\n.nav{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:4px 14px;cursor:pointer;font-size:13px;color:var(--muted)}\n.nav:hover{color:var(--text);border-color:var(--text)}\n.mgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}\n.mgrid .wd{font-size:11px;padding:2px 0}\n.mc{min-height:104px;border:1px solid var(--border2);border-radius:8px;padding:4px 5px;cursor:pointer;overflow:hidden;min-width:0}\n.mc.wk{background:var(--wk)}\n.mc:hover{border-color:var(--muted2)}\n.mc.today{border-color:var(--text)}\n.mc.sel{outline:2px solid var(--text);outline-offset:-1px}\n.mc .n{font-size:12px;font-weight:600;color:var(--muted)}\n.mc.today .n{color:var(--text)}\n.mc.out{opacity:.35}\n.chip{display:block;font-size:11.5px;line-height:1.3;padding:1px 6px;border-radius:5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid var(--c-X);background:var(--surface2)}\n.chip.req{background:transparent;border:1px solid var(--amber);border-left-width:3px}\n.chip.inf{background:transparent;border:1px dotted var(--muted2);border-left-width:3px;color:var(--muted)}\n.chip.hol{background:var(--hol);color:var(--hol-fg);border-color:var(--hol);font-weight:600}\n.more{font-size:11px;color:var(--muted2);margin-top:2px}\n.lt{width:100%;border-collapse:collapse;font-size:13.5px}\n.lt th{text-align:left;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2);padding:6px 8px;border-bottom:1px solid var(--text);font-weight:700}\n.lt td{padding:8px;border-bottom:1px solid var(--border2);vertical-align:top}\n.search{width:100%;max-width:320px;border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:7px 14px;font-size:13.5px;margin-bottom:10px}\n.tw{overflow-x:auto}\n.foot{font-size:12.5px;color:var(--muted);margin-top:18px}\n@media (max-width:1000px){.main{grid-template-columns:1fr}.side{position:static}.tiles{grid-template-columns:repeat(2,1fr)}}\n@media (max-width:760px){.filters{gap:0 20px}.year{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 10px}.dc{height:24px;font-size:10.5px}.dots i{width:4px;height:4px}.mc{min-height:62px;padding:3px}.mc .chip{font-size:0;padding:0;height:6px;border-radius:3px;margin-top:3px}.mc .more{font-size:10px}.lt th:nth-child(n+6),.lt td:nth-child(n+6){display:none}}\n.bar{height:18px;line-height:18px;padding:0 6px;border-radius:4px;font-size:11.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--bc,var(--c-X));cursor:default;min-width:0}\n.bar.cl{border-top-left-radius:0;border-bottom-left-radius:0}\n.bar.cr{border-top-right-radius:0;border-bottom-right-radius:0}\n.bar.app::before{content:\"\\2713 \"}\n.bar.req{background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1.5px var(--amber),inset 4px 0 0 var(--bc)}\n.bar.inf{background:color-mix(in srgb,var(--bc) 16%,transparent);color:var(--text);box-shadow:inset 0 0 0 1.5px var(--bc);opacity:.95;font-style:italic}\n.bar.hol{background:var(--hol);color:var(--hol-fg);font-weight:600}\n.bar.blk{background:var(--blk);color:#fff;font-style:italic}\n.mast-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center}\n.tglr{border:1px solid var(--border);background:var(--surface);color:var(--muted);border-radius:20px;padding:6px 12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;white-space:nowrap;min-height:34px}\n.tglr:hover{color:var(--text)}\n#fSheetBtn{display:none}\n.topbar.fclosed .filters-wrap{display:none}\n.fscrim{display:none;position:fixed;inset:0;z-index:130;background:rgba(26,26,26,.38)}\n.fsheet{display:none;flex-direction:column;position:fixed;left:50%;transform:translateX(-50%);bottom:0;z-index:131;width:min(100%,390px);background:var(--bg);border-radius:18px 18px 0 0;padding:0 10px 18px;max-height:80vh;overflow:auto;box-shadow:var(--shadow)}\n.lvc.sheet-open .fscrim,.lvc.sheet-open .fsheet{display:flex}\n.fsheet-head{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)}\n.fsheet-head b{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}\n.fsheet .filters{flex-direction:column;align-items:stretch;gap:14px;padding:12px 0 4px}\n.fsheet .f-row{flex-direction:column;align-items:stretch;gap:8px}\n.fsheet .f-lbl{font-size:12px}\n.fsheet .chipset{gap:8px}\n.fsheet .sep{display:none}\n.fsheet .gchip{min-height:44px;padding:0 16px;border:1px solid var(--border);border-radius:999px;font-size:15px;background:var(--surface)}\n.fsheet .gchip[aria-pressed=\"true\"]{background:var(--text);color:var(--bg);border-color:var(--text)}\n.fsheet .gseg{display:flex;flex:1 0 100%;padding:3px;gap:3px;background:var(--surface)}\n.fsheet .gseg .gchip{flex:1;border:0;background:none;color:var(--muted2)}\n.fsheet .gseg .gchip[aria-pressed=\"true\"]{background:var(--text);color:var(--bg)}\n.sickbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:0 0 10px}\n#sickInfo{display:inline-flex;align-items:center;gap:12px;font-size:12.5px;color:var(--muted)}\n.rs{border:0;background:none;color:var(--ok);text-decoration:underline;cursor:pointer;font-size:12.5px;padding:0}\n:root:not([data-theme=\"dark\"]) .rs{color:#0F6B58}\n.sickT .hd{display:flex;align-items:center;gap:2px}\n.sickT th.m .hd{justify-content:center}\n.sickT th.on{background:color-mix(in srgb,var(--ok) 14%,var(--surface))}\n.fi{flex:none;width:22px;height:22px;border:0;border-radius:6px;background:none;color:var(--muted2);cursor:pointer;display:grid;place-items:center;padding:0}\n.fi:hover{background:var(--border);color:var(--text)}\n.fi.on{background:color-mix(in srgb,var(--ok) 22%,transparent);color:var(--ok)}\n.fi svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}\n.sickT th.mcol{position:sticky}\n.sickT th.mcol .hd{position:relative;justify-content:center}\n.sickT th.mcol .fi{position:absolute;right:-4px;top:-5px;width:16px;height:16px;opacity:0;background:var(--surface)}\n.sickT th.mcol:hover .fi,.sickT th.mcol .fi.on,.sickT th.mcol .fi:focus-visible{opacity:1}\n.sickT th.mcol .fi svg{width:10px;height:10px}\n.fm{position:fixed;z-index:150;width:288px;max-height:min(560px,calc(100vh - 20px));overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:6px 0;display:none;font-size:13.5px;font-family:Inter,system-ui,sans-serif}\n.fm .it{display:flex;gap:10px;align-items:center;width:100%;padding:8px 14px;border:0;background:none;cursor:pointer;text-align:left;font-size:13.5px}\n.fm .it:hover{background:var(--surface2)}\n.fm .it.on{color:var(--ok);font-weight:600}\n.fm hr{border:0;border-top:1px solid var(--border);margin:6px 0}\n.fm .sec{padding:2px 14px 6px}\n.fm .sh{display:flex;justify-content:space-between;align-items:center;width:100%;border:0;background:none;padding:6px 0;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer}\n.fm select,.fm .fin{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:6px 9px;font-size:13px;margin-top:4px}\n.fm .row2{display:flex;gap:6px}\n.fm .vact{display:flex;gap:12px;font-size:12px;margin:6px 0 4px;align-items:center}\n.fm .vact button{border:0;background:none;color:var(--ok);cursor:pointer;padding:0;text-decoration:underline;font-size:12px}\n:root:not([data-theme=\"dark\"]) .fm .vact button{color:#0F6B58}\n.fm .vact span{margin-left:auto;color:var(--muted2)}\n.fm .vl{max-height:190px;overflow:auto;border:1px solid var(--border2);border-radius:8px;padding:4px 6px;margin-top:4px}\n.fm .vl label{display:flex;gap:8px;align-items:center;padding:3px 2px;cursor:pointer}\n.fm .vl label span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.fm .vl label em{font-style:normal;color:var(--muted2);font-size:11.5px}\n.fm .btns{display:flex;justify-content:flex-end;gap:8px;padding:8px 14px 6px}\n.fm .go{border:1px solid var(--accent);background:var(--accent);color:var(--accent-fg);border-radius:999px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer}\n.fm .go.ghost{background:none;color:var(--text);border-color:var(--border)}\n.fm button:focus-visible,.fm input:focus-visible,.fm select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}\n.sickT th:nth-child(2),.sickT td:nth-child(2),.sickT th:nth-child(3),.sickT td:nth-child(3){width:auto;white-space:normal;max-width:190px}\n.sickT td.pos,.sickT td.sch{white-space:normal;max-width:190px;line-height:1.35}\n.sickT th.m{padding:6px 1px;font-size:11px;letter-spacing:.06em}\n.sickT td.m{min-width:0}\n.card.tw.fix.sickw{padding:0;overflow:auto;max-height:calc(100vh - var(--tb,160px) - 24px);scrollbar-gutter:stable}\n.sickw .sickT{min-width:1340px}\n.card.tw.fix.sickw.pg{overflow:visible;max-height:none}\n.sickw.pg .sickT th,.sickw.pg .offT th{top:var(--tb,160px)}\n.sickw .sickT th{top:0;z-index:6}\n.sickw .sickT td:first-child,.sickw .sickT th:first-child{position:sticky;left:0;z-index:3;background:var(--surface);box-shadow:1px 0 0 var(--border);min-width:236px}\n.sickw .sickT th:first-child{z-index:9}\n.sickw .sickT th.m,.sickw .sickT td.m{width:52px;min-width:52px;padding-left:0;padding-right:0;border-left:1px solid rgba(128,128,128,.16)}\n.sickw .sickT th:nth-child(4),.sickw .sickT td:nth-child(4),.sickw .sickT th:nth-child(16),.sickw .sickT td:nth-child(16){border-left:1px solid rgba(128,128,128,.34)}\n.sickw .sickT th:nth-child(16),.sickw .sickT td:nth-child(16),.sickw .sickT th:nth-child(17),.sickw .sickT td:nth-child(17){width:70px;min-width:70px}\n.sickw .sickT td:nth-child(2),.sickw .sickT th:nth-child(2){min-width:150px}\n.sickw .sickT td:nth-child(3),.sickw .sickT th:nth-child(3){min-width:150px}\n.covT{border-collapse:separate;border-spacing:0;width:100%}\n.covT th{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted2);padding:6px 8px;border-bottom:1px solid var(--text);font-weight:700;text-align:left}\n.covT th.m{text-align:center}\n.covT td{padding:8px;border-bottom:1px solid var(--border2)}\n.covT td.m{text-align:center;border-left:1px solid rgba(128,128,128,.16)}\n.covT td.low{background:color-mix(in srgb,var(--red) 18%,transparent);font-weight:700}\n.offT{border-collapse:separate;border-spacing:0;width:100%;min-width:1000px}\n.offT th{position:sticky;top:0;z-index:6;background:var(--surface);border-bottom:1px solid var(--text);padding:6px 8px}\n.offT td{border-bottom:1px solid var(--border2);padding:6px 8px}\n.offT .hd{display:flex;align-items:center;gap:2px}\n.offT th.m .hd{justify-content:center}\n.offT th.on{background:color-mix(in srgb,var(--ok) 14%,var(--surface))}\n.offT th.mcol .hd{position:relative}\n.offT th.mcol .fi{position:absolute;right:-6px;top:-5px;width:16px;height:16px;opacity:0;background:var(--surface)}\n.offT th.mcol:hover .fi,.offT th.mcol .fi.on,.offT th.mcol .fi:focus-visible{opacity:1}\n.offT th.mcol .fi svg{width:10px;height:10px}\n.offT td:first-child,.offT th:first-child{position:sticky;left:0;z-index:3;background:var(--surface);box-shadow:1px 0 0 var(--border);min-width:236px;white-space:nowrap}\n.offT th:first-child{z-index:9}\n.offT th.m,.offT td.m{text-align:center;width:62px;min-width:62px;padding-left:2px;padding-right:2px;border-left:1px solid rgba(128,128,128,.16)}\n.offT td.dayc{font-size:12px;color:var(--text)}\n.offT td.dayc.off{color:var(--red);font-weight:700;background:repeating-linear-gradient(45deg,rgba(192,57,43,.10),rgba(192,57,43,.10) 4px,transparent 4px,transparent 8px)}\n.offT td.pos,.offT td.sch{white-space:normal;max-width:190px;line-height:1.35;font-size:12.5px;color:var(--muted)}\n.tw{padding-bottom:6px}\n.plangrid{min-width:780px}\n.pl-head{position:sticky;top:var(--tb,160px);z-index:7;background:var(--surface);padding:8px 0 6px;margin-bottom:6px;border-bottom:1px solid var(--border)}\n@media (max-width:1099px){.tw.fix.planw{overflow-x:auto}}\n.bar{border-right:2px solid var(--surface)}\n.bar:hover{filter:brightness(1.12);outline:2px solid var(--text);outline-offset:-1px}\n.tip{position:fixed;z-index:300;display:flex;gap:12px;align-items:flex-start;max-width:340px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 34px -8px rgba(0,0,0,.35);padding:12px 14px;pointer-events:none;font-size:13px;line-height:1.45}\n.tip-ph{flex:0 0 auto;min-width:56px;display:flex;align-items:flex-end;justify-content:center}\n.tip-ph img{height:88px;width:auto;max-width:96px;object-fit:contain;display:block}\n.tip-ini{width:56px;height:56px;border-radius:8px;background:var(--surface2);color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600}\n.tip-tx{min-width:0}\n.tip-tx b{font-size:15px;font-weight:600}\n.tip-tx .m{color:var(--muted);font-size:12.5px}\n.tip-tx .dur{font-weight:700;font-size:15px;margin-top:2px}\n.tip-tx .badge{margin:3px 0}\n.main.stack{grid-template-columns:1fr}\n.main.stack .side{position:static}\n.withrail{display:block}\n.railmain{min-width:0}\n.rail{position:sticky;top:var(--tb,160px);z-index:40;background:var(--bg);margin:0 0 14px;padding:8px 0;border-bottom:1px solid var(--border);display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}\n.rail::-webkit-scrollbar{display:none}\n.rail .k{display:none}\n.rail button{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:5px 13px;font-size:13px;color:var(--muted);cursor:pointer;white-space:nowrap}\n.rail button.on{background:var(--hl);border-color:transparent;color:var(--text);font-weight:600}\n[id^=\"sec-\"]{scroll-margin-top:calc(var(--tb,160px) + 64px)}\n@media (min-width:1100px){.wrap{max-width:1400px}.withrail{display:grid;grid-template-columns:150px minmax(0,1fr);gap:32px;align-items:start}.rail{top:calc(var(--tb,160px) + 14px);display:block;margin:0;padding:0;border:0;background:none;overflow:visible}.rail .k{display:block;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--muted2);padding-bottom:9px;border-bottom:1px solid var(--text);margin-bottom:2px}.rail button{display:block;width:100%;text-align:left;border:0;border-left:2px solid var(--border);border-radius:0;background:none;padding:8px 0 8px 13px;font-size:14px;line-height:1.35;white-space:normal}.rail button.on{background:none;border-left-color:var(--text);color:var(--text);font-weight:600}[id^=\"sec-\"]{scroll-margin-top:calc(var(--tb,160px) + 16px)}}\n.pl-row{display:grid;grid-template-columns:44px minmax(0,1fr);gap:0 8px;margin-bottom:4px}\n.pl-lab{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);padding-top:6px;cursor:pointer}\n.pl-head .pl-lab{cursor:default}\n.pl-cols{display:grid;grid-template-columns:repeat(31,minmax(0,1fr));font-size:11px;color:var(--muted2);text-align:center}\n.pl-body{position:relative;border:1px solid var(--border);border-radius:6px;background:var(--surface);overflow:hidden}\n.pl-bg{position:absolute;inset:0;display:grid;grid-template-columns:repeat(31,minmax(0,1fr))}\n.pl-c{border-right:1px solid var(--border2);cursor:pointer}\n.pl-c.x{background:var(--surface2);cursor:default}\n.pl-c.h{background:var(--hl)}\n.pl-c.b{background:repeating-linear-gradient(45deg,rgba(154,148,140,.28),rgba(154,148,140,.28) 4px,transparent 4px,transparent 8px)}\n.pl-c.today{background:rgba(92,224,200,.14);box-shadow:inset 2px 0 0 #5CE0C8,inset -2px 0 0 #5CE0C8}\n.pl-c.sel{box-shadow:inset 0 0 0 1px var(--muted2)}\n.pl-c.sel.today{box-shadow:inset 2px 0 0 #5CE0C8,inset -2px 0 0 #5CE0C8}\n.pl-bars{pointer-events:none;position:absolute;inset:4px 0 0 0;display:grid;grid-template-columns:repeat(31,minmax(0,1fr));grid-auto-rows:18px;row-gap:2px}\n.wkrow{position:relative;margin-bottom:4px}\n.wkbg{position:absolute;inset:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0 4px}\n.wkbg .mc{min-height:0;height:100%}\n.wkbg .mc.b{background:repeating-linear-gradient(45deg,rgba(154,148,140,.28),rgba(154,148,140,.28) 4px,transparent 4px,transparent 8px)}\n.wkbars{position:absolute;top:26px;left:0;right:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));column-gap:4px;grid-auto-rows:18px;row-gap:2px;padding:0 1px}\n.blegend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:6px 0 2px;font-size:12.5px;color:var(--muted)}\n.blegend i{display:inline-block;width:26px;height:10px;border-radius:3px;margin-right:6px;vertical-align:middle}\n.sw.blk{background:var(--blk)}\n.sw.ty{border-radius:4px}\n.lay-sep{flex-basis:100%;height:0}\n.pl-chips{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:3px 4px;padding:0 5px 5px}\n.pl-chip{font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;color:#fff;background:var(--bc);white-space:nowrap;cursor:default}\n.pl-chip.ABS{box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}\n@media (max-width:760px){.bar{font-size:10.5px;padding:0 3px}}\n.side{top:calc(var(--tb,160px) + 10px)}\n.pl-c.today{background:none;box-shadow:inset 2px 0 0 #5CE0C8}\n.pl-c.sel.today{box-shadow:inset 2px 0 0 #5CE0C8}\n.sc-btn{appearance:none;padding:5px 12px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;transition:border-color .2s,color .2s}\n@media(hover:hover){.sc-btn:hover{border-color:var(--accent);color:var(--accent)}}\n.rex-bar{display:inline-flex;gap:6px;margin-left:auto}\n.rex-btn[disabled]{opacity:.5;cursor:default}\n.lgx-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,14px);z-index:9999;max-width:min(560px,calc(100vw - 32px));padding:10px 16px;border-radius:8px;font-size:13.5px;line-height:1.45;background:var(--text);color:var(--bg);box-shadow:var(--shadow);opacity:0;pointer-events:none;transition:opacity .18s,transform .18s}\n.lgx-toast.on{opacity:1;transform:translate(-50%,0)}\n.lgx-toast.bad{background:var(--red);color:#fff}\n.lc-sechead{display:flex;align-items:flex-end;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin:0 0 6px}\n.lc-sechead h2{margin-bottom:0}\n";
const LVC_BODY = "<div class=\"topbar\" id=\"topbar\">\n  <div class=\"lc-rule\"><span id=\"mastBranch\"><\/span><span class=\"rl\"><span id=\"mastRange\"><\/span><\/span>\n    <span class=\"mast-acts\"><button class=\"tglr\" id=\"filtersBtn\" type=\"button\" aria-expanded=\"true\" aria-controls=\"filters\">Hide filters<\/button>\n    <button class=\"tglr\" id=\"fSheetBtn\" type=\"button\" aria-expanded=\"false\"><svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 5h18l-7 8v6l-4-2v-4z\"/><\/svg><span id=\"fSheetSum\">Filters<\/span><\/button><\/span><\/div>\n  <div class=\"filters-wrap\"><div class=\"filters\" id=\"filters\"><\/div><\/div>\n<\/div>\n\n<div class=\"withrail\">\n<aside class=\"rail\" aria-label=\"On this page\"><span class=\"k\">On this page<\/span>\n  <button data-sec=\"sec-why\" class=\"on\">Why this page<\/button>\n  <button data-sec=\"sec-overview\">Overview<\/button>\n  <button data-sec=\"sec-cal\">Calendar<\/button>\n  <button data-sec=\"sec-sick\">Sick leave &amp; absences<\/button>\n  <button data-sec=\"sec-off\">Day offs<\/button>\n  <button data-sec=\"sec-hol\">Public holidays<\/button>\n<\/aside>\n<div class=\"railmain\">\n<div class=\"note\"><b>Please read.<\/b> Names, sick leave and absences are HR data, so this page opens for Accounts and Admin and above only. Leave comes from Jumera's notes and the approved list, and Bayzat has no API yet, so a request in Bayzat shows here only once it has been added. Planned dates were read from the planner sheets, so check them before relying on one. Public holidays are <b>expected dates<\/b> from press estimates, not a Cabinet announcement.<\/div>\n\n<div class=\"why\" id=\"sec-why\">\n  <div class=\"wk\">Why this page<\/div>\n  <p><b>Why this:<\/b> one place shows who is off and which days are public holidays, so rosters, bookings and blasts are planned around the real gaps.<\/p>\n  <p><b>Why now:<\/b> leave is now requested in Bayzat, and the National Day holidays start on 2 Dec.<\/p>\n  <p><b>If we do nothing:<\/b> a gap shows up on the day, with a client already booked.<\/p>\n  <div class=\"try\"><b>Try it first:<\/b> open 22 Nov. Who is off, and which bookings would you move? Then tell Kate what you noticed.<\/div>\n<\/div>\n\n<h2 id=\"sec-overview\">Overview<\/h2>\n<div class=\"tiles\" id=\"tiles\"><\/div>\n<div class=\"lc-sechead\"><h2 id=\"sec-cal\">Calendar<\/h2><span class=\"rex-bar\" role=\"group\" aria-label=\"Download this report\"><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download the leave list as an Excel file\" onclick=\"rexRun('lcExpLeave','xlsx',this)\">XLSX<\/button><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download the leave list as a CSV file\" onclick=\"rexRun('lcExpLeave','csv',this)\">CSV<\/button><\/span><\/div>\n<div class=\"layers\" id=\"layers\"><\/div>\n  \n\n  <div class=\"main\">\n    <div class=\"card\" id=\"cal\"><\/div>\n    <div class=\"card side\" id=\"side\"><\/div>\n  <\/div>\n\n  <div class=\"lc-sechead\"><h2 id=\"sec-sick\">Sick leave and absences (counts per month, no dates)<\/h2><span class=\"rex-bar\" role=\"group\" aria-label=\"Download this report\"><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download sick leave and absences as an Excel file\" onclick=\"rexRun('lcExpSick','xlsx',this)\">XLSX<\/button><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download sick leave and absences as a CSV file\" onclick=\"rexRun('lcExpSick','csv',this)\">CSV<\/button><\/span><\/div>\n  <div class=\"foot\" style=\"margin:0 0 8px\"><span class=\"pill sl\">3<\/span> sick with a medical certificate (SL Monitoring). <span class=\"pill ab\">3<\/span> sick without one, marked absent. Follows the Branch filter, and anyone Phorest lists in several salons shows under each. The sheets give counts, not dates, so these cannot be drawn on the calendar days. From Jumera's notes.<\/div>\n  <div class=\"sickbar\"><div class=\"gseg\" id=\"sickMode\"><\/div><span id=\"sickInfo\"><\/span><\/div>\n  <div class=\"card tw fix sickw\"><table class=\"lt sickT\" id=\"sickT\"><\/table><\/div>\n\n  <div class=\"lc-sechead\"><h2 id=\"sec-off\">Usual day offs by branch (from Phorest rosters)<\/h2><span class=\"rex-bar\" role=\"group\" aria-label=\"Download this report\"><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download the usual day offs as an Excel file\" onclick=\"rexRun('lcExpOff','xlsx',this)\">XLSX<\/button><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download the usual day offs as a CSV file\" onclick=\"rexRun('lcExpOff','csv',this)\">CSV<\/button><\/span><\/div>\n  <div class=\"foot\" style=\"margin:0 0 8px\">Each cell is the share of weeks the person was rostered on that weekday in Phorest, 24 Aug to 15 Nov 2026 (12 weeks). <b>off<\/b> = rostered in 25% of weeks or fewer. Only weeks with at least two rostered days count, so a week of leave is not read as a week off. Phorest rosters hours, it does not hold approved leave, and a rota that moves every week shows as Rotating. The top table adds up the shares: the average number of people rostered on each day, the quietest day tinted.<\/div>\n  <div class=\"card tw fix\"><table class=\"lt covT\" id=\"covT\"><\/table><\/div>\n  <div class=\"sickbar\" style=\"margin-top:14px\"><span id=\"offInfo\"><\/span><\/div>\n  <div class=\"card tw fix sickw\"><table class=\"lt offT\" id=\"offT\"><\/table><\/div>\n\n  <div class=\"lc-sechead\"><h2 id=\"sec-hol\">Public holidays 2026 (expected)<\/h2><span class=\"rex-bar\" role=\"group\" aria-label=\"Download this report\"><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download the public holidays as an Excel file\" onclick=\"rexRun('lcExpHol','xlsx',this)\">XLSX<\/button><button type=\"button\" class=\"sc-btn rex-btn\" title=\"Download the public holidays as a CSV file\" onclick=\"rexRun('lcExpHol','csv',this)\">CSV<\/button><\/span><\/div>\n  <div class=\"foot\" style=\"margin:0 0 8px\">Working? is read from Phorest: &#10003; every branch shown had visits, &#10007; none did, &frac12; some did, ? no data yet. It shows what happened, not a rule for next year. Follows the Branch filter. Hover a mark for the visit counts.<\/div>\n  <div class=\"card tw\"><table class=\"lt\" id=\"holT\"><\/table><\/div>\n<div class=\"foot\">Colours are the branch, the same as the planner sheets: KCA blue, AQ purple, SAA green, MC orange. A solid bar = planned, with a tick = approved, amber outline = waiting for approval, grey hatched = blocked days (no leave), the solid dark block = public holiday. Leave and absences come from Jumera's notes.<\/div>\n<\/div>\n<\/div>\n<div class=\"fscrim\" id=\"fScrim\"><\/div>\n<div class=\"fsheet\" id=\"fSheet\" role=\"dialog\" aria-label=\"Filters\">\n  <div class=\"fsheet-head\"><b>Filters<\/b><button class=\"tglr\" type=\"button\" id=\"fDone\">Done<\/button><\/div>\n  <div id=\"fSheetBody\"><\/div>\n<\/div>\n";
let LVC = null;   // the mounted page: { host, shadow, root, D }

function lvcPaintTheme() {   // the page's own tokens have a dark set; the dashboard marks the theme on <html>
  if (!LVC) return;
  if (document.documentElement.getAttribute('data-theme') === 'dark') LVC.root.setAttribute('data-dark', ''); else LVC.root.removeAttribute('data-dark');
}
function lvcSetTb() {   // --kbh is the dashboard's fixed top bar, --tb the bottom of this page's filter bar under it
  if (!LVC) return;
  const h = document.getElementById('topbar'), t = LVC.shadow.getElementById('topbar');
  const kh = h ? Math.round(h.getBoundingClientRect().height) : 76;
  LVC.host.style.setProperty('--kbh', kh + 'px');
  LVC.host.style.setProperty('--tb', (kh + (t ? t.offsetHeight : 0)) + 'px');
}
function lvcShim(shadow, root, host) {   // the page's script was written for a whole document; this gives it its own little one inside the shadow root
  const retarget = f => ev => { const tg = ev.composedPath ? ev.composedPath()[0] : ev.target; f(new Proxy(ev, { get: (o, k) => k === 'target' ? tg : (typeof o[k] === 'function' ? o[k].bind(o) : o[k]) })); };
  return {
    host, body: root,
    getElementById: id => shadow.getElementById(id),
    querySelector: q => shadow.querySelector(q),
    querySelectorAll: q => shadow.querySelectorAll(q),
    createElement: t => document.createElement(t),
    createTextNode: t => document.createTextNode(t),
    addEventListener: (t, f, o) => document.addEventListener(t, retarget(f), o)
  };
}
function lvcMissing(host, msg) { host.innerHTML = '<p style="padding:24px 28px;color:var(--muted)">' + msg + '</p>'; LVC = null; }

async function renderLeaveCal() {
  const host = document.getElementById('leaveCalContent');
  if (!host) return;
  if (LVC && LVC.host === host) { lvcPaintTheme(); lvcSetTb(); return; }
  host.innerHTML = '<p style="padding:24px 28px;color:var(--muted)">Loading…</p>';
  var HOLD = [["2026-01-01", "2026-01-01"], ["2026-03-20", "2026-03-22"], ["2026-05-26", "2026-05-26"], ["2026-05-27", "2026-05-29"], ["2026-06-16", "2026-06-16"], ["2026-08-25", "2026-08-25"], ["2026-12-02", "2026-12-03"]], dates = [];
    HOLD.forEach(function (r) { var a = new Date(r[0] + 'T00:00:00Z').getTime(), b = new Date(r[1] + 'T00:00:00Z').getTime(); for (var t = a; t <= b; t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10)); });
  const r = await sb.rpc('leave_calendar', { p_dates: dates });
  if (r.error || !r.data) { lvcMissing(host, 'This page is not open to your account.'); return; }
  host.innerHTML = '';
  const shadow = host.attachShadow ? (host.shadowRoot || host.attachShadow({ mode: 'open' })) : null;
  if (!shadow) { lvcMissing(host, 'This browser cannot show the Leave and Holiday Calendar.'); return; }
  shadow.innerHTML = '<style>' + LVC_CSS + '</style><div class="lvc" id="lvcRoot">' + LVC_BODY + '</div>';
  const root = shadow.getElementById('lvcRoot');
  LVC = { host, shadow, root, D: r.data };
  const LVD = lvcShim(shadow, root, host);
  const setTb = lvcSetTb;
  lvcPaintTheme();
  new MutationObserver(lvcPaintTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  lvcSetTb();
  window.addEventListener('resize', lvcSetTb);
  window.addEventListener('scroll', lvcSetTb, { passive: true });   // the dashboard's top bar gets shorter once you scroll; the filter bar follows it up
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(lvcSetTb);
    ro.observe(shadow.getElementById('topbar'));
    const dtb = document.getElementById('topbar');
    if (dtb) ro.observe(dtb);
  }
  function startPage(D){
  
  var TODAY=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dubai'});
  var RANGE_TO=D.range.to;
  var ASSETS='/';
  var ROSTER=D.people||[];
  var RBY={};ROSTER.forEach(function(r){RBY[r.n]=r});
  var ALIAS=D.alias||{};
  var KIND={approved:'app',planned:'plan',requested:'req',inferred:'inf'};
  /* leave type: VL vacation (Leave and Vacation), SL sick with a medical certificate, ABS absent (sick without one, unauthorised), EL emergency */
  var TYPES=[['VL','Vacation leave (VL)'],['SL','Sick leave (SL)'],['ABS','Absence, unauthorised'],['EL','Emergency leave (EL)']];
  function tyCode(t){t=String(t||'').toLowerCase();return /sick|^sl$/.test(t)?'SL':/absen|unauth/.test(t)?'ABS':/emerg|^el$/.test(t)?'EL':'VL'}
  var LV=(D.entries||[]).map(function(e){return {c:tyCode(e.ty),n:e.n,b:e.b||'X',ty:e.ty,f:e.f,t:e.t,s:KIND[e.s]||'plan',src:e.src}});
  var BLK=(D.blocked||[]).map(function(b){return {f:b.f,t:b.t}});
  var SICK=(D.sick||[]).map(function(s){var r=RBY[ALIAS[s.n]||s.n];return {n:s.n,b:r&&r.b?r.b:'X',sl:s.sl||undefined,ab:s.ab||undefined}});
  var DAYOFF=(D.dayoffs||[]).map(function(x){return {n:x.n,b:x.b,w:x.w,s:x.s}});
  var PH=D.visits||{};
  var BR={SAA:'Saadiyat',KCA:'Khalifa City A',MC:'Motor City',AQ:'Al Quoz',X:'Branch not set'};
  var MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var WD=['M','T','W','T','F','S','S'];
  
  /* public holidays, expected (moon dates can move a day or two) */
  var HOL=[
   {n:'New Year’s Day',f:'2026-01-01',t:'2026-01-01',note:'Fixed date.'},
   {n:'Eid Al Fitr',f:'2026-03-20',t:'2026-03-22',note:'Expected 20 to 22 Mar (some sources say 19 to 22). Moon sighting.'},
   {n:'Arafat Day',f:'2026-05-26',t:'2026-05-26',note:'Expected. Moon sighting.'},
   {n:'Eid Al Adha',f:'2026-05-27',t:'2026-05-29',note:'Expected 27 to 29 May. Moon sighting.'},
   {n:'Islamic New Year',f:'2026-06-16',t:'2026-06-16',note:'Expected. Can be moved by Cabinet decision.'},
   {n:'Prophet’s Birthday',f:'2026-08-25',t:'2026-08-25',note:'Expected. Can be moved by Cabinet decision.'},
   {n:'National Day',f:'2026-12-02',t:'2026-12-03',note:'Fixed date, two days.'}
  ];
  
  var S={br:['SAA','KCA','MC','AQ'],view:'planner',everyone:true,res:false,F:{},sort:null,F2:{},sort2:null,m:+TODAY.slice(5,7)-1,y:Math.min(2027,Math.max(2026,+TODAY.slice(0,4))),sel:TODAY,dep:[],tys:{VL:true,SL:true,ABS:true,EL:true},layers:{hol:true,app:true,plan:true,req:true,inf:true,blk:true,sick:true},q:''};
  
  function P(s){var a=s.split('-');return Date.UTC(+a[0],+a[1]-1,+a[2])}
  function iso(t){return new Date(t).toISOString().slice(0,10)}
  function nd(f,t){return Math.round((P(t)-P(f))/864e5)+1}
  function fmt(s){var a=s.split('-');return +a[2]+' '+MON[+a[1]-1].slice(0,3)+' '+a[0]}
  function rng(f,t){return f===t?fmt(f):fmt(f)+' to '+fmt(t)}
  function el(tag,cls,txt){var e=LVD.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function brAll(){return S.br.length===4}
  function brOK(b){return b==='X'?brAll():S.br.indexOf(b)>=0}
  function isRes(n,b){var f=rfind(n,b);return !!(f&&f.res)}
  /* departments, from the position (leadership is head office, except Accounts and Admin) */
  var DEPS=[['stylists','Stylists'],['assistants','Assistants'],['frontdesk','Front desk'],['beauticians','Beauticians'],['coordinators','Salon coordinators'],['accounts','Accounts'],['callcentre','Call centre'],['leadership','Leadership']];
  var DEPOF={'Stylist':'stylists','Junior Stylist':'stylists','Senior Stylist':'stylists','Style Director':'stylists','Creative Director':'stylists','Assistant':'assistants','Receptionist':'frontdesk','Beautician':'beauticians','Salon Coordinator':'coordinators','Head Coordinator':'coordinators','Accounts and Admin':'accounts','Office/Admin':'accounts'};
  function deptOf(n,b){var r=rfind(n,b);if(!r)return '';if(r.dp)return r.dp;if(r.ho&&r.p!=='Accounts and Admin')return 'leadership';return DEPOF[r.p]||''}
  function depOK(n,b){return !S.dep.length||S.dep.indexOf(deptOf(n,b))>=0}
  function lvOK(l){return brOK(l.b)&&depOK(l.n,l.b)}
  function depLabel(){return S.dep.length?DEPS.filter(function(d){return S.dep.indexOf(d[0])>=0}).map(function(d){return d[1]}).join(' + '):'All departments'}
  function leaveShown(){return LV.filter(function(l){return S.layers[l.s]&&S.tys[l.c]&&lvOK(l)&&(S.res||!isRes(l.n,l.b))&&(!S.q||l.n.toLowerCase().indexOf(S.q)>-1)})}
  
  function index(){
    var m={};
    function put(d,k,o){(m[d]=m[d]||{hol:[],lv:[]})[k].push(o)}
    if(S.layers.hol)HOL.forEach(function(h){for(var t=P(h.f);t<=P(h.t);t+=864e5)put(iso(t),'hol',h)});
    leaveShown().forEach(function(l){var to=l.open?TODAY:l.t;for(var t=P(l.f);t<=P(to);t+=864e5)put(iso(t),'lv',l)});
    return m;
  }
  
  var VIEWS=[['planner','Planner'],['year','Year'],['month','Month'],['list','List']];
  var BRN=[['SAA','Saadiyat'],['KCA','Khalifa City A'],['MC','Motor City'],['AQ','Al Quoz']];
  function brLabel(){return brAll()?'UAE Branches':BRN.filter(function(b){return S.br.indexOf(b[0])>=0}).map(function(b){return b[1]}).join(' + ')}
  function chipRow(opts){return opts.map(function(o,i){return (i?'<span class="sep">&middot;</span>':'')+'<button type="button" class="gchip" aria-pressed="'+o.on+'" data-v="'+o.v+'">'+o.label+'</button>'}).join('')}
  function buildFilters(){
    var bHtml='<span class="gseg"><button type="button" class="gchip" aria-pressed="'+brAll()+'" data-v="__all">UAE Branches</button></span><span class="sep">&middot;</span>'+
      chipRow(BRN.map(function(b){return {v:b[0],label:b[1],on:!brAll()&&S.br.indexOf(b[0])>=0}}));
    var yHtml=chipRow([2026,2027].map(function(y){return {v:'y'+y,label:String(y),on:S.y===y}}));
    var vHtml='<span class="gseg">'+VIEWS.map(function(v){return '<button type="button" class="gchip" aria-pressed="'+(S.view===v[0])+'" data-v="v:'+v[0]+'">'+v[1]+'</button>'}).join('')+'</span>';
    var html='<div class="f-row"><span class="f-lbl">Branch</span><div class="chipset">'+bHtml+'</div></div>'+
      '<div class="f-row"><span class="f-lbl">Staff</span><div class="chipset">'+chipRow([{v:'r0',label:'Present staff',on:!S.res},{v:'r1',label:'Include resigned staff',on:S.res}])+'</div></div>'+
      '<div class="f-row"><span class="f-lbl">Department</span><div class="chipset">'+'<span class="gseg"><button type="button" class="gchip" aria-pressed="'+(!S.dep.length)+'" data-v="d:all">All departments</button></span><span class="sep">&middot;</span>'+chipRow(DEPS.map(function(d){return {v:'d:'+d[0],label:d[1],on:S.dep.indexOf(d[0])>=0}}))+'</div></div>'+
      '<div class="f-row"><span class="f-lbl">Year</span><div class="chipset">'+yHtml+'</div></div>'+
      '<div class="f-row"><span class="f-lbl">View</span><div class="chipset">'+vHtml+'</div></div>';
    LVD.getElementById('filters').innerHTML=html;
    LVD.getElementById('fSheetBody').innerHTML='<div class="filters">'+html+'</div>';
    LVD.getElementById('mastBranch').innerHTML='<b>'+brLabel()+'</b>';
    LVD.getElementById('mastRange').textContent=S.y+', '+(S.dep.length?depLabel()+', ':'')+(S.res?'including resigned staff':'present staff')+', data up to '+fmt(RANGE_TO);
    var vl=VIEWS.filter(function(v){return v[0]===S.view})[0][1];
    LVD.getElementById('fSheetSum').textContent=(brAll()?'All':S.br.length>1?S.br.length+' branches':BRN.filter(function(b){return b[0]===S.br[0]})[0][1])+' \u00b7 '+(S.dep.length?(S.dep.length>1?S.dep.length+' departments':depLabel())+' \u00b7 ':'')+(S.res?'incl. resigned':'present')+' \u00b7 '+vl;
  }
  function onGlobalChip(e){
    var b=e.target.closest('.gchip');if(!b)return;var v=b.getAttribute('data-v');if(!v)return;
    if(v==='__all')S.br=['SAA','KCA','MC','AQ'];
    else if(v.charAt(0)==='y'){S.y=+v.slice(1);if(S.sel.slice(0,4)!==String(S.y))S.sel=S.y+'-01-01'}
    else if(v.slice(0,2)==='v:')S.view=v.slice(2);
    else if(v.slice(0,2)==='d:'){var dv=v.slice(2);if(dv==='all')S.dep=[];else if(S.dep.indexOf(dv)>=0)S.dep=S.dep.filter(function(x){return x!==dv});else S.dep=S.dep.concat(dv)}
    else if(v==='r0'||v==='r1')S.res=(v==='r1');
    else{
      if(brAll())S.br=[v];
      else if(S.br.indexOf(v)>=0)S.br=S.br.filter(function(x){return x!==v});
      else S.br=S.br.concat(v);
      if(!S.br.length)S.br=['SAA','KCA','MC','AQ'];
    }
    draw();
  }
  
  function buildLayers(){
    var L=LVD.getElementById('layers');L.innerHTML='';
    var cnt={blk:BLK.length,app:LV.filter(function(l){return l.s==='app'&&lvOK(l)}).length,plan:LV.filter(function(l){return l.s==='plan'&&lvOK(l)}).length,req:LV.filter(function(l){return l.s==='req'&&lvOK(l)}).length,inf:LV.filter(function(l){return l.s==='inf'&&lvOK(l)}).length,hol:HOL.length};
    [['hol','Public holidays','hol',cnt.hol],['app','Approved leave','app',cnt.app],['plan','Planned','plan',cnt.plan],['blk','Blocked days (no leave)','blk',cnt.blk],['req','Waiting for approval','req',cnt.req],['inf','Inferred from Phorest','inf',cnt.inf]].forEach(function(x){
      var b=el('button','lay');b.setAttribute('aria-pressed',S.layers[x[0]]);
      b.appendChild(el('span','sw '+x[2]));b.appendChild(LVD.createTextNode(x[1]+' '));b.appendChild(el('small','',x[3]));
      b.onclick=function(){S.layers[x[0]]=!S.layers[x[0]];draw()};L.appendChild(b)});
    L.appendChild(el('span','lay-sep'));
    TYPES.forEach(function(x){
      var n=LV.filter(function(l){return l.c===x[0]&&lvOK(l)&&!((x[0]==='SL'||x[0]==='ABS')&&l.s==='inf')}).length;
      if(x[0]==='SL'||x[0]==='ABS'){SICK.forEach(function(r){if(!sickOK(r))return;var o=x[0]==='SL'?r.sl:r.ab;for(var k in (o||{}))n+=o[k]})}
      var b=el('button','lay');b.setAttribute('aria-pressed',S.tys[x[0]]);
      var w=el('span','sw ty');w.style.background='var(--t-'+x[0]+')';b.appendChild(w);b.appendChild(LVD.createTextNode(x[1]+' '));b.appendChild(el('small','',n));
      b.onclick=function(){S.tys[x[0]]=!S.tys[x[0]];draw()};L.appendChild(b)});
  }
  
  function buildTiles(){
    var T=LVD.getElementById('tiles');T.innerHTML='';
    var idx=index(),td=idx[TODAY]||{hol:[],lv:[]};
    var next=HOL.filter(function(h){return h.f>TODAY})[0];
    var wait=LV.filter(function(l){return l.s==='req'&&lvOK(l)});
    var apr=LV.filter(function(l){return l.s==='app'&&lvOK(l)}).reduce(function(a,l){return a+nd(l.f,l.t)},0);
    function tile(k,v,s,full){var t=el('div','tile');t.appendChild(el('div','k',k));t.appendChild(el('div','v',v));t.appendChild(el('div','s',s));if(full)t.title=full;T.appendChild(t)}
    /* on leave today = leave on the layers shown; off today = their usual day off from the Phorest rosters, and not on leave today */
    var onL={},lvNames=[];td.lv.forEach(function(l){var f=(rfind(l.n,l.b)||{}).n||l.n;if(!onL[f]){onL[f]=1;lvNames.push(f.split(' ')[0])}});
    var dw=(new Date(P(TODAY)).getUTCDay()+6)%7,offNames=[];
    DAYOFF.forEach(function(x){
      if(!brOK(x.b)||!depOK(x.n,x.b))return;
      var f=rfind(x.n,x.b)||{},full=f.n||x.n;
      if(!S.res&&f.res)return;
      var o=offList(x);if(!o.length||o.length>=4||x.s[dw]>25)return;
      if(onL[full])return;
      offNames.push(full.split(' ')[0])});
    offNames.sort();
    var offShow=offNames.length>8?offNames.slice(0,8).join(', ')+' and '+(offNames.length-8)+' more':offNames.join(', ');
    tile('Off today ('+fmt(TODAY).replace(/ \d{4}$/,'')+')',offNames.length,offNames.length?offShow+'. Usual day off, from the Phorest rosters':'Nobody has their usual day off',offNames.join(', '));
    tile('Next public holiday',next?(nd(TODAY,next.f)-1)+' days':'none',next?next.n+', '+rng(next.f,next.t)+' (expected)':'');
    var ob=wait.filter(overlapBlk);tile('Waiting for approval',wait.length,wait.length?('Needs an answer in Bayzat'+(ob.length?'. '+ob.map(function(l){return l.n.split(' ')[0]}).join(', ')+' overlaps blocked days':'')):'Nothing waiting');
    tile('On leave today ('+fmt(TODAY).replace(/ \d{4}$/,'')+')',lvNames.length,lvNames.length?lvNames.join(', '):'Nobody on the layers shown');
    tile('Approved leave days',apr,apr?'From the approved list':'None approved yet');
  }
  
  function dotsFor(d){
    var w=el('div','dots');if(!d)return w;
    var seen={},k=0;
    d.lv.forEach(function(l){if(k>=4)return;var key=l.n;if(seen[key])return;seen[key]=1;k++;
      var i=el('i',l.s);i.style.background='var(--t-'+l.c+')';i.style.color='var(--t-'+l.c+')';w.appendChild(i)});
    if(d.lv.length>4)w.appendChild(el('em','','+'+(d.lv.length-4)));
    return w;
  }
  
  function monthCells(y,m){
    var first=new Date(Date.UTC(y,m,1)),lead=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(y,m+1,0)).getUTCDate(),out=[];
    for(var i=0;i<lead;i++)out.push(null);
    for(var d=1;d<=days;d++)out.push(iso(Date.UTC(y,m,d)));
    while(out.length%7)out.push(null);
    return out;
  }
  function isWk(s){var g=new Date(P(s)).getUTCDay();return g===0||g===6}
  
  function drawYear(c,idx){
    var yr=el('div','year');
    for(var m=0;m<12;m++){(function(m){
      var mo=el('div','mo');var h=el('h4','',MON[m]);h.onclick=function(){S.m=m;S.view='month';draw()};mo.appendChild(h);
      var g=el('div','g7');WD.forEach(function(w){g.appendChild(el('div','wd',w))});
      monthCells(S.y,m).forEach(function(s){
        if(!s){g.appendChild(el('div','dc out'));return}
        var d=idx[s],cls='dc'+(isWk(s)?' wk':'')+(s===TODAY?' today':'')+(s===S.sel?' sel':'')+(d&&d.hol.length?' hol':'');
        var cell=el('div',cls);cell.appendChild(LVD.createTextNode(+s.slice(8)));
        if(d&&d.lv.length&&!d.hol.length)cell.appendChild(dotsFor(d));
        cell.onclick=function(){S.sel=s;draw()};g.appendChild(cell)});
      mo.appendChild(g);yr.appendChild(mo)})(m)}
    c.appendChild(yr);
  }
  
  function isBlk(s){return BLK.some(function(b){return s>=b.f&&s<=b.t})}
  function overlapBlk(l){return BLK.some(function(b){return l.f<=b.t&&l.t>=b.f})}
  
  function rfind(name,b){
    var nm=ALIAS[name]||name;
    if(RBY[nm])return RBY[nm];
    var first=nm.split(' ')[0];
    var c=ROSTER.filter(function(r){return r.n.split(' ')[0]===first});
    if(c.length===1)return c[0];
    if(c.length>1){var m=c.filter(function(r){return r.b===b});if(m.length===1)return m[0]}
    return null;
  }
  function photoUrl(r){return r&&r.ph?ASSETS+encodeURI(r.ph):''}
  function srcLine(l){return (l.s==='plan'||l.s==='app')?l.src+' · from Jumera\'s notes':l.src}
  function who(it){var r=rfind(it.label,it.b);return {full:r?r.n:it.label,img:photoUrl(r),role:r?r.p:''}}
  var tipEl=null;
  function hideTip(){if(tipEl){tipEl.remove();tipEl=null}}
  function showTip(ev,it){
    hideTip();
    var t=el('div','tip'),w=who(it),L=it.l||null,H=it.r&&it.k==='hol'?it.r:null;
    var ph=el('div','tip-ph');
    if(it.k==='hol'||it.k==='blk'){ph.appendChild(el('div','tip-ini',it.k==='hol'?'H':'B'))}
    else if(w.img){var im=el('img');im.src=w.img;im.alt='';im.onerror=function(){im.replaceWith(el('div','tip-ini',w.full.charAt(0)))};ph.appendChild(im)}
    else ph.appendChild(el('div','tip-ini',w.full.charAt(0)));
    t.appendChild(ph);
    var tx=el('div','tip-tx');
    if(it.k==='hol'){
      tx.appendChild(el('b','',H.n));tx.appendChild(el('div','m','Public holiday (expected)'));
      tx.appendChild(el('div','',rng(H.f,H.t)));tx.appendChild(el('div','dur',nd(H.f,H.t)+(nd(H.f,H.t)===1?' day':' days')));
    }else if(it.k==='blk'){
      tx.appendChild(el('b','','Blocked days, no leave'));tx.appendChild(el('div','m','From Jumera\'s notes'));
      tx.appendChild(el('div','',rng(it.f,it.t)));tx.appendChild(el('div','dur',nd(it.f,it.t)+' days'));
    }else{
      tx.appendChild(el('b','',w.full));
      tx.appendChild(el('div','m',(w.role?w.role+' \u00b7 ':'')+BR[it.b]));
      var st={req:'Waiting for approval',app:'Approved',plan:'Planned',inf:'Inferred from Phorest'}[it.k];
      var d=el('div','');d.appendChild(el('span','badge '+it.k,st));tx.appendChild(d);
      tx.appendChild(el('div','',L.ty+': '+rng(L.f,L.t)+(L.open?' (still going at last data)':'')));
      var n=nd(L.f,L.t);tx.appendChild(el('div','dur',n+(n===1?' day':' days')+(L.open?' so far':'')));
      if(L.s!=='inf'&&overlapBlk(L)){var wv=el('div','m','Overlaps blocked days (no leave allowed)');wv.style.color='var(--red)';tx.appendChild(wv)}
      tx.appendChild(el('div','m',srcLine(L)));
    }
    t.appendChild(tx);LVD.body.appendChild(t);tipEl=t;moveTip(ev);
  }
  function moveTip(ev){
    if(!tipEl)return;
    var x=ev.clientX+16,y=ev.clientY+16,r=tipEl.getBoundingClientRect();
    if(x+r.width>window.innerWidth-8)x=Math.max(8,ev.clientX-r.width-16);
    if(y+r.height>window.innerHeight-8)y=Math.max(8,ev.clientY-r.height-16);
    tipEl.style.left=x+'px';tipEl.style.top=y+'px';
  }
  LVD.addEventListener('click',function(e){if(!(e.target.closest&&e.target.closest('.bar')))hideTip()});
  
  function items(){
    var out=[];
    if(S.layers.blk)BLK.forEach(function(b){out.push({k:'blk',label:'Blocked days, no leave',b:'X',f:b.f,t:b.t,r:b,title:'Blocked days, no leave allowed ('+rng(b.f,b.t)+')'})});
    if(S.layers.hol)HOL.forEach(function(h){out.push({k:'hol',label:h.n,b:'X',f:h.f,t:h.t,r:h,title:h.n+' (public holiday, expected)'})});
    leaveShown().forEach(function(l){out.push({k:l.s,label:l.n,b:l.b,f:l.f,t:l.open?TODAY:l.t,l:l,title:l.n+' · '+BR[l.b]+' · '+rng(l.f,l.t)})});
    return out;
  }
  /* segments of the items that fall inside the row [a,b], packed into lanes so bars never overlap */
  function lanesFor(its,a,b){
    var A=P(a),B=P(b),segs=[];
    its.forEach(function(it){
      var f=Math.max(P(it.f),A),t=Math.min(P(it.t),B);if(f>t)return;
      segs.push({it:it,s:Math.round((f-A)/864e5),e:Math.round((t-A)/864e5),cl:P(it.f)<A,cr:P(it.t)>B})});
    segs.sort(function(x,y){return x.s-y.s||(y.e-y.s)-(x.e-x.s)});
    var ends=[];
    segs.forEach(function(g){var i=0;while(ends[i]!==undefined&&ends[i]>=g.s)i++;g.lane=i;ends[i]=g.e});
    return {segs:segs,n:ends.length};
  }
  /* sick leave and absences are only held as counts per person per month (Jumera's sheets), so they sit under the month as one chip per person, not on a day */
  function sickOK(r){
    var f=rfind(r.n,r.b);
    if(!S.res&&(f&&f.res))return false;
    if(!depOK(r.n,r.b))return false;
    if((r.b==='X'||!r.b)&&f&&f.a&&f.a.length)return f.a.some(function(x){return S.br.indexOf(x)>=0});
    return brOK(r.b||'X');
  }
  function inferredIn(r,mon,ty){
    var me=(rfind(r.n,r.b)||{}).n||r.n;
    return LV.some(function(l){return l.s==='inf'&&l.c===ty&&+l.f.slice(5,7)===mon&&((rfind(l.n,l.b)||{}).n||l.n)===me})
  }
  function monthChips(mon){
    if(S.y!==+TODAY.slice(0,4)||!S.layers.sick)return [];
    var out=[];
    SICK.forEach(function(r){
      if(!sickOK(r))return;
      [['SL',r.sl],['ABS',r.ab]].forEach(function(t){
        var d=t[1]&&t[1][mon];
        /* a month whose days are inferred from Phorest and drawn as bars does not repeat as a chip */
        if(d&&S.layers.inf&&inferredIn(r,mon,t[0]))return;
        if(d&&S.tys[t[0]])out.push({n:r.n,r:r,t:t[0],d:d})})});
    out.sort(function(a,b){return (a.t<b.t?-1:a.t>b.t?1:0)||a.n.localeCompare(b.n)});
    return out;
  }
  function chipEl(x,mon){
    var pp=personByName(x.n,x.r.b),full=pp.n||x.n,fw=full.split(' '),first=(/^ma\.?$/i.test(fw[0])&&fw[1])?fw[1]:fw[0];
    var e=el('span','pl-chip '+x.t,first+' · '+x.d+(x.t==='SL'?' SL':' absent'));
    e.style.setProperty('--bc','var(--t-'+x.t+')');
    e.addEventListener('mouseenter',function(ev){chipTip(ev,x,mon,pp)});
    e.addEventListener('mousemove',moveTip);
    e.addEventListener('mouseleave',hideTip);
    e.addEventListener('click',function(ev){ev.stopPropagation();if(tipEl)hideTip();else chipTip(ev,x,mon,pp)});
    return e;
  }
  /* the same card the bars use, for a sick leave or absence count */
  function chipTip(ev,x,mon,pp){
    hideTip();
    var t=el('div','tip'),full=pp.n||x.n,ph=el('div','tip-ph');
    if(pp.p){var im=el('img');im.src=pp.p;im.alt='';im.onerror=function(){im.replaceWith(el('div','tip-ini',full.charAt(0)))};ph.appendChild(im)}
    else ph.appendChild(el('div','tip-ini',full.charAt(0)));
    t.appendChild(ph);
    var tx=el('div','tip-tx');
    tx.appendChild(el('b','',full));
    tx.appendChild(el('div','m',(pp.r?pp.r+' · ':'')+(BR[x.r.b]||BR.X)));
    var d=el('div','');d.appendChild(el('span','badge '+(x.t==='SL'?'app':'off'),x.t==='SL'?'Sick leave (SL)':'Absent'));tx.appendChild(d);
    tx.appendChild(el('div','',MON[mon-1]+' '+S.y+(x.t==='SL'?': sick with a medical certificate':': sick without a medical certificate')));
    tx.appendChild(el('div','dur',x.d+(x.d===1?' day':' days')));
    tx.appendChild(el('div','m',"Counted per month, no dates. From Jumera's sheets."));
    t.appendChild(tx);LVD.body.appendChild(t);tipEl=t;moveTip(ev);
  }
  /* the bars layer lets the mouse through to the day cells (today's line, day click); the bars themselves still take it */
  function barEl(g){
    var it=g.it,e=el('div','bar '+it.k+(g.cl?' cl':'')+(g.cr?' cr':''),it.label);
    e.style.pointerEvents='auto';e.style.gridColumn=(g.s+1)+' / span '+(g.e-g.s+1);e.style.gridRow=String(g.lane+1);
    e.style.setProperty('--bc',it.l?'var(--t-'+it.l.c+')':'var(--c-'+it.b+')');
    e.addEventListener('mouseenter',function(ev){showTip(ev,it)});
    e.addEventListener('mousemove',moveTip);
    e.addEventListener('mouseleave',hideTip);
    e.addEventListener('click',function(ev){ev.stopPropagation();if(tipEl)hideTip();else showTip(ev,it)});
    return e;
  }
  
  function drawPlanner(c){
    var its=items(),idx=index(),wrap=el('div','tw fix planw'),pl=el('div','plangrid');
    var head=el('div','pl-row pl-head');head.appendChild(el('div','pl-lab',String(S.y)));
    var cols=el('div','pl-cols');for(var d=1;d<=31;d++)cols.appendChild(el('div','',d));head.appendChild(cols);pl.appendChild(head);
    for(var m=0;m<12;m++){(function(m){
      var dim=new Date(Date.UTC(S.y,m+1,0)).getUTCDate(),mm=('0'+(m+1)).slice(-2);
      var L=lanesFor(its,S.y+'-'+mm+'-01',S.y+'-'+mm+'-'+dim);
      var row=el('div','pl-row'),lab=el('div','pl-lab',MON[m].slice(0,3));lab.onclick=function(){S.m=m;S.view='month';draw()};row.appendChild(lab);
      var body=el('div','pl-body'),laneH=Math.max(L.n,1)*20+8;body.style.minHeight=laneH+'px';
      var bg=el('div','pl-bg');
      for(var d=1;d<=31;d++){(function(d){
        var s=S.y+'-'+mm+'-'+('0'+d).slice(-2),x=d>dim,dd=idx[s];
        var cell=el('div','pl-c'+(x?' x':'')+(!x&&dd&&dd.hol.length?' h':'')+(!x&&S.layers.blk&&isBlk(s)?' b':'')+(s===TODAY?' today':'')+(s===S.sel?' sel':''));
        if(!x){cell.onclick=function(){S.sel=s;draw()};dayTip(cell,s,dd)}bg.appendChild(cell)})(d)}
      var bars=el('div','pl-bars');L.segs.forEach(function(g){bars.appendChild(barEl(g))});
      body.appendChild(bg);body.appendChild(bars);
      var ch=monthChips(m+1);
      if(ch.length){var cw=el('div','pl-chips');cw.style.marginTop=laneH+'px';ch.forEach(function(x){cw.appendChild(chipEl(x,m+1))});body.appendChild(cw)}
      row.appendChild(body);pl.appendChild(row)})(m)}
    wrap.appendChild(pl);c.appendChild(wrap);
  }
  
  function drawMonth(c,idx){
    var hd=el('div','mhead');
    var pv=el('button','nav','Previous'),nx=el('button','nav','Next'),tb=el('button','nav','Today');
    pv.onclick=function(){S.m=(S.m+11)%12;draw()};nx.onclick=function(){S.m=(S.m+1)%12;draw()};tb.onclick=function(){S.y=2026;S.m=10;S.sel=TODAY;draw()};
    hd.appendChild(el('h3','',MON[S.m]+' '+S.y));hd.appendChild(pv);hd.appendChild(tb);hd.appendChild(nx);c.appendChild(hd);
    var g=el('div','mgrid');['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function(w){g.appendChild(el('div','wd',w))});c.appendChild(g);
    var its=items(),first=new Date(Date.UTC(S.y,S.m,1)),lead=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(S.y,S.m+1,0)).getUTCDate();
    var start=Date.UTC(S.y,S.m,1)-lead*864e5,weeks=Math.ceil((lead+days)/7),pre=S.y+'-'+('0'+(S.m+1)).slice(-2);
    for(var w=0;w<weeks;w++){
      var a=iso(start+w*7*864e5),b=iso(start+(w*7+6)*864e5),L=lanesFor(its,a,b);
      var row=el('div','wkrow');row.style.minHeight=(30+Math.max(L.n,1)*20+6)+'px';
      var bg=el('div','wkbg');
      for(var d=0;d<7;d++){(function(s){
        var cell=el('div','mc'+(s.slice(0,7)!==pre?' out':'')+(S.layers.blk&&isBlk(s)?' b':'')+(s===TODAY?' today':'')+(s===S.sel?' sel':''));
        cell.appendChild(el('div','n',+s.slice(8)));cell.onclick=function(){S.sel=s;draw()};bg.appendChild(cell)})(iso(start+(w*7+d)*864e5))}
      var bars=el('div','wkbars');L.segs.forEach(function(sg){bars.appendChild(barEl(sg))});
      row.appendChild(bg);row.appendChild(bars);c.appendChild(row)}
  }
  
  function drawList(c){
    var q=el('input','search');q.placeholder='Search a name';q.value=S.q;
    q.oninput=function(){S.q=q.value.trim().toLowerCase();var pos=q.selectionStart;draw();var n=LVD.querySelector('.search');n.focus();n.setSelectionRange(pos,pos)};
    c.appendChild(q);
    var w=el('div','tw'),t=el('table','lt'),hr=el('tr');
    ['Staff','Branch','Type','From','To','Days','Status','Source'].forEach(function(h){hr.appendChild(el('th','',h))});
    var th=el('thead');th.appendChild(hr);t.appendChild(th);
    var tb=el('tbody'),rows=leaveShown().slice().sort(function(a,b){return a.f<b.f?-1:a.f>b.f?1:0});
    rows.forEach(function(l){
      var r=el('tr');
      r.appendChild(staffTd(l.n,l.b));
      r.appendChild(el('td','',BR[l.b]));r.appendChild(el('td','',l.ty));r.appendChild(el('td','',fmt(l.f)));r.appendChild(el('td','',fmt(l.t)+(l.open?' (open)':'')));
      r.appendChild(el('td','',nd(l.f,l.t)));
      var st=el('td');st.appendChild(el('span','badge '+l.s,{req:'Waiting',app:'Approved',plan:'Planned',inf:'Inferred'}[l.s]));r.appendChild(st);
      r.appendChild(el('td','',l.src));tb.appendChild(r)});
    if(!rows.length){var r=el('tr'),td=el('td','empty','Nothing on the layers and branch shown.');td.colSpan=8;r.appendChild(td);tb.appendChild(r)}
    t.appendChild(tb);w.appendChild(t);c.appendChild(w);
  }
  
  function drawSide(idx){
    var s=LVD.getElementById('side');s.innerHTML='';
    s.appendChild(el('h3','',S.view==='list'?'How to read this':fmt(S.sel)));
    if(S.view==='list'){
      s.appendChild(el('div','d','One row per leave. Waiting rows are requests from Bayzat. Approved comes from the approved list.'));
      return;
    }
    var d=idx[S.sel]||{hol:[],lv:[]};
    if(S.layers.blk&&isBlk(S.sel)){var bi=el('div','item');bi.appendChild(el('b','','Blocked day'));bi.appendChild(el('div','m','No leave allowed on these days · from Jumera\'s notes'));s.appendChild(bi)}
    var dd=new Date(P(S.sel)).getUTCDay();
    s.appendChild(el('div','d',['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dd]+(S.sel===TODAY?' (today)':'')+(isWk(S.sel)?'. Weekend.':'')));
    d.hol.forEach(function(h){var i=el('div','item');var b=el('b','',h.n);i.appendChild(b);i.appendChild(el('span','badge hol','Public holiday'));i.appendChild(workBadge(h));i.appendChild(el('div','m',h.note));s.appendChild(i)});
    d.lv.forEach(function(l){
      var i=el('div','item'),dt=el('span','dot');dt.style.background='var(--t-'+l.c+')';i.appendChild(dt);i.appendChild(el('b','',personByName(l.n,l.b).n||l.n));
      i.appendChild(el('span','badge '+l.s,{req:'Waiting',app:'Approved',plan:'Planned',inf:'Inferred'}[l.s]));
      i.appendChild(el('div','m',BR[l.b]+' · '+l.ty+' · '+rng(l.f,l.t)+' ('+nd(l.f,l.t)+' days)'));
      i.appendChild(el('div','m',srcLine(l)));if(l.s!=='inf'&&overlapBlk(l)){var w=el('div','m','Overlaps blocked days (no leave allowed)');w.style.color='var(--red)';i.appendChild(w)}s.appendChild(i)});
    if(!d.hol.length&&!d.lv.length)s.appendChild(el('div','empty','Nobody off and no holiday on the layers shown.'));
  }
  
  function fitSticky(){LVD.querySelectorAll('.card.sickw').forEach(function(w){w.classList.remove('pg');if(w.scrollWidth<=w.clientWidth+1)w.classList.add('pg')})}
  var fitT=0;window.addEventListener('resize',function(){clearTimeout(fitT);fitT=setTimeout(fitSticky,120)});
  function draw(){
    hideTip();buildFilters();buildLayers();
    var idx=index();buildTiles();
    var c=LVD.getElementById('cal');c.innerHTML='';
    if(S.view==='planner')drawPlanner(c);else if(S.view==='year')drawYear(c,idx);else if(S.view==='month')drawMonth(c,idx);else drawList(c);
    LVD.querySelector('.main').classList.toggle('stack',S.view==='planner');
    drawSide(idx);drawSick();drawOff();drawCov();drawHolT();
    fitSticky();
  }
  
  /* on = every branch shown traded every day, off = none did, part = some did, tbc = no data yet */
  function holWork(h){
    var brs=S.br.slice(),tot=0,open=0;
    for(var t=P(h.f);t<=P(h.t);t+=864e5){var d=PH[iso(t)];if(!d)continue;brs.forEach(function(b){tot++;if(d[b]>0)open++})}
    return !tot?'tbc':open===tot?'on':open===0?'off':'part';
  }
  function holVisits(h){
    var out=[];
    for(var t=P(h.f);t<=P(h.t);t+=864e5){var d=PH[iso(t)];if(d)out.push(fmt(iso(t))+': SAA '+d.SAA+', KCA '+d.KCA+', MC '+d.MC+', AQ '+d.AQ)}
    return out.length?'Phorest visits. '+out.join('. '):'No Phorest data yet for this date.';
  }
  function workBadge(h){
    var k=holWork(h);
    return el('span','badge '+k,{off:'Salons closed',on:'Salons open',part:'Part open',tbc:'To confirm'}[k]);
  }
  function personByName(n,b){var r=rfind(n,b);return {p:photoUrl(r),r:r?r.p:'',n:r?r.n:n,s:r&&r.res?(r.rd?'Resigned, Phorest archived '+fmt(r.rd):'Resigned'):(r&&r.s?r.s:'')}}
  function staffTd(n,b){
    var pp=personByName(n,b),td=el('td','stfc'),box=el('div','stf'),nm=pp.n||n;
    var dt=el('span','dot');dt.style.background='var(--c-'+(b||'X')+')';box.appendChild(dt);
    if(pp.p){var im=el('img','stf-ph');im.src=pp.p;im.alt='';im.loading='lazy';im.onerror=function(){im.replaceWith(el('span','stf-ini',nm.charAt(0)))};box.appendChild(im)}
    else box.appendChild(el('span','stf-ini',nm.charAt(0)));
    box.appendChild(el('span','',nm));td.appendChild(box);return td;
  }
  /* ---------- the roster table: header menus, Google Sheets style (sort, filter by condition, filter by values) ---------- */
  var FUNNEL='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>';
  var OPS_S=[['','None'],['empty','Is empty'],['notempty','Is not empty'],['contains','Text contains'],['notcontains','Text does not contain'],['starts','Text starts with'],['ends','Text ends with'],['eq','Text is exactly']];
  var OPS_N=[['','None'],['empty','Is empty'],['notempty','Is not empty'],['eq','Is equal to'],['ne','Is not equal to'],['gt','Greater than'],['ge','Greater than or equal to'],['lt','Less than'],['le','Less than or equal to'],['between','Is between']];
  var COLS=[{k:'name',l:'Staff',t:'s'},{k:'pos',l:'Position',t:'s'},{k:'works',l:'Works',t:'s'}];
  (function(){var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];M.forEach(function(x,i){COLS.push({k:'m'+(i+1),l:x,t:'n',m:i+1})});COLS.push({k:'sick',l:'Sick',t:'n'},{k:'abs',l:'Absent',t:'n'})})();
  var OFFCOLS=[{k:'name',l:'Staff',t:'s'},{k:'pos',l:'Position',t:'s'},{k:'branch',l:'Branch',t:'s'}];
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(function(d,i){OFFCOLS.push({k:d.toLowerCase(),l:d,t:'n',m:i+1})});
  OFFCOLS.push({k:'off',l:'Usual days off',t:'s'},{k:'weeks',l:'Weeks',t:'n'});
  var TB={sick:{cols:COLS,F:'F',sort:'sort',dk:'__sickData'},off:{cols:OFFCOLS,F:'F2',sort:'sort2',dk:'__offData'}};
  var curT='sick';function FK(){return TB[curT].F}function SK(){return TB[curT].sort}
  function colOf(k){var C=TB[curT].cols;for(var i=0;i<C.length;i++)if(C[i].k===k)return C[i];return C[0]}
  function sumObj(o){var s=0;for(var k in o)s+=o[k];return s}
  /* one table row: the values every header menu reads */
  function rowData(r){
    var pp=personByName(r.n,r.b),v={name:pp.n||r.n,pos:pp.r||'',works:pp.s||''};
    for(var m=1;m<=12;m++){var t=((r.sl&&r.sl[m])||0)+((r.ab&&r.ab[m])||0);v['m'+m]=t?t:null}
    var a=sumObj(r.sl||{}),b=sumObj(r.ab||{});v.sick=a?a:null;v.abs=b?b:null;
    return {r:r,pp:pp,v:v};
  }
  function vkey(d,k){var x=d.v[k];return x==null||x===''?'(Blanks)':String(x)}
  function condPass(d,k,c){
    if(!c||!c.op)return true;
    var raw=d.v[k],isN=colOf(k).t==='n',txt=String(raw==null?'':raw).toLowerCase(),a=String(c.v1||'').toLowerCase();
    if(c.op==='empty')return raw==null||raw==='';
    if(c.op==='notempty')return !(raw==null||raw==='');
    if(isN){
      if(raw==null)return false;
      var x=parseFloat(c.v1),y=parseFloat(c.v2);if(isNaN(x))return true;
      if(c.op==='eq')return raw===x;if(c.op==='ne')return raw!==x;if(c.op==='gt')return raw>x;if(c.op==='ge')return raw>=x;
      if(c.op==='lt')return raw<x;if(c.op==='le')return raw<=x;
      if(c.op==='between')return isNaN(y)?true:(raw>=Math.min(x,y)&&raw<=Math.max(x,y));
      return true;
    }
    if(c.op==='contains')return txt.indexOf(a)>=0;if(c.op==='notcontains')return txt.indexOf(a)<0;
    if(c.op==='starts')return txt.indexOf(a)===0;if(c.op==='ends')return a===''||txt.slice(-a.length)===a;if(c.op==='eq')return txt===a;
    return true;
  }
  function dpass(d,skip){
    for(var k in S[FK()]){
      if(k===skip)continue;var F=S[FK()][k];
      if(F.ex&&F.ex.length&&F.ex.indexOf(vkey(d,k))>=0)return false;
      if(F.cond&&!condPass(d,k,F.cond))return false;
    }
    return true;
  }
  var fm=null,fmenu=null;
  function fmEl(){if(!fm){fm=LVD.createElement('div');fm.className='fm';fm.id='fmenu';LVD.body.appendChild(fm);fmWire()}return fm}
  function fmClose(){fmenu=null;if(fm)fm.style.display='none'}
  function fmValues(k){
    var m={},isN=colOf(k).t==='n';
    (window[TB[curT].dk]||[]).forEach(function(d){if(dpass(d,k)){var key=vkey(d,k);if(!m[key])m[key]={key:key,raw:d.v[k],n:0};m[key].n++}});
    var L=Object.keys(m).map(function(x){return m[x]});
    L.sort(function(a,b){if(a.key==='(Blanks)')return 1;if(b.key==='(Blanks)')return -1;return isN?(a.raw-b.raw):a.key.localeCompare(b.key)});
    return L;
  }
  function fmOpen(k,btn){
    curT=(btn.closest('table')&&btn.closest('table').id==='offT')?'off':'sick';
    var F=S[FK()][k]||{},L=fmValues(k),ex=F.ex||[];
    fmenu={c:k,t:curT,list:L,checked:{},search:'',op:(F.cond&&F.cond.op)||'',v1:(F.cond&&F.cond.v1)||'',v2:(F.cond&&F.cond.v2)||'',condOpen:!!F.cond,valOpen:true,btn:btn};
    L.forEach(function(x){fmenu.checked[x.key]=ex.indexOf(x.key)<0});
    fmDraw(true);
  }
  function escH(x){return String(x).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function fmDraw(place){
    curT=fmenu.t;
    var k=fmenu.c,isN=colOf(k).t==='n',OPS=isN?OPS_N:OPS_S,sd=S[SK()]&&S[SK()].k===k?S[SK()].d:0,box=fmEl();
    var vis=fmenu.list.filter(function(x){return x.key.toLowerCase().indexOf(fmenu.search.toLowerCase())>=0});
    var nC=fmenu.list.filter(function(x){return fmenu.checked[x.key]}).length;
    var h='<button type="button" class="it'+(sd===1?' on':'')+'" data-m="sort" data-d="1">'+(isN?'Sort smallest to largest':'Sort A to Z')+'</button>'+
      '<button type="button" class="it'+(sd===-1?' on':'')+'" data-m="sort" data-d="-1">'+(isN?'Sort largest to smallest':'Sort Z to A')+'</button><hr>'+
      '<div class="sec"><button type="button" class="sh" data-m="tcond" aria-expanded="'+fmenu.condOpen+'"><span>Filter by condition</span><span>'+(fmenu.condOpen?'&#9662;':'&#9656;')+'</span></button>';
    if(fmenu.condOpen){
      h+='<select id="fop" aria-label="Condition">'+OPS.map(function(o){return '<option value="'+o[0]+'"'+(fmenu.op===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select>';
      if(fmenu.op&&fmenu.op!=='empty'&&fmenu.op!=='notempty')h+='<div class="row2"><input class="fin" id="fv1" type="'+(isN?'number':'text')+'" placeholder="Value" value="'+escH(fmenu.v1)+'">'+(fmenu.op==='between'?'<input class="fin" id="fv2" type="number" placeholder="and" value="'+escH(fmenu.v2)+'">':'')+'</div>';
    }
    h+='</div><hr><div class="sec"><button type="button" class="sh" data-m="tval" aria-expanded="'+fmenu.valOpen+'"><span>Filter by values</span><span>'+(fmenu.valOpen?'&#9662;':'&#9656;')+'</span></button>';
    if(fmenu.valOpen){
      h+='<div class="vact"><button type="button" data-m="all">Select all</button><button type="button" data-m="none">Clear</button><span>'+nC+' of '+fmenu.list.length+' selected</span></div>'+
        '<input class="fin" id="fsr" type="search" placeholder="Search values" value="'+escH(fmenu.search)+'" style="margin-top:0"><div class="vl">'+
        (vis.length?vis.map(function(x){return '<label><input type="checkbox" data-v="'+escH(x.key)+'"'+(fmenu.checked[x.key]?' checked':'')+'><span title="'+escH(x.key)+'">'+escH(x.key)+'</span><em>'+x.n+'</em></label>'}).join(''):'<div style="padding:6px;color:var(--muted)">No values match.</div>')+'</div>';
    }
    h+='</div><div class="btns"><button type="button" class="go ghost" data-m="cancel">Cancel</button><button type="button" class="go" data-m="ok">OK</button></div>';
    box.innerHTML=h;box.style.display='block';
    if(place){
      var r=fmenu.btn.getBoundingClientRect(),w=288,left=Math.max(8,Math.min(r.left-8,window.innerWidth-w-8));
      box.style.left=left+'px';box.style.top=Math.min(r.bottom+4,Math.max(8,window.innerHeight-120))+'px';
    }
  }
  function fmApply(){
    curT=fmenu.t;
    var k=fmenu.c,ex=[],F={},prev=(S[FK()][k]&&S[FK()][k].ex)||[],keys=fmenu.list.map(function(x){return x.key});
    prev.forEach(function(x){if(keys.indexOf(x)<0)ex.push(x)});
    fmenu.list.forEach(function(x){if(!fmenu.checked[x.key])ex.push(x.key)});
    if(ex.length)F.ex=ex;
    if(fmenu.op){var need=fmenu.op!=='empty'&&fmenu.op!=='notempty';if(!need||fmenu.v1!=='')F.cond={op:fmenu.op,v1:fmenu.v1,v2:fmenu.v2}}
    if(F.ex||F.cond)S[FK()][k]=F;else delete S[FK()][k];
    fmClose();draw();
  }
  function fmWire(){
    fm.addEventListener('click',function(e){
      if(!fmenu)return;curT=fmenu.t;var t=e.target.closest('[data-m]');if(!t)return;var a=t.getAttribute('data-m');
      if(a==='sort'){var d=+t.getAttribute('data-d');S[SK()]=(S[SK()]&&S[SK()].k===fmenu.c&&S[SK()].d===d)?null:{k:fmenu.c,d:d};fmClose();draw()}
      else if(a==='tcond'){fmenu.condOpen=!fmenu.condOpen;fmDraw()}
      else if(a==='tval'){fmenu.valOpen=!fmenu.valOpen;fmDraw()}
      else if(a==='all'||a==='none'){fmenu.list.forEach(function(x){if(x.key.toLowerCase().indexOf(fmenu.search.toLowerCase())>=0)fmenu.checked[x.key]=a==='all'});fmDraw()}
      else if(a==='cancel')fmClose();
      else if(a==='ok')fmApply();
    });
    fm.addEventListener('change',function(e){
      if(!fmenu)return;var t=e.target;
      if(t.id==='fop'){fmenu.op=t.value;fmDraw()}
      else if(t.hasAttribute('data-v')){fmenu.checked[t.getAttribute('data-v')]=t.checked;var n=fmenu.list.filter(function(x){return fmenu.checked[x.key]}).length;fm.querySelector('.vact span').textContent=n+' of '+fmenu.list.length+' selected'}
      else if(t.id==='fv1')fmenu.v1=t.value;else if(t.id==='fv2')fmenu.v2=t.value;
    });
    fm.addEventListener('input',function(e){
      if(!fmenu)return;var t=e.target;
      if(t.id==='fsr'){fmenu.search=t.value;var pos=t.selectionStart;fmDraw();var s=LVD.getElementById('fsr');s.focus();s.setSelectionRange(pos,pos)}
      else if(t.id==='fv1')fmenu.v1=t.value;else if(t.id==='fv2')fmenu.v2=t.value;
    });
    fm.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type!=='checkbox'&&e.target.id!=='fsr'){e.preventDefault();fmApply()}});
    LVD.addEventListener('mousedown',function(e){if(fmenu&&!fm.contains(e.target)&&!e.target.closest('.fi'))fmClose()});
    LVD.addEventListener('keydown',function(e){if(e.key==='Escape'&&fmenu){var b=fmenu.btn;fmClose();if(b)b.focus()}});
    window.addEventListener('resize',fmClose);
    window.addEventListener('scroll',function(e){if(fmenu&&!fm.contains(e.target))fmClose()},true);
  }
  
  function drawSick(){
    curT='sick';
    var t=LVD.getElementById('sickT');t.innerHTML='';
    var used={};SICK.forEach(function(r){var f=rfind(r.n,r.b);if(f)used[f.n]=1});
    var all=SICK.slice();
    if(S.everyone)ROSTER.forEach(function(r){if(!used[r.n])all.push({n:r.n,b:r.b||'X',ho:r.ho,res:r.res})});
    function shown(r){
      var f=rfind(r.n,r.b);
      if(!S.res&&((f&&f.res)||r.res))return false;
      if(!depOK(r.n,r.b))return false;
      if((r.b==='X'||!r.b)&&f&&f.a&&f.a.length)return f.a.some(function(x){return S.br.indexOf(x)>=0});
      return brOK(r.b||'X');
    }
    var BORD={SAA:1,KCA:2,MC:3,AQ:4,X:5},PRANK={'Style Director':1,'Senior Stylist':2,'Stylist':3,'Junior Stylist':4,'Beautician':5,'Assistant':6,'Salon Coordinator':7,'Head Coordinator':7,'Receptionist':8,'Office/Admin':9,'Consultant':10};
    var base=all.filter(shown).sort(function(a,b){
      if(S.everyone){
        var pa=personByName(a.n,a.b),pb=personByName(b.n,b.b),ra=(a.res||isRes(a.n,a.b))?1:0,rb=(b.res||isRes(b.n,b.b))?1:0;
        if(ra!==rb)return ra-rb;
        return ((a.ho?0:BORD[a.b||'X'])-(b.ho?0:BORD[b.b||'X']))||((PRANK[pa.r]||99)-(PRANK[pb.r]||99))||a.n.localeCompare(b.n);
      }
      var ta=sumObj(a.sl||{})+sumObj(a.ab||{}),tb2=sumObj(b.sl||{})+sumObj(b.ab||{});
      return tb2-ta||a.n.localeCompare(b.n);
    });
    var data=base.map(rowData);window.__sickData=data;
    var rows=data.filter(function(d){return dpass(d,'')});
    if(S[SK()]){
      var k=S[SK()].k,dir=S[SK()].d,isN=colOf(k).t==='n';
      rows=rows.slice().sort(function(a,b){
        var x=a.v[k],y=b.v[k],ex=(x==null||x===''),ey=(y==null||y==='');
        if(ex&&ey)return 0;if(ex)return 1;if(ey)return -1;
        return isN?(x-y)*dir:String(x).localeCompare(String(y))*dir;
      });
    }
  
    window.__sickRows=rows;
    /* mode toggle, count, clear */
    var sm=LVD.getElementById('sickMode');sm.innerHTML='';
    [[true,'Everyone on the Phorest roster'],[false,'With sick or absent days only']].forEach(function(x){
      var bt=el('button','gchip',x[1]);bt.setAttribute('aria-pressed',S.everyone===x[0]);bt.onclick=function(){S.everyone=x[0];draw()};sm.appendChild(bt)});
    var nf=Object.keys(S[FK()]).length,info=LVD.getElementById('sickInfo');info.innerHTML='';
    info.appendChild(el('span','cnt','Showing '+rows.length+' of '+data.length));
    if(nf||S[SK()]){var cl=el('button','rs','Clear filters and sort');cl.onclick=function(){S.F={};S.sort=null;draw()};info.appendChild(cl)}
  
    /* header with the funnel menus */
    var hr=el('tr');
    COLS.forEach(function(c){
      var th=el('th',(c.t==='n'?'m':'')+(c.m?' mcol':'')),on=S[FK()][c.k]||(S[SK()]&&S[SK()].k===c.k);
      if(on)th.className+=' on';
      var hd=el('div','hd'),lab=el('span','hl',c.l+(S[SK()]&&S[SK()].k===c.k?(S[SK()].d===1?' ↑':' ↓'):''));hd.appendChild(lab);
      var fb=el('button','fi'+(on?' on':''));fb.type='button';fb.setAttribute('data-fcol',c.k);fb.setAttribute('aria-label','Filter and sort '+c.l);fb.setAttribute('aria-haspopup','dialog');fb.innerHTML=FUNNEL;
      hd.appendChild(fb);th.appendChild(hd);hr.appendChild(th);
    });
    var th0=el('thead');th0.appendChild(hr);t.appendChild(th0);
  
    var tb=el('tbody');
    rows.forEach(function(d){
      var r=d.r,pp=d.pp,tr=el('tr');tr.appendChild(staffTd(r.n,r.b));
      tr.appendChild(el('td','pos',pp.r||''));tr.appendChild(el('td','sch',pp.s||''));
      for(var m=1;m<=12;m++){var c=el('td','m');
        if(r.sl&&r.sl[m])c.appendChild(el('span','pill sl',r.sl[m]));
        if(r.ab&&r.ab[m]){if(r.sl&&r.sl[m])c.appendChild(LVD.createTextNode(' '));c.appendChild(el('span','pill ab',r.ab[m]))}
        tr.appendChild(c)}
      tr.appendChild(el('td','m',d.v.sick||''));tr.appendChild(el('td','m',d.v.abs||''));tb.appendChild(tr)});
    if(!rows.length){var tr=el('tr'),td=el('td','empty','Nobody matches these filters.');td.colSpan=COLS.length;tr.appendChild(td);tb.appendChild(tr)}
    t.appendChild(tb);
    t.onclick=function(e){var fi=e.target.closest('[data-fcol]');if(!fi)return;var k=fi.getAttribute('data-fcol');if(fmenu&&fmenu.c===k&&fmenu.t==='sick')fmClose();else fmOpen(k,fi)};
  }
  
  
  var DN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  function offList(x){return DN.filter(function(_,i){return x.s[i]<=25})}
  function offText(x){
    var o=offList(x);
    if(!o.length)return 'Rotating, no fixed day';
    if(o.length>=4)return 'Part-time, works '+DN.filter(function(_,i){return x.s[i]>25}).join(', ');
    return o.join(', ');
  }
  
  function drawCov(){
    var t=LVD.getElementById('covT');t.innerHTML='';
    var hr=el('tr');['Branch'].concat(DN).concat(['People']).forEach(function(h,i){hr.appendChild(el('th',i&&i<8?'m':'',h))});
    var th=el('thead');th.appendChild(hr);t.appendChild(th);var tb=el('tbody');
    BRN.filter(function(b){return S.br.indexOf(b[0])>=0}).forEach(function(b){
      var people=DAYOFF.filter(function(x){return x.b===b[0]}),sums=DN.map(function(_,i){return people.reduce(function(a,x){return a+x.s[i]/100},0)});
      var mn=Math.min.apply(null,sums),tr=el('tr'),td=el('td','stfc'),box=el('div','stf'),dt=el('span','dot');dt.style.background='var(--c-'+b[0]+')';
      box.appendChild(dt);box.appendChild(el('span','',b[1]));td.appendChild(box);tr.appendChild(td);
      sums.forEach(function(v){var c=el('td','m'+(v===mn?' low':''),(Math.round(v*10)/10).toFixed(1));tr.appendChild(c)});
      tr.appendChild(el('td','m',people.length));tb.appendChild(tr)});
    t.appendChild(tb);
  }
  
  function drawOff(){
    curT='off';
    var t=LVD.getElementById('offT');t.innerHTML='';
    var BORD={SAA:1,KCA:2,MC:3,AQ:4},PRANK={'Style Director':1,'Senior Stylist':2,'Stylist':3,'Junior Stylist':4,'Beautician':5,'Assistant':6,'Salon Coordinator':7,'Receptionist':8,'Office/Admin':9};
    var data=DAYOFF.filter(function(x){return brOK(x.b)&&depOK(x.n,x.b)}).map(function(x){
      var pp=personByName(x.n,x.b),v={name:pp.n||x.n,pos:pp.r||'',branch:BR[x.b]};
      DN.forEach(function(d,i){v[d.toLowerCase()]=x.s[i]});v.off=offText(x);v.weeks=x.w;
      return {r:{n:x.n,b:x.b},x:x,pp:pp,v:v};
    }).sort(function(a,b){return (BORD[a.x.b]-BORD[b.x.b])||((PRANK[a.pp.r]||99)-(PRANK[b.pp.r]||99))||a.v.name.localeCompare(b.v.name)});
    window.__offData=data;
    var rows=data.filter(function(d){return dpass(d,'')});
    var so=S[SK()];
    if(so){
      var k=so.k,dir=so.d,isN=colOf(k).t==='n';
      rows=rows.slice().sort(function(a,b){
        var x=a.v[k],y=b.v[k],ex=(x==null||x===''),ey=(y==null||y==='');
        if(ex&&ey)return 0;if(ex)return 1;if(ey)return -1;
        return isN?(x-y)*dir:String(x).localeCompare(String(y))*dir;
      });
    }
    window.__offRows=rows;
    var info=LVD.getElementById('offInfo');info.innerHTML='';
    info.appendChild(el('span','cnt','Showing '+rows.length+' of '+data.length));
    if(Object.keys(S[FK()]).length||so){var cl=el('button','rs','Clear filters and sort');cl.onclick=function(){S.F2={};S.sort2=null;draw()};info.appendChild(cl)}
    var hr=el('tr');
    OFFCOLS.forEach(function(c){
      var th=el('th',(c.t==='n'?'m':'')+(c.m?' mcol':'')),on=S[FK()][c.k]||(so&&so.k===c.k);
      if(on)th.className+=' on';
      var hd=el('div','hd'),lab=el('span','hl',c.l+(so&&so.k===c.k?(so.d===1?' ↑':' ↓'):''));hd.appendChild(lab);
      var fb=el('button','fi'+(on?' on':''));fb.type='button';fb.setAttribute('data-fcol',c.k);fb.setAttribute('aria-label','Filter and sort '+c.l);fb.setAttribute('aria-haspopup','dialog');fb.innerHTML=FUNNEL;
      hd.appendChild(fb);th.appendChild(hd);hr.appendChild(th);
    });
    var th0=el('thead');th0.appendChild(hr);t.appendChild(th0);
    var tb=el('tbody');
    rows.forEach(function(d){
      var tr=el('tr');tr.appendChild(staffTd(d.x.n,d.x.b));
      tr.appendChild(el('td','pos',d.pp.r||''));tr.appendChild(el('td','',BR[d.x.b]));
      DN.forEach(function(_,i){
        var v=d.x.s[i],off=v<=25,c=el('td','m dayc'+(off?' off':''),off?'off':v+'%');
        if(!off)c.style.background='color-mix(in srgb,var(--ok) '+Math.round(v*0.32)+'%,transparent)';
        c.title='Rostered in '+v+'% of '+d.x.w+' weeks';tr.appendChild(c)});
      tr.appendChild(el('td','sch',d.v.off));tr.appendChild(el('td','m',d.x.w));tb.appendChild(tr)});
    if(!rows.length){var tr=el('tr'),td=el('td','empty','Nobody matches these filters.');td.colSpan=OFFCOLS.length;tr.appendChild(td);tb.appendChild(tr)}
    t.appendChild(tb);
    t.onclick=function(e){var fi=e.target.closest('[data-fcol]');if(!fi)return;var k=fi.getAttribute('data-fcol');if(fmenu&&fmenu.c===k&&fmenu.t==='off')fmClose();else fmOpen(k,fi)};
    curT='sick';
  }
  
  function drawHolT(){
    var t=LVD.getElementById('holT');t.innerHTML='';var hr=el('tr');
    ['Holiday','Dates','Days','Salons','Working?','Note'].forEach(function(h){hr.appendChild(el('th','',h))});
    var th=el('thead');th.appendChild(hr);t.appendChild(th);var tb=el('tbody');
    HOL.forEach(function(h){var r=el('tr');r.appendChild(el('td','',h.n));r.appendChild(el('td','',rng(h.f,h.t)));r.appendChild(el('td','',nd(h.f,h.t)));
      var sc=el('td');sc.appendChild(workBadge(h));r.appendChild(sc);
      var hw=holWork(h);
      var wk=el('td','wkmark '+{off:'x',on:'ok',part:'pt',tbc:'q'}[hw],{off:'✗',on:'✓',part:'½',tbc:'?'}[hw]);
      wk.title=holVisits(h);r.appendChild(wk);
      r.appendChild(el('td','',h.note));tb.appendChild(r)});
    t.appendChild(tb);
  }
  /* a holiday date up to the last day Phorest data covers, with no staff rows, is a day nobody traded */
  HOL.forEach(function(h){for(var t=P(h.f);t<=P(h.t);t+=864e5){var k=iso(t);if(k>RANGE_TO)continue;var d=PH[k]=PH[k]||{};['SAA','KCA','MC','AQ'].forEach(function(b){if(d[b]==null)d[b]=0})}});
  
  /* hover any day in the planner: the weekday and the date, in the same card the bars use (and Today, or the holiday, when it is one) */
  function dayTip(cell,s,dd){
    cell.addEventListener('mouseenter',function(ev){
      hideTip();var t=el('div','tip'),tx=el('div','tip-tx');
      tx.appendChild(el('b','',['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(P(s)).getUTCDay()]+', '+fmt(s)));
      if(s===TODAY)tx.appendChild(el('div','m','Today'));
      if(dd&&dd.hol&&dd.hol.length)tx.appendChild(el('div','m',dd.hol.map(function(h){return h.n}).join(', ')+' (public holiday, expected)'));
      t.appendChild(tx);LVD.body.appendChild(t);tipEl=t;moveTip(ev);
    });
    cell.addEventListener('mousemove',moveTip);
    cell.addEventListener('mouseleave',hideTip);
  }
  
  /* XLSX and CSV for each report (report-export.js and ledger-export.js, the same writers as the other reports). A model is
     { name, csv, sheets:[{ name, title, subtitle, blocks:[{ cols:[{label,fmt}], rows:[{cells}] }] }] }; each follows the filters on screen. */
  var STATUS_LBL={req:'Waiting for approval',app:'Approved',plan:'Planned'};
  function filterLine(){return brLabel()+', '+(S.dep.length?depLabel()+', ':'')+(S.res?'including resigned staff':'present staff')+', data up to '+fmt(RANGE_TO)}
  window.lcExpLeave=function(){
    var rows=LV.filter(function(l){return lvOK(l)&&(S.res||!isRes(l.n,l.b))}).sort(function(a,b){return a.f<b.f?-1:a.f>b.f?1:a.n.localeCompare(b.n)}).map(function(l){
      var pp=personByName(l.n,l.b);
      return {cells:[pp.n||l.n,pp.r||'',BR[l.b]||BR.X,l.ty,l.f,l.t,nd(l.f,l.t),STATUS_LBL[l.s]||l.s,l.src||'']};
    });
    return {name:'leave-calendar-leave',csv:0,sheets:[{name:'Leave',title:'Leave, '+brLabel(),subtitle:'Planned and approved leave from Jumera’s notes and the approved list, and the requests waiting in Bayzat. '+filterLine()+'.',
      blocks:[{cols:[{label:'Staff',fmt:'text'},{label:'Position',fmt:'text'},{label:'Branch',fmt:'text'},{label:'Type',fmt:'text'},{label:'From',fmt:'text'},{label:'To',fmt:'text'},{label:'Days',fmt:'num'},{label:'Status',fmt:'text'},{label:'Source',fmt:'text'}],rows:rows}]}]};
  };
  window.lcExpSick=function(){
    var rows=[];
    (window.__sickRows||[]).forEach(function(d){
      for(var m=1;m<=12;m++){var a=(d.r.sl&&d.r.sl[m])||0,b=(d.r.ab&&d.r.ab[m])||0;if(!a&&!b)continue;
        rows.push({cells:[d.v.name,d.v.pos,d.v.works,MON[m-1],a,b]})}
    });
    return {name:'leave-calendar-sick-leave-and-absences',csv:0,sheets:[{name:'Sick and absences',title:'Sick leave and absences '+TODAY.slice(0,4)+', counts per month, no dates',
      subtitle:'Sick with a medical certificate (SL Monitoring) and sick without one, marked absent (staff absences), from Jumera’s notes. '+filterLine()+'. One row per person per month with a count.',
      blocks:[{cols:[{label:'Staff',fmt:'text'},{label:'Position',fmt:'text'},{label:'Works',fmt:'text'},{label:'Month',fmt:'text'},{label:'Sick with medical certificate (days)',fmt:'num'},{label:'Sick without one, marked absent (days)',fmt:'num'}],rows:rows}]}]};
  };
  window.lcExpOff=function(){
    var DNL=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],rows=(window.__offRows||[]).map(function(d){
      return {cells:[d.v.name,d.v.pos,d.v.branch].concat(d.x.s,[d.v.off,d.x.w])};
    });
    var cov=BRN.filter(function(b){return S.br.indexOf(b[0])>=0}).map(function(b){
      var people=DAYOFF.filter(function(x){return x.b===b[0]});
      return {cells:[b[1]].concat(DNL.map(function(_,i){return Math.round(people.reduce(function(a,x){return a+x.s[i]/100},0)*10)/10}),[people.length])};
    });
    var note='Share of weeks the person was rostered on each weekday in Phorest (12 weeks to '+fmt(RANGE_TO)+'). Off = rostered in 25% of weeks or fewer. Only weeks with at least two rostered days count. Phorest rosters hours, it does not hold approved leave.';
    return {name:'leave-calendar-usual-day-offs',csv:0,sheets:[
      {name:'Day offs',title:'Usual day offs by person',subtitle:note+' '+filterLine()+'.',
       blocks:[{cols:[{label:'Staff',fmt:'text'},{label:'Position',fmt:'text'},{label:'Branch',fmt:'text'}].concat(DNL.map(function(d){return {label:d+' % of weeks rostered',fmt:'num'}}),[{label:'Usual days off',fmt:'text'},{label:'Weeks counted',fmt:'num'}]),rows:rows}]},
      {name:'Coverage',title:'Average people rostered on each weekday, by branch',subtitle:note,
       blocks:[{cols:[{label:'Branch',fmt:'text'}].concat(DNL.map(function(d){return {label:d,fmt:'num'}}),[{label:'People',fmt:'num'}]),rows:cov}]}]};
  };
  window.lcExpHol=function(){
    var W={on:'Salons open',off:'Salons closed',part:'Part open',tbc:'To confirm'},WQ={on:'Yes',off:'No',part:'Some branches',tbc:'No data yet'};
    var rows=HOL.map(function(h){var k=holWork(h);return {cells:[h.n,h.f,h.t,nd(h.f,h.t),WQ[k],holVisits(h),h.note]}});
    return {name:'leave-calendar-public-holidays',csv:0,sheets:[{name:'Public holidays',title:'Public holidays '+TODAY.slice(0,4)+' (expected dates)',
      subtitle:'Expected dates from press estimates, not a Cabinet announcement. Working? is read from Phorest visits for '+brLabel()+': Yes = every branch shown had visits, No = none did, Some branches = part, No data yet = the date has not happened.',
      blocks:[{cols:[{label:'Holiday',fmt:'text'},{label:'From',fmt:'text'},{label:'To',fmt:'text'},{label:'Days',fmt:'num'},{label:'Working?',fmt:'text'},{label:'Phorest visits',fmt:'text'},{label:'Note',fmt:'text'}],rows:rows}]}]};
  };
  
  buildFilters();
  draw();
  (function(){
    var tbar=LVD.getElementById('topbar'),fb=LVD.getElementById('filtersBtn');
    LVD.getElementById('filters').addEventListener('click',onGlobalChip);
    LVD.getElementById('fSheetBody').addEventListener('click',onGlobalChip);
    function sheetOpen(on){LVD.body.classList.toggle('sheet-open',on);LVD.getElementById('fSheetBtn').setAttribute('aria-expanded',on)}
    LVD.getElementById('fSheetBtn').onclick=function(){sheetOpen(true)};
    LVD.getElementById('fDone').onclick=function(){sheetOpen(false)};
    LVD.getElementById('fScrim').onclick=function(){sheetOpen(false)};
    function setBar(open,save){
      tbar.classList.toggle('fclosed',!open);fb.textContent=open?'Hide filters':'Show filters';fb.setAttribute('aria-expanded',open);
      if(save){try{localStorage.setItem('trs-filters',open?'open':'closed')}catch(e){}}
      setTb();
    }
    fb.onclick=function(){setBar(tbar.classList.contains('fclosed'),true)};
    try{if(localStorage.getItem('trs-filters')==='closed'&&matchMedia('(min-width:761px)').matches)setBar(false,false)}catch(e){}
  })();
  }
  startPage(r.data);
  lvcSetTb();
    (function () {
      var tb = LVD.getElementById('topbar'), btns = [].slice.call(LVD.querySelectorAll('.rail button'));
      btns.forEach(function (b) { b.onclick = function () { var t = LVD.getElementById(b.getAttribute('data-sec')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
      function spy() {
        var line = parseFloat(getComputedStyle(LVD.host).getPropertyValue('--tb')) + 90 || 250, cur = btns[0];
        btns.forEach(function (b) { var t = LVD.getElementById(b.getAttribute('data-sec')); if (t && t.getBoundingClientRect().top <= line) cur = b; });
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = btns[btns.length - 1];
        btns.forEach(function (b) { b.classList.toggle('on', b === cur); });
        if (cur.scrollIntoView && window.innerWidth < 1100) { var r = cur.parentNode; r.scrollLeft = cur.offsetLeft - 12; }
      }
      window.addEventListener('scroll', spy, { passive: true }); spy();
    })();
}

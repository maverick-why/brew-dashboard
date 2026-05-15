export const STEPS = [
  { k:'tank_in',   n:'入罐',     s:'入罐',    c:'#1D9E75', fixed:true  },
  { k:'yeast',     n:'酵母接种', s:'酵母',    c:'#378ADD', fixed:false },
  { k:'dryhop1',   n:'干投一',   s:'干投一',  c:'#BA7517', fixed:false },
  { k:'dryhop2',   n:'干投二',   s:'干投二',  c:'#D4537E', fixed:false },
  { k:'yeast_out', n:'排酵母',   s:'排酵母',  c:'#7F77DD', fixed:false },
  { k:'hop_out1',  n:'排酒花一', s:'排花一',  c:'#E24B4A', fixed:false },
  { k:'hop_out2',  n:'排酒花二', s:'排花二',  c:'#BA7517', fixed:false },
  { k:'fill',      n:'灌装',     s:'灌装',    c:'#0F6E56', fixed:false },
]

export const DEF = {
  tank_in:0, yeast:1, dryhop1:5, dryhop2:7,
  yeast_out:10, hop_out1:12, hop_out2:14, fill:16,
}

export const TCOLS = [
  '#1D9E75','#378ADD','#BA7517','#D4537E',
  '#7F77DD','#E24B4A','#9B59B6','#E67E22',
]

export const C = {
  bg:'#f5f0e8', card:'#fff', bd:'#e0d9ce',
  tx:'#1a1a1a', mu:'#888',   fa:'#f0ebe0',
  g:'#1D9E75',  dg:'#0F6E56', red:'#C8382A', amb:'#B07010',
}

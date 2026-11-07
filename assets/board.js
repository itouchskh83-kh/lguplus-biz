
(function(){
  "use strict";
  var API = "/api/posts";
  var PER = 12;
  var state = { page:1, q:"", field:"all", kind:"all", pages:1, total:0 };

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];}); }
  function mask(n){ n=String(n||"").trim(); if(n.length<=1)return "*"; if(n.length===2)return n[0]+"*"; return n[0]+"*".repeat(n.length-2)+n[n.length-1]; }
  function fmt(s){
    var t=String(s||"");
    if(t.length<10) return t;
    return t.replace(/-/g,".").slice(0,10);
  }

  function renderRows(list,total,pages){
    var tb=$("bdBody"); state.total=total; state.pages=pages;
    if(!list.length){ tb.innerHTML='<tr><td colspan="5" class="bd-empty">아직 접수된 상담 내역이 없습니다.</td></tr>'; }
    else {
      var off=(state.page-1)*PER;
      tb.innerHTML=list.map(function(r,i){
        var no=total-off-i;
        var badge=r.answered?'<span class="badge done">답변완료</span>':'<span class="badge">접수완료</span>';
        var ktag=r.kind==="inquiry"?'<span class="ktag inq">1:1문의</span>':'<span class="ktag con">상담신청</span>';
        return '<tr><td class="no">'+no+'</td><td class="tt">'+ktag+'<span>'+esc(r.title)+'</span></td>'
          +'<td class="who">'+esc(r.author)+'</td><td class="dt">'+esc(fmt(r.date))+'</td><td>'+badge+'</td></tr>';
      }).join("");
    }
    var t=$("bdTotal"); if(t) t.textContent=total;
    renderPager(pages);
  }

  function renderPager(pages){
    var box=$("bdPager"); if(!box) return;
    var cur=state.page,out=[];
    out.push('<button type="button" class="pg nav" data-p="'+(cur-1)+'"'+(cur<=1?' disabled':'')+'>이전</button>');
    var st=Math.max(1,cur-2), en=Math.min(pages,st+4); st=Math.max(1,en-4);
    if(st>1){ out.push('<button type="button" class="pg" data-p="1">1</button>'); if(st>2) out.push('<span class="pg-dots">…</span>'); }
    for(var p=st;p<=en;p++) out.push('<button type="button" class="pg'+(p===cur?' on':'')+'" data-p="'+p+'">'+p+'</button>');
    if(en<pages){ if(en<pages-1) out.push('<span class="pg-dots">…</span>'); out.push('<button type="button" class="pg" data-p="'+pages+'">'+pages+'</button>'); }
    out.push('<button type="button" class="pg nav" data-p="'+(cur+1)+'"'+(cur>=pages?' disabled':'')+'>다음</button>');
    box.innerHTML=out.join("");
  }

  function load(){
    var tb=$("bdBody"); if(tb) tb.innerHTML='<tr><td colspan="5" class="bd-empty">불러오는 중입니다…</td></tr>';
    var qs="?page="+state.page+"&field="+encodeURIComponent(state.field)+"&kind="+encodeURIComponent(state.kind)+"&q="+encodeURIComponent(state.q);
    fetch(API+qs,{headers:{accept:"application/json"}})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){ if(!d||!d.ok||!Array.isArray(d.list)) throw 0; renderRows(d.list,d.total||0,d.pages||1); })
      .catch(function(){
        if(tb) tb.innerHTML='<tr><td colspan="5" class="bd-empty">상담 내역을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</td></tr>';
        var t=$("bdTotal"); if(t) t.textContent="-";
        var pager=$("bdPager"); if(pager) pager.innerHTML="";
      });
  }

  document.addEventListener("DOMContentLoaded",function(){
    if(!$("bdBody")) return;
    var sampleNote=document.createElement("p");
    sampleNote.className="board-sub";
    sampleNote.textContent="상담 접수 내역을 확인하세요. 목록에는 화면 안내용 가상 샘플이 포함되어 있습니다.";
    $("bdBody").closest("table").insertAdjacentElement("beforebegin",sampleNote);
    load();
    $("bdSearch").addEventListener("click",function(){ state.q=$("bdQuery").value.trim(); state.field=$("bdField").value; state.page=1; load(); });
    $("bdQuery").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); $("bdSearch").click(); } });
    if($("bdKind")) $("bdKind").addEventListener("change",function(){ state.kind=$("bdKind").value; state.page=1; load(); });
    $("bdPager").addEventListener("click",function(e){
      var b=e.target.closest("button.pg"); if(!b||b.disabled) return;
      var p=parseInt(b.dataset.p,10); if(p<1||p>state.pages) return;
      state.page=p; load();
      var t=document.querySelector(".bd-board"); if(t) t.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
})();

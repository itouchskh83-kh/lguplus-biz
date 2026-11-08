
// 마우스가 올라간 카드 보라 강조 (이탈 시 마지막 카드 유지)
(function(){
  var groups=[].slice.call(document.querySelectorAll('.grid3,.grid4'));
  groups.forEach(function(g){
    var cards=[].slice.call(g.querySelectorAll('.card[data-pick]'));
    if(!cards.length) return;
    cards.forEach(function(c){
      function on(){cards.forEach(function(o){o.classList.toggle('is-pick',o===c);});}
      c.addEventListener('mouseenter',on);
      c.addEventListener('focusin',on);
      c.addEventListener('click',on);
    });
  });
})();

(function(){
  "use strict";
  var header=document.getElementById('header');
  if(header){
    header.style.setProperty('position','sticky','important');
    header.style.setProperty('top','0','important');
    var onScroll=function(){ header.classList.toggle('is-stuck', window.scrollY>10); };
    onScroll(); window.addEventListener('scroll',onScroll,{passive:true});
  }

  /* 모바일 하단바: 아래로 스크롤하면 숨기고 위로 올리면 표시 */
  var mbar=document.querySelector('.mobile-bar');
  if(mbar){
    var lastY=window.scrollY;
    window.addEventListener('scroll',function(){
      var y=window.scrollY;
      if(y>150){ mbar.classList.add('is-scrolled','is-down'); }
      else { mbar.classList.remove('is-scrolled'); }
      if(y>lastY+6 && y>150){ mbar.classList.add('is-down'); }
      else if(y<lastY-6){ mbar.classList.remove('is-down'); }
      lastY=y;
    },{passive:true});
  }

  /* 전화번호 자동 하이픈 (010-0000-0000) */
  function autoHyphen(el){
    el.addEventListener('input', function(){
      var d = el.value.replace(/\D/g,'').slice(0,11);
      var out = d;
      if(d.length > 7) out = d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7);
      else if(d.length > 3) out = d.slice(0,3)+'-'+d.slice(3);
      if(el.value !== out) el.value = out;
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[type="tel"], input[inputmode="tel"]'), autoHyphen);

  /* 표 가로 스크롤 안내 그림자 */
  Array.prototype.forEach.call(document.querySelectorAll('.tbl-wrap'),function(w){
    function upd(){
      var more=w.scrollWidth-w.clientWidth;
      w.classList.toggle('is-scrollable',more>4);
      w.classList.toggle('is-end',more>4 && w.scrollLeft>=more-4);
    }
    upd();
    w.addEventListener('scroll',upd,{passive:true});
    window.addEventListener('resize',upd);
  });

  var drawer=document.getElementById('drawer'), menuBtn=document.getElementById('menuBtn');
  function openDrawer(){ if(!drawer) return; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden','false'); menuBtn.setAttribute('aria-expanded','true'); document.body.style.overflow='hidden'; }
  function closeDrawer(){ if(!drawer) return; drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden','true'); menuBtn.setAttribute('aria-expanded','false'); document.body.style.overflow=''; }
  if(menuBtn) menuBtn.addEventListener('click',openDrawer);
  document.querySelectorAll('[data-close-drawer]').forEach(function(el){ el.addEventListener('click',closeDrawer); });
  document.querySelectorAll('.drawer-nav a').forEach(function(a){ a.addEventListener('click',closeDrawer); });

  var quick=document.getElementById('quick'), qt=document.getElementById('quickToggle');
  if(qt) qt.addEventListener('click',function(){
    var hidden=quick.classList.toggle('is-hidden');
    qt.textContent=hidden?'열기':'접기';
    qt.setAttribute('aria-label',hidden?'상담 위젯 열기':'상담 위젯 접기');
  });

  var modal=document.getElementById('modal');
  function openModal(){ if(!modal) return; modal.classList.add('is-open'); document.body.style.overflow='hidden'; var f=document.getElementById('fName'); if(f) setTimeout(function(){f.focus();},60); }
  function closeModal(){ if(!modal) return; modal.classList.remove('is-open'); document.body.style.overflow=''; }
  document.querySelectorAll('[data-open-modal],a[href="#consult"],a[href="call.html"]').forEach(function(b){ b.addEventListener('click',function(e){ e.preventDefault(); openModal(); }); });
  document.querySelectorAll('[data-close-modal]').forEach(function(b){ b.addEventListener('click',closeModal); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ closeModal(); closeDrawer(); } });

  /* 상담신청 → 문의게시판(D1) 통합 접수 */
  function postConsult(form){
    var g=function(n){ var el=form.querySelector('[name="'+n+'"]'); return el?el.value:''; };
    var digits=function(v){ return String(v||'').replace(/\D/g,''); };
    var product=g('product')||'기타 문의';
    var msg=(g('message')||'').trim();
    var title=(g('title')||'').trim() || ('[상담신청] ' + product);
    var content = msg || ('상담 신청 상품: ' + product);
    var company=(g('company')||'').trim();
    if(company) content = '회사명: ' + company + '\n' + content;
    var email=(g('email')||'').trim();
    if(email) content += '\n이메일: ' + email;

    return fetch('/api/posts',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({kind:'consult',title:title,content:content,author:g('name'),
        phone:g('tel'),product:product,password:g('password')})})
      .then(function(r){ if(!r.ok || !(r.headers.get('content-type')||'').includes('application/json')) throw new Error('API_RESPONSE'); return r.json(); });
  }

  var form=document.getElementById('consultForm');
  if(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var ok=true;
      form.querySelectorAll('[data-req]').forEach(function(input){
        var v=(input.value||'').trim();
        var bad=!v;
        if(input.type==='checkbox') bad=!input.checked;
        if(input.dataset.type==='tel' && v) bad=digitsCount(v)<9 || digitsCount(v)>11;
        if(input.name==='name' && v) bad=v.length>20;
        if(input.name==='password' && v) bad=!/^\d{6}$/.test(v);
        var field=input.closest('.field')||input.closest('.agree-wrap');
        if(field) field.classList.toggle('err',bad);
        if(bad) ok=false;
      });
      if(!ok) return;
      function digitsCount(v){ return String(v||'').replace(/\D/g,'').length; }

      var btn=form.querySelector('[type="submit"]');
      var label=btn?btn.textContent:'';
      if(btn){ btn.disabled=true; btn.textContent='접수 중…'; }
      var errBox=document.getElementById('consultErr');
      if(errBox) errBox.textContent='';

      postConsult(form).then(function(j){
        if(btn){ btn.disabled=false; btn.textContent=label; }
        if(!j || !j.ok){
          if(errBox) errBox.textContent='접수에 실패했습니다. 1833-7353로 전화 주시면 바로 안내드립니다.';
          else alert('접수에 실패했습니다. 1833-7353로 연락 주세요.');
          return;
        }
        form.style.display='none';
        var done=document.getElementById('done'); if(done) done.classList.add('is-on');
        var t=document.getElementById('modalTitle'); if(t) t.textContent='접수 완료';
      }).catch(function(){
        if(btn){ btn.disabled=false; btn.textContent=label; }
        if(errBox) errBox.textContent='서버 연결 오류가 발생했습니다. 1833-7353로 연락 주세요.';
        else alert('서버 연결 오류가 발생했습니다. 1833-7353로 연락 주세요.');
      });
    });
  }

  var goTop=document.getElementById('goTop');
  if(goTop) goTop.addEventListener('click',function(){ window.scrollTo({top:0,behavior:'smooth'}); });

  // calculator
  var calc=document.getElementById('calcForm');
  if(calc){
    var PRICE={'1':30000,'2':40000,'3':50000,'4':60000,'5':70000,'6':80000,'7':90000,'8':100000,'9':110000,'10':120000};
    var BASE={'none':0,'basic':150000,'full':350000};
    function money(n){ return n.toLocaleString('ko-KR'); }
    function update(){
      var lines=calc.querySelector('[name=lines]').value;
      var setup=calc.querySelector('[name=setup]').value;
      var extra=calc.querySelector('[name=extra]').value;
      var lineCost = PRICE[lines] || (lines*10000);
      var setupCost = BASE[setup]||0;
      var extraCost = extra==='wifi'?220000:extra==='rack'?280000:extra==='outdoor'?180000:0;
      var total=lineCost+setupCost+extraCost;
      document.getElementById('cLines').textContent=money(lineCost)+'원';
      document.getElementById('cSetup').textContent=money(setupCost)+'원';
      document.getElementById('cExtra').textContent=money(extraCost)+'원';
      document.getElementById('cTotal').textContent=money(total)+'원';
    }
    calc.addEventListener('change',update); calc.addEventListener('input',update); update();
  }
})();

(function(){
  if(!('IntersectionObserver' in window) || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var nodes=document.querySelectorAll('main .sec-head,main .head,main .card,main .tile,main .point,main .cta-band,main .related,main .table-wrap');
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}});
  },{threshold:0,rootMargin:'0px 0px -24px 0px'});
  nodes.forEach(function(el){
    // 첫 화면은 그대로 표시. 스크롤로 진입하는 요소만 한 번 등장시킵니다.
    if(el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('scroll-reveal');
    if(el.matches('.card,.tile,.point')) {
      var i=Array.prototype.indexOf.call(el.parentElement.children,el);
      el.style.setProperty('--reveal-delay',(i%3)*65+'ms');
    }
    observer.observe(el);
  });
  // 지원 환경의 예외나 화면 복원 시에도 콘텐츠가 숨은 채 남지 않습니다.
  function showAll(){nodes.forEach(function(el){el.classList.add('is-revealed');});observer.disconnect();}
  window.addEventListener('beforeprint',showAll);
  window.addEventListener('pageshow',function(e){if(e.persisted)showAll();});
})();

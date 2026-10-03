/* =====================================================================
   Anas Wadi — portfolio main script
   المحتوى (المشاريع / المحطات / الأسئلة) يُقرأ من مجلد /data  —  وتعدّله من /admin
   ===================================================================== */
var PROJECTS = [];

/* ---------------- Safe helpers (content comes from JSON edited in /admin) ---------------- */
function esc(v){
  return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}
function safeUrl(u){ return /^https?:\/\//i.test(u || "") ? u : ""; }
function safeAsset(u){
  u = u || "";
  if(u.indexOf("..") !== -1) return "";
  return /^(assets\/[A-Za-z0-9._\/-]+|https?:\/\/[^\s"'<>()]+)$/.test(u) ? u : "";
}
function safeColor(c, d){ return /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : (d || "#00E5FF"); }
function cssUrl(u){
  return "url('" + u.replace(/['\\()\s]/g, function(ch){
    return "%" + ch.charCodeAt(0).toString(16).toUpperCase();
  }) + "')";
}

/* ---------------- Nav ---------------- */
function go(id){
  document.getElementById(id).scrollIntoView({behavior:"smooth"});
  document.getElementById("mobileMenu").classList.remove("open");
}
function toggleMenu(){
  document.getElementById("mobileMenu").classList.toggle("open");
}

/* ---------------- Render project cards ---------------- */
function renderProjects(){
  var grid = document.getElementById("projectsGrid");
  if(!PROJECTS.length){
    grid.innerHTML = '<p class="desc" style="grid-column:1/-1">لا توجد مشاريع معروضة حالياً.</p>';
    return;
  }
  var html = "";
  PROJECTS.forEach(function(p){
    var st = STATUS_LABEL[p.status] || STATUS_LABEL.pending;
    var color = safeColor(p.color);
    var hero = safeAsset(p.heroImg), logo = safeAsset(p.logoImg);
    var link = safeUrl(p.link), gh = safeUrl(p.github);
    var techHtml = (p.tech || []).map(function(t){ return '<span class="tech-pill">'+esc(t)+'</span>'; }).join("");
    var actionHtml = link
      ? '<a class="main live" href="'+esc(link)+'" target="_blank" rel="noopener">'+ICON_SVG.external+' '+esc(p.linkLabel)+'</a>'
      : '<div class="main pending glass-strong">'+ICON_SVG.clock+' '+esc(p.linkLabel)+'</div>';
    var iconHtml = logo
      ? '<img src="'+esc(logo)+'" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;padding:5px;">'
      : (ICON_SVG[p.icon] || ICON_SVG.sparkle);

    html += ''+
    '<div class="card glass reveal'+(hero ? ' has-cover' : '')+'" data-status="'+esc(p.status)+'">'+
      (hero ? '<div class="card-cover" style="background-image:'+esc(cssUrl(hero))+'"></div>' : '<div class="blob" style="background:'+color+'"></div>')+
      '<div class="card-top">'+
        '<div class="card-icon" style="background:'+color+'18; color:'+color+'; overflow:hidden;">'+iconHtml+'</div>'+
        '<span class="status-badge" style="background:'+st.color+'18; color:'+st.color+'; border:1px solid '+st.color+'30;"><span class="status-dot" style="background:'+st.color+'"></span>'+st.text+'</span>'+
      '</div>'+
      '<h3>'+esc(p.title)+'</h3>'+
      '<div class="en">'+esc(p.en)+'</div>'+
      '<div class="tag" style="color:'+color+'">'+esc(p.tag)+'</div>'+
      '<p class="summary">'+esc(p.summary)+'</p>'+
      '<div class="tech-row">'+techHtml+'</div>'+
      '<button class="toggle-btn" data-open="'+esc(p.id)+'" style="margin-top:14px;"><span class="line"></span><span class="label">فتح الصفحة الكاملة ←</span></button>'+
      '<div class="card-actions">'+
        actionHtml+
        (gh ? '<a class="gh glass-strong" href="'+esc(gh)+'" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">'+ICON_SVG.github+'</a>' : '')+
      '</div>'+
    '</div>';
  });
  grid.innerHTML = html;
}

/* ---------------- Project full-page detail ---------------- */
function openProjectDetail(id){
  var p = PROJECTS.filter(function(x){ return x.id === id; })[0];
  if(!p) return;
  var st = STATUS_LABEL[p.status] || STATUS_LABEL.pending;
  var color = safeColor(p.color);
  var hero0 = safeAsset(p.heroImg);

  var hero = document.getElementById("pdHero");
  if(hero0){
    hero.style.backgroundImage = cssUrl(hero0);
  } else {
    hero.style.backgroundImage = "linear-gradient(135deg, "+color+"33, #0A0620 75%)";
  }

  document.getElementById("pdStatus").innerHTML = '<span class="status-dot" style="background:'+st.color+'; width:6px; height:6px; border-radius:50%; display:inline-block;"></span> '+st.text;
  document.getElementById("pdStatus").style.background = st.color+"18";
  document.getElementById("pdStatus").style.color = st.color;
  document.getElementById("pdStatus").style.border = "1px solid "+st.color+"30";
  document.getElementById("pdTitle").textContent = p.title;
  document.getElementById("pdEn").textContent = p.en;
  document.getElementById("pdTag").textContent = p.tag;
  document.getElementById("pdTag").style.color = color;
  document.getElementById("pdOverview").textContent = p.overview || p.summary;
  document.getElementById("pdRole").textContent = p.role || "";

  document.getElementById("pdTech").innerHTML = (p.tech || []).map(function(t){ return '<span class="tech-pill">'+esc(t)+'</span>'; }).join("");

  document.getElementById("pdFeatures").innerHTML = (p.details || []).map(function(d){
    return '<li><span class="check" style="background:'+color+'20; color:'+color+'; width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">'+ICON_SVG.check+'</span><span>'+esc(d)+'</span></li>';
  }).join("");

  var link = safeUrl(p.link), gh = safeUrl(p.github);
  document.getElementById("pdActions").innerHTML = link
    ? '<a class="main live" href="'+esc(link)+'" target="_blank" rel="noopener">'+ICON_SVG.external+' '+esc(p.linkLabel)+'</a>'
    : '<div class="main pending">'+ICON_SVG.clock+' '+esc(p.linkLabel)+'</div>';

  document.getElementById("pdGithubRow").innerHTML = gh
    ? '<a href="'+esc(gh)+'" target="_blank" rel="noopener">'+ICON_SVG.github+' عرض الكود على GitHub</a>'
    : '';

  var overlay = document.getElementById("projectDetail");
  overlay.classList.add("open");
  overlay.scrollTop = 0;
  document.body.classList.add("pd-lock");
  window.location.hash = "project-"+id;
}

function closeProjectDetail(){
  document.getElementById("projectDetail").classList.remove("open");
  document.body.classList.remove("pd-lock");
  if(window.location.hash.indexOf("project-") === 1){
    history.replaceState(null, "", window.location.pathname);
  }
}
document.addEventListener("keydown", function(e){
  if(e.key === "Escape") closeProjectDetail();
});

/* ---------------- Clipboard fallback ---------------- */
function fallbackCopy(text, cb){
  var ta = document.createElement("textarea");
  ta.value = text; document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); }catch(e){}
  document.body.removeChild(ta);
  cb();
}

/* ---------------- FAQ ---------------- */
function toggleFaq(el){
  var wasOpen = el.classList.contains("open");
  document.querySelectorAll(".faq-item").forEach(function(f){
    f.classList.remove("open");
    f.querySelector(".faq-a").style.maxHeight = null;
  });
  if(!wasOpen){
    el.classList.add("open");
    var a = el.querySelector(".faq-a");
    a.style.maxHeight = a.scrollHeight + "px";
  }
}

/* ---------------- Filters ---------------- */
function filterProjects(status, btn){
  document.querySelectorAll("#filterRow .filter-btn").forEach(function(b){ b.classList.remove("active"); });
  btn.classList.add("active");
  document.querySelectorAll("#projectsGrid .card").forEach(function(card){
    if(status === "all" || card.getAttribute("data-status") === status){
      card.classList.remove("hide");
    } else {
      card.classList.add("hide");
    }
  });
}

/* ---------------- Copy helper ---------------- */
function copyText(text, btnEl){
  function done(){
    var old = btnEl.innerHTML;
    btnEl.innerHTML = ICON_SVG.check;
    setTimeout(function(){ btnEl.innerHTML = old; }, 1500);
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(function(){ fallbackCopy(text, done); });
  } else {
    fallbackCopy(text, done);
  }
}

/* ---------------- Scroll progress + back to top ---------------- */
function onScroll(){
  var h = document.documentElement;
  var scrollTop = h.scrollTop || document.body.scrollTop;
  var scrollHeight = (h.scrollHeight || document.body.scrollHeight) - h.clientHeight;
  var pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  var bar = document.getElementById("scrollProgress");
  if(bar) bar.style.width = pct + "%";
  var toTop = document.getElementById("toTop");
  if(toTop){ if(scrollTop > 500) toTop.classList.add("show"); else toTop.classList.remove("show"); }
}
window.addEventListener("scroll", onScroll, { passive:true });

/* ---------------- Reveal on scroll ---------------- */
function setupReveal(){
  var targets = document.querySelectorAll(".reveal");
  if(!("IntersectionObserver" in window)){
    targets.forEach(function(t){ t.classList.add("in-view"); });
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  }, { threshold:0.12 });
  targets.forEach(function(t){ io.observe(t); });
}

/* ---------------- Stat count-up ---------------- */
function setupCountUp(){
  var nums = document.querySelectorAll(".stats .num");
  if(!nums.length) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function animate(el){
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    if(reduce){ el.textContent = target + suffix; return; }
    var start = null, dur = 1100;
    function step(ts){
      if(start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if(!("IntersectionObserver" in window)){
    nums.forEach(animate);
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        animate(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold:0.5 });
  nums.forEach(function(n){ io.observe(n); });
}

/* ---------------- Terminal typewriter ---------------- */
function setupTerminal(){
  var el = document.getElementById("termBody");
  if(!el) return;
  var lines = [
    { p:"$ ", c:"whoami", out:"Anas Wadi — Full Stack & AI Game Creator" },
    { p:"$ ", c:"ls ./skills", out:"react-native  nextjs  flask  groq-ai  unity" },
    { p:"$ ", c:"./status --check", out:"✓ available for new projects" }
  ];
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce){
    el.innerHTML = lines.map(function(l){
      return '<div><span class="term-prompt">'+l.p+'</span>'+l.c+'</div><div class="term-out">'+l.out+'</div>';
    }).join("");
    return;
  }
  var li = 0, ci = 0, phase = "type", built = "";
  function tick(){
    if(li >= lines.length){
      setTimeout(function(){ built=""; li=0; ci=0; phase="type"; el.innerHTML=""; tick(); }, 2200);
      return;
    }
    var cur = lines[li];
    if(phase === "type"){
      el.innerHTML = built + '<div><span class="term-prompt">'+cur.p+'</span>'+cur.c.slice(0,ci)+'<span class="term-cursor"></span></div>';
      if(ci < cur.c.length){ ci++; setTimeout(tick, 42); }
      else { built += '<div><span class="term-prompt">'+cur.p+'</span>'+cur.c+'</div>'; phase="out"; ci=0; setTimeout(tick, 320); }
    } else {
      built += '<div class="term-out">'+cur.out+'</div>';
      el.innerHTML = built;
      li++; phase="type"; ci=0;
      setTimeout(tick, 600);
    }
  }
  tick();
}

/* ---------------- Card cursor spotlight (mouse/trackpad only) ---------------- */
function setupCardSpotlight(){
  var grid = document.getElementById("projectsGrid");
  if(!grid) return;
  var canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if(!canHover) return; // skip entirely on touch — avoids needless work + sticky-hover jank
  var ticking = false, lastEvent = null;
  function apply(){
    ticking = false;
    var e = lastEvent, card = e.target.closest ? e.target.closest(".card") : null;
    if(!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
    card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
  }
  grid.addEventListener("pointermove", function(e){
    lastEvent = e;
    if(!ticking){ ticking = true; requestAnimationFrame(apply); }
  }, { passive:true });
}

/* ---------------- Journey + FAQ (from data/*.json) ---------------- */
function renderJourney(items){
  var sec = document.getElementById("journey");
  var el = document.getElementById("timeline");
  if(!el) return;
  if(!items.length){ if(sec) sec.style.display = "none"; return; }
  el.innerHTML = items.map(function(it){
    var c = safeColor(it.color, "#8B2FFF");
    return '<div class="tl-item">'+
      '<span class="tl-dot" style="background:'+c+'"></span>'+
      '<div class="tl-year" style="color:'+c+'">'+esc(it.year)+'</div>'+
      '<div class="tl-title">'+esc(it.title)+'</div>'+
      '<div class="tl-desc">'+esc(it.desc)+'</div>'+
    '</div>';
  }).join("");
}
function renderFaq(items){
  var sec = document.getElementById("faq");
  var el = document.getElementById("faqList");
  if(!el) return;
  if(!items.length){ if(sec) sec.style.display = "none"; return; }
  el.innerHTML = items.map(function(it){
    return '<div class="faq-item glass" onclick="toggleFaq(this)">'+
      '<div class="faq-q">'+esc(it.q)+' <span class="plus">+</span></div>'+
      '<div class="faq-a"><p>'+esc(it.a)+'</p></div>'+
    '</div>';
  }).join("");
}

/* ---------------- Stats that follow the data ---------------- */
function updateStats(){
  var total = PROJECTS.length;
  var live = PROJECTS.filter(function(p){ return p.status === "live"; }).length;
  var a = document.getElementById("statProjects"), b = document.getElementById("statLive");
  if(a) a.setAttribute("data-count", total);
  if(b) b.setAttribute("data-count", live);
  var all = document.getElementById("filterAllBtn");
  if(all) all.textContent = "الكل (" + total + ")";
}

/* ---------------- Load data + Init ---------------- */
function loadJSON(url){
  return fetch(url).then(function(r){
    if(!r.ok) throw new Error(url + " → " + r.status);
    return r.json();
  });
}
function asArray(v){ return Array.isArray(v) ? v : []; }

document.getElementById("projectsGrid").addEventListener("click", function(e){
  var btn = e.target.closest ? e.target.closest("[data-open]") : null;
  if(btn) openProjectDetail(btn.getAttribute("data-open"));
});

function boot(){
  setupTerminal();
  setupCardSpotlight();
  onScroll();

  Promise.all([
    loadJSON("data/projects.json"),
    loadJSON("data/journey.json").catch(function(){ return []; }),
    loadJSON("data/faq.json").catch(function(){ return []; })
  ]).then(function(res){
    PROJECTS = asArray(res[0]);
    updateStats();
    renderProjects();
    renderJourney(asArray(res[1]));
    renderFaq(asArray(res[2]));
  }).catch(function(err){
    console.error(err);
    document.getElementById("projectsGrid").innerHTML =
      '<p class="desc" style="grid-column:1/-1">تعذّر تحميل المشاريع — حدّث الصفحة وحاول مرة ثانية.</p>';
  }).then(function(){
    setupReveal();
    setupCountUp();
    onScroll();
    if(window.location.hash.indexOf("#project-") === 0){
      var deepId = window.location.hash.replace("#project-", "");
      if(PROJECTS.some(function(p){ return p.id === deepId; })) openProjectDetail(deepId);
    }
  });
}
boot();

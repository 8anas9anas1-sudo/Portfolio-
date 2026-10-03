/* =====================================================================
   لوحة التحكم — Anas Wadi
   - تسجيل دخول بكلمة سر (تتحقق منها /api/login)
   - تعدّل المشاريع / المحطات / الأسئلة محلياً، ثم «حفظ ونشر» يرسلها كلها لـ GitHub في commit واحد
   - Vercel يلتقط الـ commit وينشر الموقع تلقائياً (≈ دقيقة)
   ===================================================================== */
(function () {
  'use strict';

  /* ⚠️ هذه القوائم مكرّرة في server/lib/validate.js — عدّلهما معاً */
  var ICONS = [
    ['store', 'متجر'], ['gamepad', 'ألعاب'], ['book', 'تعليم / كتاب'], ['brain', 'ذكاء اصطناعي'],
    ['traffic', 'طرق / مرور'], ['layout', 'قوالب / تصميم'], ['sparkle', 'نجمة'], ['rocket', 'إطلاق'],
    ['message', 'محادثة'], ['search', 'بحث']
  ];
  var STATUSES = [['live', 'مباشر الآن'], ['developing', 'قيد التطوير'], ['pending', 'جاهز - بانتظار الرابط']];
  var TABS = [
    { key: 'projects', label: 'المشاريع', add: 'إضافة مشروع', one: 'المشروع' },
    { key: 'journey', label: 'محطات الرحلة', add: 'إضافة محطة', one: 'المحطة' },
    { key: 'faq', label: 'الأسئلة الشائعة', add: 'إضافة سؤال', one: 'السؤال' }
  ];
  var KEYS = ['projects', 'journey', 'faq'];
  var LS_TOKEN = 'aw_admin_token', LS_EXP = 'aw_admin_exp';
  var MAX_PAYLOAD = 4.0 * 1024 * 1024; // حد Vercel للطلب ~4.5MB

  var state = {
    token: null, files: null, orig: {}, pending: {}, tab: 'projects',
    editing: null, saving: false, banner: null, repo: '', branch: ''
  };

  var app = document.getElementById('app');
  var modalRoot = document.getElementById('modal');
  var dialogRoot = document.getElementById('dialog');

  /* ---------------- أدوات ---------------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#00E5FF'; }
  function cssUrl(u) {
    return "url('" + u.replace(/['\\()\s]/g, function (ch) { return '%' + ch.charCodeAt(0).toString(16).toUpperCase(); }) + "')";
  }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'err' ? 6000 : 3200);
  }

  function api(method, path, body) {
    var headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    return fetch('/api/' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = t ? JSON.parse(t) : null; } catch (e) { /* ليس JSON */ }
          if (!r.ok) {
            var msg = (j && j.error) || (r.status === 413 ? 'حجم الطلب كبير جداً — صغّر الصور أو احفظ على دفعتين' : 'خطأ ' + r.status);
            var err = new Error(msg);
            err.status = r.status;
            err.payload = j;
            throw err;
          }
          return j;
        });
      });
  }

  /* ---------------- الجلسة ---------------- */
  function saveSession(t, exp) { try { localStorage.setItem(LS_TOKEN, t); localStorage.setItem(LS_EXP, String(exp)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_EXP); } catch (e) {} state.token = null; }
  function loadSession() {
    try {
      var t = localStorage.getItem(LS_TOKEN), exp = parseInt(localStorage.getItem(LS_EXP), 10);
      if (t && exp > Date.now()) return t;
    } catch (e) {}
    return null;
  }

  /* ---------------- الحالة ---------------- */
  function isDirty(k) { return JSON.stringify(state.files[k].data) !== state.orig[k]; }
  function dirtyKeys() { return KEYS.filter(isDirty); }
  function refsOf(projects) {
    var s = {};
    projects.forEach(function (p) { if (p.heroImg) s[p.heroImg] = 1; if (p.logoImg) s[p.logoImg] = 1; });
    return s;
  }
  function imgSrc(path) { return state.pending[path] ? state.pending[path].preview : '/' + path; }

  /* ---------------- شاشة الدخول ---------------- */
  function showLogin(msg) {
    closeModal();
    app.innerHTML =
      '<div class="login">' +
        '<img class="login-logo neon-glow" src="/assets/images/logo.jpg" alt="">' +
        '<div class="eyebrow">ADMIN • لوحة التحكم</div>' +
        '<h1 class="page-title">لوحة <span class="grad">التحكم</span></h1>' +
        '<p class="page-desc">سجّل الدخول لإدارة موقعك</p>' +
        '<div class="panel glass-strong login-card">' +
          '<input type="password" id="pw" class="input" placeholder="كلمة السر" autocomplete="current-password" aria-label="كلمة السر">' +
          '<button class="btn btn-primary btn-block" id="loginBtn">دخول</button>' +
        '</div>' +
        '<div class="err" id="loginErr">' + esc(msg || '') + '</div>' +
      '</div>';
    var pw = $('pw');
    pw.focus();
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('loginBtn').addEventListener('click', doLogin);
  }

  function doLogin() {
    var pw = $('pw').value, btn = $('loginBtn');
    if (!pw) { $('loginErr').textContent = 'اكتب كلمة السر'; return; }
    btn.disabled = true; btn.textContent = 'جارٍ التحقق…'; $('loginErr').textContent = '';
    api('POST', 'login', { password: pw }).then(function (r) {
      state.token = r.token;
      saveSession(r.token, r.expiresAt);
      return loadData();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'دخول';
      $('loginErr').textContent = e.message;
    });
  }

  function logout() {
    if (dirtyKeys().length && !window.confirm('عندك تعديلات غير محفوظة ستضيع. تسجيل الخروج؟')) return;
    clearSession();
    state.files = null;
    showLogin();
  }

  /* ---------------- تحميل البيانات ---------------- */
  function loadData() {
    app.innerHTML = '<div class="login"><p class="page-desc" style="margin:80px auto 0">جارٍ التحميل من GitHub…</p></div>';
    return api('GET', 'data').then(function (r) {
      state.files = r.files;
      state.repo = r.repo; state.branch = r.branch;
      KEYS.forEach(function (k) { state.orig[k] = JSON.stringify(state.files[k].data); });
      state.pending = {};
      state.banner = null;
      renderMain();
    }).catch(function (e) {
      if (e.status === 401) { clearSession(); showLogin(state.files ? 'انتهت الجلسة — سجّل الدخول من جديد' : ''); return; }
      app.innerHTML = '<div class="login"><div class="eyebrow">خطأ</div><h1 class="page-title">تعذّر <span class="grad">التحميل</span></h1><p class="page-desc">' + esc(e.message) +
        '</p><button class="btn btn-primary btn-block" id="retryBtn">إعادة المحاولة</button>' +
        '<button class="btn btn-glass glass-strong btn-block" id="outBtn" style="margin-top:10px">تسجيل الخروج</button></div>';
      $('retryBtn').addEventListener('click', loadData);
      $('outBtn').addEventListener('click', function () { clearSession(); showLogin(); });
    });
  }

  /* ---------------- الواجهة الرئيسية ---------------- */
  function statusBadge(st) {
    var s = (window.STATUS_LABEL && window.STATUS_LABEL[st]) || { text: st, color: '#00E5FF' };
    return '<span class="status-badge" style="background:' + s.color + '18; color:' + s.color + '; border:1px solid ' + s.color + '30;"><span class="status-dot" style="background:' + s.color + '"></span>' + esc(s.text) + '</span>';
  }

  function rowHtml(key, it, i, total) {
    var thumb, title, sub, extra = '';
    if (key === 'projects') {
      var c = safeColor(it.color);
      if (it.logoImg) thumb = '<div class="thumb" style="background:' + c + '18"><img src="' + esc(imgSrc(it.logoImg)) + '" alt=""></div>';
      else if (it.heroImg) thumb = '<div class="thumb" style="background-image:' + esc(cssUrl(imgSrc(it.heroImg))) + '"></div>';
      else thumb = '<div class="thumb" style="background:' + c + '18;color:' + c + '">' + ((window.ICON_SVG && window.ICON_SVG[it.icon]) || '') + '</div>';
      title = it.title; sub = statusBadge(it.status) + '<span class="en">' + esc(it.en || '') + '</span>';
      extra = (it.tech && it.tech.length)
        ? '<div class="tech-row">' + it.tech.slice(0, 4).map(function (t) { return '<span class="tech-pill">' + esc(t) + '</span>'; }).join('') + '</div>'
        : '';
    } else if (key === 'journey') {
      thumb = '<span class="dot-c" style="background:' + safeColor(it.color) + '"></span>';
      title = it.title; sub = '<span class="sub-txt">' + esc(it.year) + '</span>';
    } else {
      thumb = '<span class="dot-c" style="background:var(--blue)"></span>';
      title = it.q; sub = '<span class="sub-txt">' + esc((it.a || '').slice(0, 70)) + '</span>';
    }
    return '<div class="row panel glass" data-i="' + i + '">' +
      '<div class="row-top">' + thumb +
        '<div class="row-main"><div class="row-title">' + esc(title) + '</div><div class="row-sub">' + sub + '</div></div>' +
      '</div>' + extra +
      '<div class="row-actions">' +
        '<button class="btn btn-glass glass-strong btn-sm mv" data-act="up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="للأعلى">▲</button>' +
        '<button class="btn btn-glass glass-strong btn-sm mv" data-act="down" data-i="' + i + '"' + (i === total - 1 ? ' disabled' : '') + ' aria-label="للأسفل">▼</button>' +
        '<button class="btn btn-glass glass-strong btn-sm" data-act="edit" data-i="' + i + '">تعديل</button>' +
        '<button class="btn btn-glass glass-strong btn-sm btn-danger" data-act="del" data-i="' + i + '">حذف</button>' +
      '</div></div>';
  }

  function renderMain() {
    if (!state.files) return;
    var tab = TABS.filter(function (t) { return t.key === state.tab; })[0];
    var items = state.files[state.tab].data;
    var dirty = dirtyKeys();

    var banner = '';
    if (state.banner) {
      banner = '<div class="banner"><div>' + state.banner + '</div><button class="x" data-act="close-banner" aria-label="إغلاق">×</button></div>';
    }

    app.innerHTML =
      '<nav class="topnav glass"><div class="nav-inner">' +
        '<div class="brand"><img class="logo neon-glow" src="/assets/images/logo.jpg" alt=""><span class="name">Anas Wadi</span><span class="badge-admin">لوحة التحكم</span></div>' +
        '<div class="bar-actions">' +
          '<a class="btn btn-glass glass-strong btn-sm" href="/" target="_blank" rel="noopener">عرض الموقع ↗</a>' +
          '<button class="btn btn-glass glass-strong btn-sm" data-act="logout">خروج</button>' +
        '</div>' +
      '</div></nav>' +
      '<div class="page">' +
        '<div class="page-head">' +
          '<div class="eyebrow">ADMIN • لوحة التحكم</div>' +
          '<h1 class="page-title">إدارة <span class="grad">الموقع</span></h1>' +
          '<p class="page-desc">عدّل المشاريع والمحطات والأسئلة، ثم اضغط «حفظ ونشر» ليظهر التغيير في الموقع خلال دقيقة تقريباً.</p>' +
        '</div>' +
        banner +
        '<div class="toolbar"><div class="filter-row tabs" role="tablist">' + TABS.map(function (t) {
          return '<button class="filter-btn tab' + (t.key === state.tab ? ' active' : '') + '" role="tab" data-act="tab" data-k="' + t.key + '">' +
            esc(t.label) + '<span class="n">' + state.files[t.key].data.length + '</span></button>';
        }).join('') + '</div>' +
        '<button class="btn btn-primary btn-block add" data-act="add">＋ ' + esc(tab.add) + '</button></div>' +
        (items.length
          ? '<div class="rows">' + items.map(function (it, i) { return rowHtml(state.tab, it, i, items.length); }).join('') + '</div>'
          : '<div class="empty">لا يوجد شيء هنا بعد. اضغط «' + esc(tab.add) + '» للبدء.</div>') +
      '</div>' +
      (dirty.length
        ? '<div class="savebar glass-strong"><div class="txt">تعديلات غير منشورة<small>لن تظهر في الموقع قبل النشر</small></div>' +
          '<button class="btn btn-glass glass-strong btn-sm" data-act="discard"' + (state.saving ? ' disabled' : '') + '>تراجع</button>' +
          '<button class="btn btn-accent" data-act="save"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? 'جارٍ الحفظ…' : 'حفظ ونشر') + '</button></div>'
        : '');
  }

  app.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    var act = el.getAttribute('data-act');
    var i = parseInt(el.getAttribute('data-i'), 10);
    var list = state.files && state.files[state.tab] ? state.files[state.tab].data : [];
    if (act === 'tab') { state.tab = el.getAttribute('data-k'); renderMain(); window.scrollTo(0, 0); }
    else if (act === 'add') openEditor(state.tab, null);
    else if (act === 'edit') openEditor(state.tab, i);
    else if (act === 'del') askDelete(i);
    else if (act === 'up' && i > 0) { var a = list[i]; list[i] = list[i - 1]; list[i - 1] = a; renderMain(); }
    else if (act === 'down' && i < list.length - 1) { var b = list[i]; list[i] = list[i + 1]; list[i + 1] = b; renderMain(); }
    else if (act === 'save') save();
    else if (act === 'discard') askDiscard();
    else if (act === 'logout') logout();
    else if (act === 'close-banner') { state.banner = null; renderMain(); }
  });

  /* ---------------- حوارات ---------------- */
  function dialog(opts) {
    return new Promise(function (resolve) {
      dialogRoot.innerHTML =
        '<div class="dlg-wrap"><div class="dlg glass-strong" role="alertdialog" aria-modal="true">' +
          '<h3>' + esc(opts.title) + '</h3><p>' + esc(opts.text) + '</p>' +
          '<div class="acts">' +
            (opts.cancel === false ? '' : '<button class="btn btn-glass glass-strong" id="dlgNo">' + esc(opts.cancel || 'إلغاء') + '</button>') +
            '<button class="btn ' + (opts.danger ? 'btn-glass glass-strong btn-danger' : 'btn-primary') + '" id="dlgYes">' + esc(opts.ok || 'حسناً') + '</button>' +
          '</div></div></div>';
      function close(v) { dialogRoot.innerHTML = ''; resolve(v); }
      $('dlgYes').addEventListener('click', function () { close(true); });
      if ($('dlgNo')) $('dlgNo').addEventListener('click', function () { close(false); });
    });
  }

  function askDelete(i) {
    var tab = TABS.filter(function (t) { return t.key === state.tab; })[0];
    var list = state.files[state.tab].data;
    var it = list[i];
    if (!it) return;
    var name = it.title || it.q || '';
    dialog({
      title: 'حذف ' + tab.one + '؟',
      text: '«' + name + '»\nسيُحذف من الموقع بعد الضغط على «حفظ ونشر». يمكنك التراجع قبل الحفظ.',
      ok: 'نعم، احذف', danger: true
    }).then(function (yes) {
      if (!yes) return;
      list.splice(i, 1);
      renderMain();
    });
  }

  function askDiscard() {
    dialog({ title: 'تراجع عن كل التعديلات؟', text: 'ستعود البيانات لآخر نسخة محفوظة.', ok: 'نعم، تراجع', danger: true }).then(function (yes) {
      if (!yes) return;
      KEYS.forEach(function (k) { state.files[k].data = JSON.parse(state.orig[k]); });
      renderMain();
    });
  }

  /* ---------------- محرّر العناصر ---------------- */
  function closeModal() { modalRoot.innerHTML = ''; document.body.classList.remove('modal-open'); state.editing = null; }

  function field(id, label, inner, hint, req) {
    return '<div class="field" id="w_' + id + '"><label class="field-label" for="' + id + '">' + esc(label) + (req ? ' <span class="req">*</span>' : '') + '</label>' +
      inner + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  }
  function input(id, val, extra) {
    var cls = 'input';
    extra = (extra || '').replace(/class="([^"]*)"/, function (_, c) { cls += ' ' + c; return ''; });
    return '<input type="text" id="' + id + '" class="' + cls + '" value="' + esc(val) + '" ' + extra + '>';
  }
  function textarea(id, val, rows) {
    return '<textarea id="' + id + '" class="textarea" rows="' + (rows || 3) + '">' + esc(val) + '</textarea>';
  }
  function optionsHtml(list, sel) {
    return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function colorField(id, val) {
    var c = safeColor(val);
    return '<div class="colorrow"><input type="color" id="' + id + '_pick" value="' + c + '" aria-label="اختيار لون">' +
      '<input type="text" id="' + id + '" class="input ltr" value="' + esc(c) + '" maxlength="7" inputmode="text" autocapitalize="off"></div>';
  }
  function imgBoxHtml(kind, path) {
    if (!path) return 'لا توجد صورة';
    return kind === 'logo' ? '<img src="' + esc(imgSrc(path)) + '" alt="">' : '';
  }
  function imageField(kind, label, hint) {
    var path = state.editing.draft[kind === 'hero' ? 'heroImg' : 'logoImg'];
    var style = kind === 'hero' && path ? ' style="background-image:' + esc(cssUrl(imgSrc(path))) + '"' : '';
    return '<div class="field"><label class="field-label">' + esc(label) + '</label>' +
      '<div class="imgbox' + (kind === 'logo' ? ' logo' : '') + (path ? ' has-img' : '') + '" id="imgbox_' + kind + '"' + style + '>' + imgBoxHtml(kind, path) + '</div>' +
      '<div class="img-actions">' +
        '<button type="button" class="btn btn-glass glass-strong btn-sm" data-act="pick" data-k="' + kind + '">اختيار صورة</button>' +
        '<button type="button" class="btn btn-glass glass-strong btn-sm" data-act="rmimg" data-k="' + kind + '">إزالة</button>' +
        '<input type="file" accept="image/*" hidden id="file_' + kind + '">' +
      '</div><div class="hint">' + hint + '</div></div>';
  }

  function projectForm(d, isNew) {
    return '' +
      field('f_title', 'اسم المشروع', input('f_title', d.title, 'maxlength="80"'), '', true) +
      '<div class="two">' +
        field('f_en', 'الاسم بالإنجليزي', input('f_en', d.en, 'class="ltr" maxlength="100"'), '') +
        field('f_id', 'المعرّف (للرابط)', input('f_id', d.id, 'class="ltr" maxlength="41" autocapitalize="off"' + (isNew ? '' : ' readonly')),
          isNew ? 'حروف إنجليزية صغيرة وأرقام وشرطات. اتركه فارغاً ليُولَّد تلقائياً.' : 'لا يتغير بعد الإنشاء (حتى لا تنكسر الروابط).') +
      '</div>' +
      field('f_tag', 'وصف قصير تحت العنوان', input('f_tag', d.tag, 'maxlength="120"'), 'مثال: متجر إلكتروني • مباشر الآن') +
      '<div class="two">' +
        field('f_status', 'الحالة', '<select id="f_status" class="select">' + optionsHtml(STATUSES, d.status) + '</select>', '') +
        field('f_color_pick', 'لون المشروع', colorField('f_color', d.color), '') +
      '</div>' +
      field('f_icon', 'الأيقونة', '<div class="iconrow"><select id="f_icon" class="select">' + optionsHtml(ICONS, d.icon) + '</select><div class="iconprev" id="iconprev"></div></div>', 'تظهر لو ما رفعت شعاراً خاصاً.') +
      field('f_summary', 'الملخص (يظهر في البطاقة)', textarea('f_summary', d.summary, 3), '') +

      '<div class="sec eyebrow">الصور</div>' +
      imageField('hero', 'صورة الغلاف', 'تُصغَّر تلقائياً وتُحفظ JPEG خفيفة. اختيارية.') +
      imageField('logo', 'شعار المشروع', 'يحافظ على الشفافية (PNG) إن كان الشعار PNG. اختياري — يحلّ محل الأيقونة.') +

      '<div class="sec eyebrow">صفحة المشروع الكاملة</div>' +
      field('f_overview', 'نظرة عامة', textarea('f_overview', d.overview, 5), '') +
      field('f_role', 'دوري التقني بالمشروع', textarea('f_role', d.role, 5), '') +
      field('f_details', 'المميزات الرئيسية', textarea('f_details', (d.details || []).join('\n'), 6), 'كل ميزة في سطر مستقل.') +
      field('f_tech', 'التقنيات المستخدمة', textarea('f_tech', (d.tech || []).join('، '), 2), 'افصل بينها بفاصلة (، أو ,) — مثال: Next.js، Vercel، Tailwind') +

      '<div class="sec eyebrow">الروابط</div>' +
      field('f_link', 'رابط المشروع', input('f_link', d.link || '', 'class="ltr" inputmode="url" placeholder="https://" autocapitalize="off"'), 'اتركه فارغاً لو ما في رابط بعد.') +
      field('f_linkLabel', 'نص الزر', input('f_linkLabel', d.linkLabel || '', 'maxlength="80"'), 'مثال: زيارة الموقع — أو: قريباً (يظهر لو ما في رابط).') +
      field('f_github', 'رابط GitHub', input('f_github', d.github || '', 'class="ltr" inputmode="url" placeholder="https://github.com/…" autocapitalize="off"'), '');
  }

  function journeyForm(d) {
    return field('f_year', 'التسمية الصغيرة', input('f_year', d.year, 'maxlength="40"'), 'مثال: البداية — تطوير مكثّف — الأحدث', true) +
      field('f_title', 'العنوان', input('f_title', d.title, 'maxlength="100"'), '', true) +
      field('f_desc', 'الوصف', textarea('f_desc', d.desc, 5), '') +
      field('f_color_pick', 'اللون', colorField('f_color', d.color), '');
  }
  function faqForm(d) {
    return field('f_q', 'السؤال', input('f_q', d.q, 'maxlength="200"'), '', true) +
      field('f_a', 'الجواب', textarea('f_a', d.a, 6), '', true);
  }

  function defaultDraft(key) {
    if (key === 'projects') {
      var first = state.files.projects.data[0];
      return {
        id: '', title: '', en: '', tag: '', status: 'pending', color: '#00E5FF', icon: 'sparkle', tech: [],
        summary: '', overview: '', role: '', details: [], link: null, linkLabel: '',
        github: first && first.github ? first.github : '', heroImg: null, logoImg: null
      };
    }
    if (key === 'journey') return { color: '#8B2FFF', year: '', title: '', desc: '' };
    return { q: '', a: '' };
  }

  function openEditor(key, index) {
    var isNew = index === null;
    var list = state.files[key].data;
    var draft = isNew ? defaultDraft(key) : clone(list[index]);
    state.editing = { key: key, index: index, draft: draft, isNew: isNew };
    var tab = TABS.filter(function (t) { return t.key === key; })[0];
    var body = key === 'projects' ? projectForm(draft, isNew) : key === 'journey' ? journeyForm(draft) : faqForm(draft);
    modalRoot.innerHTML =
      '<div class="overlay" data-act="close"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true">' +
        '<div class="sheet-head"><h2>' + (isNew ? esc(tab.add) : 'تعديل ' + esc(tab.one)) + '</h2>' +
          '<button class="btn btn-glass glass-strong icon-btn" data-act="close" aria-label="إغلاق">×</button></div>' +
        '<div class="sheet-body" id="sheetBody">' + body + '</div>' +
        '<div class="sheet-foot"><button class="btn btn-primary" data-act="apply">تطبيق</button>' +
          '<button class="btn btn-glass glass-strong" data-act="close">إلغاء</button></div>' +
      '</div>';
    document.body.classList.add('modal-open');
    syncColor();
    syncIcon();
  }

  function syncColor() {
    var pick = $('f_color_pick'), txt = $('f_color');
    if (!pick || !txt) return;
    pick.addEventListener('input', function () { txt.value = pick.value.toUpperCase(); });
    txt.addEventListener('input', function () { if (/^#[0-9a-fA-F]{6}$/.test(txt.value)) pick.value = txt.value; });
  }
  function syncIcon() {
    var sel = $('f_icon'), prev = $('iconprev');
    if (!sel || !prev) return;
    function paint() {
      var c = safeColor(($('f_color') || {}).value);
      prev.style.background = c + '18'; prev.style.color = c;
      prev.innerHTML = (window.ICON_SVG && window.ICON_SVG[sel.value]) || '';
    }
    sel.addEventListener('change', paint);
    if ($('f_color')) $('f_color').addEventListener('input', paint);
    if ($('f_color_pick')) $('f_color_pick').addEventListener('input', paint);
    paint();
  }

  modalRoot.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'close') closeModal();
    else if (act === 'apply') applyEditor();
    else if (act === 'pick') { $('file_' + el.getAttribute('data-k')).click(); }
    else if (act === 'rmimg') {
      var k = el.getAttribute('data-k');
      state.editing.draft[k === 'hero' ? 'heroImg' : 'logoImg'] = null;
      refreshImgBox(k);
    }
  });
  modalRoot.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.type === 'file' && t.files && t.files[0]) {
      var kind = t.id === 'file_logo' ? 'logo' : 'hero';
      handleImage(kind, t.files[0]);
      t.value = '';
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.editing && !dialogRoot.innerHTML) closeModal();
  });

  function refreshImgBox(kind) {
    var box = $('imgbox_' + kind);
    if (!box) return;
    var path = state.editing.draft[kind === 'hero' ? 'heroImg' : 'logoImg'];
    box.innerHTML = imgBoxHtml(kind, path);
    box.classList.toggle('has-img', !!path);
    box.style.backgroundImage = kind === 'hero' && path ? cssUrl(imgSrc(path)) : '';
  }

  /* ---------------- معالجة الصور (تصغير قبل الرفع) ---------------- */
  function processImage(file, kind) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذّر قراءة هذه الصورة — جرّب JPG أو PNG')); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var keepAlpha = kind === 'logo' && /png|webp|gif|svg/i.test(file.type);
        var mime = keepAlpha ? 'image/png' : 'image/jpeg';
        var maxSide = kind === 'logo' ? 512 : 1400;
        var quality = 0.84;
        var tries = 0;

        function attempt() {
          var w = img.naturalWidth, h = img.naturalHeight;
          var s = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
          var c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          var ctx = c.getContext('2d');
          if (!keepAlpha) { ctx.fillStyle = '#0A0620'; ctx.fillRect(0, 0, cw, ch); } // JPEG بلا شفافية → نسطّحها على خلفية الموقع
          ctx.drawImage(img, 0, 0, cw, ch);
          c.toBlob(function (blob) {
            if (!blob) { reject(new Error('تعذّر معالجة الصورة')); return; }
            var limit = keepAlpha ? 1.5 * 1024 * 1024 : 1.2 * 1024 * 1024;
            if (blob.size > limit && tries < 5) {
              tries++;
              if (keepAlpha) maxSide = Math.round(maxSide * 0.75); else { quality = Math.max(0.5, quality - 0.1); maxSide = Math.round(maxSide * 0.88); }
              return attempt();
            }
            var fr = new FileReader();
            fr.onload = function () {
              var dataUrl = String(fr.result);
              resolve({ base64: dataUrl.split(',')[1], preview: dataUrl, ext: keepAlpha ? 'png' : 'jpg', bytes: blob.size });
            };
            fr.onerror = function () { reject(new Error('تعذّر قراءة الصورة')); };
            fr.readAsDataURL(blob);
          }, mime, quality);
        }
        attempt();
      };
      img.src = url;
    });
  }

  function handleImage(kind, file) {
    if (!/^image\//.test(file.type)) { toast('اختر ملف صورة', 'err'); return; }
    var box = $('imgbox_' + kind);
    if (box) { box.textContent = 'جارٍ تجهيز الصورة…'; box.style.backgroundImage = ''; }
    processImage(file, kind).then(function (r) {
      var base = slugify(($('f_id') && $('f_id').value) || state.editing.draft.id || ($('f_en') && $('f_en').value) || '') || 'img';
      base = base.slice(0, 30);
      var rand = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      var path = 'assets/projects/' + base + '-' + kind + '-' + rand + '.' + r.ext;
      state.pending[path] = { base64: r.base64, preview: r.preview, saved: false };
      state.editing.draft[kind === 'hero' ? 'heroImg' : 'logoImg'] = path;
      refreshImgBox(kind);
      toast('تم تجهيز الصورة (' + Math.round(r.bytes / 1024) + ' KB)', 'ok');
    }).catch(function (e) {
      refreshImgBox(kind);
      toast(e.message, 'err');
    });
  }

  /* ---------------- قراءة النموذج + التحقق ---------------- */
  function val(id) { var el = $(id); return el ? el.value.trim() : ''; }
  function markInvalid(id, msg) {
    var w = $('w_' + id) || $('w_' + id.replace('_pick', ''));
    var all = modalRoot.querySelectorAll('.field.invalid');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('invalid');
    if (w) { w.classList.add('invalid'); w.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    toast(msg, 'err');
    return false;
  }
  var URL_RE = /^https?:\/\/[^\s"'<>]+$/i;
  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  function uniqueId(base, usedIds) {
    var id = base || 'project-' + Date.now().toString(36);
    var n = 2, cand = id;
    while (usedIds.indexOf(cand) !== -1) { cand = (id + '-' + n++).slice(0, 41); }
    return cand;
  }

  function readForm() {
    var ed = state.editing, d = ed.draft;
    if (ed.key === 'projects') {
      if (!val('f_title')) return markInvalid('f_title', 'اكتب اسم المشروع');
      var color = val('f_color');
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return markInvalid('f_color_pick', 'اللون غير صحيح — مثال: #00E5FF');
      var link = val('f_link'), gh = val('f_github');
      if (link && !URL_RE.test(link)) return markInvalid('f_link', 'رابط المشروع يجب أن يبدأ بـ https://');
      if (gh && !URL_RE.test(gh)) return markInvalid('f_github', 'رابط GitHub يجب أن يبدأ بـ https://');
      var used = state.files.projects.data.filter(function (_, i) { return i !== ed.index; }).map(function (p) { return p.id; });
      var id = d.id;
      if (ed.isNew) {
        id = slugify(val('f_id')) || slugify(val('f_en'));
        if (val('f_id') && id !== val('f_id')) return markInvalid('f_id', 'المعرّف: حروف إنجليزية صغيرة وأرقام وشرطات فقط');
        if (id && used.indexOf(id) !== -1) return markInvalid('f_id', 'هذا المعرّف مستخدم لمشروع آخر');
        id = uniqueId(id, used);
      }
      d.id = id;
      d.title = val('f_title'); d.en = val('f_en'); d.tag = val('f_tag');
      d.status = val('f_status'); d.color = color; d.icon = val('f_icon');
      d.summary = val('f_summary'); d.overview = val('f_overview'); d.role = val('f_role');
      d.details = val('f_details').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      d.tech = val('f_tech').split(/[,،\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      d.link = link || null; d.linkLabel = val('f_linkLabel'); d.github = gh || null;
      return d;
    }
    if (ed.key === 'journey') {
      if (!val('f_year')) return markInvalid('f_year', 'اكتب التسمية الصغيرة');
      if (!val('f_title')) return markInvalid('f_title', 'اكتب العنوان');
      var c2 = val('f_color');
      if (!/^#[0-9a-fA-F]{6}$/.test(c2)) return markInvalid('f_color_pick', 'اللون غير صحيح — مثال: #8B2FFF');
      return { color: c2, year: val('f_year'), title: val('f_title'), desc: val('f_desc') };
    }
    if (!val('f_q')) return markInvalid('f_q', 'اكتب السؤال');
    if (!val('f_a')) return markInvalid('f_a', 'اكتب الجواب');
    return { q: val('f_q'), a: val('f_a') };
  }

  function applyEditor() {
    var ed = state.editing;
    var item = readForm();
    if (!item) return;
    var list = state.files[ed.key].data;
    if (ed.isNew) list.push(item); else list[ed.index] = item;
    closeModal();
    renderMain();
    if (ed.isNew) window.scrollTo(0, document.body.scrollHeight);
  }

  /* ---------------- الحفظ والنشر ---------------- */
  function buildPayload() {
    var files = {};
    dirtyKeys().forEach(function (k) { files[k] = { baseSha: state.files[k].sha, data: state.files[k].data }; });
    var nowRefs = refsOf(state.files.projects.data);
    var oldRefs = refsOf(JSON.parse(state.orig.projects));
    var uploads = Object.keys(state.pending)
      .filter(function (p) { return nowRefs[p] && !state.pending[p].saved; })
      .map(function (p) { return { path: p, base64: state.pending[p].base64 }; });
    var deletes = Object.keys(oldRefs).filter(function (p) { return !nowRefs[p]; });
    return { files: files, uploads: uploads, deletes: deletes };
  }

  function save() {
    if (state.saving) return;
    var payload = buildPayload();
    if (JSON.stringify(payload).length > MAX_PAYLOAD) {
      dialog({
        title: 'حجم الصور كبير',
        text: 'الصور المرفوعة معاً أكبر من الحد المسموح لطلب واحد (~4MB).\nاحفظ أولاً بصورة أو صورتين، ثم أضف البقية وكرّر الحفظ.',
        ok: 'حسناً', cancel: false
      });
      return;
    }
    state.saving = true;
    renderMain();
    api('POST', 'save', payload).then(function (r) {
      state.saving = false;
      Object.keys(payload.files).forEach(function (k) {
        if (r.shas && r.shas[k]) state.files[k].sha = r.shas[k];
        state.orig[k] = JSON.stringify(state.files[k].data);
      });
      payload.uploads.forEach(function (u) { if (state.pending[u.path]) state.pending[u.path].saved = true; });
      state.banner = r.unchanged
        ? '<b>لا توجد تغييرات فعلية</b> — البيانات مطابقة لما في GitHub.'
        : '<b>✓ تم الحفظ في GitHub.</b> Vercel ينشر الآن، وسيظهر التغيير في الموقع خلال دقيقة تقريباً.' +
          ' <a href="' + esc(r.commitUrl) + '" target="_blank" rel="noopener">عرض الـ commit ↗</a>';
      renderMain();
      window.scrollTo(0, 0);
    }).catch(function (e) {
      state.saving = false;
      renderMain();
      if (e.status === 401) { clearSession(); showLogin('انتهت الجلسة — سجّل الدخول من جديد (تعديلاتك غير المحفوظة ستضيع لو أعدت تحميل الصفحة)'); return; }
      if (e.payload && e.payload.conflict) {
        dialog({
          title: 'تعارض في البيانات',
          text: e.message + '\n\nالضغط على «إعادة التحميل» يجلب آخر نسخة من GitHub ويتجاهل تعديلاتك الحالية.',
          ok: 'إعادة التحميل', cancel: 'ابقَ هنا', danger: true
        }).then(function (yes) { if (yes) loadData(); });
        return;
      }
      dialog({ title: 'تعذّر الحفظ', text: e.message, ok: 'حسناً', cancel: false });
    });
  }

  window.addEventListener('beforeunload', function (e) {
    if (state.files && dirtyKeys().length) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------- البداية ---------------- */
  var t0 = loadSession();
  if (t0) { state.token = t0; loadData(); } else showLogin();
})();

(function () {
  'use strict';

  const state = {
    auth: null, // { email, phone }
    credits: 0,
    stage1: null,
    enrichment: null,
    segments: [],
    chosenSegmentIndex: null,
    deepdive: null,
    deepenCount: 0, // "Làm sâu hơn" capped at 3/lần tạo để đỡ tốn token
    lastFile: null, // { filename, base64 }
    revisionsRemaining: 3,
    activeGenId: null, // genId của file đang xem/sửa ở Bước 4
    generations: [], // lịch sử tất cả file đã tạo (từ /api/auth)
  };

  const els = {
    stages: {
      login: document.getElementById('stage-login'),
      1: document.getElementById('stage-1'),
      2: document.getElementById('stage-2'),
      3: document.getElementById('stage-3'),
      4: document.getElementById('stage-4'),
    },
    stepsBar: document.getElementById('steps-bar'),
    steps: document.querySelectorAll('.step'),
    accountBar: document.getElementById('account-bar'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    resultBanner: document.getElementById('result-banner'),
    formLogin: document.getElementById('form-login'),
    resumeBox: document.getElementById('resume-box'),
    formStage1: document.getElementById('form-stage1'),
    linksList: document.getElementById('links-list'),
    btnAddLink: document.getElementById('btn-add-link'),
    materialFiles: document.getElementById('material-files'),
    segmentCards: document.getElementById('segment-cards'),
    customSegmentNote: document.getElementById('custom-segment-note'),
    btnBackTo1: document.getElementById('btn-back-to-1'),
    btnToStage3: document.getElementById('btn-to-stage3'),
    layer2Summary: document.getElementById('layer2-summary'),
    audienceDemo: document.getElementById('audience-demo'),
    audienceIncome: document.getElementById('audience-income'),
    audienceInterest: document.getElementById('audience-interest'),
    audienceBuysFor: document.getElementById('audience-buysFor'),
    barriersList: document.getElementById('barriers-list'),
    painsList: document.getElementById('pains-list'),
    quotesList: document.getElementById('quotes-list'),
    vpcJobs: document.getElementById('vpc-jobs'),
    vpcGains: document.getElementById('vpc-gains'),
    vpcGainCreators: document.getElementById('vpc-gaincreators'),
    vpcPainRelievers: document.getElementById('vpc-painrelievers'),
    btnAddQuote: document.getElementById('btn-add-quote'),
    btnBackTo2: document.getElementById('btn-back-to-2'),
    btnDeepen: document.getElementById('btn-deepen'),
    btnGenerate: document.getElementById('btn-generate'),
    fileInfo: document.getElementById('file-info'),
    btnDownload: document.getElementById('btn-download'),
    reviseBox: document.getElementById('revise-box'),
    revRemaining: document.getElementById('rev-remaining'),
    feedbackText: document.getElementById('feedback-text'),
    btnRevise: document.getElementById('btn-revise'),
    outOfRevisions: document.getElementById('out-of-revisions'),
    buyMoreLink: document.getElementById('buy-more-link'),
  };

  function showLoading(text) {
    els.loadingText.textContent = text || 'Đang xử lý...';
    els.loadingOverlay.classList.remove('hidden');
  }
  function hideLoading() {
    els.loadingOverlay.classList.add('hidden');
  }
  function showBanner(message, type) {
    els.resultBanner.textContent = message;
    els.resultBanner.className = 'result-banner ' + type;
    setTimeout(() => els.resultBanner.classList.add('hidden'), 8000);
  }

  function goToStage(n) {
    for (const key of Object.keys(els.stages)) {
      els.stages[key].classList.toggle('active', String(key) === String(n));
    }
    const numeric = Number(n);
    els.stepsBar.style.display = Number.isFinite(numeric) && numeric >= 1 ? 'flex' : 'none';
    els.steps.forEach((stepEl) => {
      const step = Number(stepEl.dataset.step);
      stepEl.classList.toggle('current', step === numeric);
      stepEl.classList.toggle('done', step < numeric);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateAccountBar() {
    if (!state.auth) { els.accountBar.style.display = 'none'; return; }
    els.accountBar.style.display = 'block';
    els.accountBar.innerHTML = `Đang đăng nhập: <strong>${escapeHtml(state.auth.email)}</strong> — còn <strong>${state.credits}</strong> lượt tạo file · <a href="/buy.html?kind=topup&email=${encodeURIComponent(state.auth.email)}">mua thêm (99k)</a> · <a href="#" id="btn-logout">đăng xuất</a>`;
    const logout = document.getElementById('btn-logout');
    if (logout) logout.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('bsa_auth');
      location.reload();
    });
  }

  async function postJSON(url, body) {
    const payload = Object.assign({}, body, state.auth ? { email: state.auth.email, phone: state.auth.phone } : {});
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      const err = new Error(data.message || 'Có lỗi xảy ra, vui lòng thử lại.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function handleApiError(err) {
    showBanner(err.message, 'error');
    if (err.status === 401) {
      localStorage.removeItem('bsa_auth');
      setTimeout(() => location.reload(), 1500);
    }
  }

  // ---------------- Login ----------------
  async function doLogin(email, phone, silent) {
    state.auth = { email: email.trim().toLowerCase(), phone: phone.trim() };
    try {
      const data = await postJSON('/api/auth', {});
      state.credits = data.credits;
      localStorage.setItem('bsa_auth', JSON.stringify(state.auth));
      updateAccountBar();

      state.generations = Array.isArray(data.generations) ? data.generations : [];

      if (state.generations.length > 0) {
        renderResumeBox();
        if (silent) return; // stay on login screen showing resume options
      } else if (state.credits > 0) {
        goToStage(1);
      } else {
        showBanner('Tài khoản đã hết lượt tạo file. Mua thêm lượt (99.000đ) để tiếp tục.', 'error');
      }
    } catch (err) {
      state.auth = null;
      if (!silent) showBanner(err.message, 'error');
    }
  }

  els.formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(els.formLogin);
    showLoading('Đang đăng nhập...');
    await doLogin(fd.get('email'), fd.get('phone'), false);
    hideLoading();
  });

  // Auto-login from saved session.
  (async function autoLogin() {
    const saved = localStorage.getItem('bsa_auth');
    if (!saved) return;
    try {
      const { email, phone } = JSON.parse(saved);
      if (email && phone) await doLogin(email, phone, true);
    } catch { /* stay on login */ }
  })();

  // Mỗi lần "Tạo file mới" tạo 1 bản ghi riêng (genId riêng) -- file/lượt sửa
  // cũ không bao giờ bị mất, nên ở đây liệt kê TẤT CẢ các file đã tạo, không
  // chỉ file gần nhất.
  function renderResumeBox() {
    els.resumeBox.classList.remove('hidden');
    const items = state.generations.map((g) => `
      <div class="history-item">
        <p class="hint" style="margin:0 0 8px">
          Thương hiệu <strong>${escapeHtml(g.brandName || '')}</strong>
          — còn ${g.revisionsRemaining}/3 lượt sửa
          — tạo lúc ${new Date(g.createdAt).toLocaleString('vi-VN')}
        </p>
        <button type="button" class="btn-primary btn-resume-item" data-genid="${escapeHtml(g.genId)}">Tải lại file / sửa tiếp</button>
      </div>`).join('');
    els.resumeBox.innerHTML = `
      <fieldset><legend>Các file đã tạo (${state.generations.length})</legend>
      ${items}
      <div class="actions" style="margin-top:14px">
        ${state.credits > 0 ? '<button type="button" class="btn-secondary" id="btn-new-gen">+ Tạo file mới (dùng 1 lượt, các file trên vẫn được giữ)</button>' : '<p class="hint">Hết lượt tạo file mới — <a href="/buy.html?kind=topup">mua thêm (99k)</a>.</p>'}
      </div></fieldset>`;
    els.resumeBox.querySelectorAll('.btn-resume-item').forEach((btn) => {
      btn.addEventListener('click', () => enterStage4FromServer(btn.dataset.genid));
    });
    const newBtn = document.getElementById('btn-new-gen');
    if (newBtn) newBtn.addEventListener('click', () => goToStage(1));
  }

  async function enterStage4FromServer(genId) {
    showLoading('Đang tải lại file của bạn...');
    try {
      const data = await postJSON('/api/auth', { action: 'download', genId });
      state.activeGenId = genId;
      state.lastFile = { filename: data.filename, base64: data.base64 };
      state.revisionsRemaining = data.revisionsRemaining;
      renderStage4();
      goToStage(4);
    } catch (err) {
      handleApiError(err);
    } finally {
      hideLoading();
    }
  }

  // ---------------- Stage 1 + tư liệu ----------------
  els.btnAddLink.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'row link-row';
    row.innerHTML = '<input type="url" class="material-link" placeholder="https://..." /><button type="button" class="remove-btn">×</button>';
    row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
    els.linksList.appendChild(row);
  });

  function readMaterialLinks() {
    return [...document.querySelectorAll('.material-link')]
      .map((i) => i.value.trim())
      .filter(Boolean);
  }

  function readMaterialFiles() {
    const files = [...(els.materialFiles.files || [])].slice(0, 3);
    return Promise.all(files.map((f) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, base64: String(reader.result).split(',')[1] || '' });
      reader.onerror = () => reject(new Error(`Không đọc được file ${f.name}`));
      reader.readAsDataURL(f);
    })));
  }

  function validateStage1(data) {
    const names = [data.products.entry.name, data.products.mid.name, data.products.premium.name];
    const prices = [data.products.entry.price, data.products.mid.price, data.products.premium.price];
    const lower = names.map((n) => n.toLowerCase());
    if (new Set(lower).size < 3) {
      return 'Ba gói sản phẩm đang trùng tên nhau. Hãy đặt tên cụ thể cho từng gói — VD: "Ebook 21 ngày đọc sách hiệu quả" / "Khoá đồng hành 30 ngày" / "Coaching 1:1".';
    }
    if (names.some((n) => n.length < 6)) {
      return 'Tên sản phẩm quá ngắn/chung chung. Hãy viết tên đầy đủ như khách sẽ thấy khi mua — VD: "Ebook 21 ngày đọc sách hiệu quả".';
    }
    if (prices.some((p) => !/\d/.test(p) && !/miễn phí|mien phi|free/i.test(p))) {
      return 'Giá sản phẩm cần có con số cụ thể (VD: "99.000đ") hoặc ghi "Miễn phí".';
    }
    return null;
  }

  function readStage1Form() {
    const fd = new FormData(els.formStage1);
    return {
      brandName: fd.get('brandName').trim(),
      positioning: fd.get('positioning').trim(),
      background: fd.get('background').trim(),
      products: {
        entry: { name: fd.get('entryName').trim(), price: fd.get('entryPrice').trim() },
        mid: { name: fd.get('midName').trim(), price: fd.get('midPrice').trim() },
        premium: { name: fd.get('premiumName').trim(), price: fd.get('premiumPrice').trim() },
      },
      tone: fd.get('tone'),
      hashtag: fd.get('hashtag').trim(),
      industry: fd.get('industry').trim(),
    };
  }

  els.formStage1.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.stage1 = readStage1Form();
    const intakeError = validateStage1(state.stage1);
    if (intakeError) {
      showBanner(intakeError, 'error');
      return;
    }

    try {
      // Enrich from links/files first (optional).
      const links = readMaterialLinks();
      const files = await readMaterialFiles();
      if (links.length > 0 || files.length > 0) {
        showLoading('Đang đọc website/tài liệu của bạn...');
        try {
          const enrichData = await postJSON('/api/enrich', { links, files });
          state.enrichment = enrichData.digest || null;
          if (enrichData.warnings && enrichData.warnings.length) {
            showBanner(`Đã đọc ${enrichData.sourcesRead} nguồn. Bỏ qua: ${enrichData.warnings.join(' | ')}`, 'success');
          }
        } catch (enrichErr) {
          // Enrichment is optional -- warn but keep going.
          showBanner(`Không đọc được tư liệu (${enrichErr.message}) — tiếp tục không có tư liệu.`, 'error');
          state.enrichment = null;
        }
      } else {
        state.enrichment = null;
      }

      showLoading('AI đang đề xuất 3 tệp khách hàng phù hợp...');
      const data = await postJSON('/api/segments', Object.assign({}, state.stage1, { enrichment: state.enrichment }));
      state.segments = data.segments;
      state.chosenSegmentIndex = null;
      renderSegments();
      goToStage(2);
    } catch (err) {
      handleApiError(err);
    } finally {
      hideLoading();
    }
  });

  // ---------------- Stage 2 ----------------
  function renderSegments() {
    els.segmentCards.innerHTML = '';
    state.segments.forEach((seg, i) => {
      const card = document.createElement('div');
      card.className = 'segment-card';
      card.innerHTML = `
        <h3>${escapeHtml(seg.label)}</h3>
        <p><span class="field-label">Đặc điểm:</span> ${escapeHtml(seg.demo)}</p>
        <p><span class="field-label">Vì sao phù hợp:</span> ${escapeHtml(seg.whyFit)}</p>
        <p><span class="field-label">Cạnh tranh:</span> ${escapeHtml(seg.competitionNote)}</p>
      `;
      card.addEventListener('click', () => {
        state.chosenSegmentIndex = i;
        els.customSegmentNote.value = '';
        [...els.segmentCards.children].forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      els.segmentCards.appendChild(card);
    });
  }

  els.customSegmentNote.addEventListener('input', () => {
    if (els.customSegmentNote.value.trim()) {
      state.chosenSegmentIndex = null;
      [...els.segmentCards.children].forEach((c) => c.classList.remove('selected'));
    }
  });

  els.btnBackTo1.addEventListener('click', () => goToStage(1));

  const MAX_DEEPEN = 3;

  els.btnToStage3.addEventListener('click', async () => {
    const customNote = els.customSegmentNote.value.trim();
    if (state.chosenSegmentIndex === null && !customNote) {
      showBanner('Vui lòng chọn 1 tệp khách hàng hoặc mô tả custom mix.', 'error');
      return;
    }
    state.deepenCount = 0; // bắt đầu chuỗi nghiên cứu sâu mới cho tệp khách hàng vừa chọn
    await runDeepdive({ deepen: false });
  });

  async function runDeepdive({ deepen }) {
    if (deepen && state.deepenCount >= MAX_DEEPEN) {
      showBanner(`Đã dùng hết ${MAX_DEEPEN} lượt "Làm sâu hơn" cho tệp khách hàng này (giới hạn để tiết kiệm chi phí AI). Hãy chỉnh tay trực tiếp trong các ô bên dưới, hoặc quay lại chọn tệp khách hàng khác.`, 'error');
      return;
    }
    showLoading(deepen ? 'AI đang đào sâu thêm 8 lăng kính...' : 'AI đang nghiên cứu sâu 8 lăng kính về khách hàng...');
    const customNote = els.customSegmentNote.value.trim();
    const body = Object.assign({}, state.stage1, {
      enrichment: state.enrichment,
      segment: state.chosenSegmentIndex !== null ? state.segments[state.chosenSegmentIndex] : null,
      customSegmentNote: customNote || null,
      deepen: !!deepen,
      previousResult: deepen ? state.deepdive : null,
    });
    try {
      const data = await postJSON('/api/deepdive', body);
      state.deepdive = data.result;
      if (deepen) state.deepenCount += 1;
      renderReview();
      goToStage(3);
    } catch (err) {
      handleApiError(err);
    } finally {
      hideLoading();
    }
  }

  // ---------------- Stage 3 ----------------
  function renderReview() {
    const d = state.deepdive;
    els.layer2Summary.textContent = d.layer2Summary || '';
    els.audienceDemo.value = d.audience.demo || '';
    els.audienceIncome.value = d.audience.income || '';
    els.audienceInterest.value = d.audience.interest || '';
    els.audienceBuysFor.value = d.audience.buysFor || '';

    renderEditableList(els.barriersList, d.barriers, { removable: false, minItems: 4 });
    renderEditableList(els.painsList, d.pains, { removable: false, minItems: 3 });
    renderEditableList(els.quotesList, d.quotes, { removable: true, minItems: 5 });

    const vpc = d.vpc || { customerJobs: [], gains: [], gainCreators: [], painRelievers: [] };
    renderEditableList(els.vpcJobs, vpc.customerJobs, { removable: true, minItems: 2 });
    renderEditableList(els.vpcGains, vpc.gains, { removable: true, minItems: 2 });
    renderEditableList(els.vpcGainCreators, vpc.gainCreators, { removable: true, minItems: 2 });
    renderEditableList(els.vpcPainRelievers, vpc.painRelievers, { removable: true, minItems: 2 });

    updateDeepenButton();
  }

  function updateDeepenButton() {
    const left = Math.max(0, MAX_DEEPEN - state.deepenCount);
    els.btnDeepen.textContent = left > 0 ? `Làm sâu hơn (còn ${left}/${MAX_DEEPEN} lượt)` : 'Đã hết lượt làm sâu hơn';
    els.btnDeepen.disabled = left <= 0;
  }

  function renderEditableList(container, items, opts) {
    container.innerHTML = '';
    items.forEach((text) => addRow(container, text, opts));
  }

  function addRow(container, text, opts) {
    const row = document.createElement('div');
    row.className = 'row';
    const textarea = document.createElement('textarea');
    textarea.value = text || '';
    row.appendChild(textarea);
    if (opts.removable) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        if (container.children.length > opts.minItems) row.remove();
        else showBanner(`Cần giữ tối thiểu ${opts.minItems} mục.`, 'error');
      });
      row.appendChild(removeBtn);
    }
    container.appendChild(row);
  }

  els.btnAddQuote.addEventListener('click', () => {
    if (els.quotesList.children.length >= 10) {
      showBanner('Tối đa 10 câu quote.', 'error');
      return;
    }
    addRow(els.quotesList, '', { removable: true, minItems: 5 });
  });

  els.btnBackTo2.addEventListener('click', () => goToStage(2));
  els.btnDeepen.addEventListener('click', () => runDeepdive({ deepen: true }));

  function collectReviewData() {
    return {
      audience: {
        demo: els.audienceDemo.value.trim(),
        income: els.audienceIncome.value.trim(),
        interest: els.audienceInterest.value.trim(),
        buysFor: els.audienceBuysFor.value.trim(),
      },
      barriers: [...els.barriersList.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
      pains: [...els.painsList.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
      quotes: [...els.quotesList.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
      vpc: {
        customerJobs: [...els.vpcJobs.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
        gains: [...els.vpcGains.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
        gainCreators: [...els.vpcGainCreators.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
        painRelievers: [...els.vpcPainRelievers.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
      },
    };
  }

  els.btnGenerate.addEventListener('click', async () => {
    const reviewData = collectReviewData();
    if (reviewData.barriers.length !== 4) { showBanner('Cần đúng 4 rào cản.', 'error'); return; }
    if (reviewData.pains.length !== 3) { showBanner('Cần đúng 3 nỗi đau.', 'error'); return; }
    if (reviewData.quotes.length < 5 || reviewData.quotes.length > 10) { showBanner('Cần từ 5 đến 10 câu quote.', 'error'); return; }
    for (const [key, label] of [['customerJobs', 'Việc khách cần làm'], ['gains', 'Lợi ích mong muốn'], ['gainCreators', 'Gain Creators'], ['painRelievers', 'Pain Relievers']]) {
      if (reviewData.vpc[key].length < 2) { showBanner(`Khung Giải Pháp Giá Trị: mục "${label}" cần ít nhất 2 dòng.`, 'error'); return; }
    }

    const intake = Object.assign({}, state.stage1, reviewData, { enrichment: state.enrichment });

    showLoading('Đang viết 80 chủ đề riêng cho thương hiệu của bạn (khoảng 2-3 phút, đừng đóng trang)...');
    try {
      const data = await postJSON('/api/generate', intake);
      state.activeGenId = data.genId;
      state.lastFile = { filename: data.filename, base64: data.base64 };
      state.revisionsRemaining = data.revisionsRemaining;
      state.credits = data.creditsRemaining;
      updateAccountBar();
      downloadBase64(data.base64, data.filename);
      renderStage4();
      goToStage(4);
      showBanner('Đã tạo file thành công! File đang được tải xuống.', 'success');
    } catch (err) {
      handleApiError(err);
    } finally {
      hideLoading();
    }
  });

  // ---------------- Stage 4: download + revise ----------------
  function renderStage4() {
    els.fileInfo.textContent = `${state.lastFile ? state.lastFile.filename : ''} — 80 chủ đề, kèm kịch bản + caption từng chủ đề.`;
    els.revRemaining.textContent = String(state.revisionsRemaining);
    const out = state.revisionsRemaining <= 0;
    els.reviseBox.classList.toggle('hidden', out);
    els.outOfRevisions.classList.toggle('hidden', !out);
    if (state.auth) els.buyMoreLink.href = `/buy.html?kind=topup&email=${encodeURIComponent(state.auth.email)}`;
  }

  els.btnDownload.addEventListener('click', () => {
    if (state.lastFile) downloadBase64(state.lastFile.base64, state.lastFile.filename);
  });

  els.btnRevise.addEventListener('click', async () => {
    const scope = [...document.querySelectorAll('.scope-item input:checked')].map((c) => c.value);
    const feedback = els.feedbackText.value.trim();
    if (scope.length === 0) { showBanner('Tick ít nhất 1 phần cần sửa.', 'error'); return; }
    if (feedback.length < 20) { showBanner('Góp ý quá ngắn — hãy mô tả cụ thể theo hướng dẫn phía trên.', 'error'); return; }

    showLoading('AI đang sửa đúng phần bạn góp ý (khoảng 1-2 phút)...');
    try {
      const data = await postJSON('/api/revise', { scope, feedback, genId: state.activeGenId });
      state.lastFile = { filename: data.filename, base64: data.base64 };
      state.revisionsRemaining = data.revisionsRemaining;
      downloadBase64(data.base64, data.filename);
      els.feedbackText.value = '';
      document.querySelectorAll('.scope-item input:checked').forEach((c) => { c.checked = false; });
      renderStage4();
      showBanner(`Đã sửa xong (${data.revisedParts.join(', ')}). Còn ${data.revisionsRemaining}/3 lượt sửa. File mới đang tải xuống.`, 'success');
    } catch (err) {
      handleApiError(err);
    } finally {
      hideLoading();
    }
  });

  // ---------------- Utils ----------------
  function downloadBase64(base64, filename) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
})();

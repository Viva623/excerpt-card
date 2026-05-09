// ============================================================
//  Excerpt Card Maker – SillyTavern Extension  (index.js)
// ============================================================

const ECM_MODULE = 'excerpt_card_maker';

// ── State ─────────────────────────────────────────────────────
const ecmState = {
    theme: 'light',
    font: 'font-serif',
    fontBold: false,
    textAlign: 'left',
    photoMode: false,
    photoDataUrl: '',
    photoImage: null,
    photoOverlay: 'blue',
    photoRatio: 'portrait',
    resultUrl: '',
    resultBlob: null,
    resultDataUrl: '',
};

// ── Settings ──────────────────────────────────────────────────
function getEcmSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[ECM_MODULE]) {
        context.extensionSettings[ECM_MODULE] = {};
    }
    return context.extensionSettings[ECM_MODULE];
}

function saveEcmState() {
    const settings = getEcmSettings();
    const overlay = document.querySelector('.ecm-overlay');
    if (!overlay) return;

    settings.theme = ecmState.theme;
    settings.font = ecmState.font;
    settings.fontBold = ecmState.fontBold;
    settings.textAlign = ecmState.textAlign;
    settings.photoMode = ecmState.photoMode;
    settings.photoOverlay = ecmState.photoOverlay;
    settings.photoRatio = ecmState.photoRatio;
    settings.excerpt = overlay.querySelector('#ecm-excerpt')?.value || '';
    settings.title = overlay.querySelector('#ecm-title')?.value || '';
    settings.publisher = overlay.querySelector('#ecm-publisher')?.value || '';
    settings.replacements = getEcmReplaceRows(overlay);

    SillyTavern.getContext().saveSettingsDebounced();
}

function loadEcmState() {
    const settings = getEcmSettings();
    if (settings.theme) ecmState.theme = settings.theme;
    if (settings.font) ecmState.font = settings.font;
    ecmState.fontBold = Boolean(settings.fontBold);
    ecmState.textAlign = settings.textAlign || 'left';
    ecmState.photoMode = Boolean(settings.photoMode);
    ecmState.photoOverlay = settings.photoOverlay || 'blue';
    ecmState.photoRatio = settings.photoRatio || 'portrait';
    return settings;
}

// ── Helpers ───────────────────────────────────────────────────
function ecmEscape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function ecmEscapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ecmNormalize(str) {
    return String(str).replace(/\.{2,}/g, '...');
}

function ecmFormatHtml(str) {
    return ecmEscape(str).replace(/\.\.\./g, '<span class="ecm-raised-dots">...</span>');
}

function ecmApplyReplace(str, overlay) {
    let result = str;
    overlay.querySelectorAll('.ecm-replace-row').forEach(row => {
        const from = row.querySelector('.ecm-replace-from')?.value.trim();
        const to = row.querySelector('.ecm-replace-to')?.value.trim();
        if (!from || !to) return;
        result = result.replace(new RegExp(ecmEscapeRegExp(from), 'g'), to);
    });
    return result;
}

function getEcmReplaceRows(overlay) {
    return Array.from(overlay.querySelectorAll('.ecm-replace-row')).map(row => ({
        from: row.querySelector('.ecm-replace-from')?.value || '',
        to: row.querySelector('.ecm-replace-to')?.value || '',
    }));
}

function ecmGetCanvasFont(sizePx) {
    const w = ecmState.fontBold ? '700 ' : '';
    if (ecmState.font === 'font-serif') return `${w}${sizePx}px "Noto Serif KR", Batang, serif`;
    if (ecmState.font === 'font-gowun') return `${w}${sizePx}px "Gowun Dodum", sans-serif`;
    return `${w}${sizePx}px "Noto Sans KR", sans-serif`;
}

// ── Text Measurement ──────────────────────────────────────────
function ecmWrapLine(ctx, text, maxWidth) {
    const tokens = String(text).match(/\.{3}|[\s\S]/g) || [];
    const lines = [];
    let line = '';
    tokens.forEach(token => {
        const test = line + token;
        if (line && ctx.measureText(test).width > maxWidth) {
            lines.push(line);
            line = token.trimStart();
        } else {
            line = test;
        }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

function ecmWrapText(ctx, text, maxWidth) {
    return String(text).split('\n').flatMap(line => ecmWrapLine(ctx, line, maxWidth));
}

function ecmDrawTextLine(ctx, text, x, y, sizePx) {
    const baseFont = ecmGetCanvasFont(sizePx);
    let cursor = x;
    const chars = Array.from(String(text));
    for (let i = 0; i < chars.length; i++) {
        const isDots = chars[i] === '.' && chars[i + 1] === '.' && chars[i + 2] === '.';
        const chunk = isDots ? '...' : chars[i];
        ctx.font = baseFont;
        ctx.fillText(chunk, cursor, isDots ? y - Math.max(2, sizePx * 0.12) : y);
        cursor += ctx.measureText(chunk).width;
        if (isDots) i += 2;
    }
    ctx.font = baseFont;
}

// ── Canvas에서 정렬된 텍스트 그리기 ──────────────────────────
function ecmDrawAlignedLine(ctx, text, left, right, y, sizePx) {
    const align = ecmState.textAlign;

    if (align === 'center') {
        const mid = (left + right) / 2;
        const lineWidth = ctx.measureText(text).width;
        ecmDrawTextLine(ctx, text, mid - lineWidth / 2, y, sizePx);
    } else if (align === 'justify') {
        // 양쪽맞춤: 글자 사이 간격을 균등 배분
        const chars = Array.from(String(text));
        if (chars.length <= 1) {
            ecmDrawTextLine(ctx, text, left, y, sizePx);
            return;
        }
        const totalWidth = right - left;
        const textWidth = ctx.measureText(text).width;
        const extraSpace = totalWidth - textWidth;
        const gapCount = chars.length - 1;
        const extraPerGap = gapCount > 0 ? extraSpace / gapCount : 0;

        const baseFont = ecmGetCanvasFont(sizePx);
        let cursor = left;
        for (let i = 0; i < chars.length; i++) {
            const isDots = chars[i] === '.' && chars[i + 1] === '.' && chars[i + 2] === '.';
            const chunk = isDots ? '...' : chars[i];
            ctx.font = baseFont;
            ctx.fillText(chunk, cursor, isDots ? y - Math.max(2, sizePx * 0.12) : y);
            cursor += ctx.measureText(chunk).width + extraPerGap;
            if (isDots) i += 2;
        }
        ctx.font = baseFont;
    } else {
        // left (기본)
        ecmDrawTextLine(ctx, text, left, y, sizePx);
    }
}

function ecmGetTextSize(excerpt) {
    const lineBreaks = (excerpt.match(/\n/g) || []).length;
    const len = excerpt.length + lineBreaks * 18;
    if (len >= 420) return { size: 30, lineHeight: 48 };
    if (len >= 260) return { size: 33, lineHeight: 55 };
    if (len >= 165) return { size: 35, lineHeight: 63 };
    if (len >= 90) return { size: 38, lineHeight: 72 };
    return { size: 41, lineHeight: 82 };
}

function ecmGetPreviewSizeClass(excerpt) {
    const lineBreaks = (excerpt.match(/\n/g) || []).length;
    const len = excerpt.length + lineBreaks * 18;
    if (len >= 420) return 'ecm-text-xxs';
    if (len >= 260) return 'ecm-text-xs';
    if (len >= 165) return 'ecm-text-s';
    if (len >= 90) return 'ecm-text-m';
    return 'ecm-text-l';
}

// ── Theme Paint ───────────────────────────────────────────────
function ecmGetThemePaint(ctx) {
    const themes = {
        light: { fill: '#fffaf2', color: '#4a423a', titleAlpha: 0.62 },
        dark: { fill: '#eef0f4', color: '#48505c', titleAlpha: 0.62 },
        mint: { gradient: ['#effaf5', '#d9f1e8'], color: '#3f6156', titleAlpha: 0.58 },
        lavender: { gradient: ['#fbf7ff', '#ece4fa'], color: '#5c5170', titleAlpha: 0.58 },
        peach: { gradient: ['#fff7f1', '#f8ded2'], color: '#735248', titleAlpha: 0.58 },
        ink: { gradient: ['#f3f8ff', '#dceafd'], color: '#495d78', titleAlpha: 0.58 },
    };
    const t = themes[ecmState.theme] || themes.light;
    if (!t.gradient) return { paint: t.fill, ...t };
    const g = ctx.createLinearGradient(0, 0, 1024, 1024);
    g.addColorStop(0, t.gradient[0]);
    g.addColorStop(1, t.gradient[1]);
    return { paint: g, ...t };
}

// ── Photo Helpers ─────────────────────────────────────────────
function ecmDrawCover(ctx, img, w, h) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function ecmRoundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
}

function ecmGetPhotoOverlay(ctx, w, h) {
    const opts = {
        blue: 'rgba(56, 83, 105, 0.74)',
        smoke: 'rgba(35, 38, 42, 0.62)',
        milk: 'rgba(245, 240, 232, 0.72)',
    };
    const fill = opts[ecmState.photoOverlay] || opts.blue;
    const dim = ctx.createLinearGradient(0, 0, 0, h);
    dim.addColorStop(0, 'rgba(0,0,0,0.20)');
    dim.addColorStop(0.55, 'rgba(0,0,0,0.05)');
    dim.addColorStop(1, 'rgba(0,0,0,0.25)');
    return { fill, dim, text: ecmState.photoOverlay === 'milk' ? '#26323b' : '#f4f7fb' };
}

function ecmGetPhotoTextStyle(ctx, excerpt, boxW, boxH, pad) {
    const maxW = boxW - pad * 2;
    const maxH = boxH - pad * 2;
    const sizes = ecmState.photoRatio === 'square'
        ? [{ size: 28, lh: 49 }, { size: 25, lh: 43 }, { size: 22, lh: 38 }, { size: 19, lh: 33 }]
        : [{ size: 36, lh: 66 }, { size: 32, lh: 58 }, { size: 28, lh: 50 }, { size: 24, lh: 43 }];

    for (const s of sizes) {
        ctx.font = ecmGetCanvasFont(s.size);
        const lines = ecmWrapText(ctx, excerpt, maxW);
        if (lines.length * s.lh <= maxH) return { size: s.size, lineHeight: s.lh, lines };
    }
    const fb = sizes[sizes.length - 1];
    ctx.font = ecmGetCanvasFont(fb.size);
    const maxLines = Math.max(1, Math.floor(maxH / fb.lh));
    return { size: fb.size, lineHeight: fb.lh, lines: ecmWrapText(ctx, excerpt, maxW).slice(0, maxLines) };
}

// ── Canvas Render (Normal Card) ───────────────────────────────
function ecmRenderCard(excerpt, title, publisher) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const theme = ecmGetThemePaint(ctx);
    ctx.fillStyle = theme.paint;
    ctx.fillRect(0, 0, 1024, 1024);

    const ts = ecmGetTextSize(excerpt);
    ctx.font = ecmGetCanvasFont(ts.size);
    ctx.fillStyle = theme.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const padLeft = 72;
    const padRight = 952; // 1024 - 72
    const maxWidth = padRight - padLeft;
    const lines = ecmWrapText(ctx, excerpt, maxWidth);
    const textH = lines.length * ts.lineHeight;
    let y = 72 + ((845 - 72) - textH) / 2;
    y = Math.max(72, y);

    lines.forEach((line, i) => {
        // 마지막 줄은 양쪽맞춤에서도 왼쪽정렬
        const isLast = i === lines.length - 1;
        if (ecmState.textAlign === 'justify' && !isLast) {
            ecmDrawAlignedLine(ctx, line, padLeft, padRight, y, ts.size);
        } else if (ecmState.textAlign === 'center') {
            ecmDrawAlignedLine(ctx, line, padLeft, padRight, y, ts.size);
        } else {
            ecmDrawTextLine(ctx, line, padLeft, y, ts.size);
        }
        y += ts.lineHeight;
    });

    ctx.save();
    ctx.globalAlpha = theme.titleAlpha;
    ctx.font = ecmGetCanvasFont(24);
    ctx.fillStyle = theme.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, 72, 935);
    ctx.restore();

    ctx.font = ecmGetCanvasFont(28);
    ctx.fillStyle = theme.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(publisher, 512, 935);

    return canvas;
}

// ── Canvas Render (Photo Card) ────────────────────────────────
function ecmRenderPhotoCard(excerpt, title, publisher) {
    const sq = ecmState.photoRatio === 'square';
    const canvas = document.createElement('canvas');
    canvas.width = sq ? 1024 : 1080;
    canvas.height = sq ? 1024 : 1920;
    const ctx = canvas.getContext('2d');

    const paint = ecmGetPhotoOverlay(ctx, canvas.width, canvas.height);

    if (ecmState.photoImage) {
        ecmDrawCover(ctx, ecmState.photoImage, canvas.width, canvas.height);
    } else {
        const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        g.addColorStop(0, '#d8d3cc');
        g.addColorStop(1, '#718699');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = paint.dim;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bx = sq ? 58 : 64;
    const bw = canvas.width - bx * 2;
    const bh = sq ? bw : 1240;
    const by = sq ? 82 : 260;
    ecmRoundRect(ctx, bx, by, bw, bh, sq ? 24 : 30);
    ctx.fillStyle = paint.fill;
    ctx.fill();

    const pad = sq ? 34 : 42;
    const ts = ecmGetPhotoTextStyle(ctx, excerpt, bw, bh, pad);
    const textH = ts.lines.length * ts.lineHeight;
    ctx.fillStyle = paint.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const textLeft = bx + pad;
    const textRight = bx + bw - pad;
    let y = by + Math.max(pad, (bh - textH) / 2);

    ts.lines.forEach((line, i) => {
        const isLast = i === ts.lines.length - 1;
        if (ecmState.textAlign === 'justify' && !isLast) {
            ecmDrawAlignedLine(ctx, line, textLeft, textRight, y, ts.size);
        } else if (ecmState.textAlign === 'center') {
            ecmDrawAlignedLine(ctx, line, textLeft, textRight, y, ts.size);
        } else {
            ecmDrawTextLine(ctx, line, textLeft, y, ts.size);
        }
        y += ts.lineHeight;
    });

    const footerY = Math.min(canvas.height - (sq ? 70 : 142), by + bh + (sq ? 42 : 72));
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = paint.text;
    ctx.font = ecmGetCanvasFont(sq ? 22 : 28);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, sq ? 64 : 72, footerY);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = paint.text;
    ctx.font = `700 ${sq ? 24 : 32}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(publisher, canvas.width / 2, footerY);
    ctx.restore();

    return canvas;
}

// ── Update Preview ────────────────────────────────────────────
function ecmUpdateCard(overlay) {
    const rawExcerpt = overlay.querySelector('#ecm-excerpt')?.value || '여기에 발췌 내용이 예쁘게 담길 거야.';
    const excerpt = ecmNormalize(ecmApplyReplace(rawExcerpt, overlay));
    const title = overlay.querySelector('#ecm-title')?.value.trim() || '짧은 로그 (완결)';
    const publisher = overlay.querySelector('#ecm-publisher')?.value.trim() || 'AI채팅먀달글';
    const preview = overlay.querySelector('.ecm-card-preview');
    if (!preview) return;

    const alignClass = `ecm-align-${ecmState.textAlign}`;

    if (ecmState.photoMode) {
        const bg = ecmState.photoDataUrl
            ? `style="background-image:url('${ecmState.photoDataUrl.replace(/'/g, '%27')}')"` : '';
        preview.innerHTML = `
            <div class="ecm-photo-card ${alignClass} ecm-font-${ecmState.font.replace('font-', '')} ${ecmState.fontBold ? 'ecm-font-bold' : ''} ecm-ratio-${ecmState.photoRatio} ecm-overlay-${ecmState.photoOverlay}" ${bg}>
                <div class="ecm-photo-dim"></div>
                <div class="ecm-photo-stack">
                    <div class="ecm-photo-glass">
                        <p class="ecm-photo-text">${ecmFormatHtml(excerpt)}</p>
                    </div>
                    <div class="ecm-photo-footer">
                        <span class="ecm-photo-title">${ecmEscape(title)}</span>
                        <span class="ecm-photo-publisher">${ecmEscape(publisher)}</span>
                    </div>
                </div>
            </div>`;
        return;
    }

    const sizeClass = ecmGetPreviewSizeClass(excerpt);
    preview.innerHTML = `
        <div class="ecm-excerpt-card ${alignClass} ecm-card-${ecmState.theme} ecm-font-${ecmState.font.replace('font-', '')} ${ecmState.fontBold ? 'ecm-font-bold' : ''}">
            <div class="ecm-text-wrapper">
                <p class="ecm-excerpt-text ${sizeClass}">${ecmFormatHtml(excerpt)}</p>
            </div>
            <div class="ecm-card-footer">
                <span class="ecm-book-title">${ecmEscape(title)}</span>
                <span class="ecm-publisher">${ecmEscape(publisher)}</span>
            </div>
        </div>`;
}

function ecmUpdateCount(overlay) {
    const count = overlay.querySelector('#ecm-excerpt')?.value.length || 0;
    const el = overlay.querySelector('#ecm-char-count');
    if (el) el.textContent = String(count);
}

// ── Generate Image ────────────────────────────────────────────
async function ecmGenerate(overlay) {
    const btn = overlay.querySelector('.ecm-save-btn');
    if (!btn) return;

    btn.classList.add('ecm-loading');
    btn.textContent = '카드 깎는 중...';

    try {
        if (document.fonts?.ready) await document.fonts.ready;

        const rawExcerpt = overlay.querySelector('#ecm-excerpt')?.value || '여기에 발췌 내용이 예쁘게 담길 거야.';
        const excerpt = ecmNormalize(ecmApplyReplace(rawExcerpt, overlay));
        const title = overlay.querySelector('#ecm-title')?.value.trim() || '짧은 로그 (완결)';
        const publisher = overlay.querySelector('#ecm-publisher')?.value.trim() || 'AI채팅먀달글';

        const canvas = ecmState.photoMode
            ? ecmRenderPhotoCard(excerpt, title, publisher)
            : ecmRenderCard(excerpt, title, publisher);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('이미지 변환 실패');

        if (ecmState.resultUrl) URL.revokeObjectURL(ecmState.resultUrl);
        ecmState.resultBlob = blob;
        ecmState.resultUrl = URL.createObjectURL(blob);
        ecmState.resultDataUrl = canvas.toDataURL('image/png');

        const resultOverlay = overlay.querySelector('.ecm-result-overlay');
        const resultImg = overlay.querySelector('.ecm-result-img');
        if (resultImg) resultImg.src = ecmState.resultDataUrl;
        if (resultOverlay) resultOverlay.classList.add('ecm-show');
    } catch (err) {
        console.log(`[Excerpt Card] Error: ${err.message}`);
        alert(`이미지 생성 오류: ${err.message}`);
    } finally {
        btn.classList.remove('ecm-loading');
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 이미지로 만들기`;
    }
}

// ── Build Popup HTML ──────────────────────────────────────────
function ecmBuildPopupHtml() {
    return `
    <div class="ecm-popup-header">
        <div>
            <h2>발췌 카드 만들기</h2>
            <div class="ecm-sub">AI채팅먀달글 · 사진 배경 토글판</div>
        </div>
        <button class="ecm-close-btn" type="button">닫기</button>
    </div>
    <div class="ecm-popup-content">

        <!-- Theme -->
        <div class="ecm-section">
            <div class="ecm-section-label">배경 테마</div>
            <div class="ecm-grid">
                <button class="ecm-opt-btn active" type="button" data-ecm-theme="light">
                    <div class="ecm-opt-preview light">흰</div>
                    <span class="ecm-opt-name">심플 라이트</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-theme="dark">
                    <div class="ecm-opt-preview dark">회</div>
                    <span class="ecm-opt-name">밀크 그레이</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-theme="mint">
                    <div class="ecm-opt-preview mint">민트</div>
                    <span class="ecm-opt-name">밀크 민트</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-theme="lavender">
                    <div class="ecm-opt-preview lavender">라벤더</div>
                    <span class="ecm-opt-name">문라이트 라벤더</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-theme="peach">
                    <div class="ecm-opt-preview peach">피치</div>
                    <span class="ecm-opt-name">웜 피치</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-theme="ink">
                    <div class="ecm-opt-preview ink">블루</div>
                    <span class="ecm-opt-name">베이비 블루</span>
                </button>
            </div>
        </div>

        <!-- Photo Mode -->
        <div class="ecm-section">
            <div class="ecm-section-label">사진 배경</div>
            <div class="ecm-toggle-row">
                <div>
                    <strong>사진 배경 모드</strong>
                    <span>켜면 사진 배경 카드로 저장돼.</span>
                </div>
                <label class="ecm-switch">
                    <input id="ecm-photo-mode" type="checkbox" />
                    <span class="ecm-slider"></span>
                </label>
            </div>
            <div class="ecm-photo-options" id="ecm-photo-options">
                <div class="ecm-input-wrap">
                    <label>배경 사진</label>
                    <input class="ecm-file-input" id="ecm-photo-input" type="file" accept="image/*" />
                </div>
                <div class="ecm-select-row">
                    <div class="ecm-input-wrap">
                        <label>글상자 톤</label>
                        <select id="ecm-photo-overlay">
                            <option value="blue">블루 글래스</option>
                            <option value="smoke">스모크</option>
                            <option value="milk">밀크 베일</option>
                        </select>
                    </div>
                    <button class="ecm-replace-remove" type="button" id="ecm-clear-photo">-</button>
                </div>
                <div class="ecm-input-wrap">
                    <label>사진 카드 비율</label>
                    <select id="ecm-photo-ratio">
                        <option value="portrait">세로형 9:16</option>
                        <option value="square">정방형 1:1</option>
                    </select>
                </div>
                <p class="ecm-hint">사진은 기기에서만 읽고 저장하지 않아.</p>
            </div>
        </div>

        <!-- Font -->
        <div class="ecm-section">
            <div class="ecm-section-label">폰트 선택</div>
            <div class="ecm-grid">
                <button class="ecm-opt-btn active" type="button" data-ecm-font="font-serif">
                    <div class="ecm-opt-preview font-serif">가</div>
                    <span class="ecm-opt-name">명조</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-font="font-sans">
                    <div class="ecm-opt-preview font-sans">가</div>
                    <span class="ecm-opt-name">고딕</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-font="font-gowun">
                    <div class="ecm-opt-preview font-gowun">가</div>
                    <span class="ecm-opt-name">고운돋움</span>
                </button>
            </div>
            <div class="ecm-font-style-row">
                <label class="ecm-mini-check">
                    <input id="ecm-font-bold" type="checkbox" />
                    <span>굵게</span>
                </label>
            </div>
        </div>

        <!-- Text Align -->
        <div class="ecm-section">
            <div class="ecm-section-label">텍스트 정렬</div>
            <div class="ecm-grid">
                <button class="ecm-opt-btn active" type="button" data-ecm-align="left">
                    <div class="ecm-opt-preview align-preview">☰</div>
                    <span class="ecm-opt-name">왼쪽</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-align="center">
                    <div class="ecm-opt-preview align-preview">☰</div>
                    <span class="ecm-opt-name">중앙</span>
                </button>
                <button class="ecm-opt-btn" type="button" data-ecm-align="justify">
                    <div class="ecm-opt-preview align-preview">☰</div>
                    <span class="ecm-opt-name">양쪽맞춤</span>
                </button>
            </div>
        </div>

        <!-- Content -->
        <div class="ecm-section">
            <div class="ecm-section-label">내용 입력</div>
            <div class="ecm-input-group">
                <div class="ecm-input-wrap">
                    <label>발췌 내용 *</label>
                    <textarea id="ecm-excerpt" placeholder="마음에 드는 문장을 입력해 봐." maxlength="350"></textarea>
                    <div class="ecm-char-count"><span id="ecm-char-count">0</span> / 350</div>
                </div>
                <button class="ecm-replace-add" type="button" id="ecm-clear-excerpt">본문 지우기</button>
                <div class="ecm-input-wrap">
                    <label>왼쪽 하단 제목</label>
                    <input id="ecm-title" type="text" placeholder="짧은 로그 (완결)" />
                </div>
                <div class="ecm-input-wrap">
                    <label>가운데 표기</label>
                    <input id="ecm-publisher" type="text" placeholder="AI채팅먀달글" />
                </div>
            </div>
        </div>

        <!-- Replace -->
        <div class="ecm-section">
            <div class="ecm-section-label">이름 치환</div>
            <div class="ecm-input-group">
                <div class="ecm-replace-list" id="ecm-replace-list"></div>
                <button class="ecm-replace-add" type="button" id="ecm-add-replace">+ {{char}} / {{user}} 치환 추가</button>
                <p class="ecm-hint">발췌 내용에 들어간 이름만 미리보기와 이미지에서 바뀌어 보여.</p>
            </div>
        </div>

        <!-- Preview -->
        <div class="ecm-section">
            <div class="ecm-section-label">미리보기</div>
            <div class="ecm-preview-wrap">
                <div class="ecm-card-preview"></div>
                <button class="ecm-save-btn" type="button">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    이미지로 만들기
                </button>
            </div>
        </div>

    </div>

    <!-- Result Overlay -->
    <div class="ecm-result-overlay">
        <p>카드가 완성됐어!<br>이미지를 꾹 누르거나 우클릭해서 저장해 봐.</p>
        <img class="ecm-result-img" alt="생성된 발췌 카드" />
        <div class="ecm-result-actions">
            <button class="ecm-result-close" type="button">닫기</button>
        </div>
    </div>`;
}

// ── Replace Row ───────────────────────────────────────────────
function ecmCreateReplaceRow(overlay, from, to) {
    const row = document.createElement('div');
    row.className = 'ecm-replace-row';
    row.innerHTML = `
        <div class="ecm-input-wrap">
            <label>원래 이름</label>
            <input class="ecm-replace-from" type="text" placeholder="예: 지윤" />
        </div>
        <div class="ecm-input-wrap">
            <label>바꿀 이름</label>
            <input class="ecm-replace-to" type="text" placeholder="{{char}} 또는 {{user}}" />
        </div>
        <button class="ecm-replace-remove" type="button">-</button>`;
    row.querySelector('.ecm-replace-from').value = from;
    row.querySelector('.ecm-replace-to').value = to;
    return row;
}

function ecmUpdateRemoveButtons(overlay) {
    const rows = overlay.querySelectorAll('.ecm-replace-row');
    rows.forEach(row => {
        const btn = row.querySelector('.ecm-replace-remove');
        if (btn) btn.disabled = rows.length === 1;
    });
}

function ecmAddReplaceRow(overlay, from, to) {
    const list = overlay.querySelector('#ecm-replace-list');
    if (!list) return;
    list.appendChild(ecmCreateReplaceRow(overlay, from, to));
    ecmUpdateRemoveButtons(overlay);
}

// ── Show Popup ────────────────────────────────────────────────
function showExcerptCardPopup() {
    // Remove existing
    document.querySelector('.ecm-overlay')?.remove();

    const saved = loadEcmState();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'ecm-overlay';

    const popup = document.createElement('div');
    popup.className = 'ecm-popup';
    popup.innerHTML = ecmBuildPopupHtml();
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Helper to schedule saves
    const schedule = () => {
        ecmUpdateCount(overlay);
        ecmUpdateCard(overlay);
        saveEcmState();
    };

    // ── Restore saved state ──
    const excerptEl = overlay.querySelector('#ecm-excerpt');
    const titleEl = overlay.querySelector('#ecm-title');
    const publisherEl = overlay.querySelector('#ecm-publisher');
    if (excerptEl) excerptEl.value = saved.excerpt || '';
    if (titleEl) titleEl.value = saved.title || '';
    if (publisherEl) publisherEl.value = saved.publisher || '';

    const photoModeEl = overlay.querySelector('#ecm-photo-mode');
    if (photoModeEl) photoModeEl.checked = ecmState.photoMode;

    const photoOptsEl = overlay.querySelector('#ecm-photo-options');
    if (photoOptsEl && ecmState.photoMode) photoOptsEl.classList.add('ecm-show');

    const photoOverlayEl = overlay.querySelector('#ecm-photo-overlay');
    if (photoOverlayEl) photoOverlayEl.value = ecmState.photoOverlay;

    const photoRatioEl = overlay.querySelector('#ecm-photo-ratio');
    if (photoRatioEl) photoRatioEl.value = ecmState.photoRatio;

    const fontBoldEl = overlay.querySelector('#ecm-font-bold');
    if (fontBoldEl) fontBoldEl.checked = ecmState.fontBold;

    // Theme buttons
    overlay.querySelectorAll('[data-ecm-theme]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ecmTheme === ecmState.theme);
    });

    // Font buttons
    overlay.querySelectorAll('[data-ecm-font]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ecmFont === ecmState.font);
    });

    // Align buttons
    overlay.querySelectorAll('[data-ecm-align]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ecmAlign === ecmState.textAlign);
    });

    // Replace rows
    const savedRows = Array.isArray(saved.replacements) ? saved.replacements : [];
    const hasRows = savedRows.some(r => r?.from || r?.to);
    const rows = hasRows ? savedRows : [{ from: '', to: '{{char}}' }, { from: '', to: '{{user}}' }];
    rows.forEach(r => ecmAddReplaceRow(overlay, r.from, r.to));

    // ── Event Delegation ──
    overlay.addEventListener('click', (e) => {
        const target = e.target;

        // Close overlay (click on background)
        if (target === overlay) {
            overlay.remove();
            return;
        }

        // Close button
        if (target.closest('.ecm-close-btn')) {
            overlay.remove();
            return;
        }

        // Theme buttons
        const themeBtn = target.closest('[data-ecm-theme]');
        if (themeBtn) {
            ecmState.theme = themeBtn.dataset.ecmTheme;
            overlay.querySelectorAll('[data-ecm-theme]').forEach(b => {
                b.classList.toggle('active', b.dataset.ecmTheme === ecmState.theme);
            });
            schedule();
            return;
        }

        // Font buttons
        const fontBtn = target.closest('[data-ecm-font]');
        if (fontBtn) {
            ecmState.font = fontBtn.dataset.ecmFont;
            overlay.querySelectorAll('[data-ecm-font]').forEach(b => {
                b.classList.toggle('active', b.dataset.ecmFont === ecmState.font);
            });
            schedule();
            return;
        }

        // Align buttons
        const alignBtn = target.closest('[data-ecm-align]');
        if (alignBtn) {
            ecmState.textAlign = alignBtn.dataset.ecmAlign;
            overlay.querySelectorAll('[data-ecm-align]').forEach(b => {
                b.classList.toggle('active', b.dataset.ecmAlign === ecmState.textAlign);
            });
            schedule();
            return;
        }

        // Clear excerpt
        if (target.closest('#ecm-clear-excerpt')) {
            if (excerptEl) { excerptEl.value = ''; excerptEl.focus(); }
            schedule();
            return;
        }

        // Add replace pair
        if (target.closest('#ecm-add-replace')) {
            ecmAddReplaceRow(overlay, '', '{{char}}');
            ecmAddReplaceRow(overlay, '', '{{user}}');
            schedule();
            return;
        }

        // Remove replace row
        const removeBtn = target.closest('.ecm-replace-remove');
        if (removeBtn && removeBtn.id !== 'ecm-clear-photo') {
            const row = removeBtn.closest('.ecm-replace-row');
            if (row) {
                row.remove();
                ecmUpdateRemoveButtons(overlay);
                schedule();
            }
            return;
        }

        // Clear photo
        if (target.closest('#ecm-clear-photo')) {
            ecmState.photoDataUrl = '';
            ecmState.photoImage = null;
            const fileInput = overlay.querySelector('#ecm-photo-input');
            if (fileInput) fileInput.value = '';
            ecmUpdateCard(overlay);
            return;
        }

        // Save button
        if (target.closest('.ecm-save-btn')) {
            ecmGenerate(overlay);
            return;
        }

        // Result close
        if (target.closest('.ecm-result-close') || target.classList.contains('ecm-result-overlay')) {
            const resultEl = overlay.querySelector('.ecm-result-overlay');
            if (resultEl) resultEl.classList.remove('ecm-show');
            if (ecmState.resultUrl) {
                URL.revokeObjectURL(ecmState.resultUrl);
                ecmState.resultUrl = '';
                ecmState.resultBlob = null;
                ecmState.resultDataUrl = '';
            }
            return;
        }
    });

    // ── Change Events ──
    overlay.addEventListener('input', (e) => {
        const target = e.target;
        if (target.id === 'ecm-excerpt' || target.id === 'ecm-title' || target.id === 'ecm-publisher' ||
            target.classList.contains('ecm-replace-from') || target.classList.contains('ecm-replace-to')) {
            schedule();
        }
    });

    overlay.addEventListener('change', (e) => {
        const target = e.target;

        if (target.id === 'ecm-photo-mode') {
            ecmState.photoMode = target.checked;
            const opts = overlay.querySelector('#ecm-photo-options');
            if (opts) opts.classList.toggle('ecm-show', ecmState.photoMode);
            schedule();
            return;
        }

        if (target.id === 'ecm-font-bold') {
            ecmState.fontBold = target.checked;
            schedule();
            return;
        }

        if (target.id === 'ecm-photo-overlay') {
            ecmState.photoOverlay = target.value;
            schedule();
            return;
        }

        if (target.id === 'ecm-photo-ratio') {
            ecmState.photoRatio = target.value;
            schedule();
            return;
        }

        if (target.id === 'ecm-photo-input') {
            const file = target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = String(reader.result || '');
                const img = new Image();
                img.onload = () => {
                    ecmState.photoDataUrl = dataUrl;
                    ecmState.photoImage = img;
                    ecmUpdateCard(overlay);
                };
                img.onerror = () => alert('사진을 불러오지 못했어.');
                img.src = dataUrl;
            };
            reader.readAsDataURL(file);
            return;
        }
    });

    // ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            const resultEl = overlay.querySelector('.ecm-result-overlay.ecm-show');
            if (resultEl) {
                resultEl.classList.remove('ecm-show');
                return;
            }
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Initial render
    ecmUpdateCount(overlay);
    ecmUpdateCard(overlay);
}

// ── Settings UI ───────────────────────────────────────────────
function loadEcmSettingsUI() {
    const container = document.getElementById('extensions_settings2');
    if (!container) return;

    const html = `
    <div id="ecm-settings" class="extension_container">
        <div class="extension_header">
            <b>💌 발췌 카드 만들기</b>
        </div>
        <div class="extension_content">
            <p style="font-size:12px;color:#888;margin:8px 0;">
                버튼을 눌러 발췌 카드 메이커를 열 수 있습니다.
            </p>
        </div>
    </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

// ── Main Button ───────────────────────────────────────────────
function addEcmButton() {
    const btn = document.createElement('div');
    btn.id = 'excerpt-card-btn';
    btn.textContent = '💌';
    btn.title = '발췌 카드 만들기';
    btn.style.cssText = 'cursor:pointer;font-size:1.2em;padding:3px 5px;border-radius:5px;transition:background 0.2s;z-index:9999;';
    btn.addEventListener('click', () => showExcerptCardPopup());

    // wrapper가 있으면 그 안에 추가, 없으면 새로 만들어서 삽입
    const wrapper = document.getElementById('cb-btn-wrapper');
    if (wrapper) {
        wrapper.appendChild(btn);
    } else {
        const newWrapper = document.createElement('div');
        newWrapper.id = 'cb-btn-wrapper';
        newWrapper.style.cssText = 'display:flex;flex-direction:row;gap:4px;align-self:flex-start;';
        newWrapper.appendChild(btn);
        const sendForm = document.getElementById('send_form');
        if (sendForm && sendForm.firstChild) {
            sendForm.insertBefore(newWrapper, sendForm.firstChild);
        } else if (sendForm) {
            sendForm.appendChild(newWrapper);
        }
    }
}

// ── Init ──────────────────────────────────────────────────────
(function init() {
    loadEcmSettingsUI();
    // 게시판 버튼이 나중에 로드될 수 있으니 약간 딜레이
    setTimeout(addEcmButton, 500);
    console.log('[Excerpt Card Maker] Extension loaded!');
})();

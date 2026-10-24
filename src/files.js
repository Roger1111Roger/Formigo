// Which file an upload field expects, and generating a test file of the right format (offline)

// Formats: extension, MIME and hint words in dropzone/label text
export const KINDS = {
  jpg: { mime: 'image/jpeg', ext: 'jpg', re: /\bjpe?g\b|\bheic\b/i },
  png: { mime: 'image/png', ext: 'png', re: /\bpng\b/i },
  webp: { mime: 'image/webp', ext: 'webp', re: /\bwebp\b/i },
  gif: { mime: 'image/gif', ext: 'gif', re: /\bgif\b/i },
  svg: { mime: 'image/svg+xml', ext: 'svg', re: /\bsvg\b/i },
  pdf: { mime: 'application/pdf', ext: 'pdf', re: /\bpdf\b/i },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', re: /\bdocx?\b|\bword\b|\bms ?word\b/i },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', re: /\bxlsx?\b|\bexcel\b|spreadsheet|таблиц/i },
  csv: { mime: 'text/csv', ext: 'csv', re: /\bcsv\b/i },
  json: { mime: 'application/json', ext: 'json', re: /\bjson\b/i },
  xml: { mime: 'application/xml', ext: 'xml', re: /\bxml\b/i },
  txt: { mime: 'text/plain', ext: 'txt', re: /\btxt\b|plain text|текстов/i },
  zip: { mime: 'application/zip', ext: 'zip', re: /\bzip\b|archive|архив/i },
  wav: { mime: 'audio/wav', ext: 'wav', re: /\bwav\b|\baudio\b|\bmp3\b|voice|аудио|голос/i },
};
const IMAGE_KINDS = ['jpg', 'png', 'webp', 'gif', 'svg'];
const GENERIC_IMAGE = /image|photo|picture|selfie|фото|изображ|картинк|снимок|скан|scan/i;
const GENERIC_DOC = /document|документ|contract|договор|statement|выписк|invoice|счёт|счет|certificate|справк/i;

// Parse accept into a list of formats (in listed order)
function kindsFromAccept(accept) {
  const out = [];
  for (const raw of accept.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)) {
    if (raw === 'image/*') out.push('jpg', 'png', 'webp', 'gif');
    else if (raw === 'audio/*') out.push('wav');
    else if (raw === 'text/*') out.push('txt', 'csv');
    else if (raw === '*/*' || raw === '*') out.push('any');
    else {
      const k = Object.entries(KINDS).find(([id, v]) => raw === v.mime || raw === '.' + v.ext || raw === '.' + id
        || (id === 'jpg' && /^\.?(jpe?g|image\/jpe?g|image\/pjpeg)$/.test(raw)) || (id === 'docx' && /^(\.doc|application\/msword)$/.test(raw))
        || (id === 'xlsx' && /^(\.xls|application\/vnd\.ms-excel)$/.test(raw)) || (id === 'wav' && /^(\.mp3|audio\/(mpeg|mp3|x-wav))$/.test(raw))
        || (id === 'zip' && /^(\.rar|\.7z|application\/x-zip-compressed)$/.test(raw)));
      if (k) out.push(k[0]);
    }
  }
  return [...new Set(out)];
}

// Hints in text: «PDF, JPG up to 5 MB», «Upload CSV», «Contract (DOCX)»
function kindsFromText(text) {
  const hits = Object.entries(KINDS).map(([id, v]) => [id, text.search(v.re)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([id]) => id);
  return hits;
}

// List of matching formats in descending order of preference
export function expectedKinds(accept, text) {
  const fromAccept = kindsFromAccept(accept || '');
  const fromText = kindsFromText(text || '');
  if (fromAccept.length && !fromAccept.includes('any')) {
    // among the allowed accept types, pick the one the nearby text mentions
    const preferred = fromText.filter((k) => fromAccept.includes(k));
    if (!preferred.length && GENERIC_DOC.test(text) && fromAccept.includes('pdf')) preferred.push('pdf');
    if (!preferred.length && GENERIC_IMAGE.test(text)) preferred.push(...fromAccept.filter((k) => IMAGE_KINDS.includes(k)));
    return [...new Set([...preferred, ...fromAccept])];
  }
  if (fromText.length) return fromText;
  if (GENERIC_DOC.test(text) && !GENERIC_IMAGE.test(text)) return ['pdf', 'jpg'];
  return ['jpg', 'png', 'pdf'];
}

export const isImageKind = (k) => IMAGE_KINDS.includes(k);

// --- generators ---
const enc = new TextEncoder();
// short suffix so file names differ between fills
const stamp = () => Math.random().toString(36).slice(2, 6);
const fileOf = (parts, kind, base = 'test') => new File(parts, `${base}-${stamp()}.${KINDS[kind].ext}`, { type: KINDS[kind].mime });

export async function canvasImage(kind, size = 15) {
  if (kind === 'svg') {
    const hue = Math.floor(Math.random() * 360);
    return fileOf([`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="hsl(${hue},40%,60%)"/><rect x="16" y="16" width="32" height="32" fill="#fff"/></svg>`], 'svg', 'test-image');
  }
  if (kind === 'gif') {
    // GIF 1×1 (canvas can't encode GIF)
    const b = Uint8Array.from(atob('R0lGODlhAQABAIAAAHeIl////yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='), (c) => c.charCodeAt(0));
    return fileOf([b], 'gif', 'test-image');
  }
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = `hsl(${Math.floor(Math.random() * 360)} 40% 60%)`;
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.fillRect(size * 0.27, size * 0.27, size * 0.46, size * 0.46);
  const mime = KINDS[kind]?.mime || 'image/png';
  const blob = await new Promise((r) => c.toBlob(r, mime, 0.9));
  return new File([blob], `test-image-${stamp()}.${KINDS[kind]?.ext || 'png'}`, { type: blob.type || mime });
}

// Valid single-page PDF with text and an xref table
export function pdfFile(lines = ['Formigo test document']) {
  const esc = (s) => String(s).replace(/[()\\]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');
  const stream = 'BT /F1 14 Tf 50 780 Td ' + lines.map((l, i) => (i ? '0 -22 Td ' : '') + `(${esc(l)}) Tj`).join(' ') + ' ET';
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${stream.length}>>stream\n${stream}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return fileOf([out], 'pdf', 'test-document');
}

// Minimal ZIP (no compression) — base for docx/xlsx/zip
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zipBytes(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nameB = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameB.length, true);
    chunks.push(new Uint8Array(local.buffer), nameB, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, nameB.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return [...chunks, ...central, new Uint8Array(end.buffer)];
}

const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function docxFile(lines) {
  const body = lines.map((l) => `<w:p><w:r><w:t>${xmlEsc(l)}</w:t></w:r></w:p>`).join('');
  return fileOf(zipBytes([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`],
  ]), 'docx', 'test-document');
}

export function xlsxFile(rows) {
  const cell = (v, r, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
  const sheet = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c)).join('')}</row>`).join('');
  return fileOf(zipBytes([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`],
  ]), 'xlsx', 'test-table');
}

// WAV: half a second of a quiet tone
export function wavFile() {
  const rate = 8000; const n = rate / 2;
  const buf = new DataView(new ArrayBuffer(44 + n));
  const str = (o, s) => [...s].forEach((ch, i) => buf.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); buf.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt '); buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); buf.setUint16(22, 1, true); buf.setUint32(24, rate, true); buf.setUint32(28, rate, true);
  buf.setUint16(32, 1, true); buf.setUint16(34, 8, true); str(36, 'data'); buf.setUint32(40, n, true);
  for (let i = 0; i < n; i++) buf.setUint8(44 + i, 128 + Math.round(20 * Math.sin(i / 8)));
  return fileOf([buf.buffer], 'wav', 'test-audio');
}

// Non-text document formats with the current fill's profile data
export function documentFile(kind, profile) {
  const name = `${profile.firstName} ${profile.lastName}`;
  const rows = [['First name', 'Last name', 'Email', 'Phone', 'City'], [profile.firstName, profile.lastName, profile.email, profile.phone, profile.city]];
  const lines = ['Formigo test document', `Name: ${name}`, `Email: ${profile.email}`, `Date: ${new Date().toISOString().slice(0, 10)}`];
  switch (kind) {
    case 'pdf': return pdfFile(lines);
    case 'docx': return docxFile(lines);
    case 'xlsx': return xlsxFile(rows);
    case 'csv': return fileOf([rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], 'csv', 'test-table');
    case 'json': return fileOf([JSON.stringify({ firstName: profile.firstName, lastName: profile.lastName, email: profile.email, phone: profile.phone, city: profile.city }, null, 2)], 'json', 'test-data');
    case 'xml': return fileOf([`<?xml version="1.0" encoding="UTF-8"?>\n<person><firstName>${xmlEsc(profile.firstName)}</firstName><lastName>${xmlEsc(profile.lastName)}</lastName><email>${xmlEsc(profile.email)}</email></person>`], 'xml', 'test-data');
    case 'zip': return fileOf(zipBytes([['readme.txt', lines.join('\n')]]), 'zip', 'test-archive');
    case 'wav': return wavFile();
    case 'txt': default: return fileOf([lines.join('\n')], 'txt', 'test');
  }
}

type BordereauItem = {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  variantName?: string | null;
  colorName?: string | null;
};

export type BordereauData = {
  reference: string;
  createdAt: string;
  clientName: string;
  phone: string;
  email?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  commune: string;
  wilaya: string;
  deliveryType: string;
  deliveryOfficeName?: string | null;
  paymentMethod: string;
  paymentStatus?: string | null;
  items: BordereauItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  notes?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
};

const WIN_ANSI: Record<string, number> = {
  '\u20AC': 128,
  '\u201A': 130,
  '\u0192': 131,
  '\u201E': 132,
  '\u2026': 133,
  '\u2020': 134,
  '\u2021': 135,
  '\u02C6': 136,
  '\u2030': 137,
  '\u0160': 138,
  '\u2039': 139,
  '\u0152': 140,
  '\u017D': 142,
  '\u2018': 145,
  '\u2019': 146,
  '\u201C': 147,
  '\u201D': 148,
  '\u2022': 149,
  '\u2013': 150,
  '\u2014': 151,
  '\u02DC': 152,
  '\u2122': 153,
  '\u0161': 154,
  '\u203A': 155,
  '\u0153': 156,
  '\u017E': 158,
  '\u0178': 159,
};

function pdfString(value: string) {
  let out = '';
  for (const char of value) {
    if (char === '\\' || char === '(' || char === ')') {
      out += `\\${char}`;
      continue;
    }
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      out += char;
      continue;
    }
    const mapped = WIN_ANSI[char] ?? (code <= 255 ? code : 63);
    out += `\\${mapped.toString(8).padStart(3, '0')}`;
  }
  return `(${out})`;
}

function money(value: number) {
  return `${Math.round(value).toLocaleString('fr-DZ')} DA`;
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('fr-DZ', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function buildBordereauPdf(data: BordereauData): Buffer {
  const lines: string[] = [];
  const add = (text: string, x: number, y: number, size = 10, bold = false) => {
    lines.push('BT');
    lines.push(`/${bold ? 'B' : 'F'} ${size} Tf`);
    lines.push(`${x} ${y} Td`);
    lines.push(`${pdfString(text)} Tj`);
    lines.push('ET');
  };
  const rect = (x: number, y: number, w: number, h: number, fill = false) => {
    lines.push(`${x} ${y} ${w} ${h} re`);
    lines.push(fill ? '0.94 g f 0 g' : 'S');
  };

  rect(36, 760, 523, 46, true);
  add('MICHKET', 48, 788, 18, true);
  add("BORDEREAU D'ENVOI", 330, 788, 14, true);
  add(`Ref. ${data.reference}`, 48, 770, 10);
  add(formatDay(data.createdAt), 400, 770, 10);

  add('EXPEDITEUR', 48, 735, 9, true);
  rect(36, 655, 250, 72);
  add('Michket', 48, 708, 11, true);
  add('Livraison Yalidine', 48, 692, 9);
  add('Alger, Algerie', 48, 678, 9);
  add('www.michket.dz', 48, 664, 9);

  add('DESTINATAIRE', 310, 735, 9, true);
  rect(308, 655, 251, 72);
  add(data.clientName, 320, 708, 11, true);
  add(data.phone, 320, 692, 9);
  add(data.addressLine1.slice(0, 42), 320, 678, 9);
  add(`${data.commune} - ${data.wilaya}`.slice(0, 42), 320, 664, 9);

  add('DETAILS LIVRAISON', 48, 635, 9, true);
  rect(36, 575, 523, 50);
  const delivery =
    data.deliveryType === 'office'
      ? `Stop desk${data.deliveryOfficeName ? ` · ${data.deliveryOfficeName}` : ''}`
      : 'Domicile';
  add(`Type: ${delivery}`, 48, 608, 10);
  add(`Paiement: ${(data.paymentMethod || 'cod').toUpperCase()}`, 260, 608, 10);
  add(`Montant a encaisser: ${money(data.total)}`, 48, 588, 11, true);
  add(
    data.trackingNumber
      ? `Yalidine: ${data.trackingNumber}`
      : 'Yalidine: colis a creer',
    320,
    588,
    10,
  );

  add('ARTICLES', 48, 555, 9, true);
  rect(36, 430, 523, 115);
  add('Qte', 48, 528, 9, true);
  add('Produit', 90, 528, 9, true);
  add('Prix', 430, 528, 9, true);
  add('Total', 500, 528, 9, true);
  let y = 510;
  const items = data.items.slice(0, 6);
  if (items.length === 0) {
    add('Aucun article', 90, y, 9);
  }
  for (const item of items) {
    const extra = [item.variantName, item.colorName].filter(Boolean).join(' / ');
    const name = `${item.productName}${extra ? ` (${extra})` : ''}`.slice(0, 48);
    add(String(item.quantity), 48, y, 9);
    add(name, 90, y, 9);
    add(money(item.unitPrice), 420, y, 9);
    add(money(item.lineTotal ?? item.unitPrice * item.quantity), 500, y, 9);
    y -= 16;
  }

  add(`Sous-total: ${money(data.subtotal)}`, 400, 410, 9);
  add(`Livraison: ${money(data.deliveryFee)}`, 400, 396, 9);
  add(`Remise: ${money(data.discount)}`, 400, 382, 9);
  add(`TOTAL: ${money(data.total)}`, 400, 364, 12, true);

  if (data.notes) {
    add('NOTES', 48, 410, 9, true);
    add(data.notes.replace(/\s+/g, ' ').slice(0, 90), 48, 394, 9);
  }

  rect(36, 250, 250, 90);
  rect(308, 250, 251, 90);
  add('Cachet / signature expediteur', 48, 322, 9, true);
  add('Signature destinataire', 320, 322, 9, true);
  add('Date: _______________', 48, 268, 9);
  add('Date: _______________', 320, 268, 9);

  add(
    'Document genere par le CRM Michket. A coller sur le colis avant remise au transporteur.',
    48,
    220,
    8,
  );

  const stream = lines.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F 4 0 R /B 5 0 R >> >> /Contents 6 0 R >> endobj\n',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n',
    `6 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream\nendobj\n`,
  ];

  let offset = '%PDF-1.4\n'.length;
  const xref = [0];
  let body = '%PDF-1.4\n';
  for (const object of objects) {
    xref.push(offset);
    body += object;
    offset += Buffer.byteLength(object, 'utf8');
  }
  const xrefStart = offset;
  let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < xref.length; i += 1) {
    xrefTable += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body + xrefTable + trailer, 'utf8');
}

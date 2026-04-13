import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const htmlPath = path.join(rootDir, "docs", "system-architecture-report.html");
const pdfPath = path.join(rootDir, "docs", "system-architecture-report.pdf");

const html = fs.readFileSync(htmlPath, "utf8");
const text = htmlToText(html);
const lines = buildWrappedLines(text, 92);
const pdf = buildPdf(lines);

fs.writeFileSync(pdfPath, pdf);
console.log(pdfPath);

function htmlToText(input) {
  const replacements = [
    [/<style[\s\S]*?<\/style>/gi, "\n"],
    [/<script[\s\S]*?<\/script>/gi, "\n"],
    [/<pre>([\s\S]*?)<\/pre>/gi, (_, inner) => `\n\n${decodeEntities(stripTags(inner))}\n\n`],
    [/<h1>([\s\S]*?)<\/h1>/gi, (_, inner) => `\n${decodeEntities(stripTags(inner)).toUpperCase()}\n`],
    [/<h2>([\s\S]*?)<\/h2>/gi, (_, inner) => `\n\n${decodeEntities(stripTags(inner)).toUpperCase()}\n`],
    [/<h3>([\s\S]*?)<\/h3>/gi, (_, inner) => `\n\n${decodeEntities(stripTags(inner))}\n`],
    [/<h4>([\s\S]*?)<\/h4>/gi, (_, inner) => `\n${decodeEntities(stripTags(inner))}\n`],
    [/<li>([\s\S]*?)<\/li>/gi, (_, inner) => `\n- ${decodeEntities(stripTags(inner))}`],
    [/<tr>([\s\S]*?)<\/tr>/gi, (_, inner) => `\n${tableRowToText(inner)}`],
    [/<p>([\s\S]*?)<\/p>/gi, (_, inner) => `\n${decodeEntities(stripTags(inner))}\n`],
    [/<div[\s\S]*?>/gi, "\n"],
    [/<\/div>/gi, "\n"],
    [/<br\s*\/?>/gi, "\n"],
  ];

  let output = input;
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  output = stripTags(output);
  output = decodeEntities(output);
  output = output.replace(/\r/g, "");
  output = output.replace(/[ \t]+\n/g, "\n");
  output = output.replace(/\n{3,}/g, "\n\n");
  output = output.replace(/[ \t]{2,}/g, " ");
  return output.trim();
}

function tableRowToText(inner) {
  const cells = [...inner.matchAll(/<(td|th)>([\s\S]*?)<\/\1>/gi)].map((match) =>
    decodeEntities(stripTags(match[2])).trim(),
  );
  return cells.length ? cells.join(" | ") : decodeEntities(stripTags(inner)).trim();
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "");
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buildWrappedLines(text, width) {
  const paragraphs = text.split("\n");
  const output = [];

  for (const paragraph of paragraphs) {
    const raw = paragraph.trimEnd();
    if (!raw.trim()) {
      output.push("");
      continue;
    }

    if (/^[A-Z0-9 .,:()\/+-]{6,}$/.test(raw.trim())) {
      output.push(raw.trim());
      output.push("");
      continue;
    }

    if (raw.startsWith("- ")) {
      const wrapped = wrapText(raw.slice(2), width - 2);
      wrapped.forEach((line, index) => {
        output.push(index === 0 ? `- ${line}` : `  ${line}`);
      });
      continue;
    }

    wrapText(raw.trim(), width).forEach((line) => output.push(line));
  }

  while (output.length && output[output.length - 1] === "") {
    output.pop();
  }

  return output;
}

function wrapText(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width));
      }
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function buildPdf(lines) {
  const linesPerPage = 46;
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }

  let objectIndex = 1;
  const catalogId = objectIndex++;
  const pagesId = objectIndex++;
  const fontId = objectIndex++;

  const pageObjectIds = [];
  const contentObjectIds = [];

  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(objectIndex++);
    contentObjectIds.push(objectIndex++);
  }

  const objects = [];
  objects[catalogId] = `${catalogId} 0 obj << /Type /Catalog /Pages ${pagesId} 0 R >> endobj`;
  objects[pagesId] = `${pagesId} 0 obj << /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >> endobj`;
  objects[fontId] = `${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`;

  pages.forEach((pageLines, index) => {
    const content = buildPageContent(pageLines);
    const contentId = contentObjectIds[index];
    const pageId = pageObjectIds[index];
    const contentLength = Buffer.byteLength(content, "utf8");

    objects[contentId] = `${contentId} 0 obj << /Length ${contentLength} >> stream\n${content}\nendstream endobj`;
    objects[pageId] = `${pageId} 0 obj << /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >> endobj`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${objects[i]}\n`;
  }

  const xrefPosition = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefPosition}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function buildPageContent(lines) {
  const stream = ["BT", "/F1 10 Tf", "50 770 Td", "14 TL"];
  lines.forEach((line, index) => {
    const safe = escapePdfText(line);
    stream.push(index === 0 ? `(${safe}) Tj` : `T* (${safe}) Tj`);
  });
  stream.push("ET");
  return stream.join("\n");
}

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

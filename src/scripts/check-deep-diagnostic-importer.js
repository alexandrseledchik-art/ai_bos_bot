import assert from "node:assert/strict";
import zlib from "node:zlib";

import { importDeepDiagnosticXlsx } from "../application/deep-diagnostic-importer.js";

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const compressed = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
      compressed
    ]);
    localParts.push(local);

    centralParts.push(Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name
    ]));

    offset += local.length;
  }

  const central = Buffer.concat(centralParts);
  const local = Buffer.concat(localParts);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(local.length),
    u16(0)
  ]);

  return Buffer.concat([local, central, eocd]);
}

function inlineCell(ref, value) {
  return `<c r="${ref}" t="inlineStr"><is><t>${String(value)}</t></is></c>`;
}

function numberCell(ref, value) {
  return `<c r="${ref}"><v>${value}</v></c>`;
}

function row(index, cells) {
  return `<row r="${index}">${cells.join("")}</row>`;
}

function worksheet(rows) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rows.join("")}</sheetData>
</worksheet>`;
}

function buildWorkbook() {
  const companyRows = [
    row(1, [inlineCell("A1", "Вопрос"), inlineCell("B1", "Ответ")]),
    row(2, [inlineCell("A2", "Название компании"), inlineCell("B2", "ООО РОКС ЛОГИСТИК")]),
    row(3, [inlineCell("A3", "Сфера / рынок"), inlineCell("B3", "Логистика")]),
    row(4, [inlineCell("A4", "Основной продукт / услуга"), inlineCell("B4", "Экспедирование")]),
    row(5, [inlineCell("A5", "Прибыль (если готов раскрыть)"), inlineCell("B5", "1 млн в месяц на себя")])
  ];
  const matrixRows = [
    row(1, [
      inlineCell("A1", "#"),
      inlineCell("B1", "Название уровня"),
      inlineCell("C1", "Подуровень"),
      inlineCell("D1", "Название подуровня"),
      inlineCell("E1", "Оценка зрелости"),
      inlineCell("F1", "Шкала"),
      inlineCell("G1", "Гэп до 3"),
      inlineCell("H1", "Статус")
    ]),
    row(2, [numberCell("A2", 1), inlineCell("B2", "Контур собственника"), inlineCell("C2", "Слой"), inlineCell("D2", "Контур собственника"), numberCell("E2", 1.8), inlineCell("F2", "██░░░"), numberCell("G2", 1.2), inlineCell("H2", "Интуиция")]),
    row(3, [numberCell("A3", 2), inlineCell("B3", "Внешняя среда и экосистема"), inlineCell("C3", "Слой"), inlineCell("D3", "Внешняя среда и экосистема"), numberCell("E3", 1.4), inlineCell("F3", "█░░░░"), numberCell("G3", 1.6), inlineCell("H3", "Хаос")]),
    row(4, [numberCell("A4", 3), inlineCell("B4", "Стратегия"), inlineCell("C4", "Слой"), inlineCell("D4", "Стратегия"), numberCell("E4", 1.2), inlineCell("F4", "█░░░░"), numberCell("G4", 1.8), inlineCell("H4", "Хаос")]),
    row(5, [numberCell("A5", 4), inlineCell("B5", "Финансы"), inlineCell("C5", "Слой"), inlineCell("D5", "Финансы"), numberCell("E5", 1.3), inlineCell("F5", "█░░░░"), numberCell("G5", 1.7), inlineCell("H5", "Хаос")]),
    row(6, [numberCell("A6", 5), inlineCell("B6", "Команда"), inlineCell("C6", "Слой"), inlineCell("D6", "Команда"), numberCell("E6", 1.2), inlineCell("F6", "█░░░░"), numberCell("G6", 1.8), inlineCell("H6", "Хаос")]),
    row(7, [numberCell("A7", 6), inlineCell("B7", "Внешняя среда и экосистема"), inlineCell("C7", "Поддомен"), inlineCell("D7", "Объём рынка"), numberCell("E7", 1), inlineCell("F7", "█░░░░"), numberCell("G7", 2), inlineCell("H7", "Хаос")]),
    row(8, [numberCell("A8", 7), inlineCell("B8", "Финансы"), inlineCell("C8", "Поддомен"), inlineCell("D8", "Cash Flow"), numberCell("E8", 1), inlineCell("F8", "█░░░░"), numberCell("G8", 2), inlineCell("H8", "Хаос")]),
    row(9, [numberCell("A9", 8), inlineCell("B9", "Команда"), inlineCell("C9", "Поддомен"), inlineCell("D9", "Роли"), numberCell("E9", 1), inlineCell("F9", "█░░░░"), numberCell("G9", 2), inlineCell("H9", "Хаос")])
  ];

  return createZip([
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="О компании" sheetId="1" r:id="rId1"/>
    <sheet name="Матрица зрелости" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`
    },
    { name: "xl/worksheets/sheet1.xml", content: worksheet(companyRows) },
    { name: "xl/worksheets/sheet2.xml", content: worksheet(matrixRows) }
  ]);
}

async function main() {
  const imported = importDeepDiagnosticXlsx(buildWorkbook());

  assert.equal(imported.profile["Название компании"], "ООО РОКС ЛОГИСТИК");
  assert.equal(imported.layerScores.length, 5);
  assert.equal(imported.layerScores.find((item) => item.layerCode === "external_environment")?.score, 1.4);
  assert.ok(imported.contentText.includes("Оценки 11 слоёв"));
  assert.ok(imported.contentText.includes("Верхняя рамка требует проверки"));
  assert.ok(imported.weakestSubdomains.some((item) => item.layerCode === "finance" && item.name === "Cash Flow"));

  console.log("Deep diagnostic importer checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


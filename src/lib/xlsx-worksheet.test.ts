import assert from "node:assert/strict";
import test from "node:test";

const xlsxWorksheetModulePath = "./xlsx-worksheet.ts";
const { buildStyledWorksheetXml } = await import(xlsxWorksheetModulePath);

function worksheetChildOrder(xml: string) {
  return Array.from(xml.matchAll(/<(sheetViews|cols|sheetData|mergeCells)(?:\s|>)/g), (match) => match[1]);
}

test("genera los elementos worksheet en el orden exigido por SpreadsheetML", () => {
  const xml = buildStyledWorksheetXml({
    columnsXml: '<cols><col min="1" max="1" width="20" customWidth="1"/></cols>',
    rowsXml: '<row r="1"><c r="A1" t="inlineStr"><is><t>Dato</t></is></c></row>',
    mergesXml: '<mergeCells count="1"><mergeCell ref="A2:A3"/></mergeCells>'
  });

  assert.deepEqual(worksheetChildOrder(xml), ["sheetViews", "cols", "sheetData", "mergeCells"]);
  assert.doesNotMatch(xml, /<cols>[\s\S]*<sheetViews>/);
});

test("mantiene sheetViews antes de sheetData cuando no hay anchos ni celdas combinadas", () => {
  const xml = buildStyledWorksheetXml({ rowsXml: "" });

  assert.deepEqual(worksheetChildOrder(xml), ["sheetViews", "sheetData"]);
});

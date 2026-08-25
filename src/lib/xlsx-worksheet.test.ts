import assert from "node:assert/strict";
import test from "node:test";

const xlsxWorksheetModulePath = "./xlsx-worksheet.ts";
const { buildStyledWorksheetXml } = await import(xlsxWorksheetModulePath);

function worksheetChildOrder(xml: string) {
  return Array.from(xml.matchAll(/<(sheetPr|dimension|sheetViews|sheetFormatPr|cols|sheetData|mergeCells|printOptions|pageMargins|pageSetup)(?:\s|>)/g), (match) => match[1]);
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

test("situa la configuracion de impresion despues de las celdas combinadas", () => {
  const xml = buildStyledWorksheetXml({
    sheetPropertiesXml: '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
    dimensionXml: '<dimension ref="B3:I35"/>',
    sheetFormatPropertiesXml: '<sheetFormatPr defaultRowHeight="15"/>',
    rowsXml: "",
    mergesXml: '<mergeCells count="1"><mergeCell ref="B3:D4"/></mergeCells>',
    printOptionsXml: '<printOptions horizontalCentered="0"/>',
    pageMarginsXml: '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>',
    pageSetupXml: '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>'
  });

  assert.deepEqual(worksheetChildOrder(xml), [
    "sheetPr",
    "dimension",
    "sheetViews",
    "sheetFormatPr",
    "sheetData",
    "mergeCells",
    "printOptions",
    "pageMargins",
    "pageSetup"
  ]);
});

test("mantiene sheetViews antes de sheetData cuando no hay anchos ni celdas combinadas", () => {
  const xml = buildStyledWorksheetXml({ rowsXml: "" });

  assert.deepEqual(worksheetChildOrder(xml), ["sheetViews", "sheetData"]);
});

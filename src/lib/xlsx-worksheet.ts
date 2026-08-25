type StyledWorksheetXmlInput = {
  columnsXml?: string;
  rowsXml: string;
  mergesXml?: string;
};

export function buildStyledWorksheetXml({
  columnsXml = "",
  rowsXml,
  mergesXml = ""
}: StyledWorksheetXmlInput) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  ${columnsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
</worksheet>`;
}

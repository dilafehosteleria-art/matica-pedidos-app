type StyledWorksheetXmlInput = {
  columnsXml?: string;
  dimensionXml?: string;
  pageMarginsXml?: string;
  pageSetupXml?: string;
  printOptionsXml?: string;
  rowsXml: string;
  sheetFormatPropertiesXml?: string;
  sheetPropertiesXml?: string;
  sheetViewsXml?: string;
  mergesXml?: string;
};

export function buildStyledWorksheetXml({
  columnsXml = "",
  dimensionXml = "",
  pageMarginsXml = "",
  pageSetupXml = "",
  printOptionsXml = "",
  rowsXml,
  sheetFormatPropertiesXml = "",
  sheetPropertiesXml = "",
  sheetViewsXml = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
  mergesXml = ""
}: StyledWorksheetXmlInput) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${sheetPropertiesXml}
  ${dimensionXml}
  ${sheetViewsXml}
  ${sheetFormatPropertiesXml}
  ${columnsXml}
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
  ${printOptionsXml}
  ${pageMarginsXml}
  ${pageSetupXml}
</worksheet>`;
}

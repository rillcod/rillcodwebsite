export type RecordsPrintData = {
  title: string;
  sortLabel: string;
  columns: string[];
  rows: Array<Array<string | number>>;
};

/** Export the caller's sorted selection verbatim; never fetch or add credentials. */
export async function createRecordsPdf(data: RecordsPrintData) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: data.title, author: 'Rillcod Technologies' });
  autoTable(doc, {
    head: [data.columns], body: data.rows, startY: 36,
    margin: { top: 36, bottom: 18, left: 12, right: 12 },
    showHead: 'everyPage', rowPageBreak: 'avoid',
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'middle', textColor: [30, 41, 59] },
    headStyles: { fillColor: [26, 58, 143], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 38 } },
    didDrawPage: () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 58, 143);
      doc.text('RILLCOD TECHNOLOGIES', 12, 13);
      doc.setFontSize(16); doc.setTextColor(15, 23, 42); doc.text(data.title, 12, 22);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
      doc.text(`${data.rows.length} records | ${data.sortLabel}`, 12, 29);
      doc.text(new Date().toLocaleDateString('en-GB'), 285, 13, { align: 'right' });
    },
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    doc.text('Confidential - share only with authorised recipients.', 12, 201);
    doc.text(`Page ${page} of ${doc.getNumberOfPages()}`, 285, 201, { align: 'right' });
  }
  return doc;
}

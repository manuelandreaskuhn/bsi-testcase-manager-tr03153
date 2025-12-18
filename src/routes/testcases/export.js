/**
 * Export Routes
 * Handles PDF and DOCX report generation
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { 
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  HeadingLevel
} = require('docx');

const { validateInstance } = require('../../middleware/testcases');
const { REPORT_TEMPLATES_DIR, STATUS_COLORS } = require('../../config/testcases');
const { 
  collectAllTestcases, 
  collectDetailedTestcases,
  groupTestcasesWithVariants 
} = require('../../utils/testcases');

/**
 * GET /api/:instance/export/templates
 * List available DOCX templates
 */
router.get('/:instance/export/templates', validateInstance, async (req, res) => {
  try {
    const templates = [];
    
    // Check built-in templates
    try {
      if (fsSync.existsSync(REPORT_TEMPLATES_DIR)) {
        const files = await fs.readdir(REPORT_TEMPLATES_DIR);
        for (const file of files) {
          if (file.endsWith('.docx')) {
            templates.push({
              name: file.replace('.docx', ''),
              filename: file,
              type: 'builtin',
              path: path.join(REPORT_TEMPLATES_DIR, file)
            });
          }
        }
      }
    } catch (e) { /* ignore */ }
    
    // Check instance-specific templates
    const instanceTemplatesDir = path.join(req.instancePath, '_templates');
    try {
      if (fsSync.existsSync(instanceTemplatesDir)) {
        const files = await fs.readdir(instanceTemplatesDir);
        for (const file of files) {
          if (file.endsWith('.docx')) {
            templates.push({
              name: file.replace('.docx', ''),
              filename: file,
              type: 'instance',
              path: path.join(instanceTemplatesDir, file)
            });
          }
        }
      }
    } catch (e) { /* ignore */ }
    
    res.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/export/pdf
 * Generate PDF report
 */
router.get('/:instance/export/pdf', validateInstance, async (req, res) => {
  try {
    const activeProfiles = req.query.profiles ? req.query.profiles.split(',') : null;
    const filterMode = req.query.filterMode || 'OR';
    
    const modules = await collectAllTestcases(req.testcasesPath, activeProfiles, filterMode);
    
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 40,
      bufferPages: true
    });
    
    const filename = `testcase-report-${req.params.instance}-${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    doc.pipe(res);
    
    const colors = STATUS_COLORS;
    
    // Title page
    doc.fontSize(24).fillColor(colors.primary).text('TestCase Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(colors.gray).text(`Instanz: ${req.params.instance}`, { align: 'center' });
    doc.fontSize(12).text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, { align: 'center' });
    
    if (activeProfiles && activeProfiles.length > 0) {
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(colors.purple).text(
        `Gefiltert nach Profilen (${filterMode}): ${activeProfiles.join(', ')}`, 
        { align: 'center' }
      );
    }
    
    // Calculate statistics
    let totalTestcases = 0;
    let statusCounts = { passed: 0, failed: 0, skipped: 0, open: 0 };
    modules.forEach(mod => {
      mod.categories.forEach(cat => {
        cat.testcases.forEach(tc => {
          totalTestcases++;
          if (tc.status === 'PASSED') statusCounts.passed++;
          else if (tc.status === 'FAILED') statusCounts.failed++;
          else if (tc.status === 'SKIPPED') statusCounts.skipped++;
          else statusCounts.open++;
        });
      });
    });
    
    // Statistics box
    doc.moveDown(2);
    const statsY = doc.y;
    doc.rect(40, statsY, 515, 60).fill(colors.lightGray);
    doc.fillColor('#000000').fontSize(10);
    doc.text(`Gesamt: ${totalTestcases}`, 60, statsY + 15);
    doc.fillColor(colors.success).text(`Bestanden: ${statusCounts.passed}`, 160, statsY + 15);
    doc.fillColor(colors.danger).text(`Fehlgeschlagen: ${statusCounts.failed}`, 280, statsY + 15);
    doc.fillColor(colors.warning).text(`Übersprungen: ${statusCounts.skipped}`, 420, statsY + 15);
    doc.fillColor(colors.gray).text(`Offen: ${statusCounts.open}`, 60, statsY + 35);
    
    const progress = totalTestcases > 0 ? Math.round((statusCounts.passed + statusCounts.skipped) / totalTestcases * 100) : 0;
    doc.fillColor('#000000').text(`Fortschritt: ${progress}%`, 160, statsY + 35);
    
    // Modules
    for (const mod of modules) {
      doc.addPage();
      doc.fontSize(18).fillColor(colors.primary).text(mod.name, { underline: true });
      doc.moveDown(0.5);
      
      for (const cat of mod.categories) {
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(18).fillColor(colors.primary).text(mod.name + ' (Fortsetzung)', { underline: true });
          doc.moveDown(0.5);
        }
        
        doc.fontSize(14).fillColor(colors.gray).text(cat.name);
        doc.moveDown(0.3);
        
        // Table
        const tableTop = doc.y;
        const colWidths = { id: 100, title: 230, profiles: 100, status: 70 };
        const rowHeight = 18;
        
        // Header
        doc.rect(40, tableTop, 515, rowHeight).fill(colors.lightGray);
        doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold');
        doc.text('ID', 45, tableTop + 5, { width: colWidths.id });
        doc.text('Titel', 145, tableTop + 5, { width: colWidths.title });
        doc.text('Profile', 380, tableTop + 5, { width: colWidths.profiles });
        doc.text('Status', 480, tableTop + 5, { width: colWidths.status });
        
        doc.font('Helvetica').fontSize(8);
        let currentY = tableTop + rowHeight;
        
        const grouped = groupTestcasesWithVariants(cat.testcases);
        
        for (const item of grouped) {
          if (currentY > 780) {
            doc.addPage();
            doc.fontSize(14).fillColor(colors.gray).text(cat.name + ' (Fortsetzung)');
            doc.moveDown(0.3);
            currentY = doc.y;
            
            // Repeat header
            doc.rect(40, currentY, 515, rowHeight).fill(colors.lightGray);
            doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold');
            doc.text('ID', 45, currentY + 5);
            doc.text('Titel', 145, currentY + 5);
            doc.text('Profile', 380, currentY + 5);
            doc.text('Status', 480, currentY + 5);
            doc.font('Helvetica').fontSize(8);
            currentY += rowHeight;
          }
          
          if (item.type === 'single' || item.type === 'variant') {
            const tc = item.testcase;
            const profiles = tc.profiles ? tc.profiles.slice(0, 2).join(', ') + (tc.profiles.length > 2 ? '...' : '') : '-';
            
            // Zebra striping
            if (item.type === 'variant' && item.index % 2 === 1) {
              doc.rect(40, currentY, 515, rowHeight).fill('#F9FAFB');
            }
            
            // Status color
            let statusColor = colors.gray;
            let statusText = 'Offen';
            if (tc.status === 'PASSED') { statusColor = colors.success; statusText = 'Bestanden'; }
            else if (tc.status === 'FAILED') { statusColor = colors.danger; statusText = 'Fehler'; }
            else if (tc.status === 'SKIPPED') { statusColor = colors.warning; statusText = 'Übersp.'; }
            
            doc.fillColor(colors.primary).text(tc.id, 45, currentY + 5, { width: colWidths.id });
            doc.fillColor('#000000').text((tc.title || '').substring(0, 50), 145, currentY + 5, { width: colWidths.title });
            doc.fillColor(colors.gray).text(profiles, 380, currentY + 5, { width: colWidths.profiles });
            doc.fillColor(statusColor).text(statusText, 480, currentY + 5, { width: colWidths.status });
            
            currentY += rowHeight;
          }
        }
        
        doc.y = currentY + 10;
        doc.moveDown(0.5);
      }
    }
    
    // Page numbers
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(colors.gray);
      doc.text(`Seite ${i + 1} von ${pageCount}`, 40, 810, { align: 'center', width: 515 });
    }
    
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/:instance/export/docx
 * Generate DOCX report programmatically
 */
router.get('/:instance/export/docx', validateInstance, async (req, res) => {
  try {
    const activeProfiles = req.query.profiles ? req.query.profiles.split(',') : null;
    const filterMode = req.query.filterMode || 'OR';
    
    const data = await collectDetailedTestcases(req.testcasesPath, activeProfiles, filterMode);
    const date = new Date().toLocaleDateString('de-DE');
    
    // Generate programmatically for reliability
    const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
    const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };
    
    const getStatusColor = (status) => {
      switch (status) {
        case 'PASSED': return '16A34A';
        case 'FAILED': return 'DC2626';
        case 'SKIPPED': return 'CA8A04';
        default: return '6B7280';
      }
    };
    
    const children = [];
    
    // Title
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'TR-03153 TestCase Report', color: '6B7280', size: 24 })]
    }));
    
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: req.params.instance, bold: true, size: 48 })]
    }));
    
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `Erstellt am: ${date}`, color: '6B7280', size: 20 })]
    }));
    
    // Filter info
    if (activeProfiles && activeProfiles.length > 0) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ 
          text: `Gefiltert nach Profilen (${filterMode}): ${activeProfiles.join(', ')}`, 
          color: '9333EA', 
          size: 18 
        })]
      }));
    }
    
    // Statistics heading
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Übersicht', bold: true })]
    }));
    
    // Statistics table
    children.push(new Table({
      columnWidths: [1560, 1560, 1560, 1560, 1560, 1560],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({ borders: cellBorders, shading: { fill: 'F3F4F6', type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Gesamt', bold: true })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: 'DCFCE7', type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Bestanden', bold: true, color: '16A34A' })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: 'FEE2E2', type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Fehlgeschlagen', bold: true, color: 'DC2626' })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: 'FEF3C7', type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Übersprungen', bold: true, color: 'CA8A04' })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: 'F3F4F6', type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Offen', bold: true, color: '6B7280' })] })] }),
            new TableCell({ borders: cellBorders, shading: { fill: 'DBEAFE', type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Fortschritt', bold: true, color: '2563EB' })] })] }),
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(data.statistics.total) })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(data.statistics.passed), color: '16A34A' })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(data.statistics.failed), color: 'DC2626' })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(data.statistics.skipped), color: 'CA8A04' })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(data.statistics.open), color: '6B7280' })] })] }),
            new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${data.statistics.progress}%`, color: '2563EB' })] })] }),
          ]
        })
      ]
    }));
    
    children.push(new Paragraph({ text: '' }));
    
    // Modules
    for (const mod of data.modules) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400 },
        children: [new TextRun({ text: mod.name, bold: true })]
      }));
      
      children.push(new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ 
          text: `TestCases: ${mod.testcaseCount} | Bestanden: ${mod.passedCount} | Fehlgeschlagen: ${mod.failedCount} | Übersprungen: ${mod.skippedCount} | Offen: ${mod.openCount}`,
          color: '6B7280',
          size: 20
        })]
      }));
      
      // Categories
      for (const cat of mod.categories) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: cat.name, bold: true })]
        }));
        
        // Testcases table
        const tableRows = [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ borders: cellBorders, width: { size: 1500, type: WidthType.DXA }, shading: { fill: 'F3F4F6', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'ID', bold: true })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 4000, type: WidthType.DXA }, shading: { fill: 'F3F4F6', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Titel', bold: true })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'F3F4F6', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Profile', bold: true })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1500, type: WidthType.DXA }, shading: { fill: 'F3F4F6', type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true })] })] }),
            ]
          })
        ];
        
        for (const tc of cat.testcases) {
          tableRows.push(new TableRow({
            children: [
              new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: tc.id || '', color: '2563EB' })] })] }),
              new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: tc.title || '' })] })] }),
              new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: tc.profilesText || '-', color: '6B7280', size: 18 })] })] }),
              new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: tc.statusText || 'Offen', color: getStatusColor(tc.status) })] })] }),
            ]
          }));
        }
        
        children.push(new Table({
          columnWidths: [1500, 4000, 2000, 1500],
          rows: tableRows
        }));
        
        children.push(new Paragraph({ text: '' }));
      }
    }
    
    // Footer
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [new TextRun({ text: 'Generiert mit TR-03153 TestCase Manager', color: '9CA3AF', size: 18 })]
    }));
    
    // Create document
    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
        },
        children: children
      }]
    });
    
    const output = await Packer.toBuffer(doc);
    
    const filename = `testcase-report-${req.params.instance}-${new Date().toISOString().split('T')[0]}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', output.length);
    
    res.send(output);
  } catch (error) {
    console.error('Error generating DOCX:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

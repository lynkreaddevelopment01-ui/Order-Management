const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { getDb } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Helper: get admin_id for data scoping
function getAdminId(req) {
    return req.user.id;
}

// Generate PDF for a single order
router.get('/order-pdf/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const order = await db.prepare(`
      SELECT o.*, c.customer_id_external, c.name as customer_name, c.phone as customer_phone, 
             c.email as customer_email, c.address as customer_address, c.city as customer_city,
             a.company_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN admins a ON o.admin_id = a.id
      WHERE o.id = $1 AND o.admin_id = $2
    `).get([req.params.id, adminId]);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await db.prepare('SELECT * FROM order_items WHERE order_id = $1').all([order.id]);

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Order-${order.order_number}.pdf`);

        doc.pipe(res);

        // Header
        doc.fontSize(22).font('Helvetica-Bold').text(order.company_name || 'Medical Orders', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(12).font('Helvetica').text('Order Invoice', { align: 'center' });
        doc.moveDown(1);

        // Divider
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#0ea5e9');
        doc.moveDown(1);

        // Order Info
        doc.fontSize(11).font('Helvetica-Bold').text('Order Details');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Order Number: ${order.order_number}`);
        doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`);
        doc.text(`Status: ${order.status.toUpperCase()}`);
        doc.moveDown(0.5);

        // Customer Info
        doc.fontSize(11).font('Helvetica-Bold').text('Customer Details');
        doc.fontSize(10).font('Helvetica');
        if (order.customer_id_external) doc.text(`Customer ID: ${order.customer_id_external}`);
        doc.text(`Name: ${order.customer_name}`);
        doc.text(`Phone: ${order.customer_phone}`);
        if (order.customer_email) doc.text(`Email: ${order.customer_email}`);
        if (order.customer_address) doc.text(`Address: ${order.customer_address}`);
        if (order.customer_city) doc.text(`City: ${order.customer_city}`);
        doc.moveDown(1);

        // Items Table Header
        const tableTop = doc.y;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('#', 40, tableTop);
        doc.text('Item', 60, tableTop);
        doc.text('Qty', 210, tableTop);
        doc.text('PTR rate', 250, tableTop);
        doc.text('MRP', 310, tableTop, { align: 'right', width: 50 });
        doc.text('Offer', 380, tableTop);
        doc.text('Bonus', 500, tableTop);

        doc.moveTo(40, tableTop + 15).lineTo(560, tableTop + 15).stroke('#e2e8f0');

        // Items
        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(8.5);
        const skippedOffers = [];
        let totalDist = 0;
        let totalMRP = 0;

        items.forEach((item, i) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }
            doc.text(`${i + 1}`, 40, y);
            doc.text(item.item_name, 60, y, { width: 140 });
            doc.text(`${item.quantity}`, 210, y);

            const dp = parseFloat(item.dist_price) || 0;
            const mrp = parseFloat(item.mrp) || 0;
            totalDist += (dp * item.quantity);
            totalMRP += (mrp * item.quantity);

            doc.text(dp ? dp.toFixed(2) : '—', 250, y);
            doc.text(mrp ? mrp.toFixed(2) : '—', 310, y, { align: 'right', width: 50 });

            // Clean table: only successful offers shown here
            doc.text(item.applied_offer || '—', 380, y, { width: 110 });
            doc.text(item.bonus_quantity > 0 ? `+${item.bonus_quantity}` : '—', 510, y);

            if (item.offer_skipped) {
                skippedOffers.push(item.item_name);
            }
            y += 20;
        });

        // Totals for Dist/MRP
        if (totalDist > 0 || totalMRP > 0) {
            y += 5;
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text('TOTAL:', 60, y);
            doc.text(totalDist > 0 ? totalDist.toFixed(2) : '—', 250, y);
            doc.text(totalMRP > 0 ? totalMRP.toFixed(2) : '—', 310, y, { align: 'right', width: 50 });
            y += 15;
        }

        // Divider
        doc.moveTo(40, y).lineTo(560, y).stroke('#e2e8f0');
        y += 10;

        // Custom Notes/Warnings Section
        if (skippedOffers.length > 0 || order.notes) {
            doc.y = y;
            if (doc.y > 650) doc.addPage();

            // Clean legacy notes
            let cleanNote = order.notes || '';
            const legacyPattern = /Offer \(.*?\) for ".*?" could not be applied due to low stock\. Team will contact you\./g;
            cleanNote = cleanNote.replace(legacyPattern, '').trim();

            if (skippedOffers.length > 0) {
                doc.moveDown(1);
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('Customer Note');
                doc.fontSize(9).font('Helvetica').fillColor('#ef4444').text('Offer Not applied due to Low stock:');
                skippedOffers.forEach(name => {
                    doc.text(`- ${name} - Team will contact you`);
                });
                doc.fillColor('#000000');
            }

            if (cleanNote) {
                doc.moveDown(0.5);
                if (skippedOffers.length === 0) doc.fontSize(10).font('Helvetica-Bold').text('Customer Note');
                doc.fontSize(9).font('Helvetica').text(cleanNote);
            }
        }

        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate Excel for a single order
router.get('/order-excel/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const order = await db.prepare(`
      SELECT o.*, c.customer_id_external, c.name as customer_name, c.phone as customer_phone,
             c.email as customer_email, c.address as customer_address, c.city as customer_city,
             a.company_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN admins a ON o.admin_id = a.id
      WHERE o.id = $1 AND o.admin_id = $2
    `).get([req.params.id, adminId]);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await db.prepare('SELECT * FROM order_items WHERE order_id = $1').all([order.id]);

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Order');

        // Styling
        const headerStyle = { font: { bold: true, size: 14 }, alignment: { horizontal: 'center' } };
        const subHeaderStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } } };

        // Title
        sheet.mergeCells('A1:E1');
        sheet.getCell('A1').value = order.company_name || 'Medical Orders';
        sheet.getCell('A1').style = headerStyle;

        // Order details
        sheet.getCell('A3').value = 'Order Number:';
        sheet.getCell('B3').value = order.order_number;
        sheet.getCell('A4').value = 'Date:';
        sheet.getCell('B4').value = new Date(order.created_at).toLocaleString();
        sheet.getCell('A5').value = 'Customer ID:';
        sheet.getCell('B5').value = order.customer_id_external || '—';
        sheet.getCell('A6').value = 'Customer:';
        sheet.getCell('B6').value = order.customer_name;
        sheet.getCell('A7').value = 'Phone:';
        sheet.getCell('B7').value = order.customer_phone;
        sheet.getCell('A8').value = 'Status:';
        sheet.getCell('B8').value = order.status.toUpperCase();

        // Column headers
        const headerRow = sheet.getRow(10);
        ['#', 'Item Name', 'Quantity', 'PTR rate', 'MRP', 'Bonus Qty', 'Offer Applied'].forEach((h, i) => {
            headerRow.getCell(i + 1).value = h;
            headerRow.getCell(i + 1).style = subHeaderStyle;
        });

        // Data
        const skippedOffers = [];
        let totalDist = 0;
        let totalMRP = 0;

        items.forEach((item, i) => {
            const row = sheet.getRow(11 + i);
            row.getCell(1).value = i + 1;
            row.getCell(2).value = item.item_name;
            row.getCell(3).value = item.quantity;

            const dp = parseFloat(item.dist_price) || 0;
            const m = parseFloat(item.mrp) || 0;
            totalDist += (dp * item.quantity);
            totalMRP += (m * item.quantity);

            row.getCell(4).value = dp || '—';
            row.getCell(5).value = m || '—';
            row.getCell(6).value = item.bonus_quantity || 0;

            // Clean table: only show successful offers
            row.getCell(7).value = item.applied_offer || '—';

            if (item.offer_skipped) {
                skippedOffers.push({ name: item.item_name, offer: item.missed_offer_text });
            }
        });

        let nextRow = 11 + items.length;
        // Summary Row for sums
        const sumRow = sheet.getRow(nextRow);
        sumRow.getCell(2).value = 'TOTAL';
        sumRow.getCell(2).font = { bold: true };
        sumRow.getCell(4).value = totalDist || 0;
        sumRow.getCell(5).value = totalMRP || 0;
        sumRow.font = { bold: true };
        nextRow += 2;
        if (skippedOffers.length > 0) {
            sheet.getCell(`A${nextRow}`).value = 'CUSTOMER NOTE:';
            sheet.getCell(`A${nextRow}`).font = { bold: true };
            sheet.getCell(`B${nextRow}`).value = 'Offer Not applied due to Low stock:';
            nextRow++;
            skippedOffers.forEach(o => {
                sheet.getCell(`B${nextRow}`).value = `- ${o.name} - Team will contact you`;
                nextRow++;
            });
            nextRow++;
        }

        let cleanNote = order.notes || '';
        const legacyPattern = /Offer \(.*?\) for ".*?" could not be applied due to low stock\. Team will contact you\./g;
        cleanNote = cleanNote.replace(legacyPattern, '').trim();

        if (cleanNote) {
            sheet.getCell(`A${nextRow}`).value = 'CUSTOMER NOTE:';
            sheet.getCell(`A${nextRow}`).font = { bold: true };
            sheet.getCell(`B${nextRow}`).value = cleanNote;
        }

        // Column widths
        sheet.columns = [
            { width: 5 }, { width: 35 }, { width: 12 }, { width: 12 }, { width: 20 }
        ];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Order-${order.order_number}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate consolidated PDF of all orders for this admin
router.get('/all-orders-pdf', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const { from, to, status } = req.query;

        const admin = await db.prepare('SELECT company_name FROM admins WHERE id = $1').get([adminId]);

        let queryStr = `
      SELECT o.*, c.customer_id_external, c.name as customer_name, c.phone as customer_phone, c.city as customer_city
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.admin_id = $1
    `;
        const params = [adminId];
        let pIndex = 2;

        if (from) { queryStr += ` AND o.created_at::DATE >= $${pIndex++}`; params.push(from); }
        if (to) { queryStr += ` AND o.created_at::DATE <= $${pIndex++}`; params.push(to); }
        if (status) { queryStr += ` AND o.status = $${pIndex++}`; params.push(status); }
        queryStr += ' ORDER BY o.created_at DESC';

        const orders = await db.prepare(queryStr).all(params);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=All-Orders-Report.pdf`);

        doc.pipe(res);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text(admin?.company_name || 'Medical Orders', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text('Consolidated Orders Report', { align: 'center' });
        doc.fontSize(9).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(1);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#0ea5e9');
        doc.moveDown(0.5);

        doc.fontSize(10).text(`Total Orders: ${orders.length}`);
        doc.moveDown(1);

        // Table Header
        const drawTableHeader = (y) => {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(40, y - 3, 515, 18).fill('#0ea5e9');
            doc.fillColor('#ffffff');
            doc.text('#', 45, y);
            doc.text('Order No', 60, y);
            doc.text('Cust ID', 135, y);
            doc.text('Customer', 195, y);
            doc.text('Phone', 320, y);
            doc.text('Date', 410, y);
            doc.text('Status', 505, y);
            doc.fillColor('#000000');
            return y + 20;
        };

        let y = drawTableHeader(doc.y);

        doc.font('Helvetica').fontSize(8);
        orders.forEach((order, i) => {
            if (y > 750) {
                doc.addPage();
                y = drawTableHeader(50);
                doc.font('Helvetica').fontSize(8);
            }

            if (i % 2 === 0) {
                doc.rect(40, y - 3, 515, 16).fill('#f0f9ff');
                doc.fillColor('#000000');
            }

            doc.text(`${i + 1}`, 45, y);
            doc.text(order.order_number, 60, y);
            doc.text(order.customer_id_external || '—', 135, y, { width: 55 });
            doc.text(order.customer_name, 195, y, { width: 105 });
            doc.text(order.customer_phone, 320, y);
            doc.text(new Date(order.created_at).toLocaleDateString(), 410, y);
            doc.text(order.status, 505, y);
            y += 18;
        });

        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate consolidated Excel of all orders for this admin
router.get('/all-orders-excel', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const adminId = getAdminId(req);
        const { from, to, status } = req.query;

        const admin = await db.prepare('SELECT company_name FROM admins WHERE id = $1').get([adminId]);

        let queryStr = `
      SELECT o.*, c.customer_id_external, c.name as customer_name, c.phone as customer_phone, c.city as customer_city
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.admin_id = $1
    `;
        const params = [adminId];
        let pIndex = 2;

        if (from) { queryStr += ` AND o.created_at::DATE >= $${pIndex++}`; params.push(from); }
        if (to) { queryStr += ` AND o.created_at::DATE <= $${pIndex++}`; params.push(to); }
        if (status) { queryStr += ` AND o.status = $${pIndex++}`; params.push(status); }
        queryStr += ' ORDER BY o.created_at DESC';

        const orders = await db.prepare(queryStr).all(params);

        const workbook = new ExcelJS.Workbook();

        // Summary Sheet
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.mergeCells('A1:F1');
        summarySheet.getCell('A1').value = `${admin?.company_name || 'Medical Orders'} - Orders Report`;
        summarySheet.getCell('A1').style = { font: { bold: true, size: 16 }, alignment: { horizontal: 'center' } };

        summarySheet.getCell('A3').value = `Generated: ${new Date().toLocaleString()}`;
        summarySheet.getCell('A4').value = `Total Orders: ${orders.length}`;

        // Headers
        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } },
            alignment: { horizontal: 'center' }
        };

        const headers = ['#', 'Order Number', 'Customer ID', 'Customer Name', 'Phone', 'City', 'Status', 'Date'];
        const headerRow = summarySheet.getRow(7);
        headers.forEach((h, i) => {
            headerRow.getCell(i + 1).value = h;
            headerRow.getCell(i + 1).style = headerStyle;
        });

        orders.forEach((order, i) => {
            const row = summarySheet.getRow(8 + i);
            row.getCell(1).value = i + 1;
            row.getCell(2).value = order.order_number;
            row.getCell(3).value = order.customer_id_external || '';
            row.getCell(4).value = order.customer_name;
            row.getCell(5).value = order.customer_phone;
            row.getCell(6).value = order.customer_city || '';
            row.getCell(7).value = order.status;
            row.getCell(8).value = new Date(order.created_at).toLocaleString();
        });

        summarySheet.columns = [
            { width: 5 }, { width: 18 }, { width: 14 }, { width: 22 }, { width: 16 },
            { width: 14 }, { width: 12 }, { width: 20 }
        ];

        // Detailed Items Sheet
        const detailSheet = workbook.addWorksheet('Order Details');
        const detailHeaders = ['Order No', 'Customer', 'Item', 'Qty', 'PTR rate', 'MRP', 'Bonus', 'Applied Offer'];
        const detailHeaderRow = detailSheet.getRow(1);
        detailHeaders.forEach((h, i) => {
            detailHeaderRow.getCell(i + 1).value = h;
            detailHeaderRow.getCell(i + 1).style = headerStyle;
        });

        let rowNum = 2;
        for (const order of orders) {
            const items = await db.prepare('SELECT * FROM order_items WHERE order_id = $1').all([order.id]);
            for (const item of items) {
                const row = detailSheet.getRow(rowNum);
                row.getCell(1).value = order.order_number;
                row.getCell(2).value = order.customer_name;
                row.getCell(3).value = item.item_name;
                row.getCell(4).value = item.quantity;
                row.getCell(5).value = item.dist_price || 0;
                row.getCell(6).value = item.mrp || 0;
                row.getCell(7).value = item.bonus_quantity || 0;
                row.getCell(8).value = item.applied_offer || '—';
                rowNum++;
            }
        }

        detailSheet.columns = [
            { width: 18 }, { width: 22 }, { width: 30 }, { width: 8 },
            { width: 8 }, { width: 15 }
        ];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=All-Orders-Report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

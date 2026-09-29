# Spice Garden - Restaurant POS, CRM & Billing System
### **Developed By APTAIC** • *Think Digital. Think APTAIC*

A comprehensive, enterprise-ready Restaurant Management, Point of Sale (POS), CRM, Table Management, Recipe Bill of Materials (BOM), Inventory Auto-Deductions, and GST Billing system built for **Spice Garden** (Sector 62, Noida, UP).

---

## 🔐 1. Login & Single-System Session Security

- **User ID**: `12345`
- **Password**: `12345`
- **Single-System Enforcement**:
  - The application strictly enforces **single-device / single-session access**.
  - If a user logs in from another computer, browser, or smartphone, any previously active system is **automatically logged out** within 3 seconds, showing a session termination security alert.

---

## 📱 2. Contactless Table QR Ordering (Scan & Order)

- **Network Wi-Fi QR Access**:
  - Mobile diners connected to the same Wi-Fi router can scan the Table QR Standee with their phone camera to instantly open:
    ```text
    http://10.59.187.160:3000/menu.html?table=T1
    ```
  - **No external domain errors**: Directly reaches the dedicated customer mobile menu on your local network.
  - Diners select dishes, enter their name/phone, and submit their order straight into the Kitchen Display System (KDS).
- **Printable Table Tent Cards / Standees**:
  - Click **"Print Standee"** on any table (or **"Print All QR Tent Cards"**) to generate restaurant-grade acrylic table standees with the Table Number, scannable QR code, diner instructions, and Aptaic branding.

---

## 🖨️ 3. Dual Receipt Printing (Thermal 80mm & Standard A4/A5)

In the Tax Invoice view, choose between two dedicated printing formats:
1. **Thermal 80mm Printer (3-inch roll)**:
   - Compact width (300px / 80mm), monospace receipt font, dashed dividers, itemized line items, tax breakdown, scannable UPI payment QR code, and Aptaic footer branding.
2. **Normal / Standard A4/A5 Printer**:
   - Full-width formal GST Tax Invoice, official tabular borders, customer billing information, B2B GSTIN, itemized CGST & SGST columns, UPI payment QR code, and Aptaic branding.

---

## 💳 4. Dynamic UPI Payment QR Code Integration

- Automatically generates standard **NPCI-compliant UPI payment QR codes**:
  ```text
  upi://pay?pa=spicegarden@upi&pn=Spice%20Garden&am=693.00&cu=INR&tn=Order_101
  ```
- Customers can scan using **Google Pay, PhonePe, Paytm, or BHIM**.
- **Configurable UPI ID**: In **Settings & UPI**, enter your real UPI ID (e.g. `yourphone@paytm` or `name@okhdfcbank`) so payments transfer directly into your restaurant bank account.
- Embedded directly in the Settlement Modal and printed on all receipts (both thermal & normal).

---

## 📊 5. Comprehensive Reports & Modular CSV Exports for ALL Modules

Navigate to the **Reports & Analytics** tab (or click the **Export CSV** button in any module's toolbar) for:
1. **Master Audit Report**: One-click **"Export All Modules (Master CSV)"** combining executive financial summary, top dish rankings, invoices audit trail, inventory valuation, menu catalog, tables status, kitchen orders, CRM directory, and staff payroll into one unified workbook.
2. **Sales & Revenue Report**: Gross revenue, net taxable sales, total CGST + SGST collected, average order value, payment method share (UPI, Cash, Card).
3. **GST Invoices Register**: Full ledger with invoice numbers, customer details, taxable values, CGST, SGST, grand total, and payment modes.
4. **Dish Popularity & Menu Performance**: Ranked dish sales by portion count and revenue generated, plus full menu catalog pricing export.
5. **Dining Tables & Seating Utilization**: Table capacity, current status, active orders, and QR ordering URLs.
6. **Kitchen Operations (KDS Log)**: Order tickets queue, cooking status, item quantities, and timestamps.
7. **Inventory Valuation & Safety Stock**: Real-time holding valuation (₹), unit costs, safety thresholds, and low-stock reorder warnings.
8. **Recipe Bill of Materials (BOM)**: Exact dish-to-ingredient linkages and raw material consumption cost breakdown.
9. **Customer CRM Directory**: Complete guest directory with contact numbers, addresses, GST numbers, order frequencies, and lifetime spend.
10. **Staff Register & Payroll**: Team roster with designations, active employment status, and monthly payroll expenses.
11. **One-Click Batch Download**: Click **"Batch All CSVs"** to download dedicated CSV reports for all modules sequentially.
12. **Printable Executive Summary**: Click **"Print Full Report"** for official management summary with APTAIC branding.

---

## ✏️ 6. Full CRUD Across All Modules

- **Menu Dishes**: Add new dishes, edit pricing, update GST slabs (5%/12%), and delete items.
- **Tables**: Add tables, edit seating capacity, delete tables.
- **Inventory / Raw Materials**: Add raw materials, edit alert thresholds, delete materials, quick restock.
- **Recipe BOM**: Map dishes to raw materials (e.g. 1 Paneer Tikka ➔ 0.2 kg Paneer) with auto-deductions.
- **Customers (CRM)**: Add, edit, delete customer records with B2B GSTIN.
- **Staff Directory**: Add, edit, delete staff members with monthly salary tracking.
- **Restaurant Profile**: Update restaurant name, address, GSTIN, phone, and UPI payment credentials.

---

## 🚀 Running the System

```powershell
cd C:\Users\agraw\.gemini\antigravity\scratch\spice-garden-pos
node server.js
```
- **Management Dashboard**: `http://localhost:3000`
- **Network / Mobile QR Access**: `http://10.59.187.160:3000/menu.html?table=T1`

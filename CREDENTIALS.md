# 🏥 Medical Order Management — Credentials & Architecture

## Architecture Overview

| Role | Purpose | Creates |
|------|---------|--------|
| **Super Admin** | Platform owner | Creates Admin companies |
| **Admin** | A company/tenant | Creates customers, manages stock, orders, offers |
| **Customer** | End user | Places orders via unique URL |

Each **Admin = a company** with its own isolated stock, customers, orders, and offers.

---

## Login Credentials

### Super Admin (Platform Owner)
| Field    | Value         |
|----------|---------------|
| Username | `superadmin`  |
| Password | `admin123`    |
| Role     | `superadmin`  |

> **Super Admin** manages the entire platform: creates admin companies, views platform-wide stats.

### Admin (Company)
Created by the **Super Admin** under **Manage Companies**.

| Field        | Value                       |
|--------------|-----------------------------|
| Company Name | *(set by Super Admin)*      |
| Admin Name   | *(set by Super Admin)*      |
| Username     | *(set by Super Admin)*      |
| Password     | *(set by Super Admin)*      |
| Role         | `admin`                     |

> **Admin** manages their own company: stock, customers, orders, special offers, and reports. They **cannot** see data from other companies.

---

## Access URLs

| Page              | URL                                         |
|-------------------|---------------------------------------------|
| Admin Login       | `http://localhost:3000/admin`                |
| Admin Dashboard   | `http://localhost:3000/admin/dashboard`      |
| Customer Portal   | `http://localhost:3000/order/{unique-code}` (Login via CustomerID) |

---

## CSV Import Formats

### Customer CSV
```
CustomerID, Customer Name, Address, PhoneNumber
```
Optional columns: `email`, `city`

### Stock CSV
```
Product Name, Qty, Exclusive Offer
```
Optional columns: `item_code`, `category`, `unit`, `price`

> If `item_code` is not provided, it will be auto-generated as `PRD-0001`, `PRD-0002`, etc.
> If `Exclusive Offer` column has text, a special offer is automatically created for that product.

---

## ⚠️ Important
- **Change the default super admin password** after first login in production.
- The JWT secret key is defined in `middleware/auth.js` — update it for production.

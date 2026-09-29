const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const INITIAL_FILE = path.join(DATA_DIR, 'initial_data.json');

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const dev in ifaces) {
    for (const details of ifaces[dev]) {
      if (details.family === 'IPv4' && !details.internal && !details.address.startsWith('169.254')) {
        return details.address;
      }
    }
  }
  return 'localhost';
}

const LAN_IP = getLanIp();

function loadDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const initialContent = fs.readFileSync(INITIAL_FILE, 'utf8');
    fs.writeFileSync(DB_FILE, initialContent, 'utf8');
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!data.restaurant.upi_id) data.restaurant.upi_id = 'spicegarden@upi';
    if (!data.restaurant.upi_name) data.restaurant.upi_name = data.restaurant.name || 'Spice Garden';
    if (!data.restaurant.base_url) data.restaurant.base_url = `http://${LAN_IP}:${PORT}`;
    
    data.tables.forEach(t => {
      if (!t.qr_url || t.qr_url.includes('crm.com')) {
        t.qr_url = `${data.restaurant.base_url}/menu.html?table=${t.table_number}`;
      }
    });

    return data;
  } catch (err) {
    console.error('Error reading db.json, reverting to initial:', err);
    const initialContent = fs.readFileSync(INITIAL_FILE, 'utf8');
    fs.writeFileSync(DB_FILE, initialContent, 'utf8');
    return JSON.parse(initialContent);
  }
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Note: File system is read-only in serverless/cloud environment.', err);
  }
}

let db = loadDatabase();

let activeSession = {
  token: null,
  userId: null,
  loginTime: null,
  deviceInfo: null,
  ip: null
};

function calculateOrderTotals(items, menuList) {
  let total = 0;
  let gstTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;

  const itemDetails = items.map(cartItem => {
    const menuItem = menuList.find(m => m.item_id === Number(cartItem.item_id));
    if (!menuItem) {
      throw new Error(`Menu item with ID ${cartItem.item_id} not found`);
    }
    const qty = Number(cartItem.qty) || 1;
    const itemSubtotal = menuItem.price * qty;
    const itemGstRate = menuItem.gst || 5;
    const itemGstAmount = Math.round((itemSubtotal * (itemGstRate / 100)) * 100) / 100;
    const itemCgst = Math.round((itemGstAmount / 2) * 100) / 100;
    const itemSgst = Math.round((itemGstAmount / 2) * 100) / 100;

    total += itemSubtotal;
    gstTotal += itemGstAmount;
    cgstTotal += itemCgst;
    sgstTotal += itemSgst;

    return {
      item_id: menuItem.item_id,
      name: menuItem.name,
      category: menuItem.category,
      price: menuItem.price,
      qty: qty,
      subtotal: itemSubtotal,
      gst_rate: itemGstRate,
      gst_amount: itemGstAmount,
      cgst: itemCgst,
      sgst: itemSgst
    };
  });

  const grandTotal = Math.round((total + gstTotal) * 100) / 100;

  return {
    items: itemDetails,
    total: Math.round(total * 100) / 100,
    gst: Math.round(gstTotal * 100) / 100,
    cgst: Math.round(cgstTotal * 100) / 100,
    sgst: Math.round(sgstTotal * 100) / 100,
    grand_total: grandTotal
  };
}

app.post('/api/auth/login', (req, res) => {
  const { userId, password, deviceInfo } = req.body;
  if (userId === '12345' && password === '12345') {
    const newToken = 'apt_sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    activeSession = {
      token: newToken,
      userId: userId,
      loginTime: new Date().toISOString(),
      deviceInfo: deviceInfo || 'Web Browser',
      ip: clientIp
    };

    return res.json({
      success: true,
      token: newToken,
      user: {
        userId: '12345',
        name: 'Manager',
        role: 'Administrator'
      },
      message: 'Login successful'
    });
  }

  return res.status(401).json({ success: false, error: 'Invalid User ID or Password' });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '') || req.query.token;

  if (!token) {
    return res.status(401).json({ valid: false, error: 'No active session token provided' });
  }

  if (activeSession.token && token === activeSession.token) {
    return res.json({ valid: true, session: activeSession });
  } else {
    return res.status(401).json({
      valid: false,
      reason: 'SESSION_TERMINATED',
      error: 'Another user logged into this account from another system/device. Your session was automatically terminated.'
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (activeSession.token === token) {
    activeSession = { token: null, userId: null, loginTime: null, deviceInfo: null, ip: null };
  }
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/restaurant', (req, res) => {
  res.json({
    restaurant: db.restaurant,
    network: {
      lan_ip: LAN_IP,
      port: PORT,
      recommended_base_url: `http://${LAN_IP}:${PORT}`
    },
    branding: {
      developed_by: "Aptaic",
      tagline: "Think Digital. Think APTAIC",
      logo_path: "/assets/aptaic_logo.png"
    },
    stats: {
      total_tables: db.tables.length,
      available_tables: db.tables.filter(t => t.status === 'available').length,
      occupied_tables: db.tables.filter(t => t.status === 'occupied').length,
      total_menu_items: db.menu.length,
      total_orders: db.orders.length,
      active_orders: db.orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length,
      low_stock_count: db.inventory.filter(i => i.stock <= i.min_stock).length,
      total_revenue: db.payments.reduce((acc, p) => p.status === 'paid' ? acc + (Number(p.amount) || 0) : acc, 0)
    }
  });
});

app.put('/api/restaurant', (req, res) => {
  const { name, gst_number, address, phone, upi_id, upi_name, base_url } = req.body;
  if (name) db.restaurant.name = name;
  if (gst_number !== undefined) db.restaurant.gst_number = gst_number;
  if (address !== undefined) db.restaurant.address = address;
  if (phone !== undefined) db.restaurant.phone = phone;
  if (upi_id !== undefined) db.restaurant.upi_id = upi_id;
  if (upi_name !== undefined) db.restaurant.upi_name = upi_name;
  if (base_url !== undefined) {
    db.restaurant.base_url = base_url.replace(/\/$/, '');
    db.tables.forEach(t => {
      t.qr_url = `${db.restaurant.base_url}/menu.html?table=${t.table_number}`;
    });
  }

  saveDatabase(db);
  res.json({ message: 'Restaurant settings updated', restaurant: db.restaurant });
});

app.get('/api/tables', (req, res) => {
  const tablesWithOrders = db.tables.map(table => {
    const activeOrder = db.orders.find(o => o.table_id === table.table_id && o.status !== 'completed' && o.status !== 'cancelled');
    return {
      ...table,
      active_order: activeOrder || null
    };
  });
  res.json(tablesWithOrders);
});

app.post('/api/tables', (req, res) => {
  const { table_number, capacity, qr_url } = req.body;
  if (!table_number) {
    return res.status(400).json({ error: 'Table number is required' });
  }
  const nextId = db.tables.length > 0 ? Math.max(...db.tables.map(t => t.table_id)) + 1 : 1;
  const num = table_number.trim();
  const baseUrl = db.restaurant.base_url || `http://${LAN_IP}:${PORT}`;
  const newTable = {
    table_id: nextId,
    table_number: num,
    capacity: Number(capacity) || 4,
    qr_url: qr_url || `${baseUrl}/menu.html?table=${num}`,
    status: 'available'
  };
  db.tables.push(newTable);
  saveDatabase(db);
  res.status(201).json(newTable);
});

app.put('/api/tables/:id', (req, res) => {
  const tableId = Number(req.params.id);
  const table = db.tables.find(t => t.table_id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const { table_number, capacity, status, qr_url } = req.body;
  if (table_number !== undefined) {
    table.table_number = table_number.trim();
    if (!qr_url) {
      const baseUrl = db.restaurant.base_url || `http://${LAN_IP}:${PORT}`;
      table.qr_url = `${baseUrl}/menu.html?table=${table.table_number}`;
    }
  }
  if (capacity !== undefined) table.capacity = Number(capacity);
  if (status !== undefined) table.status = status;
  if (qr_url !== undefined) table.qr_url = qr_url;

  saveDatabase(db);
  res.json(table);
});

app.delete('/api/tables/:id', (req, res) => {
  const tableId = Number(req.params.id);
  const index = db.tables.findIndex(t => t.table_id === tableId);
  if (index === -1) return res.status(404).json({ error: 'Table not found' });

  const activeOrder = db.orders.find(o => o.table_id === tableId && o.status !== 'completed' && o.status !== 'cancelled');
  if (activeOrder) {
    return res.status(400).json({ error: `Cannot delete Table ${db.tables[index].table_number}: Active order #${activeOrder.order_id} is in progress.` });
  }

  const deleted = db.tables.splice(index, 1);
  saveDatabase(db);
  res.json({ message: 'Table deleted successfully', table: deleted[0] });
});

app.get('/api/menu', (req, res) => {
  const enrichedMenu = db.menu.map(item => {
    const itemRecipes = db.recipes.filter(r => r.menu_item_id === item.item_id);
    let maxServings = Infinity;
    const ingredients = itemRecipes.map(r => {
      const inv = db.inventory.find(i => i.inventory_id === r.inventory_id);
      if (inv) {
        const servingsFromThis = inv.stock / r.qty_required;
        if (servingsFromThis < maxServings) maxServings = servingsFromThis;
        return {
          inventory_id: inv.inventory_id,
          name: inv.name,
          unit: inv.unit,
          qty_required: r.qty_required,
          current_stock: inv.stock
        };
      }
      return null;
    }).filter(Boolean);

    return {
      ...item,
      recipes: ingredients,
      available_servings: maxServings === Infinity ? 999 : Math.floor(Math.max(0, maxServings))
    };
  });
  res.json(enrichedMenu);
});

app.post('/api/menu', (req, res) => {
  const { name, category, price, gst, description, is_veg } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Dish name and price are required' });
  }
  const nextId = db.menu.length > 0 ? Math.max(...db.menu.map(m => m.item_id)) + 1 : 1;
  const newItem = {
    item_id: nextId,
    name: name.trim(),
    category: category || 'Main Course',
    price: Number(price),
    gst: gst !== undefined ? Number(gst) : 5,
    description: description || '',
    is_veg: is_veg !== undefined ? Boolean(is_veg) : true
  };
  db.menu.push(newItem);
  saveDatabase(db);
  res.status(201).json(newItem);
});

app.put('/api/menu/:id', (req, res) => {
  const itemId = Number(req.params.id);
  const item = db.menu.find(m => m.item_id === itemId);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });

  const { name, category, price, gst, description, is_veg } = req.body;
  if (name !== undefined) item.name = name.trim();
  if (category !== undefined) item.category = category;
  if (price !== undefined) item.price = Number(price);
  if (gst !== undefined) item.gst = Number(gst);
  if (description !== undefined) item.description = description;
  if (is_veg !== undefined) item.is_veg = Boolean(is_veg);

  saveDatabase(db);
  res.json(item);
});

app.delete('/api/menu/:id', (req, res) => {
  const itemId = Number(req.params.id);
  const index = db.menu.findIndex(m => m.item_id === itemId);
  if (index === -1) return res.status(404).json({ error: 'Menu item not found' });

  const deleted = db.menu.splice(index, 1)[0];
  db.recipes = db.recipes.filter(r => r.menu_item_id !== itemId);
  saveDatabase(db);
  res.json({ message: 'Menu dish deleted', item: deleted });
});

app.get('/api/inventory', (req, res) => {
  const enriched = db.inventory.map(inv => ({
    ...inv,
    is_low_stock: inv.stock <= inv.min_stock,
    stock_value: Math.round(inv.stock * inv.price * 100) / 100
  }));
  res.json(enriched);
});

app.post('/api/inventory', (req, res) => {
  const { name, unit, stock, min_stock, price } = req.body;
  if (!name || !unit) {
    return res.status(400).json({ error: 'Name and unit are required' });
  }
  const nextId = db.inventory.length > 0 ? Math.max(...db.inventory.map(i => i.inventory_id)) + 1 : 1;
  const newInv = {
    inventory_id: nextId,
    name: name.trim(),
    unit: unit.trim(),
    stock: Number(stock) || 0,
    min_stock: Number(min_stock) || 5,
    price: Number(price) || 0
  };
  db.inventory.push(newInv);
  saveDatabase(db);
  res.status(201).json(newInv);
});

app.put('/api/inventory/:id', (req, res) => {
  const invId = Number(req.params.id);
  const item = db.inventory.find(i => i.inventory_id === invId);
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });

  const { name, unit, stock, min_stock, price } = req.body;
  if (name !== undefined) item.name = name.trim();
  if (unit !== undefined) item.unit = unit.trim();
  if (stock !== undefined) item.stock = Number(stock);
  if (min_stock !== undefined) item.min_stock = Number(min_stock);
  if (price !== undefined) item.price = Number(price);

  saveDatabase(db);
  res.json(item);
});

app.delete('/api/inventory/:id', (req, res) => {
  const invId = Number(req.params.id);
  const index = db.inventory.findIndex(i => i.inventory_id === invId);
  if (index === -1) return res.status(404).json({ error: 'Inventory item not found' });

  db.recipes = db.recipes.filter(r => r.inventory_id !== invId);
  const deleted = db.inventory.splice(index, 1)[0];
  saveDatabase(db);
  res.json({ message: 'Inventory item deleted', item: deleted });
});

app.post('/api/inventory/:id/restock', (req, res) => {
  const invId = Number(req.params.id);
  const { add_qty } = req.body;
  const item = db.inventory.find(i => i.inventory_id === invId);
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });

  const qty = Number(add_qty);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Valid add_qty number is required' });
  }

  item.stock = Math.round((item.stock + qty) * 1000) / 1000;
  saveDatabase(db);
  res.json({ message: 'Stock updated successfully', item });
});

app.get('/api/recipes', (req, res) => {
  const formatted = db.recipes.map((r, idx) => {
    const menuItem = db.menu.find(m => m.item_id === r.menu_item_id);
    const invItem = db.inventory.find(i => i.inventory_id === r.inventory_id);
    return {
      recipe_id: idx + 1,
      menu_item_id: r.menu_item_id,
      inventory_id: r.inventory_id,
      qty_required: r.qty_required,
      menu_name: menuItem ? menuItem.name : 'Unknown Dish',
      inventory_name: invItem ? invItem.name : 'Unknown Material',
      unit: invItem ? invItem.unit : ''
    };
  });
  res.json(formatted);
});

app.post('/api/recipes', (req, res) => {
  const { menu_item_id, inventory_id, qty_required } = req.body;
  if (!menu_item_id || !inventory_id || !qty_required) {
    return res.status(400).json({ error: 'menu_item_id, inventory_id, and qty_required are required' });
  }
  const mid = Number(menu_item_id);
  const iid = Number(inventory_id);
  const qty = Number(qty_required);

  const existing = db.recipes.find(r => r.menu_item_id === mid && r.inventory_id === iid);
  if (existing) {
    existing.qty_required = qty;
    saveDatabase(db);
    return res.json({ message: 'Recipe mapping updated', recipe: existing });
  }

  const newRecipe = { menu_item_id: mid, inventory_id: iid, qty_required: qty };
  db.recipes.push(newRecipe);
  saveDatabase(db);
  res.status(201).json(newRecipe);
});

app.delete('/api/recipes/:menu_id/:inv_id', (req, res) => {
  const mid = Number(req.params.menu_id);
  const iid = Number(req.params.inv_id);
  const index = db.recipes.findIndex(r => r.menu_item_id === mid && r.inventory_id === iid);
  if (index === -1) return res.status(404).json({ error: 'Recipe mapping not found' });

  const deleted = db.recipes.splice(index, 1)[0];
  saveDatabase(db);
  res.json({ message: 'Recipe mapping removed', recipe: deleted });
});

app.get('/api/customers', (req, res) => {
  const enrichedCustomers = db.customers.map(c => {
    const customerOrders = db.orders.filter(o => o.customer_id === c.customer_id);
    const totalSpend = customerOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0);
    return {
      ...c,
      order_count: customerOrders.length,
      total_spend: totalSpend
    };
  });
  res.json(enrichedCustomers);
});

app.post('/api/customers', (req, res) => {
  const { name, phone, email, address, gst_number } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }
  let existing = db.customers.find(c => c.phone === phone);
  if (existing) {
    existing.name = name;
    if (email !== undefined) existing.email = email;
    if (address !== undefined) existing.address = address;
    if (gst_number !== undefined) existing.gst_number = gst_number;
    saveDatabase(db);
    return res.json(existing);
  }

  const nextId = db.customers.length > 0 ? Math.max(...db.customers.map(c => c.customer_id)) + 1 : 1;
  const newCustomer = {
    customer_id: nextId,
    name: name.trim(),
    phone: phone.trim(),
    email: email || '',
    address: address || '',
    gst_number: gst_number || ''
  };
  db.customers.push(newCustomer);
  saveDatabase(db);
  res.status(201).json(newCustomer);
});

app.get('/api/staff', (req, res) => {
  res.json(db.staff);
});

app.post('/api/staff', (req, res) => {
  const { name, role, phone, salary } = req.body;
  if (!name || !role) {
    return res.status(400).json({ error: 'Name and role are required' });
  }
  const nextId = db.staff.length > 0 ? Math.max(...db.staff.map(s => s.staff_id)) + 1 : 1;
  const newStaff = {
    staff_id: nextId,
    name: name.trim(),
    role: role.trim(),
    phone: phone || '',
    salary: Number(salary) || 15000,
    status: 'active'
  };
  db.staff.push(newStaff);
  saveDatabase(db);
  res.status(201).json(newStaff);
});

app.get('/api/orders', (req, res) => {
  const enrichedOrders = db.orders.map(order => {
    const table = db.tables.find(t => t.table_id === order.table_id);
    const customer = db.customers.find(c => c.customer_id === order.customer_id);
    const payment = db.payments.find(p => p.order_id === order.order_id);
    const invoice = db.invoices.find(inv => inv.order_id === order.order_id);
    return {
      ...order,
      table_number: table ? table.table_number : 'Takeaway',
      customer_name: customer ? customer.name : 'Walk-in Guest',
      customer_phone: customer ? customer.phone : '',
      payment: payment || null,
      invoice: invoice || null
    };
  }).reverse();
  res.json(enrichedOrders);
});

app.post('/api/orders', (req, res) => {
  const { table_id, customer_id, customer_info, items, source } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  let custId = customer_id ? Number(customer_id) : null;
  if (!custId && customer_info && customer_info.name) {
    let existing = db.customers.find(c => c.phone === customer_info.phone);
    if (!existing) {
      existing = {
        customer_id: db.customers.length > 0 ? Math.max(...db.customers.map(c => c.customer_id)) + 1 : 1,
        name: customer_info.name,
        phone: customer_info.phone || '9999999999',
        email: customer_info.email || '',
        address: customer_info.address || 'Noida',
        gst_number: customer_info.gst_number || ''
      };
      db.customers.push(existing);
    }
    custId = existing.customer_id;
  }

  const calculation = calculateOrderTotals(items, db.menu);
  const deductions = [];
  const inventoryWarnings = [];

  for (const orderedItem of items) {
    const qtyOrdered = Number(orderedItem.qty) || 1;
    const matchingRecipes = db.recipes.filter(r => r.menu_item_id === Number(orderedItem.item_id));

    for (const recipe of matchingRecipes) {
      const inv = db.inventory.find(i => i.inventory_id === recipe.inventory_id);
      if (inv) {
        const requiredDeduction = Math.round((recipe.qty_required * qtyOrdered) * 1000) / 1000;
        deductions.push({
          inventory_id: inv.inventory_id,
          name: inv.name,
          unit: inv.unit,
          deduction: requiredDeduction,
          previous_stock: inv.stock,
          new_stock: Math.max(0, Math.round((inv.stock - requiredDeduction) * 1000) / 1000)
        });
        inv.stock = Math.max(0, Math.round((inv.stock - requiredDeduction) * 1000) / 1000);
        if (inv.stock <= inv.min_stock) {
          inventoryWarnings.push(`Low stock alert: ${inv.name} is now at ${inv.stock} ${inv.unit}`);
        }
      }
    }
  }

  const nextOrderId = db.orders.length > 0 ? Math.max(...db.orders.map(o => o.order_id)) + 1 : 101;
  const newOrder = {
    order_id: nextOrderId,
    table_id: table_id ? Number(table_id) : null,
    customer_id: custId || 1,
    source: source || 'pos',
    status: 'pending',
    order_date: new Date().toISOString(),
    items: calculation.items,
    total: calculation.total,
    gst: calculation.gst,
    cgst: calculation.cgst,
    sgst: calculation.sgst,
    grand_total: calculation.grand_total,
    deductions: deductions
  };

  db.orders.push(newOrder);

  if (table_id) {
    const table = db.tables.find(t => t.table_id === Number(table_id));
    if (table) {
      table.status = 'occupied';
    }
  }

  saveDatabase(db);

  res.status(201).json({
    order: newOrder,
    deductions,
    warnings: inventoryWarnings
  });
});

app.post('/api/orders/:id/status', (req, res) => {
  const orderId = Number(req.params.id);
  const { status } = req.body;
  const order = db.orders.find(o => o.order_id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.status = status;
  saveDatabase(db);
  res.json(order);
});

app.post('/api/orders/:id/settle', (req, res) => {
  const orderId = Number(req.params.id);
  const { method } = req.body;
  const order = db.orders.find(o => o.order_id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  let payment = db.payments.find(p => p.order_id === orderId);
  if (!payment) {
    const nextPayId = db.payments.length > 0 ? Math.max(...db.payments.map(p => p.payment_id)) + 1 : 1;
    payment = {
      payment_id: nextPayId,
      order_id: orderId,
      method: method || 'upi',
      amount: order.grand_total,
      status: 'paid',
      timestamp: new Date().toISOString()
    };
    db.payments.push(payment);
  } else {
    payment.status = 'paid';
    payment.method = method || payment.method;
  }

  let invoice = db.invoices.find(inv => inv.order_id === orderId);
  if (!invoice) {
    const nextInvId = db.invoices.length > 0 ? Math.max(...db.invoices.map(i => i.invoice_id)) + 1 : 1;
    const invNo = `INV-${String(nextInvId).padStart(3, '0')}`;
    const cgst = order.cgst !== undefined ? order.cgst : Math.round((order.gst / 2) * 100) / 100;
    const sgst = order.sgst !== undefined ? order.sgst : Math.round((order.gst / 2) * 100) / 100;

    invoice = {
      invoice_id: nextInvId,
      order_id: orderId,
      invoice_no: invNo,
      cgst: cgst,
      sgst: sgst,
      total_tax: order.gst,
      date: new Date().toISOString().split('T')[0]
    };
    db.invoices.push(invoice);
  }

  order.status = 'completed';

  if (order.table_id) {
    const table = db.tables.find(t => t.table_id === order.table_id);
    if (table) {
      table.status = 'available';
    }
  }

  saveDatabase(db);
  res.json({ message: 'Order settled successfully', order, payment, invoice });
});

app.get('/api/invoices', (req, res) => {
  const detailedInvoices = db.invoices.map(inv => {
    const order = db.orders.find(o => o.order_id === inv.order_id);
    const customer = order ? db.customers.find(c => c.customer_id === order.customer_id) : null;
    const payment = order ? db.payments.find(p => p.order_id === order.order_id) : null;
    return {
      ...inv,
      restaurant: db.restaurant,
      order: order || null,
      customer: customer || null,
      payment: payment || null
    };
  }).reverse();
  res.json(detailedInvoices);
});

app.get('/api/reports', (req, res) => {
  const totalRevenue = db.payments.reduce((acc, p) => p.status === 'paid' ? acc + (Number(p.amount) || 0) : acc, 0);
  const totalTaxCollected = db.invoices.reduce((acc, inv) => acc + (Number(inv.total_tax) || 0), 0);
  const totalCgst = db.invoices.reduce((acc, inv) => acc + (Number(inv.cgst) || 0), 0);
  const totalSgst = db.invoices.reduce((acc, inv) => acc + (Number(inv.sgst) || 0), 0);

  const dishSalesMap = {};
  db.orders.forEach(order => {
    if (order.items) {
      order.items.forEach(item => {
        if (!dishSalesMap[item.name]) {
          dishSalesMap[item.name] = { name: item.name, category: item.category || 'Dish', qty_sold: 0, total_revenue: 0 };
        }
        dishSalesMap[item.name].qty_sold += item.qty;
        dishSalesMap[item.name].total_revenue += (item.price * item.qty);
      });
    }
  });
  const topDishes = Object.values(dishSalesMap).sort((a, b) => b.qty_sold - a.qty_sold);

  const paymentMethods = { upi: 0, cash: 0, card: 0 };
  db.payments.forEach(p => {
    const m = (p.method || 'upi').toLowerCase();
    paymentMethods[m] = (paymentMethods[m] || 0) + Number(p.amount);
  });

  let totalStockValuation = 0;
  let lowStockAlerts = 0;
  const inventoryReport = db.inventory.map(inv => {
    const val = inv.stock * inv.price;
    totalStockValuation += val;
    if (inv.stock <= inv.min_stock) lowStockAlerts++;
    return {
      name: inv.name,
      unit: inv.unit,
      stock: inv.stock,
      min_stock: inv.min_stock,
      price: inv.price,
      valuation: val,
      is_low: inv.stock <= inv.min_stock
    };
  });

  const tableStats = {
    total: db.tables.length,
    occupied: db.tables.filter(t => t.status === 'occupied').length,
    available: db.tables.filter(t => t.status === 'available').length,
    occupancy_rate: db.tables.length ? Math.round((db.tables.filter(t => t.status === 'occupied').length / db.tables.length) * 100) : 0
  };

  const totalSalaryExpense = db.staff.reduce((acc, s) => acc + (Number(s.salary) || 0), 0);

  res.json({
    financials: {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_tax: Math.round(totalTaxCollected * 100) / 100,
      cgst_total: Math.round(totalCgst * 100) / 100,
      sgst_total: Math.round(totalSgst * 100) / 100,
      net_taxable_sales: Math.round((totalRevenue - totalTaxCollected) * 100) / 100,
      total_orders: db.orders.length,
      average_order_value: db.orders.length ? Math.round((totalRevenue / db.orders.length) * 100) / 100 : 0
    },
    payment_methods: paymentMethods,
    top_dishes: topDishes,
    inventory: {
      items: inventoryReport,
      total_valuation: totalStockValuation,
      low_stock_count: lowStockAlerts
    },
    tables: tableStats,
    staff: { count: db.staff.length, monthly_payroll: totalSalaryExpense },
    customers: { count: db.customers.length }
  });
});

app.get('/api/qr/image', async (req, res) => {
  try {
    const text = req.query.text || `http://${LAN_IP}:${PORT}`;
    const qrDataUrl = await QRCode.toDataURL(text, { errorCorrectionLevel: 'H', margin: 2, width: 300 });
    res.json({ text, dataUrl: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code: ' + err.message });
  }
});

app.get('/api/qr/table/:id', async (req, res) => {
  const tableId = Number(req.params.id);
  const table = db.tables.find(t => t.table_id === tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  try {
    const baseUrl = db.restaurant.base_url || `http://${LAN_IP}:${PORT}`;
    const orderUrl = `${baseUrl}/menu.html?table=${table.table_number}`;
    table.qr_url = orderUrl;
    const qrDataUrl = await QRCode.toDataURL(orderUrl, { errorCorrectionLevel: 'H', margin: 2, width: 340 });
    res.json({ table, restaurant: db.restaurant, qr_url: orderUrl, qr_image: qrDataUrl, lan_ip: LAN_IP });
  } catch (err) {
    res.status(500).json({ error: 'QR Generation error: ' + err.message });
  }
});

app.get('/api/qr/upi', async (req, runRes) => {
  const orderId = Number(runRes.query.order_id);
  const amount = Number(runRes.query.amount) || 0;
  const upiId = db.restaurant.upi_id || 'spicegarden@upi';
  const payeeName = db.restaurant.upi_name || db.restaurant.name || 'Spice Garden';

  let upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&cu=INR`;
  if (amount > 0) upiString += `&am=${amount.toFixed(2)}`;
  if (orderId) upiString += `&tn=Order_${orderId}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(upiString, { errorCorrectionLevel: 'H', margin: 2, width: 340 });
    runRes.json({ upi_id: upiId, payee_name: payeeName, amount, order_id: orderId, upi_string: upiString, qr_image: qrDataUrl });
  } catch (err) {
    runRes.status(500).json({ error: 'Failed to generate UPI QR: ' + err.message });
  }
});

app.post('/api/reset', (req, res) => {
  const initialContent = fs.readFileSync(INITIAL_FILE, 'utf8');
  fs.writeFileSync(DB_FILE, initialContent, 'utf8');
  db = JSON.parse(initialContent);
  saveDatabase(db);
  res.json({ message: 'Database reset successfully', db });
});

app.get('/menu', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Spice Garden POS & CRM Server running on port ${PORT}!`);
});
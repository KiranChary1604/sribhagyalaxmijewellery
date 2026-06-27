// db.js – Dual-mode Database Integration (Supabase + Local Fallback) for AURA Jewellery Store
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const isConfigured = supabaseUrl && supabaseUrl.startsWith('http') && supabaseKey && !supabaseKey.includes('your-supabase');

if (!isConfigured) {
  console.warn("\n==========================================================================");
  console.warn("WARNING: Supabase URL/Key is missing or not configured correctly in .env!");
  console.warn("The application is running in LOCAL MOCK DATABASE FALLBACK mode.");
  console.warn("Please update the .env file at the project root with your Supabase credentials.");
  console.warn("==========================================================================\n");
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);

// ---------------- LOCAL DATABASE FALLBACK SYSTEM ---------------- //
const dbPath = path.join(__dirname, '..', 'data', 'aura_db_mock.json');

class MockDatabase {
  constructor(jsonPath) {
    this.jsonPath = jsonPath;
    this.data = {
      users: [],
      carts: [],
      consultations: [],
      logs: [],
      products: [],
      collections: []
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.jsonPath)) {
        const fileContent = fs.readFileSync(this.jsonPath, 'utf8');
        this.data = JSON.parse(fileContent);
        this.data.products = this.data.products || [];
        this.data.users = this.data.users || [];
        this.data.consultations = this.data.consultations || [];
        this.data.logs = this.data.logs || [];
        this.data.collections = this.data.collections || [];
      } else {
        const dir = path.dirname(this.jsonPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.save();
      }
    } catch (e) {
      console.error("Error loading mock database, resetting:", e);
    }
  }

  save() {
    try {
      fs.writeFileSync(this.jsonPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error("Error saving mock database:", e);
    }
  }

  exec(sql) {
    this.load();
    const cleanSql = sql.trim().replace(/\s+/g, ' ');
    if (cleanSql.includes('DELETE FROM users') || cleanSql.includes('DELETE FROM')) {
      this.data.users = [];
      this.data.carts = [];
      this.data.consultations = [];
      this.data.logs = [];
      this.data.products = [];
      this.data.collections = [];
      this.save();
    }
  }

  prepare(sql) {
    const cleanSql = sql.trim().replace(/\s+/g, ' ');
    const self = this;

    return {
      all(...params) {
        self.load();
        if (cleanSql.match(/password/i) && cleanSql.match(/SELECT.*FROM\s+users/i)) {
          return self.data.users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            password: u.password,
            cart: u.cart || [],
            isElite: !!u.isElite,
            created_at: u.created_at || new Date().toISOString()
          }));
        }
        if (cleanSql.match(/SELECT.*FROM\s+users/i)) {
          return self.data.users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            isElite: !!u.isElite,
            created_at: u.created_at || new Date().toISOString()
          }));
        }
        if (cleanSql.match(/SELECT.*FROM\s+consultations/i)) {
          return self.data.consultations;
        }
        if (cleanSql.match(/SELECT.*FROM\s+logs/i)) {
          let res = [...self.data.logs];
          if (cleanSql.match(/ORDER BY id DESC/i)) {
            res.reverse();
          }
          return res;
        }
        if (cleanSql.match(/SELECT.*FROM\s+products/i)) {
          return self.data.products;
        }
        if (cleanSql.match(/SELECT.*FROM\s+collections/i)) {
          return self.data.collections;
        }
        return [];
      },

      run(...params) {
        self.load();
        let changes = 0;

        if (cleanSql.match(/INSERT\s+INTO\s+users/i)) {
          const [name, email, phone, password, created_at] = params;
          const id = self.data.users.length > 0 ? Math.max(...self.data.users.map(u => u.id)) + 1 : 1;
          self.data.users.push({
            id,
            name,
            email,
            phone,
            password,
            cart: [],
            isElite: false,
            created_at: created_at || new Date().toISOString()
          });
          changes = 1;
        }
        else if (cleanSql.match(/INSERT\s+INTO\s+logs/i)) {
          const [time, text, type] = params;
          const id = self.data.logs.length > 0 ? Math.max(...self.data.logs.map(l => l.id)) + 1 : 1;
          self.data.logs.push({ id, time, text, type });
          changes = 1;
        }
        else if (cleanSql.match(/INSERT\s+INTO\s+consultations/i)) {
          const [name, email, phone, service, date, time, notes] = params;
          const id = self.data.consultations.length > 0 ? Math.max(...self.data.consultations.map(c => c.id)) + 1 : 1;
          self.data.consultations.push({ id, name, email, phone, service, date, time, notes });
          changes = 1;
        }
        else if (cleanSql.match(/INSERT\s+INTO\s+products/i)) {
          const [productData] = params;
          const id = self.data.products.length > 0 ? Math.max(...self.data.products.map(p => p.id)) + 1 : 1;
          const newProduct = { id, ...productData };
          self.data.products.push(newProduct);
          changes = 1;
        }
        else if (cleanSql.match(/UPDATE\s+products\s+SET/i)) {
          const [productId, productData] = params;
          const index = self.data.products.findIndex(p => p.id === parseInt(productId, 10));
          if (index !== -1) {
            self.data.products[index] = { ...self.data.products[index], ...productData, id: parseInt(productId, 10) };
            changes = 1;
          }
        }
        else if (cleanSql.match(/UPDATE\s+users\s+SET\s+cart/i)) {
          const [email, cartData] = params;
          const index = self.data.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
          if (index !== -1) {
            self.data.users[index].cart = cartData;
            changes = 1;
          }
        }
        else if (cleanSql.match(/UPDATE\s+users\s+SET\s+password/i)) {
          const [hashedPassword, emailOrPhone] = params;
          const index = self.data.users.findIndex(u => u.email.toLowerCase() === emailOrPhone.toLowerCase() || u.phone === emailOrPhone);
          if (index !== -1) {
            self.data.users[index].password = hashedPassword;
            changes = 1;
          }
        }
        else if (cleanSql.match(/UPDATE\s+users\s+SET\s+isElite/i)) {
          const [isElite, email] = params;
          const index = self.data.users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
          if (index !== -1) {
            self.data.users[index].isElite = !!isElite;
            changes = 1;
          }
        }
        else if (cleanSql.match(/DELETE\s+FROM\s+users\s+WHERE/i)) {
          const [email, phone] = params;
          const initialLen = self.data.users.length;
          self.data.users = self.data.users.filter(u => {
            if (email && u.email === email) return false;
            if (phone && u.phone === phone) return false;
            return true;
          });
          changes = initialLen - self.data.users.length;
        }
        else if (cleanSql.match(/DELETE\s+FROM\s+carts\s+WHERE/i)) {
          const initialLen = self.data.carts.length;
          const userIds = new Set(self.data.users.map(u => u.id));
          self.data.carts = self.data.carts.filter(c => userIds.has(c.userId));
          changes = initialLen - self.data.carts.length;
        }
        else if (cleanSql.match(/DELETE\s+FROM\s+consultations\s+WHERE\s+id\s*=\s*\?/i)) {
          const [id] = params;
          const targetId = parseInt(id, 10);
          const initialLen = self.data.consultations.length;
          self.data.consultations = self.data.consultations.filter(c => c.id !== targetId);
          changes = initialLen - self.data.consultations.length;
        }
        else if (cleanSql.match(/DELETE\s+FROM\s+products\s+WHERE\s+id\s*=\s*\?/i)) {
          const [id] = params;
          const targetId = parseInt(id, 10);
          const initialLen = self.data.products.length;
          self.data.products = self.data.products.filter(p => p.id !== targetId);
          changes = initialLen - self.data.products.length;
        }
        else if (cleanSql.match(/INSERT\s+INTO\s+collections/i)) {
          const [collectionData] = params;
          const id = self.data.collections.length > 0 ? Math.max(...self.data.collections.map(c => c.id)) + 1 : 1;
          const newCollection = { id, ...collectionData };
          self.data.collections.push(newCollection);
          changes = 1;
        }
        else if (cleanSql.match(/UPDATE\s+collections\s+SET/i)) {
          const [collectionId, collectionData] = params;
          const index = self.data.collections.findIndex(c => c.id === parseInt(collectionId, 10));
          if (index !== -1) {
            self.data.collections[index] = { ...self.data.collections[index], ...collectionData, id: parseInt(collectionId, 10) };
            changes = 1;
          }
        }
        else if (cleanSql.match(/DELETE\s+FROM\s+collections\s+WHERE\s+id\s*=\s*\?/i)) {
          const [id] = params;
          const targetId = parseInt(id, 10);
          const initialLen = self.data.collections.length;
          self.data.collections = self.data.collections.filter(c => c.id !== targetId);
          changes = initialLen - self.data.collections.length;
        }

        self.save();
        return { changes };
      }
    };
  }
}

const localDb = new MockDatabase(dbPath);

let collectionsTableExists = true;

// ---------------- SUPABASE DATABASE SYSTEM ---------------- //
class SupabaseDatabaseAdapter {
  constructor() { }

  async exec(sql) {
    if (!isConfigured) return;
    const cleanSql = sql.trim().replace(/\s+/g, ' ');
    if (cleanSql.includes('DELETE FROM users')) {
      const { error } = await supabase.from('users').delete().neq('id', -1);
      if (error) console.error("Error executing DELETE FROM users:", error);
    }
  }

  prepare(sql) {
    const cleanSql = sql.trim().replace(/\s+/g, ' ');
    return {
      async all(...params) {
        if (!isConfigured) return [];
        try {
          if (cleanSql.match(/password/i) && cleanSql.match(/SELECT.*FROM\s+users/i)) {
            const { data, error } = await supabase.from('users').select('id, name, email, phone, password, cart, isElite, created_at');
            if (error) {
              // Fallback if isElite or created_at columns don't exist yet
              const { data: dataFallback, error: errFallback } = await supabase.from('users').select('id, name, email, phone, password, cart');
              if (errFallback) throw errFallback;
              return dataFallback.map(u => ({ ...u, isElite: false, created_at: new Date().toISOString() }));
            }
            return data || [];
          }
          if (cleanSql.match(/SELECT.*FROM\s+users/i)) {
            const { data, error } = await supabase.from('users').select('id, name, email, phone, isElite, created_at');
            if (error) {
              // Fallback if isElite or created_at columns don't exist yet
              const { data: dataFallback, error: errFallback } = await supabase.from('users').select('id, name, email, phone');
              if (errFallback) throw errFallback;
              return dataFallback.map(u => ({ ...u, isElite: false, created_at: new Date().toISOString() }));
            }
            return data || [];
          }
          if (cleanSql.match(/SELECT.*FROM\s+consultations/i)) {
            const { data, error } = await supabase.from('consultations').select('*');
            if (error) throw error;
            return data || [];
          }
          if (cleanSql.match(/SELECT.*FROM\s+logs/i)) {
            let query = supabase.from('logs').select('*');
            if (cleanSql.match(/ORDER BY id DESC/i)) {
              query = query.order('id', { ascending: false });
            }
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
          }
          if (cleanSql.match(/SELECT.*FROM\s+products/i)) {
            const { data, error } = await supabase.from('products').select('*');
            if (error) throw error;
            return data || [];
          }
          if (cleanSql.match(/SELECT.*FROM\s+collections/i)) {
            if (!collectionsTableExists) {
              return localDb.prepare(sql).all(...params);
            }
            try {
              const { data, error } = await supabase.from('collections').select('*');
              if (error) {
                console.warn("Supabase collections table SELECT failed, falling back to local database:", error.message);
                if (error.message.includes("Could not find the table") || error.code === 'P0001' || error.status === 404) {
                  collectionsTableExists = false;
                }
                return localDb.prepare(sql).all(...params);
              }
              return data || [];
            } catch (err) {
              console.warn("Supabase collections table SELECT threw error, falling back to local database:", err.message);
              collectionsTableExists = false;
              return localDb.prepare(sql).all(...params);
            }
          }
        } catch (err) {
          console.error(`Error in DB prepare all for query [${cleanSql}]:`, err);
          throw err;
        }
        return [];
      },

      async run(...params) {
        if (!isConfigured) return { changes: 0 };
        try {
          if (cleanSql.match(/INSERT\s+INTO\s+users/i)) {
            const [name, email, phone, password, created_at] = params;
            const insertObjBase = {
              name,
              email,
              phone,
              password,
              cart: []
            };

            // Attempt 1: Insert all fields
            let res = await supabase.from('users').insert({
              ...insertObjBase,
              isElite: false,
              created_at: created_at || new Date().toISOString()
            }).select();

            // Attempt 2: Fallback without created_at if it failed on created_at
            if (res.error) {
              res = await supabase.from('users').insert({
                ...insertObjBase,
                isElite: false
              }).select();
            }

            // Attempt 3: Fallback without isElite (if isElite is the issue)
            if (res.error) {
              res = await supabase.from('users').insert({
                ...insertObjBase,
                created_at: created_at || new Date().toISOString()
              }).select();
            }

            // Attempt 4: Base insert (no created_at and no isElite)
            if (res.error) {
              res = await supabase.from('users').insert(insertObjBase).select();
            }

            if (res.error) throw res.error;
            return { changes: res.data ? res.data.length : 1 };
          }
          else if (cleanSql.match(/INSERT\s+INTO\s+logs/i)) {
            const [time, text, type] = params;
            const { data, error } = await supabase
              .from('logs')
              .insert({ time, text, type })
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/INSERT\s+INTO\s+consultations/i)) {
            const [name, email, phone, service, date, time, notes] = params;
            const { data, error } = await supabase
              .from('consultations')
              .insert({ name, email, phone, service, date, time, notes })
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/INSERT\s+INTO\s+products/i)) {
            const [productData] = params;
            const dataToInsert = { ...productData };
            if (dataToInsert.hasOwnProperty('id')) {
              delete dataToInsert.id;
            }
            const { data, error } = await supabase
              .from('products')
              .insert(dataToInsert)
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/UPDATE\s+products\s+SET/i)) {
            const [productId, productData] = params;
            const dataToUpdate = { ...productData };
            if (dataToUpdate.hasOwnProperty('id')) {
              delete dataToUpdate.id;
            }
            const { data, error } = await supabase
              .from('products')
              .update(dataToUpdate)
              .eq('id', parseInt(productId, 10))
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/UPDATE\s+users\s+SET\s+cart/i)) {
            const [email, cartData] = params;
            const { data, error } = await supabase
              .from('users')
              .update({ cart: cartData })
              .eq('email', email.toLowerCase())
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/UPDATE\s+users\s+SET\s+password/i)) {
            const [hashedPassword, emailOrPhone] = params;
            const { data, error } = await supabase
              .from('users')
              .update({ password: hashedPassword })
              .or(`email.eq.${emailOrPhone.toLowerCase()},phone.eq.${emailOrPhone}`)
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/UPDATE\s+users\s+SET\s+isElite/i)) {
            const [isElite, email] = params;
            const { data, error } = await supabase
              .from('users')
              .update({ isElite: !!isElite })
              .eq('email', email.toLowerCase())
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/DELETE\s+FROM\s+users\s+WHERE/i)) {
            const [email, phone] = params;
            let query = supabase.from('users').delete();
            if (email && phone) {
              query = query.or(`email.eq.${email},phone.eq.${phone}`);
            } else if (email) {
              query = query.eq('email', email);
            } else if (phone) {
              query = query.eq('phone', phone);
            } else {
              return { changes: 0 };
            }
            const { data, error } = await query.select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/DELETE\s+FROM\s+carts\s+WHERE/i)) {
            return { changes: 0 };
          }
          else if (cleanSql.match(/DELETE\s+FROM\s+consultations\s+WHERE\s+id\s*=\s*\?/i)) {
            const [id] = params;
            const { data, error } = await supabase
              .from('consultations')
              .delete()
              .eq('id', parseInt(id, 10))
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/DELETE\s+FROM\s+products\s+WHERE\s+id\s*=\s*\?/i)) {
            const [id] = params;
            const { data, error } = await supabase
              .from('products')
              .delete()
              .eq('id', parseInt(id, 10))
              .select();
            if (error) throw error;
            return { changes: data ? data.length : 1 };
          }
          else if (cleanSql.match(/INSERT\s+INTO\s+collections/i)) {
            if (!collectionsTableExists) {
              return localDb.prepare(sql).run(...params);
            }
            try {
              const [collectionData] = params;
              const dataToInsert = { ...collectionData };
              if (dataToInsert.hasOwnProperty('id')) {
                delete dataToInsert.id;
              }
              const { data, error } = await supabase
                .from('collections')
                .insert(dataToInsert)
                .select();
              if (error) {
                console.warn("Supabase collections INSERT failed, falling back to local database:", error.message);
                if (error.message.includes("Could not find the table") || error.code === 'P0001' || error.status === 404) {
                  collectionsTableExists = false;
                }
                return localDb.prepare(sql).run(...params);
              }
              return { changes: data ? data.length : 1 };
            } catch (err) {
              console.warn("Supabase collections INSERT threw error, falling back to local database:", err.message);
              collectionsTableExists = false;
              return localDb.prepare(sql).run(...params);
            }
          }
          else if (cleanSql.match(/UPDATE\s+collections\s+SET/i)) {
            if (!collectionsTableExists) {
              return localDb.prepare(sql).run(...params);
            }
            try {
              const [collectionId, collectionData] = params;
              const dataToUpdate = { ...collectionData };
              if (dataToUpdate.hasOwnProperty('id')) {
                delete dataToUpdate.id;
              }
              const { data, error } = await supabase
                .from('collections')
                .update(dataToUpdate)
                .eq('id', parseInt(collectionId, 10))
                .select();
              if (error) {
                console.warn("Supabase collections UPDATE failed, falling back to local database:", error.message);
                if (error.message.includes("Could not find the table") || error.code === 'P0001' || error.status === 404) {
                  collectionsTableExists = false;
                }
                return localDb.prepare(sql).run(...params);
              }
              return { changes: data ? data.length : 1 };
            } catch (err) {
              console.warn("Supabase collections UPDATE threw error, falling back to local database:", err.message);
              collectionsTableExists = false;
              return localDb.prepare(sql).run(...params);
            }
          }
          else if (cleanSql.match(/DELETE\s+FROM\s+collections\s+WHERE\s+id\s*=\s*\?/i)) {
            if (!collectionsTableExists) {
              return localDb.prepare(sql).run(...params);
            }
            try {
              const [id] = params;
              const { data, error } = await supabase
                .from('collections')
                .delete()
                .eq('id', parseInt(id, 10))
                .select();
              if (error) {
                console.warn("Supabase collections DELETE failed, falling back to local database:", error.message);
                if (error.message.includes("Could not find the table") || error.code === 'P0001' || error.status === 404) {
                  collectionsTableExists = false;
                }
                return localDb.prepare(sql).run(...params);
              }
              return { changes: data ? data.length : 1 };
            } catch (err) {
              console.warn("Supabase collections DELETE threw error, falling back to local database:", err.message);
              collectionsTableExists = false;
              return localDb.prepare(sql).run(...params);
            }
          }
        } catch (err) {
          console.error(`Error in DB prepare run for query [${cleanSql}]:`, err);
          throw err;
        }
        return { changes: 0 };
      }
    };
  }
}

const supabaseDb = new SupabaseDatabaseAdapter();


// ---------------- DELEGATING SYSTEM EXPORT ---------------- //
const db = {
  async exec(sql) {
    if (isConfigured) {
      await supabaseDb.exec(sql);
    } else {
      localDb.exec(sql);
    }
  },

  prepare(sql) {
    const supabasePrep = supabaseDb.prepare(sql);
    const localPrep = localDb.prepare(sql);

    return {
      async all(...params) {
        if (isConfigured) {
          return await supabasePrep.all(...params);
        } else {
          return localPrep.all(...params);
        }
      },

      async run(...params) {
        if (isConfigured) {
          return await supabasePrep.run(...params);
        } else {
          return localPrep.run(...params);
        }
      }
    };
  }
};

async function init() {
  if (isConfigured) {
    console.log("Supabase Client initialized successfully.");
  } else {
    console.log("Local Database fallback system initialized successfully.");
  }
}

async function seed() {
  if (isConfigured) {
    console.log("Seeding Supabase Database...");

    // Clear tables
    await db.exec('DELETE FROM users');
    const { error: errLogs } = await supabase.from('logs').delete().neq('id', -1);
    const { error: errConsult } = await supabase.from('consultations').delete().neq('id', -1);

    const insertUser = db.prepare('INSERT INTO users (name, email, phone, password, created_at) VALUES (?, ?, ?, ?, ?)');
    const insertLog = db.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)');
    const insertConsult = db.prepare('INSERT INTO consultations (name, email, phone, service, date, time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const users = [
      { name: 'Jane Doe', email: 'jane.doe@example.com', phone: '+1 (555) 234-5678', password: 'password123', created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      { name: 'Arthur Pendragon', email: 'arthur@camelot.com', phone: '+1 (555) 876-5432', password: 'password123', created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }
    ];
    for (const u of users) {
      await insertUser.run(u.name, u.email, u.phone, u.password, u.created_at);
    }

    const logs = [
      { time: '15:10:02', text: 'Jane Doe logged into AURA portal.', type: 'success' },
      { time: '15:12:45', text: 'Jane Doe added Solitaire Diamond Engagement Ring to bag.', type: 'action' },
      { time: '15:20:11', text: 'Arthur Pendragon created account.', type: 'success' },
      { time: '15:22:30', text: 'Arthur Pendragon added Gold Interlocking Chain Link Cuff to bag.', type: 'action' },
      { time: '15:35:00', text: 'Database re-seeded by Administrator.', type: 'success' }
    ];
    for (const l of logs) {
      await insertLog.run(l.time, l.text, l.type);
    }

    const consults = [
      { name: 'Jane Doe', email: 'jane.doe@example.com', phone: '+1 (555) 234-5678', service: 'Engagement Ring Consultation', date: '2026-06-15', time: 'Afternoon', notes: 'Interested in the Solitaire Diamond Ring. Prefers platinum.' },
      { name: 'Arthur Pendragon', email: 'arthur@camelot.com', phone: '+1 (555) 876-5432', service: 'Custom Design', date: '2026-06-20', time: 'Morning', notes: 'Wants a custom royal emerald crest ring design.' }
    ];
    for (const c of consults) {
      await insertConsult.run(c.name, c.email, c.phone, c.service, c.date, c.time, c.notes);
    }

    console.log("Supabase Database seeding completed successfully.");
  } else {
    console.log("Seeding Local Mock Database...");
    localDb.exec('DELETE FROM users');

    const insertUser = localDb.prepare('INSERT INTO users (name, email, phone, password, created_at) VALUES (?, ?, ?, ?, ?)');
    const insertLog = localDb.prepare('INSERT INTO logs (time, text, type) VALUES (?, ?, ?)');
    const insertConsult = localDb.prepare('INSERT INTO consultations (name, email, phone, service, date, time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');

    const users = [
      { name: 'Jane Doe', email: 'jane.doe@example.com', phone: '+1 (555) 234-5678', password: 'password123', created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      { name: 'Arthur Pendragon', email: 'arthur@camelot.com', phone: '+1 (555) 876-5432', password: 'password123', created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }
    ];
    users.forEach(u => insertUser.run(u.name, u.email, u.phone, u.password, u.created_at));

    const logs = [
      { time: '15:10:02', text: 'Jane Doe logged into AURA portal.', type: 'success' },
      { time: '15:12:45', text: 'Jane Doe added Solitaire Diamond Engagement Ring to bag.', type: 'action' },
      { time: '15:20:11', text: 'Arthur Pendragon created account.', type: 'success' },
      { time: '15:22:30', text: 'Arthur Pendragon added Gold Interlocking Chain Link Cuff to bag.', type: 'action' },
      { time: '15:35:00', text: 'Database re-seeded by Administrator.', type: 'success' }
    ];
    logs.forEach(l => insertLog.run(l.time, l.text, l.type));

    const consults = [
      { name: 'Jane Doe', email: 'jane.doe@example.com', phone: '+1 (555) 234-5678', service: 'Engagement Ring Consultation', date: '2026-06-15', time: 'Afternoon', notes: 'Interested in the Solitaire Diamond Ring. Prefers platinum.' },
      { name: 'Arthur Pendragon', email: 'arthur@camelot.com', phone: '+1 (555) 876-5432', service: 'Custom Design', date: '2026-06-20', time: 'Morning', notes: 'Wants a custom royal emerald crest ring design.' }
    ];
    consults.forEach(c => insertConsult.run(c.name, c.email, c.phone, c.service, c.date, c.time, c.notes));

    console.log("Local Mock Database seeding completed successfully.");
  }
}

module.exports = { db, init, seed, supabase, isConfigured };

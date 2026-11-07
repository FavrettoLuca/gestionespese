const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware per leggere JSON e file statici
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inizializza o apre il Database SQLite
const db = new sqlite3.Database('./spese.db', (err) => {
    if (err) console.error('Errore apertura DB:', err.message);
    else console.log('Connesso al database SQLite.');
});

// Schema: tutto dentro un blocco serializzato, così su un database nuovo la
// tabella esiste già quando parte la migrazione della colonna note
db.serialize(() => {
    // Crea la tabella se non esiste (note compresa fin dall'inizio)
    db.run(`
        CREATE TABLE IF NOT EXISTS transazioni (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descrizione TEXT NOT NULL,
            importo REAL NOT NULL,
            tipo TEXT CHECK(tipo IN ('entrata', 'uscita')) NOT NULL,
            categoria TEXT NOT NULL,
            note TEXT,
            data TEXT DEFAULT (date('now'))
        )
    `);

    // Migrazione per i database creati prima dell'introduzione delle note
    db.run(`ALTER TABLE transazioni ADD COLUMN note TEXT`, (err) => {
        if (err && !/duplicate column/i.test(err.message)) console.error('Migrazione note:', err.message);
    });

    // Regole imparate: parola chiave della descrizione -> categoria e tipo
    db.run(`
        CREATE TABLE IF NOT EXISTS regole (
            chiave TEXT PRIMARY KEY,
            categoria TEXT NOT NULL,
            tipo TEXT NOT NULL,
            usi INTEGER DEFAULT 1
        )
    `);
});

/* ---------- Backup automatici ---------- */
const BACKUP_DIR = path.join(__dirname, 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function esportaDati(cb) {
    db.all('SELECT * FROM transazioni ORDER BY id', [], (err, rows) => {
        if (err) return cb(err);
        db.all('SELECT chiave, categoria, tipo, usi FROM regole', [], (err2, regole) => {
            if (err2) return cb(err2);
            cb(null, {
                versione: 2,
                esportato: new Date().toISOString(),
                transazioni: rows,
                regole: regole
            });
        });
    });
}

function creaBackup(motivo) {
    esportaDati((err, data) => {
        if (err) return console.error('Backup non riuscito:', err.message);
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        const file = path.join(BACKUP_DIR, `spese-${stamp}-${motivo}.json`);
        fs.writeFile(file, JSON.stringify(data, null, 2), (e) => {
            if (e) return console.error('Scrittura backup:', e.message);
            fs.readdir(BACKUP_DIR, (e2, files) => {
                if (e2) return;
                const vecchi = files.filter(f => f.endsWith('.json')).sort();
                vecchi.slice(0, Math.max(0, vecchi.length - 30)).forEach(f => {
                    fs.unlink(path.join(BACKUP_DIR, f), () => {});
                });
            });
        });
    });
}

/* ---------- Apprendimento delle categorie ---------- */
const STOPWORDS = new Set(['spesa', 'spese', 'pagamento', 'pagamenti', 'acquisto', 'acquisti', 'carta', 'conto',
    'contanti', 'altro', 'altra', 'varia', 'varie', 'della', 'delle', 'degli', 'questo', 'questa',
    'per', 'con', 'una', 'uno', 'gli', 'del', 'dei', 'delle']);

function chiaveRegola(descrizione) {
    const parole = (String(descrizione).toLowerCase().match(/[a-zà-ù]{4,}/gi) || [])
        .filter(p => !STOPWORDS.has(p));
    if (!parole.length) return null;
    return parole.sort((a, b) => b.length - a.length)[0];
}

function imparaRegola(descrizione, categoria, tipo) {
    const chiave = chiaveRegola(descrizione);
    if (!chiave || !categoria || String(categoria).toLowerCase() === 'varia') return;
    db.run(`INSERT INTO regole (chiave, categoria, tipo, usi) VALUES (?, ?, ?, 1)
            ON CONFLICT(chiave) DO UPDATE SET categoria = excluded.categoria, tipo = excluded.tipo, usi = usi + 1`,
        [chiave, categoria, tipo], (err) => {
            if (err) console.error('Regola:', err.message);
        });
}

// API - Scarica un backup completo
app.get('/api/backup', (req, res) => {
    esportaDati((err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="spese-backup-${new Date().toISOString().slice(0, 10)}.json"`);
        res.send(JSON.stringify(data, null, 2));
    });
});

// API - Ripristina un backup
app.post('/api/backup/ripristina', (req, res) => {
    const rows = req.body && Array.isArray(req.body.transazioni) ? req.body.transazioni : null;
    if (!rows) return res.status(400).json({ error: 'Questo file non è un backup di Gestione Spese' });
    // I backup vecchi (versione 1) non hanno le regole: in quel caso restano quelle attuali
    const regole = Array.isArray(req.body.regole) ? req.body.regole : null;
    creaBackup('prima-ripristino');
    let n = 0, nr = 0;
    db.serialize(() => {
        db.run('BEGIN');
        db.run('DELETE FROM transazioni');
        const stmt = db.prepare('INSERT INTO transazioni (descrizione, importo, tipo, categoria, note, data) VALUES (?, ?, ?, ?, ?, ?)');
        rows.forEach(r => {
            const descrizione = String(r.descrizione || '').trim();
            const importo = Math.abs(Number(r.importo));
            if (!descrizione || !Number.isFinite(importo) || importo <= 0) return;
            const tipo = r.tipo === 'entrata' ? 'entrata' : 'uscita';
            const categoria = String(r.categoria || '').trim() || 'Varia';
            const data = /^\d{4}-\d{2}-\d{2}$/.test(String(r.data || '')) ? r.data : new Date().toISOString().slice(0, 10);
            stmt.run([descrizione, importo, tipo, categoria, r.note ? String(r.note) : null, data]);
            n++;
        });
        stmt.finalize();
        if (regole) {
            db.run('DELETE FROM regole');
            const stmtR = db.prepare('INSERT OR REPLACE INTO regole (chiave, categoria, tipo, usi) VALUES (?, ?, ?, ?)');
            regole.forEach(r => {
                const chiave = String((r && r.chiave) || '').trim().toLowerCase();
                const categoria = String((r && r.categoria) || '').trim();
                if (!chiave || !categoria) return;
                const tipo = r.tipo === 'entrata' ? 'entrata' : 'uscita';
                const usi = Number(r.usi);
                stmtR.run([chiave, categoria, tipo, Number.isFinite(usi) && usi > 0 ? Math.floor(usi) : 1]);
                nr++;
            });
            stmtR.finalize();
        }
        db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ripristinati: n, regole: nr });
        });
    });
});

// API - Regole imparate
app.get('/api/regole', (req, res) => {
    db.all('SELECT chiave, categoria, tipo FROM regole', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API - Ottieni tutte le transazioni
app.get('/api/transazioni', (req, res) => {
    db.all('SELECT * FROM transazioni ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API - Aggiungi una transazione
app.post('/api/transazioni', (req, res) => {
    const { descrizione, importo, tipo, categoria, note, data } = req.body;
    if (!descrizione || !importo || !tipo || !categoria) {
        return res.status(400).json({ error: 'Compila tutti i campi' });
    }

    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) ? data : null;
    const query = dataValida
        ? `INSERT INTO transazioni (descrizione, importo, tipo, categoria, note, data) VALUES (?, ?, ?, ?, ?, ?)`
        : `INSERT INTO transazioni (descrizione, importo, tipo, categoria, note) VALUES (?, ?, ?, ?, ?)`;
    const parametri = dataValida
        ? [descrizione, importo, tipo, categoria, note || null, dataValida]
        : [descrizione, importo, tipo, categoria, note || null];
    db.run(query, parametri, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        imparaRegola(descrizione, categoria, tipo);
        res.json({ id: this.lastID, descrizione, importo, tipo, categoria, note: note || null });
    });
});

// API - Importa più transazioni in blocco (CSV / Excel incollato)
app.post('/api/transazioni/import', (req, res) => {
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : null;
    if (!rows || !rows.length) return res.status(400).json({ error: 'Nessuna riga da importare' });
    if (rows.length > 20000) return res.status(400).json({ error: 'Troppe righe in una sola volta' });

    const valid = [];
    let skipped = 0;
    rows.forEach(r => {
        const descrizione = String(r.descrizione || '').trim();
        const importo = Math.abs(Number(r.importo));
        const tipo = r.tipo === 'entrata' ? 'entrata' : 'uscita';
        const categoria = String(r.categoria || '').trim() || 'Varia';
        const data = /^\d{4}-\d{2}-\d{2}$/.test(String(r.data || '')) ? r.data : new Date().toISOString().slice(0, 10);
        const note = r.note ? String(r.note).trim() : null;
        if (!descrizione || !Number.isFinite(importo) || importo <= 0) { skipped++; return; }
        valid.push([descrizione, importo, tipo, categoria, note, data]);
    });

    if (!valid.length) return res.status(400).json({ error: 'Nessuna riga valida: serve almeno descrizione e importo' });

    db.serialize(() => {
        db.run('BEGIN');
        const stmt = db.prepare(`INSERT INTO transazioni (descrizione, importo, tipo, categoria, note, data) VALUES (?, ?, ?, ?, ?, ?)`);
        valid.forEach(v => stmt.run(v));
        stmt.finalize();
        db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ imported: valid.length, skipped });
        });
    });
});

// API - Modifica una transazione
app.put('/api/transazioni/:id', (req, res) => {
    const { descrizione, importo, tipo, categoria, note, data } = req.body;
    if (!descrizione || !importo || !tipo || !categoria) {
        return res.status(400).json({ error: 'Compila tutti i campi' });
    }

    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) ? data : null;
    const query = dataValida
        ? `UPDATE transazioni SET descrizione = ?, importo = ?, tipo = ?, categoria = ?, note = ?, data = ? WHERE id = ?`
        : `UPDATE transazioni SET descrizione = ?, importo = ?, tipo = ?, categoria = ?, note = ? WHERE id = ?`;
    const parametri = dataValida
        ? [descrizione, importo, tipo, categoria, note || null, dataValida, req.params.id]
        : [descrizione, importo, tipo, categoria, note || null, req.params.id];
    db.run(query, parametri, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        imparaRegola(descrizione, categoria, tipo);
        res.json({ updated: this.changes });
    });
});

// API - Elimina una transazione
app.delete('/api/transazioni/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM transazioni WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// Avvia il Server ascoltando su tutte le interfacce di rete (0.0.0.0)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server avviato con successo!`);
    console.log(`💻 Dal tuo PC apri:  http://localhost:${PORT}`);
    console.log(`📱 Dal telefono apri: http://<INDIRIZZO-IP-DEL-TUO-PC>:${PORT}\n`);

    // Copia di sicurezza all'avvio e poi una volta al giorno
    setTimeout(() => creaBackup('avvio'), 1500);
    setInterval(() => creaBackup('giornaliero'), 24 * 60 * 60 * 1000).unref();
});
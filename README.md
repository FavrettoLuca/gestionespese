# Gestione Spese

Web app locale per tenere traccia delle spese e delle entrate di casa: inserimento rapido in linguaggio naturale, categorie che si imparano da sole, grafici e backup automatici. Gira interamente sul tuo computer, senza account e senza servizi esterni.

## Caratteristiche

- **Inserimento rapido** — scrivi una riga tipo `12,50 caffè ieri` e l'app ricava importo, descrizione e data.
- **Categorie che si imparano** — ogni volta che assegni una categoria, l'app memorizza la parola chiave e la ripropone la volta successiva.
- **Entrate e uscite** con importo, categoria, note e data.
- **Ricerca** tra descrizioni e note.
- **Grafico per categoria** per vedere dove finiscono i soldi.
- **Import da Excel/CSV** incollando direttamente le celle copiate dal foglio di calcolo.
- **Backup e ripristino** in JSON, con copia automatica all'avvio e una volta al giorno.
- **Installabile sul telefono** (PWA) e raggiungibile dal Wi-Fi di casa.
- **Dati solo in locale**: un unico file SQLite, nessun dato inviato altrove.

## Stack

- **Node.js** + **Express 5** per il server
- **SQLite** (driver `sqlite3`) come database
- **HTML/CSS/JavaScript vanilla** per l'interfaccia, con service worker per l'uso da telefono

## Requisiti

- [Node.js](https://nodejs.org) 18 o superiore

## Avvio

```bash
npm install
npm start
```

Poi apri <http://localhost:3000>.

Il database `spese.db` viene creato automaticamente al primo avvio, insieme alla cartella `backups/`.

### Su Windows

In alternativa al terminale si possono usare gli script inclusi:

- `avvia.bat` — avvia il server e apre il browser
- `chiudi.bat` — spegne il server

### Dal telefono

Collega il telefono alla stessa rete Wi-Fi del computer, trova l'indirizzo IP locale del PC (`ipconfig` su Windows) e apri `http://<IP-DEL-PC>:3000`. Da lì puoi aggiungere l'app alla schermata Home.

## Struttura del progetto

```
server.js          API Express + database SQLite + backup
public/
  index.html       interfaccia dell'app
  manifest.json    configurazione PWA
  sw.js            service worker
  icon-*.png       icone
avvia.bat          avvio rapido su Windows
chiudi.bat         spegnimento del server su Windows
```

## API

| Metodo | Percorso | Descrizione |
| --- | --- | --- |
| `GET` | `/api/transazioni` | elenco dei movimenti |
| `POST` | `/api/transazioni` | aggiunge un movimento |
| `PUT` | `/api/transazioni/:id` | modifica un movimento |
| `DELETE` | `/api/transazioni/:id` | elimina un movimento |
| `POST` | `/api/transazioni/import` | import in blocco |
| `GET` | `/api/regole` | categorie imparate |
| `GET` | `/api/backup` | scarica un backup JSON |
| `POST` | `/api/backup/ripristina` | ripristina un backup |

## Privacy

Il repository non contiene dati personali: `spese.db`, la cartella `backups/`, i log e le note locali sono esclusi tramite `.gitignore`. Se cloni il progetto parti da un archivio vuoto.

## Licenza

ISC

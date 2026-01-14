# Figma Local MCP Server

Un server MCP (Model Context Protocol) che permette a Claude di interagire direttamente con Figma Desktop, senza API key e senza limiti di rate.

## A cosa serve?

Questo sistema permette a Claude (via Claude Code o altri client MCP) di:
- **Leggere** il contenuto dei tuoi file Figma (pagine, frame, componenti, proprietà)
- **Modificare** i design (creare frame, convertire in componenti, spostare nodi, cambiare proprietà)
- **Esportare** elementi come immagini (PNG, SVG, JPG)

Tutto avviene **localmente** sul tuo computer, senza passare per API cloud.

## Architettura

```
┌─────────────────┐     WebSocket      ┌─────────────────┐      HTTP       ┌─────────────────┐
│  Figma Desktop  │◄──────────────────►│  Bridge Server  │◄───────────────►│   MCP Server    │
│    + Plugin     │    ws://localhost   │   (Node.js)     │  localhost:3001 │   (per Claude)  │
└─────────────────┘        :3000        └─────────────────┘                 └─────────────────┘
                                                                                    │
                                                                                    ▼
                                                                           ┌─────────────────┐
                                                                           │  Claude Code /  │
                                                                           │  Altri client   │
                                                                           └─────────────────┘
```

**Componenti:**

1. **Figma Plugin** (`figma-plugin/`) - Gira dentro Figma Desktop e ha accesso completo alla Plugin API
2. **Bridge Server** (`bridge-server.js`) - Server WebSocket che fa da ponte tra il plugin e il mondo esterno
3. **MCP Server** (`mcp.js`) - Espone i tool di Figma a Claude tramite protocollo MCP

## Requisiti

- Node.js 18+
- Figma Desktop (non funziona con Figma web)
- Claude Code CLI (o altro client MCP)

## Setup completo (prima volta)

### 1. Installa le dipendenze

```bash
cd figma-mcp-server
yarn install
```

### 2. Compila il plugin TypeScript

```bash
yarn build-plugin
# oppure: npx tsc -p figma-plugin/tsconfig.json
```

### 3. Importa il plugin in Figma

1. Apri **Figma Desktop**
2. Vai su **Plugins → Development → Import plugin from manifest...**
3. Naviga fino a `figma-mcp-server/figma-plugin/` e seleziona `manifest.json`
4. Il plugin "Figma MCP Bridge" apparirà nel menu Plugins → Development

### 4. Registra l'MCP server in Claude Code

```bash
# Sostituisci il path con quello corretto sul tuo sistema
claude mcp add figma-local node /Users/TUO_USER/path/to/figma-mcp-server/mcp.js
```

Verifica che sia registrato:
```bash
claude mcp list
```

## Utilizzo quotidiano

Ogni volta che vuoi usare Claude con Figma, devi avviare i componenti in questo ordine:

### Step 1: Avvia il Bridge Server

In un terminale dedicato (lascialo aperto):

```bash
cd figma-mcp-server
yarn bridge
# oppure: node bridge-server.js
```

Vedrai:
```
Bridge server listening on ws://localhost:3000
HTTP API listening on http://localhost:3001
Waiting for Figma plugin to connect...
```

### Step 2: Avvia il plugin in Figma

1. Apri il file Figma su cui vuoi lavorare
2. Vai su **Plugins → Development → Figma MCP Bridge**
3. Si aprirà una piccola finestra del plugin
4. Nel terminale del bridge vedrai: `Figma plugin connected`

### Step 3: Usa Claude

Ora puoi chiedere a Claude di interagire con Figma:

```
"Cosa c'è nella pagina corrente di Figma?"
"Trova tutti i componenti che si chiamano Button"
"Crea un frame 100x100 chiamato TestFrame"
"Converti il frame selezionato in componente"
"Esporta il nodo 123:456 come PNG"
```

## Tool disponibili

### Lettura (Read)

| Tool | Descrizione |
|------|-------------|
| `get-figma-document` | Struttura del documento (pagine e nodi principali) |
| `get-current-page` | Dettagli della pagina attiva |
| `get-selection` | Nodi attualmente selezionati |
| `get-all-pages` | Lista di tutte le pagine |
| `find-nodes` | Cerca nodi per nome |
| `get-node-properties` | Proprietà dettagliate di un nodo (fills, strokes, effects, ecc.) |
| `check-bridge-status` | Verifica lo stato della connessione |

### Scrittura (Write)

| Tool | Descrizione |
|------|-------------|
| `create-frame` | Crea un nuovo frame |
| `create-component` | Converte un frame in componente (preserva auto-layout) |
| `create-component-set` | Combina componenti in varianti |
| `rename-node` | Rinomina un nodo |
| `move-node` | Sposta un nodo in un altro parent |
| `duplicate-node` | Duplica un nodo |
| `delete-node` | Elimina un nodo |
| `set-node-property` | Modifica proprietà (fills, effects, cornerRadius, ecc.) |
| `group-nodes` | Raggruppa nodi |
| `clone-to-page` | Clona un nodo in un'altra pagina |

### Export

| Tool | Descrizione |
|------|-------------|
| `export-node` | Esporta un nodo come PNG, SVG o JPG |

## Esempi pratici

### Creare un FAB (Floating Action Button)

```
"Crea un frame chiamato FAB di 56x56 pixel,
con corner radius 28, colore verde #22C55E,
e ombre neumorfiche"
```

### Ispezionare un componente

```
"Mostrami le proprietà del nodo 14:31"
```

### Convertire in componente preservando il layout

```
"Converti il frame FAB_New in componente"
```

## Troubleshooting

### "Figma plugin not connected"

1. Verifica che il bridge server sia in esecuzione (`yarn bridge`)
2. In Figma, riapri il plugin: Plugins → Development → Figma MCP Bridge
3. Controlla che non ci siano altri processi sulle porte 3000/3001

### Il plugin si disconnette

Il plugin rimane attivo solo finché la sua finestra è aperta in Figma. Se chiudi la finestra del plugin, devi riaprirlo.

### Le modifiche al codice non hanno effetto

Dopo aver modificato `code.ts`:
1. Ricompila: `yarn build-plugin`
2. In Figma, chiudi e riapri il plugin

### Claude non vede i tool di Figma

```bash
# Verifica che l'MCP sia registrato
claude mcp list

# Se non c'è, aggiungilo di nuovo
claude mcp add figma-local node /path/to/figma-mcp-server/mcp.js
```

## Struttura del progetto

```
figma-mcp-server/
├── figma-plugin/
│   ├── manifest.json      # Manifest del plugin Figma
│   ├── code.ts            # Codice principale del plugin (TypeScript)
│   ├── code.js            # Codice compilato (generato da tsc)
│   ├── ui.html            # UI del plugin
│   └── tsconfig.json      # Configurazione TypeScript
├── bridge-server.js       # Server WebSocket (ponte plugin ↔ MCP)
├── mcp.js                 # Server MCP (espone i tool a Claude)
├── package.json
└── README.md
```

## Sviluppo: aggiungere nuovi tool

### 1. Aggiungi l'handler nel plugin

In `figma-plugin/code.ts`, aggiungi un case nello switch:

```typescript
case 'my-new-action':
  result = await myNewAction(params.someParam);
  break;
```

E implementa la funzione:

```typescript
async function myNewAction(someParam: string) {
  // Usa la Figma Plugin API
  return { success: true, data: ... };
}
```

### 2. Esponi il tool via MCP

In `mcp.js`, registra il nuovo tool:

```javascript
server.tool('my-new-tool', 'Description of what it does', {
  someParam: z.string().describe('Parameter description')
}, async ({ someParam }) => {
  const response = await fetch('http://localhost:3001/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'my-new-action', params: { someParam } })
  });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

### 3. Ricompila e testa

```bash
yarn build-plugin
# Riapri il plugin in Figma
```

## Vantaggi rispetto alle API Figma

| Aspetto | API Figma | Questo sistema |
|---------|-----------|----------------|
| API Key | Richiesta | Non necessaria |
| Rate limits | Sì (costringono a pagare) | Nessuno |
| File privati | Solo con permessi | Tutti i tuoi file |
| Selezione real-time | No | Sì |
| Operazioni di scrittura | Limitate | Complete (Plugin API) |
| Latenza | Network | Locale (~instant) |

## Script disponibili

```bash
yarn install        # Installa dipendenze
yarn build-plugin   # Compila il plugin TypeScript
yarn bridge         # Avvia il bridge server
```

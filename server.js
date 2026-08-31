/*
 * service-commandes — TP1 Performance et Optimisation des Systemes (L3 DAR)
 *
 * Route : GET /commande?montant=X&iterations=N
 *   - montant     : nombre > 0 (obligatoire)
 *   - iterations  : nombre d'iterations de la boucle CPU (optionnel)
 *                   defaut = variable d'env ITERATIONS, sinon 200000
 *
 * Lancement :
 *   node server.js                      # 1 worker, port 8080
 *   PORT=8080 ITERATIONS=200000 node server.js
 *   WORKERS=4 node server.js            # 4 processus (exo bonus 3.2)
 *
 * Reponse JSON : { resultat, duree_ms, worker }
 */

const http = require('http');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ITERATIONS_DEFAUT = parseInt(process.env.ITERATIONS || '200000', 10);
const WORKERS = parseInt(process.env.WORKERS || '1', 10);
const LOG_FILE = 'commandes.log';

// --- Le "coeur" du service : reproduit le pseudo-code du sujet -----------------
function traiterCommande(montant, iterations) {
  const debut = process.hrtime.bigint();

  // 1. Validation (cout fixe, tres rapide)
  if (!Number.isFinite(montant) || montant <= 0) {
    throw new Error('montant invalide');
  }

  // 2. Calcul "metier" - boucle CPU-bound ('iterations' = robinet de charge)
  let resultat = 0;
  for (let i = 1; i <= iterations; i++) {
    resultat += Math.sqrt(montant * i);
  }

  // 3. Ecriture d'un log sur disque (I/O) avec fsync force
  const ligne = new Date().toISOString() + ';' + montant + '\n';
  const fd = fs.openSync(LOG_FILE, 'a');
  fs.writeSync(fd, ligne);
  fs.fsyncSync(fd);              // forcer_ecriture_disque()
  fs.closeSync(fd);

  const fin = process.hrtime.bigint();
  const duree_ms = Number(fin - debut) / 1e6;
  return { resultat, duree_ms };
}

// --- Serveur HTTP ------------------------------------------------------------
function demarrerServeur() {
  const serveur = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' || url.pathname !== '/commande') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ erreur: 'route inconnue' }));
      return;
    }

    const montant = Number(url.searchParams.get('montant'));
    const iterations = url.searchParams.has('iterations')
      ? parseInt(url.searchParams.get('iterations'), 10)
      : ITERATIONS_DEFAUT;

    try {
      const r = traiterCommande(montant, iterations);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resultat: r.resultat,
        duree_ms: r.duree_ms,
        worker: process.pid,
      }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ erreur: e.message }));
    }
  });

  serveur.listen(PORT, () => {
    console.log(`service-commandes  pid=${process.pid}  port=${PORT}  iterations_defaut=${ITERATIONS_DEFAUT}`);
  });
}

// --- Mode mono-worker ou cluster (exo bonus 3.2) ---------------------------
if (WORKERS > 1 && cluster.isPrimary) {
  console.log(`primary pid=${process.pid}  lancement de ${WORKERS} workers`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on('exit', (w) => console.log(`worker ${w.process.pid} arrete`));
} else {
  demarrerServeur();
}

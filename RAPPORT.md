# TP1 — Métriques de performance et lois fondamentales

**Cours :** Performance et Optimisation des Systèmes — L3 DAR
**Auteur :** _(ton nom)_
**Dépôt Git :** _(URL du dépôt)_
**Environnement de mesure :** WSL2 Ubuntu sur Windows 11 — CPU _(modèle, nb cœurs)_, RAM _(Go)_.
**Service :** `service-commandes` en Node.js (`server.js`), port 8080.

> ⚠️ Limite assumée : le générateur de charge (`ab`) et le service tournent sur
> la **même machine** (même VM WSL). L'outil de charge consomme donc du CPU et
> tire les mesures de débit légèrement vers le bas. Mentionné là où c'est pertinent.

---

## Partie A — Mesurer les métriques de base

### Exercice 2.1 — Latence d'une requête isolée

Commande :
```bash
curl -s -o /dev/null -w "temps total : %{time_total}s\n" \
  "http://localhost:8080/commande?montant=100&iterations=200000"
```

**Les 10 valeurs relevées (s) :**

| # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|----|
| time_total | | | | | | | | | | |

**Statistiques** (sortie de `stats.py`) :

| moyenne | médiane | min | max |
|---|---|---|---|
| | | | |

**Q3 — Latence ou débit ?**
> C'est une mesure de **latence** : on mesure le temps de traitement d'**une seule**
> requête de bout en bout, sans concurrence, donc aucun débit (req/s) n'est observé.

---

### Exercice 2.2 — Débit sous charge

```bash
ab -n 100  -c 10  "http://localhost:8080/commande?montant=100&iterations=200000"
ab -n 500  -c 50  "http://localhost:8080/commande?montant=100&iterations=200000"
ab -n 1000 -c 100 "http://localhost:8080/commande?montant=100&iterations=200000"
```

| Concurrence `-c` | Requests per second | Time per request (mean) | Time per request (mean, across all concurrent) | Failed requests |
|---|---|---|---|---|
| 10  | | | | |
| 50  | | | | |
| 100 | | | | |

**Q2 — Pourquoi les deux "Time per request" diffèrent ?**
> `Time per request (mean)` = temps vu par **un client** = il inclut l'attente pendant
> que les `c-1` autres requêtes concurrentes sont servies.
> `Time per request (mean, across all concurrent requests)` = le précédent **divisé par c**
> = temps « machine » moyen par requête = 1000 / (Requests per second).
> Rapport ≈ facteur `c`.

**Q3 — Le débit augmente-t-il indéfiniment ?**
> Non. Le service est **CPU-bound** et la machine a _N_ cœurs. Tant que `c ≤ N`, ajouter
> de la concurrence augmente le débit. Au-delà, les requêtes se **partagent** les mêmes
> cœurs : le débit plafonne (≈ N / latence_service) puis se dégrade légèrement à cause
> du coût de commutation de contexte et de la contention sur le fichier de log (`fsync`).
> Le temps de réponse, lui, continue de croître linéairement avec `c` (file d'attente).

---

### Exercice 2.3 — Percentiles de temps de réponse

```bash
ab -n 500 -c 20 -e resultats.csv -g gnuplot.tsv \
  "http://localhost:8080/commande?montant=100&iterations=200000"
```

`resultats.csv` (option `-e`) donne directement la courbe percentile → temps (ms).

| Métrique | Valeur (ms) |
|---|---|
| moyenne (depuis la sortie `ab`, ligne *Time per request mean*) | |
| p50 (ligne `50,` de resultats.csv) | |
| **p95** (ligne `95,` de resultats.csv) | |
| p99 (ligne `99,` de resultats.csv) | |
| max (ligne `100,`) | |

**Q2 — Que révèle l'écart moyenne ↔ p95 ?**
> Un p95 nettement supérieur à la moyenne révèle une **distribution à queue longue** :
> la plupart des requêtes sont rapides, mais une minorité est beaucoup plus lente
> (pics de `fsync`, planification OS, GC…). La moyenne masque ces cas ; le p95 les expose.

**Q3 — SLA sur la moyenne ou le p95 ?**
> Sur le **p95** (ou p99). Un SLA doit garantir l'expérience de la **quasi-totalité**
> des utilisateurs, y compris ceux qui tombent sur les requêtes lentes. Une moyenne
> peut rester basse alors que 5 % des clients subissent des temps inacceptables.

---

## Partie B — Loi d'Amdahl

### Exercice 3.1 — Calculs analytiques

Phases : lecture séquentielle **3 min**, calcul parallélisable **42 min**, écriture séquentielle **5 min**. Total **50 min**.

**1. Fraction parallélisable**
```
p     = 42 / 50 = 0,84
1 - p = 8  / 50 = 0,16   (part séquentielle)
```

**2. Speedup maximal théorique**
```
S_max = 1 / (1 - p) = 1 / 0,16 = 6,25
```

**3. S(N) = 1 / ( (1-p) + p/N ) = 1 / ( 0,16 + 0,84/N )**

| N | 0,16 + 0,84/N | S(N) |
|---|---|---|
| 4  | 0,3700  | **2,70** |
| 16 | 0,2125  | **4,71** |
| 64 | 0,17313 | **5,78** |

**4. Seuil où doubler N rapporte moins de 5 %** — on compare `S(2N)/S(N) − 1` :

| N → 2N | S(N) | S(2N) | gain marginal |
|---|---|---|---|
| 16 → 32  | 4,71 | 5,37 | +14,1 % |
| 32 → 64  | 5,37 | 5,78 | +7,6 %  |
| **64 → 128** | 5,78 | 6,00 | **+3,9 %** ← < 5 % |

> **À partir de N = 64**, doubler le nombre de processeurs apporte moins de 5 %
> de speedup supplémentaire. Au-delà, on paie du matériel pour un gain négligeable.

**5. Investir dans 128 processeurs au lieu de 32 ?**
> À N = 32 le speedup est de 5,37, soit déjà **86 %** du plafond théorique (6,25).
> Passer à 128 (4× plus de matériel et d'énergie) ne fait monter le speedup qu'à 6,00,
> soit **+11,7 %** seulement. L'efficacité par processeur s'effondre de 16,8 % (à N=32)
> à 4,7 % (à N=128). L'investissement n'est **pas pertinent** : mieux vaut garder 32
> processeurs et chercher à réduire la part séquentielle de 16 % (lecture/écriture),
> qui est désormais le vrai facteur limitant.

### Exercice 3.2 — Vérification expérimentale (bonus)

```bash
# relancer le service avec N workers, puis mesurer le debit (ab -n 500 -c 20)
WORKERS=1 node server.js   # puis WORKERS=2, puis WORKERS=4
```

| Workers N | Débit (req/s) | S(N) = débit(N)/débit(1) |
|---|---|---|
| 1 | | 1,00 |
| 2 | | |
| 4 | | |

**p réel** (résoudre `S(4) = 1 / ((1-p) + p/4)`) :
```
p = (1 - 1/S(4)) / (1 - 1/4) = (1 - 1/S4) / 0,75 = ...
```

**Q3 — Part séquentielle cachée ?**
> Le `Math.sqrt` est parallélisable, mais chaque worker fait un **`fsync` sur le même
> fichier `commandes.log`** → contention disque + sérialisation des écritures par l'OS.
> S'ajoutent : le threadpool libuv (taille 4 par défaut) partagé pour les I/O,
> l'allocation mémoire, et le fait que `ab` sur la même machine consomme des cœurs.
> On observe donc `p_réel < 1` (speedup sous-linéaire).

---

## Partie C — Loi de Little

### Exercice 4.1 — Dimensionnement d'un pool (à partir de l'exo 2.2, `-c 20`)

```bash
ab -n 500 -c 20 "http://localhost:8080/commande?montant=100&iterations=200000"
```

```
λ = _____ req/s          (Requests per second)
W = _____ s              (Time per request mean, en secondes = valeur ms / 1000)
L = λ × W = _____        (nombre moyen de requêtes simultanément en cours)
```

**Comparaison au pool :**
> Node.js sert le JavaScript sur **un seul thread** (event loop) ; le « pool »
> pertinent ici est le **threadpool libuv** (défaut = 4) utilisé par les opérations
> `fs` / `fsync`.
> - Si `L ≫ 4` → le pool est **sous-dimensionné** : des requêtes attendent un thread I/O
>   libre. Piste : augmenter `UV_THREADPOOL_SIZE`, ou passer le service en cluster.
> - Si `L ≈ 4` → correctement dimensionné.
> - Si `L ≪ 4` → sur-dimensionné (peu probable ici, service CPU-bound).
>
> _(Conclure avec la valeur de L effectivement mesurée.)_

### Exercice 4.2 — Cas d'étude chiffré

Service de notification push : λ = 1200 notif/s.

**1. W = 150 ms = 0,150 s**
```
L = λ × W = 1200 × 0,150 = 180 notifications en cours de traitement à tout instant.
```

**2. Nouveau fournisseur, W = 400 ms = 0,400 s, λ inchangé**
```
L = 1200 × 0,400 = 480 notifications en cours.
```
> Multiplier W par 2,67 multiplie L par 2,67 : le nombre de traitements « en vol »
> passe de 180 à 480, alors que le trafic entrant n'a pas bougé.

**3. 500 connecteurs réseau par serveur applicatif → nombre de serveurs mini après migration**
```
Serveurs = plafond( L / 500 ) = plafond( 480 / 500 ) = 1 serveur (au sens strict).
```
> Mais 480/500 = **96 % d'occupation** des connecteurs, sur une **moyenne** :
> le moindre pic de trafic ou de latence dépasse 500 et provoque des rejets.
> En pratique il faut donc **2 serveurs** pour garder une marge (avant migration :
> 180/500 = 36 %, un seul serveur suffisait confortablement). La migration « plus
> fiable mais plus lente » double quasiment le besoin en infrastructure.

---

## Conclusion (3 à 5 lignes)

> _(À rédiger après les mesures. Idées à exploiter :)_
> Les lois théoriques (Amdahl, Little) prédisent des ordres de grandeur — plafond de
> speedup, nombre de requêtes en vol — que les mesures confirment qualitativement mais
> jamais exactement : la réalité ajoute de la contention (fsync partagé, threadpool,
> commutation de contexte) et du bruit (co-résidence de l'outil de charge). La moyenne
> seule est trompeuse ; les percentiles disent la vérité vécue par les utilisateurs.
> Mesurer avant d'optimiser évite d'investir (128 CPU !) là où le goulot est ailleurs.

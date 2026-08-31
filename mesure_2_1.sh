#!/usr/bin/env bash
# Exo 2.1 - Latence d'une requete isolee : 10 appels curl, sans charge concurrente.
# Usage : ./mesure_2_1.sh   (le service doit tourner sur le port 8080)

URL="http://localhost:8080/commande?montant=100&iterations=200000"

echo "10 mesures de time_total (secondes) :"
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{time_total}\n" "$URL"
done | tee /tmp/mesures_2_1.txt

echo
echo "--- Statistiques ---"
python3 stats.py < /tmp/mesures_2_1.txt

#!/usr/bin/env python3
"""
Calcule moyenne / mediane / min / max / p50 / p95 / p99 a partir d'une liste
de nombres (un par ligne) lue sur l'entree standard.

Exemples :
  # Exo 2.1 : 10 mesures curl collees a la main
  printf '%s\n' 0.512 0.498 0.530 0.505 0.640 0.501 0.499 0.712 0.503 0.508 | python3 stats.py

  # Exo 2.3 : depuis le fichier gnuplot d'ab (option -g), colonne 'ttime'
  tail -n +2 gnuplot.tsv | awk '{print $5}' | python3 stats.py
"""
import sys

def percentile(tri, p):
    # methode "nearest-rank"
    if not tri:
        return float('nan')
    k = max(1, int(round(p / 100.0 * len(tri))))
    return tri[k - 1]

vals = [float(x) for x in sys.stdin.read().split() if x.strip()]
if not vals:
    sys.exit("aucune valeur lue sur stdin")

tri = sorted(vals)
n = len(tri)
moyenne = sum(tri) / n
mediane = (tri[n // 2] if n % 2 else (tri[n // 2 - 1] + tri[n // 2]) / 2)

print(f"n        = {n}")
print(f"moyenne  = {moyenne:.4f}")
print(f"mediane  = {mediane:.4f}")
print(f"min      = {tri[0]:.4f}")
print(f"max      = {tri[-1]:.4f}")
print(f"p50      = {percentile(tri, 50):.4f}")
print(f"p95      = {percentile(tri, 95):.4f}")
print(f"p99      = {percentile(tri, 99):.4f}")

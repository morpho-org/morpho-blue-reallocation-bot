# PRD — Morpho Blue Reallocation Bot (Blue Dolphin) v0

## 1) Contexte
Le repo `morpho-blue-reallocation-bot` existe déjà et fournit une base de rebalancing (stratégie d’equalization d’utilisation + config multi-chain). L’objectif est de le transformer en bot **production-grade** pour des vaults sensibles.

## 2) Objectif produit
Construire un bot de reallocation Morpho Blue opérable en prod, avec:
- sécurité des clés,
- garde-fous de risque,
- exécution fiable,
- observabilité et procédures d’incident.

## 3) Succès (KPIs)
- 0 incident critique de sécurité lié au bot.
- 99%+ de cycles exécutés sans erreur fatale.
- 100% des transactions conformes aux limites de risque définies.
- Alerting < 60s sur échec, pause auto, ou dépassement seuil critique.

## 4) Scope v1 (MVP prod)
### 4.1 Safety & Risk (P0)
1. Key management durci
   - signer dédié (KMS/Vault/HSM ou wallet isolé),
   - rotation/révocation documentées.
2. Limites de transaction
   - `maxAmountPerTx`, `maxDailyNotional`, `maxGasPrice`, `maxSlippage`.
3. Circuit breaker
   - kill switch manuel,
   - auto-pause sur anomalies (échecs consécutifs, gas anormal, incohérence signal).
4. Simulation obligatoire
   - dry-run à chaque cycle,
   - exécution uniquement si bénéfice attendu > coût estimé (gas + impact).
5. Allowlist stricte
   - vaults/markets explicitement autorisés en config versionnée.

### 4.2 Fiabilité d’exécution (P1)
6. Idempotence + lock anti-concurrence.
7. Retry policy robuste + gestion reorg.
8. Validation config au démarrage (fail fast).

### 4.3 Observabilité (P0/P1)
9. Logs structurés (JSON) + corrélation cycle/tx.
10. Métriques
    - cycles, reallocs tentées/réussies/échouées,
    - gas utilisé,
    - raisons d’abandon.
11. Alerting Discord/Slack
    - fail, pause auto, tx rejetée par policy, inactivité.

### 4.4 Opérations
12. Runbooks
    - start/stop,
    - incident response,
    - rollback.
13. Dashboard opérateur minimal
    - statut bot,
    - dernier cycle,
    - dernière tx,
    - vault health basique.

## 5) Hors scope (v1)
- Optimisation alpha complexe multi-objectifs.
- Backtesting historique avancé.
- UI produit complète.

## 6) Exigences non-fonctionnelles
- Déploiement déterministe (Docker).
- Secrets non stockés en clair dans repo.
- SLO: redémarrage auto < 2 min après crash.
- Compatibilité multi-chain (au moins Ethereum + Base).

## 7) Architecture cible (haut niveau)
- `decision-engine`: calcule candidates + score coût/bénéfice.
- `risk-engine`: applique politiques et limites (allow/deny).
- `executor`: soumet tx, gère retry + confirmations.
- `state-store`: historique cycles/tx + locks.
- `observer`: logs/metrics/alerts.

## 8) Plan d’implémentation (2 semaines)
### Semaine 1
- J1–J2: policy engine + limites P0.
- J3: kill switch + auto-pause.
- J4: simulation gate + coût estimé.
- J5: logs structurés + alerting minimal.

### Semaine 2
- J6: lock/idempotence/retry.
- J7: validation config + tests critiques.
- J8: dashboard opérateur minimal.
- J9: runbooks + drill incident.
- J10: canary sur 1 vault low-risk.

## 9) Critères d’acceptance
- Aucune tx on-chain sans passage du risk-engine.
- Kill switch testé et fonctionnel.
- 3 scénarios d’échec simulés avec auto-pause.
- Alertes reçues en canal ops.
- Canary 48h stable avant extension.

## 10) Questions ouvertes
1. Quel provider de secrets (Vault/KMS/autre) ?
2. Limites par défaut par vault (notional/slippage/gas) ?
3. Canal d’alerting principal (Discord, Slack, les deux) ?
4. DB cible (Postgres managé vs local container) ?
5. SLA de disponibilité attendu par le desk ?

# Perps Refactor Scope & Checklist

Ce document liste tous les modules concernés par la refonte "single source of truth" des perpétuels ainsi que la checklist des chantiers à mener avant d'attaquer le refactor.

## 1. Services & Engines

| Domaine | Fichier / dossier | Rôle actuel | Notes refactor |
| --- | --- | --- | --- |
| Core engine | `src/engine/PerpetualsEngine.ts` | Gestion en mémoire des marchés, positions, PnL, funding. | Doit devenir la seule source runtime (idéalement process unique) ; ajouter API d’updates/d’événements. |
| Engine bootstrap | `src/lib/perps-service.ts` | Singleton + hydration depuis Prisma. | À revoir si on déplace l’engine dans un worker. |
| Trade orchestration | `src/lib/services/perp-trade-service.ts` | Open/close user, wallet, fees. | Fera appel au nouveau PriceService + API RPC vers l’engine. |
| Price impact | `src/lib/services/perp-price-impact-service.ts` | Applique les trades user aux prix organisations + SSE. | Doit devenir le pipeline unique de mise à jour (persist + notify). |
| Market impact agrégateur | `src/lib/services/market-impact-service.ts` | Agrège volumes long/short pour price impacts. | Inchangé mais devra peut-être publier des événements. |
| Trade execution (agents) | `src/lib/services/trade-execution-service.ts` | Trades NPC (perps & prédictions). | Doit consommer la même API que les users (pas d’accès direct Prisma). |
| Wallet & fees | `src/lib/services/wallet-service.ts`, `src/lib/services/fee-service.ts` | Comptabilité des points et frais. | Vérifier que les transactions restent atomiques avec le nouveau flow. |
| SSE broadcast | `src/lib/sse/event-broadcaster.ts` | Push updates aux clients. | Sera appelé depuis le PriceService / engine. |
| Scripts & cron | `scripts/monitor-market-activity.ts`, `scripts/db.ts` etc. | Observabilité / maintenance. | Confirmer ce qu’ils lisent comme source (Prisma vs engine). |

## 2. API & Routes Next.js

| Route | Description | Liens |
| --- | --- | --- |
| `POST /api/markets/perps/open` | Ouverture d’un perp | `src/app/api/markets/perps/open/route.ts` |
| `POST /api/markets/perps/[positionId]/close` | Fermeture | `src/app/api/markets/perps/[positionId]/close/route.ts` |
| `GET /api/markets/perps` | Liste des marchés | `src/app/api/markets/perps/route.ts` (lit Prisma) |
| `GET /api/markets/positions/[userId]` | Positions user | `src/app/api/markets/positions/[userId]/route.ts` |
| `GET /api/users/[userId]/balance` | Balance points | `src/app/api/users/[userId]/balance/route.ts` |
| SSE `api/sse/markets` | Diffusion updates | `src/app/api/sse/markets/route.ts` |

Ces handlers devront pointer vers le nouveau service (engine RPC + PriceService) et ne plus lire directement Prisma sauf pour les historiques.

## 3. Hooks & UI touchpoints

| Composant / hook | Fichier | Usage |
| --- | --- | --- |
| Hook trades | `src/hooks/usePerpTrade.ts` | Appels open/close côté client |
| Hook positions | `src/hooks/useUserPositions.ts` | Consomme `/api/markets/positions` |
| Hook balance | `src/hooks/useWalletBalance.ts` | Affiche la balance real-time |
| Page marchés perps | `src/app/markets/perps/[ticker]/page.tsx` | UI de trading détaillée |
| Liste positions | `src/components/markets/PerpPositionsList.tsx` | Cartes PnL |
| Modal trading global | `src/components/markets/PerpTradingModal.tsx` | Trading depuis la page principale |
| Widget wallet | `src/components/shared/WalletBalance.tsx` | Résumé balance / lifetime PnL |

## 4. Autres consommateurs (agents & scripts)

| Module | Description | Actions refactor |
| --- | --- | --- |
| `src/lib/services/trade-execution-service.ts` | Traders IA (NPC). | Basculer sur PerpTradeService standard (plus d’accès direct Prisma). |
| `src/eliza/agents/**` | Stratégies Eliza. | Vérifier comment les trades sont déclenchés (souvent via TradeExecutionService). |
| `scripts/monitor-market-activity.ts` | Monitoring / alertes. | Définir la source des métriques (engine ou DB). |
| `tests/**` | Suites unitaires / e2e. | Adapter les mocks et écrire des tests d’intégration open→close. |

## 5. Checklist refactor

1. **Définir la cible architecture**
   - [ ] Choisir : engine process unique dans Next ou worker/service dédié.
   - [ ] Définir l’interface RPC (open, close, priceUpdate, snapshot, stats).
2. **Pipeline de prix unique**
   - [ ] Créer un `PriceUpdateService` qui persiste `organization.currentPrice`, historise, notifie SSE et push l’update à l’engine.
   - [ ] Forcer `applyPerpTradeImpacts`, les agents et les events narratifs à passer par ce service.
3. **PerpTradeService**
   - [ ] Utiliser systématiquement le prix issu de l’engine/PriceService (plus de fallback DB obsolète).
   - [ ] S’assurer que les transactions (position + wallet + fee) restent atomiques.
4. **API routes**
   - [ ] Refactor `open/close/markets/positions` pour appeler les nouveaux services / RPC.
   - [ ] Ajouter logs/metrics sur les prix utilisés pour debugging.
5. **Hydration & résilience**
   - [ ] Mettre en place un snapshot ou journal pour reconstruire l’engine au boot.
   - [ ] Script de comparaison `perpPosition.currentPrice` vs `organization.currentPrice` avant switch.
6. **Front & hooks**
   - [ ] Vérifier que les endpoints fournis au front lisent bien la même source (sinon introduire un flux SSE positions/PnL).
   - [ ] QA manuelle des pages perps (open/close, solde, PnL).
7. **Tests & rollout**
   - [ ] Étendre les tests unitaires engine/services (override price, liquidations, funding).
   - [ ] Ajouter un test d’intégration “open -> price update -> close” qui vérifie la balance.
   - [ ] Plan de déploiement (feature flag, migration progressive, monitoring post-release).

---

Ce fichier servira de feuille de route pendant le refactor : on coche les items et on ajoute les nouveaux consommateurs identifiés au fil de l’eau.

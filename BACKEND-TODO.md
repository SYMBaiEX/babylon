# Backend TODO: Email Collection for Waitlist

The UI for email collection on the waitlist page has been implemented. The frontend calls `POST /api/waitlist/bonus/email` with `{ email: string }`. The backend needs the following to make it functional:

## 1. Create the API route

Move/copy the placeholder route to the real path:

```
FROM: apps/web/src/app/api/waitlist/placeholder/email/route.ts
TO:   apps/web/src/app/api/waitlist/bonus/email/route.ts
```

The placeholder is a rough starting point only — it may have issues. Backend dev should review, verify, and update the route as needed before moving it to the real path.

## 2. Add `awardEmailBonus` to WaitlistService

**File:** `packages/api/src/services/waitlist-service.ts`

Add a static method following the `awardWalletBonus` pattern:

```ts
static async awardEmailBonus(userId: string, email: string): Promise<boolean> {
  // 1. Fetch user, check pointsAwardedForEmail flag
  // 2. If already awarded, return false
  // 3. Save email to users.email
  // 4. Award POINTS.EMAIL_SUBMIT (100) bonus points to bonusPoints + reputationPoints
  // 5. Create pointsTransactions entry with reason: 'email_submit'
  // 6. Set pointsAwardedForEmail = true
  // 7. Return true
}
```

## 3. Database: Add `pointsAwardedForEmail` column

Add a boolean column `pointsAwardedForEmail` (default false) to the `users` table schema in `packages/db`.

## 4. Points constant and reason type (already done)

- `POINTS.EMAIL_SUBMIT = 100` added to `packages/shared/src/constants/points.ts`
- `'email_submit'` added to `PointsReason` type

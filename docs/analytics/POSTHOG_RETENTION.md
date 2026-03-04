# PostHog retention (D1, D7, D30)

How to set up and interpret retention in PostHog so D1/D7/D30 match product expectations. Retention is **configured in the PostHog UI**; this doc defines the events and steps.

---

## Definitions

| Metric | Meaning |
|--------|--------|
| **D1** | % of users who performed the “return” event **1 day** after their “start” event. |
| **D7** | % of users who performed the “return” event **7 days** after their “start” event. |
| **D30** | % of users who performed the “return” event **30 days** after their “start” event. |

“Start” = first time the user did the chosen **starting event**.  
“Return” = user did the chosen **returning event** on a later day (1, 7, or 30 days later).

---

## Recommended events

### Starting event (cohort definition)

Pick one depending on what you want to measure:

| Event | Use case |
|-------|----------|
| `signup_completed` | Retention of **signed-up users** (server-tracked on signup). |
| `$pageview` | Retention of **any visitor** (first page view). |

Use **one** of these per retention insight so cohorts are clear.

### Returning event ( “came back” )

Pick one or combine in separate insights:

| Event | Use case |
|-------|----------|
| `$pageview` | “Came back to the app” (any page). |
| `signup_completed` | Only useful if you run multiple signup flows; usually not for retention. |
| `prediction_bought` or `prediction_sold` | “Came back and traded (prediction)”. |
| `trade_opened` or `trade_closed` | “Came back and traded (perp)”. |
| `agent_message_sent` | “Came back and used agent chat”. |
| `post_created` | “Came back and posted”. |
| `message_sent` | “Came back and sent a DM”. |

For a single “active user” retention view, **`$pageview`** is the simplest returning event. For “power user” retention, use a specific action (e.g. any trade event or `agent_message_sent`).

---

## How to create the insight in PostHog

1. In PostHog go to **Insights** → **New insight** → **Retention**.
2. **Starting event:** e.g. `signup_completed` (for signed-up users) or `$pageview` (for all visitors). Optionally add filters (e.g. `environment = production`).
3. **Returning event:** e.g. `$pageview` or `prediction_bought` / `trade_opened` / `agent_message_sent` etc.
4. **Retention type:** “Retention (classic)” with **Day 1, Day 7, Day 30** (or “Retention (total)” and interpret the 1-, 7-, 30-day buckets).
5. Save and add to a dashboard (e.g. “Growth” or “Retention”).

Result: you get a retention table and/or curve; D1/D7/D30 are the percentages for days 1, 7, and 30.

---

## Identity

Retention in PostHog is per **distinct_id**. The app identifies logged-in users with `posthog.identify(user.id)` (see `PostHogIdentifier`). Server events use the same `userId` as `distinctId`. So:

- **Signed-up users:** use `signup_completed` as starting event; distinct_id is the user id.
- **Anonymous then signed up:** if you want “first touch” retention, use `$pageview` as starting event; after signup, the same user may have a new distinct_id unless you merge/anonymize (PostHog’s identity merge settings).

For consistent D1/D7/D30, prefer **signed-up users** and `signup_completed` as the starting event.

---

## In-app D7 vs PostHog

The app has its **own** D7 retention in the admin growth API (`/api/admin/stats/growth`), computed from DB cohorts and activity (trades, posts, messages). That is **separate** from PostHog:

- **PostHog retention:** event-based, defined by the events above; configure in PostHog UI.
- **Admin growth D7:** cohort-based from your database; no PostHog setup.

Use PostHog for product/behavior retention (events); use the admin API for internal reporting that must match your DB.

---

## Checklist (BAB-243)

- [ ] Create at least one **Retention** insight in PostHog with starting event = `signup_completed` (or `$pageview`) and returning event = `$pageview` (or a key action).
- [ ] Confirm **Day 1, Day 7, Day 30** (or equivalent) are visible and labeled.
- [ ] Optional: add a second retention insight for “power users” (e.g. starting = `signup_completed`, returning = `prediction_bought` or `agent_message_sent`).
- [ ] Add the insight(s) to a shared dashboard so D1/D7/D30 are easy to find.

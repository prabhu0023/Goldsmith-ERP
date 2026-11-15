# Tenancy and branches (D7)

Status: **Decided: one shop, no branches, in v1.** Every business table carries a shop ID from the first migration. Multi-shop is deferred.

## Decision

**D7 Branches: one shop, no branches.** v1 runs a single shop. There are no branch records, no branch picker and no branch key on any table.

**Tenancy: single shop.**
- One shop has one owner, and an owner has exactly one shop.
- The shop has its staff and its karigars.
- Every user and every record belongs to that one shop.

**Forward-compatibility rule** (the owner accepted this recommendation):
- Every business table carries a **shop ID** from the first migration, even though there is only one shop.
- Uniqueness rules are scoped to the shop: tag number, HUID and phone number are unique within a shop, not across the whole database.
- The server sets the shop from the signed-in user. The shop ID is never taken from the client, from a request body, a query string or a header.

The shop record itself is created by the first-run setup wizard (EP-45), together with the first owner.

**Location ID for future branches** (owner decision):
- Every record that holds or measures gold carries a **location ID**: pieces, parcels, trays (parcel weighings), metal pool ledger entries, and scales.
- In v1 there is exactly one location. It is created by default with the shop and named "Main shop".
- The server sets the location ID, always to the shop's one location in v1. It is never taken from the client.
- This is not a branch feature. It only means that if a second location is ever added, gold records already say where they are.

## Why one shop, no branches

The owner described the business as it is today: one shop with one owner, its staff and its karigars, everything linked to that one shop, and no branches. The mockups print "All branches" on owner screens and "Main showroom" on staff screens; in v1 these are labels only and become the shop name.

Leaving D7 open was the risk: adding branches after launch means migrating every table. Deciding "one shop" closes that question for v1.

## Why a shop ID on every table, with only one shop

The owner described where the product may go later: a service that many jewellery shops sign up to, where staff or karigars may work with several shops. If that happens, every record must say which shop it belongs to.

Adding that column later means a migration of every business table, a backfill, and a review of every query and uniqueness rule. Adding it now costs one column per table and one rule in the API (set the shop from the session). Queries still see only one shop's data, so nothing in the v1 screens changes.

Scoping uniqueness to the shop now (tag number, HUID, phone) means two shops can later each have a TAG-8841 or the same karigar phone without a data change.

## What is deferred

- **Multi-shop**: many shops in one installation, sign-up for new shops, and staff or karigars who belong to more than one shop. Recorded as a Later note in PRODUCTION-SCOPE §6, not as an epic. When it is taken up it needs at least: shop sign-up, a user-to-shop membership table (a user may belong to several shops), a shop picker at sign-in, and an isolation review. The shop ID on every table means it does not need a migration of every table.
- **Branches** within one shop. Not planned for v1. If the business opens a second showroom, it is either a second shop (multi-shop) or a new decision. The location ID above is the only preparation made now. These branch features are all deferred:
  - transfers of pieces or gold between locations;
  - a metal pool per location;
  - assigning staff to a location;
  - reports per location;
  - creating, renaming or closing locations (v1 has only "Main shop").

## What changes in the epics

- **EP-02 Database and data model:** a `shops` table; a shop ID on every business table; shop-scoped unique constraints; a `locations` table with one default row "Main shop"; a location ID on pieces, parcels, parcel weighings (trays), pool entries and scales; no `branches` table and no branch key.
- **EP-14 Scale registry, EP-18 Metal pool ledger, EP-21 Parcel intake, EP-22 Stock and piece lifecycle:** their records carry the location ID, set by the server to "Main shop".
- **EP-13 Shop settings** (was "Branches and shop settings"): branch scope removed. The branch story keeps its ID and is marked "Deferred: no branches in v1 (D7)". Settings read the single default location "Main shop"; there is no way to add another.
- **EP-05 Users, roles and permissions:** one owner per shop; every user belongs to the one shop; no branch field when adding a user.
- **EP-16 Karigar master, EP-17 Customer master:** records are shop-scoped.
- **EP-39 Security and data protection:** a check that no operation reads or writes outside the caller's shop, and that the shop ID is never taken from the client.
- **EP-40 Automated testing:** shop-scoping tests.
- **EP-45 Shop setup wizard:** creates the shop record, its default location "Main shop" and the first owner.
- Every epic that asked "per branch?" in its open questions now reads "one shop, no branches (D7)".

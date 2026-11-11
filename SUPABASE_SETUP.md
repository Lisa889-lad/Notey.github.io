# Supabase setup for LedgerPro

This adds authenticated cloud storage to the existing browser-based LedgerPro app. It stores each user's app data as one JSON document in a Supabase table; row-level security restricts access to the signed-in user's row. The original app's localStorage cache remains as a local cache.

## 1. Create the database table and policies

In the Supabase dashboard for project `kwcfxgwgjafhkqxoesub`, open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. Do not disable row-level security.

## 2. Load the bridge in the website

In `index.html`, add this script tag immediately before the existing inline application `<script>` near the bottom of the page (the tag must appear before the app script so its storage hook is installed first):

```html
<script src="./supabase-bridge.js"></script>
```

The bridge uses the supplied project URL and publishable key. Publishable keys are intended for public browser clients; never use a `service_role` key in this file.

## 3. Authentication and initial data

Reload the site. Sign in with an existing Supabase Auth account or create one using the sign-in panel. If email confirmation is enabled, confirm the email before signing in. The first signed-in session asks whether to upload this browser's existing LedgerPro data or start empty. Only upload if that browser's data belongs to that Supabase account. Subsequent changes are saved to the user's Supabase row.

Enable **Authentication → Providers → Email** in Supabase. For testing, email confirmation can be configured in Supabase Auth settings; for production, keep confirmation enabled and configure the site's allowed redirect URLs.

## Important security and behavior notes

- The publishable key is not a secret. Database access is protected by authentication and the RLS policies in the SQL file.
- This app's existing role selector (Admin/Accountant/Viewer) is a client-side UI feature, not an authorization boundary. Supabase isolates users from other users, but anyone with the same account can access that account's company data. Do not use this as a multi-employee permission system without server-enforced roles.
- The current app state is synchronized as one document per user. This is suitable for a single-user prototype, not simultaneous multi-user editing or high-volume accounting. Use a normalized schema and server-side validation before relying on it for production financial records.
- Keep regular backups. Supabase sync starts after the HTML script tag above is added and the SQL is run; merely creating these files does not activate the integration.

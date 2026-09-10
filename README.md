# 🚛 DispatchOS Team Edition

A GitHub Pages + Supabase team workspace for truck dispatch operations.

## What it includes

- 👑 Admin / 🚛 Dispatcher / 🎓 Trainer roles
- 🏢 Shared company workspace
- 🔑 8-character team join code
- 🚚 Shared fleet with dispatcher assignments
- 📦 Shared load desk with DAT / Broker Relationship source, RPM and all-in RPM
- 🚨 Shared issue desk and issue → case workflow
- 🎯 Private personal tasks
- 🧠 Personal + company case library
- 🎓 Private learning notes
- 📜 Workspace activity / audit trail
- 📊 Admin dispatcher scoreboard
- ⭐ XP and shift status
- 🎨 Five color palettes

## 1) Run the database setup

Open your Supabase project → **SQL Editor** → New query.

Paste the entire contents of `team-schema.sql` and click **Run**.

> If you previously used the old single-table `dispatcher_profiles` version, you can leave that table in place. Team Edition does not depend on it.

## 2) Configure Supabase

Edit `supabase-config.js`:

```js
window.DISPATCHOS_SUPABASE_URL = 'https://YOURPROJECT.supabase.co';
window.DISPATCHOS_SUPABASE_ANON_KEY = 'sb_publishable_YOUR_KEY';
```

Use the **Publishable** browser key only. Never put a secret/service-role key into GitHub.

## 3) Authentication settings

For easiest testing:

Supabase → Authentication → Providers → Email

- Email provider: ON
- Confirm email: optional. You can turn it OFF while testing.

If confirmation stays ON, set:

Authentication → URL Configuration → Site URL

…to your real GitHub Pages address.

## 4) Upload to GitHub

Upload these files to the root of your repo:

- `index.html`
- `styles.css`
- `app.js`
- `supabase-config.js`
- `team-schema.sql` (optional to keep in GitHub)
- `README.md`

Enable GitHub Pages:

**Settings → Pages → Deploy from a branch → main → /root**

## 5) First admin

1. Open the site.
2. Create your account / log in.
3. Choose **Create company**.
4. Enter your company name.
5. You automatically become the first **Admin**.
6. Open **Team** and copy the team code.

## 6) Add members

1. Send your GitHub Pages link to the dispatcher/trainer.
2. They create their own account.
3. They choose **Join company**.
4. They enter your 8-character team code.
5. They join as a Dispatcher by default.
6. Admin can change their role from the **Team** screen.

## Data separation

Shared company data:
- Fleet
- Loads
- Issues
- Company Cases
- Activity Log

Private personal data:
- Tasks
- Personal Cases
- Learning Notes

Admin/Trainer can review private productivity data through Supabase permissions for supervision, while normal Dispatchers cannot read another Dispatcher's private items.

## Security model

The browser uses a Supabase Publishable key. Actual access is enforced by Supabase Row Level Security (RLS), not by hiding buttons in JavaScript.

The Admin role is stored in the database (`organization_members.role`) and checked by RLS policies.

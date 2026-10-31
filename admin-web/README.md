# Pulse Master Operations Admin Console (`admin-web`)

Standalone web portal for Pulse Platform SuperAdministrators, Arbitrators, and Operations Directors.
Configured for independent Vercel deployment on the subdomain **`admin.pulse.com`**.

---

## 🚀 Key Functional Areas

1. **Partner Workspace & Credentials Issuance**
   - Direct onboarding and instant credential issuance for new freight, cold-chain, moving, and courier partners.
   - One-click copyable Credentials Slip (Temporary password, Portal URL, Workspace ID, Onboarding checklist).
   - Real-time status toggles (`Active`, `Pending KYC`, `Suspended`), fleet count adjustments, and custom commission rate schedules.
   - Secure temporary credential vault with reveal/hide controls.

2. **Escalated Dispute Arbitration & Escrow Lockers**
   - Full evidentiary hearings for cargo damage, temperature excursions, and abandonment.
   - Comprehensive evidence lockers (Bills of Lading, thermal sensor telematics, timestamped damage photography, certified statements).
   - Multi-party balance statements (Claimant vs Carrier).
   - Legally binding arbitration ruling decisions:
     - Full settlement in favor of Claimant (automatic escrow disbursement).
     - Full exoneration in favor of Carrier (releasing reserved funds).
     - Split settlement percentage determinations with custom penalty allocations.

3. **Global Escrow & Liquidity Ledger**
   - Platform-wide collateral health metrics ($184,500+ locked collateral).
   - Automated settlement batch runs and bank wire clearance reconciliations.
   - Disputed sum hold tracking.

4. **Network Audit & SLA Telemetry**
   - System-wide carrier compliance events, GPS heartbeat audits, and incident severity logs.
   - Real-time uptime telemetry.

---

## 🛠️ Deploying to Vercel (`admin.pulse.com`)

To deploy this project to Vercel on `admin.pulse.com`:

1. **Import the repository in Vercel:**
   - Go to your Vercel Dashboard -> **Add New Project**.
   - Select your GitHub repository (`asiwoniku/pulse`).

2. **Configure Project Settings:**
   - **Framework Preset**: `Vite`
   - **Root Directory**: `admin-web` *(Click Edit and enter `admin-web`)*
   - **Build Command**: `tsc -b && vite build` (or `bun run build`)
   - **Output Directory**: `dist`
   - **Install Command**: `bun install` or `npm install`

3. **Add Custom Domain**:
   - In Vercel Project Settings -> **Domains**.
   - Add: `admin.pulse.com`.
   - Add the CNAME record in your DNS provider:
     - Name: `admin`
     - Type: `CNAME`
     - Value: `cname.vercel-dns.com`

4. **Environment Variables (Optional)**:
   - `VITE_SUPABASE_URL`: Your Supabase backend URL.
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase public anonymous key.

---

## 💻 Local Development

From this directory (`admin-web`):
```bash
npm install
npm run dev
```
The console will start at `http://localhost:5174`.

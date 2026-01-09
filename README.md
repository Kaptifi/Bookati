# Bookati - Multi-Tenant Booking SaaS Platform

A sophisticated booking management system for service-based businesses with multi-tenant architecture, bilingual support, and advanced scheduling capabilities.

## 🎉 Import Status: Complete

This project has been successfully imported from https://github.com/Mahmoudzaineldeen/booktifi

**Build Status**: ✅ Builds successfully
**Components**: 50+ page components, 40+ UI components
**Migrations**: 69 database migration files
**Languages**: English & Arabic with RTL support

## 🚀 Quick Start

### 1. Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_API_URL=http://localhost:3001/api
VITE_QR_SECRET=your-secret-key-change-in-production
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## 📋 Prerequisites

### Backend Server Required

This frontend application requires a backend server running at `http://localhost:3001/api` with the following endpoints:

- **Authentication**: `/auth/signin`, `/auth/signup`, `/auth/signout`
- **Database Queries**: `/query`, `/insert`, `/update`, `/delete`
- **RPC**: `/rpc/:functionName`

### Database Setup

PostgreSQL database with the schema from the migration files in `supabase/migrations/`.

```bash
# Create database
createdb bookati

# Run initial setup
psql bookati < supabase/setup.sql

# Run all migrations
for file in supabase/migrations/*.sql; do
  psql bookati < "$file"
done
```

## 🏗️ Project Structure

```
├── src/
│   ├── components/        # Reusable UI components
│   ├── contexts/          # React context providers
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Core utilities
│   ├── locales/           # i18n translations (en, ar)
│   ├── pages/             # Route pages
│   └── types/             # TypeScript definitions
├── supabase/
│   ├── migrations/        # Database schema migrations (69 files)
│   └── functions/         # Edge functions
└── tests/                 # Test files
```

## ✨ Key Features

### Multi-Tenancy
- Isolated tenant data with RLS
- Custom branding per tenant
- Slug-based routing

### Dual Capacity Management
- Service-level capacity
- Employee-level capacity
- Automatic fallback logic

### Intelligent Scheduling
- Automatic employee assignment
- Manual override capability
- Conflict prevention
- Booking locks

### Booking Modes
- **Parallel**: Multiple services simultaneously
- **Consecutive**: Sequential time slots

### Service Packages
- Multi-session packages
- Usage tracking
- Expiration management

### Internationalization
- English & Arabic
- RTL layout support
- Country-specific phone validation (60+ countries)
- Timezone-aware dates

### User Roles
- Solution Owner
- Tenant Admin
- Receptionist
- Cashier
- Employee
- Customer

## 📜 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Lint code
npm run typecheck    # TypeScript type checking
npm run test         # Run tests
npm run test:watch   # Watch tests
```

## 🗄️ Database Schema

The database includes tables for:
- Users & Tenants
- Services & Categories
- Shifts & Time Slots
- Bookings & Locks
- Packages & Subscriptions
- Reviews & Ratings
- Audit Logs
- Landing Pages

All migrations are in `supabase/migrations/` with chronological naming.

## 🌐 Routing Structure

```
/                           # Landing page
/login                      # Unified login
/signup                     # Tenant registration

# Solution Owner
/solution-admin             # Platform management

# Tenant Admin
/:tenantSlug/admin          # Tenant dashboard
/:tenantSlug/admin/services # Services management
/:tenantSlug/admin/bookings # Bookings management
/:tenantSlug/admin/employees# Employee management
/:tenantSlug/admin/packages # Package management
/:tenantSlug/admin/settings # Settings

# Reception Desk
/:tenantSlug/reception      # Reception interface

# Public Booking
/:tenantSlug/book           # Service selection
/:tenantSlug/book/:serviceId# Booking flow

# Customer Portal
/:tenantSlug/customer       # Customer landing
/:tenantSlug/customer/login # Customer login
/:tenantSlug/customer/dashboard # Customer dashboard
```

## 🔧 Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router 7
- **State**: React Context API
- **i18n**: i18next
- **Forms**: Native HTML5 with validation
- **Icons**: Lucide React
- **Date Handling**: date-fns with timezone support
- **QR Codes**: qrcode.react with JWT signing
- **Testing**: Vitest

## 🔐 Security Features

- JWT authentication
- Row-level security (RLS)
- Booking locks
- QR code verification
- Audit logging
- Input validation
- XSS protection

## 📱 Responsive Design

The application is fully responsive with support for:
- Desktop (1920px+)
- Laptop (1024px - 1920px)
- Tablet (768px - 1024px)
- Mobile (320px - 768px)

## 🌍 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 📚 Additional Documentation

See `IMPORT_COMPLETE.md` for detailed import information and next steps.

## 🐛 Known Issues

- Backend server must be running for authentication
- Database must be initialized with migrations
- Some components expect specific API response formats

## 📝 License

ISC

## 🔗 Links

- **GitHub**: https://github.com/Mahmoudzaineldeen/booktifi
- **StackBlitz**: https://stackblitz.com/~/github.com/Mahmoudzaineldeen/booktifi

---

**Note**: This is a frontend application that requires a backend API server. Ensure the backend is running before starting development.

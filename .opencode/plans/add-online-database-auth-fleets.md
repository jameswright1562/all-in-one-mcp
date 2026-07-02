# Plan: Add Online Database with Auth System and Fleets

## Overview
This plan outlines the implementation of:
1. Online database capability (to supplement/replace SQLite)
2. Authentication system for secure access
3. Fleet functionality for grouping MCPs/profiles

## Current State
- Local SQLite database via `@all-in-one-mcp/shared/src/database/sqliteStore.ts`
- Type-safe schemas in `@all-in-one-mcp/contracts`
- Dashboard UI in `@all-in-one-mcp/dashboard-shared`
- NestJS API server in `@all-in-one-mcp/api`

## Implementation Plan

### Phase 1: Database Abstraction Layer
**Objective:** Support both local SQLite and online databases

1. **Define IDatabase Interface** (`shared/src/database/types.ts`)
   - Standard CRUD operations for MCPs, profiles
   - Will be extended for fleets

2. **Refactor SQLiteStore** 
   - Implement IDatabase interface
   - Move from singleton to injectable service

3. **Create Online Database Adapter**
   - PostgreSQL implementation (can extend to MySQL)
   - Connection pooling for performance
   - Same interface as SQLiteStore

4. **Database Factory**
   - Environment-based selection (SQLITE/POSTGRES/MYSQL)
   - Configuration via environment variables

### Phase 2: Authentication System
**Objective:** Secure API access with JWT-based authentication

1. **Auth Module** (`api/src/auth`)
   - JWT service (sign/verify tokens)
   - Password hashing (bcrypt)
   - User entity and schema

2. **Authentication Endpoints**
   - POST `/auth/login` - credentials → JWT
   - POST `/auth/logout` - token invalidation
   - POST `/auth/refresh` - token refresh

3. **Auth Middleware**
   - NestJS AuthGuard for route protection
   - JWT strategy implementation
   - Role-based access control (if needed)

4. **Dashboard Integration**
   - Auth state management in `dashboard-shared`
   - Login/logout UI components
   - HTTP interceptor for token attachment

### Phase 3: Fleet Implementation
**Objective:** Group MCPs/profiles for simplified management

1. **Fleet Schema Definition** (`contracts/src/schemas.ts`)
   - Fleet definition: id, name, description, timestamps
   - Fleet-MCP associations (many-to-many)
   - Fleet-profile associations (many-to-many)

2. **Database Extensions**
   - Fleet tables in schema
   - CRUD operations for fleets
   - Association management methods

3. **API Endpoints** (`api/src/fleet`)
   - CRUD operations for fleets
   - Association endpoints (add/remove members)
   - Fleet-based queries

4. **Dashboard Integration**
   - Fleet management UI components
   - Fleet assignment controls in MCP/profile views
   - Filtering views by fleet

## Technical Implementation Details

### Database Abstraction
```typescript
// shared/src/database/types.ts
export interface IDatabase {
  // Existing methods (MCP, profiles)...
  
  // Fleet methods
  getFleets(): Promise<FleetDefinition[]>;
  getFleet(id: string): Promise<FleetDefinition | null>;
  saveFleet(fleet: FleetDefinition): Promise<void>;
  deleteFleet(id: string): Promise<void>;
  
  // Association methods
  addMcpToFleet(fleetId: string, mcpId: string): Promise<void>;
  removeMcpFromFleet(fleetId: string, mcpId: string): Promise<void>;
  getMcpsInFleet(fleetId: string): Promise<ManagedMcpDefinition[]>;
  // Similar for profiles
}
```

### Authentication Flow
```
User Login:
1. Browser → POST /api/auth/login ({username, password})
2. API → Validate credentials → Generate JWT (secret: env.JWT_SECRET)
3. API ← Return {accessToken, refreshToken}
4. Browser → Store tokens (secure httpOnly cookie or localStorage)
5. Browser → Subsequent requests: Authorization: Bearer <accessToken>
6. API → AuthGuard → Verify token → Grant/Deny access
```

### Fleet Concept Implementation
In MCP management context, fleets represent logical groupings:
- **Environment Fleets**: dev, staging, production MCP configurations
- **Tool Type Fleets**: database-tools, ai-services, productivity-tools
- **Team/Project Fleets**: assigned to specific teams or projects

Benefits:
- Bulk operations (enable/disable entire fleet)
- Simplified deployment/profile switching
- Organizational structure for large MCP deployments

## Dependencies to Add

### Package.json Updates
**shared:**
- No new deps (uses existing sqlite)

**api:**
- `pg` (PostgreSQL) or `mysql2` 
- `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`
- `bcryptjs`
- `@types/bcryptjs` (dev)

## Environment Configuration
```
# Database Configuration
DB_TYPE=sqlite|postgres|mysql
SQLITE_PATH=./data/mcp.db
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=mcp_user
POSTGRES_PASSWORD=secure_password
POSTGRES_DB=mcp_manager

# Authentication
JWT_SECRET=your_super_secret_key_here_change_in_production
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=your_refresh_secret_here
REFRESH_TOKEN_EXPIRES_IN=30d
```

## API Endpoints Summary

### Authentication
- `POST /api/auth/login`
- `POST /api/auth/logout` 
- `POST /api/auth/refresh`

### Fleets
- `GET /api/fleets`
- `GET /api/fleets/:id`
- `POST /api/fleets`
- `PUT /api/fleets/:id`
- `DELETE /api/fleets/:id`
- `POST /api/fleets/:fleetId/mcps/:mcpId`
- `DELETE /api/fleets/:fleetId/mcps/:mcpId`
- `POST /api/fleets/:fleetId/profiles/:profileId`
- `DELETE /api/fleets/:fleetId/profiles/:profileId`

## UI Components to Add
- LoginPage.vue / LogoutButton.vue
- FleetManagementView.vue
- FleetForm.vue (create/edit)
- FleetMembersTab.vue (manage MCP/profile assignments)
- FleetFilter component (for existing views)

## Quality Assurance
1. **Unit Tests**: Database implementations, auth helpers
2. **Integration Tests**: API endpoints with test database
3. **E2E Tests**: User flows (login, fleet management)
4. **Security Review**: Auth implementation, SQL injection prevention
5. **Performance Testing**: Connection pooling, query optimization

## Deployment Notes
1. Database migration scripts for schema updates
2. Connection pool tuning based on expected load
3. Secret management (JWT keys, DB passwords) via environment/secrets manager
4. CORS configuration for API access from dashboard
5. Rate limiting on auth endpoints to prevent brute force
6. HTTPS enforcement in production

## Implementation Order
1. Database abstraction layer (2-3 days)
2. Authentication system (3-4 days) 
3. Fleet functionality (2-3 days)
4. Integration and testing (2-3 days)

Total estimated time: 9-13 days for complete implementation.
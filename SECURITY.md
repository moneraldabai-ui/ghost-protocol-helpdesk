# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.0   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it to:

**Email:** moner.intelligence@gmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Security Features

### Authentication
- Passwords are hashed using **bcryptjs** with salt rounds
- Session clears automatically on app close (sessionStorage)
- Failed login attempts are logged in the audit system

### Authorization (RBAC)
- **OWNER** — Full system access, cannot be deleted or demoted
- **ADMIN** — User management, all operations except backup/restore
- **OPERATOR** — Standard operations (incidents, KB, end users)
- **VIEWER** — Read-only access

### Data Protection
- All write operations require backend role verification
- OWNER account is protected from deletion and demotion
- Audit log records all sensitive operations
- Database stored locally in user's AppData folder

### Role Hierarchy Enforcement
- Users cannot modify accounts with equal or higher roles
- Only OWNER can perform backup/restore operations
- Role changes are logged in the audit system

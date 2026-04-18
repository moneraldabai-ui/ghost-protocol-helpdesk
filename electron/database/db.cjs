/**
 * GHOST PROTOCOL — Database Module
 *
 * SQLite database operations using better-sqlite3.
 * Handles incidents, users, departments, and incident history.
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'ghost-protocol.db');
}

function initializeDatabase() {
  const dbPath = getDbPath();
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  seedIfEmpty();
  migrateOwnerRole();
  migrateUsersUpdatedAt();
  seedKnowledgeBase();
  backfillResolvedAt();
  migrateResolutionColumns();
  migrateIncidentTypeColumn();
  migrateReportedByColumn();
  cleanupDuplicateHistoryEntries();
  seedCompanyDepartments();
  cleanupMockData();
  seedMockData();
  migrateKbIssueReports();
  migrateKbNotificationsClearedAt();

  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT,
      capacity INTEGER DEFAULT 20,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      email TEXT,
      display_name TEXT,
      department TEXT,
      role TEXT CHECK(role IN ('operator', 'viewer', 'admin', 'owner')) DEFAULT 'viewer',
      account_status TEXT CHECK(account_status IN ('pending', 'approved', 'rejected', 'suspended')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT CHECK(priority IN ('critical', 'high', 'medium', 'low')),
      status TEXT CHECK(status IN ('new', 'in_progress', 'escalated', 'resolved', 'closed')) DEFAULT 'new',
      department TEXT,
      assigned_to TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      incident_type TEXT,
      tags TEXT,
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS incident_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      performed_by TEXT NOT NULL,
      performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS incident_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      notifications INTEGER DEFAULT 1,
      sound_alerts INTEGER DEFAULT 0,
      critical_only INTEGER DEFAULT 0,
      auto_refresh INTEGER DEFAULT 1,
      compact_mode INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      target_name TEXT,
      old_value TEXT,
      new_value TEXT,
      performed_by TEXT NOT NULL,
      performer_name TEXT,
      performed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);
    CREATE INDEX IF NOT EXISTS idx_incidents_department ON incidents(department);
    CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to ON incidents(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
    CREATE INDEX IF NOT EXISTS idx_incident_history_incident_id ON incident_history(incident_id);
    CREATE INDEX IF NOT EXISTS idx_incident_comments_incident_id ON incident_comments(incident_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at ON audit_log(performed_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_performed_by ON audit_log(performed_by);
    CREATE INDEX IF NOT EXISTS idx_audit_log_target_type ON audit_log(target_type);

    -- Knowledge Base tables
    CREATE TABLE IF NOT EXISTS kb_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      icon TEXT,
      parent_id INTEGER REFERENCES kb_categories(id),
      sort_order INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kb_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      body TEXT NOT NULL,
      excerpt TEXT,
      category_id INTEGER REFERENCES kb_categories(id),
      tags TEXT,
      difficulty TEXT CHECK(difficulty IN ('beginner','intermediate','advanced')),
      status TEXT CHECK(status IN ('draft','published')) DEFAULT 'draft',
      is_pinned INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      updated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kb_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER REFERENCES kb_articles(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      is_helpful INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kb_article_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER REFERENCES kb_articles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      edited_by TEXT NOT NULL,
      edited_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category_id);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles(status);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_created_by ON kb_articles(created_by);
    CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON kb_feedback(article_id);

    -- End Users (Reporters) table
    CREATE TABLE IF NOT EXISTS end_users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      department TEXT,
      location TEXT,
      employee_id TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_end_users_full_name ON end_users(full_name);
    CREATE INDEX IF NOT EXISTS idx_end_users_email ON end_users(email);
    CREATE INDEX IF NOT EXISTS idx_end_users_department ON end_users(department);
    CREATE INDEX IF NOT EXISTS idx_end_users_is_active ON end_users(is_active);

    -- Company Departments (for End Users / Reporters)
    CREATE TABLE IF NOT EXISTS company_departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      manager_name TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_company_departments_is_active ON company_departments(is_active);
    CREATE INDEX IF NOT EXISTS idx_company_departments_sort_order ON company_departments(sort_order);

    -- Incident Attachments table
    CREATE TABLE IF NOT EXISTS incident_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      file_data BLOB NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_incident_attachments_incident_id ON incident_attachments(incident_id);

    -- Seed Metadata (tracks which seeds have been completed to prevent re-seeding deleted data)
    CREATE TABLE IF NOT EXISTS seed_metadata (
      seed_key TEXT PRIMARY KEY,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (count.count > 0) return;

  // Seed departments
  const insertDept = db.prepare('INSERT OR IGNORE INTO departments (id, name, display_name, capacity) VALUES (?, ?, ?, ?)');
  const departments = [
    ['it-ops', 'it-ops', 'IT OPS', 30],
    ['security', 'security', 'SECURITY', 15],
    ['network', 'network', 'NETWORK', 20],
    ['helpdesk', 'helpdesk', 'HELPDESK', 40],
    ['dev', 'dev', 'DEV', 25],
  ];
  for (const dept of departments) {
    insertDept.run(...dept);
  }

  // Seed users — default password: Ghost2026 (bcrypt hashed)
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, username, password_hash, email, display_name, department, role, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const users = [
    ['user-admin', 'admin', bcrypt.hashSync('Ghost2026', 10), 'admin@ghostprotocol.io', 'System Admin', 'it-ops', 'admin', 'approved'],
    ['user-moner', 'pro', bcrypt.hashSync('Ghost2026', 10), 'moner.intelligence@gmail.com', 'Admin', 'it-ops', 'owner', 'approved'],
  ];
  for (const user of users) {
    insertUser.run(...user);
  }

}

/**
 * Seed mock data for README screenshots (runs once)
 */
function seedMockData() {
  // Check if already seeded
  const seeded = db.prepare("SELECT seed_key FROM seed_metadata WHERE seed_key = 'mock_data_v1'").get();
  if (seeded) return;

  // Get owner user ID
  const owner = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get();
  if (!owner) return;
  const createdBy = owner.id;

  console.log('[DB] Seeding mock data for screenshots...');

  // Insert 5 End Users
  const insertEndUser = db.prepare(`
    INSERT OR IGNORE INTO end_users (id, full_name, email, phone, department, location, employee_id, notes, is_active, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const endUsers = [
    ['eu-mock-001', 'Sarah Mitchell', 's.mitchell@company.com', '+1 555-0101', 'Marketing', 'Floor 2, Building A', 'EMP-1001', 'Marketing Manager', 1],
    ['eu-mock-002', 'James Holloway', 'j.holloway@company.com', '+1 555-0102', 'IT Infrastructure', 'Floor 1, Server Room', 'EMP-1002', 'Senior Network Engineer', 1],
    ['eu-mock-003', 'Layla Al-Hassan', 'l.alhassan@company.com', '+1 555-0103', 'HR', 'Floor 3, Building B', 'EMP-1003', 'HR Coordinator', 1],
    ['eu-mock-004', 'David Chen', 'd.chen@company.com', '+1 555-0104', 'Operations', 'Floor 3, Building A', 'EMP-1004', 'Operations Lead', 1],
    ['eu-mock-005', 'Emma Thornton', 'e.thornton@company.com', '+1 555-0105', 'Finance', 'Floor 4, Building A', 'EMP-1005', 'Financial Analyst', 1],
  ];

  for (const user of endUsers) {
    insertEndUser.run(...user, createdBy);
  }

  // Insert 5 Incidents
  const insertIncident = db.prepare(`
    INSERT OR IGNORE INTO incidents (id, title, description, priority, status, department, created_by, incident_type, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const incidents = [
    ['INC-2851', 'VPN connection dropping every 30 minutes for remote team', 'Multiple remote employees are reporting that their VPN connections are dropping approximately every 30 minutes. This is affecting productivity for the entire remote workforce. The issue started after the latest firewall update on Monday.', 'critical', 'in_progress', 'it-ops', createdBy, 'Network', 'vpn,remote,connectivity'],
    ['INC-2852', 'Email client not syncing on Outlook 2021 after Windows update', 'After the recent Windows 11 update (KB5034441), Outlook 2021 is no longer syncing emails automatically. Users have to manually click Send/Receive. Approximately 15 users affected across multiple departments.', 'high', 'new', 'helpdesk', createdBy, 'Software', 'outlook,email,windows-update'],
    ['INC-2853', 'Printer on Floor 3 offline — urgent before board meeting', 'The HP LaserJet Pro on Floor 3 (Conference Room B) is showing offline status. Board meeting scheduled for 2 PM today requires printed materials. Printer was working yesterday evening.', 'high', 'escalated', 'helpdesk', createdBy, 'Hardware', 'printer,hardware,urgent'],
    ['INC-2854', 'Request: Install Adobe Acrobat Pro on Marketing workstations', 'Marketing department has requested Adobe Acrobat Pro installation on 5 workstations for the new design team. License keys have been procured and approved by IT procurement.', 'medium', 'resolved', 'helpdesk', createdBy, 'Request', 'software-install,adobe,marketing'],
    ['INC-2855', 'Password reset required for new hire onboarding', 'New employee John Martinez (starting Monday) needs Active Directory account created and initial password set. HR has completed all paperwork. Employee will be joining the Finance department.', 'low', 'closed', 'helpdesk', createdBy, 'Request', 'onboarding,password,new-hire'],
  ];

  for (const inc of incidents) {
    insertIncident.run(...inc);
  }

  // Mark as seeded
  db.prepare("INSERT OR IGNORE INTO seed_metadata (seed_key) VALUES ('mock_data_v1')").run();
  console.log('[DB] Mock data seeded successfully!');
}

/**
 * Migrate company_departments table to remove FK constraint if needed.
 * This handles existing databases that have the old schema with REFERENCES users(id).
 */
function migrateCompanyDepartmentsTable() {
  try {
    // Check if the table has a foreign key constraint
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='company_departments'").get();
    if (!tableInfo || !tableInfo.sql) return; // Table doesn't exist yet, will be created fresh

    // If table has REFERENCES users(id), we need to recreate without it
    if (tableInfo.sql.includes('REFERENCES users')) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE IF NOT EXISTS company_departments_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          manager_name TEXT,
          sort_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO company_departments_new SELECT * FROM company_departments;
        DROP TABLE company_departments;
        ALTER TABLE company_departments_new RENAME TO company_departments;
        CREATE INDEX IF NOT EXISTS idx_company_departments_is_active ON company_departments(is_active);
        CREATE INDEX IF NOT EXISTS idx_company_departments_sort_order ON company_departments(sort_order);
      `);
      db.pragma('foreign_keys = ON');
    }
  } catch (err) {
    console.error('[migrateCompanyDepartmentsTable] Error:', err);
    // Non-fatal, table may not exist yet
  }
}

/**
 * Seed company departments table on first run only.
 * Uses seed_metadata table to track completion (prevents re-seeding if user deletes departments).
 */
function seedCompanyDepartments() {
  // First run migration to fix FK constraint if needed
  migrateCompanyDepartmentsTable();

  // Check if this seed has already been completed
  const seedCompleted = db.prepare("SELECT 1 FROM seed_metadata WHERE seed_key = 'company_departments_v1'").get();
  if (seedCompleted) return;

  // Migration: if departments already exist (from before seed_metadata was added), mark as completed and skip
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM company_departments').get();
  if (existingCount.count > 0) {
    db.prepare("INSERT OR IGNORE INTO seed_metadata (seed_key) VALUES ('company_departments_v1')").run();
    return;
  }

  const now = new Date().toISOString();
  const insertDept = db.prepare(`
    INSERT INTO company_departments (id, name, description, manager_name, sort_order, is_active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?)
  `);

  const departments = [
    ['human-resources', 'HUMAN RESOURCES', 'Human Resources and People Operations', null, 0],
    ['finance', 'FINANCE', 'Finance and Accounting', null, 1],
    ['marketing', 'MARKETING', 'Marketing and Communications', null, 2],
    ['sales', 'SALES', 'Sales and Business Development', null, 3],
    ['operations', 'OPERATIONS', 'Operations and Logistics', null, 4],
    ['engineering', 'ENGINEERING', 'Engineering and Product Development', null, 5],
    ['legal', 'LEGAL', 'Legal and Compliance', null, 6],
    ['executive', 'EXECUTIVE', 'Executive Leadership', null, 7],
    ['customer-service', 'CUSTOMER SERVICE', 'Customer Service and Support', null, 8],
    ['it-operations', 'IT OPERATIONS', 'IT Operations and Infrastructure', null, 9],
    ['other', 'OTHER', 'Other Departments', null, 10],
  ];

  const seedTransaction = db.transaction(() => {
    for (const dept of departments) {
      insertDept.run(dept[0], dept[1], dept[2], dept[3], dept[4], now, now);
    }
  });

  seedTransaction();

  // Mark seed as completed so it won't run again (even if user deletes all departments)
  db.prepare("INSERT OR IGNORE INTO seed_metadata (seed_key) VALUES ('company_departments_v1')").run();
}

/**
 * One-time cleanup migration to remove mock data from existing databases.
 * Removes: mock end users (EU-xxx), mock incidents (INC-28xx to INC-29xx), mock departments (dept-mock-xxx)
 */
function cleanupMockData() {
  // Check if cleanup has already been done
  const cleanupDone = db.prepare("SELECT 1 FROM seed_metadata WHERE seed_key = 'mock_data_cleanup_v1'").get();
  if (cleanupDone) return;

  let removedEndUsers = 0;
  let removedIncidents = 0;
  let removedDepts = 0;

  try {
    // Remove mock end users (EU-001 to EU-030)
    const endUserResult = db.prepare("DELETE FROM end_users WHERE id LIKE 'EU-%'").run();
    removedEndUsers = endUserResult.changes;

    // Remove mock incidents (INC-28xx and INC-29xx range used by seedIfEmpty)
    // First remove related history entries
    db.prepare("DELETE FROM incident_history WHERE incident_id LIKE 'INC-28%' OR incident_id LIKE 'INC-29%'").run();
    // Then remove the incidents
    const incidentResult = db.prepare("DELETE FROM incidents WHERE id LIKE 'INC-28%' OR id LIKE 'INC-29%'").run();
    removedIncidents = incidentResult.changes;

    // Remove mock company departments (dept-mock-xxx)
    const deptResult = db.prepare("DELETE FROM company_departments WHERE id LIKE 'dept-mock-%'").run();
    removedDepts = deptResult.changes;

    // Mark cleanup as completed
    db.prepare("INSERT OR IGNORE INTO seed_metadata (seed_key) VALUES ('mock_data_cleanup_v1')").run();
  } catch (err) {
    console.error('[cleanupMockData] Error:', err.message);
  }
}

function migrateOwnerRole() {
  // Step 1: Always ensure the table has the new CHECK constraint that includes 'owner'.
  // Test by attempting a dummy check — try to set a temp row to 'owner' via a subquery.
  let needsTableMigration = false;
  try {
    // Use a probe: try updating a non-existent row — if CHECK is old, even this will fail
    // Actually, SQLite only enforces CHECK on rows that actually change, so we need a real test.
    // Safest: just check the table SQL definition directly.
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'owner'")) {
      needsTableMigration = true;
    }
  } catch (err) {
    needsTableMigration = true;
  }

  if (needsTableMigration) {
    try {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        DROP TABLE IF EXISTS users_new;
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL DEFAULT '',
          email TEXT,
          display_name TEXT,
          department TEXT,
          role TEXT CHECK(role IN ('operator', 'viewer', 'admin', 'owner')) DEFAULT 'viewer',
          account_status TEXT CHECK(account_status IN ('pending', 'approved', 'rejected', 'suspended')) DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_new SELECT * FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
        CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
      `);
      db.pragma('foreign_keys = ON');
    } catch (err) {
      console.error('[migrateOwnerRole] table migration failed:', err);
      db.pragma('foreign_keys = ON');
    }
  }

  // Step 2: Ensure owner account exists with correct credentials
  // Check by ID first (most reliable), then by username as fallback
  const ownerById = db.prepare("SELECT id, username, role, account_status FROM users WHERE id = 'user-moner'").get();
  const ownerByUsername = db.prepare("SELECT id, username, role, account_status FROM users WHERE username = 'pro'").get();
  const owner = ownerById || ownerByUsername;

  if (owner) {
    // Migrate old credentials to new defaults if needed
    // This handles existing databases with old 'moner' username
    if (owner.username !== 'pro' || owner.role !== 'owner' || owner.account_status !== 'approved') {
      db.prepare(`
        UPDATE users SET
          username = 'pro',
          password_hash = ?,
          display_name = 'Admin',
          role = 'owner',
          account_status = 'approved'
        WHERE id = ?
      `).run(bcrypt.hashSync('Ghost2026', 10), owner.id);
    }
  } else {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, email, display_name, department, role, account_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('user-moner', 'pro', bcrypt.hashSync('Ghost2026', 10), 'moner.intelligence@gmail.com', 'Admin', 'it-ops', 'owner', 'approved', now);
  }
}

/**
 * Migration: Add updated_at column to users table if it doesn't exist.
 */
function migrateUsersUpdatedAt() {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('updated_at')) {
      db.exec(`ALTER TABLE users ADD COLUMN updated_at DATETIME`);
      // Backfill with created_at
      db.prepare(`UPDATE users SET updated_at = created_at WHERE updated_at IS NULL`).run();
    }
  } catch (err) {
    console.error('[migrateUsersUpdatedAt] Error:', err.message);
  }
}

function backfillResolvedAt() {
  db.prepare(`
    UPDATE incidents
    SET resolved_at = updated_at
    WHERE status IN ('resolved', 'closed')
    AND resolved_at IS NULL
  `).run();
}

function migrateResolutionColumns() {
  // Check and add missing columns individually
  const tableInfo = db.prepare("PRAGMA table_info(incidents)").all();
  const columnNames = tableInfo.map(col => col.name);

  const columnsToAdd = [
    { name: 'resolution_type', type: 'TEXT' },
    { name: 'resolution_description', type: 'TEXT' },
    { name: 'affected_systems', type: 'TEXT' },
    { name: 'related_incidents', type: 'TEXT' },
    { name: 'partial_details', type: 'TEXT' },
    { name: 'follow_up_date', type: 'TEXT' },
    { name: 'duplicate_of', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    if (!columnNames.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE incidents ADD COLUMN ${col.name} ${col.type}`);
      } catch (err) {
        // Column may already exist, ignore
      }
    }
  }
}

/**
 * Migration: Add incident_type and tags columns to incidents table
 * Safe to run multiple times - ignores if columns already exist
 */
function migrateIncidentTypeColumn() {
  const tableInfo = db.prepare("PRAGMA table_info(incidents)").all();
  const columnNames = tableInfo.map(col => col.name);

  const columnsToAdd = [
    { name: 'incident_type', type: 'TEXT' },
    { name: 'tags', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    if (!columnNames.includes(col.name)) {
      try {
        db.exec(`ALTER TABLE incidents ADD COLUMN ${col.name} ${col.type}`);
      } catch (err) {
        // Column may already exist, ignore
      }
    }
  }
}

/**
 * One-time cleanup: Remove duplicate consecutive history entries
 * where action and new_value are identical and timestamps are within 60 seconds.
 * Keeps only the first entry of each duplicate group.
 */
function cleanupDuplicateHistoryEntries() {
  // Get all history entries ordered by incident and time
  const allHistory = db.prepare(`
    SELECT id, incident_id, action, new_value, performed_at
    FROM incident_history
    ORDER BY incident_id, performed_at ASC
  `).all();

  const toDelete = [];
  let prevEntry = null;

  for (const entry of allHistory) {
    if (prevEntry &&
        prevEntry.incident_id === entry.incident_id &&
        prevEntry.action === entry.action &&
        prevEntry.new_value === entry.new_value) {
      // Check if timestamps are within 60 seconds
      const prevTime = new Date(prevEntry.performed_at).getTime();
      const currTime = new Date(entry.performed_at).getTime();
      const diffSeconds = Math.abs(currTime - prevTime) / 1000;

      if (diffSeconds <= 60) {
        // Mark this entry for deletion (keep the first one)
        toDelete.push(entry.id);
        // Don't update prevEntry - keep comparing to the first of the group
        continue;
      }
    }
    prevEntry = entry;
  }

  // Delete duplicate entries
  if (toDelete.length > 0) {
    const deleteStmt = db.prepare('DELETE FROM incident_history WHERE id = ?');
    const deleteTransaction = db.transaction(() => {
      for (const id of toDelete) {
        deleteStmt.run(id);
      }
    });
    deleteTransaction();
  }
}

/**
 * Migration: Add reported_by column to incidents table for End Users system.
 * This column links incidents to the end user who reported the problem.
 */
function migrateReportedByColumn() {
  const tableInfo = db.prepare("PRAGMA table_info(incidents)").all();
  const columnNames = tableInfo.map(col => col.name);

  if (!columnNames.includes('reported_by')) {
    try {
      db.exec(`ALTER TABLE incidents ADD COLUMN reported_by TEXT REFERENCES end_users(id)`);
    } catch (err) {
      // Column may already exist, ignore
    }
  }

  // Create index if it doesn't exist
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_incidents_reported_by ON incidents(reported_by)`);
  } catch (err) {
    // Index may already exist, ignore
  }
}

/**
 * Migration: Create kb_issue_reports table for KB article issue reporting.
 */
function migrateKbIssueReports() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kb_issue_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
        reported_by TEXT NOT NULL,
        reporter_name TEXT,
        issue_type TEXT NOT NULL,
        description TEXT NOT NULL,
        is_resolved INTEGER DEFAULT 0,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_kb_issue_reports_article ON kb_issue_reports(article_id);
      CREATE INDEX IF NOT EXISTS idx_kb_issue_reports_is_read ON kb_issue_reports(is_read);
    `);
  } catch (err) {
    // Table may already exist, ignore
  }

  // Add is_read column to kb_feedback if it doesn't exist
  try {
    const feedbackInfo = db.prepare("PRAGMA table_info(kb_feedback)").all();
    const hasIsRead = feedbackInfo.some(col => col.name === 'is_read');
    if (!hasIsRead) {
      db.exec(`ALTER TABLE kb_feedback ADD COLUMN is_read INTEGER DEFAULT 0`);
    }
  } catch (err) {
    // Column may already exist, ignore
  }

  // Add agent_name column to kb_feedback if it doesn't exist
  try {
    const feedbackInfo = db.prepare("PRAGMA table_info(kb_feedback)").all();
    const hasAgentName = feedbackInfo.some(col => col.name === 'agent_name');
    if (!hasAgentName) {
      db.exec(`ALTER TABLE kb_feedback ADD COLUMN agent_name TEXT`);
    }
  } catch (err) {
    // Column may already exist, ignore
  }
}

/**
 * Migration: Add is_cleared column to kb_feedback and kb_issue_reports
 * for bulletproof clear-all functionality.
 */
function migrateKbNotificationsClearedAt() {
  // Add is_cleared to kb_feedback
  try {
    const feedbackInfo = db.prepare("PRAGMA table_info(kb_feedback)").all();
    if (!feedbackInfo.some(col => col.name === 'is_cleared')) {
      db.exec(`ALTER TABLE kb_feedback ADD COLUMN is_cleared INTEGER DEFAULT 0`);
    }
  } catch (err) {}

  // Add is_cleared to kb_issue_reports
  try {
    const reportsInfo = db.prepare("PRAGMA table_info(kb_issue_reports)").all();
    if (!reportsInfo.some(col => col.name === 'is_cleared')) {
      db.exec(`ALTER TABLE kb_issue_reports ADD COLUMN is_cleared INTEGER DEFAULT 0`);
    }
  } catch (err) {}
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INCIDENT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

function getAllIncidents() {
  return db.prepare(`
    SELECT i.*,
           u.display_name as assignee_name,
           u.role as assignee_role,
           eu.id as reporter_id,
           eu.full_name as reporter_name,
           eu.email as reporter_email,
           eu.department as reporter_department
    FROM incidents i
    LEFT JOIN users u ON i.assigned_to = u.id
    LEFT JOIN end_users eu ON i.reported_by = eu.id
    ORDER BY i.created_at DESC
  `).all();
}

function getIncidentById(id) {
  return db.prepare(`
    SELECT i.*,
           u.display_name as assignee_name,
           u.role as assignee_role,
           eu.id as reporter_id,
           eu.full_name as reporter_name,
           eu.email as reporter_email,
           eu.department as reporter_department
    FROM incidents i
    LEFT JOIN users u ON i.assigned_to = u.id
    LEFT JOIN end_users eu ON i.reported_by = eu.id
    WHERE i.id = ?
  `).get(id) || null;
}

function createIncident({ title, description, priority, department, created_by, reported_by }) {
  const maxId = db.prepare("SELECT id FROM incidents ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1").get();
  const nextNum = maxId ? parseInt(maxId.id.split('-')[1], 10) + 1 : 3000;
  const id = `INC-${nextNum}`;
  const now = new Date().toISOString();

  const insertTransaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO incidents (id, title, description, priority, status, department, created_by, reported_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)
    `).run(id, title, description || '', priority, department, created_by || 'user-moner', reported_by || null, now, now);

    db.prepare(`
      INSERT INTO incident_history (incident_id, action, new_value, performed_by, performed_at)
      VALUES (?, 'created', 'new', ?, ?)
    `).run(id, created_by || 'user-moner', now);
  });

  insertTransaction();

  return getIncidentById(id);
}

function updateIncident(id, updates) {
  const current = getIncidentById(id);
  if (!current) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKEND ENFORCEMENT: Resolution data required for resolved/closed status
  // ═══════════════════════════════════════════════════════════════════════════
  const isStatusChangingToResolved = updates.status === 'resolved' && current.status !== 'resolved';
  const isStatusChangingToClosed = updates.status === 'closed' && current.status !== 'closed';

  if (isStatusChangingToResolved || isStatusChangingToClosed) {
    const resolutionType = updates.resolution_type;
    const resolutionDescription = updates.resolution_description;

    if (!resolutionType || typeof resolutionType !== 'string' || resolutionType.trim() === '') {
      throw new Error(`Resolution type is required when changing status to '${updates.status}'`);
    }

    if (!resolutionDescription || typeof resolutionDescription !== 'string' || resolutionDescription.trim().length < 5) {
      throw new Error(`Resolution description is required (minimum 5 characters) when changing status to '${updates.status}'`);
    }

    const validResolutionTypes = ['fixed', 'workaround', 'known_issue', 'no_action', 'duplicate', 'partially_resolved'];
    if (!validResolutionTypes.includes(resolutionType)) {
      throw new Error(`Invalid resolution type '${resolutionType}'. Must be one of: ${validResolutionTypes.join(', ')}`);
    }

    // Additional validation for specific resolution types
    if (resolutionType === 'duplicate') {
      if (!updates.duplicate_of || typeof updates.duplicate_of !== 'string' || updates.duplicate_of.trim() === '') {
        throw new Error("Duplicate incident ID is required when resolution type is 'duplicate'");
      }
    }

    if (resolutionType === 'partially_resolved') {
      if (!updates.partial_details || typeof updates.partial_details !== 'string' || updates.partial_details.trim() === '') {
        throw new Error("Partial resolution details are required when resolution type is 'partially_resolved'");
      }
    }
  }

  const now = new Date().toISOString();
  const fields = [];
  const values = [];
  const historyEntries = [];

  // Auto-update department when assigned_to changes
  if (updates.assigned_to !== undefined && updates.assigned_to !== current.assigned_to) {
    const assignedUser = db.prepare('SELECT department FROM users WHERE id = ?').get(updates.assigned_to);
    if (assignedUser?.department && assignedUser.department !== current.department) {
      updates.department = assignedUser.department;
    }
  }

  const allowedFields = [
    'title', 'description', 'priority', 'status', 'department', 'assigned_to', 'reported_by',
    'resolution_type', 'resolution_description', 'affected_systems', 'related_incidents',
    'partial_details', 'follow_up_date', 'duplicate_of', 'incident_type', 'tags'
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined && updates[field] !== current[field]) {
      fields.push(`${field} = ?`);
      values.push(updates[field]);

      historyEntries.push({
        action: field === 'status' ? 'status_change' : field === 'assigned_to' ? 'assigned' : 'updated',
        old_value: current[field],
        new_value: updates[field],
      });
    }
  }

  if (fields.length === 0) return current;

  // Set resolved_at when status changes to resolved
  if (updates.status === 'resolved' && current.status !== 'resolved') {
    fields.push('resolved_at = ?');
    values.push(now);
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  const updateTransaction = db.transaction(() => {
    db.prepare(`UPDATE incidents SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const insertHistory = db.prepare(`
      INSERT INTO incident_history (incident_id, action, old_value, new_value, performed_by, performed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const entry of historyEntries) {
      insertHistory.run(id, entry.action, entry.old_value, entry.new_value, updates.performed_by || 'user-moner', now);
    }
  });

  updateTransaction();

  return getIncidentById(id);
}

function deleteIncident(id, performedBy) {
  const incident = db.prepare('SELECT status FROM incidents WHERE id = ?').get(id);

  if (!incident) return { success: false, error: 'Incident not found' };

  const role = getUserRole(performedBy);

  // Only OWNER can delete resolved/closed incidents
  if (['resolved', 'closed'].includes(incident.status) && role !== 'owner') {
    return {
      success: false,
      error: 'Cannot delete a resolved or closed incident.',
      code: 'STATUS_PROTECTED',
    };
  }

  db.prepare('DELETE FROM incidents WHERE id = ?').run(id);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// INCIDENT COMMENTS
// ═══════════════════════════════════════════════════════════════════════════

function getIncidentComments(incidentId) {
  return db.prepare('SELECT * FROM incident_comments WHERE incident_id = ? ORDER BY created_at ASC').all(incidentId);
}

function addIncidentComment(incidentId, authorId, authorName, text) {
  const result = db.prepare('INSERT INTO incident_comments (incident_id, author_id, author_name, text) VALUES (?, ?, ?, ?)').run(incidentId, authorId, authorName, text);
  return db.prepare('SELECT * FROM incident_comments WHERE id = ?').get(result.lastInsertRowid);
}

// ═══════════════════════════════════════════════════════════════════════════
// USER PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

function getUserPreferences(userId) {
  let prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
  if (!prefs) {
    db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
    prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
  }
  return prefs;
}

function updateUserPreferences(userId, updates) {
  const allowed = ['notifications', 'sound_alerts', 'critical_only', 'auto_refresh', 'compact_mode'];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key] ? 1 : 0);
    }
  }

  if (fields.length === 0) return getUserPreferences(userId);

  // Ensure row exists
  const existing = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get(userId);
  if (!existing) {
    db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
  }

  values.push(userId);
  db.prepare(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
  return getUserPreferences(userId);
}

// ═══════════════════════════════════════════════════════════════════════════
// INCIDENT HISTORY
// ═══════════════════════════════════════════════════════════════════════════

function getIncidentHistory(incidentId) {
  return db.prepare(`
    SELECT h.*, u.display_name as performer_name
    FROM incident_history h
    LEFT JOIN users u ON h.performed_by = u.id
    WHERE h.incident_id = ?
    ORDER BY h.performed_at ASC
  `).all(incidentId);
}

// ═══════════════════════════════════════════════════════════════════════════
// USER OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LEGACY: Simple hash function for backward compatibility.
 * Only used to verify old 'gh_' prefixed hashes during migration.
 * All new passwords use bcrypt.
 */
function legacySimpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'gh_' + Math.abs(hash).toString(36);
}

/**
 * Check if a password hash is in the legacy format (gh_ prefix).
 */
function isLegacyHash(hash) {
  return hash && hash.startsWith('gh_');
}

/**
 * Verify password against stored hash.
 * Supports both legacy (gh_) and bcrypt ($2) formats.
 */
function verifyPassword(password, storedHash) {
  if (isLegacyHash(storedHash)) {
    return storedHash === legacySimpleHash(password);
  }
  return bcrypt.compareSync(password, storedHash);
}

/**
 * Hash a password using bcrypt.
 */
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function getAllUsers() {
  return db.prepare('SELECT id, username, email, display_name, department, role, account_status, created_at FROM users ORDER BY display_name ASC').all();
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
}

function authenticateUser(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    logAuditEvent({ eventType: 'login_failed', targetType: 'user', targetName: username, performedBy: 'system', performerName: 'System' });
    return { success: false, error: 'Invalid credentials' };
  }

  // Verify password (supports both legacy and bcrypt hashes)
  if (!verifyPassword(password, user.password_hash)) {
    logAuditEvent({ eventType: 'login_failed', targetType: 'user', targetId: user.id, targetName: user.display_name, performedBy: user.id, performerName: user.display_name });
    return { success: false, error: 'Invalid credentials' };
  }

  // Transparent migration: if using legacy hash, upgrade to bcrypt
  if (isLegacyHash(user.password_hash)) {
    const newHash = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  }

  if (user.account_status === 'pending') {
    logAuditEvent({ eventType: 'login_blocked', targetType: 'user', targetId: user.id, targetName: user.display_name, newValue: 'pending', performedBy: user.id, performerName: user.display_name });
    return { success: false, error: 'Your account is pending approval by an administrator' };
  }
  if (user.account_status === 'rejected') {
    logAuditEvent({ eventType: 'login_blocked', targetType: 'user', targetId: user.id, targetName: user.display_name, newValue: 'rejected', performedBy: user.id, performerName: user.display_name });
    return { success: false, error: 'Your account request has been declined' };
  }
  if (user.account_status === 'suspended') {
    logAuditEvent({ eventType: 'login_blocked', targetType: 'user', targetId: user.id, targetName: user.display_name, newValue: 'suspended', performedBy: user.id, performerName: user.display_name });
    return { success: false, error: 'Your account has been suspended' };
  }

  logAuditEvent({ eventType: 'login', targetType: 'user', targetId: user.id, targetName: user.display_name, performedBy: user.id, performerName: user.display_name });

  const { password_hash, ...safeUser } = user;
  return { success: true, user: safeUser };
}

function registerUser({ username, password, email, display_name, department }) {
  // Validate password length
  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' };
  }

  // Validate department is required
  if (!department || typeof department !== 'string' || department.trim() === '') {
    return { success: false, error: 'Department is required' };
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return { success: false, error: 'Username already taken' };

  if (email) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) return { success: false, error: 'Email already registered' };
  }

  const id = 'user-' + username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const now = new Date().toISOString();
  const displayName = display_name || username;

  db.prepare(`
    INSERT INTO users (id, username, password_hash, email, display_name, department, role, account_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'viewer', 'pending', ?)
  `).run(id, username, hashPassword(password), email || null, displayName, department.trim(), now);

  logAuditEvent({ eventType: 'user_registered', targetType: 'user', targetId: id, targetName: displayName, performedBy: id, performerName: displayName });

  return { success: true, message: 'Account created. Awaiting admin approval.' };
}

function updateUserStatus(userId, status, performedBy = null, performerName = null) {
  const allowed = ['pending', 'approved', 'rejected', 'suspended'];
  if (!allowed.includes(status)) return { success: false, error: 'Invalid status' };

  const user = db.prepare('SELECT id, display_name, account_status, role FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };
  if (user.role === 'owner') return { success: false, error: 'Cannot modify owner account status' };

  const oldStatus = user.account_status;
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?').run(status, now, userId);

  logAuditEvent({
    eventType: 'user_status_changed',
    targetType: 'user',
    targetId: userId,
    targetName: user.display_name,
    oldValue: oldStatus,
    newValue: status,
    performedBy: performedBy || 'system',
    performerName: performerName || 'System',
  });

  return { success: true };
}

function updateUserRole(userId, role, performedBy = null, performerName = null) {
  const allowed = ['viewer', 'operator', 'admin'];
  if (!allowed.includes(role)) return { success: false, error: 'Invalid role' };

  const user = db.prepare('SELECT id, display_name, role FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };
  if (user.role === 'owner') return { success: false, error: 'Cannot change owner role' };

  // Permission check: Only OWNER can change admin roles; ADMIN can only change operator/viewer
  if (performedBy) {
    const performer = db.prepare('SELECT role FROM users WHERE id = ?').get(performedBy);
    if (performer && performer.role === 'admin' && user.role === 'admin') {
      return { success: false, error: 'Admins cannot change the role of other admins' };
    }
  }

  const oldRole = user.role;
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, userId);

  logAuditEvent({
    eventType: 'user_role_changed',
    targetType: 'user',
    targetId: userId,
    targetName: user.display_name,
    oldValue: oldRole,
    newValue: role,
    performedBy: performedBy || 'system',
    performerName: performerName || 'System',
  });

  return { success: true };
}

function updateUserDepartment(userId, department, performedBy = null, performerName = null) {
  const user = db.prepare('SELECT id, display_name, department FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };

  const oldDepartment = user.department;
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET department = ?, updated_at = ? WHERE id = ?').run(department, now, userId);

  logAuditEvent({
    eventType: 'user_department_changed',
    targetType: 'user',
    targetId: userId,
    targetName: user.display_name,
    oldValue: oldDepartment,
    newValue: department,
    performedBy: performedBy || 'system',
    performerName: performerName || 'System',
  });

  return { success: true };
}

/**
 * Update user profile (display_name and/or email) — user can update their own profile
 */
function updateUserProfile(userId, updates, performedBy) {
  if (!userId) return { success: false, error: 'User ID required' };
  if (!performedBy) return { success: false, error: 'Unauthorized — performer ID required' };

  // Get performer's role and name for authorization and audit logging
  const performer = db.prepare('SELECT id, role, display_name FROM users WHERE id = ?').get(performedBy);
  if (!performer) return { success: false, error: 'Unauthorized — performer not found' };

  const user = db.prepare('SELECT id, username, display_name, email, role FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };

  // Authorization check:
  // - OWNER can edit anyone
  // - ADMIN can edit self OR users with role operator/viewer (not other admins or owner)
  // - OPERATOR/VIEWER can only edit themselves
  const isSelf = performedBy === userId;
  const isPerformerOwner = performer.role === 'owner';
  const isPerformerAdmin = performer.role === 'admin';
  const targetIsLowerRole = user.role === 'operator' || user.role === 'viewer';

  const canEdit = isPerformerOwner ||
                  (isPerformerAdmin && (isSelf || targetIsLowerRole)) ||
                  isSelf;

  if (!canEdit) {
    return { success: false, error: 'Unauthorized — insufficient permissions to edit this user' };
  }

  const changes = {};
  const fields = [];
  const values = [];

  // Validate and collect username update
  if (updates.username !== undefined) {
    const username = (updates.username || '').trim();
    if (!username) {
      return { success: false, error: 'Agent ID cannot be empty' };
    }
    if (username.length < 3) {
      return { success: false, error: 'Agent ID must be at least 3 characters' };
    }
    if (/\s/.test(username)) {
      return { success: false, error: 'Agent ID cannot contain spaces' };
    }
    // Check uniqueness
    if (username !== user.username) {
      const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
      if (existingUser) {
        return { success: false, error: 'Agent ID already in use' };
      }
      fields.push('username = ?');
      values.push(username);
      changes.username = { old: user.username, new: username };
    }
  }

  // Validate and collect display_name update
  if (updates.display_name !== undefined) {
    const name = (updates.display_name || '').trim();
    if (name.length < 2) {
      return { success: false, error: 'Display name must be at least 2 characters' };
    }
    if (name !== user.display_name) {
      fields.push('display_name = ?');
      values.push(name);
      changes.display_name = { old: user.display_name, new: name };
    }
  }

  // Validate and collect email update
  if (updates.email !== undefined) {
    const email = (updates.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Invalid email format' };
    }
    // Check for duplicate email (if not empty)
    if (email) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
      if (existingEmail) {
        return { success: false, error: 'Email already in use by another user' };
      }
    }
    if (email !== user.email) {
      fields.push('email = ?');
      values.push(email || null);
      changes.email = { old: user.email, new: email || null };
    }
  }

  // Validate and handle password update
  if (updates.password !== undefined && updates.password) {
    const password = updates.password;
    // Enhanced password validation
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }
    if (!/[A-Z]/.test(password)) {
      return { success: false, error: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { success: false, error: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { success: false, error: 'Password must contain at least one number' };
    }
    // Hash password with bcrypt
    const hashedPassword = hashPassword(password);
    fields.push('password_hash = ?');
    values.push(hashedPassword);
    changes.password = true;
  }

  if (fields.length === 0) {
    return { success: true, message: 'No changes made' };
  }

  // Check if updated_at column exists before trying to update it
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');
    if (hasUpdatedAt) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());
    }
  } catch (e) {
    // Ignore - updated_at is optional
  }

  values.push(userId);

  try {
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  } catch (dbError) {
    console.error('[updateUserProfile] Database error:', dbError.message);
    return { success: false, error: 'Database error: ' + dbError.message };
  }

  // Log audit events for each change (use actual performer, not frontend-provided values)
  const actualPerformerName = performer.display_name || performer.id;

  if (changes.username) {
    logAuditEvent({
      eventType: 'user_profile_updated',
      targetType: 'user',
      targetId: userId,
      targetName: user.display_name,
      oldValue: `username: ${changes.username.old}`,
      newValue: `username: ${changes.username.new}`,
      performedBy: performedBy,
      performerName: actualPerformerName,
    });
  }
  if (changes.display_name) {
    logAuditEvent({
      eventType: 'user_profile_updated',
      targetType: 'user',
      targetId: userId,
      targetName: changes.display_name.new,
      oldValue: `name: ${changes.display_name.old}`,
      newValue: `name: ${changes.display_name.new}`,
      performedBy: performedBy,
      performerName: actualPerformerName,
    });
  }
  if (changes.email) {
    logAuditEvent({
      eventType: 'user_profile_updated',
      targetType: 'user',
      targetId: userId,
      targetName: user.display_name,
      oldValue: `email: ${changes.email.old || '(none)'}`,
      newValue: `email: ${changes.email.new || '(none)'}`,
      performedBy: performedBy,
      performerName: actualPerformerName,
    });
  }
  if (changes.password) {
    logAuditEvent({
      eventType: 'user_profile_updated',
      targetType: 'user',
      targetId: userId,
      targetName: user.display_name,
      oldValue: 'password: ********',
      newValue: 'password: (changed)',
      performedBy: performedBy,
      performerName: actualPerformerName,
    });
  }

  // Return updated user data
  const updatedUser = db.prepare('SELECT id, username, email, display_name, department, role, account_status FROM users WHERE id = ?').get(userId);
  return { success: true, user: updatedUser };
}

function deleteUser(userId, performedBy = null, performerName = null) {
  // Check target is not owner
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  if (target?.role === 'owner') return false;

  if (performedBy) {
    const performer = db.prepare('SELECT role FROM users WHERE id = ?').get(performedBy);
    if (!performer || (performer.role !== 'admin' && performer.role !== 'owner')) {
      return false;
    }
    // Admin cannot delete other admins — only owner can
    if (target?.role === 'admin' && performer.role !== 'owner') {
      return false;
    }
  }

  const user = db.prepare('SELECT id, display_name, username FROM users WHERE id = ?').get(userId);
  if (!user) return false;

  try {
    // Disable FK enforcement, clean all references, delete, re-enable
    db.pragma('foreign_keys = OFF');
    db.prepare('UPDATE incidents SET assigned_to = NULL WHERE assigned_to = ?').run(userId);
    db.prepare('UPDATE incidents SET created_by = \'deleted-user\' WHERE created_by = ?').run(userId);
    db.prepare('UPDATE incident_history SET performed_by = \'deleted-user\' WHERE performed_by = ?').run(userId);
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.pragma('foreign_keys = ON');

    if (result.changes > 0) {
      logAuditEvent({
        eventType: 'user_deleted',
        targetType: 'user',
        targetId: userId,
        targetName: user.display_name,
        oldValue: user.username,
        performedBy: performedBy || 'system',
        performerName: performerName || 'System',
      });
    }

    return result.changes > 0;
  } catch (err) {
    console.error('[deleteUser] ERROR:', err);
    db.pragma('foreign_keys = ON');
    return false;
  }
}

function isAdmin(userId) {
  if (!userId) return false;
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  return user?.role === 'admin' || user?.role === 'owner';
}

function isOwner(userId) {
  if (!userId) return false;
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  return user?.role === 'owner';
}

// Get user's role string
function getUserRole(userId) {
  if (!userId) return null;
  return db.prepare('SELECT role FROM users WHERE id = ?').get(userId)?.role;
}

// Check if user can write (owner, admin, or operator)
function canWrite(userId) {
  const role = getUserRole(userId);
  return ['owner', 'admin', 'operator'].includes(role);
}

function getLinkedTickets(userId) {
  return db.prepare(`
    SELECT id, title, priority, status
    FROM incidents
    WHERE assigned_to = ? OR created_by = ?
    ORDER BY created_at DESC
  `).all(userId, userId);
}

function reassignAndDeleteUser(userId, reassignToId, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };

  const user = db.prepare('SELECT id, display_name, username, role FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };
  if (user.role === 'owner') return { success: false, error: 'Cannot delete owner account' };

  const target = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(reassignToId);
  if (!target) return { success: false, error: 'Reassignment target not found' };

  const txn = db.transaction(() => {
    db.prepare('UPDATE incidents SET assigned_to = ? WHERE assigned_to = ?').run(reassignToId, userId);
    db.prepare('UPDATE incidents SET created_by = ? WHERE created_by = ?').run(reassignToId, userId);
    db.prepare('UPDATE incident_history SET performed_by = ? WHERE performed_by = ?').run(reassignToId, userId);

    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.pragma('foreign_keys = ON');

    logAuditEvent({
      eventType: 'tickets_reassigned',
      targetType: 'user',
      targetId: userId,
      targetName: user.display_name,
      newValue: target.display_name,
      performedBy,
      performerName,
    });
    logAuditEvent({
      eventType: 'user_deleted',
      targetType: 'user',
      targetId: userId,
      targetName: user.display_name,
      oldValue: user.username,
      performedBy,
      performerName,
    });
  });

  try {
    txn();
    return { success: true };
  } catch (err) {
    console.error('[reassignAndDeleteUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

function reassignAndDeactivateUser(userId, reassignToId, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };

  const user = db.prepare('SELECT id, display_name, username, role FROM users WHERE id = ?').get(userId);
  if (!user) return { success: false, error: 'User not found' };
  if (user.role === 'owner') return { success: false, error: 'Cannot deactivate owner account' };

  const target = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(reassignToId);
  if (!target) return { success: false, error: 'Reassignment target not found' };

  const txn = db.transaction(() => {
    db.prepare('UPDATE incidents SET assigned_to = ? WHERE assigned_to = ?').run(reassignToId, userId);
    db.prepare('UPDATE incidents SET created_by = ? WHERE created_by = ?').run(reassignToId, userId);
    db.prepare('UPDATE users SET account_status = ? WHERE id = ?').run('suspended', userId);

    logAuditEvent({
      eventType: 'tickets_reassigned',
      targetType: 'user',
      targetId: userId,
      targetName: user.display_name,
      newValue: target.display_name,
      performedBy,
      performerName,
    });
    logAuditEvent({
      eventType: 'user_deactivated',
      targetType: 'user',
      targetId: userId,
      targetName: user.display_name,
      performedBy,
      performerName,
    });
  });

  try {
    txn();
    return { success: true };
  } catch (err) {
    console.error('[reassignAndDeactivateUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

function getPendingUsers() {
  return db.prepare("SELECT id, username, email, display_name, created_at FROM users WHERE account_status = 'pending' ORDER BY created_at DESC").all();
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPARTMENT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

function getAllDepartments() {
  return db.prepare('SELECT * FROM departments ORDER BY display_name ASC').all();
}

function getDepartmentLoad() {
  // Count active incidents grouped by company department
  const result = db.prepare(`
    SELECT
      cd.id,
      cd.name,
      COUNT(i.id) as count
    FROM company_departments cd
    LEFT JOIN incidents i ON i.department = cd.id
      AND i.status NOT IN ('resolved', 'closed')
    WHERE cd.is_active = 1
    GROUP BY cd.id, cd.name
    ORDER BY COUNT(i.id) DESC, cd.name ASC
  `).all();

  return result.map(row => ({
    id: row.id,
    name: row.name,
    count: row.count || 0,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

function logAuditEvent({ eventType, targetType, targetId, targetName, oldValue, newValue, performedBy, performerName }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_log (event_type, target_type, target_id, target_name, old_value, new_value, performed_by, performer_name, performed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(eventType, targetType || null, targetId || null, targetName || null, oldValue || null, newValue || null, performedBy, performerName || null, now);
}

function getAuditLog({ limit = 100, offset = 0, eventType = null, targetType = null, performedBy = null, searchQuery = null } = {}) {
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (eventType) {
    query += ' AND event_type = ?';
    params.push(eventType);
  }
  if (targetType) {
    query += ' AND target_type = ?';
    params.push(targetType);
  }
  if (performedBy) {
    query += ' AND performed_by = ?';
    params.push(performedBy);
  }
  if (searchQuery && searchQuery.trim()) {
    const searchPattern = `%${searchQuery.trim()}%`;
    query += ' AND (target_name LIKE ? OR performer_name LIKE ? OR event_type LIKE ?)';
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY performed_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function getAuditLogCount({ eventType = null, targetType = null, performedBy = null, searchQuery = null } = {}) {
  let query = 'SELECT COUNT(*) as count FROM audit_log WHERE 1=1';
  const params = [];

  if (eventType) {
    query += ' AND event_type = ?';
    params.push(eventType);
  }
  if (targetType) {
    query += ' AND target_type = ?';
    params.push(targetType);
  }
  if (performedBy) {
    query += ' AND performed_by = ?';
    params.push(performedBy);
  }
  if (searchQuery && searchQuery.trim()) {
    const searchPattern = `%${searchQuery.trim()}%`;
    query += ' AND (target_name LIKE ? OR performer_name LIKE ? OR event_type LIKE ?)';
    params.push(searchPattern, searchPattern, searchPattern);
  }

  return db.prepare(query).get(...params).count;
}

function deleteAuditLogEntries(ids, performedBy, performerName) {
  if (!performedBy) return { success: false, error: 'Unauthorized' };
  if (!isOwner(performedBy)) return { success: false, error: 'Only the system owner can delete audit logs' };
  if (!ids || ids.length === 0) return { success: false, error: 'No entries specified' };

  try {
    // Log the cleanup action BEFORE deleting
    logAuditEvent({
      eventType: 'audit_log_cleaned',
      targetType: 'audit_log',
      newValue: `${ids.length} entries deleted (selected)`,
      performedBy,
      performerName: performerName || 'System',
    });

    // Delete in batches to avoid SQLite parameter limits
    const deleteStmt = db.prepare('DELETE FROM audit_log WHERE id = ?');
    const txn = db.transaction((idList) => {
      let deleted = 0;
      for (const id of idList) {
        deleted += deleteStmt.run(id).changes;
      }
      return deleted;
    });

    const deleted = txn(ids);
    return { success: true, deleted };
  } catch (err) {
    console.error('[deleteAuditLogEntries] ERROR:', err);
    return { success: false, error: err.message };
  }
}

function deleteAllAuditLogs(performedBy, performerName) {
  if (!performedBy) return { success: false, error: 'Unauthorized' };
  if (!isOwner(performedBy)) return { success: false, error: 'Only the system owner can delete audit logs' };

  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;

    // Log the cleanup action BEFORE deleting
    logAuditEvent({
      eventType: 'audit_log_cleaned',
      targetType: 'audit_log',
      newValue: `All ${count} entries deleted`,
      performedBy,
      performerName: performerName || 'System',
    });

    // Get the ID of the cleanup event we just logged (the highest ID)
    const keepId = db.prepare('SELECT MAX(id) as id FROM audit_log').get().id;

    // Delete everything except the cleanup event
    db.prepare('DELETE FROM audit_log WHERE id != ?').run(keepId);

    return { success: true, deleted: count };
  } catch (err) {
    console.error('[deleteAllAuditLogs] ERROR:', err);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS & STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

function getMetrics() {
  const active = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE status NOT IN ('resolved', 'closed')").get();
  const critical = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE priority = 'critical' AND status NOT IN ('resolved', 'closed')").get();
  const pending = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE status = 'in_progress'").get();
  const resolvedToday = db.prepare(`
    SELECT COUNT(*) as count FROM incidents
    WHERE status IN ('resolved', 'closed')
    AND resolved_at >= datetime('now', '-24 hours')
  `).get();

  return {
    active: active.count,
    critical: critical.count,
    pending: pending.count,
    resolvedToday: resolvedToday.count,
  };
}

function getStatusDistribution() {
  return db.prepare(`
    SELECT
      CASE
        WHEN status IN ('new', 'in_progress') THEN 'Active'
        WHEN status = 'escalated' THEN 'Escalated'
        WHEN status = 'resolved' THEN 'Resolved'
        WHEN status = 'closed' THEN 'Resolved'
        ELSE 'Pending'
      END as status,
      COUNT(*) as count
    FROM incidents
    GROUP BY 1
  `).all();
}

function getPriorityBreakdown() {
  return db.prepare(`
    SELECT priority as level, COUNT(*) as count
    FROM incidents
    GROUP BY priority
    ORDER BY CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END
  `).all();
}

function getRecentResolutions() {
  return db.prepare(`
    SELECT
      strftime('%H:%M', resolved_at) as time,
      id,
      title,
      UPPER(REPLACE(status, '_', ' ')) as status,
      status as rawStatus,
      priority,
      department,
      created_at,
      resolved_at
    FROM incidents
    WHERE status IN ('resolved', 'closed')
    AND resolved_at IS NOT NULL
    ORDER BY resolved_at DESC
    LIMIT 8
  `).all();
}

/**
 * Get comprehensive report statistics filtered by date range.
 * Used by Reports page date filter.
 *
 * @param {Object} options - Filter options
 * @param {string|null} options.startDate - ISO date string for range start
 * @param {string|null} options.endDate - ISO date string for range end
 * @param {Array} options.trendBuckets - Array of bucket objects for trend chart
 * @returns {Object} Complete report statistics
 */
function getReportStats({ startDate = null, endDate = null, trendBuckets = [] } = {}) {
  // Build date filter clause
  let dateClause = '';
  const dateParams = [];

  if (startDate) {
    dateClause += ' AND created_at >= ?';
    dateParams.push(startDate);
  }
  if (endDate) {
    dateClause += ' AND created_at <= ?';
    dateParams.push(endDate);
  }

  // For resolved_at filtering
  let resolvedDateClause = '';
  const resolvedDateParams = [];
  if (startDate) {
    resolvedDateClause += ' AND resolved_at >= ?';
    resolvedDateParams.push(startDate);
  }
  if (endDate) {
    resolvedDateClause += ' AND resolved_at <= ?';
    resolvedDateParams.push(endDate);
  }

  // Total incidents in range
  const totalResult = db.prepare(`
    SELECT COUNT(*) as count FROM incidents WHERE 1=1 ${dateClause}
  `).get(...dateParams);
  const totalIncidents = totalResult.count;

  // Open incidents (created in range, not yet resolved)
  const openResult = db.prepare(`
    SELECT COUNT(*) as count FROM incidents
    WHERE status NOT IN ('resolved', 'closed') ${dateClause}
  `).get(...dateParams);
  const openIncidents = openResult.count;

  // Resolved incidents (resolved in range)
  const resolvedResult = db.prepare(`
    SELECT COUNT(*) as count FROM incidents
    WHERE status IN ('resolved', 'closed') ${dateClause}
  `).get(...dateParams);
  const resolvedIncidents = resolvedResult.count;

  // Critical open in range
  const criticalResult = db.prepare(`
    SELECT COUNT(*) as count FROM incidents
    WHERE priority = 'critical' AND status NOT IN ('resolved', 'closed') ${dateClause}
  `).get(...dateParams);
  const criticalOpen = criticalResult.count;

  // Resolution rate
  const resolutionRate = totalIncidents > 0 ? Math.round((resolvedIncidents / totalIncidents) * 100) : 0;

  // Average resolution time (MTTR) in minutes
  // Only for incidents created AND resolved within the range
  let avgResolveMinutes = 0;
  const mttrResult = db.prepare(`
    SELECT AVG(
      (julianday(resolved_at) - julianday(created_at)) * 24 * 60
    ) as avg_minutes
    FROM incidents
    WHERE status IN ('resolved', 'closed')
    AND resolved_at IS NOT NULL
    AND created_at IS NOT NULL
    ${dateClause}
  `).get(...dateParams);
  if (mttrResult && mttrResult.avg_minutes) {
    avgResolveMinutes = Math.round(mttrResult.avg_minutes);
  }

  // Priority breakdown
  const priorityResult = db.prepare(`
    SELECT
      UPPER(priority) as label,
      COUNT(*) as count
    FROM incidents
    WHERE 1=1 ${dateClause}
    GROUP BY priority
    ORDER BY CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END
  `).all(...dateParams);

  // Status breakdown
  const statusResult = db.prepare(`
    SELECT
      UPPER(REPLACE(status, '_', ' ')) as label,
      COUNT(*) as count
    FROM incidents
    WHERE 1=1 ${dateClause}
    GROUP BY status
    ORDER BY CASE status
      WHEN 'new' THEN 1
      WHEN 'in_progress' THEN 2
      WHEN 'escalated' THEN 3
      WHEN 'resolved' THEN 4
      WHEN 'closed' THEN 5
    END
  `).all(...dateParams);

  // Department load
  const deptResult = db.prepare(`
    SELECT
      d.id,
      d.display_name as name,
      d.capacity,
      COUNT(CASE WHEN i.status NOT IN ('resolved', 'closed') THEN 1 END) as active,
      COUNT(CASE WHEN i.status IN ('resolved', 'closed') THEN 1 END) as resolved
    FROM departments d
    LEFT JOIN incidents i ON i.department = d.id
    ${dateClause ? dateClause.replace(/created_at/g, 'i.created_at') : ''}
    GROUP BY d.id
    ORDER BY active DESC
  `).all(...dateParams);

  // Recent resolutions in range
  const recentResult = db.prepare(`
    SELECT
      strftime('%H:%M', resolved_at) as time,
      id,
      title,
      UPPER(REPLACE(status, '_', ' ')) as status,
      status as rawStatus,
      priority,
      department,
      created_at,
      resolved_at
    FROM incidents
    WHERE status IN ('resolved', 'closed')
    AND resolved_at IS NOT NULL
    ${dateClause}
    ORDER BY resolved_at DESC
    LIMIT 8
  `).all(...dateParams);

  // Trend data based on buckets
  const trendData = trendBuckets.map((bucket) => {
    // Count incidents created in this bucket
    const createdCount = db.prepare(`
      SELECT COUNT(*) as count FROM incidents
      WHERE created_at >= ? AND created_at <= ?
    `).get(bucket.start, bucket.end);

    // Count incidents resolved in this bucket
    const resolvedCount = db.prepare(`
      SELECT COUNT(*) as count FROM incidents
      WHERE resolved_at >= ? AND resolved_at <= ?
      AND status IN ('resolved', 'closed')
    `).get(bucket.start, bucket.end);

    return {
      label: bucket.label,
      shortLabel: bucket.shortLabel,
      created: createdCount.count,
      resolved: resolvedCount.count,
    };
  });

  return {
    totalIncidents,
    openIncidents,
    resolvedIncidents,
    criticalOpen,
    resolutionRate,
    avgResolveMinutes,
    priorityData: priorityResult,
    statusData: statusResult,
    departmentLoad: deptResult,
    recentResolutions: recentResult,
    trendData,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP & RESTORE
// ═══════════════════════════════════════════════════════════════════════════

function getBackupDir() {
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function createBackup(customPath = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = getBackupDir();
  const backupPath = customPath || path.join(backupDir, `ghost-protocol-backup-${timestamp}.db`);

  try {
    // Use SQLite backup API for a consistent snapshot
    db.backup(backupPath);

    // Log the backup event
    logAuditEvent({
      eventType: 'database_backup',
      targetType: 'system',
      newValue: backupPath,
      performedBy: 'system',
      performerName: 'System',
    });

    return { success: true, path: backupPath, timestamp };
  } catch (err) {
    console.error('Backup failed:', err);
    return { success: false, error: err.message };
  }
}

function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    return { success: false, error: 'Backup file not found' };
  }

  try {
    // Verify the backup is a valid SQLite database
    const testDb = new Database(backupPath, { readonly: true });
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    testDb.close();

    // Check for required tables
    const requiredTables = ['users', 'incidents', 'departments'];
    const tableNames = tables.map((t) => t.name);
    const missing = requiredTables.filter((t) => !tableNames.includes(t));

    if (missing.length > 0) {
      return { success: false, error: `Invalid backup: missing tables ${missing.join(', ')}` };
    }

    // Close current database
    const currentDbPath = getDbPath();
    db.close();

    // Create a backup of current database before restoring
    const preRestoreBackup = currentDbPath + '.pre-restore';
    if (fs.existsSync(currentDbPath)) {
      fs.copyFileSync(currentDbPath, preRestoreBackup);
    }

    // Copy backup over current database
    fs.copyFileSync(backupPath, currentDbPath);

    // Reopen database
    db = new Database(currentDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Log the restore event
    logAuditEvent({
      eventType: 'database_restored',
      targetType: 'system',
      oldValue: preRestoreBackup,
      newValue: backupPath,
      performedBy: 'system',
      performerName: 'System',
    });

    return { success: true, message: 'Database restored successfully' };
  } catch (err) {
    console.error('Restore failed:', err);
    return { success: false, error: err.message };
  }
}

function listBackups() {
  const backupDir = getBackupDir();
  try {
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith('.db') && f.startsWith('ghost-protocol-backup-'))
      .map((f) => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stats.size,
          created: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    return { success: true, backups: files };
  } catch (err) {
    return { success: false, error: err.message, backups: [] };
  }
}

function deleteBackup(backupPath) {
  try {
    if (!backupPath.includes('ghost-protocol-backup-')) {
      return { success: false, error: 'Invalid backup file' };
    }
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function exportToJson(customPath = null) {
  try {
    const data = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      departments: db.prepare('SELECT * FROM departments').all(),
      users: db.prepare('SELECT id, username, email, display_name, department, role, account_status, created_at FROM users').all(),
      incidents: db.prepare('SELECT * FROM incidents').all(),
      incident_history: db.prepare('SELECT * FROM incident_history').all(),
      incident_comments: db.prepare('SELECT * FROM incident_comments').all(),
      user_preferences: db.prepare('SELECT * FROM user_preferences').all(),
      audit_log: db.prepare('SELECT * FROM audit_log ORDER BY performed_at DESC').all(),
    };

    let jsonPath;
    if (customPath) {
      jsonPath = customPath;
    } else {
      const backupDir = getBackupDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      jsonPath = path.join(backupDir, `ghost-protocol-export-${timestamp}.json`);
    }

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    logAuditEvent({
      eventType: 'database_exported',
      targetType: 'system',
      newValue: jsonPath,
      performedBy: 'system',
      performerName: 'System',
    });

    return { success: true, path: jsonPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function exportAuditLog(customPath = null, filters = {}) {
  try {
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];

    if (filters.eventType) {
      query += ' AND event_type = ?';
      params.push(filters.eventType);
    }
    if (filters.performedBy) {
      query += ' AND performed_by = ?';
      params.push(filters.performedBy);
    }
    if (filters.startDate) {
      query += ' AND performed_at >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ' AND performed_at <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY performed_at DESC';

    const logs = db.prepare(query).all(...params);

    const data = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      type: 'audit_log_export',
      filters: filters,
      totalRecords: logs.length,
      audit_log: logs,
    };

    let jsonPath;
    if (customPath) {
      jsonPath = customPath;
    } else {
      const backupDir = getBackupDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      jsonPath = path.join(backupDir, `ghost-protocol-audit-${timestamp}.json`);
    }

    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    logAuditEvent({
      eventType: 'audit_log_exported',
      targetType: 'system',
      newValue: `${logs.length} records`,
      performedBy: 'system',
      performerName: 'System',
    });

    return { success: true, path: jsonPath, count: logs.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getDatabaseInfo() {
  try {
    const dbPath = getDbPath();
    const stats = fs.statSync(dbPath);
    const counts = {
      users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      incidents: db.prepare('SELECT COUNT(*) as count FROM incidents').get().count,
      audit_logs: db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count,
    };

    return {
      success: true,
      path: dbPath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      counts,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT RECOVERY
// ═══════════════════════════════════════════════════════════════════════════

function recoverUsername(email) {
  if (!email) return { success: false, error: 'Email is required' };

  const user = db.prepare("SELECT username, display_name FROM users WHERE email = ? AND account_status = 'approved'").get(email);

  logAuditEvent({
    eventType: 'account_recovery',
    targetType: 'user',
    targetName: user ? user.display_name : email,
    newValue: user ? 'username_recovered' : 'username_not_found',
    performedBy: 'system',
    performerName: 'Recovery System',
  });

  if (!user) return { success: false, error: 'NO AGENT FOUND WITH THAT EMAIL ADDRESS' };
  return { success: true, username: user.username };
}

function resetPassword(username, email) {
  if (!username || !email) return { success: false, error: 'Username and email are required' };

  const user = db.prepare("SELECT id, username, display_name, email FROM users WHERE username = ? AND email = ? AND account_status = 'approved'").get(username, email);

  logAuditEvent({
    eventType: 'account_recovery',
    targetType: 'user',
    targetName: user ? user.display_name : username,
    newValue: user ? 'password_reset' : 'identity_verification_failed',
    performedBy: 'system',
    performerName: 'Recovery System',
  });

  if (!user) return { success: false, error: 'IDENTITY VERIFICATION FAILED' };

  // Generate temporary password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let tempPassword = 'GP-';
  for (let i = 0; i < 8; i++) {
    tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(tempPassword), user.id);

  return { success: true, tempPassword };
}

function changeUserPassword(targetUserId, newPassword, performedBy, performerName) {
  if (!targetUserId || !newPassword || !performedBy) return { success: false, error: 'Missing required fields' };
  if (newPassword.length < 6) return { success: false, error: 'Password must be at least 6 characters' };

  const performer = db.prepare('SELECT id, role, display_name FROM users WHERE id = ?').get(performedBy);
  if (!performer) return { success: false, error: 'Unauthorized' };

  const target = db.prepare('SELECT id, role, display_name, username FROM users WHERE id = ?').get(targetUserId);
  if (!target) return { success: false, error: 'User not found' };

  // Owner can change anyone's password
  // Admin can only change operator and viewer passwords
  if (performer.role === 'owner') {
    // allowed for all targets
  } else if (performer.role === 'admin') {
    if (target.role === 'owner' || target.role === 'admin') {
      return { success: false, error: 'Insufficient permissions' };
    }
  } else {
    return { success: false, error: 'Unauthorized' };
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), targetUserId);

  logAuditEvent({
    eventType: 'password_changed',
    targetType: 'user',
    targetId: targetUserId,
    targetName: target.display_name,
    performedBy,
    performerName: performerName || performer.display_name,
  });

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — SEED DATA
// ═══════════════════════════════════════════════════════════════════════════

function seedKnowledgeBase() {
  const catCount = db.prepare('SELECT COUNT(*) as count FROM kb_categories').get();
  if (catCount.count > 0) return;

  const insertCat = db.prepare('INSERT INTO kb_categories (name, slug, icon, parent_id, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  const insertArticle = db.prepare('INSERT INTO kb_articles (title, slug, body, excerpt, category_id, tags, difficulty, status, is_pinned, view_count, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const now = new Date().toISOString();

  const cats = [
    ['Printers & Scanners', 'printers', 'Printer', null, 0, 'user-moner'],
    ['Hardware & Devices', 'hardware', 'Monitor', null, 1, 'user-moner'],
    ['Network & Connectivity', 'network', 'Wifi', null, 2, 'user-moner'],
    ['Access & Authentication', 'access', 'KeyRound', null, 3, 'user-moner'],
    ['Email & Communication', 'email', 'Mail', null, 4, 'user-moner'],
    ['Software & Applications', 'software', 'AppWindow', null, 5, 'user-moner'],
    ['Department Specific', 'departments', 'Building2', null, 6, 'user-moner'],
    ['Procedures & Policies', 'procedures', 'ClipboardList', null, 7, 'user-moner'],
  ];

  const seedTxn = db.transaction(() => {
    const catIds = {};
    for (const c of cats) {
      const info = insertCat.run(...c);
      catIds[c[1]] = info.lastInsertRowid;
    }

    const articles = [
      {
        title: 'How to Connect to the Corporate VPN',
        slug: 'vpn-connection-guide',
        body: `# How to Connect to the Corporate VPN\n\n## Prerequisites\n- Company laptop with admin rights\n- VPN credentials from IT Operations\n- Active internet connection\n\n## Step 1: Install the VPN Client\nDownload GlobalProtect from the internal portal at \`https://vpn.ghostprotocol.io\`.\n\n\`\`\`bash\n# Silent installation via command line\nmsiexec /i GlobalProtect.msi /quiet\n\`\`\`\n\n## Step 2: Configure the Connection\n1. Open GlobalProtect from the system tray\n2. Enter portal: \`vpn.ghostprotocol.io\`\n3. Click **Connect**\n4. Enter your SSO credentials\n\n## Step 3: Verify\n\`\`\`bash\nping intranet.ghostprotocol.local\n\`\`\`\n\n## Troubleshooting\n- Connection drops after 10 min: check MTU settings\n- DNS issues: \`ipconfig /flushdns\`\n- Certificate errors: ensure system clock is synchronized`,
        excerpt: 'Step-by-step guide to installing and configuring the corporate VPN client for remote access.',
        catSlug: 'network', tags: 'vpn,remote-access,globalprotect', difficulty: 'beginner', pinned: 1, views: 342,
      },
      {
        title: 'Setting Up a Network Printer on Your Workstation',
        slug: 'network-printer-setup',
        body: `# Setting Up a Network Printer\n\n## Find Your Printer\nAll department printers are listed on the print server at \`\\\\printserver.ghostprotocol.local\`.\n\n## Step 1: Add the Printer\n1. Open **Settings > Printers & Scanners**\n2. Click **Add a printer**\n3. Select **The printer I want isn't listed**\n4. Enter: \`\\\\printserver\\PRINTER-NAME\`\n\n## Step 2: Install Drivers\nDrivers install automatically from the print server. If prompted, select the manufacturer and model.\n\n## Common Printer Names by Floor\n- Floor 1: \`PR-F1-HP01\`, \`PR-F1-HP02\`\n- Floor 2: \`PR-F2-XEROX01\`\n- Floor 3: \`PR-F3-HP01\`, \`PR-F3-CANON01\`\n\n## Troubleshooting\n- Print queue stuck: restart the Print Spooler service\n\`\`\`cmd\nnet stop spooler && net start spooler\n\`\`\``,
        excerpt: 'Complete guide for adding network printers including driver installation and queue configuration.',
        catSlug: 'printers', tags: 'printer,setup,drivers', difficulty: 'beginner', pinned: 1, views: 287,
      },
      {
        title: 'Password Reset Procedure',
        slug: 'password-reset-procedure',
        body: `# Password Reset Procedure\n\n## Self-Service Reset\n1. Go to \`https://passwordreset.ghostprotocol.io\`\n2. Enter your username\n3. Complete MFA verification\n4. Set new password (minimum 12 characters, 1 uppercase, 1 number, 1 symbol)\n\n## Admin-Assisted Reset\nIf self-service is unavailable:\n1. Contact IT Operations\n2. Verify identity with employee ID and manager name\n3. IT will generate a temporary password\n4. You must change it on first login\n\n## Password Requirements\n- Minimum 12 characters\n- Cannot reuse last 10 passwords\n- Must contain uppercase, lowercase, number, and special character\n- Expires every 90 days\n- Account locks after 5 failed attempts`,
        excerpt: 'How to reset your password using self-service or with IT assistance.',
        catSlug: 'access', tags: 'password,reset,security,sso', difficulty: 'beginner', pinned: 1, views: 412,
      },
      {
        title: 'Outlook Email Configuration for New Devices',
        slug: 'outlook-email-setup',
        body: `# Outlook Email Configuration\n\n## Desktop (Windows)\n1. Open Outlook\n2. If first launch, the auto-setup wizard appears\n3. Enter your email: \`name@ghostprotocol.io\`\n4. Sign in with SSO credentials\n5. Outlook auto-discovers Exchange settings\n\n## Mobile (iOS/Android)\n1. Download **Microsoft Outlook** from the app store\n2. Open and tap **Add Account**\n3. Enter your email address\n4. Complete SSO authentication\n5. Enable notifications when prompted\n\n## Shared Mailboxes\nTo add a shared mailbox:\n1. File > Account Settings > Account Settings\n2. Select your account > Change > More Settings\n3. Advanced tab > Add the shared mailbox\n\n## Calendar Sync Issues\n- Clear the Outlook cache: \`%localappdata%\\Microsoft\\Outlook\\RoamCache\`\n- Recreate the Outlook profile if sync persists`,
        excerpt: 'Configure Outlook on desktop and mobile devices including shared mailbox setup.',
        catSlug: 'email', tags: 'outlook,email,exchange,mobile', difficulty: 'beginner', pinned: 0, views: 198,
      },
      {
        title: 'Firewall Port Request Procedure',
        slug: 'firewall-port-request',
        body: `# Firewall Port Request Procedure\n\n## When to Request\nFirewall port changes are needed when:\n- A new application requires network access\n- External vendor systems need connectivity\n- Development environments need specific ports\n\n## Process\n1. Submit a Change Request in ServiceNow\n2. Category: **Network > Firewall > Port Opening**\n3. Include: source IP/subnet, destination, port, protocol (TCP/UDP), justification\n4. Request goes to CAB for approval (meets weekly)\n5. Implementation within 48h after approval\n\n## Standard Ports (Pre-Approved)\n- 80/443: HTTP/HTTPS (outbound only)\n- 22: SSH (internal only)\n- 3389: RDP (internal only, VPN required externally)\n\n## Emergency Requests\nFor critical incidents requiring immediate port changes:\n1. Contact Network Operations directly\n2. Provide incident ticket number\n3. Emergency changes require retroactive CAB review`,
        excerpt: 'How to submit and track firewall port opening requests through change management.',
        catSlug: 'network', tags: 'firewall,ports,network,security', difficulty: 'advanced', pinned: 0, views: 156,
      },
      {
        title: 'New Employee IT Onboarding Checklist',
        slug: 'new-employee-onboarding',
        body: `# New Employee IT Onboarding\n\n## Before Day 1 (IT Prep)\n- [ ] Create Active Directory account\n- [ ] Assign Microsoft 365 license\n- [ ] Provision laptop from inventory\n- [ ] Configure department-specific software\n- [ ] Set up printer access\n- [ ] Create VPN profile\n\n## Day 1 (With New Employee)\n- [ ] Hand over laptop and accessories\n- [ ] Walk through first-time login and password setup\n- [ ] Install and test VPN connection\n- [ ] Configure Outlook and Teams\n- [ ] Verify printer access\n- [ ] Explain IT support channels\n\n## Week 1 Follow-Up\n- [ ] Verify all systems accessible\n- [ ] Check shared drive permissions\n- [ ] Confirm department-specific tools working\n- [ ] Schedule MFA enrollment\n\n## Accounts Created\n| System | Username Format |\n|--------|----------------|\n| AD/Email | firstname.lastname |\n| VPN | employee ID |\n| ServiceNow | auto-provisioned |`,
        excerpt: 'Complete IT onboarding checklist for new employees — accounts, hardware, and access.',
        catSlug: 'procedures', tags: 'onboarding,checklist,new-employee', difficulty: 'beginner', pinned: 1, views: 389,
      },
      {
        title: 'Laptop BIOS Update Procedure',
        slug: 'laptop-bios-update',
        body: `# Laptop BIOS Update Procedure\n\n## WARNING\nIncorrect BIOS updates can permanently damage hardware. Only trained IT staff should perform this procedure.\n\n## Pre-Update Checklist\n- Laptop fully charged AND connected to power\n- BitLocker recovery key documented\n- Current BIOS version noted\n- Correct firmware file verified against model\n\n## Dell Latitude\n\`\`\`cmd\n# Check current BIOS version\nwmic bios get smbiosbiosversion\n\n# Silent update (run as admin)\nDell-BIOS-Update.exe /s /r\n\`\`\`\n\n## HP ProBook\n\`\`\`cmd\n# Check current version\nwmic bios get smbiosbiosversion\n\n# Update via HP Image Assistant\nHPImageAssistant.exe /Operation:Analyze /Action:Install\n\`\`\`\n\n## Post-Update\n1. Verify BIOS version updated correctly\n2. Check BitLocker status — may require recovery key\n3. Verify TPM is functional\n4. Test all hardware (keyboard, trackpad, USB, display)`,
        excerpt: 'Safe procedure for updating BIOS firmware on Dell Latitude and HP ProBook fleet machines.',
        catSlug: 'hardware', tags: 'bios,firmware,laptop,dell,hp', difficulty: 'advanced', pinned: 0, views: 67,
      },
      {
        title: 'Security Incident Response Protocol',
        slug: 'security-incident-response',
        body: `# Security Incident Response Protocol\n\n## Classification Levels\n- **P1 Critical**: Data breach, ransomware, compromised admin account\n- **P2 High**: Phishing with credential theft, unauthorized access\n- **P3 Medium**: Suspicious activity, policy violation\n- **P4 Low**: Spam, non-targeted phishing attempts\n\n## Immediate Actions (All Levels)\n1. Do NOT power off the affected system\n2. Disconnect from network (pull ethernet / disable Wi-Fi)\n3. Document everything you observe\n4. Report to IT Security immediately\n\n## Escalation Matrix\n| Level | Contact | SLA |\n|-------|---------|-----|\n| P1 | CISO + IT Director | 15 min |\n| P2 | Security Lead | 1 hour |\n| P3 | IT Operations | 4 hours |\n| P4 | Helpdesk | Next business day |\n\n## Evidence Preservation\n\`\`\`bash\n# Capture running processes\ntasklist /v > processes.txt\n\n# Capture network connections\nnetstat -an > connections.txt\n\n# Capture event logs\nwevtutil epl Security security.evtx\n\`\`\`\n\n## Do NOT\n- Run antivirus scans (may destroy evidence)\n- Delete suspicious files\n- Communicate incident details via unsecured channels`,
        excerpt: 'Step-by-step incident response protocol for suspected security breaches.',
        catSlug: 'procedures', tags: 'security,incident,response,protocol', difficulty: 'advanced', pinned: 0, views: 189,
      },
    ];

    for (const a of articles) {
      const catId = catIds[a.catSlug];
      insertArticle.run(a.title, a.slug, a.body, a.excerpt, catId, a.tags, a.difficulty, 'published', a.pinned, a.views, 'user-moner', 'user-moner', now, now);
    }
  });

  seedTxn();
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — CATEGORY OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

function kbGetCategories() {
  const cats = db.prepare('SELECT * FROM kb_categories ORDER BY sort_order ASC, name ASC').all();
  // Attach article counts (all statuses for admin visibility)
  const counts = db.prepare('SELECT category_id, COUNT(*) as count FROM kb_articles GROUP BY category_id').all();
  const countMap = {};
  for (const c of counts) countMap[c.category_id] = c.count;
  // Attach subcategory count
  const childCounts = db.prepare('SELECT parent_id, COUNT(*) as count FROM kb_categories WHERE parent_id IS NOT NULL GROUP BY parent_id').all();
  const childMap = {};
  for (const c of childCounts) childMap[c.parent_id] = c.count;
  return cats.map((c) => ({ ...c, article_count: countMap[c.id] || 0, child_count: childMap[c.id] || 0 }));
}

function kbCreateCategory(name, slug, icon, parentId, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized — not admin' };
  try {
    const existing = db.prepare('SELECT id FROM kb_categories WHERE slug = ?').get(slug);
    if (existing) return { success: false, error: 'Category slug already exists' };

    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM kb_categories').get().m;
    const info = db.prepare('INSERT INTO kb_categories (name, slug, icon, parent_id, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(name, slug, icon || null, parentId || null, maxOrder + 1, performedBy);

    logAuditEvent({ eventType: 'kb_category_created', targetType: 'kb_category', targetId: String(info.lastInsertRowid), targetName: name, performedBy, performerName });
    return { success: true, id: info.lastInsertRowid };
  } catch (err) {
    console.error('[kbCreateCategory] ERROR:', err);
    return { success: false, error: err.message };
  }
}

function kbUpdateCategory(id, name, icon, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const cat = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(id);
  if (!cat) return { success: false, error: 'Category not found' };

  db.prepare('UPDATE kb_categories SET name = ?, icon = ? WHERE id = ?').run(name, icon || cat.icon, id);
  logAuditEvent({ eventType: 'kb_category_updated', targetType: 'kb_category', targetId: String(id), targetName: name, oldValue: cat.name, newValue: name, performedBy, performerName });
  return { success: true };
}

function kbDeleteCategory(id, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  try {
    const cat = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(id);
    if (!cat) return { success: false, error: 'Category not found' };

    // Gather all IDs to check: this category + all subcategories
    const children = db.prepare('SELECT id, name FROM kb_categories WHERE parent_id = ?').all(id);
    const allIds = [id, ...children.map((c) => c.id)];
    const placeholders = allIds.map(() => '?').join(',');

    const totalArticles = db.prepare(`SELECT COUNT(*) as count FROM kb_articles WHERE category_id IN (${placeholders})`).get(...allIds).count;

    if (totalArticles > 0) {
      // Return info so frontend can offer migration
      return { success: false, error: 'has_articles', articleCount: totalArticles, childCount: children.length, categoryName: cat.name };
    }

    // Safe to delete — no articles in category or any subcategory
    const txn = db.transaction(() => {
      // Delete children first
      if (children.length > 0) {
        db.prepare(`DELETE FROM kb_categories WHERE parent_id = ?`).run(id);
      }
      db.prepare('DELETE FROM kb_categories WHERE id = ?').run(id);
    });
    txn();

    logAuditEvent({ eventType: 'kb_category_deleted', targetType: 'kb_category', targetId: String(id), targetName: cat.name, newValue: children.length > 0 ? `+${children.length} subcategories` : null, performedBy, performerName });
    return { success: true };
  } catch (err) {
    console.error('[kbDeleteCategory] ERROR:', err);
    return { success: false, error: err.message };
  }
}

function kbDeleteCategoryWithMigration(id, targetCategoryId, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  try {
    const cat = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(id);
    if (!cat) return { success: false, error: 'Category not found' };
    if (targetCategoryId === id) return { success: false, error: 'Cannot migrate to the same category' };

    const target = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(targetCategoryId);
    if (!target) return { success: false, error: 'Target category not found' };

    const children = db.prepare('SELECT id FROM kb_categories WHERE parent_id = ?').all(id);
    const allIds = [id, ...children.map((c) => c.id)];
    const placeholders = allIds.map(() => '?').join(',');

    const txn = db.transaction(() => {
      // Move all articles from this category and its subcategories to target
      db.prepare(`UPDATE kb_articles SET category_id = ? WHERE category_id IN (${placeholders})`).run(targetCategoryId, ...allIds);
      // Delete subcategories
      if (children.length > 0) db.prepare('DELETE FROM kb_categories WHERE parent_id = ?').run(id);
      // Delete the category
      db.prepare('DELETE FROM kb_categories WHERE id = ?').run(id);
    });
    txn();

    const movedCount = db.prepare('SELECT changes() as c').get()?.c || 0;
    logAuditEvent({ eventType: 'kb_category_deleted', targetType: 'kb_category', targetId: String(id), targetName: cat.name, newValue: `Articles migrated to ${target.name}`, performedBy, performerName });
    return { success: true };
  } catch (err) {
    console.error('[kbDeleteCategoryWithMigration] ERROR:', err);
    return { success: false, error: err.message };
  }
}

function kbReorderCategories(orderedIds, performedBy) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const stmt = db.prepare('UPDATE kb_categories SET sort_order = ? WHERE id = ?');
  const txn = db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) stmt.run(i, orderedIds[i]);
  });
  txn();
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — ARTICLE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

function kbGetArticles({ categoryId, status, difficulty, search } = {}) {
  let query = 'SELECT a.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon FROM kb_articles a LEFT JOIN kb_categories c ON a.category_id = c.id WHERE 1=1';
  const params = [];

  if (categoryId) { query += ' AND a.category_id = ?'; params.push(categoryId); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (difficulty) { query += ' AND a.difficulty = ?'; params.push(difficulty); }
  if (search) {
    query += ' AND (a.title LIKE ? OR a.body LIKE ? OR a.tags LIKE ? OR c.name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ' ORDER BY a.is_pinned DESC, a.updated_at DESC';
  return db.prepare(query).all(...params);
}

function kbGetArticle(id) {
  const article = db.prepare('SELECT a.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon FROM kb_articles a LEFT JOIN kb_categories c ON a.category_id = c.id WHERE a.id = ?').get(id);
  return article || null;
}

function kbSearchArticles(query) {
  if (!query || query.length < 2) return [];
  const s = `%${query}%`;
  return db.prepare(`
    SELECT a.*, c.name as category_name, c.slug as category_slug
    FROM kb_articles a
    LEFT JOIN kb_categories c ON a.category_id = c.id
    WHERE a.status = 'published' AND (a.title LIKE ? OR a.body LIKE ? OR a.tags LIKE ? OR c.name LIKE ?)
    ORDER BY a.is_pinned DESC, a.updated_at DESC
    LIMIT 20
  `).all(s, s, s, s);
}

function kbCreateArticle(data, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const now = new Date().toISOString();
  const slug = (data.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `article-${Date.now()}`;

  // Ensure unique slug
  let finalSlug = slug;
  let counter = 1;
  while (db.prepare('SELECT id FROM kb_articles WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${slug}-${counter++}`;
  }

  const info = db.prepare(`
    INSERT INTO kb_articles (title, slug, body, excerpt, category_id, tags, difficulty, status, is_pinned, view_count, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `).run(data.title, finalSlug, data.body || '', data.excerpt || '', data.category_id || null, data.tags || '', data.difficulty || 'beginner', data.status || 'draft', data.is_pinned ? 1 : 0, performedBy, performedBy, now, now);

  // Save history
  db.prepare('INSERT INTO kb_article_history (article_id, title, body, edited_by) VALUES (?, ?, ?, ?)').run(info.lastInsertRowid, data.title, data.body || '', performedBy);

  logAuditEvent({ eventType: 'kb_article_created', targetType: 'kb_article', targetId: String(info.lastInsertRowid), targetName: data.title, newValue: data.status || 'draft', performedBy, performerName });

  return { success: true, id: info.lastInsertRowid, article: kbGetArticleRaw(info.lastInsertRowid) };
}

function kbGetArticleRaw(id) {
  return db.prepare('SELECT a.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon FROM kb_articles a LEFT JOIN kb_categories c ON a.category_id = c.id WHERE a.id = ?').get(id) || null;
}

function kbUpdateArticle(id, data, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const article = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(id);
  if (!article) return { success: false, error: 'Article not found' };

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE kb_articles SET title = ?, body = ?, excerpt = ?, category_id = ?, tags = ?, difficulty = ?, status = ?, is_pinned = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).run(data.title || article.title, data.body || article.body, data.excerpt || article.excerpt, data.category_id ?? article.category_id, data.tags ?? article.tags, data.difficulty || article.difficulty, data.status || article.status, data.is_pinned !== undefined ? (data.is_pinned ? 1 : 0) : article.is_pinned, performedBy, now, id);

  // Save history
  db.prepare('INSERT INTO kb_article_history (article_id, title, body, edited_by) VALUES (?, ?, ?, ?)').run(id, data.title || article.title, data.body || article.body, performedBy);

  logAuditEvent({ eventType: 'kb_article_updated', targetType: 'kb_article', targetId: String(id), targetName: data.title || article.title, performedBy, performerName });

  return { success: true, article: kbGetArticleRaw(id) };
}

function kbDeleteArticle(id, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const article = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(id);
  if (!article) return { success: false, error: 'Article not found' };

  db.prepare('DELETE FROM kb_articles WHERE id = ?').run(id);
  logAuditEvent({ eventType: 'kb_article_deleted', targetType: 'kb_article', targetId: String(id), targetName: article.title, performedBy, performerName });
  return { success: true };
}

function kbTogglePin(id, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const article = db.prepare('SELECT id, title, is_pinned FROM kb_articles WHERE id = ?').get(id);
  if (!article) return { success: false, error: 'Article not found' };

  const newVal = article.is_pinned ? 0 : 1;
  db.prepare('UPDATE kb_articles SET is_pinned = ? WHERE id = ?').run(newVal, id);
  logAuditEvent({ eventType: 'kb_article_updated', targetType: 'kb_article', targetId: String(id), targetName: article.title, oldValue: article.is_pinned ? 'pinned' : 'unpinned', newValue: newVal ? 'pinned' : 'unpinned', performedBy, performerName });
  return { success: true, is_pinned: newVal };
}

function kbPublishArticle(id, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const article = db.prepare('SELECT id, title, status FROM kb_articles WHERE id = ?').get(id);
  if (!article) return { success: false, error: 'Article not found' };

  db.prepare("UPDATE kb_articles SET status = 'published', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  logAuditEvent({ eventType: 'kb_article_updated', targetType: 'kb_article', targetId: String(id), targetName: article.title, oldValue: article.status, newValue: 'published', performedBy, performerName });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

function kbSubmitFeedback(articleId, agentId, isHelpful, comment, agentName) {
  if (!agentId) return { success: false, error: 'Authentication required' };
  const article = db.prepare('SELECT id FROM kb_articles WHERE id = ?').get(articleId);
  if (!article) return { success: false, error: 'Article not found' };

  // Upsert: one feedback per agent per article
  const existing = db.prepare('SELECT id FROM kb_feedback WHERE article_id = ? AND agent_id = ?').get(articleId, agentId);
  if (existing) {
    // Reset is_cleared = 0 so updated votes appear as new notifications
    db.prepare('UPDATE kb_feedback SET is_helpful = ?, comment = ?, agent_name = ?, is_read = 0, is_cleared = 0, created_at = datetime(\'now\') WHERE id = ?').run(isHelpful ? 1 : 0, comment || null, agentName || null, existing.id);
  } else {
    // New feedback (is_cleared defaults to 0)
    db.prepare('INSERT INTO kb_feedback (article_id, agent_id, is_helpful, comment, agent_name, is_read) VALUES (?, ?, ?, ?, ?, 0)').run(articleId, agentId, isHelpful ? 1 : 0, comment || null, agentName || null);
  }
  return { success: true };
}

function kbGetArticleFeedback(articleId, performedBy) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  const feedback = db.prepare('SELECT * FROM kb_feedback WHERE article_id = ? ORDER BY created_at DESC').all(articleId);
  const helpful = feedback.filter((f) => f.is_helpful).length;
  const notHelpful = feedback.filter((f) => !f.is_helpful).length;
  return { success: true, feedback, helpful, notHelpful, total: feedback.length };
}

/**
 * Get the user's existing feedback for an article (to show their previous vote)
 */
function kbGetUserFeedback(articleId, agentId) {
  if (!agentId) return null;
  return db.prepare('SELECT is_helpful FROM kb_feedback WHERE article_id = ? AND agent_id = ?').get(articleId, agentId) || null;
}

/**
 * Create a KB issue report
 */
function kbCreateIssueReport(articleId, reportedBy, reporterName, issueType, description) {
  if (!reportedBy) return { success: false, error: 'Authentication required' };
  if (!issueType || !description) return { success: false, error: 'Issue type and description are required' };
  if (description.trim().length < 10) return { success: false, error: 'Description must be at least 10 characters' };

  const article = db.prepare('SELECT id, title FROM kb_articles WHERE id = ?').get(articleId);
  if (!article) return { success: false, error: 'Article not found' };

  // Let created_at default to CURRENT_TIMESTAMP for consistent SQLite format (YYYY-MM-DD HH:MM:SS)
  const stmt = db.prepare(`
    INSERT INTO kb_issue_reports (article_id, reported_by, reporter_name, issue_type, description, is_resolved, is_read)
    VALUES (?, ?, ?, ?, ?, 0, 0)
  `);
  const result = stmt.run(articleId, reportedBy, reporterName || null, issueType, description.trim());

  return { success: true, id: result.lastInsertRowid };
}

/**
 * Get recent KB feedback and issue reports for the notification panel.
 * Filters out cleared notifications using is_cleared flag.
 */
function kbGetNotifications(userId, limit = 20) {
  // Get recent feedback with article info (exclude cleared)
  const feedback = db.prepare(`
    SELECT f.id, f.article_id, f.agent_id, f.agent_name, f.is_helpful, f.is_read, f.created_at,
           a.title as article_title, 'feedback' as type
    FROM kb_feedback f
    JOIN kb_articles a ON f.article_id = a.id
    WHERE COALESCE(f.is_cleared, 0) = 0
    ORDER BY f.created_at DESC
    LIMIT ?
  `).all(limit);

  // Get recent issue reports with article info (exclude cleared)
  const issues = db.prepare(`
    SELECT r.id, r.article_id, r.reported_by, r.reporter_name, r.issue_type, r.description,
           r.is_resolved, r.is_read, r.created_at, a.title as article_title, 'issue' as type
    FROM kb_issue_reports r
    JOIN kb_articles a ON r.article_id = a.id
    WHERE COALESCE(r.is_cleared, 0) = 0
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(limit);

  // Combine and sort by date
  const combined = [...feedback, ...issues].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  ).slice(0, limit);

  return combined;
}

/**
 * Get unread count for KB notifications (feedback + issue reports).
 * Excludes cleared notifications using is_cleared flag.
 */
function kbGetUnreadCount(userId) {
  const feedbackCount = db.prepare('SELECT COUNT(*) as count FROM kb_feedback WHERE is_read = 0 AND COALESCE(is_cleared, 0) = 0').get();
  const issueCount = db.prepare('SELECT COUNT(*) as count FROM kb_issue_reports WHERE is_read = 0 AND COALESCE(is_cleared, 0) = 0').get();

  return (feedbackCount?.count || 0) + (issueCount?.count || 0);
}

/**
 * Mark all KB notifications as read
 */
function kbMarkAllAsRead() {
  db.prepare('UPDATE kb_feedback SET is_read = 1 WHERE is_read = 0').run();
  db.prepare('UPDATE kb_issue_reports SET is_read = 1 WHERE is_read = 0').run();
  return { success: true };
}

/**
 * Clear all KB notifications by setting is_cleared = 1.
 * Cleared notifications will be hidden from view permanently.
 */
function kbClearAllNotifications(userId) {
  if (!userId) return { success: false, error: 'User ID required' };

  // Set is_cleared = 1 on ALL existing feedback and issue reports
  db.prepare('UPDATE kb_feedback SET is_cleared = 1, is_read = 1').run();
  db.prepare('UPDATE kb_issue_reports SET is_cleared = 1, is_read = 1').run();

  return { success: true };
}

/**
 * Mark a specific issue report as resolved and cleared
 */
function kbResolveIssueReport(issueId, performedBy) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  db.prepare('UPDATE kb_issue_reports SET is_resolved = 1, is_cleared = 1, is_read = 1 WHERE id = ?').run(issueId);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE — ARTICLE HISTORY & DUPLICATION & RECENT EDITS
// ═══════════════════════════════════════════════════════════════════════════

function kbGetArticleHistory(articleId) {
  return db.prepare(`
    SELECT h.*, u.display_name as editor_name
    FROM kb_article_history h
    LEFT JOIN users u ON h.edited_by = u.id
    WHERE h.article_id = ?
    ORDER BY h.edited_at DESC
  `).all(articleId);
}

function kbDuplicateArticle(articleId, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  try {
    const article = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(articleId);
    if (!article) return { success: false, error: 'Article not found' };

    const newTitle = `Copy of ${article.title}`;
    const baseSlug = `copy-${article.slug}`;
    let slug = baseSlug;
    let counter = 1;
    while (db.prepare('SELECT id FROM kb_articles WHERE slug = ?').get(slug)) { slug = `${baseSlug}-${counter++}`; }

    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO kb_articles (title, slug, body, excerpt, category_id, tags, difficulty, status, is_pinned, view_count, created_by, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 0, 0, ?, ?, ?, ?)
    `).run(newTitle, slug, article.body, article.excerpt, article.category_id, article.tags, article.difficulty, performedBy, performedBy, now, now);

    db.prepare('INSERT INTO kb_article_history (article_id, title, body, edited_by) VALUES (?, ?, ?, ?)').run(info.lastInsertRowid, newTitle, article.body, performedBy);
    logAuditEvent({ eventType: 'kb_article_created', targetType: 'kb_article', targetId: String(info.lastInsertRowid), targetName: newTitle, newValue: 'duplicated from ' + article.title, performedBy, performerName });

    return { success: true, id: info.lastInsertRowid, article: kbGetArticleRaw(info.lastInsertRowid) };
  } catch (err) {
    console.error('[kbDuplicateArticle] ERROR:', err);
    return { success: false, error: err.message };
  }
}

function kbGetRecentEdits(userId, limit = 5) {
  if (!userId) return [];
  return db.prepare(`
    SELECT h.article_id, h.edited_at, a.title, a.status, c.name as category_name
    FROM kb_article_history h
    JOIN kb_articles a ON h.article_id = a.id
    LEFT JOIN kb_categories c ON a.category_id = c.id
    WHERE h.edited_by = ?
    GROUP BY h.article_id
    ORDER BY MAX(h.edited_at) DESC
    LIMIT ?
  `).all(userId, limit);
}

function kbBulkUpdateStatus(articleIds, status, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  if (!articleIds || articleIds.length === 0) return { success: false, error: 'No articles specified' };
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE kb_articles SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?');
    const txn = db.transaction(() => { for (const id of articleIds) stmt.run(status, performedBy, now, id); });
    txn();
    logAuditEvent({ eventType: 'kb_article_updated', targetType: 'kb_article', newValue: `Bulk ${status}: ${articleIds.length} articles`, performedBy, performerName });
    return { success: true, count: articleIds.length };
  } catch (err) { return { success: false, error: err.message }; }
}

function kbBulkMoveCategory(articleIds, categoryId, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  if (!articleIds || articleIds.length === 0) return { success: false, error: 'No articles specified' };
  try {
    const now = new Date().toISOString();
    const cat = db.prepare('SELECT name FROM kb_categories WHERE id = ?').get(categoryId);
    const stmt = db.prepare('UPDATE kb_articles SET category_id = ?, updated_by = ?, updated_at = ? WHERE id = ?');
    const txn = db.transaction(() => { for (const id of articleIds) stmt.run(categoryId, performedBy, now, id); });
    txn();
    logAuditEvent({ eventType: 'kb_article_updated', targetType: 'kb_article', newValue: `Bulk moved ${articleIds.length} articles to ${cat?.name || categoryId}`, performedBy, performerName });
    return { success: true, count: articleIds.length };
  } catch (err) { return { success: false, error: err.message }; }
}

function kbBulkDelete(articleIds, performedBy, performerName) {
  if (!isAdmin(performedBy)) return { success: false, error: 'Unauthorized' };
  if (!articleIds || articleIds.length === 0) return { success: false, error: 'No articles specified' };
  try {
    const stmt = db.prepare('DELETE FROM kb_articles WHERE id = ?');
    const txn = db.transaction(() => { for (const id of articleIds) stmt.run(id); });
    txn();
    logAuditEvent({ eventType: 'kb_article_deleted', targetType: 'kb_article', newValue: `Bulk deleted ${articleIds.length} articles`, performedBy, performerName });
    return { success: true, count: articleIds.length };
  } catch (err) { return { success: false, error: err.message }; }
}

// ═══════════════════════════════════════════════════════════════════════════
// END USERS (REPORTERS) OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all end users with optional inactive filter.
 * Returns incident_count for each user.
 */
function getAllEndUsers(options = {}) {
  const { includeInactive = false } = options;
  const whereClause = includeInactive ? '' : 'WHERE eu.is_active = 1';

  return db.prepare(`
    SELECT
      eu.*,
      (SELECT COUNT(*) FROM incidents i WHERE i.reported_by = eu.id) as incident_count
    FROM end_users eu
    ${whereClause}
    ORDER BY eu.full_name ASC
  `).all();
}

/**
 * Get single end user by ID with incident_count.
 */
function getEndUserById(id) {
  return db.prepare(`
    SELECT
      eu.*,
      (SELECT COUNT(*) FROM incidents i WHERE i.reported_by = eu.id) as incident_count
    FROM end_users eu
    WHERE eu.id = ?
  `).get(id) || null;
}

/**
 * Search end users by name, email, department, employee_id, or location.
 * Returns active users only, limited to 50 results.
 */
function searchEndUsers(query) {
  if (!query || typeof query !== 'string') return [];
  const searchTerm = `%${query.toLowerCase()}%`;

  return db.prepare(`
    SELECT
      eu.*,
      (SELECT COUNT(*) FROM incidents i WHERE i.reported_by = eu.id) as incident_count
    FROM end_users eu
    WHERE eu.is_active = 1
    AND (
      LOWER(eu.full_name) LIKE ?
      OR LOWER(eu.email) LIKE ?
      OR LOWER(eu.department) LIKE ?
      OR LOWER(eu.employee_id) LIKE ?
      OR LOWER(eu.location) LIKE ?
    )
    ORDER BY eu.full_name ASC
    LIMIT 50
  `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
}

/**
 * Create a new end user (reporter).
 * Generates EU-XXXX ID automatically.
 */
function createEndUser(data, performedBy, performerName) {
  if (!data.full_name || typeof data.full_name !== 'string' || data.full_name.trim() === '') {
    return { success: false, error: 'Full name is required' };
  }

  if (!data.department || typeof data.department !== 'string' || data.department.trim() === '') {
    return { success: false, error: 'Department is required' };
  }

  // Check for duplicate email (if provided)
  if (data.email && data.email.trim()) {
    const existingEmail = db.prepare('SELECT id FROM end_users WHERE LOWER(email) = LOWER(?)').get(data.email.trim());
    if (existingEmail) {
      return { success: false, error: 'Email already exists' };
    }
  }

  // Check for duplicate employee_id (if provided)
  if (data.employee_id && data.employee_id.trim()) {
    const existingEmployeeId = db.prepare('SELECT id FROM end_users WHERE LOWER(employee_id) = LOWER(?)').get(data.employee_id.trim());
    if (existingEmployeeId) {
      return { success: false, error: 'Employee ID already exists' };
    }
  }

  // Generate EU-XXXX ID
  const maxIdResult = db.prepare("SELECT id FROM end_users ORDER BY CAST(SUBSTR(id, 4) AS INTEGER) DESC LIMIT 1").get();
  const nextNum = maxIdResult ? parseInt(maxIdResult.id.split('-')[1], 10) + 1 : 1;
  const id = `EU-${String(nextNum).padStart(4, '0')}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO end_users (id, full_name, email, phone, department, location, employee_id, notes, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      data.full_name.trim(),
      data.email || null,
      data.phone || null,
      data.department || null,
      data.location || null,
      data.employee_id || null,
      data.notes || null,
      performedBy,
      now,
      now
    );

    logAuditEvent({
      eventType: 'end_user_created',
      targetType: 'end_user',
      targetId: id,
      targetName: data.full_name.trim(),
      newValue: JSON.stringify({ department: data.department, email: data.email }),
      performedBy,
      performerName,
    });

    return { success: true, data: getEndUserById(id) };
  } catch (err) {
    console.error('[createEndUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update an existing end user.
 */
function updateEndUser(id, updates, performedBy, performerName) {
  const existing = getEndUserById(id);
  if (!existing) {
    return { success: false, error: 'End user not found' };
  }

  const now = new Date().toISOString();
  const allowedFields = ['full_name', 'email', 'phone', 'department', 'location', 'employee_id', 'notes'];
  const fields = [];
  const values = [];
  const changes = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(updates[field] || null);
      if (existing[field] !== updates[field]) {
        changes.push(`${field}: ${existing[field] || '(empty)'} → ${updates[field] || '(empty)'}`);
      }
    }
  }

  if (fields.length === 0) {
    return { success: false, error: 'No valid fields to update' };
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  try {
    db.prepare(`UPDATE end_users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (changes.length > 0) {
      logAuditEvent({
        eventType: 'end_user_updated',
        targetType: 'end_user',
        targetId: id,
        targetName: updates.full_name || existing.full_name,
        oldValue: changes.join('; '),
        newValue: JSON.stringify(updates),
        performedBy,
        performerName,
      });
    }

    return { success: true, data: getEndUserById(id) };
  } catch (err) {
    console.error('[updateEndUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Soft delete: Set is_active = 0.
 * User still appears on historical incidents.
 */
function deactivateEndUser(id, performedBy, performerName) {
  const existing = getEndUserById(id);
  if (!existing) {
    return { success: false, error: 'End user not found' };
  }

  if (!existing.is_active) {
    return { success: false, error: 'End user is already deactivated' };
  }

  const now = new Date().toISOString();

  try {
    db.prepare('UPDATE end_users SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id);

    logAuditEvent({
      eventType: 'end_user_deactivated',
      targetType: 'end_user',
      targetId: id,
      targetName: existing.full_name,
      oldValue: 'active',
      newValue: 'deactivated',
      performedBy,
      performerName,
    });

    return { success: true, data: getEndUserById(id) };
  } catch (err) {
    console.error('[deactivateEndUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reactivate a deactivated end user.
 */
function reactivateEndUser(id, performedBy, performerName) {
  const existing = getEndUserById(id);
  if (!existing) {
    return { success: false, error: 'End user not found' };
  }

  if (existing.is_active) {
    return { success: false, error: 'End user is already active' };
  }

  const now = new Date().toISOString();

  try {
    db.prepare('UPDATE end_users SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);

    logAuditEvent({
      eventType: 'end_user_reactivated',
      targetType: 'end_user',
      targetId: id,
      targetName: existing.full_name,
      oldValue: 'deactivated',
      newValue: 'active',
      performedBy,
      performerName,
    });

    return { success: true, data: getEndUserById(id) };
  } catch (err) {
    console.error('[reactivateEndUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Hard delete an end user.
 * Only allowed if they have no linked incidents.
 */
function deleteEndUser(id, performedBy, performerName) {
  const existing = getEndUserById(id);
  if (!existing) {
    return { success: false, error: 'End user not found' };
  }

  const incidentCount = getEndUserIncidentCount(id);
  if (incidentCount > 0) {
    return { success: false, reason: 'HAS_INCIDENTS', count: incidentCount, error: `Cannot delete: ${incidentCount} linked incident(s)` };
  }

  try {
    db.prepare('DELETE FROM end_users WHERE id = ?').run(id);

    logAuditEvent({
      eventType: 'end_user_deleted',
      targetType: 'end_user',
      targetId: id,
      targetName: existing.full_name,
      oldValue: JSON.stringify({ department: existing.department, email: existing.email }),
      performedBy,
      performerName,
    });

    return { success: true };
  } catch (err) {
    console.error('[deleteEndUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get count of incidents reported by an end user.
 */
function getEndUserIncidentCount(id) {
  const result = db.prepare('SELECT COUNT(*) as count FROM incidents WHERE reported_by = ?').get(id);
  return result ? result.count : 0;
}

/**
 * Get incidents linked to an end user (reported_by).
 * Returns basic incident data for display in the delete dialog.
 */
function getEndUserIncidents(id) {
  return db.prepare(`
    SELECT id, title, priority, status, created_at
    FROM incidents
    WHERE reported_by = ?
    ORDER BY created_at DESC
  `).all(id);
}

/**
 * Reassign all incidents from one end user to another (or unassign), then delete the end user.
 * newReporterId = null means unassign (set reported_by to NULL).
 * Requires admin privileges.
 */
function reassignAndDeleteEndUser(userId, newReporterId, performedBy, performerName) {
  if (!isAdmin(performedBy)) {
    return { success: false, error: 'Unauthorized — not admin' };
  }

  const existing = getEndUserById(userId);
  if (!existing) {
    return { success: false, error: 'End user not found' };
  }

  const incidentCount = getEndUserIncidentCount(userId);

  const txn = db.transaction(() => {
    // Reassign or unassign incidents
    db.prepare(
      'UPDATE incidents SET reported_by = ? WHERE reported_by = ?'
    ).run(newReporterId, userId);

    // Delete the end user
    db.prepare('DELETE FROM end_users WHERE id = ?').run(userId);

    // Audit log
    logAuditEvent({
      eventType: 'end_user_deleted_with_reassignment',
      targetType: 'end_user',
      targetId: userId,
      targetName: existing.full_name,
      oldValue: JSON.stringify({ department: existing.department, email: existing.email, incident_count: incidentCount }),
      newValue: newReporterId ? `reassigned to ${newReporterId}` : 'unassigned',
      performedBy,
      performerName,
    });

    return { success: true, reassignedCount: incidentCount };
  });

  try {
    return txn();
  } catch (err) {
    console.error('[reassignAndDeleteEndUser] ERROR:', err);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY DEPARTMENTS OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all company departments with optional inactive filter.
 * Returns end_user_count for each department.
 */
function getAllCompanyDepartments(includeInactive = false) {
  const whereClause = includeInactive ? '' : 'WHERE cd.is_active = 1';

  return db.prepare(`
    SELECT
      cd.*,
      COUNT(DISTINCT eu.id) as end_user_count,
      COUNT(DISTINCT i.id) as incident_count
    FROM company_departments cd
    LEFT JOIN end_users eu ON eu.department = cd.id AND eu.is_active = 1
    LEFT JOIN incidents i ON i.department = cd.id
      AND i.status NOT IN ('resolved', 'closed')
    ${whereClause}
    GROUP BY cd.id
    ORDER BY cd.sort_order ASC
  `).all();
}

/**
 * Get single company department by ID.
 */
function getCompanyDepartmentById(id) {
  return db.prepare(`
    SELECT
      cd.*,
      (SELECT COUNT(*) FROM end_users eu WHERE eu.department = cd.id AND eu.is_active = 1) as end_user_count,
      (SELECT COUNT(*) FROM incidents i WHERE i.department = cd.id) as total_incident_count
    FROM company_departments cd
    WHERE cd.id = ?
  `).get(id) || null;
}

/**
 * Create a new company department.
 * Auto-generates slug from name if id not provided.
 */
function createCompanyDepartment(data, performedBy, performerName) {
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    return { success: false, error: 'Department name is required' };
  }

  // Check for duplicate name (case-insensitive)
  const trimmedName = data.name.trim();
  const existingByName = db.prepare(
    'SELECT id FROM company_departments WHERE LOWER(name) = LOWER(?)'
  ).get(trimmedName);
  if (existingByName) {
    return { success: false, error: 'A department with this name already exists' };
  }

  // Auto-generate slug from name if not provided
  let slug = data.id;
  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    slug = data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
      .replace(/\s+/g, '-')           // Spaces to hyphens
      .replace(/-+/g, '-')            // Collapse multiple hyphens
      .replace(/^-|-$/g, '');         // Trim leading/trailing hyphens
  } else {
    slug = slug.toLowerCase().trim();
  }

  // Validate slug format
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { success: false, error: 'Could not generate valid department ID from name' };
  }

  // Check uniqueness - if exists, append a number
  let finalSlug = slug;
  let counter = 1;
  while (db.prepare('SELECT id FROM company_departments WHERE id = ?').get(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
    if (counter > 100) {
      return { success: false, error: 'Could not generate unique department ID' };
    }
  }

  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO company_departments (id, name, description, manager_name, sort_order, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      finalSlug,
      data.name.trim(),
      data.description || null,
      data.manager_name || null,
      data.sort_order ?? 0,
      performedBy,
      now,
      now
    );

    logAuditEvent({
      eventType: 'department_created',
      targetType: 'company_department',
      targetId: finalSlug,
      targetName: data.name.trim(),
      newValue: JSON.stringify({ id: finalSlug, name: data.name.trim(), description: data.description, sort_order: data.sort_order }),
      performedBy,
      performerName,
    });

    return { success: true, department: getCompanyDepartmentById(finalSlug) };
  } catch (err) {
    console.error('[createCompanyDepartment] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update an existing company department.
 */
function updateCompanyDepartment(id, updates, performedBy, performerName) {
  const existing = getCompanyDepartmentById(id);
  if (!existing) {
    return { success: false, error: 'Department not found' };
  }

  // Check for duplicate name if name is being changed (case-insensitive, exclude self)
  if (updates.name !== undefined && updates.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateName = db.prepare(
      'SELECT id FROM company_departments WHERE LOWER(name) = LOWER(?) AND id != ?'
    ).get(updates.name.trim(), id);
    if (duplicateName) {
      return { success: false, error: 'A department with this name already exists' };
    }
  }

  const now = new Date().toISOString();
  const changes = {};

  if (updates.name !== undefined && updates.name !== existing.name) {
    changes.name = updates.name;
  }
  if (updates.description !== undefined && updates.description !== existing.description) {
    changes.description = updates.description;
  }
  if (updates.manager_name !== undefined && updates.manager_name !== existing.manager_name) {
    changes.manager_name = updates.manager_name;
  }
  if (updates.sort_order !== undefined && updates.sort_order !== existing.sort_order) {
    changes.sort_order = updates.sort_order;
  }

  if (Object.keys(changes).length === 0) {
    return { success: true, department: existing };
  }

  try {
    db.prepare(`
      UPDATE company_departments
      SET name = ?, description = ?, manager_name = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      changes.name ?? existing.name,
      changes.description ?? existing.description,
      changes.manager_name ?? existing.manager_name,
      changes.sort_order ?? existing.sort_order,
      now,
      id
    );

    logAuditEvent({
      eventType: 'department_updated',
      targetType: 'company_department',
      targetId: id,
      targetName: changes.name ?? existing.name,
      oldValue: JSON.stringify({ name: existing.name, description: existing.description, sort_order: existing.sort_order }),
      newValue: JSON.stringify(changes),
      performedBy,
      performerName,
    });

    return { success: true, department: getCompanyDepartmentById(id) };
  } catch (err) {
    console.error('[updateCompanyDepartment] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reactivate a company department.
 */
function reactivateCompanyDepartment(id, performedBy, performerName) {
  const existing = getCompanyDepartmentById(id);
  if (!existing) {
    return { success: false, error: 'Department not found' };
  }

  if (existing.is_active) {
    return { success: true, department: existing };
  }

  const now = new Date().toISOString();

  try {
    db.prepare('UPDATE company_departments SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);

    logAuditEvent({
      eventType: 'department_reactivated',
      targetType: 'company_department',
      targetId: id,
      targetName: existing.name,
      oldValue: 'inactive',
      newValue: 'active',
      performedBy,
      performerName,
    });

    return { success: true, department: getCompanyDepartmentById(id) };
  } catch (err) {
    console.error('[reactivateCompanyDepartment] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a company department.
 * Blocked if active end users exist. Blocked if any incidents (open or closed) are linked.
 */
function deleteCompanyDepartment(id, performedBy, performerName) {
  const existing = getCompanyDepartmentById(id);
  if (!existing) {
    return { success: false, error: 'Department not found' };
  }

  // Check active end users
  const userCount = db.prepare(
    'SELECT COUNT(*) as count FROM end_users WHERE department = ? AND is_active = 1'
  ).get(id).count;

  if (userCount > 0) {
    return { success: false, reason: 'HAS_USERS', userCount };
  }

  // Check ALL incidents (open + closed)
  const incidentCount = db.prepare(
    'SELECT COUNT(*) as count FROM incidents WHERE department = ?'
  ).get(id).count;

  if (incidentCount > 0) {
    return { success: false, reason: 'HAS_INCIDENTS', incidentCount };
  }

  try {
    db.prepare('DELETE FROM company_departments WHERE id = ?').run(id);

    logAuditEvent({
      eventType: 'department_deleted',
      targetType: 'company_department',
      targetId: id,
      targetName: existing.name,
      oldValue: JSON.stringify({ name: existing.name, description: existing.description }),
      performedBy,
      performerName,
    });

    return { success: true };
  } catch (err) {
    console.error('[deleteCompanyDepartment] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reassign all incidents from one department to another, then delete the source department.
 * Runs in a transaction so both operations succeed or fail together.
 */
function reassignAndDeleteDepartment(fromId, toId, performedBy, performerName) {
  const fromDept = getCompanyDepartmentById(fromId);
  if (!fromDept) {
    return { success: false, error: 'Source department not found' };
  }
  const toDept = getCompanyDepartmentById(toId);
  if (!toDept) {
    return { success: false, error: 'Target department not found' };
  }

  try {
    const txn = db.transaction(() => {
      // Reassign all incidents to new department
      const reassigned = db.prepare(
        'UPDATE incidents SET department = ?, updated_at = CURRENT_TIMESTAMP WHERE department = ?'
      ).run(toId, fromId);

      // Log reassignment
      logAuditEvent({
        eventType: 'department_incidents_reassigned',
        targetType: 'company_department',
        targetId: fromId,
        targetName: fromDept.name,
        oldValue: JSON.stringify({ from: fromId, fromName: fromDept.name }),
        newValue: JSON.stringify({ to: toId, toName: toDept.name, count: reassigned.changes }),
        performedBy,
        performerName,
      });

      // Delete the department
      db.prepare('DELETE FROM company_departments WHERE id = ?').run(fromId);

      logAuditEvent({
        eventType: 'department_deleted',
        targetType: 'company_department',
        targetId: fromId,
        targetName: fromDept.name,
        oldValue: JSON.stringify({ name: fromDept.name, description: fromDept.description }),
        performedBy,
        performerName,
      });

      return { success: true, reassignedCount: reassigned.changes };
    });

    return txn();
  } catch (err) {
    console.error('[reassignAndDeleteDepartment] ERROR:', err);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INCIDENT ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all attachments for an incident.
 * Returns metadata without file data for listing (use getAttachmentData for actual file).
 */
function getAttachmentsByIncidentId(incidentId) {
  try {
    const attachments = db.prepare(`
      SELECT id, incident_id, filename, file_type, file_size, created_by, created_at
      FROM incident_attachments
      WHERE incident_id = ?
      ORDER BY created_at ASC
    `).all(incidentId);

    return attachments;
  } catch (err) {
    console.error('[getAttachmentsByIncidentId] ERROR:', err);
    return [];
  }
}

/**
 * Get full attachment data (including blob) for download/preview.
 */
function getAttachmentData(attachmentId) {
  try {
    const attachment = db.prepare(`
      SELECT id, incident_id, filename, file_type, file_size, file_data, created_by, created_at
      FROM incident_attachments
      WHERE id = ?
    `).get(attachmentId);

    if (!attachment) return null;

    // Convert BLOB to base64 data URL
    if (attachment.file_data) {
      const base64 = attachment.file_data.toString('base64');
      const mimeType = attachment.file_type || 'application/octet-stream';
      attachment.dataUrl = `data:${mimeType};base64,${base64}`;
      delete attachment.file_data; // Don't send raw blob to renderer
    }

    return attachment;
  } catch (err) {
    console.error('[getAttachmentData] ERROR:', err);
    return null;
  }
}

/**
 * Save a single attachment.
 * @param {string} incidentId - The incident ID
 * @param {Object} attachment - { filename, fileType, fileSize, dataUrl, createdBy }
 */
function saveAttachment(incidentId, attachment, performedBy, performerName) {
  try {
    const { filename, fileType, fileSize, dataUrl, createdBy } = attachment;

    // Extract base64 data from data URL
    const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!base64Match) {
      return { success: false, error: 'Invalid data URL format' };
    }
    const base64Data = base64Match[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const result = db.prepare(`
      INSERT INTO incident_attachments (incident_id, filename, file_type, file_size, file_data, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(incidentId, filename, fileType, fileSize, buffer, createdBy || performedBy);

    logAuditEvent({
      eventType: 'attachment_added',
      targetType: 'incident',
      targetId: incidentId,
      targetName: filename,
      newValue: JSON.stringify({ filename, fileType, fileSize }),
      performedBy,
      performerName,
    });

    return { success: true, attachmentId: result.lastInsertRowid };
  } catch (err) {
    console.error('[saveAttachment] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Bulk save attachments for an incident.
 * @param {string} incidentId - The incident ID
 * @param {Array} attachments - Array of { filename, fileType, fileSize, dataUrl }
 */
function saveAttachments(incidentId, attachments, performedBy, performerName) {
  if (!attachments || attachments.length === 0) {
    return { success: true, saved: 0 };
  }

  try {
    const insertStmt = db.prepare(`
      INSERT INTO incident_attachments (incident_id, filename, file_type, file_size, file_data, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const txn = db.transaction((items) => {
      let saved = 0;
      for (const att of items) {
        const { filename, fileType, fileSize, dataUrl } = att;

        // Extract base64 data from data URL
        const base64Match = dataUrl?.match(/^data:[^;]+;base64,(.+)$/);
        if (!base64Match) {
          console.warn(`[saveAttachments] Skipping ${filename}: Invalid data URL format`);
          continue;
        }
        const base64Data = base64Match[1];
        const buffer = Buffer.from(base64Data, 'base64');

        insertStmt.run(incidentId, filename, fileType, fileSize, buffer, performedBy);
        saved++;
      }
      return saved;
    });

    const saved = txn(attachments);

    if (saved > 0) {
      logAuditEvent({
        eventType: 'attachments_added',
        targetType: 'incident',
        targetId: incidentId,
        newValue: `${saved} attachment(s) added`,
        performedBy,
        performerName,
      });
    }

    return { success: true, saved };
  } catch (err) {
    console.error('[saveAttachments] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a single attachment by ID.
 */
function deleteAttachment(attachmentId, performedBy, performerName) {
  try {
    // Get attachment info before deleting for audit log
    const attachment = db.prepare('SELECT incident_id, filename FROM incident_attachments WHERE id = ?').get(attachmentId);
    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    db.prepare('DELETE FROM incident_attachments WHERE id = ?').run(attachmentId);

    logAuditEvent({
      eventType: 'attachment_deleted',
      targetType: 'incident',
      targetId: attachment.incident_id,
      targetName: attachment.filename,
      oldValue: attachment.filename,
      performedBy,
      performerName,
    });

    return { success: true };
  } catch (err) {
    console.error('[deleteAttachment] ERROR:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete all attachments for an incident.
 */
function deleteAttachmentsByIncidentId(incidentId) {
  try {
    const result = db.prepare('DELETE FROM incident_attachments WHERE incident_id = ?').run(incidentId);
    return { success: true, deleted: result.changes };
  } catch (err) {
    console.error('[deleteAttachmentsByIncidentId] ERROR:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  initializeDatabase,
  closeDatabase,
  getAllIncidents,
  getIncidentById,
  createIncident,
  updateIncident,
  deleteIncident,
  getIncidentHistory,
  getIncidentComments,
  addIncidentComment,
  getUserPreferences,
  updateUserPreferences,
  getAllUsers,
  getUserByUsername,
  authenticateUser,
  registerUser,
  updateUserStatus,
  updateUserRole,
  updateUserDepartment,
  updateUserProfile,
  deleteUser,
  getPendingUsers,
  getAllDepartments,
  getDepartmentLoad,
  getMetrics,
  getStatusDistribution,
  getPriorityBreakdown,
  getRecentResolutions,
  getReportStats,
  // Audit log
  logAuditEvent,
  getAuditLog,
  getAuditLogCount,
  // Backup & restore
  createBackup,
  restoreBackup,
  listBackups,
  deleteBackup,
  exportToJson,
  exportAuditLog,
  getDatabaseInfo,
  isAdmin,
  isOwner,
  getUserRole,
  canWrite,
  getLinkedTickets,
  reassignAndDeleteUser,
  reassignAndDeactivateUser,
  recoverUsername,
  resetPassword,
  changeUserPassword,
  deleteAuditLogEntries,
  deleteAllAuditLogs,
  // Knowledge Base
  kbGetCategories,
  kbCreateCategory,
  kbUpdateCategory,
  kbDeleteCategory,
  kbDeleteCategoryWithMigration,
  kbReorderCategories,
  kbGetArticles,
  kbGetArticle,
  kbSearchArticles,
  kbCreateArticle,
  kbUpdateArticle,
  kbDeleteArticle,
  kbTogglePin,
  kbPublishArticle,
  kbSubmitFeedback,
  kbGetArticleFeedback,
  kbGetUserFeedback,
  kbCreateIssueReport,
  kbGetNotifications,
  kbGetUnreadCount,
  kbMarkAllAsRead,
  kbClearAllNotifications,
  kbResolveIssueReport,
  kbGetArticleHistory,
  kbDuplicateArticle,
  kbGetRecentEdits,
  kbBulkUpdateStatus,
  kbBulkMoveCategory,
  kbBulkDelete,
  // End Users (Reporters)
  getAllEndUsers,
  getEndUserById,
  searchEndUsers,
  createEndUser,
  updateEndUser,
  deactivateEndUser,
  reactivateEndUser,
  deleteEndUser,
  getEndUserIncidentCount,
  getEndUserIncidents,
  reassignAndDeleteEndUser,
  // Company Departments
  getAllCompanyDepartments,
  getCompanyDepartmentById,
  createCompanyDepartment,
  updateCompanyDepartment,
  reactivateCompanyDepartment,
  deleteCompanyDepartment,
  reassignAndDeleteDepartment,
  // Incident Attachments
  getAttachmentsByIncidentId,
  getAttachmentData,
  saveAttachment,
  saveAttachments,
  deleteAttachment,
  deleteAttachmentsByIncidentId,
};

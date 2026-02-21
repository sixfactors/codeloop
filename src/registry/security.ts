/**
 * Security validator for skill files.
 * Checks for dangerous patterns that could compromise the user's system.
 */

export interface SecurityFinding {
  pattern: string;
  message: string;
  line: number;
  severity: 'block' | 'warn';
}

export interface SecurityResult {
  passed: boolean;
  findings: SecurityFinding[];
}

/**
 * Patterns that BLOCK skill installation (hard gates).
 */
const BLOCKED_PATTERNS: Array<{ regex: RegExp; message: string }> = [
  // Arbitrary code execution
  { regex: /\bexec\s*\(/, message: 'Arbitrary code execution via exec()' },
  { regex: /\bspawn\s*\(/, message: 'Arbitrary code execution via spawn()' },
  { regex: /\beval\s*\(/, message: 'Arbitrary code execution via eval()' },
  { regex: /\bnew\s+Function\s*\(/, message: 'Arbitrary code execution via Function constructor' },

  // Remote code injection
  { regex: /curl\s+.*\|\s*sh/, message: 'Pipe-to-shell attack (curl | sh)' },
  { regex: /curl\s+.*\|\s*bash/, message: 'Pipe-to-shell attack (curl | bash)' },
  { regex: /wget\s+.*\|\s*sh/, message: 'Pipe-to-shell attack (wget | sh)' },
  { regex: /wget\s+.*\|\s*bash/, message: 'Pipe-to-shell attack (wget | bash)' },

  // Destructive system operations
  { regex: /rm\s+-rf\s+\//, message: 'Destructive system operation (rm -rf /)' },
  { regex: /rm\s+-rf\s+~/, message: 'Destructive operation on home directory' },
  { regex: /\bchmod\s+777/, message: 'Insecure permission change (chmod 777)' },

  // Credential access
  { regex: /~\/\.ssh/, message: 'SSH credential access' },
  { regex: /~\/\.aws/, message: 'AWS credential access' },
  { regex: /~\/\.config\/gcloud/, message: 'GCloud credential access' },
  { regex: /~\/\.npmrc/, message: 'npm credential access' },

  // Environment leakage (reading env vars beyond project)
  { regex: /process\.env\.(AWS_|GITHUB_TOKEN|NPM_TOKEN|SECRET)/, message: 'Sensitive environment variable access' },

  // Directory traversal
  { regex: /\.\.\/(\.\.\/){2,}/, message: 'Deep directory traversal (potential escape)' },
];

/**
 * Patterns that produce warnings (non-blocking).
 */
const WARNING_PATTERNS: Array<{ regex: RegExp; message: string }> = [
  { regex: /process\.env\./, message: 'Environment variable access (verify scope is project-local)' },
  { regex: /\bfetch\s*\(/, message: 'Network request (verify URL is safe)' },
  { regex: /https?:\/\/[^\s"'`]+\.(sh|py|js|ts)\b/, message: 'URL to executable script' },
];

/**
 * Size limits for skill files.
 */
const MAX_FILE_SIZE = 50 * 1024;   // 50KB per file
const MAX_TOTAL_SIZE = 200 * 1024; // 200KB total

/**
 * Validate a skill file's content for security issues.
 */
export function validateSecurity(content: string, filename?: string): SecurityResult {
  const findings: SecurityFinding[] = [];
  const lines = content.split('\n');

  // Size check
  if (content.length > MAX_FILE_SIZE) {
    findings.push({
      pattern: 'size',
      message: `File exceeds ${MAX_FILE_SIZE / 1024}KB limit (${Math.round(content.length / 1024)}KB)`,
      line: 0,
      severity: 'block',
    });
  }

  // Pattern checks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip markdown code fence labels (```bash, ```yaml, etc.)
    // but DO check content inside code blocks
    if (/^```\w*$/.test(line.trim())) continue;

    for (const { regex, message } of BLOCKED_PATTERNS) {
      if (regex.test(line)) {
        findings.push({ pattern: regex.source, message, line: i + 1, severity: 'block' });
      }
    }

    for (const { regex, message } of WARNING_PATTERNS) {
      if (regex.test(line)) {
        findings.push({ pattern: regex.source, message, line: i + 1, severity: 'warn' });
      }
    }
  }

  const blocked = findings.some(f => f.severity === 'block');

  return {
    passed: !blocked,
    findings,
  };
}

/**
 * Validate a collection of skill files for total size.
 */
export function validateTotalSize(files: Array<{ name: string; content: string }>): SecurityFinding | null {
  const totalSize = files.reduce((sum, f) => sum + f.content.length, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return {
      pattern: 'total_size',
      message: `Total size exceeds ${MAX_TOTAL_SIZE / 1024}KB limit (${Math.round(totalSize / 1024)}KB)`,
      line: 0,
      severity: 'block',
    };
  }
  return null;
}

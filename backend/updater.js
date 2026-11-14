const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PKG_PATH = path.join(__dirname, '..', 'package.json');

function readPkg() {
  try {
    return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  } catch {
    return { version: '1.0.0' };
  }
}

function parseSemver(v) {
  const clean = String(v || '0.0.0').trim().replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

function isNewerVersion(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function pickInstallerAsset(assets = []) {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  if (process.platform === 'win32') {
    return (
      assets.find((a) => /\.exe$/i.test(a.name) && /setup|installer|win/i.test(a.name)) ||
      assets.find((a) => /\.exe$/i.test(a.name)) ||
      assets.find((a) => /\.msi$/i.test(a.name)) ||
      null
    );
  }
  if (process.platform === 'darwin') {
    return (
      assets.find((a) => /\.dmg$/i.test(a.name)) ||
      assets.find((a) => /\.pkg$/i.test(a.name)) ||
      assets.find((a) => /\.zip$/i.test(a.name) && /mac|darwin|osx/i.test(a.name)) ||
      null
    );
  }
  return assets.find((a) => /\.(AppImage|deb|tar\.gz)$/i.test(a.name)) || null;
}

class AppUpdater {
  constructor() {
    const pkg = readPkg();
    this.currentVersion = pkg.version || '1.0.0';
    this.repo =
      process.env.SONA_GITHUB_REPO ||
      pkg.sona?.githubRepo ||
      (typeof pkg.repository === 'string'
        ? pkg.repository.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '')
        : pkg.repository?.url?.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '')) ||
      '';
    this.checking = false;
    this.installing = false;
    this.updateAvailable = false;
    this.latestVersion = null;
    this.releaseName = null;
    this.releaseNotes = '';
    this.releaseUrl = null;
    this.assetName = null;
    this.assetUrl = null;
    this.downloadedPath = null;
    this.checkedAt = 0;
    this.error = null;
  }

  getStatus() {
    return {
      currentVersion: this.currentVersion,
      repo: this.repo,
      configured: Boolean(this.repo && !this.repo.startsWith('OWNER/')),
      checking: this.checking,
      installing: this.installing,
      updateAvailable: this.updateAvailable,
      latestVersion: this.latestVersion,
      releaseName: this.releaseName,
      releaseNotes: this.releaseNotes,
      releaseUrl: this.releaseUrl,
      assetName: this.assetName,
      assetUrl: this.assetUrl,
      downloadedPath: this.downloadedPath,
      checkedAt: this.checkedAt,
      error: this.error,
    };
  }

  async checkForUpdates() {
    if (this.checking) return this.getStatus();
    if (!this.repo || this.repo.startsWith('OWNER/')) {
      this.error = 'GitHub repository is not configured in package.json (sona.githubRepo).';
      return this.getStatus();
    }

    this.checking = true;
    this.error = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Sona/${this.currentVersion}`,
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.status === 404) {
        this.updateAvailable = false;
        this.latestVersion = this.currentVersion;
        this.checkedAt = Date.now();
        return this.getStatus();
      }
      if (!res.ok) {
        throw new Error(`GitHub API error (${res.status})`);
      }

      const rel = await res.json();
      const tag = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
      const asset = pickInstallerAsset(rel.assets || []);

      this.latestVersion = tag || this.currentVersion;
      this.releaseName = rel.name || `v${this.latestVersion}`;
      this.releaseNotes = rel.body || '';
      this.releaseUrl = rel.html_url || `https://github.com/${this.repo}/releases/latest`;
      this.assetName = asset?.name || null;
      this.assetUrl = asset?.browser_download_url || null;
      this.updateAvailable = Boolean(tag && isNewerVersion(tag, this.currentVersion));
      this.checkedAt = Date.now();
    } catch (err) {
      this.error = err?.message || 'Update check failed';
    } finally {
      this.checking = false;
    }
    return this.getStatus();
  }

  async downloadAndInstall() {
    if (!this.assetUrl) {
      return { ok: false, fallbackUrl: this.releaseUrl, status: this.getStatus() };
    }
    if (this.installing) {
      return { ok: true, launched: false, status: this.getStatus() };
    }

    this.installing = true;
    this.error = null;
    try {
      const res = await fetch(this.assetUrl, {
        headers: { 'User-Agent': `Sona/${this.currentVersion}` },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      const safeName = (this.assetName || 'Sona-Update').replace(/[^a-zA-Z0-9._-]/g, '_');
      const destPath = path.join(os.tmpdir(), safeName);
      fs.writeFileSync(destPath, buf);
      this.downloadedPath = destPath;

      if (process.platform === 'win32') {
        spawn(destPath, [], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'darwin') {
        spawn('open', [destPath], { detached: true, stdio: 'ignore' }).unref();
      }
      return { ok: true, launched: true, path: destPath, status: this.getStatus() };
    } catch (err) {
      this.error = err?.message || 'Installer download failed';
      return { ok: false, error: this.error, fallbackUrl: this.releaseUrl, status: this.getStatus() };
    } finally {
      this.installing = false;
    }
  }
}

module.exports = new AppUpdater();

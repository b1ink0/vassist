/**
 * @fileoverview Bootstrap script to download embedded Python runtime
 */

import https from "https";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import unzipper from "unzipper";
import { fileURLToPath } from "url";
import { dirname } from "path";
import type { IncomingMessage } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_DIR = process.env.GPTSOVITS_DATA_DIR || __dirname;

const IS_WINDOWS = process.platform === "win32";
const IS_MACOS = process.platform === "darwin";

type BootstrapOptions = {
  backend?: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

class PythonBootstrap {
  logCallback: (message: string) => void;
  backend: string;
  pythonDir: string;

  constructor(
    logCallback?: (message: string) => void,
    options: BootstrapOptions = {},
  ) {
    this.logCallback = logCallback || console.log;
    this.backend = (options.backend || "auto").toString().trim().toLowerCase();
    this.pythonDir =
      IS_WINDOWS && this.backend === "rocm"
        ? path.join(BASE_DIR, "python312")
        : path.join(BASE_DIR, "python");
  }

  log(message: string) {
    this.logCallback(message);
  }

  /**
   * Download file with progress
   */
  async downloadFile(url: string, destPath: string) {
    return new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      this.log(`[DOWNLOAD] Starting: ${path.basename(destPath)}`);
      this.log(`[DOWNLOAD] URL: ${url}`);

      https
        .get(url, (response: IncomingMessage) => {
          // Handle redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            file.close();
            fs.unlinkSync(destPath);
            const redirectLocation = response.headers.location;
            if (!redirectLocation) {
              reject(new Error("Redirect without location header"));
              return;
            }
            return this.downloadFile(redirectLocation, destPath)
              .then(resolve)
              .catch(reject);
          }

          if (response.statusCode !== 200) {
            file.close();
            fs.unlinkSync(destPath);
            return reject(new Error(`Download failed: ${response.statusCode}`));
          }

          const totalSize = parseInt(
            response.headers["content-length"] ?? "0",
            10,
          );
          let downloadedSize = 0;
          let lastPercent = 0;

          response.on("data", (chunk: Buffer) => {
            downloadedSize += chunk.length;
            const percent =
              totalSize > 0
                ? Math.floor((downloadedSize / totalSize) * 100)
                : 0;

            // Log every 10%
            if (percent >= lastPercent + 10) {
              this.log(
                `[DOWNLOAD] Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`,
              );
              lastPercent = percent;
            }
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close();
            this.log(`[DOWNLOAD] Complete: ${path.basename(destPath)}`);
            resolve();
          });
        })
        .on("error", (err: Error) => {
          file.close();
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
          reject(err);
        });

      file.on("error", (err: Error) => {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(err);
      });
    });
  }

  /**
   * Extract ZIP file
   */
  async extractZip(zipPath: string, extractPath: string) {
    this.log(`[EXTRACT] Extracting ${path.basename(zipPath)}...`);

    return new Promise<void>((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractPath }))
        .on("close", () => {
          this.log(`[EXTRACT] Complete`);
          resolve();
        })
        .on("error", reject);
    });
  }

  /**
   * Setup Python on Windows
   */
  async setupWindowsPython() {
    this.log("\n" + "=".repeat(60));
    this.log("[SETUP] Setting up Python runtime for Windows...");
    this.log("=".repeat(60));

    // Download embedded Python
    const pythonUrl =
      "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip";
    const zipPath = path.join(BASE_DIR, "python.zip");

    await this.downloadFile(pythonUrl, zipPath);
    await this.extractZip(zipPath, this.pythonDir);

    // Clean up zip
    fs.unlinkSync(zipPath);
    this.log("[SETUP] Python extracted");

    // Enable site-packages in embedded Python
    const pthFile = path.join(this.pythonDir, "python310._pth");
    if (fs.existsSync(pthFile)) {
      let content = fs.readFileSync(pthFile, "utf-8");
      // Uncomment site import line
      content = content.replace("#import site", "import site");
      // Add Scripts to path
      content += "\nScripts\n";
      fs.writeFileSync(pthFile, content);
      this.log("[SETUP] Configured Python paths");
    }

    // Download and install pip
    const getPipUrl = "https://bootstrap.pypa.io/get-pip.py";
    const getPipPath = path.join(this.pythonDir, "get-pip.py");

    await this.downloadFile(getPipUrl, getPipPath);

    // Run get-pip.py
    this.log("[SETUP] Installing pip...");
    const pythonExe = path.join(this.pythonDir, "python.exe");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonExe, [getPipPath], {
        cwd: this.pythonDir,
        stdio: "inherit",
      });

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          this.log("[SETUP] Pip installed");
          resolve();
        } else {
          reject(new Error(`Pip installation failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Setup Python on macOS (downloads standalone Python)
   */
  async setupMacOSPython() {
    this.log("\n" + "=".repeat(60));
    this.log("[SETUP] Setting up Python runtime for macOS...");
    this.log("=".repeat(60));

    // Download standalone Python build from python-build-standalone
    // This provides relocatable Python that doesn't need system installation
    const isARM = process.arch === "arm64";

    const pythonUrl = isARM
      ? "https://github.com/indygreg/python-build-standalone/releases/download/20231002/cpython-3.10.13+20231002-aarch64-apple-darwin-install_only.tar.gz"
      : "https://github.com/indygreg/python-build-standalone/releases/download/20231002/cpython-3.10.13+20231002-x86_64-apple-darwin-install_only.tar.gz";

    const tarPath = path.join(BASE_DIR, "python.tar.gz");

    this.log(
      `[SETUP] Downloading standalone Python for macOS (${isARM ? "ARM64" : "x86_64"})...`,
    );
    this.log("[INFO] ~50MB download, this may take a few minutes");

    await this.downloadFile(pythonUrl, tarPath);

    // Create python directory if it doesn't exist
    if (!fs.existsSync(this.pythonDir)) {
      fs.mkdirSync(this.pythonDir, { recursive: true });
    }

    // Extract using native tar command — strip top-level "python/" from the archive
    // The tarball contains python/bin, python/lib, etc.
    // --strip-components=1 removes the top 'python/' directory
    this.log("[SETUP] Extracting Python...");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "tar",
        ["-xzf", tarPath, "-C", this.pythonDir, "--strip-components=1"],
        {
          stdio: "inherit",
        },
      );

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar extraction failed with code ${code}`));
        }
      });

      proc.on("error", (err: Error) => {
        reject(new Error(`Failed to run tar: ${err.message}`));
      });
    });

    // Clean up tarball
    fs.unlinkSync(tarPath);
    this.log("[SETUP] Python extracted");

    // The standalone build already has pip, just verify it works
    this.log("[SETUP] Verifying pip...");
    const pythonExe = path.join(this.pythonDir, "bin", "python3");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        pythonExe,
        ["-m", "pip", "install", "--upgrade", "pip"],
        {
          stdio: "inherit",
        },
      );

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          this.log("[SETUP] Pip upgraded");
          resolve();
        } else {
          reject(new Error(`Pip upgrade failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Setup Python 3.12 embedded on Windows for ROCm backend.
   * AMD's ROCm wheels require Python 3.12 (cp312).
   */
  async setupWindows312Python() {
    this.log("\n" + "=".repeat(60));
    this.log("[SETUP] Setting up Python 3.12 runtime for Windows (ROCm)...");
    this.log("=".repeat(60));

    // Python 3.12.7 embeddable
    const pythonUrl =
      "https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip";
    const zipPath = path.join(BASE_DIR, "python312.zip");

    this.log("[SETUP] Downloading Python 3.12 embedded (~11 MB)...");
    await this.downloadFile(pythonUrl, zipPath);
    await this.extractZip(zipPath, this.pythonDir);
    fs.unlinkSync(zipPath);
    this.log("[SETUP] Python 3.12 extracted");

    // Enable site-packages in embedded Python
    const pthFile = path.join(this.pythonDir, "python312._pth");
    if (fs.existsSync(pthFile)) {
      let content = fs.readFileSync(pthFile, "utf-8");
      content = content.replace("#import site", "import site");
      content += "\nScripts\n";
      fs.writeFileSync(pthFile, content);
      this.log("[SETUP] Configured Python 3.12 paths");
    }

    // Download and install pip
    const getPipUrl = "https://bootstrap.pypa.io/get-pip.py";
    const getPipPath = path.join(this.pythonDir, "get-pip.py");

    await this.downloadFile(getPipUrl, getPipPath);

    this.log("[SETUP] Installing pip...");
    const pythonExe = path.join(this.pythonDir, "python.exe");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonExe, [getPipPath], {
        cwd: this.pythonDir,
        stdio: "inherit",
      });
      proc.on("close", (code: number | null) => {
        if (code === 0) {
          this.log("[SETUP] Pip installed");
          resolve();
        } else reject(new Error(`Pip installation failed with code ${code}`));
      });
    });
  }

  /**
   * Main bootstrap entry point
   */
  async run() {
    try {
      // Check if already set up
      if (fs.existsSync(this.pythonDir)) {
        this.log("[SETUP] Python runtime already exists");
        return;
      }

      // Create python directory
      fs.mkdirSync(this.pythonDir, { recursive: true });

      // Platform-specific setup
      if (IS_WINDOWS) {
        if (this.backend === "rocm") {
          await this.setupWindows312Python();
        } else {
          await this.setupWindowsPython();
        }
      } else if (IS_MACOS) {
        await this.setupMacOSPython();
      } else {
        throw new Error(`Unsupported platform: ${process.platform}`);
      }

      this.log("\n✓ Python runtime setup complete!");
    } catch (error) {
      this.log(`\n✗ Bootstrap failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }
}

export default PythonBootstrap;

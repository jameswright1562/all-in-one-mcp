export async function checkForUpdates(currentVersion: string): Promise<void> {
  try {
    const response = await fetch('https://registry.npmjs.org/all-in-one-mcp/latest', {
      method: 'GET',
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json() as { version: string };
    const latestVersion = data.version;

    if (latestVersion !== currentVersion) {
      process.stdout.write(`\n[Update Available] A new version of all-in-one-mcp is available: ${latestVersion}. Please run 'npm install -g all-in-one-mcp' to update.\n\n`);
    }
  } catch (error) {
    // Silently fail if update check fails to avoid disrupting the runtime
    if (process.env.DEBUG) {
      process.stderr.write(`Failed to check for updates: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}
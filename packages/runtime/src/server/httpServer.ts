async function startManagedMcpHttpServer(
  options: ManagedMcpHttpServerOptions = {},
): Promise<ManagedMcpHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4100;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  
  // Create runtime options
  const runtimeOptions: ManagedMcpRuntimeOptions = {};
  
  // Check for direct database injection
  if (options.database) {
    runtimeOptions.database = options.database;
  } 
  // Check for database config object
  else if (options.databaseConfig) {
    runtimeOptions.database = createDatabaseFromConfig(options.databaseConfig);
  }
  // Check for database path
  else if (options.databasePath) {
    runtimeOptions.databasePath = options.databasePath;
  }
  // Check for environment variables
  else {
    // Check for Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    if (supabaseUrl && supabaseKey) {
      runtimeOptions.database = new SupabaseStore(supabaseUrl, supabaseKey);
    }
    // Check for PostgreSQL configuration
    else if (process.env.DATABASE_URL) {
      runtimeOptions.database = new PostgresStore(process.env.DATABASE_URL);
    }
    // Default to SQLite
    else {
      runtimeOptions.databasePath = options.databasePath ?? 
        process.env.DB_PATH ?? 
        resolveDatabasePath();
    }
  }
  
  const runtime = createManagedMcpRuntime(runtimeOptions);
  await runtime.start();
  // ... rest of the function remains the same ...
}
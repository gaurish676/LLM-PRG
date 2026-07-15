export class ConfigurationService {
  private static settings: Record<string, any> = {
    schedulerThreshold: 0.7, // Confidence threshold (0.0 to 1.0)
    maxStackDepth: 1024,
    allowedExtensions: new Set(['.ts', '.js', '.tsx', '.jsx', '.json', '.py', '.cpp', '.h', '.hpp', '.c']),
    ignoredDirs: new Set(['node_modules', '.git', 'dist', '.lars'])
  };

  public static get<T>(key: string, defaultValue?: T): T {
    return (this.settings[key] !== undefined ? this.settings[key] : defaultValue) as T;
  }

  public static set(key: string, value: any): void {
    this.settings[key] = value;
  }
}

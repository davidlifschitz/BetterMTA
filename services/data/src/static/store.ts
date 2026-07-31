import type { StaticDataset } from "../types.js";

/**
 * In-memory static dataset store with rollback support.
 * Keeps previous active dataset when a new one activates.
 * Failed imports are recorded but never become active.
 */
export class StaticDatasetStore {
  private active: StaticDataset | null = null;
  private previous: StaticDataset | null = null;
  private readonly byVersion = new Map<string, StaticDataset>();
  private readonly failed: StaticDataset[] = [];

  getActive(): StaticDataset | null {
    return this.active;
  }

  getPrevious(): StaticDataset | null {
    return this.previous;
  }

  getByVersion(version: string): StaticDataset | null {
    return this.byVersion.get(version) ?? null;
  }

  listFailed(): readonly StaticDataset[] {
    return this.failed;
  }

  putPending(dataset: StaticDataset): void {
    const copy = { ...dataset, status: "pending" as const };
    this.byVersion.set(copy.staticDatasetVersion, copy);
  }

  recordFailed(dataset: StaticDataset): void {
    const copy = { ...dataset, status: "failed" as const };
    this.byVersion.set(copy.staticDatasetVersion, copy);
    this.failed.push(copy);
  }

  /**
   * Activate a pending (or known) dataset. Previous active becomes rollback target.
   * Refuses to activate status=failed.
   */
  activate(version: string, activatedAt: string): StaticDataset {
    const ds = this.byVersion.get(version);
    if (!ds) {
      throw new Error(`Unknown dataset version: ${version}`);
    }
    if (ds.status === "failed") {
      throw new Error(`Refusing to activate failed dataset: ${version}`);
    }

    if (this.active) {
      this.previous = {
        ...this.active,
        status: "rolled_back",
      };
      this.byVersion.set(
        this.previous.staticDatasetVersion,
        this.previous,
      );
    }

    const activated: StaticDataset = {
      ...ds,
      status: "active",
      activatedAt,
    };
    this.active = activated;
    this.byVersion.set(version, activated);
    return activated;
  }

  /**
   * Roll back to previous active dataset if one exists.
   * The currently active dataset becomes the new previous (rolled_back).
   */
  rollback(rolledBackAt: string): StaticDataset {
    if (!this.previous) {
      throw new Error("No previous dataset available for rollback");
    }

    const current = this.active;
    const restored: StaticDataset = {
      ...this.previous,
      status: "active",
      activatedAt: rolledBackAt,
    };

    this.active = restored;
    this.byVersion.set(restored.staticDatasetVersion, restored);

    if (current) {
      this.previous = { ...current, status: "rolled_back" };
      this.byVersion.set(current.staticDatasetVersion, this.previous);
    } else {
      this.previous = null;
    }

    return restored;
  }
}

/** Interests describe canonical entities, never another copy of their values. */
export type PublicationInterest = { scopeId: string; collection?: string; id?: string };
export type PublicationChange = Required<PublicationInterest>;
const keyFor = (interest: PublicationInterest) =>
  JSON.stringify([interest.scopeId, interest.collection ?? null, interest.id ?? null]);

/** Notifications describe publication, never a second copy of entity data. */
export class DataPublication {
  private depth = 0;
  private pending = new Set<() => void>();
  private listeners = new Set<() => void>();
  private scoped = new Set<{ interests: readonly PublicationInterest[]; notify: () => void }>();
  private forwards = new Set<(changes: readonly PublicationChange[] | undefined) => void>();
  private versions = new Map<string, number>();
  private interests = new Map<string, number>();
  private changes = new Map<string, PublicationChange>();
  private broadcast = false;
  private broadcastRevision = 0;
  private revision = 0;
  private dirty = false;

  getRevision = () => this.revision;
  revisionFor = (interests: readonly PublicationInterest[]) =>
    Math.max(
      this.broadcastRevision,
      ...interests.map((interest) => this.versions.get(keyFor(interest)) ?? this.revision),
    );

  get isPublishing() {
    return this.depth !== 0;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribeTo = (interests: readonly PublicationInterest[], notify: () => void) => {
    const entry = { interests, notify };
    this.scoped.add(entry);
    for (const interest of interests) {
      const key = keyFor(interest);
      this.interests.set(key, (this.interests.get(key) ?? 0) + 1);
      if (!this.versions.has(key)) this.versions.set(key, this.revision);
    }
    return () => {
      this.scoped.delete(entry);
      for (const interest of interests) {
        const key = keyFor(interest);
        const count = (this.interests.get(key) ?? 1) - 1;
        if (count) this.interests.set(key, count);
        else {
          this.interests.delete(key);
          this.versions.delete(key);
        }
      }
    };
  };
  subscribeChanges = (listener: (changes: readonly PublicationChange[] | undefined) => void) => {
    this.forwards.add(listener);
    return () => {
      this.forwards.delete(listener);
    };
  };
  batch<T>(operation: () => T): T {
    this.depth += 1;
    try {
      return operation();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) this.flush();
    }
  }
  changed(listeners: Iterable<() => void>, changes?: readonly PublicationChange[]) {
    this.dirty = true;
    if (changes === undefined) this.broadcast = true;
    else for (const change of changes) this.changes.set(keyFor(change), change);
    for (const listener of listeners) this.pending.add(listener);
    for (const listener of this.listeners) this.pending.add(listener);
    if (this.depth === 0) this.flush();
  }
  private flush() {
    if (!this.dirty && this.pending.size === 0) return;
    this.dirty = false;
    this.revision += 1;
    const changes = this.broadcast ? undefined : [...this.changes.values()];
    if (!changes) {
      this.broadcastRevision = this.revision;
      for (const key of this.versions.keys()) this.versions.set(key, this.revision);
    } else
      for (const change of changes) {
        for (const interest of [
          { scopeId: change.scopeId },
          { scopeId: change.scopeId, collection: change.collection },
          change,
        ]) {
          const key = keyFor(interest);
          if (this.versions.has(key)) this.versions.set(key, this.revision);
        }
      }
    const notifications = this.pending;
    for (const { interests, notify } of this.scoped)
      if (
        !changes ||
        interests.some((interest) =>
          changes.some(
            (change) =>
              interest.scopeId === change.scopeId &&
              (!interest.collection || interest.collection === change.collection) &&
              (!interest.id || interest.id === change.id),
          ),
        )
      )
        notifications.add(notify);
    this.pending = new Set();
    this.changes.clear();
    this.broadcast = false;
    for (const forward of this.forwards) forward(changes);
    for (const notify of notifications) notify();
  }
  dispose() {
    this.listeners.clear();
    this.scoped.clear();
    this.forwards.clear();
    this.versions.clear();
    this.interests.clear();
    this.pending.clear();
    this.changes.clear();
    this.dirty = false;
    this.broadcast = false;
  }
}

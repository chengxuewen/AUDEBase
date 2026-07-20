import type { CollectionDef } from "./types";

export class SchemaRegistry {
  readonly #collections: Map<string, CollectionDef> = new Map();

  register(collection: CollectionDef): void {
    if (this.#collections.has(collection.name)) {
      throw new Error(`Collection "${collection.name}" is already registered`);
    }
    this.#collections.set(collection.name, collection);
  }

  get(name: string): CollectionDef | undefined {
    return this.#collections.get(name);
  }

  list(): readonly CollectionDef[] {
    return [...this.#collections.values()];
  }

  has(name: string): boolean {
    return this.#collections.has(name);
  }

  remove(name: string): boolean {
    return this.#collections.delete(name);
  }
}

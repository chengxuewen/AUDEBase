/**
 * InMemoryServiceRegistry — Phase 1b implementation.
 *
 * Stores service registrations in a Map. Thread-safe within a single process
 * (Node.js single-threaded, no concurrent mutations).
 *
 * Implements IServiceRegistry from types.ts.
 */
import type { IServiceRegistry, ServiceRegistration } from "./types.js";

export class ServiceRegistry implements IServiceRegistry {
  readonly #services = new Map<string, ServiceRegistration>();

  register(registration: ServiceRegistration): void {
    if (this.#services.has(registration.method)) {
      throw new Error(
        `Service "${registration.method}" is already registered by plugin "${this.#services.get(registration.method)!.pluginName}"`,
      );
    }
    this.#services.set(registration.method, registration);
  }

  unregister(method: string): void {
    this.#services.delete(method);
  }

  resolve(method: string): ServiceRegistration | undefined {
    return this.#services.get(method);
  }

  list(): readonly ServiceRegistration[] {
    return [...this.#services.values()];
  }

  unregisterByPlugin(pluginName: string): void {
    for (const [method, reg] of this.#services) {
      if (reg.pluginName === pluginName) {
        this.#services.delete(method);
      }
    }
  }
}
